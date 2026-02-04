import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './module/auth/auth.module';
import { ClaimModule } from './module/claim/claim.module';
import { InventoryModule } from './module/inventory/inventory.module';
import { OrderModule } from './module/order/order.module';
import { ProductModule } from './module/product/product.module';
import { ShipmentModule } from './module/shipment/shipment.module';
import { WarehouseModule } from './module/warehouse/warehouse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL')!,
          limit: config.get<number>('THROTTLE_LIMIT')!,
        },
      ],
    }),
    AuthModule,
    OrderModule,
    ShipmentModule,
    InventoryModule,
    ClaimModule,
    WarehouseModule,
    ProductModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
