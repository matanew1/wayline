import { config } from '@/config';

/**
 * Starts the CarPlay / Android Auto integration in car-enabled builds (WAYLINE_CAR=1).
 * `require` keeps the library out of the module graph's execution in normal builds, where its
 * native module isn't linked and importing it would throw.
 */
export function initCar() {
  if (!config.car) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('./session') as typeof import('./session')).startCarSession();
}
