"""Sliding-window aggregation of edge observations into published speeds."""
from __future__ import annotations

import statistics
from collections import deque
from dataclasses import dataclass, field

from .matching import EdgeObservation, Fix


@dataclass
class EdgeSpeed:
    edge_id: str
    way_id: int | None
    kmh: float
    samples: int
    sessions: int
    updated_at: int  # epoch ms

    def to_redis(self) -> dict:
        # shape read by the API's RedisTrafficStore
        return {"kmh": self.kmh, "samples": self.samples, "updatedAt": self.updated_at}


@dataclass
class _Sample:
    at_ms: int
    session: str
    kmh: float
    points: int


@dataclass
class _Edge:
    way_id: int | None
    samples: deque[_Sample] = field(default_factory=deque)


class Aggregator:
    """
    Keeps per-edge observations for `window_s`. An edge is published only when at least
    `min_sessions` distinct trips drove it in the window, so no single driver's speed is exposed.
    """

    def __init__(self, window_s: int = 300, min_sessions: int = 2):
        self.window_ms = window_s * 1000
        self.min_sessions = min_sessions
        self.edges: dict[str, _Edge] = {}
        self.dirty: set[str] = set()

    def add(self, session: str, at_ms: int, observations: list[EdgeObservation]) -> None:
        for o in observations:
            e = self.edges.setdefault(o.edge_id, _Edge(o.way_id))
            e.samples.append(_Sample(at_ms, session, o.kmh, o.points))
            self.dirty.add(o.edge_id)

    def _expire(self, e: _Edge, now_ms: int) -> None:
        while e.samples and now_ms - e.samples[0].at_ms > self.window_ms:
            e.samples.popleft()

    def flush(self, now_ms: int) -> list[EdgeSpeed]:
        """Speeds for edges that changed since the last flush and meet the session threshold."""
        out: list[EdgeSpeed] = []
        for edge_id in list(self.dirty):
            e = self.edges.get(edge_id)
            if not e:
                continue
            self._expire(e, now_ms)
            sessions = {s.session for s in e.samples}
            if len(sessions) < self.min_sessions:
                continue  # stays dirty until enough trips contribute (or it expires)
            # one value per session (its median), then the median across sessions: a single
            # slow/fast driver can't dominate an edge
            per_session = [
                statistics.median([s.kmh for s in e.samples if s.session == sid]) for sid in sessions
            ]
            out.append(EdgeSpeed(
                edge_id, e.way_id, round(statistics.median(per_session), 1),
                sum(s.points for s in e.samples), len(sessions), max(s.at_ms for s in e.samples),
            ))
            self.dirty.discard(edge_id)
        # drop edges that went quiet
        for edge_id in [k for k, e in self.edges.items() if not e.samples or now_ms - e.samples[-1].at_ms > self.window_ms]:
            self.edges.pop(edge_id, None)
            self.dirty.discard(edge_id)
        return out


class Stitcher:
    """
    Probe batches arrive every ~10 s per trip. Prepending the tail of the previous batch lets the
    matcher see continuous movement across the boundary instead of two disconnected fragments.
    """

    def __init__(self, tail: int = 3, ttl_ms: int = 10 * 60_000):
        self.tail = tail
        self.ttl_ms = ttl_ms
        self._last: dict[str, tuple[int, list[Fix]]] = {}

    def stitch(self, session: str, fixes: list[Fix], now_ms: int) -> list[Fix]:
        prev = self._last.get(session)
        joined = fixes
        if prev and now_ms - prev[0] <= self.ttl_ms and fixes and prev[1] and prev[1][-1].t < fixes[0].t:
            joined = prev[1] + fixes
        if fixes:
            self._last[session] = (now_ms, fixes[-self.tail:])
        return joined

    def prune(self, now_ms: int) -> None:
        for k in [k for k, (at, _) in self._last.items() if now_ms - at > self.ttl_ms]:
            del self._last[k]
