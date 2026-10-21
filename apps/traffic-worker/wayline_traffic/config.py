from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    v = os.environ.get(name)
    return int(v) if v else default


@dataclass(frozen=True)
class Config:
    kafka_brokers: list[str] = field(default_factory=lambda: os.environ.get("KAFKA_BROKERS", "localhost:19092").split(","))
    probes_topic: str = os.environ.get("PROBES_TOPIC", "probes.raw")
    edges_topic: str = os.environ.get("EDGES_TOPIC", "traffic.edges")
    group_id: str = os.environ.get("KAFKA_GROUP_ID", "traffic-worker")
    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379")
    database_url: str | None = os.environ.get("DATABASE_URL") or None
    valhalla_url: str = os.environ.get("VALHALLA_URL", "http://localhost:8002").rstrip("/")
    # Aggregation: speeds published per edge from samples in this window…
    window_s: int = _int("WINDOW_S", 300)
    # …only once at least this many distinct trips contributed (k-anonymity for the probe stream).
    min_sessions: int = _int("MIN_SESSIONS", 2)
    flush_every_s: int = _int("FLUSH_EVERY_S", 30)
    # Live entries older than this are removed from Redis (the API also ignores > 15 min).
    live_ttl_s: int = _int("LIVE_TTL_S", 1800)
    metrics_port: int = _int("METRICS_PORT", 9464)
