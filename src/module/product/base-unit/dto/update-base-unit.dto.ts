import { PartialType } from '@nestjs/swagger';
import { CreateBaseUnitDto } from './create-base-unit.dto';

export class UpdateBaseUnitDto extends PartialType(CreateBaseUnitDto) {}
