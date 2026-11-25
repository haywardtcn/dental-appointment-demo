import type { Core } from '@strapi/strapi';

const REFRESH_COOKIE = 'strapi_admin_refresh';

/**
 * The strapi-calendar plugin serves its events and settings with `auth: false`, and the event titles carry
 * patient names. Its source is left untouched, so this guard asks for a live admin session instead. The
 * plugin's admin page calls with plain axios and no token, so the admin session cookie is accepted too;
 * config/admin.ts widens that cookie's path so the browser sends it here.
 */
export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) =>
  async (ctx: any, next: () => Promise<void>) => {
    if (!ctx.path.startsWith('/strapi-calendar')) return next();
    const manager = (strapi as any).sessionManager?.('admin');
    if (manager && (await hasBearer(ctx, manager) || await hasCookie(ctx, manager))) return next();
    ctx.status = 401;
    ctx.body = { data: null, error: { status: 401, name: 'UnauthorizedError', message: 'Admin login required' } };
  };

async function hasBearer(ctx: any, manager: any) {
  const [scheme, token] = String(ctx.request.header.authorization ?? '').split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false;
  const result = manager.validateAccessToken(token);
  return Boolean(result?.isValid && (await manager.isSessionActive(result.payload.sessionId)));
}

async function hasCookie(ctx: any, manager: any) {
  const token = ctx.cookies.get(REFRESH_COOKIE);
  if (!token) return false;
  const result = await manager.validateRefreshToken(token);
  return Boolean(result?.isValid);
}
