import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status: HttpStatus = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string = 'Lỗi hệ thống';
    let error: string = 'Internal Server Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const errorObj = exceptionResponse as Record<string, unknown>;

      if (Array.isArray(errorObj.message)) {
        message =
          typeof errorObj.message[0] === 'string'
            ? errorObj.message[0]
            : 'Lỗi dữ liệu đầu vào';
      } else if (typeof errorObj.message === 'string') {
        message = errorObj.message;
      }

      if (typeof errorObj.error === 'string') {
        error = errorObj.error;
      }
    }
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        error = 'Unauthorized';
        if (message.startsWith('Unauthorized')) {
          message = 'Chưa đăng nhập hoặc Token hết hạn';
        }
        break;
      case HttpStatus.NOT_FOUND:
        error = 'Not Found';
        if (message.startsWith('Cannot')) {
          message = `Đường dẫn không tồn tại: ${request.method} ${request.url}`;
        }
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        message = 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau';
        break;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        message = 'Lỗi máy chủ nội bộ, vui lòng liên hệ Admin';
        break;
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      error: error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
