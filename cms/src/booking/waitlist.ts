import { DateTime } from 'luxon';
import { errors } from '@strapi/utils';
import { loadScheduleData } from './data';
import { busyByDoctor, isSlotTaken } from './lock';
import { alertAdmin, enqueue, leaveUrl, offerUrl } from './notify';
import { confirmReservation, scheduleWaitlistMatch, validatePatient } from './reservations';
import { ZONE, availableSlots, hkDay, planDay } from './schedule';
import {
  ACTIVE_STATUSES,
  BookingError,
  UID,
  formatWhen,
  hashToken,
  newToken,
  normalizeEmail,
  normalizePhone,
  runInternal,
  todayHK,
} from './util';

type Row = Record<string, any>;

/** Offers are only made for times at least this far away, so the patient has time to read the email. */
const MIN_OFFER_LEAD_MS = 3 * 3_600_000;

const fail = (msg: string) => {
  throw new errors.ApplicationError(msg);
};

// ---------------------------------------------------------------- admin adds / edits an entry (plan.md §7.1)

export async function waitlistWrite(context: any, next: () => Promise<any>) {
  const creating = context.action === 'create';
  let shouldMatch = false;
  const result = await strapi.db.transaction(async () => {
    const out = await next();
    const e = await strapi.db.query(UID.waitlist).findOne({
      where: { documentId: out.documentId },
      populate: ['service', 'doctor', 'replacesReservation'],
    });
    const { settings } = await loadScheduleData();
    const today = todayHK().toISODate()!;
    const last = todayHK().plus({ days: settings.bookingHorizonDays }).toISODate()!;

    if (!e.service) fail('請揀服務 · Choose a service');
    if (e.dateFrom > e.dateTo) fail('開始日期要早過完結日期 · The start date must be before the end date');
    if (creating && e.dateTo < today) fail('完結日期唔可以係過去 · The end date is in the past');
    if (e.dateTo > last) fail(`完結日期唔可以超過 ${last} · The end date is beyond the booking window`);
    const phone = normalizePhone(e.phone);
    const email = normalizeEmail(e.email);
    if (!phone) fail('電話號碼格式唔啱 · Phone number is not valid');
    if (!email) fail('電郵格式唔啱 · Email is not valid');

    if (['ACTIVE', 'OFFERED'].includes(e.queueStatus)) {
      const clash = await strapi.db.query(UID.waitlist).count({
        where: {
          documentId: { $ne: e.documentId },
          queueStatus: { $in: ['ACTIVE', 'OFFERED'] },
          service: { documentId: e.service.documentId },
          dateFrom: { $lte: e.dateTo },
          dateTo: { $gte: e.dateFrom },
          $or: [{ phoneNormalized: phone }, { emailNormalized: email }],
        },
      });
      if (clash) fail('呢位病人已經喺同一服務、重疊日子嘅輪候名單 · This patient is already waiting for this service on these dates');
    }

    const derived: Row = { phoneNormalized: phone, emailNormalized: email };
    if (!e.queuedAt) derived.queuedAt = new Date();
    let token: string | null = null;
    if (creating) {
      token = newToken();
      derived.manageTokenHash = hashToken(token);
      if (!e.replacesReservation) {
        const existing = await strapi.db.query(UID.reservation).count({
          where: {
            bookingStatus: 'CONFIRMED',
            startAt: { $gt: new Date() },
            service: { documentId: e.service.documentId },
            $or: [{ phoneNormalized: phone }, { emailNormalized: email }],
          },
        });
        if (existing) derived.note = [e.note, '⚠ 呢位病人已經有同一服務嘅預約；想改早嘅話請喺 replacesReservation 揀返嗰個預約。'].filter(Boolean).join('\n');
      }
    }
    await strapi.db.query(UID.waitlist).update({ where: { id: e.id }, data: derived });

    if (token) {
      const locale = e.language || 'zh-HK';
      await enqueue('WAITLIST_JOINED', email, locale, {
        name: e.name,
        service: locale === 'en' ? e.service.nameEn : e.service.nameZh,
        leaveUrl: leaveUrl(e.documentId, token),
      });
    }
    shouldMatch = e.queueStatus === 'ACTIVE';
    return out;
  });
  if (shouldMatch) scheduleWaitlistMatch();
  return result;
}

