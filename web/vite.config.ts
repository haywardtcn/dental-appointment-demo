import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The booking API is Strapi on :1337; the proxy keeps requests same-origin in development.
  server: { proxy: { '/api': process.env.API_PROXY || 'http://localhost:1337' } },
});
