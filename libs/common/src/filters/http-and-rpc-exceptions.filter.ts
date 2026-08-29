import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';

/**
 * Use in apps that have an HTTP server: HTTP-only OR hybrid
 * (NestFactory.create). Handles both HTTP and RPC contexts.
 * Requires an httpAdapter (register via APP_FILTER).
 * For pure microservices (createMicroservice), use RpcOnlyExceptionsFilter.
 */
@Catch()
export class HttpAndRpcExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exception');
  private readonly rpcFilter = new BaseRpcExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost) {
    const type = host.getType();

    this.logger.error(
      `[${type}] ${exception instanceof Error ? exception.stack : JSON.stringify(exception)}`,
    );

    return type === 'rpc'
      ? this.rpcFilter.catch(exception, host)
      : super.catch(exception, host);
  }
}