// ---------------------------------------------------------------- matching (plan.md §7.2)

const inPreferredTime = (start: number, pref: string) => {
  const hour = DateTime.fromMillis(start, { zone: ZONE }).hour;
  return pref === 'MORNING' ? hour < 13 : pref === 'AFTERNOON' ? hour >= 13 : true;
};

const skipKey = (doctorId: string, start: number) => `${doctorId}|${new Date(start).toISOString()}`;

async function findOffer(e: Row) {
  const data = await loadScheduleData();
  const service = data.services.find((s) => s.documentId === e.service?.documentId);
  if (!service) return null;
  const doctors = data.doctors.filter((d) => (e.doctor ? d.documentId === e.doctor.documentId : service.doctorIds.includes(d.documentId)));
  if (!doctors.length) return null;

  const today = todayHK();
  const from = DateTime.max(today, hkDay(e.dateFrom));
  const to = DateTime.min(hkDay(e.dateTo), today.plus({ days: data.settings.bookingHorizonDays }));
  if (to < from) return null;

  const now = Date.now();
  const skipped = new Set<string>(Array.isArray(e.skippedPeriods) ? e.skippedPeriods : []);
  const replaces = e.replacesReservation && ACTIVE_STATUSES.includes(e.replacesReservation.bookingStatus) ? e.replacesReservation : null;
  const before = replaces ? new Date(replaces.startAt).getTime() : Infinity;
  const busy = await busyByDoctor(doctors.map((d) => d.documentId), from.toJSDate(), to.plus({ days: 1 }).toJSDate());

  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    let best: { doctor: (typeof doctors)[number]; slot: { start: number; end: number; blockedUntil: number } } | null = null;
    for (const doctor of doctors) {
      const plan = planDay(data.rules, day, doctor.documentId, service.documentId, data.holidays, data.settings.sessionMinutes);
      const doctorBusy = busy.get(doctor.documentId) ?? [];
      const bookedCount = doctorBusy.filter((b) => b.kind === 'BOOKED' && b.start >= day.toMillis() && b.start < day.plus({ days: 1 }).toMillis()).length;
      const slot = availableSlots({ plan, day, durationMin: service.durationMin, bufferMin: service.bufferMin, busy: doctorBusy, bookedCount, now, minLeadTimeMin: data.settings.minLeadTimeMin }).find(
        (s) => s.start >= now + MIN_OFFER_LEAD_MS && s.start < before && inPreferredTime(s.start, e.preferredTime) && !skipped.has(skipKey(doctor.documentId, s.start))
      );
      if (slot && (!best || slot.start < best.slot.start)) best = { doctor, slot };
    }
    if (best) return { ...best, service, settings: data.settings, replaces };
  }
  return null;
}

async function offerTo(e: Row): Promise<boolean> {
  const found = await findOffer(e);
  if (!found) return false;
  const { doctor, slot, service, settings, replaces } = found;
  const token = newToken();
  const expiresAt = new Date(Date.now() + settings.waitlistOfferMinutes * 60_000);
  const locale = e.language || 'zh-HK';
  try {
    await runInternal(() =>
      strapi.db.transaction(async () => {
        const hold = await strapi.documents(UID.reservation).create({
          data: {
            doctor: doctor.documentId,
            service: service.documentId,
            startAt: new Date(slot.start),
            endAt: new Date(slot.end),
            blockedUntil: new Date(slot.blockedUntil),
            kind: 'APPOINTMENT',
            bookingStatus: 'HELD',
            source: 'WAITLIST',
            expiresAt,
            patientName: e.name,
            phone: e.phone,
            email: e.email,
            language: locale,
          } as any,
        });
        const holdRow = await strapi.db.query(UID.reservation).findOne({ where: { documentId: hold.documentId } });
        await strapi.db.query(UID.waitlist).update({
          where: { id: e.id },
          data: { queueStatus: 'OFFERED', offerReservation: holdRow.id, offerTokenHash: hashToken(token), offerExpiresAt: expiresAt },
        });
        await enqueue('WAITLIST_OFFER', e.email, locale, {
          name: e.name,
          when: formatWhen(slot.start, locale),
          doctor: locale === 'en' ? doctor.nameEn : doctor.nameZh,
          service: locale === 'en' ? service.nameEn : service.nameZh,
          expires: formatWhen(expiresAt, locale),
          offerUrl: offerUrl(token),
          message: replaces
            ? locale === 'en'
              ? `If you accept, your current booking on ${formatWhen(replaces.startAt, locale)} will be cancelled automatically.`
              : `確認後，你原本 ${formatWhen(replaces.startAt, locale)} 的預約會自動取消。`
            : undefined,
          clinicPhone: settings.clinicPhone,
        });
      })
    );
    return true;
  } catch (err) {
    if (!isSlotTaken(err)) strapi.log.warn(`[waitlist] offer failed for entry ${e.id}: ${(err as Error).message}`);
    return false;
  }
}

