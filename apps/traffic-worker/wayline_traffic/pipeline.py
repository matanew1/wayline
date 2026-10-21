"""probes.raw message → stitched trace → matched edges → aggregated speeds → sinks."""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

import httpx

from .aggregate import Aggregator, EdgeSpeed, Stitcher
from .matching import Fix, Matcher
from .sinks import Sink

log = logging.getLogger("pipeline")


@dataclass
class Stats:
    messages: int = 0
    fixes: int = 0
    matched_edges: int = 0
    published: int = 0
    match_errors: int = 0
    bad_messages: int = 0
    extra: dict = field(default_factory=dict)

    def prometheus(self) -> str:
        lines = []
        for name, help_ in [
            ("messages", "probe batches consumed"), ("fixes", "GPS fixes consumed"),
            ("matched_edges", "edge observations from map matching"), ("published", "edge speeds published"),
            ("match_errors", "Valhalla map-matching failures"), ("bad_messages", "unparseable probe messages"),
        ]:
            lines += [f"# HELP wayline_traffic_{name}_total {help_}", f"# TYPE wayline_traffic_{name}_total counter",
                      f"wayline_traffic_{name}_total {getattr(self, name)}"]
        return "\n".join(lines) + "\n"


class Pipeline:
    def __init__(self, matcher: Matcher, sinks: list[Sink], aggregator: Aggregator | None = None,
                 stitcher: Stitcher | None = None, now_ms=lambda: int(time.time() * 1000)):
        self.matcher = matcher
        self.sinks = sinks
        self.agg = aggregator or Aggregator()
        self.stitcher = stitcher or Stitcher()
        self.now_ms = now_ms
        self.stats = Stats()

    async def handle(self, raw: bytes) -> None:
        """One probes.raw message: {sessionId, receivedAt, fixes: [...]}. Never raises on bad input."""
        try:
            msg = json.loads(raw)
            session = str(msg["sessionId"])
            fixes = sorted((Fix.from_json(f) for f in msg["fixes"]), key=lambda f: f.t)
        except (ValueError, KeyError, TypeError):
            self.stats.bad_messages += 1
            return
        self.stats.messages += 1
        self.stats.fixes += len(fixes)
        trace = self.stitcher.stitch(session, fixes, self.now_ms())
        try:
            obs = await self.matcher.match(trace)
        except httpx.HTTPError as e:
            self.stats.match_errors += 1
            log.warning("map matching failed: %s", e)
            return
        self.stats.matched_edges += len(obs)
        self.agg.add(session, fixes[-1].t if fixes else self.now_ms(), obs)

    async def flush(self) -> list[EdgeSpeed]:
        now = self.now_ms()
        speeds = self.agg.flush(now)
        self.stitcher.prune(now)
        for s in self.sinks:
            try:
                await s.write(speeds)
            except Exception as e:  # one failing sink must not block the others
                log.error("sink %s failed: %s", type(s).__name__, e)
        self.stats.published += len(speeds)
        return speeds
