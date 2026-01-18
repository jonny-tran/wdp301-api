import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/error.swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

// ===========================================
// 1. DOCS CHO API LOGIN
// ===========================================
export function ApiLoginDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Đăng nhập hệ thống (Lấy Access/Refresh Token)' }),
    ApiBody({ type: LoginDto }),
    ApiCommonErrors(),
    ApiResponse({
      status: 201,
      description: 'Đăng nhập thành công',
      schema: {
        example: {
          statusCode: 201,
          message: 'Đăng nhập thành công',
          data: {
            user: {
              id: 'be7e3e16-af3c-427a-9475-51756351fce3',
              email: 'admin@kfc.com',
              username: 'admin',
              role: 'admin',
              storeId: null,
            },
            accessToken: 'eyJhbGciOiJIUz...',
            refreshToken: 'eyJhbGciOiJIUz...',
          },
          timestamp: '2026-01-17T10:00:00.000Z',
          path: '/api/v1/auth/login',
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Dữ liệu đầu vào không hợp lệ',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc Token hết hạn',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tài khoản',
    }),
  );
}

// ===========================================
// 2. DOCS CHO API PROFILE
// ===========================================
export function ApiProfileDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Lấy thông tin Profile của User hiện tại' }),
    ApiCommonErrors(),
    ApiResponse({
      status: 200,
      description: 'Lấy thông tin thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Lấy thông tin người dùng thành công',
          data: {
            id: 'be7e3e16-af3c-427a-9475-51756351fce3',
            email: 'admin@kfc.com',
            // ...
          },
          timestamp: '2026-01-17T10:05:00.000Z',
          path: '/api/v1/auth/me',
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc Token hết hạn',
    }),
  );
}

// ===========================================
// 3. DOCS CHO API CREATE USER
// ===========================================
export function ApiCreateUserDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: '[ADMIN ONLY] Tạo tài khoản nhân viên mới' }),
    ApiBody({ type: CreateUserDto }),
    ApiCommonErrors(),

    ApiResponse({
      status: 201,
      description: 'Tạo thành công',
      schema: {
        example: {
          statusCode: 201,
          message: 'Tạo tài khoản mới thành công',
          data: {
            id: 'uuid-new-123',
            email: 'staff@gmail.com',
            username: 'Nhan Vien A',
            role: 'franchise_store_staff',
            status: 'active',
          },
          timestamp: '...',
          path: '...',
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền Admin',
    }),
    ApiResponse({
      status: 400,
      description: 'Email trùng hoặc dữ liệu sai',
    }),
  );
}

// ===========================================
// 4. DOCS CHO API GET ROLES
// ===========================================
export function ApiGetRolesDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '[ADMIN ONLY] Lấy danh sách các vai trò (Roles) trong hệ thống',
    }),
    ApiCommonErrors(),

    ApiResponse({
      status: 200,
      description: 'Lấy danh sách thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Lấy danh sách vai trò thành công',
          data: [
            {
              value: 'admin',
              label: 'Quản trị viên hệ thống',
            },
            {
              value: 'franchise_store_staff',
              label: 'Nhân viên cửa hàng nhượng quyền',
            },
          ],
          timestamp: '...',
          path: '...',
        },
      },
    }),
  );
}

// ===========================================
// 5. DOCS CHO API REFRESH TOKEN
// ===========================================
export function ApiRefreshTokenDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Cấp lại Access Token mới bằng Refresh Token' }),
    ApiBody({ type: RefreshTokenDto }),
    ApiCommonErrors(),

    ApiResponse({
      status: 200,
      description: 'Cấp lại token thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Refresh token thành công',
          data: {
            accessToken: 'eyJhbGciOiJIUz...',
            refreshToken: 'eyJhbGciOiJIUz...',
          },
          timestamp: '...',
          path: '...',
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Token không hợp lệ hoặc đã hết hạn',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tài khoản',
    }),
  );
}

// ===========================================
// 6. DOCS CHO API LOGOUT
// ===========================================
export function ApiLogoutDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Đăng xuất (Hủy Refresh Token hiện tại)' }),
    ApiBody({ type: LogoutDto }),
    ApiCommonErrors(),

    ApiResponse({
      status: 200,
      description: 'Đăng xuất thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Đăng xuất thành công, token đã bị hủy',
          data: {
            message: 'Đăng xuất thành công, token đã bị hủy',
          },
          timestamp: '...',
          path: '/api/v1/auth/logout',
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập',
    }),
  );
}

// ===========================================
// 7. DOCS CHO API FORGOT PASSWORD
// ===========================================
export function ApiForgotPasswordDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Gửi mã xác thực để reset mật khẩu' }),
    ApiBody({ type: ForgotPasswordDto }),
    ApiCommonErrors(),

    ApiResponse({
      status: 200,
      description: 'Gửi mã xác thực thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Mã xác thực đã được gửi đến email.',
          data: {
            message: 'Mã xác thực đã được gửi đến email.',
          },
          timestamp: '...',
          path: '...',
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tài khoản',
    }),
  );
}

// ===========================================
// 8. DOCS CHO API RESET PASSWORD
// ===========================================
export function ApiResetPasswordDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Đặt lại mật khẩu' }),
    ApiBody({ type: ResetPasswordDto }),
    ApiCommonErrors(),

    ApiResponse({
      status: 200,
      description: 'Đặt lại mật khẩu thành công',
      schema: {
        example: {
          statusCode: 200,
          message: 'Đặt lại mật khẩu thành công',
          data: {
            message: 'Đặt lại mật khẩu thành công',
          },
          timestamp: '...',
          path: '...',
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tài khoản',
    }),
  );
}
