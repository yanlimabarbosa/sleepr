import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);

  const TCP_PORT = configService.getOrThrow<number>('TCP_PORT');

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: TCP_PORT,
      },
    },
    { inheritAppConfig: true },
  );

  app.useLogger(app.get(PinoLogger));
  await app.startAllMicroservices();

  Logger.log(`notifications service running on port ${TCP_PORT}`);
}

bootstrap().catch((err) => {
  Logger.error(err);
  process.exit(1);
});
