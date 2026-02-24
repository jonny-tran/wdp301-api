import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Roles } from 'src/module/auth/decorators/roles.decorator';
import { UserRole } from 'src/module/auth/dto/create-user.dto';
import { AtGuard } from 'src/module/auth/guards/auth.guard';
import { RolesGuard } from 'src/module/auth/guards/roles.guard';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigService } from './system-config.service';

@ApiTags('System Configs')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system-configs')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách cấu hình hệ thống [Admin]' })
  @ResponseMessage('Lấy danh sách cấu hình hệ thống thành công')
  async findAll() {
    return this.systemConfigService.findAll();
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Cập nhật giá trị cấu hình theo key [Admin]' })
  @ResponseMessage('Cập nhật cấu hình hệ thống thành công')
  async updateConfig(
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
  ) {
    return this.systemConfigService.updateConfig(key, dto);
  }
}
