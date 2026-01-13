/**
 * Email Service
 *
 * Handles email sending via SMTP (Brevo, SendGrid, etc.)
 * Reads SMTP configuration from settings table or environment variables
 */

import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: SMTPConfig | null = null;

  /**
   * Initialize SMTP transporter with config from settings or env
   */
  async initialize(settingsConfig?: Partial<SMTPConfig>): Promise<boolean> {
    try {
      // Priority: settings config > environment variables
      this.config = {
        host: settingsConfig?.host || process.env.SMTP_HOST || '',
        port: settingsConfig?.port || parseInt(process.env.SMTP_PORT || '587'),
        secure: settingsConfig?.secure ?? (process.env.SMTP_SECURE === 'true'),
        user: settingsConfig?.user || process.env.SMTP_USER || '',
        pass: settingsConfig?.pass || process.env.SMTP_PASS || '',
        from: settingsConfig?.from || process.env.SMTP_FROM || '',
        fromName: settingsConfig?.fromName || process.env.SMTP_FROM_NAME || 'Vergilex'
      };

      if (!this.config.host || !this.config.user || !this.config.pass) {
        logger.warn('SMTP not configured - email service disabled');
        return false;
      }

      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass
        },
        tls: {
          rejectUnauthorized: false // Allow self-signed certs
        }
      });

      logger.info(`Email service initialized: ${this.config.host}:${this.config.port}`);
      return true;
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      return false;
    }
  }

  /**
   * Verify SMTP connection
   */
  async verify(): Promise<{ success: boolean; error?: string }> {
    if (!this.transporter) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'SMTP not configured' };
      }
    }

    try {
      await this.transporter!.verify();
      logger.info('SMTP connection verified successfully');
      return { success: true };
    } catch (error: any) {
      logger.error('SMTP verification failed:', error);
      return { success: false, error: error.message || 'Connection failed' };
    }
  }

  /**
   * Send email
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    if (!this.transporter) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'SMTP not configured' };
      }
    }

    try {
      const mailOptions = {
        from: `"${this.config!.fromName}" <${this.config!.from}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo
      };

      const info = await this.transporter!.sendMail(mailOptions);

      logger.info(`Email sent: ${info.messageId} to ${options.to}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      logger.error('Failed to send email:', error);
      return { success: false, error: error.message || 'Send failed' };
    }
  }

  /**
   * Send test email
   */
  async sendTest(to: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: 'SMTP Test - Vergilex',
      text: 'Bu bir test emailidir. SMTP yapılandırması başarılı!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #2563eb;">SMTP Test Başarılı</h2>
          <p>Bu email Vergilex sisteminden gönderilmiştir.</p>
          <p style="color: #6b7280; font-size: 12px;">
            Gönderim zamanı: ${new Date().toLocaleString('tr-TR')}
          </p>
        </div>
      `
    });
  }

  /**
   * Get current SMTP status
   */
  getStatus(): { configured: boolean; host?: string; port?: number; from?: string } {
    if (!this.config || !this.config.host) {
      return { configured: false };
    }
    return {
      configured: true,
      host: this.config.host,
      port: this.config.port,
      from: this.config.from
    };
  }

  /**
   * Reset transporter (for config changes)
   */
  reset(): void {
    this.transporter = null;
    this.config = null;
  }
}

export const emailService = new EmailService();
export default emailService;
