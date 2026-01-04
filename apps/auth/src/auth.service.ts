import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { UserDocument } from './users/models/user.schema';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService, private readonly jwtService: JwtService) { }

  async login(user: UserDocument, response: Response) {
    const tokenPayload = {
      userId: user._id.toHexString(),
    };

    const expires = new Date();
    const jwtExpiration = this.configService.getOrThrow<string>('JWT_EXPIRATION');
    expires.setSeconds(
      expires.getSeconds() + parseInt(jwtExpiration, 10),
    );

    const token = await this.jwtService.sign(tokenPayload);

    response.cookie('Authentication', token, { httpOnly: true, expires });
  }

  getHello(): string {
    return 'Hello World!';
  }
}
