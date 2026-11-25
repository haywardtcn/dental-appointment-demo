import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const STRAPI = process.env.API_PROXY || 'http://localhost:1337';
const STRAPI_PATHS = [
  '/api',
  '/admin',
  '/content-manager',
  '/content-type-builder',
  '/upload',
  '/uploads',
  '/users-permissions',
  '/i18n',
  '/email',
  '/booking-admin',
  '/strapi-calendar',
];

export default defineConfig({
  plugins: [react()],
  server: {
    // The booking API, plus Strapi's admin panel and its APIs, so one address (and one tunnel) serves both
    // the patient site and /admin.
    proxy: Object.fromEntries(
      STRAPI_PATHS.map((path) => [path, { target: STRAPI, ws: path === '/admin' }])
    ),
    // Lets a Cloudflare quick tunnel (cloudflared tunnel --url http://localhost:5173) reach the dev server.
    allowedHosts: ['.trycloudflare.com'],
  },
});
