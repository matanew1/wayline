"""
Real Valhalla (scripts/valhalla-test.sh) + real Redis (+ Postgres if DATABASE_URL is set).
Drives two slow simulated trips along a Valhalla route and checks the speeds land on the SAME
edge ids the API gets from edge_walk — the contract that makes live traffic reach routing.
"""
import json
import math
import os
import uuid

import httpx
import pytest
from redis.asyncio import Redis

from wayline_traffic.aggregate import Aggregator
from wayline_traffic.matching import Matcher
from wayline_traffic.pipeline import Pipeline
from wayline_traffic.sinks import TRAFFIC_HASH, BaselineSink, RedisSink

VALHALLA = os.environ.get("VALHALLA_URL")
REDIS = os.environ.get("REDIS_URL")
pytestmark = pytest.mark.skipif(not (VALHALLA and REDIS), reason="needs VALHALLA_URL and REDIS_URL")


def decode6(s: str):
    pts, i, lat, lng = [], 0, 0, 0
    while i < len(s):
        for which in (0, 1):
            result = shift = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                lat += d
            else:
                lng += d
        pts.append((lat / 1e6, lng / 1e6))
    return pts


def hav(a, b):
    r = 6371008.8
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl, dp = math.radians(b[1] - a[1]), p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def drive(shape, speed_ms, t0_ms):
    """1 Hz fixes along the shape at constant speed."""
    fixes, t, carry = [], t0_ms, 0.0
    for a, b in zip(shape, shape[1:]):
        seg = hav(a, b)
        d = carry
        while d < seg:
            f = d / seg
            fixes.append({"t": t, "lat": a[0] + (b[0] - a[0]) * f, "lng": a[1] + (b[1] - a[1]) * f, "speed": speed_ms, "acc": 5})
            t += 1000
            d += speed_ms
        carry = d - seg
    return fixes


async def test_probes_become_live_speeds_on_api_edge_ids():
    async with httpx.AsyncClient(timeout=10) as http:
        route = (await http.post(f"{VALHALLA}/route", json={
            "locations": [{"lat": 32.0702, "lon": 34.7702}, {"lat": 32.0826, "lon": 34.7845}], "costing": "auto",
        })).json()["trip"]
        shape6 = route["legs"][0]["shape"]
        walked = (await http.post(f"{VALHALLA}/trace_attributes", json={
            "encoded_polyline": shape6, "shape_match": "edge_walk", "costing": "auto",
            "filters": {"attributes": ["edge.id"], "action": "include"},
        })).json()
    api_edge_ids = {str(e["id"]) for e in walked["edges"]}

    redis = Redis.from_url(REDIS)
    await redis.delete(TRAFFIC_HASH)
    sinks = [RedisSink(redis)]
    pg = None
    if os.environ.get("DATABASE_URL"):
        import psycopg
        pg = await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"])
        sinks.append(BaselineSink(pg))
    now = [1_800_000_000_000]
    p = Pipeline(Matcher(VALHALLA), sinks, Aggregator(window_s=900, min_sessions=2), now_ms=lambda: now[0])
    shape = decode6(shape6)

    # two trips crawl along the route at ~11 km/h, 30 s apart, uploading 10 s batches like the app
    t0 = now[0]
    batches = []
    for k in range(2):
        session = str(uuid.uuid4())
        fixes = drive(shape, 3.0, t0 + k * 30_000)
        batches += [(fx[-1]["t"], session, fx) for fx in (fixes[i:i + 10] for i in range(0, len(fixes), 10))]
    for at, session, fx in sorted(batches, key=lambda b: b[0]):
        now[0] = at
        await p.handle(json.dumps({"sessionId": session, "receivedAt": at, "fixes": fx}).encode())
    published = await p.flush()

    assert p.stats.match_errors == 0
    assert len(published) >= len(api_edge_ids) * 0.6, "most route edges should get a speed"
    stored = {k.decode(): json.loads(v) for k, v in (await redis.hgetall(TRAFFIC_HASH)).items()}
    overlap = set(stored) & api_edge_ids
    assert len(overlap) >= len(api_edge_ids) * 0.6, "worker edge ids must match the API's edge_walk ids"
    speeds = [stored[e]["kmh"] for e in overlap]
    assert all(5 <= v <= 20 for v in speeds), speeds  # ~10.8 km/h measured
    assert all(stored[e]["samples"] >= 2 for e in overlap)

    if pg:
        async with pg.cursor() as cur:
            await cur.execute("SELECT count(*) FROM edge_speeds_hourly WHERE samples > 0")
            assert (await cur.fetchone())[0] > 0
        await pg.close()
    await redis.aclose()