let running: Promise<number> | null = null;

/** Offers free time to waiting patients in queue order. Runs one at a time. */
export function matchWaitlist(opts: { entryId?: string } = {}): Promise<number> {
  if (running) return running;
  running = (async () => {
    const entries = await strapi.db.query(UID.waitlist).findMany({
      where: { queueStatus: 'ACTIVE', dateTo: { $gte: todayHK().toISODate() }, ...(opts.entryId ? { documentId: opts.entryId } : {}) },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      populate: ['service', 'doctor', 'replacesReservation'],
    });
    if (!entries.length) return 0;
    const offered = await strapi.db.query(UID.waitlist).findMany({ where: { queueStatus: 'OFFERED' }, select: ['phoneNormalized'] });
    const busyPhones = new Set(offered.map((o: Row) => o.phoneNormalized));
    let made = 0;
    for (const e of entries) {
      if (busyPhones.has(e.phoneNormalized)) continue;
      if (await offerTo(e)) {
        busyPhones.add(e.phoneNormalized);
        made++;
      }
    }
    return made;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Unanswered offers: the patient goes to the back of the queue, and stops after waitlistMaxOffers. */
export async function expireOffers(): Promise<number> {
  const { settings } = await loadScheduleData();
  const stale = await strapi.db.query(UID.waitlist).findMany({
    where: { queueStatus: 'OFFERED', offerExpiresAt: { $lt: new Date() } },
    populate: ['offerReservation', 'service'],
  });
  for (const e of stale) {
    const hold = e.offerReservation;
    if (hold?.bookingStatus === 'HELD') {
      await runInternal(() => strapi.documents(UID.reservation).update({ documentId: hold.documentId, data: { bookingStatus: 'EXPIRED' } as any }));
    }
    const offerCount = (e.offerCount ?? 0) + 1;
    const skipped = [...(Array.isArray(e.skippedPeriods) ? e.skippedPeriods : [])];
    if (hold) skipped.push(skipKey((await doctorOf(hold.documentId)) ?? '', new Date(hold.startAt).getTime()));
    const giveUp = offerCount >= settings.waitlistMaxOffers;
    await strapi.db.query(UID.waitlist).update({
      where: { id: e.id },
      data: {
        queueStatus: giveUp ? 'OFFER_EXPIRED' : 'ACTIVE',
        offerCount,
        skippedPeriods: skipped,
        queuedAt: giveUp ? e.queuedAt : new Date(),
        offerReservation: null,
        offerTokenHash: null,
        offerExpiresAt: null,
      },
    });
    if (giveUp) {
      await alertAdmin('輪候 offer 無人接', `${e.name}（${e.service?.nameZh ?? ''}）已經 ${offerCount} 次冇接 offer，已停止自動 offer，請跟進。`);
    }
  }
  if (stale.length) scheduleWaitlistMatch();
  return stale.length;
}

async function doctorOf(reservationDocumentId: string): Promise<string | null> {
  const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId: reservationDocumentId }, populate: ['doctor'] });
  return r?.doctor?.documentId ?? null;
}

