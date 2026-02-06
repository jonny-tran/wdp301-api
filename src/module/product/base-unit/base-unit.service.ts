import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseUnitRepository } from './base-unit.repository';
import { CreateBaseUnitDto } from './dto/create-base-unit.dto';
import { UpdateBaseUnitDto } from './dto/update-base-unit.dto';

@Injectable()
export class BaseUnitService {
  constructor(private readonly baseUnitRepository: BaseUnitRepository) {}

  async create(dto: CreateBaseUnitDto) {
    const existing = await this.baseUnitRepository.findByName(dto.name);
    if (existing) {
      throw new BadRequestException('Tên đơn vị tính đã tồn tại');
    }
    return await this.baseUnitRepository.create(dto);
  }

  async findAll() {
    return await this.baseUnitRepository.findAll();
  }

  async findOne(id: number) {
    const baseUnit = await this.baseUnitRepository.findById(id);
    if (!baseUnit) {
      throw new NotFoundException('Đơn vị tính không tồn tại');
    }
    return baseUnit;
  }

  async update(id: number, dto: UpdateBaseUnitDto) {
    const existing = await this.baseUnitRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Đơn vị tính không tồn tại');
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.baseUnitRepository.findByName(dto.name);
      if (duplicate) {
        throw new BadRequestException('Tên đơn vị tính đã tồn tại');
      }
    }

    return await this.baseUnitRepository.update(id, dto);
  }

  async remove(id: number) {
    const existing = await this.baseUnitRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Đơn vị tính không tồn tại');
    }
    return await this.baseUnitRepository.softDelete(id);
  }
}
