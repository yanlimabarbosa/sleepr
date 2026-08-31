import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './payments.constants';
import { CreateChargeDto } from '@app/common';
import { NOTIFICATIONS_SERVICE } from '@app/common/constants/services';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentsCreateChargerDto } from './dto/payments-create-charge.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsService: ClientProxy,
  ) {}

  async createCharge({ amount, email }: PaymentsCreateChargerDto) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amount * 100,
      confirm: true,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
    });

    this.notificationsService.emit('notify-email', {
      email,
      text: `Your payment of $${amount * 100} has completed successfully`,
    });

    return paymentIntent;
  }
}
