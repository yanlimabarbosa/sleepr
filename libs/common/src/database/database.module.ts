import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule as NestConfigModule } from '../config/config.module';

@Module({
  imports: [MongooseModule.forRootAsync({
    imports: [NestConfigModule],
    useFactory: (configService: ConfigService) => ({
      uri: configService.get('MONGODB_URI'),
    }),
    inject: [ConfigService],
  }),
  ],
})
export class DatabaseModule { }
