import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as argon2 from 'argon2';
import { MailService } from '../../common/service/mail.service';
import { OtpUtil } from '../../common/utils/otp.util';
import { roleLabelUtils } from '../../common/utils/roleLabel.utils';
import { AuthRepository } from './auth.repository';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { GetUsersDto } from './dto/get-users.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserByAdminDto } from './dto/update-user-by-admin.dto';
import { TokenService } from './helper/token.service';
import { IJwtPayload, ILoginResponse } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // handle login
  async login(dto: LoginDto): Promise<ILoginResponse> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Email không chính xác');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu không chính xác');
    }

    const payload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    };

    const accessToken = await this.tokenService.generateAccessToken(payload);
    const refreshToken = await this.tokenService.generateRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.saveRefreshToken(
      user.id,
      refreshToken,
      expiresAt,
    );

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      storeId: user.storeId,
      accessToken,
      refreshToken,
    };
  }

  // handle refresh token
  async refreshToken(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    let payload: IJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh Token không hợp lệ hoặc đã hết hạn',
      );
    }

    const tokenInDb = await this.authRepository.findRefreshToken(refreshToken);
    if (!tokenInDb) {
      throw new UnauthorizedException(
        'Refresh Token đã được sử dụng hoặc không tồn tại (Vui lòng đăng nhập lại)',
      );
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User không tồn tại');
    }
    await this.authRepository.deleteRefreshToken(refreshToken);

    const newPayload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    };

    const newAccessToken =
      await this.tokenService.generateAccessToken(newPayload);
    const newRefreshToken =
      await this.tokenService.generateRefreshToken(newPayload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.saveRefreshToken(
      user.id,
      newRefreshToken,
      expiresAt,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // handle logout
  async logout(dto: LogoutDto) {
    await this.authRepository.deleteRefreshToken(dto.refreshToken);
    return {
      message: 'Đăng xuất thành công',
    };
  }

  // handle get me
  async getMe(userId: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user)
      throw new UnauthorizedException(
        'Tài khoản chưa xác thực. Vui lòng đăng nhập lại',
      );
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      storeId: user.storeId,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  // handle create user (admin only)
  async createUser(dto: CreateUserDto) {
    if (dto.role === UserRole.ADMIN) {
      throw new ForbiddenException('Không thể tạo tài khoản với Role Admin');
    }

    const existingUser = await this.authRepository.findUserByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email hoặc tên đăng nhập đã được sử dụng');
    }
    if (dto.role === UserRole.FRANCHISE_STORE_STAFF && !dto.storeId) {
      throw new BadRequestException('Nhân viên cửa hàng cần Store ID');
    }

    if (dto.storeId) {
      const store = await this.authRepository.findStoreById(dto.storeId);
      if (!store) {
        throw new BadRequestException('Cửa hàng không tồn tại trong hệ thống');
      }
    }

    let passwordHash: string;
    try {
      passwordHash = await argon2.hash(dto.password);
    } catch (error) {
      console.log('🚀 ~ AuthService ~ createUser ~ error:', error);
      throw new InternalServerErrorException('Lỗi mã hóa mật khẩu');
    }

    const newUser = await this.authRepository.createUser({
      ...dto,
      passwordHash,
    });

    return {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      storeId: newUser.storeId,
      status: newUser.status,
      createdAt: newUser.createdAt,
    };
  }

  async getUsers(dto: GetUsersDto) {
    return this.authRepository.getUsers(dto);
  }

  async updateUserByAdmin(userId: string, dto: UpdateUserByAdminDto) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('Tài khoản không tồn tại');
    }

    return this.authRepository.updateUser(userId, dto);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('Tài khoản không tồn tại');
    }

    const payloadToUpdate = {
      ...(dto.fullName && { username: dto.fullName }),
      ...(dto.phone && { phone: dto.phone }),
    };

    if (Object.keys(payloadToUpdate).length === 0) {
      return user;
    }

    return this.authRepository.updateUser(userId, payloadToUpdate);
  }

  // handle get all roles
  getAllRoles() {
    const roles = Object.values(UserRole)
      .filter((role) => role !== UserRole.ADMIN)
      .map((role) => ({
        value: role,
        label: roleLabelUtils.getRoleLabel(role),
      }));

    return roles;
  }

  // handle forgot password
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Email không hợp lệ');
    }

    const otp = OtpUtil.generate();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    await this.authRepository.saveOtp(
      user.id,
      otp,
      'forgot_password',
      expiresAt,
    );

    await this.mailService.sendForgotPasswordOtp(user.email, otp);

    return { message: 'Mã xác thực đã được gửi đến email.' };
  }

  // handle reset password
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Email không hợp lệ');
    }

    const validOtp = await this.authRepository.findValidOtp(
      user.id,
      dto.code,
      'forgot_password',
    );

    if (!validOtp) {
      throw new BadRequestException('Mã OTP không chính xác hoặc đã hết hạn');
    }

    const passwordHash = await argon2.hash(dto.password);
    await this.authRepository.updateUserPassword(user.id, passwordHash);
    await this.authRepository.markOtpAsUsed(validOtp.id);

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async clearExpiredTokens() {
    const count = await this.authRepository.clearExpiredTokens();
    console.log(`Cleared ${count} expired tokens`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async clearExpiredOtp() {
    const count = await this.authRepository.clearExpiredOtp();
    console.log(`Cleared ${count} expired OTPs`);
  }

  // handle validate user
  async validateUser(email: string, pass: string) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, pass);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }
}
