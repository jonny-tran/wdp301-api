import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LogisticsController } from './logistics.controller';
import { LogisticsRepository } from './logistics.repository';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [AuthModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsRepository],
  exports: [LogisticsService, LogisticsRepository],
})
export class LogisticsModule {}
