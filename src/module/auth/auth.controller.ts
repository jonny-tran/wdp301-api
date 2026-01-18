import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import {
  ApiCreateUserDocs,
  ApiForgotPasswordDocs,
  ApiGetRolesDocs,
  ApiLoginDocs,
  ApiLogoutDocs,
  ApiProfileDocs,
  ApiRefreshTokenDocs,
  ApiResetPasswordDocs,
} from './auth.swagger';
import { Roles } from './decorators/roles.decorator';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RolesGuard } from './guards/roles.guard';
import type { RequestWithUser } from './types/auth.types';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiLoginDocs()
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh-token')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiRefreshTokenDocs()
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiProfileDocs()
  @ApiBearerAuth()
  async getProfile(@Request() req: RequestWithUser) {
    const userId = req.user.userId;
    return this.authService.getMe(userId);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiLogoutDocs()
  @ApiBearerAuth()
  async logout(@Body() logoutDto: LogoutDto) {
    return this.authService.logout(logoutDto);
  }

  @Post('create-user')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiCreateUserDocs()
  @ApiBearerAuth()
  @ResponseMessage('Tạo tài khoản mới thành công')
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto);
  }

  @Post('forgot-password')
  @ApiForgotPasswordDocs()
  @ApiBearerAuth()
  @ResponseMessage('Gửi mã xác thực thành công')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @ApiResetPasswordDocs()
  @ApiBearerAuth()
  @ResponseMessage('Đặt lại mật khẩu thành công')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('roles')
  @ApiGetRolesDocs()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Lấy danh sách vai trò thành công')
  getAllRoles() {
    return this.authService.getAllRoles();
  }
}
