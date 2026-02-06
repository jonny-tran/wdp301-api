import { Module } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { InboundRepository } from './inbound.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [InboundController],
  providers: [InboundService, InboundRepository],
  exports: [InboundService, InboundRepository],
})
export class InboundModule {}
