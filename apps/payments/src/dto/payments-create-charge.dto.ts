import { CreateChargeDto } from '@app/common';
import { IsEmail } from 'class-validator';

export class PaymentsCreateChargerDto extends CreateChargeDto {
  @IsEmail()
  email: string;
}
