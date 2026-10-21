import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../config/config';

export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

/** Dev sender: writes the message to the log. Refused in production by config validation. */
export class LogSmsSender implements SmsSender {
  private readonly log = new Logger('SMS');
  async send(phone: string, text: string) {
    this.log.log(`to ${phone}: ${text}`);
  }
}

/**
 * Twilio Programmable Messaging over its REST API (no SDK dependency).
 * Uses a Messaging Service when configured (better deliverability, alphanumeric sender in Israel),
 * otherwise a From number.
 */
export class TwilioSmsSender implements SmsSender {
  private readonly log = new Logger('Twilio');
  constructor(private readonly cfg: AppConfig['twilio'], private readonly baseUrl = 'https://api.twilio.com', private readonly timeoutMs = 8000) {}

  async send(phone: string, text: string) {
    const body = new URLSearchParams({ To: phone, Body: text });
    if (this.cfg.messagingServiceSid) body.set('MessagingServiceSid', this.cfg.messagingServiceSid);
    else body.set('From', this.cfg.from!);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      this.log.error(`unreachable: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Could not send the code — try again');
    }
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      // never log the message body (it contains the code)
      this.log.error(`HTTP ${res.status} code=${err.code} ${err.message ?? ''}`);
      // 21211 / 21614: invalid or non-mobile number
      if ([21211, 21614, 21408].includes(err.code)) throw new ServiceUnavailableException('This number can’t receive SMS');
      throw new ServiceUnavailableException('Could not send the code — try again');
    }
  }
}

export function createSmsSender(c: AppConfig): SmsSender {
  return c.smsDriver === 'twilio' ? new TwilioSmsSender(c.twilio) : new LogSmsSender();
}
