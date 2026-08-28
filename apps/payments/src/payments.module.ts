import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { LoggerModule } from '@app/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './payments.constants';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        TCP_PORT: Joi.number().required(),
        STRIPE_SECRET_KEY: Joi.string().required(),
      }),
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: STRIPE_CLIENT,
      useFactory: (configService: ConfigService) =>
        new Stripe(configService.getOrThrow('STRIPE_SECRET_KEY')),
      inject: [ConfigService],
    },
  ],
})
export class PaymentsModule {}
