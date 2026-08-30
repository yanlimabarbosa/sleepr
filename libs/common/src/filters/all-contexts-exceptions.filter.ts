import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
  Optional,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';

/**
 * Works in every transport context: TCP-only (createMicroservice),
 * HTTP-only, and hybrid. Routes each exception by host.getType():
 * rpc -> BaseRpcExceptionFilter, http -> BaseExceptionFilter.
 *
 * Uses composition (not inheritance) so it never IS-A HTTP filter: the
 * HTTP delegate is built only when an httpAdapter exists, so a pure
 * microservice never touches HTTP internals. HttpAdapterHost is supplied
 * by Nest's DI -> register via APP_FILTER (useClass), never hand-new it.
 */
@Catch()
export class AllContextsExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');
  private readonly rpcFilter = new BaseRpcExceptionFilter();
  private readonly httpFilter?: BaseExceptionFilter;

  constructor(@Optional() httpAdapterHost?: HttpAdapterHost) {
    const httpAdapter = httpAdapterHost?.httpAdapter;
    if (httpAdapter) {
      this.httpFilter = new BaseExceptionFilter(httpAdapter);
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const type = host.getType();

    this.logger.error(
      `[${type}] ${exception instanceof Error ? exception.stack : JSON.stringify(exception)}`,
    );

    if (type === 'rpc') {
      return this.rpcFilter.catch(exception, host);
    }

    if (this.httpFilter) {
      return this.httpFilter.catch(exception, host);
    }

    return this.rpcFilter.catch(exception, host);
  }
}
