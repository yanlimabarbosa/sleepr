import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NotifyEmailDto } from './dto/notify-email.dto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(NotificationsService.name)
    private readonly logger: PinoLogger,
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: this.configService.getOrThrow('SMTP_USER'),
        clientId: this.configService.getOrThrow('GOOGLE_OAUTH_CLIENT_ID'),
        clientSecret: this.configService.getOrThrow(
          'GOOGLE_OAUTH_CLIENT_SECRET',
        ),
        refreshToken: this.configService.getOrThrow(
          'GOOGLE_OAUTH_REFRESH_TOKEN',
        ),
      },
    });
  }

  async notifyEmail({ email, text }: NotifyEmailDto) {
    const info = await this.transporter.sendMail({
      from: this.configService.getOrThrow('SMTP_USER'),
      to: email,
      subject: 'Sleepr Notification',
      text,
    });

    this.logger.info({ messageId: info.messageId, to: email }, 'email sent');
  }
}
