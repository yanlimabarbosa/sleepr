import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { ServerResponse } from 'http';

interface LogRequest {
  method?: string;
  url?: string;
  body?: unknown;
}

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              },
        customLogLevel: (_req, res: ServerResponse, err) => {
          if (res.statusCode >= 500 || err) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        wrapSerializers: false,
        serializers: {
          req: (req: LogRequest) => ({
            method: req.method,
            url: req.url,
            body: req.body,
          }),
          res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
          err: (err: Error) => ({
            type: err.name,
            message: err.message,
            stack: err.stack,
          }),
        },
        redact: {
          paths: ['req.body.password', 'req.headers.authorization'],
          censor: '***',
        },
      },
    }),
  ],
})
export class LoggerModule {}

// import { Module } from '@nestjs/common';
// import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

// @Module({
//   imports: [
//     PinoLoggerModule.forRoot({
//       pinoHttp: {
//         level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
//         transport:
//           process.env.NODE_ENV === 'production'
//             ? undefined
//             : {
//               target: 'pino-pretty',
//               options: {
//                 colorize: true,
//                 singleLine: true,
//                 translateTime: 'SYS:standard',
//                 ignore: 'pid,hostname',
//               },
//             },
//       },
//     }),
//   ],
// })
// export class LoggerModule { }
