import { ServiceUnavailableException } from '@nestjs/common';
import { TwilioSmsSender } from './sms';

describe('TwilioSmsSender', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts a form-encoded message with basic auth', async () => {
    const f = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"sid":"SM1"}', { status: 201 }));
    await new TwilioSmsSender({ accountSid: 'AC1', authToken: 'secret', messagingServiceSid: 'MG1' }).send('+972501234567', 'Your code is 123456');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + Buffer.from('AC1:secret').toString('base64'));
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('+972501234567');
    expect(body.get('MessagingServiceSid')).toBe('MG1');
    expect(body.get('From')).toBeNull();
  });

  it('maps Twilio errors to a 503 without leaking details', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{"code":21211,"message":"Invalid To"}', { status: 400 }));
    const s = new TwilioSmsSender({ accountSid: 'AC1', authToken: 't', from: '+15550000000' });
    await expect(s.send('+972500000000', 'x')).rejects.toThrow(ServiceUnavailableException);
    await expect(s.send('+972500000000', 'x')).rejects.toThrow('can’t receive SMS');
  });
});
