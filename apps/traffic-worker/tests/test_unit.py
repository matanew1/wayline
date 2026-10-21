import json

import httpx
import pytest

from wayline_traffic.aggregate import Aggregator, Stitcher
from wayline_traffic.matching import EdgeObservation, Fix, Matcher, observations_from_trace
from wayline_traffic.pipeline import Pipeline


def obs(edge="e1", kmh=30.0, points=3):
    return [EdgeObservation(edge, 7, kmh, points)]


class TestAggregator:
    def test_publishes_only_after_enough_distinct_sessions(self):
        a = Aggregator(window_s=300, min_sessions=2)
        a.add("s1", 1_000, obs(kmh=20))
        a.add("s1", 2_000, obs(kmh=22))
        assert a.flush(3_000) == []  # one trip only — never exposed
        a.add("s2", 4_000, obs(kmh=40))
        [s] = a.flush(5_000)
        assert (s.edge_id, s.sessions, s.samples, s.updated_at) == ("e1", 2, 9, 4_000)
        assert s.kmh == 30.5  # median of per-session medians (21, 40)
        assert a.flush(6_000) == []  # nothing new since last flush

    def test_window_expiry(self):
        a = Aggregator(window_s=60, min_sessions=1)
        a.add("s1", 0, obs(kmh=10))
        a.add("s2", 90_000, obs(kmh=50))
        [s] = a.flush(100_000)
        assert s.kmh == 50 and s.sessions == 1
        a.flush(500_000)
        assert a.edges == {}

    def test_one_outlier_driver_does_not_dominate(self):
        a = Aggregator(min_sessions=3)
        for sid, kmh in [("a", 30), ("b", 32), ("c", 140)]:
            a.add(sid, 1_000, obs(kmh=kmh))
        assert a.flush(2_000)[0].kmh == 32


class TestStitcher:
    def test_prepends_previous_tail_for_continuity(self):
        s = Stitcher(tail=2)
        b1 = [Fix(t, 32.0, 34.0) for t in (1000, 2000, 3000)]
        b2 = [Fix(t, 32.0, 34.0) for t in (4000, 5000)]
        assert s.stitch("x", b1, 0) == b1
        assert [f.t for f in s.stitch("x", b2, 10_000)] == [2000, 3000, 4000, 5000]
        assert [f.t for f in s.stitch("y", b2, 10_000)] == [4000, 5000]  # other trip unaffected

    def test_expired_tail_is_not_reused(self):
        s = Stitcher(tail=2, ttl_ms=1000)
        s.stitch("x", [Fix(1, 0, 0)], 0)
        assert len(s.stitch("x", [Fix(2, 0, 0)], 5000)) == 1


def test_observations_from_trace_uses_gps_speed_and_skips_bad_matches():
    fixes = [Fix(i * 1000, 32.0, 34.0, speed=s) for i, s in enumerate([10, 12, 11, 5, None])]
    resp = {
        "edges": [{"id": 111, "way_id": 9, "length": 0.2}, {"id": 222, "way_id": 9, "length": 0.2}],
        "matched_points": [
            {"type": "matched", "edge_index": 0, "distance_from_trace_point": 3},
            {"type": "matched", "edge_index": 0, "distance_from_trace_point": 4},
            {"type": "matched", "edge_index": 0, "distance_from_trace_point": 80},  # too far — ignored
            {"type": "matched", "edge_index": 1, "distance_from_trace_point": 2},
            {"type": "unmatched", "edge_index": None},
        ],
    }
    out = {o.edge_id: o for o in observations_from_trace(fixes, resp)}
    assert out["111"].kmh == pytest.approx(39.6)  # median(36, 43.2)
    assert out["111"].points == 2
    assert out["222"].kmh == pytest.approx(18.0)


async def test_matcher_sends_timed_trace_and_tolerates_400():
    seen = {}

    def handler(req: httpx.Request):
        seen["body"] = json.loads(req.content)
        return httpx.Response(400, json={"error_code": 171})

    m = Matcher("http://valhalla", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await m.match([Fix(1000, 32, 34), Fix(2000, 32.0001, 34)]) == []
    assert seen["body"]["shape"][1] == {"lat": 32.0001, "lon": 34, "time": 2.0}
    assert seen["body"]["shape_match"] == "map_snap"


async def test_pipeline_counts_bad_messages_and_keeps_going():
    class FakeMatcher:
        async def match(self, fixes):
            return obs("e9", 25, len(fixes))

    written = []

    class ListSink:
        async def write(self, speeds):
            written.extend(speeds)

    p = Pipeline(FakeMatcher(), [ListSink()], Aggregator(min_sessions=1), now_ms=lambda: 10_000)
    await p.handle(b"not json")
    await p.handle(json.dumps({"sessionId": "s", "fixes": [{"t": 9000, "lat": 32, "lng": 34}, {"t": 9500, "lat": 32, "lng": 34}]}).encode())
    await p.flush()
    assert p.stats.bad_messages == 1 and p.stats.messages == 1
    assert [s.edge_id for s in written] == ["e9"]
    assert "wayline_traffic_published_total 1" in p.stats.prometheus()
