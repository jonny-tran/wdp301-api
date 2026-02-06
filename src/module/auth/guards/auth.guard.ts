import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export class AtGuard extends AuthGuard('jwt') {
  constructor() {
    super();
  }

  handleRequest(err: any, user: any, info: any): any {
    if (err || !user) {
      if (info) {
        const authError = info as Error;
        if (authError.name === 'TokenExpiredError') {
          throw new UnauthorizedException('Token đã hết hạn');
        }
        if (authError.name === 'JsonWebTokenError') {
          throw new UnauthorizedException('Token không hợp lệ');
        }
      }
      throw new UnauthorizedException('Chưa đăng nhập');
    }

    return user;
  }
}
