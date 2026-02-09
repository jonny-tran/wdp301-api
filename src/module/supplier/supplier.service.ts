import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierRepository } from './supplier.repository';

@Injectable()
export class SupplierService {
  constructor(private readonly supplierRepository: SupplierRepository) {}

  async create(createSupplierDto: CreateSupplierDto) {
    return this.supplierRepository.create(createSupplierDto);
  }

  async findAll(page: number, limit: number, search?: string) {
    const { data, total } = await this.supplierRepository.findAll(
      page,
      limit,
      search,
    );
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }
    if (!supplier.isActive) {
      throw new NotFoundException('Nhà cung cấp đã không còn hoạt động');
    }
    return supplier;
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto) {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }
    if (!supplier.isActive) {
      throw new NotFoundException('Nhà cung cấp đã không còn hoạt động');
    }
    return this.supplierRepository.update(id, updateSupplierDto);
  }

  async remove(id: number) {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }
    if (!supplier.isActive) {
      throw new NotFoundException('Nhà cung cấp đã không còn hoạt động');
    }
    return this.supplierRepository.softDelete(id);
  }
}
