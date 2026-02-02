import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  message: string | string[];
  errors?: { field: string; message: string }[];
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus() as HttpStatus;
    const exceptionResponse = exception.getResponse() as string | ErrorResponse;

    let message = 'Lỗi hệ thống';
    let errors: { field: string; message: string }[] = [];

    // Prioritize Validation Errors
    if (
      status === HttpStatus.BAD_REQUEST &&
      typeof exceptionResponse === 'object' &&
      exceptionResponse.errors
    ) {
      if (Array.isArray(exceptionResponse.message)) {
        message = exceptionResponse.message[0];
      } else if (typeof exceptionResponse.message === 'string') {
        message = exceptionResponse.message;
      } else {
        message = 'Dữ liệu đầu vào không hợp lệ';
      }
      errors = exceptionResponse.errors;
    }
    // Handle standard NestJS error objects
    else if (typeof exceptionResponse === 'object') {
      if (typeof exceptionResponse.message === 'string') {
        message = exceptionResponse.message;
      } else if (Array.isArray(exceptionResponse.message)) {
        message = exceptionResponse.message[0];
      }
    }
    // Handle string errors
    else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    }

    // Localization for Standard HTTP Status
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        message = 'Chưa đăng nhập hoặc Token hết hạn';
        break;
      case HttpStatus.FORBIDDEN:
        message = 'Bạn không có quyền truy cập resource này';
        break;
      case HttpStatus.NOT_FOUND:
        message = `Không tìm thấy tài nguyên: ${request.method} ${request.url}`;
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        message = 'Hệ thống quá tải, vui lòng thử lại sau';
        break;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        message = 'Lỗi máy chủ nội bộ, vui lòng liên hệ Admin';
        break;
    }

    const errorBody = {
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method}] ${request.url}`,
        JSON.stringify(errorBody),
        exception.stack,
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} | ${message}`);
    }

    response.status(status).json(errorBody);
  }
}
