import { Logger } from '@nestjs/common';

export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

/** Dev sender: writes the message to the log. Swap for Twilio / Vonage / AWS SNS in production. */
export class LogSmsSender implements SmsSender {
  private readonly log = new Logger('SMS');
  async send(phone: string, text: string) {
    this.log.log(`to ${phone}: ${text}`);
  }
}
