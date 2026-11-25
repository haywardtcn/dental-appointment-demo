import { DateTime } from 'luxon';
import { invalidateScheduleData, loadScheduleData } from './data';
import { busyByDoctor } from './lock';
import { alertAdmin, enqueue, manageUrl } from './notify';
import { scheduleWaitlistMatch } from './reservations';
import { matchWaitlist } from './waitlist';
import { ZONE, hkDay, minutesToTime, planDay, sessionCount, union } from './schedule';
import { ACTIVE_STATUSES, BookingError, UID, formatWhen, hashToken, newToken, runInternal, todayHK } from './util';

type Row = Record<string, any>;

// ---------------------------------------------------------------- schedule preview (plan.md §3.4, A9)

export async function schedulePreview(q: { doctor?: string; days?: number; from?: string }) {
  const data = await loadScheduleData();
  const doctors = q.doctor ? data.doctors.filter((d) => d.documentId === q.doctor || d.slug === q.doctor) : data.doctors;
  const days = Math.min(Math.max(Number(q.days) || 14, 1), 62);
  const from = q.from ? hkDay(q.from) : todayHK();
  const busy = await busyByDoctor(doctors.map((d) => d.documentId), from.toJSDate(), from.plus({ days }).toJSDate());

  return {
    doctors: data.doctors.map((d) => ({ documentId: d.documentId, nameZh: d.nameZh, nameEn: d.nameEn })),
    rows: doctors.flatMap((doctor) =>
      Array.from({ length: days }, (_, i) => {
        const day = from.plus({ days: i });
        const plan = planDay(data.rules, day, doctor.documentId, null, data.holidays, data.settings.sessionMinutes);
        const s = day.toMillis();
        const e = day.plus({ days: 1 }).toMillis();
        const dayBusy = (busy.get(doctor.documentId) ?? []).filter((b) => b.start < e && b.end > s);
        return {
          doctor: doctor.nameZh,
          date: day.toISODate(),
          weekday: day.setLocale('zh-HK').toFormat('ccc'),
          status: plan.status,
          open: plan.open.map((r) => `${minutesToTime(r.start)}–${minutesToTime(r.end)}`),
          sessionMinutes: plan.sessionMinutes,
          sessions: sessionCount(plan),
          booked: dayBusy.filter((b) => b.kind === 'BOOKED').length,
          blocked: dayBusy.filter((b) => b.kind === 'BLOCK').length,
          held: dayBusy.filter((b) => b.kind === 'HOLD').length,
          maxBookings: plan.maxBookings,
          reason: plan.reasonZh,
          openedBy: plan.openedBy,
          closedBy: plan.closedBy,
        };
      })
    ),
  };
}

// ---------------------------------------------------------------- emergency close (A8)

function parseRange(q: { from: string; to: string }) {
  const from = DateTime.fromISO(q.from, { zone: ZONE });
  const to = DateTime.fromISO(q.to, { zone: ZONE });
  if (!from.isValid || !to.isValid || to <= from) throw new BookingError('INVALID_RANGE', 400);
  return { from: from.toJSDate(), to: to.toJSDate() };
}

async function affected(q: { from: string; to: string; doctors?: string[] }) {
  const { from, to } = parseRange(q);
  const where: Row = { bookingStatus: { $in: ['HELD', 'CONFIRMED'] }, startAt: { $lt: to }, blockedUntil: { $gt: from } };
  if (q.doctors?.length) where.doctor = { documentId: { $in: q.doctors } };
  const rows = await strapi.db.query(UID.reservation).findMany({ where, populate: ['doctor', 'service'], orderBy: { startAt: 'asc' } });
  return { from, to, rows };
}

export async function emergencyPreview(q: { from: string; to: string; doctors?: string[] }) {
  const { rows } = await affected(q);
  return {
    count: rows.length,
    reservations: rows.map((r: Row) => ({
      documentId: r.documentId,
      reference: r.reference,
      kind: r.kind,
      status: r.bookingStatus,
      when: formatWhen(r.startAt, 'zh-HK'),
      doctor: r.doctor?.nameZh,
      service: r.service?.nameZh,
      patientName: r.patientName,
      hasEmail: Boolean(r.email),
    })),
  };
}

