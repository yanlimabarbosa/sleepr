import { Provider, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

/**
 * Global ValidationPipe registered through DI (APP_PIPE) instead of
 * app.useGlobalPipes(). DI is the only global form that reaches BOTH the HTTP
 * (@Body) and the microservice (@Payload) pipe chains — app.useGlobalPipes()
 * does not validate @Payload in a hybrid app. Register in each app's module
 * providers, same as AllContextsExceptionsFilter via APP_FILTER.
 */
export const ValidationPipeProvider: Provider = {
  provide: APP_PIPE,
  useValue: new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
};
