import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.user = await verifyAccessToken(this.jwt, token);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
