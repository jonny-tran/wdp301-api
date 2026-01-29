import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ): NodePgDatabase<typeof schema> => {
        let connectionString = configService.get<string>('DATABASE_URL');

        if (!connectionString) {
          throw new Error(
            'DATABASE_URL is not defined in environment variables',
          );
        }

        if (!connectionString.includes('sslmode=')) {
          connectionString +=
            (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
        }
        if (!connectionString.includes('uselibpqcompat=')) {
          connectionString += '&uselibpqcompat=true';
        }

        const pool = new Pool({
          connectionString,
          max: 20,
        });

        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
