import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/config';
import type { KvStore } from '../../common/kv';
import { CONFIG, KV, SMS_SENDER, USERS_REPO } from '../../common/tokens';
import type { User, UsersRepository } from '../users/users.repository';
import type { OtpRequestedDto, TokenPairDto } from './auth.dto';
import type { SmsSender } from './sms';

export const OTP_TTL_S = 300;
export const OTP_COOLDOWN_S = 30;
export const OTP_MAX_ATTEMPTS = 5;

interface OtpRecord {
  codeHash: string;
  attempts: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(USERS_REPO) private readonly users: UsersRepository,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly jwt: JwtService,
  ) {}

  private sha(s: string) {
    return createHash('sha256').update(s).digest('hex');
  }
  private phoneHash(phone: string) {
    return this.sha(`${this.config.phonePepper}:${phone}`);
  }

  async requestOtp(phone: string): Promise<OtpRequestedDto> {
    const ph = this.phoneHash(phone);
    if (!(await this.kv.setIfAbsent(`otp:cool:${ph}`, '1', OTP_COOLDOWN_S))) {
      throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    }
    const review = this.config.review?.phone === phone;
    const code = review ? this.config.review!.code : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const rec: OtpRecord = { codeHash: this.sha(`${ph}:${code}`), attempts: 0 };
    await this.kv.set(`otp:${ph}`, JSON.stringify(rec), OTP_TTL_S);
    // the store-review number never triggers an SMS
    if (!review) await this.sms.send(phone, `Your Wayline code is ${code}`);

    const res: OtpRequestedDto = { sentTo: phone.slice(0, 6) + '•••' + phone.slice(-4), expiresInS: OTP_TTL_S };
    if (this.config.otpDevEcho) res.devCode = code;
    return res;
  }

  async verifyOtp(phone: string, code: string): Promise<TokenPairDto> {
    const ph = this.phoneHash(phone);
    const key = `otp:${ph}`;
    const raw = await this.kv.get(key);
    if (!raw) throw new UnauthorizedException('Code expired — request a new one');
    const rec = JSON.parse(raw) as OtpRecord;

    const expected = Buffer.from(rec.codeHash, 'hex');
    const actual = Buffer.from(this.sha(`${ph}:${code}`), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      rec.attempts += 1;
      if (rec.attempts >= OTP_MAX_ATTEMPTS) {
        await this.kv.del(key);
        throw new UnauthorizedException('Too many wrong codes — request a new one');
      }
      const ttl = await this.kv.ttl(key);
      await this.kv.set(key, JSON.stringify(rec), Math.max(1, ttl));
      throw new UnauthorizedException('Wrong code');
    }
    await this.kv.del(key);
    const user = await this.users.findOrCreateByPhoneHash(ph);
    return this.issue(user);
  }

  async guest(): Promise<TokenPairDto> {
    return this.issue(await this.users.createGuest());
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    let sub: string;
    try {
      const claims = await this.jwt.verifyAsync<{ sub: string; typ: string }>(refreshToken);
      if (claims.typ !== 'refresh') throw new Error('wrong type');
      sub = claims.sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(sub);
    if (!user) throw new UnauthorizedException('User no longer exists');
    return this.issue(user);
  }

  private async issue(user: User): Promise<TokenPairDto> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'access', guest: user.isGuest },
      { expiresIn: this.config.accessTtlS },
    );
    const refreshToken = await this.jwt.signAsync({ sub: user.id, typ: 'refresh' }, { expiresIn: this.config.refreshTtlS });
    return { accessToken, refreshToken, expiresInS: this.config.accessTtlS, userId: user.id, guest: user.isGuest };
  }
}
