import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: configService.getOrThrow<number>('TCP_PORT'),
      },
    },
    { inheritAppConfig: true },
  );

  app.useLogger(app.get(PinoLogger));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  await app.startAllMicroservices();

  const port = configService.getOrThrow<number>('HTTP_PORT');

  await app.listen(port);

  Logger.log(`auth service running on port ${port}`);
}

bootstrap().catch((err) => {
  Logger.error(err);
  process.exit(1);
});
