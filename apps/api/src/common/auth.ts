import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { KvStore } from './kv';
import { KV } from './tokens';

/** Marker set on account deletion; outlives any access token issued before it. */
export const deletedUserKey = (id: string) => `user:deleted:${id}`;

export interface AuthUser {
  id: string;
  guest: boolean;
}

export interface AccessClaims {
  sub: string;
  typ: 'access';
  guest: boolean;
}

export async function verifyAccessToken(jwt: JwtService, token: string | undefined): Promise<AuthUser> {
  if (!token) throw new UnauthorizedException('Missing bearer token');
  try {
    const claims = await jwt.verifyAsync<AccessClaims>(token);
    if (claims.typ !== 'access') throw new Error('wrong token type');
    return { id: claims.sub, guest: !!claims.guest };
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, @Inject(KV) private readonly kv: KvStore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const user = await verifyAccessToken(this.jwt, token);
    if (await this.kv.get(deletedUserKey(user.id))) throw new UnauthorizedException('Account deleted');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
