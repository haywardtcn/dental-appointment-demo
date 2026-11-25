import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { ZONE } from './schedule';

export const UID = {
  doctor: 'api::doctor.doctor',
  service: 'api::service.service',
  rule: 'api::schedule-rule.schedule-rule',
  holiday: 'api::public-holiday.public-holiday',
  setting: 'api::clinic-setting.clinic-setting',
  reservation: 'api::reservation.reservation',
  waitlist: 'api::waitlist-entry.waitlist-entry',
  notification: 'api::notification-log.notification-log',
  audit: 'api::audit-log.audit-log',
} as const;

/** Statuses that still occupy time. */
export const ACTIVE_STATUSES = ['HELD', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW'];
export const BOOKED_STATUSES = ['CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW'];

/** A booking-API error with a stable code the front end translates (plan.md §10). */
export class BookingError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

/**
 * Marks writes made by the booking code itself, so the document middleware does not also
 * send the "admin changed this" notifications for them.
 */
export const internalWrite = new AsyncLocalStorage<{ internal: true }>();
export const runInternal = <T>(fn: () => Promise<T>) => internalWrite.run({ internal: true }, fn);
export const isInternal = () => Boolean(internalWrite.getStore()?.internal);

/** Hong Kong numbers: 8 digits starting 2–9, stored as +852XXXXXXXX. Others are kept with their + prefix. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('852')) return /^852[2-9]\d{7}$/.test(digits) ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (/^[2-9]\d{7}$/.test(digits)) return `+852${digits}`;
  if (/^852[2-9]\d{7}$/.test(digits)) return `+${digits}`;
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export const normalizeName = (raw: string | null | undefined) => raw?.trim().replace(/\s+/g, ' ').toLowerCase() || null;

export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference(startAt: Date | string): string {
  const d = DateTime.fromJSDate(new Date(startAt), { zone: ZONE });
  const bytes = randomBytes(4);
  const tail = Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  return `QG-${d.toFormat('yyMM')}-${tail}`;
}

export const maskPhone = (p?: string | null) => (p ? `****${p.slice(-4)}` : '');
export const maskEmail = (e?: string | null) => {
  if (!e) return '';
  const [user, domain] = e.split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
};

const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];

/** "2026-12-01（二）10:30" or "Tue 1 Dec 2026, 10:30" in Hong Kong time. */
export function formatWhen(value: Date | string | number, locale: string): string {
  const d = DateTime.fromJSDate(new Date(value), { zone: ZONE });
  if (locale === 'en') return d.setLocale('en-GB').toFormat('ccc d LLL yyyy, HH:mm');
  return `${d.toFormat('yyyy-MM-dd')}（${WEEKDAY_ZH[d.weekday - 1]}）${d.toFormat('HH:mm')}`;
}

export const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

export const todayHK = () => DateTime.now().setZone(ZONE).startOf('day');
