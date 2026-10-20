import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Lets every API replica emit to sockets connected to any other replica. */
export class RedisIoAdapter extends IoAdapter {
  private adapter?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext, private readonly redisUrl: string) {
    super(app);
  }

  async connect() {
    const pub = new Redis(this.redisUrl);
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    this.adapter = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }

  async close(server: any) {
    await super.close(server);
    await Promise.allSettled(this.clients.map((c) => c.quit()));
  }
}