export async function emergencyClose(q: { from: string; to: string; doctors?: string[]; reason: string; notify?: boolean }) {
  const { from, to, rows } = await affected(q);
  const data = await loadScheduleData();
  const doctorIds = q.doctors?.length ? q.doctors : data.doctors.map((d) => d.documentId);
  const reason = q.reason?.trim() || '診所臨時休診';
  let cancelled = 0;
  let released = 0;

  await runInternal(() =>
    strapi.db.transaction(async () => {
      for (const r of rows) {
        if (r.kind === 'BLOCK') {
          await strapi.documents(UID.reservation).update({ documentId: r.documentId, data: { bookingStatus: 'CANCELLED', cancelReason: reason } as any });
          continue;
        }
        if (r.bookingStatus === 'HELD') {
          await strapi.documents(UID.reservation).update({ documentId: r.documentId, data: { bookingStatus: 'RELEASED' } as any });
          released++;
          continue;
        }
        await strapi.documents(UID.reservation).update({ documentId: r.documentId, data: { bookingStatus: 'CANCELLED', cancelReason: reason } as any });
        cancelled++;
        if (q.notify !== false && r.email) {
          const locale = r.language || 'zh-HK';
          await enqueue('BOOKING_CANCELLED', r.email, locale, { name: r.patientName, reference: r.reference, when: formatWhen(r.startAt, locale), reason, clinicPhone: data.settings.clinicPhone }, r.reference);
        }
      }
      for (const doctorId of doctorIds) {
        await strapi.documents(UID.reservation).create({
          data: { doctor: doctorId, startAt: from, endAt: to, blockedUntil: to, kind: 'BLOCK', bookingStatus: 'CONFIRMED', source: 'ADMIN', internalNote: `緊急休診：${reason}`, notifyPatient: false } as any,
        });
      }
      const user = strapi.requestContext.get()?.state?.user;
      await strapi.db.query(UID.audit).create({
        data: { actorType: 'ADMIN', actorId: user ? String(user.email ?? user.id) : null, action: 'emergency-close', target: `${from.toISOString()} → ${to.toISOString()}`, after: { reason, cancelled, released, doctors: doctorIds } },
      });
    })
  );
  return { cancelled, released, blocks: doctorIds.length };
}

// ---------------------------------------------------------------- document actions on a reservation (A3)

const STATUS_FOR: Record<string, string> = { arrived: 'ARRIVED', completed: 'COMPLETED', 'no-show': 'NO_SHOW' };

export async function reservationAction(documentId: string, action: string, body: { reason?: string; notify?: boolean } = {}) {
  const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId }, populate: ['doctor', 'service'] });
  if (!r) throw new BookingError('NOT_FOUND', 404);

  if (action === 'cancel') {
    if (!ACTIVE_STATUSES.includes(r.bookingStatus)) throw new BookingError('NOT_CANCELLABLE', 409);
    // Not internal: the document middleware sends the cancellation email when notifyPatient is on.
    await strapi.documents(UID.reservation).update({
      documentId,
      data: { bookingStatus: 'CANCELLED', cancelReason: body.reason?.trim() || '診所取消', notifyPatient: body.notify !== false } as any,
    });
    return { status: 'CANCELLED' };
  }
  if (STATUS_FOR[action]) {
    if (!['CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW'].includes(r.bookingStatus)) throw new BookingError('INVALID_STATUS', 409);
    await strapi.documents(UID.reservation).update({ documentId, data: { bookingStatus: STATUS_FOR[action] } as any });
    return { status: STATUS_FOR[action] };
  }
  if (action === 'resend') {
    if (r.bookingStatus !== 'CONFIRMED' || !r.email) throw new BookingError('NOTHING_TO_SEND', 409);
    const token = newToken();
    const locale = r.language || 'zh-HK';
    const { settings } = await loadScheduleData();
    await strapi.db.query(UID.reservation).update({ where: { id: r.id }, data: { manageTokenHash: hashToken(token) } });
    await enqueue('BOOKING_CONFIRMED', r.email, locale, {
      name: r.patientName,
      reference: r.reference,
      when: formatWhen(r.startAt, locale),
      doctor: locale === 'en' ? r.doctor?.nameEn : r.doctor?.nameZh,
      service: locale === 'en' ? r.service?.nameEn : r.service?.nameZh,
      manageUrl: manageUrl(token),
      clinicPhone: settings.clinicPhone,
    }, r.reference);
    return { status: r.bookingStatus, sent: true };
  }
  throw new BookingError('UNKNOWN_ACTION', 400);
}

export async function offerNow(entryDocumentId: string) {
  const made = await matchWaitlist({ entryId: entryDocumentId });
  return { offered: made > 0 };
}

export async function retryNotification(documentId: string) {
  const n = await strapi.db.query(UID.notification).findOne({ where: { documentId } });
  if (!n) throw new BookingError('NOT_FOUND', 404);
  await strapi.db.query(UID.notification).update({ where: { id: n.id }, data: { deliveryStatus: 'PENDING', attempts: 0, nextAttemptAt: null, lastError: null } });
  return { status: 'PENDING' };
}

// ---------------------------------------------------------------- rule changes → conflicts (plan.md §8)

