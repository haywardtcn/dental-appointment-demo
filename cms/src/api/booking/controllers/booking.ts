import type { Context } from 'koa';
import { clinicStatus } from '../../../booking/admin';
import {
  availability,
  cancelByPatient,
  confirmHold,
  createHold,
  listServices,
  releaseHold,
  viewBooking,
} from '../../../booking/reservations';
import { BookingError } from '../../../booking/util';
import { acceptOffer, leaveWaitlist, viewOffer } from '../../../booking/waitlist';

/** Every answer is JSON; errors are { error: { code, message, details } } so the front end can translate the code. */
async function respond(ctx: Context, fn: () => Promise<unknown>, status = 200) {
  try {
    ctx.body = await fn();
    ctx.status = status;
  } catch (err) {
    if (err instanceof BookingError) {
      ctx.status = err.status;
      ctx.body = { error: { code: err.code, message: err.code, details: err.details } };
      return;
    }
    strapi.log.error(`[booking] ${(err as Error).stack ?? err}`);
    ctx.status = 500;
    ctx.body = { error: { code: 'SERVER_ERROR', message: 'SERVER_ERROR', details: {} } };
  }
}

// In-memory limits are enough for a single-instance demo (plan.md §5.5).
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number): boolean {
  // Load tests switch this off with BOOKING_RATE_LIMIT=off.
  if (process.env.BOOKING_RATE_LIMIT === 'off') return false;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
const tooMany = () => new BookingError('RATE_LIMITED', 429);

const body = (ctx: Context) => ((ctx.request as unknown as { body?: Record<string, any> }).body ?? {}) as Record<string, any>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export default {
  services: (ctx: Context) => respond(ctx, listServices),

  availability: (ctx: Context) =>
    respond(ctx, () =>
      availability({ service: str(ctx.query.service) ?? '', doctor: str(ctx.query.doctor), from: str(ctx.query.from), to: str(ctx.query.to) })
    ),

  clinicStatus: (ctx: Context) => respond(ctx, clinicStatus),

  createHold: (ctx: Context) =>
    respond(
      ctx,
      async () => {
        if (limited(`hold:${ctx.ip}`, 5, 60_000)) throw tooMany();
        const b = body(ctx);
        return createHold({
          service: str(b.service) ?? '',
          doctor: str(b.doctor),
          startAt: str(b.startAt) ?? '',
          previousHoldId: str(b.previousHoldId),
          previousHoldToken: str(b.previousHoldToken),
        });
      },
      201
    ),

  releaseHold: (ctx: Context) =>
    respond(ctx, async () => {
      // sendBeacon cannot set headers, so the token may also come in the body.
      const token = str(ctx.get('x-hold-token')) || str(body(ctx).holdToken) || '';
      return { released: await releaseHold(ctx.params.id, token) };
    }),

  confirmHold: (ctx: Context) =>
    respond(
      ctx,
      async () => {
        if (limited(`confirm:${ctx.ip}`, 10, 60_000)) throw tooMany();
        return confirmHold(ctx.params.id, ctx.get('x-hold-token'), body(ctx), ctx.get('idempotency-key') || undefined);
      },
      201
    ),

  viewBooking: (ctx: Context) => respond(ctx, () => viewBooking(str(ctx.query.token) ?? '')),

  cancelBooking: (ctx: Context) =>
    respond(ctx, async () => {
      if (limited(`cancel:${ctx.ip}`, 10, 60_000)) throw tooMany();
      return cancelByPatient(str(body(ctx).token) ?? '');
    }),

  viewOffer: (ctx: Context) => respond(ctx, () => viewOffer(str(ctx.query.token) ?? '')),

  acceptOffer: (ctx: Context) => respond(ctx, () => acceptOffer(str(body(ctx).token) ?? ''), 201),

  leaveWaitlist: (ctx: Context) => respond(ctx, () => leaveWaitlist(str(body(ctx).id) ?? '', str(body(ctx).token) ?? '')),
};
