import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AuthRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findUserByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
  }

  async findUserById(id: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        store: true,
      },
    });
  }

  async createUser(data: CreateUserDto & { passwordHash: string }) {
    const result = await this.db
      .insert(schema.users)
      .values({
        username: data.username,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        storeId: data.storeId || null,
        status: 'active',
      })
      .returning();

    return result[0];
  }

  async findRefreshToken(token: string) {
    return this.db.query.refreshTokens.findFirst({
      where: eq(schema.refreshTokens.token, token),
    });
  }

  async deleteRefreshToken(token: string) {
    await this.db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.token, token));
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date) {
    await this.db.insert(schema.refreshTokens).values({
      userId,
      token,
      expiresAt,
    });
  }

  async saveOtp(userId: string, code: string, type: string, expiresAt: Date) {
    await this.db.insert(schema.otpCodes).values({
      userId,
      code,
      type,
      expiresAt,
      isUsed: false,
    });
  }

  async findValidOtp(userId: string, code: string, type: string) {
    return this.db.query.otpCodes.findFirst({
      where: and(
        eq(schema.otpCodes.userId, userId),
        eq(schema.otpCodes.code, code),
        eq(schema.otpCodes.type, type),
        eq(schema.otpCodes.isUsed, false),
        gt(schema.otpCodes.expiresAt, new Date()),
      ),
    });
  }

  async markOtpAsUsed(otpId: string) {
    await this.db
      .update(schema.otpCodes)
      .set({ isUsed: true })
      .where(eq(schema.otpCodes.id, otpId));
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    await this.db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, userId));
  }
}
