import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';

/**
 * Use in pure microservices (NestFactory.createMicroservice) that have no
 * HTTP adapter. Handles the RPC context only.
 * For apps with an HTTP server (HTTP-only or hybrid), use
 * HttpAndRpcExceptionsFilter.
 */
@Catch()
export class RpcOnlyExceptionsFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    this.logger.error(
      `[rpc] ${exception instanceof Error ? exception.stack : JSON.stringify(exception)}`,
    );
    return super.catch(exception, host);
  }
}
