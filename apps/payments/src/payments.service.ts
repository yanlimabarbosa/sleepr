import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './payments.constants';
import { CreateChargeDto } from '@app/common';

@Injectable()
export class PaymentsService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async createCharge({ amount }: CreateChargeDto) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amount * 100,
      confirm: true,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
    });

    return paymentIntent;
  }
}
