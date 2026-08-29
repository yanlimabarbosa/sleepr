import { Inject, Injectable } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE } from '@app/common/constants/services';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentsService: ClientProxy,
  ) {}

  async create(createReservationDto: CreateReservationDto, userId: string) {
    this.paymentsService.send('create_charge', createReservationDto.charge);

    const reservation = this.reservationsRepository.create({
      ...createReservationDto,
      timestamp: new Date(),
      userId,
    });

    return reservation;
  }

  findAll() {
    return this.reservationsRepository.find({});
  }

  findOne(_id: string) {
    return this.reservationsRepository.findOne({ _id });
  }

  update(_id: string, updateReservationDto: UpdateReservationDto) {
    return this.reservationsRepository.findOneAndUpdate(
      {
        _id,
      },
      { $set: updateReservationDto },
    );
  }

  remove(_id: string) {
    return this.reservationsRepository.findOneAndDelete({ _id });
  }
}
