import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { GetSuppliersDto } from './dto/get-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierRepository } from './supplier.repository';

@Injectable()
export class SupplierService {
  constructor(private readonly supplierRepository: SupplierRepository) {}

  async create(createSupplierDto: CreateSupplierDto) {
    return this.supplierRepository.create(createSupplierDto);
  }

  async findAll(query: GetSuppliersDto) {
    return this.supplierRepository.findAll(query);
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
