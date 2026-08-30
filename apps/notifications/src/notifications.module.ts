import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  AllContextsExceptionsFilter,
  LoggerModule,
  ValidationPipeProvider,
} from '@app/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        TCP_PORT: Joi.number().required(),
        SMTP_USER: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_OAUTH_REFRESH_TOKEN: Joi.string().required(),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: APP_FILTER, useClass: AllContextsExceptionsFilter },
    ValidationPipeProvider,
  ],
})
export class NotificationsModule {}
