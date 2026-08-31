import { NestFactory } from '@nestjs/core';
import { ReservationsModule } from './reservations.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(ReservationsModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));
  app.use(cookieParser());
  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>('HTTP_PORT');
  await app.listen(port);

  Logger.log(`reservations service running on port ${port}`);
}

bootstrap().catch((err) => {
  Logger.error(err);
  process.exit(1);
});
