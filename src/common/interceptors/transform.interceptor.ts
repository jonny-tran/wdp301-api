import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response as ExpressResponse, Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE } from '../decorators/response-message.decorator';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T | null;
  timestamp: string;
  path: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse<ExpressResponse>();
        const request = ctx.getRequest<Request>();

        const message =
          this.reflector.get<string>(RESPONSE_MESSAGE, context.getHandler()) ||
          'Success';

        return {
          statusCode: response.statusCode,
          message: message,
          data: data || null,
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }
}
