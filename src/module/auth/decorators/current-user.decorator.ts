import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IJwtPayload } from '../types/auth.types';

export const CurrentUser = createParamDecorator(
  (data: keyof IJwtPayload | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user: IJwtPayload }>();
    const user = request.user;

    if (!user) return null;

    return data ? user[data] : user;
  },
);
