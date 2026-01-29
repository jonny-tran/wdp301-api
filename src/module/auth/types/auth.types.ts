import { Request } from 'express';

export interface IJwtPayload {
  sub: string;
  email: string;
  role: string;
  storeId?: string | null;
}

export interface ILoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
    storeId?: string | null;
  };
}