let scanTimer: NodeJS.Timeout | null = null;
export function scheduleConflictScan() {
  invalidateScheduleData();
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanConflicts()
      .then(() => scheduleWaitlistMatch())
      .catch((e) => strapi.log.error(`[conflicts] scan failed: ${e.message}`));
  }, 500);
}

const RULE_CONFLICT = '已唔喺開放時間內（排期規則有改動）';

/** Upcoming bookings that now fall outside opening hours are flagged, never cancelled. */
export async function scanConflicts(): Promise<number> {
  const data = await loadScheduleData();
  const activeDoctors = new Set(data.doctors.map((d) => d.documentId));
  const rows = await strapi.db.query(UID.reservation).findMany({
    where: { kind: 'APPOINTMENT', bookingStatus: 'CONFIRMED', startAt: { $gt: new Date() } },
    populate: ['doctor', 'service'],
  });
  const fresh: string[] = [];
  for (const r of rows) {
    const start = DateTime.fromJSDate(new Date(r.startAt), { zone: ZONE });
    const day = start.startOf('day');
    let reason: string | null = null;
    if (!r.doctor || !activeDoctors.has(r.doctor.documentId)) {
      reason = '醫生已停用';
    } else {
      const plan = planDay(data.rules, day, r.doctor.documentId, r.service?.documentId ?? null, data.holidays, data.settings.sessionMinutes);
      const s = start.diff(day, 'minutes').minutes;
      const e = DateTime.fromJSDate(new Date(r.endAt), { zone: ZONE }).diff(day, 'minutes').minutes;
      const inside = union(plan.open).some((o) => o.start <= s && o.end >= e);
      if (!inside) reason = plan.status === 'HOLIDAY' && plan.reasonZh ? `${RULE_CONFLICT}：${plan.reasonZh}` : RULE_CONFLICT;
    }
    const ruleFlag = r.conflict && (r.conflictReason?.startsWith(RULE_CONFLICT) || r.conflictReason === '醫生已停用');
    if (reason && (!r.conflict || r.conflictReason !== reason)) {
      await strapi.db.query(UID.reservation).update({ where: { id: r.id }, data: { conflict: true, conflictReason: reason } });
      fresh.push(`${r.reference} ${formatWhen(r.startAt, 'zh-HK')} ${r.patientName ?? ''}：${reason}`);
    } else if (!reason && ruleFlag) {
      await strapi.db.query(UID.reservation).update({ where: { id: r.id }, data: { conflict: false, conflictReason: null } });
    }
  }
  if (fresh.length) await alertAdmin(`${fresh.length} 個預約受排期改動影響`, `以下預約已唔喺開放時間內，系統冇自動取消，請喺 Content Manager 用 conflict = true 搵出嚟處理：\n\n${fresh.join('\n')}`);
  return fresh.length;
}

// ---------------------------------------------------------------- clinic status for the front end

export async function clinicStatus() {
  const data = await loadScheduleData();
  const today = todayHK();
  const doctorIds = data.doctors.map((d) => d.documentId);
  const days = Array.from({ length: 8 }, (_, i) => {
    const day = today.plus({ days: i });
    const plans = (doctorIds.length ? doctorIds : [null]).map((id) => planDay(data.rules, day, id, null, data.holidays, data.settings.sessionMinutes));
    const open = union(plans.flatMap((p) => p.open));
    const holiday = plans.find((p) => p.status === 'HOLIDAY');
    return {
      date: day.toISODate(),
      weekday: day.weekday,
      open: open.map((r) => ({ start: r.start, end: r.end })),
      status: open.length ? 'OPEN' : holiday ? 'HOLIDAY' : 'CLOSED',
      labelZh: holiday?.reasonZh ?? null,
      labelEn: holiday?.reasonEn ?? null,
    };
  });

  // The usual week, for the hours table: weekly rules only, so a one-off closure or holiday
  // changes its own day (in `days`) without rewriting the whole table.
  const weeklyRules = data.rules.filter((r) => r.repeat === 'WEEKLY');
  const weekly: Record<number, { start: number; end: number }[]> = {};
  for (let i = 0; i < 7; i++) {
    const day = today.plus({ days: i });
    const plans = (doctorIds.length ? doctorIds : [null]).map((id) => planDay(weeklyRules, day, id, null, new Map(), data.settings.sessionMinutes));
    weekly[day.weekday] = union(plans.flatMap((p) => p.open)).map((r) => ({ start: r.start, end: r.end }));
  }
  const now = DateTime.now().setZone(ZONE);
  return { timezone: ZONE, now: now.toISO(), minuteOfDay: now.hour * 60 + now.minute, days, weekly, clinicPhone: data.settings.clinicPhone };
}

