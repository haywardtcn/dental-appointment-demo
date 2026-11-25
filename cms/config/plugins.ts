import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtManagement: 'refresh',
      sessions: {
        httpOnly: true,
      },
    },
  },
  email: {
    config: {
      // Demo: emails are logged, not sent (plan.md §6). Set EMAIL_PROVIDER=nodemailer to send for real.
      provider: env('EMAIL_PROVIDER', 'strapi-provider-email-log'),
      settings: {
        defaultFrom: env('EMAIL_FROM', 'no-reply@clearlight.demo'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'hello@clearlight-dental.example'),
      },
    },
  },
  'booking-admin': {
    enabled: true,
    resolve: './plugins/booking-admin',
  },
  upload: {
    config: {
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes,
      },
    },
  },
});

export default config;
