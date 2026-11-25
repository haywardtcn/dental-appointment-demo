import type { Core } from '@strapi/strapi';
import cronTasks from './cron-tasks';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Behind a tunnel or proxy: PUBLIC_URL is the address people open, and IS_PROXIED trusts its https headers.
  url: env('PUBLIC_URL', ''),
  proxy: env.bool('IS_PROXIED', false),
  app: {
    keys: env.array('APP_KEYS')!,
  },
  cron: {
    enabled: env.bool('CRON_ENABLED', true),
    tasks: cronTasks,
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});

export default config;
