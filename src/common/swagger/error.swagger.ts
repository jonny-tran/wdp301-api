import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiCommonErrors() {
  return applyDecorators(
    // --- 429: Rate Limit ---
    ApiResponse({
      status: 429,
      description: 'Gửi quá nhiều yêu cầu (Rate Limiting)',
      schema: {
        example: {
          statusCode: 429,
          message: 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau',
          error: 'Too Many Requests',
          timestamp: '2026-01-17T10:00:00.000Z',
          path: '/api/v1/...',
        },
      },
    }),

    // --- 500: Server Error ---
    ApiResponse({
      status: 500,
      description: 'Lỗi server',
      schema: {
        example: {
          statusCode: 500,
          message: 'Hệ thống đang bảo trì. Vui lòng thử lại sau',
          error: 'Internal Server Error',
          timestamp: '2026-01-17T10:00:00.000Z',
          path: '/api/v1/...',
        },
      },
    }),
  );
}
