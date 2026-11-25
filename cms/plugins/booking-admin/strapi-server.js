'use strict';

// Admin routes only (/booking-admin/*). The pages live in src/admin; the logic in the api::booking.booking service.
const booking = () => strapi.service('api::booking.booking');

const SUPER_ADMIN = 'strapi-super-admin';
const isClinicAdmin = (ctx) => (ctx.state.user?.roles || []).some((r) => r.code === SUPER_ADMIN);

const handle = (fn, { adminOnly = false } = {}) => async (ctx) => {
  if (adminOnly && !isClinicAdmin(ctx)) {
    ctx.status = 403;
    ctx.body = { error: { code: 'FORBIDDEN', message: '只有 Clinic Admin 可以用' } };
    return;
  }
  try {
    ctx.body = await fn(ctx, ctx.request.body || {});
  } catch (err) {
    ctx.status = err.status && err.code ? err.status : 400;
    ctx.body = { error: { code: err.code || 'ERROR', message: err.message, details: err.details || {} } };
  }
};

const route = (method, path, handler) => ({
  method,
  path,
  handler: `tools.${handler}`,
  config: { policies: ['admin::isAuthenticatedAdmin'] },
});

module.exports = {
  register() {},
  bootstrap() {},
  controllers: {
    tools: () => ({
      preview: handle((ctx) => booking().schedulePreview(ctx.query)),
      emergencyPreview: handle((ctx, b) => booking().emergencyPreview(b), { adminOnly: true }),
      emergencyClose: handle((ctx, b) => booking().emergencyClose(b), { adminOnly: true }),
      reservationAction: handle((ctx, b) => booking().reservationAction(ctx.params.id, ctx.params.action, b)),
      offerNow: handle((ctx) => booking().offerNow(ctx.params.id)),
      retryNotification: handle((ctx) => booking().retryNotification(ctx.params.id)),
      importHolidays: handle(() => booking().importHolidays(), { adminOnly: true }),
      me: handle((ctx) => ({ clinicAdmin: isClinicAdmin(ctx) })),
    }),
  },
  routes: {
    admin: {
      type: 'admin',
      routes: [
        route('GET', '/preview', 'preview'),
        route('GET', '/me', 'me'),
        route('POST', '/emergency/preview', 'emergencyPreview'),
        route('POST', '/emergency/close', 'emergencyClose'),
        route('POST', '/reservations/:id/:action', 'reservationAction'),
        route('POST', '/waitlist/:id/offer', 'offerNow'),
        route('POST', '/notifications/:id/retry', 'retryNotification'),
        route('POST', '/holidays/import', 'importHolidays'),
      ],
    },
  },
};