// ---------------------------------------------------------------- jobs

/** Holds that ran out: free them (the lock may already be inactive) and requeue any waitlist offer. */
export async function expireHolds(): Promise<number> {
  const rows = await strapi.db.query(UID.reservation).findMany({
    where: { bookingStatus: 'HELD', expiresAt: { $lt: new Date() }, source: 'PUBLIC' },
    select: ['documentId'],
    limit: 200,
  });
  for (const r of rows) {
    await runInternal(() => strapi.documents(UID.reservation).update({ documentId: r.documentId, data: { bookingStatus: 'EXPIRED' } as any }));
  }
  // Also catch holds the lock code marked EXPIRED directly, so their lock rows are inactive too.
  await strapi.db.connection.raw(
    `UPDATE booking_slot_lock l SET active = false FROM reservations r
      WHERE r.document_id = l.reservation_document_id AND l.active AND r.booking_status NOT IN ('HELD','CONFIRMED','ARRIVED','COMPLETED','NO_SHOW')`
  );
  return rows.length;
}

/** Abandoned public holds carry no patient data and only clutter the admin calendar, so they are removed after an hour. */
export async function purgeAbandonedHolds(): Promise<number> {
  const cutoff = new Date(Date.now() - 3_600_000);
  const rows = await strapi.db.query(UID.reservation).findMany({
    where: { bookingStatus: { $in: ['EXPIRED', 'RELEASED'] }, source: 'PUBLIC', updatedAt: { $lt: cutoff } },
    select: ['id', 'documentId'],
    limit: 500,
  });
  if (!rows.length) return 0;
  await strapi.db.connection.raw('DELETE FROM booking_slot_lock WHERE reservation_document_id = ANY(?) AND NOT active', [rows.map((r: Row) => r.documentId)]);
  await strapi.db.query(UID.reservation).deleteMany({ where: { id: { $in: rows.map((r: Row) => r.id) } } });
  return rows.length;
}

export async function sendReminders(): Promise<number> {
  const from = new Date(Date.now() + 23 * 3_600_000);
  const to = new Date(Date.now() + 24 * 3_600_000);
  const rows = await strapi.db.query(UID.reservation).findMany({
    where: { kind: 'APPOINTMENT', bookingStatus: 'CONFIRMED', startAt: { $gte: from, $lt: to }, reminderSentAt: null },
    populate: ['doctor', 'service'],
  });
  const { settings } = await loadScheduleData();
  for (const r of rows) {
    const token = newToken();
    const locale = r.language || 'zh-HK';
    await strapi.db.transaction(async () => {
      await strapi.db.query(UID.reservation).update({ where: { id: r.id }, data: { reminderSentAt: new Date(), manageTokenHash: hashToken(token) } });
      await enqueue('REMINDER_24H', r.email, locale, {
        name: r.patientName,
        reference: r.reference,
        when: formatWhen(r.startAt, locale),
        doctor: locale === 'en' ? r.doctor?.nameEn : r.doctor?.nameZh,
        service: locale === 'en' ? r.service?.nameEn : r.service?.nameZh,
        manageUrl: manageUrl(token),
        clinicPhone: settings.clinicPhone,
      }, r.reference);
    });
  }
  return rows.length;
}

const HOLIDAY_FEED = 'https://www.1823.gov.hk/common/ical';

async function fetchFeed(lang: 'tc' | 'en'): Promise<Map<string, string>> {
  const res = await fetch(`${HOLIDAY_FEED}/${lang}.json`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`1823 ${lang}: HTTP ${res.status}`);
  const json = JSON.parse((await res.text()).replace(/^﻿/, ''));
  const events: { dtstart: [string]; summary: string }[] = json.vcalendar?.[0]?.vevent ?? [];
  return new Map(events.map((e) => [`${e.dtstart[0].slice(0, 4)}-${e.dtstart[0].slice(4, 6)}-${e.dtstart[0].slice(6, 8)}`, e.summary]));
}

/** Hong Kong public holidays from 1823 into public-holiday; days already there are left alone. */
export async function importHolidays(): Promise<{ added: number; total: number }> {
  const [zh, en] = await Promise.all([fetchFeed('tc'), fetchFeed('en')]);
  const existing = new Set((await strapi.db.query(UID.holiday).findMany({ select: ['date'] })).map((h: Row) => h.date));
  let added = 0;
  for (const [date, nameZh] of zh) {
    if (existing.has(date)) continue;
    await strapi.documents(UID.holiday).create({ data: { date, nameZh, nameEn: en.get(date) ?? nameZh } as any });
    added++;
  }
  if (added) scheduleConflictScan();
  return { added, total: zh.size };
}
