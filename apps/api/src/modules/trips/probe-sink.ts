import { Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import type { ProbeFixDto } from './trips.dto';

export const PROBES_TOPIC = 'probes.raw';

export interface ProbeMessage {
  /** Random per-trip id. Deliberately NOT the user id or trip id. */
  sessionId: string;
  receivedAt: number;
  fixes: ProbeFixDto[];
}

export interface ProbeSink {
  publish(msg: ProbeMessage): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryProbeSink implements ProbeSink {
  readonly messages: ProbeMessage[] = [];
  async publish(msg: ProbeMessage) {
    this.messages.push(msg);
    if (this.messages.length > 10_000) this.messages.shift();
  }
}

export class KafkaProbeSink implements ProbeSink {
  private readonly log = new Logger('KafkaProbeSink');
  private readonly producer: Producer;
  private connecting?: Promise<void>;

  constructor(brokers: string[]) {
    this.producer = new Kafka({ clientId: 'wayline-api', brokers }).producer({ allowAutoTopicCreation: false, idempotent: true });
  }

  private connect() {
    this.connecting ??= this.producer.connect().catch((e) => {
      this.connecting = undefined;
      throw e;
    });
    return this.connecting;
  }

  async publish(msg: ProbeMessage) {
    await this.connect();
    // Keyed by session so one trip's fixes stay ordered within a partition.
    await this.producer.send({ topic: PROBES_TOPIC, messages: [{ key: msg.sessionId, value: JSON.stringify(msg) }] });
  }

  async close() {
    if (this.connecting) await this.producer.disconnect().catch((e) => this.log.warn(e.message));
  }
}
