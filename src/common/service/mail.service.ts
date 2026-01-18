import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
  }

  async sendForgotPasswordOtp(to: string, otp: string) {
    const fromEmail = this.configService.get<string>('MAIL_FROM_EMAIL');
    if (!fromEmail) {
      this.logger.error('Missing mail configuration');
      return;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Yêu cầu đặt lại mật khẩu</h2>
        <p>Xin chào,</p>
        <p>Bạn vừa yêu cầu mã xác thực để đặt lại mật khẩu. Đây là mã OTP của bạn:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
          <h1 style="color: #d32f2f; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>Mã này sẽ hết hạn sau <strong>5 phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    `;

    try {
      const data = await this.resend.emails.send({
        from: fromEmail,
        to: [to],
        subject: `[WDP301] Mã xác thực OTP: ${otp}`,
        html: htmlContent,
      });

      if (data.error) {
        this.logger.error('❌ Resend Error:', data.error);
        throw new Error(data.error.message);
      }

      this.logger.log(`📧 OTP sent to ${to} via Resend. ID: ${data.data?.id}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error('❌ Failed to send OTP:', err.message);
      this.logger.debug(`[DEV ONLY] OTP for ${to}: ${otp}`);
    }
  }
}
