import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtPayload } from '../types/auth.types';

@Injectable()
export class AuthStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  validate(payload: IJwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      storeId: payload.storeId,
    };
  }
}
