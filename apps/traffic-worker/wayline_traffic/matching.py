"""Map-match a GPS trace to road edges with Valhalla and measure speed per edge."""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any

import httpx

# GPS can't be trusted below/above these for traffic (stopped at lights is real traffic, 0 km/h is kept).
MAX_PLAUSIBLE_KMH = 200.0
# Points farther than this from the matched road are ignored.
MAX_MATCH_DISTANCE_M = 40.0


@dataclass(frozen=True)
class Fix:
    t: int  # epoch ms
    lat: float
    lng: float
    speed: float | None = None  # m/s
    heading: float | None = None
    acc: float | None = None

    @staticmethod
    def from_json(d: dict[str, Any]) -> "Fix":
        return Fix(int(d["t"]), float(d["lat"]), float(d["lng"]), d.get("speed"), d.get("heading"), d.get("acc"))


@dataclass(frozen=True)
class EdgeObservation:
    edge_id: str  # Valhalla GraphId (directional) — the same id the API gets from edge_walk
    way_id: int | None
    kmh: float
    points: int


def trace_request(fixes: list[Fix]) -> dict[str, Any]:
    return {
        "shape": [{"lat": f.lat, "lon": f.lng, "time": f.t / 1000} for f in fixes],
        "shape_match": "map_snap",
        "costing": "auto",
        # give the matcher room for typical urban GPS error
        "trace_options": {"search_radius": 35, "gps_accuracy": 10, "turn_penalty_factor": 100},
        "filters": {
            "attributes": [
                "edge.id", "edge.way_id", "edge.length",
                "matched.edge_index", "matched.type", "matched.distance_from_trace_point",
            ],
            "action": "include",
        },
    }


def observations_from_trace(fixes: list[Fix], resp: dict[str, Any]) -> list[EdgeObservation]:
    """Speed per edge from the GPS speeds of the points matched to it (fallback: distance / time)."""
    edges = resp.get("edges", [])
    matched = resp.get("matched_points", [])
    by_edge: dict[int, list[Fix]] = {}
    for fix, m in zip(fixes, matched):
        if m.get("type") != "matched" or m.get("edge_index") is None:
            continue
        if (m.get("distance_from_trace_point") or 0) > MAX_MATCH_DISTANCE_M:
            continue
        by_edge.setdefault(m["edge_index"], []).append(fix)

    out: list[EdgeObservation] = []
    for idx, pts in by_edge.items():
        if idx >= len(edges):
            continue
        e = edges[idx]
        speeds = [p.speed * 3.6 for p in pts if p.speed is not None and p.speed >= 0]
        if speeds:
            kmh = statistics.median(speeds)
        elif len(pts) >= 2 and pts[-1].t > pts[0].t:
            # traversed length unknown per point; approximate with the edge length share covered
            kmh = (e.get("length", 0) * 1000) / ((pts[-1].t - pts[0].t) / 1000) * 3.6
        else:
            continue
        if 0 <= kmh <= MAX_PLAUSIBLE_KMH:
            out.append(EdgeObservation(str(e["id"]), e.get("way_id"), round(kmh, 1), len(pts)))
    return out


class Matcher:
    def __init__(self, valhalla_url: str, client: httpx.AsyncClient | None = None, timeout_s: float = 10.0):
        self.url = valhalla_url.rstrip("/")
        self.client = client or httpx.AsyncClient(timeout=timeout_s)

    async def match(self, fixes: list[Fix]) -> list[EdgeObservation]:
        if len(fixes) < 2:
            return []
        r = await self.client.post(f"{self.url}/trace_attributes", json=trace_request(fixes))
        if r.status_code == 400:
            # e.g. "no suitable edges near location" for a trace over unmapped ground — not retryable
            return []
        r.raise_for_status()
        return observations_from_trace(fixes, r.json())

    async def aclose(self) -> None:
        await self.client.aclose()
