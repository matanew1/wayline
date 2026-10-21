"""Service entry point: consume probes.raw, flush speeds periodically, expose /health and /metrics."""
from __future__ import annotations

import asyncio
import logging
import signal
import time

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from redis.asyncio import Redis

from .aggregate import Aggregator
from .config import Config
from .matching import Matcher
from .pipeline import Pipeline
from .sinks import BaselineSink, KafkaSink, RedisSink

log = logging.getLogger("traffic-worker")


async def serve_http(pipeline: Pipeline, port: int) -> asyncio.base_events.Server:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        line = (await reader.readline()).decode(errors="ignore")
        path = line.split(" ")[1] if " " in line else "/"
        body, ctype = ("ok\n", "text/plain") if path.startswith("/health") else (pipeline.stats.prometheus(), "text/plain; version=0.0.4")
        writer.write(f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n{body}".encode())
        await writer.drain()
        writer.close()

    return await asyncio.start_server(handle, "0.0.0.0", port)


async def main(cfg: Config) -> None:
    redis = Redis.from_url(cfg.redis_url)
    producer = AIOKafkaProducer(bootstrap_servers=cfg.kafka_brokers, linger_ms=50)
    consumer = AIOKafkaConsumer(
        cfg.probes_topic, bootstrap_servers=cfg.kafka_brokers, group_id=cfg.group_id,
        enable_auto_commit=False, auto_offset_reset="latest", max_poll_records=500,
    )
    await producer.start()
    await consumer.start()
    redis_sink = RedisSink(redis, cfg.live_ttl_s)
    sinks = [redis_sink, KafkaSink(producer, cfg.edges_topic)]
    pg = None
    if cfg.database_url:
        import psycopg
        pg = await psycopg.AsyncConnection.connect(cfg.database_url)
        sinks.append(BaselineSink(pg))

    matcher = Matcher(cfg.valhalla_url)
    pipeline = Pipeline(matcher, sinks, Aggregator(cfg.window_s, cfg.min_sessions))
    http = await serve_http(pipeline, cfg.metrics_port)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    async def flusher() -> None:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=cfg.flush_every_s)
            except asyncio.TimeoutError:
                pass
            speeds = await pipeline.flush()
            pruned = await redis_sink.prune(int(time.time() * 1000))
            if speeds or pruned:
                log.info("published %d edge speeds, pruned %d", len(speeds), pruned)

    flush_task = asyncio.create_task(flusher())
    log.info("consuming %s from %s", cfg.probes_topic, ",".join(cfg.kafka_brokers))
    try:
        while not stop.is_set():
            batches = await consumer.getmany(timeout_ms=1000)
            for _tp, records in batches.items():
                for rec in records:
                    await pipeline.handle(rec.value)
            if batches:
                # at-least-once: commit after the batch is in the aggregator
                await consumer.commit()
    finally:
        stop.set()
        await flush_task
        await consumer.stop()
        await producer.stop()
        await matcher.aclose()
        await redis.aclose()
        if pg:
            await pg.close()
        http.close()


def run() -> None:
    logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}')
    asyncio.run(main(Config()))


if __name__ == "__main__":
    run()
