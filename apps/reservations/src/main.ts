import { NestFactory } from '@nestjs/core';
import { ReservationsModule } from './reservations.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(ReservationsModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT') ?? 3000;
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(port);
  Logger.log(`reservations service running on port ${port}`);
}

bootstrap().catch((err) => {
  Logger.error(err);
  process.exit(1);
});
