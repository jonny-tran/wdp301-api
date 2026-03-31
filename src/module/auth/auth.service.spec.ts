import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { MailService } from '../../common/service/mail.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserByAdminDto } from './dto/update-user-by-admin.dto';
import { TokenService } from './helper/token.service';

jest.mock('argon2');

describe('AuthService', () => {
  let authService: AuthService;
  let authRepository: jest.Mocked<Partial<AuthRepository>>;
  let tokenService: jest.Mocked<Partial<TokenService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let mailService: jest.Mocked<Partial<MailService>>;

  beforeEach(async () => {
    authRepository = {
      findUserByEmail: jest.fn(),
      createUser: jest.fn(),
      findUserById: jest.fn(),
      findStoreById: jest.fn(),
      saveRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      deleteRefreshToken: jest.fn(),
      saveOtp: jest.fn(),
      findValidOtp: jest.fn(),
      updateUserPassword: jest.fn(),
      markOtpAsUsed: jest.fn(),
      clearExpiredTokens: jest.fn(),
      clearExpiredOtp: jest.fn(),
      getUsers: jest.fn(),
      updateUser: jest.fn(),
    };

    tokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    jwtService = {
      verifyAsync: jest.fn(),
    };

    mailService = {
      sendForgotPasswordOtp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: TokenService, useValue: tokenService },
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should throw ConflictException if email exists', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: UserRole.MANAGER,
        storeId: null as unknown as string,
      };

      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue({
        id: 'existing-id',
      });

      // Act & Assert
      await expect(authService.createUser(dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(authService.createUser(dto)).rejects.toThrow(
        'Email hoặc tên đăng nhập đã được sử dụng',
      );
    });

    it('should reject createUser for franchise_store_staff (use stores/staff flow)', async () => {
      const dto: CreateUserDto = {
        email: 'staff@example.com',
        username: 'staff',
        password: 'password123',
        role: UserRole.FRANCHISE_STORE_STAFF,
        storeId: 'store-id',
      };

      await expect(authService.createUser(dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(authService.createUser(dto)).rejects.toThrow(
        /\/stores\/staff/,
      );
      expect(authRepository.findUserByEmail).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if storeId is provided but store does not exist in the system', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: UserRole.MANAGER,
        storeId: 'invalid-store-id',
      };

      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findStoreById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.createUser(dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(authService.createUser(dto)).rejects.toThrow(
        'Cửa hàng không tồn tại trong hệ thống',
      );
    });

    it('should hash password and return created user on success for role without storeId', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: UserRole.MANAGER,
      } as CreateUserDto;

      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);

      const hashedPassword = 'hashedPassword123';
      (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const mockedCreatedUser = {
        id: 'new-id',
        email: dto.email,
        username: dto.username,
        role: dto.role,
        storeId: null,
        status: 'active',
        createdAt: new Date(),
        passwordHash: hashedPassword,
      };

      (authRepository.createUser as jest.Mock).mockResolvedValue(
        mockedCreatedUser,
      );

      // Act
      const result = await authService.createUser(dto);

      // Assert
      expect(argon2.hash).toHaveBeenCalledWith(dto.password);
      expect(authRepository.findStoreById).not.toHaveBeenCalled();
      expect(authRepository.createUser).toHaveBeenCalledWith({
        ...dto,
        passwordHash: hashedPassword,
      });
      expect(result).toEqual({
        id: mockedCreatedUser.id,
        email: mockedCreatedUser.email,
        username: mockedCreatedUser.username,
        role: mockedCreatedUser.role,
        storeId: mockedCreatedUser.storeId,
        status: mockedCreatedUser.status,
        createdAt: mockedCreatedUser.createdAt,
      });
    });

    it('should hash password and return created user on success for role with a valid storeId', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: UserRole.MANAGER,
        storeId: 'valid-store-id',
      } as CreateUserDto;

      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findStoreById as jest.Mock).mockResolvedValue({
        id: 'valid-store-id',
      });

      const hashedPassword = 'hashedPassword123';
      (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const mockedCreatedUser = {
        id: 'new-id-2',
        email: dto.email,
        username: dto.username,
        role: dto.role,
        storeId: dto.storeId,
        status: 'active',
        createdAt: new Date(),
        passwordHash: hashedPassword,
      };

      (authRepository.createUser as jest.Mock).mockResolvedValue(
        mockedCreatedUser,
      );

      // Act
      const result = await authService.createUser(dto);

      // Assert
      expect(argon2.hash).toHaveBeenCalledWith(dto.password);
      expect(authRepository.findStoreById).toHaveBeenCalledWith(
        'valid-store-id',
      );
      expect(authRepository.createUser).toHaveBeenCalledWith({
        ...dto,
        passwordHash: hashedPassword,
      });
      expect(result).toEqual({
        id: mockedCreatedUser.id,
        email: mockedCreatedUser.email,
        username: mockedCreatedUser.username,
        role: mockedCreatedUser.role,
        storeId: mockedCreatedUser.storeId,
        status: mockedCreatedUser.status,
        createdAt: mockedCreatedUser.createdAt,
      });
    });
  });

  describe('validateUser', () => {
    it('should throw UnauthorizedException right away if email is not found', async () => {
      // Arrange
      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        authService.validateUser('notfound@example.com', 'pass'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.validateUser('notfound@example.com', 'pass'),
      ).rejects.toThrow('Thông tin đăng nhập không chính xác');
    });

    it('should throw ForbiddenException if user is banned', async () => {
      // Arrange
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        passwordHash: 'hashedPass',
        status: 'banned',
      };
      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        authService.validateUser('test@example.com', 'anyPass'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        authService.validateUser('test@example.com', 'anyPass'),
      ).rejects.toThrow('Tài khoản của bạn đã bị khóa');
    });

    it('should return null if password is incorrect', async () => {
      // Arrange
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        passwordHash: 'hashedPass',
        status: 'active',
      };
      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      // Act
      const result = await authService.validateUser(
        'test@example.com',
        'wrongPass',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return user object if credentials are correct', async () => {
      // Arrange
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        passwordHash: 'hashedPass',
        status: 'active',
      };
      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      // Act
      const result = await authService.validateUser(
        'test@example.com',
        'correctPass',
      );

      // Assert
      expect(result).toEqual(mockUser);
    });
  });

  describe('login', () => {
    it('should throw BadRequestException if user is not found', async () => {
      (authRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);
      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUsers', () => {
    it('should call authRepository.getUsers with correct dto', async () => {
      const dto = { page: 1, limit: 10, role: UserRole.MANAGER };
      (authRepository.getUsers as jest.Mock).mockResolvedValue({
        items: [],
        meta: {},
      });

      await authService.getUsers(dto);

      expect(authRepository.getUsers).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateUserByAdmin', () => {
    it('should change user status to inactive', async () => {
      const mockUser = { id: '1', email: 'test@example.com' };
      (authRepository.findUserById as jest.Mock).mockResolvedValue(mockUser);
      (authRepository.updateUser as jest.Mock).mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });

      const dto = { status: 'inactive' } as unknown as UpdateUserByAdminDto;
      const result = await authService.updateUserByAdmin('1', dto);

      expect(authRepository.findUserById).toHaveBeenCalledWith('1');
      expect(authRepository.updateUser).toHaveBeenCalledWith('1', dto);
      expect(result.status).toBe('inactive');
    });
  });

  describe('updateProfile', () => {
    it('should not include role update and only update profile fields', async () => {
      const mockUser = {
        id: '1',
        email: 'user@example.com',
        username: 'Old Name',
      };
      (authRepository.findUserById as jest.Mock).mockResolvedValue(mockUser);
      (authRepository.updateUser as jest.Mock).mockResolvedValue({
        ...mockUser,
        username: 'New Name',
        phone: '123',
      });

      // Simulate a malicious payload that includes 'role'
      const dto = {
        fullName: 'New Name',
        phone: '123',
        role: UserRole.ADMIN,
      } as unknown as UpdateProfileDto;
      const result = await authService.updateProfile('1', dto);

      // Only fullName (mapped to username) and phone should be updated
      expect(authRepository.updateUser).toHaveBeenCalledWith('1', {
        username: 'New Name',
        phone: '123',
      });
      expect(result.username).toBe('New Name');
    });
  });
});