export async function expireOldEntries(): Promise<number> {
  const today = todayHK().toISODate();
  const old = await strapi.db.query(UID.waitlist).findMany({ where: { queueStatus: { $in: ['ACTIVE', 'OFFERED'] }, dateTo: { $lt: today } }, populate: ['offerReservation'] });
  for (const e of old) {
    if (e.offerReservation?.bookingStatus === 'HELD') {
      await runInternal(() => strapi.documents(UID.reservation).update({ documentId: e.offerReservation.documentId, data: { bookingStatus: 'RELEASED' } as any }));
    }
    await strapi.db.query(UID.waitlist).update({ where: { id: e.id }, data: { queueStatus: 'EXPIRED' } });
  }
  return old.length;
}

// ---------------------------------------------------------------- patient side of an offer

async function entryByOfferToken(token: string) {
  if (!token) throw new BookingError('NOT_FOUND', 404);
  const e = await strapi.db.query(UID.waitlist).findOne({
    where: { offerTokenHash: hashToken(token) },
    populate: { offerReservation: { populate: ['doctor', 'service'] }, replacesReservation: true, service: true },
  });
  if (!e) throw new BookingError('NOT_FOUND', 404);
  return e;
}

export async function viewOffer(token: string) {
  const e = await entryByOfferToken(token);
  const r = e.offerReservation;
  const valid = e.queueStatus === 'OFFERED' && r?.bookingStatus === 'HELD' && new Date(r.expiresAt).getTime() > Date.now();
  return {
    status: e.queueStatus === 'BOOKED' ? 'BOOKED' : valid ? 'OPEN' : 'EXPIRED',
    name: e.name,
    language: e.language,
    startAt: r ? new Date(r.startAt).toISOString() : null,
    endAt: r ? new Date(r.endAt).toISOString() : null,
    expiresAt: r?.expiresAt ? new Date(r.expiresAt).toISOString() : null,
    serverNow: new Date().toISOString(),
    doctorZh: r?.doctor?.nameZh,
    doctorEn: r?.doctor?.nameEn,
    serviceZh: r?.service?.nameZh ?? e.service?.nameZh,
    serviceEn: r?.service?.nameEn ?? e.service?.nameEn,
    reference: r?.reference,
    replacesStartAt: e.replacesReservation && ACTIVE_STATUSES.includes(e.replacesReservation.bookingStatus) ? new Date(e.replacesReservation.startAt).toISOString() : null,
  };
}

export async function acceptOffer(token: string) {
  const e = await entryByOfferToken(token);
  const r = e.offerReservation;
  if (e.queueStatus !== 'OFFERED' || r?.bookingStatus !== 'HELD' || new Date(r.expiresAt).getTime() <= Date.now()) {
    throw new BookingError('HOLD_EXPIRED', 410);
  }
  const patient = validatePatient({ name: e.name, phone: e.phone, email: e.email, locale: e.language, consent: true });
  const replaces = e.replacesReservation && ACTIVE_STATUSES.includes(e.replacesReservation.bookingStatus) ? e.replacesReservation.documentId : null;
  const booked = await confirmReservation(r.documentId, patient, { replaces });
  await strapi.db.query(UID.waitlist).update({ where: { id: e.id }, data: { queueStatus: 'BOOKED', offerTokenHash: null } });
  return booked;
}

export async function leaveWaitlist(documentId: string, token: string) {
  const e = await strapi.db.query(UID.waitlist).findOne({ where: { documentId }, populate: ['offerReservation'] });
  if (!e || !token || e.manageTokenHash !== hashToken(token)) throw new BookingError('NOT_FOUND', 404);
  if (['ACTIVE', 'OFFERED'].includes(e.queueStatus)) {
    if (e.offerReservation?.bookingStatus === 'HELD') {
      await runInternal(() => strapi.documents(UID.reservation).update({ documentId: e.offerReservation.documentId, data: { bookingStatus: 'RELEASED' } as any }));
    }
    await strapi.db.query(UID.waitlist).update({ where: { id: e.id }, data: { queueStatus: 'CANCELLED' } });
  }
  return { status: 'CANCELLED', name: e.name };
}
