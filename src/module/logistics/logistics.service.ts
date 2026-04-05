import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { LogisticsRepository } from './logistics.repository';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';

function isPgError(
  err: unknown,
): err is { code?: string; message?: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

@Injectable()
export class LogisticsService {
  constructor(private readonly logisticsRepository: LogisticsRepository) {}

  // --- Vehicles ---

  findAllVehicles() {
    return this.logisticsRepository.findAllVehicles();
  }

  async findVehicleById(id: number) {
    const row = await this.logisticsRepository.findVehicleById(id);
    if (!row) {
      throw new NotFoundException(`Không tìm thấy xe #${id}`);
    }
    return row;
  }

  async createVehicle(dto: CreateVehicleDto) {
    try {
      const row = await this.logisticsRepository.createVehicle({
        licensePlate: dto.licensePlate,
        payloadCapacity: String(dto.payloadCapacity),
        fuelRatePerKm: String(dto.fuelRatePerKm),
        status: dto.status ?? 'available',
      });
      if (!row) {
        throw new ConflictException('Không thể tạo xe');
      }
      return row;
    } catch (err) {
      if (isPgError(err) && err.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          `Biển số "${dto.licensePlate}" đã tồn tại trong hệ thống`,
        );
      }
      throw err;
    }
  }

  async updateVehicle(id: number, dto: UpdateVehicleDto) {
    await this.findVehicleById(id);
    const patch: Record<string, unknown> = {};
    if (dto.licensePlate !== undefined) {
      patch.licensePlate = dto.licensePlate;
    }
    if (dto.payloadCapacity !== undefined) {
      patch.payloadCapacity = String(dto.payloadCapacity);
    }
    if (dto.fuelRatePerKm !== undefined) {
      patch.fuelRatePerKm = String(dto.fuelRatePerKm);
    }
    if (dto.status !== undefined) {
      patch.status = dto.status;
    }
    try {
      const row = await this.logisticsRepository.updateVehicle(
        id,
        patch as Parameters<LogisticsRepository['updateVehicle']>[1],
      );
      if (!row) {
        throw new NotFoundException(`Không tìm thấy xe #${id}`);
      }
      return row;
    } catch (err) {
      if (isPgError(err) && err.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'Biển số mới trùng với xe khác trong hệ thống',
        );
      }
      throw err;
    }
  }

  async removeVehicle(id: number) {
    await this.findVehicleById(id);
    try {
      const row = await this.logisticsRepository.deleteVehicle(id);
      if (!row) {
        throw new NotFoundException(`Không tìm thấy xe #${id}`);
      }
      return { id: row.id, deleted: true };
    } catch (err) {
      if (isPgError(err) && err.code === PG_FK_VIOLATION) {
        throw new ConflictException(
          'Không thể xóa xe đang được tham chiếu bởi chuyến hàng hoặc dữ liệu khác',
        );
      }
      throw err;
    }
  }

  // --- Routes ---

  findAllRoutes() {
    return this.logisticsRepository.findAllRoutes();
  }

  async findRouteById(id: number) {
    const row = await this.logisticsRepository.findRouteById(id);
    if (!row) {
      throw new NotFoundException(`Không tìm thấy tuyến #${id}`);
    }
    return row;
  }

  async createRoute(dto: CreateRouteDto) {
    const row = await this.logisticsRepository.createRoute({
      routeName: dto.routeName.trim(),
      distanceKm: String(dto.distanceKm),
      estimatedHours: String(dto.estimatedHours),
      baseTransportCost: String(dto.baseTransportCost),
    });
    if (!row) {
      throw new ConflictException('Không thể tạo tuyến');
    }
    return row;
  }

  async updateRoute(id: number, dto: UpdateRouteDto) {
    await this.findRouteById(id);
    const patch: Record<string, unknown> = {};
    if (dto.routeName !== undefined) {
      patch.routeName = dto.routeName.trim();
    }
    if (dto.distanceKm !== undefined) {
      patch.distanceKm = String(dto.distanceKm);
    }
    if (dto.estimatedHours !== undefined) {
      patch.estimatedHours = String(dto.estimatedHours);
    }
    if (dto.baseTransportCost !== undefined) {
      patch.baseTransportCost = String(dto.baseTransportCost);
    }
    const row = await this.logisticsRepository.updateRoute(
      id,
      patch as Parameters<LogisticsRepository['updateRoute']>[1],
    );
    if (!row) {
      throw new NotFoundException(`Không tìm thấy tuyến #${id}`);
    }
    return row;
  }

  async removeRoute(id: number) {
    await this.findRouteById(id);
    try {
      const row = await this.logisticsRepository.deleteRoute(id);
      if (!row) {
        throw new NotFoundException(`Không tìm thấy tuyến #${id}`);
      }
      return { id: row.id, deleted: true };
    } catch (err) {
      if (isPgError(err) && err.code === PG_FK_VIOLATION) {
        throw new ConflictException(
          'Không thể xóa tuyến đang gắn với cửa hàng hoặc chuyến hàng',
        );
      }
      throw err;
    }
  }
}
