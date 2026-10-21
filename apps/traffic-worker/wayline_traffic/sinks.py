"""Where published edge speeds go."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Protocol

from .aggregate import EdgeSpeed

log = logging.getLogger("sinks")

TRAFFIC_HASH = "traffic:live"          # field = edge id, value = JSON — read by the API
TRAFFIC_TS = "traffic:live:ts"         # zset edge id → updatedAt, for pruning


class Sink(Protocol):
    async def write(self, speeds: list[EdgeSpeed]) -> None: ...


class RedisSink:
    def __init__(self, redis, live_ttl_s: int = 1800):
        self.r = redis
        self.live_ttl_ms = live_ttl_s * 1000

    async def write(self, speeds: list[EdgeSpeed]) -> None:
        if not speeds:
            return
        pipe = self.r.pipeline(transaction=False)
        pipe.hset(TRAFFIC_HASH, mapping={s.edge_id: json.dumps(s.to_redis()) for s in speeds})
        pipe.zadd(TRAFFIC_TS, {s.edge_id: s.updated_at for s in speeds})
        await pipe.execute()

    async def prune(self, now_ms: int) -> int:
        old = await self.r.zrangebyscore(TRAFFIC_TS, 0, now_ms - self.live_ttl_ms)
        if old:
            pipe = self.r.pipeline(transaction=False)
            pipe.hdel(TRAFFIC_HASH, *old)
            pipe.zrem(TRAFFIC_TS, *old)
            await pipe.execute()
        return len(old)


class KafkaSink:
    """Compacted topic keyed by edge id: the latest speed per edge, for other consumers (analytics, replicas)."""

    def __init__(self, producer, topic: str):
        self.p = producer
        self.topic = topic

    async def write(self, speeds: list[EdgeSpeed]) -> None:
        for s in speeds:
            await self.p.send(self.topic, key=s.edge_id.encode(), value=json.dumps({"edgeId": s.edge_id, "wayId": s.way_id, **s.to_redis()}).encode())


def hour_of_week(ms: int) -> int:
    d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return d.weekday() * 24 + d.hour


class BaselineSink:
    """
    Historic speeds per OSM way and hour of week (edge_speeds_hourly) — a running mean weighted
    by samples. Keyed by way id so it survives tile rebuilds (GraphIds don't).
    """

    SQL = """
      INSERT INTO edge_speeds_hourly (edge_id, hour_of_week, p50_kmh, samples)
      VALUES (%s, %s, %s, %s)
      ON CONFLICT (edge_id, hour_of_week) DO UPDATE SET
        p50_kmh = (edge_speeds_hourly.p50_kmh * edge_speeds_hourly.samples + EXCLUDED.p50_kmh * EXCLUDED.samples)
                  / (edge_speeds_hourly.samples + EXCLUDED.samples),
        samples = LEAST(edge_speeds_hourly.samples + EXCLUDED.samples, 100000)
    """

    def __init__(self, conn):
        self.conn = conn

    async def write(self, speeds: list[EdgeSpeed]) -> None:
        rows = [(s.way_id, hour_of_week(s.updated_at), s.kmh, s.samples) for s in speeds if s.way_id is not None]
        if not rows:
            return
        async with self.conn.cursor() as cur:
            await cur.executemany(self.SQL, rows)
        await self.conn.commit()
