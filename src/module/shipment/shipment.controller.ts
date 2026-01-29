import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get(':id/picking-list')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.CENTRAL_KITCHEN_STAFF)
  async getPickingList(@Param('id') id: string) {
    return this.shipmentService.getPickingList(id);
  }
}
