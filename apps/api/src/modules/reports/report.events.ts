import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { ReportDto } from './reports.dto';

export type ReportEvent =
  | { kind: 'upsert'; report: ReportDto }
  | { kind: 'remove'; report: Pick<ReportDto, 'id' | 'lat' | 'lng'> };

/**
 * In-process bus between the reports service and the realtime gateway.
 * Cross-instance fan-out is handled by the Socket.IO Redis adapter, so every
 * instance only emits events for writes it handled itself.
 */
@Injectable()
export class ReportEvents {
  readonly stream = new Subject<ReportEvent>();
  emit(e: ReportEvent) {
    this.stream.next(e);
  }
}
