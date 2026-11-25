import { DateTime } from 'luxon';
import { errors } from '@strapi/utils';
import { loadScheduleData, type Doctor, type ScheduleData, type Service, type Settings } from './data';
import { busyByDoctor, isSlotTaken, syncLock } from './lock';
import { enqueue, manageUrl, sentRecently } from './notify';
import { ZONE, availableSlots, hkDay, planDay, type Slot } from './schedule';
import {
  ACTIVE_STATUSES,
  BookingError,
  UID,
  formatWhen,
  hashToken,
  isInternal,
  newReference,
  newToken,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  runInternal,
  todayHK,
} from './util';

type Row = Record<string, any>;

// ---------------------------------------------------------------- availability (plan.md §4)

const MAX_RANGE_DAYS = 62;

function bookedOn(busy: { start: number; kind: string }[], day: DateTime) {
  const s = day.toMillis();
  const e = day.plus({ days: 1 }).toMillis();
  return busy.filter((b) => b.kind === 'BOOKED' && b.start >= s && b.start < e).length;
}

interface DoctorDay {
  doctor: Doctor;
  slots: Slot[];
  bookedCount: number;
}

function doctorDay(data: ScheduleData, service: Service, doctor: Doctor, day: DateTime, busy: Map<string, any[]>, now: number) {
  const plan = planDay(data.rules, day, doctor.documentId, service.documentId, data.holidays, data.settings.sessionMinutes);
  const doctorBusy = busy.get(doctor.documentId) ?? [];
  const bookedCount = bookedOn(doctorBusy, day);
  const base = { plan, day, durationMin: service.durationMin, bufferMin: service.bufferMin, now, minLeadTimeMin: data.settings.minLeadTimeMin };
  return {
    plan,
    bookedCount,
    slots: availableSlots({ ...base, busy: doctorBusy, bookedCount }),
    unbooked: availableSlots({ ...base, busy: [], bookedCount: 0 }),
  };
}

function resolveService(data: ScheduleData, slug: string): Service {
  const service = data.services.find((s) => s.slug === slug);
  if (!service) throw new BookingError('INVALID_SERVICE', 400);
  return service;
}

function resolveDoctors(data: ScheduleData, service: Service, doctorSlug?: string | null): Doctor[] {
  let doctors = data.doctors.filter((d) => service.doctorIds.includes(d.documentId));
  if (doctorSlug && doctorSlug !== 'any') {
    doctors = doctors.filter((d) => d.slug === doctorSlug);
    if (!doctors.length) throw new BookingError('INVALID_DOCTOR', 400);
  }
  return doctors;
}

export async function availability(q: { service: string; doctor?: string; from?: string; to?: string }) {
  const data = await loadScheduleData();
  const service = resolveService(data, q.service);
  const doctors = resolveDoctors(data, service, q.doctor);
  const today = todayHK();
  const last = today.plus({ days: data.settings.bookingHorizonDays });
  let from = q.from ? hkDay(q.from) : today;
  if (!from.isValid || from < today) from = today;
  let to = q.to ? hkDay(q.to) : from.plus({ days: 13 });
  if (!to.isValid || to > last) to = last;
  if (to.diff(from, 'days').days > MAX_RANGE_DAYS) to = from.plus({ days: MAX_RANGE_DAYS });

  const busy = await busyByDoctor(
    doctors.map((d) => d.documentId),
    from.toJSDate(),
    to.plus({ days: 1 }).toJSDate()
  );
  const now = Date.now();
  const days = [];
  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    const perDoctor = doctors.map((d) => ({ doctor: d, ...doctorDay(data, service, d, day, busy, now) }));
    const bySlot = new Map<number, { start: number; end: number; doctors: string[] }>();
    for (const pd of perDoctor) {
      for (const s of pd.slots) {
        const entry = bySlot.get(s.start) ?? { start: s.start, end: s.end, doctors: [] };
        entry.doctors.push(pd.doctor.slug);
        bySlot.set(s.start, entry);
      }
    }
    const slots = [...bySlot.values()]
      .sort((a, b) => a.start - b.start)
      .map((s) => ({
        start: new Date(s.start).toISOString(),
        end: new Date(s.end).toISOString(),
        time: DateTime.fromMillis(s.start, { zone: ZONE }).toFormat('HH:mm'),
        endTime: DateTime.fromMillis(s.end, { zone: ZONE }).toFormat('HH:mm'),
        doctors: s.doctors,
      }));
    const holiday = perDoctor.find((pd) => pd.plan.status === 'HOLIDAY')?.plan;
    const couldOpen = perDoctor.some((pd) => pd.unbooked.length > 0);
    const status = slots.length ? 'OPEN' : couldOpen ? 'FULL' : holiday ? 'HOLIDAY' : 'CLOSED';
    days.push({
      date: day.toISODate(),
      status,
      ...(status === 'HOLIDAY' ? { labelZh: holiday?.reasonZh, labelEn: holiday?.reasonEn } : {}),
      sessionMinutes: perDoctor[0]?.plan.sessionMinutes ?? data.settings.sessionMinutes,
      slots,
    });
  }
  return {
    timezone: ZONE,
    service: { slug: service.slug, nameZh: service.nameZh, nameEn: service.nameEn, durationMin: service.durationMin },
    doctors: doctors.map((d) => ({ slug: d.slug, nameZh: d.nameZh, nameEn: d.nameEn })),
    holdMinutes: data.settings.holdMinutes,
    days,
  };
}

export async function listServices() {
  const data = await loadScheduleData();
  return {
    services: data.services
      .filter((s) => s.doctorIds.length)
      .map((s) => ({ slug: s.slug, nameZh: s.nameZh, nameEn: s.nameEn, durationMin: s.durationMin, doctors: data.doctors.filter((d) => s.doctorIds.includes(d.documentId)).map((d) => d.slug) })),
    doctors: data.doctors.map((d) => ({ slug: d.slug, nameZh: d.nameZh, nameEn: d.nameEn })),
  };
}

// ---------------------------------------------------------------- holds (plan.md §5)

/** Doctors to try for a hold: the chosen one, or for "any doctor" the least booked that day first. */
async function holdCandidates(data: ScheduleData, service: Service, doctorSlug: string | undefined, start: DateTime) {
  const doctors = resolveDoctors(data, service, doctorSlug);
  const day = start.startOf('day');
  const busy = await busyByDoctor(doctors.map((d) => d.documentId), day.toJSDate(), day.plus({ days: 1 }).toJSDate());
  const now = Date.now();
  return doctors
    .map((d) => {
      const dd = doctorDay(data, service, d, day, busy, now);
      return { doctor: d, slot: dd.slots.find((s) => s.start === start.toMillis()), bookedCount: dd.bookedCount };
    })
    .filter((c): c is DoctorDay & { doctor: Doctor; slot: Slot; bookedCount: number } => Boolean(c.slot))
    .sort((a, b) => a.bookedCount - b.bookedCount || a.doctor.sortOrder - b.doctor.sortOrder);
}

export async function releaseHold(id: string, token: string): Promise<boolean> {
  const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId: id } });
  if (!r || r.bookingStatus !== 'HELD' || r.holdTokenHash !== hashToken(token)) return false;
  await runInternal(() => strapi.documents(UID.reservation).update({ documentId: id, data: { bookingStatus: 'RELEASED' } as any }));
  return true;
}

export interface HoldInput {
  service: string;
  doctor?: string;
  startAt: string;
  previousHoldId?: string;
  previousHoldToken?: string;
}

export async function createHold(input: HoldInput) {
  const data = await loadScheduleData();
  const service = resolveService(data, input.service);
  const start = DateTime.fromISO(input.startAt, { zone: ZONE });
  if (!start.isValid) throw new BookingError('INVALID_TIME', 400);

  if (input.previousHoldId && input.previousHoldToken) await releaseHold(input.previousHoldId, input.previousHoldToken);

  const candidates = await holdCandidates(data, service, input.doctor, start);
  if (!candidates.length) throw new BookingError('SLOT_TAKEN', 409);

  for (const c of candidates) {
    const token = newToken();
    const expiresAt = new Date(Date.now() + data.settings.holdMinutes * 60_000);
    try {
      const doc = await runInternal(() =>
        strapi.documents(UID.reservation).create({
          data: {
            doctor: c.doctor.documentId,
            service: service.documentId,
            startAt: new Date(c.slot.start),
            endAt: new Date(c.slot.end),
            blockedUntil: new Date(c.slot.blockedUntil),
            kind: 'APPOINTMENT',
            bookingStatus: 'HELD',
            source: 'PUBLIC',
            expiresAt,
            holdTokenHash: hashToken(token),
            notifyPatient: true,
          } as any,
        })
      );
      return {
        holdId: doc.documentId,
        holdToken: token,
        startAt: new Date(c.slot.start).toISOString(),
        endAt: new Date(c.slot.end).toISOString(),
        expiresAt: expiresAt.toISOString(),
        serverNow: new Date().toISOString(),
        doctor: { slug: c.doctor.slug, nameZh: c.doctor.nameZh, nameEn: c.doctor.nameEn },
        service: { slug: service.slug, nameZh: service.nameZh, nameEn: service.nameEn },
      };
    } catch (err) {
      if (isSlotTaken(err)) continue;
      throw err;
    }
  }
  throw new BookingError('SLOT_TAKEN', 409);
}

// ---------------------------------------------------------------- duplicate rules (plan.md §5.6)

export interface Contact {
  phone: string | null;
  email: string | null;
  name: string | null;
}

/** Returns which rule a new booking would break, or null. Must run inside a transaction. */
export async function duplicateViolation(
  trx: any,
  settings: Settings,
  who: Contact,
  booking: { serviceId: string; startAt: Date; blockedUntil: Date },
  exclude: string[]
): Promise<'R1' | 'R2' | 'R3' | null> {
  const keys = [who.phone && `phone:${who.phone}`, who.email && `email:${who.email}`].filter(Boolean).sort() as string[];
  for (const key of keys) await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [key]);

  const or: Row[] = [];
  if (who.phone) or.push({ phoneNormalized: who.phone });
  if (who.email) or.push({ emailNormalized: who.email });
  if (!or.length) return null;

  const existing = await strapi.db.query(UID.reservation).findMany({
    where: {
      kind: 'APPOINTMENT',
      bookingStatus: { $in: ['CONFIRMED', 'ARRIVED'] },
      startAt: { $gt: new Date() },
      documentId: { $notIn: exclude.length ? exclude : ['-'] },
      $or: or,
    },
    populate: ['service'],
  });
  const samePerson = existing.filter((r: Row) => !who.name || !r.patientNameNormalized || r.patientNameNormalized === who.name);
  if (samePerson.some((r: Row) => new Date(r.startAt) < booking.blockedUntil && new Date(r.blockedUntil) > booking.startAt)) return 'R3';
  if (samePerson.filter((r: Row) => r.service?.documentId === booking.serviceId).length >= settings.maxSameServiceBookings) return 'R1';
  if (existing.length >= settings.maxActiveBookingsPerContact) return 'R2';
  return null;
}

/** Tells the owner of the existing booking (at their registered email) instead of showing anything on screen. */
export async function remindExistingBooking(who: Contact, locale: string) {
  if (!who.email || (await sentRecently('EXISTING_BOOKING_REMINDER', who.email, 60))) return;
  const existing = await strapi.db.query(UID.reservation).findOne({
    where: { emailNormalized: who.email, bookingStatus: 'CONFIRMED', startAt: { $gt: new Date() } },
    orderBy: { startAt: 'asc' },
  });
  if (!existing) return;
  const token = newToken();
  await strapi.db.query(UID.reservation).update({ where: { id: existing.id }, data: { manageTokenHash: hashToken(token) } });
  await enqueue('EXISTING_BOOKING_REMINDER', existing.email, existing.language || locale, { name: existing.patientName, manageUrl: manageUrl(token) }, existing.reference);
}

// ---------------------------------------------------------------- confirm

export interface PatientInput {
  name?: string;
  phone?: string;
  email?: string;
  note?: string;
  locale?: string;
  consent?: boolean;
}

export function validatePatient(p: PatientInput) {
  const fields: Record<string, string> = {};
  const name = p.name?.trim();
  const phone = normalizePhone(p.phone);
  const email = normalizeEmail(p.email);
  if (!name) fields.name = 'REQUIRED';
  if (!phone) fields.phone = 'INVALID';
  if (!email) fields.email = 'INVALID';
  if (!p.consent) fields.consent = 'REQUIRED';
  if (Object.keys(fields).length) throw new BookingError('VALIDATION', 400, { fields });
  return { name: name!, phone: phone!, email: email!, locale: p.locale === 'en' ? 'en' : 'zh-HK', note: p.note?.trim().slice(0, 1000) || null };
}

async function summary(r: Row, locale: string) {
  const en = locale === 'en';
  return {
    reference: r.reference,
    startAt: new Date(r.startAt).toISOString(),
    endAt: new Date(r.endAt).toISOString(),
    when: formatWhen(r.startAt, locale),
    doctor: en ? r.doctor?.nameEn : r.doctor?.nameZh,
    service: en ? r.service?.nameEn : r.service?.nameZh,
  };
}

/** Turns a still-valid hold into a confirmed booking. Shared by the public form and waitlist offers. */
export async function confirmReservation(
  documentId: string,
  patient: ReturnType<typeof validatePatient>,
  opts: { idempotencyKey?: string; replaces?: string | null } = {}
) {
  const data = await loadScheduleData();
  const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId }, populate: ['doctor', 'service'] });
  if (!r) throw new BookingError('HOLD_NOT_FOUND', 404);
  const who: Contact = { phone: patient.phone, email: patient.email, name: normalizeName(patient.name) };
  const manageToken = newToken();

  let violation: string | null = null;
  try {
    await runInternal(() =>
      strapi.db.transaction(async ({ trx }) => {
        violation = await duplicateViolation(
          trx,
          data.settings,
          who,
          { serviceId: r.service?.documentId, startAt: new Date(r.startAt), blockedUntil: new Date(r.blockedUntil) },
          [documentId, ...(opts.replaces ? [opts.replaces] : [])]
        );
        if (violation) throw new BookingError('DUPLICATE_BOOKING', 409);

        const claimed = await trx.raw(
          `UPDATE booking_slot_lock SET kind = 'BOOKED', expires_at = NULL
            WHERE reservation_document_id = ? AND kind = 'HOLD' AND active AND expires_at > now()
            RETURNING 1`,
          [documentId]
        );
        if (!claimed.rows.length) throw new BookingError('HOLD_EXPIRED', 410);

        await strapi.documents(UID.reservation).update({
          documentId,
          data: {
            bookingStatus: 'CONFIRMED',
            expiresAt: null,
            patientName: patient.name,
            phone: patient.phone,
            email: patient.email,
            language: patient.locale,
            patientNote: patient.note,
            manageTokenHash: hashToken(manageToken),
            idempotencyKey: opts.idempotencyKey ?? null,
          } as any,
        });

        let oldWhen: string | undefined;
        if (opts.replaces) {
          const old = await strapi.db.query(UID.reservation).findOne({ where: { documentId: opts.replaces } });
          if (old && ACTIVE_STATUSES.includes(old.bookingStatus)) {
            oldWhen = formatWhen(old.startAt, patient.locale);
            await strapi.documents(UID.reservation).update({
              documentId: opts.replaces,
              data: { bookingStatus: 'CANCELLED', cancelReason: patient.locale === 'en' ? 'Moved through the waiting list' : '經輪候改期' } as any,
            });
          }
        }

        const vars = {
          name: patient.name,
          reference: r.reference,
          when: formatWhen(r.startAt, patient.locale),
          oldWhen,
          doctor: patient.locale === 'en' ? r.doctor?.nameEn : r.doctor?.nameZh,
          service: patient.locale === 'en' ? r.service?.nameEn : r.service?.nameZh,
          manageUrl: manageUrl(manageToken),
          clinicPhone: data.settings.clinicPhone,
        };
        await enqueue(opts.replaces ? 'BOOKING_RESCHEDULED' : 'BOOKING_CONFIRMED', patient.email, patient.locale, vars, r.reference);
      })
    );
  } catch (err) {
    if (violation) await remindExistingBooking(who, patient.locale).catch((e) => strapi.log.warn(`[booking] reminder failed: ${e.message}`));
    throw err;
  }

  return { ...(await summary(r, patient.locale)), manageToken };
}

export async function confirmHold(id: string, token: string, input: PatientInput, idempotencyKey?: string) {
  const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId: id }, populate: ['doctor', 'service'] });
  if (!r || r.holdTokenHash !== hashToken(token || '')) throw new BookingError('HOLD_NOT_FOUND', 404);
  // A repeated submit of the same form gets the same answer instead of an error.
  if (r.bookingStatus === 'CONFIRMED' && idempotencyKey && r.idempotencyKey === idempotencyKey) {
    return { ...(await summary(r, r.language)), manageToken: null };
  }
  if (r.bookingStatus !== 'HELD' || !r.expiresAt || new Date(r.expiresAt).getTime() <= Date.now()) throw new BookingError('HOLD_EXPIRED', 410);
  return confirmReservation(id, validatePatient(input), { idempotencyKey });
}

// ---------------------------------------------------------------- manage (patient self-service: view + cancel)

async function byManageToken(token: string) {
  if (!token) throw new BookingError('NOT_FOUND', 404);
  const r = await strapi.db.query(UID.reservation).findOne({ where: { manageTokenHash: hashToken(token) }, populate: ['doctor', 'service'] });
  if (!r) throw new BookingError('NOT_FOUND', 404);
  return r;
}

export async function viewBooking(token: string) {
  const r = await byManageToken(token);
  const { settings } = await loadScheduleData();
  const cutoff = new Date(r.startAt).getTime() - settings.cancelCutoffHours * 3_600_000;
  const upcoming = new Date(r.startAt).getTime() > Date.now();
  return {
    ...(await summary(r, r.language)),
    status: r.bookingStatus,
    patientName: r.patientName,
    doctorZh: r.doctor?.nameZh,
    doctorEn: r.doctor?.nameEn,
    serviceZh: r.service?.nameZh,
    serviceEn: r.service?.nameEn,
    canCancel: r.bookingStatus === 'CONFIRMED' && upcoming && Date.now() < cutoff,
    cancelCutoffHours: settings.cancelCutoffHours,
    clinicPhone: settings.clinicPhone,
  };
}

export async function cancelByPatient(token: string) {
  const r = await byManageToken(token);
  const { settings } = await loadScheduleData();
  if (r.bookingStatus !== 'CONFIRMED') throw new BookingError('NOT_CANCELLABLE', 409);
  if (Date.now() >= new Date(r.startAt).getTime() - settings.cancelCutoffHours * 3_600_000) throw new BookingError('CANCEL_CUTOFF', 409);
  await runInternal(() =>
    strapi.db.transaction(async () => {
      await strapi.documents(UID.reservation).update({
        documentId: r.documentId,
        data: { bookingStatus: 'CANCELLED', cancelReason: r.language === 'en' ? 'Cancelled by patient' : '病人自行取消' } as any,
      });
      await enqueue('BOOKING_CANCELLED', r.email, r.language, { name: r.patientName, reference: r.reference, when: formatWhen(r.startAt, r.language), clinicPhone: settings.clinicPhone }, r.reference);
    })
  );
  return viewBooking(token);
}

// ---------------------------------------------------------------- document middleware (plan.md §5.3)

const STATUS_ZH: Record<string, string> = {
  HELD: '保留中',
  CONFIRMED: '已確認',
  ARRIVED: '已到診',
  COMPLETED: '已完成',
  NO_SHOW: '缺席',
  EXPIRED: '已過期',
  RELEASED: '已釋放',
  CANCELLED: '已取消',
};
const GREY = '#9AA5A3';

function calendarFields(r: Row) {
  const time = DateTime.fromJSDate(new Date(r.startAt), { zone: ZONE }).toFormat('HH:mm');
  if (r.kind === 'BLOCK') {
    return { calendarTitle: `封時段 · ${r.doctor?.nameZh ?? ''}${r.internalNote ? ` · ${r.internalNote}` : ''}`, calendarColor: ACTIVE_STATUSES.includes(r.bookingStatus) ? '#3D5559' : GREY };
  }
  const status = STATUS_ZH[r.bookingStatus] ?? r.bookingStatus;
  const holdUntil = r.bookingStatus === 'HELD' && r.expiresAt ? `至 ${DateTime.fromJSDate(new Date(r.expiresAt), { zone: ZONE }).toFormat('HH:mm')}` : '';
  const parts = [`${status}${holdUntil}`, time, r.service?.nameZh, r.patientName, r.doctor?.nameZh].filter(Boolean);
  const color = ['CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(r.bookingStatus) ? r.doctor?.color || '#0F5C57' : r.bookingStatus === 'HELD' ? '#8A6D1F' : GREY;
  return { calendarTitle: parts.join(' · '), calendarColor: color };
}

const fail = (msg: string) => {
  throw new errors.ApplicationError(msg);
};

let matchScheduled = false;
/** Freed time is offered to the waiting list after the write has committed (plan.md §7.2). */
export function scheduleWaitlistMatch() {
  if (matchScheduled) return;
  matchScheduled = true;
  setTimeout(() => {
    matchScheduled = false;
    import('./waitlist')
      .then((w) => w.matchWaitlist())
      .catch((e) => strapi.log.error(`[waitlist] match failed: ${e.message}`));
  }, 200);
}

/** Wraps every reservation create/update: derived fields, validation, the lock row, notifications. */
export async function reservationWrite(context: any, next: () => Promise<any>) {
  const internal = isInternal();
  const before =
    context.action === 'update'
      ? await strapi.db.query(UID.reservation).findOne({ where: { documentId: context.params.documentId }, populate: ['doctor', 'service'] })
      : null;
  let freed = false;

  const result = await strapi.db.transaction(async ({ trx }) => {
    const out = await next();
    const r = await strapi.db.query(UID.reservation).findOne({ where: { documentId: out.documentId }, populate: ['doctor', 'service'] });
    const data = await loadScheduleData();

    if (!r.doctor) fail('請揀醫生 · Choose a dentist');
    if (r.kind === 'APPOINTMENT' && !r.service) fail('請揀服務 · Choose a service');
    if (r.kind === 'BLOCK' && !r.endAt) fail('封時段要填完結時間 · A block needs an end time');

    const derived: Row = {};
    const start = new Date(r.startAt);
    const timeChanged = !before || +new Date(before.startAt) !== +start || +new Date(before.endAt) !== +new Date(r.endAt) || before.doctor?.documentId !== r.doctor.documentId;
    if (!r.endAt) derived.endAt = new Date(start.getTime() + r.service.durationMin * 60_000);
    const end = new Date(derived.endAt ?? r.endAt);
    if (end <= start) fail('完結時間要遲過開始時間 · The end must be after the start');
    if (!r.blockedUntil || (!internal && timeChanged)) {
      derived.blockedUntil = new Date(end.getTime() + (r.kind === 'BLOCK' ? 0 : (r.service?.bufferMin ?? 0)) * 60_000);
    }
    if (!r.reference) derived.reference = newReference(start);
    derived.phoneNormalized = normalizePhone(r.phone);
    derived.emailNormalized = normalizeEmail(r.email);
    derived.patientNameNormalized = normalizeName(r.patientName);
    if (r.phone && !derived.phoneNormalized) fail('電話號碼格式唔啱 · Phone number is not valid');
    const merged = { ...r, ...derived };

    // Admin bookings: an overlapping booking for the same person is refused; R1 / R2 only warn (family members share phones).
    if (!internal && r.kind === 'APPOINTMENT' && ['CONFIRMED', 'ARRIVED'].includes(r.bookingStatus) && (merged.phoneNormalized || merged.emailNormalized)) {
      const who = { phone: merged.phoneNormalized, email: merged.emailNormalized, name: merged.patientNameNormalized };
      const v = await duplicateViolation(trx, data.settings, who, { serviceId: r.service.documentId, startAt: start, blockedUntil: new Date(merged.blockedUntil) }, [r.documentId]);
      if (v === 'R3') fail('呢位病人喺同一時間已經有另一個預約 · This patient already has a booking at this time');
      if (v && !before) derived.internalNote = [r.internalNote, `⚠ 同一電話 / 電郵已有其他預約（${v === 'R1' ? '同一服務' : '超過上限'}）`].filter(Boolean).join('\n');
    }

    Object.assign(derived, calendarFields({ ...merged, ...derived }));

    // Admin changes the patient should hear about. Booking-code writes send their own emails.
    const wantsMail = !internal && r.kind === 'APPOINTMENT' && r.notifyPatient && r.email;
    let mail: { type: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED'; token?: string } | null = null;
    if (wantsMail) {
      if (!before && r.bookingStatus === 'CONFIRMED') mail = { type: 'BOOKING_CONFIRMED', token: newToken() };
      else if (before && before.bookingStatus !== 'CANCELLED' && r.bookingStatus === 'CANCELLED') mail = { type: 'BOOKING_CANCELLED' };
      else if (before && r.bookingStatus === 'CONFIRMED' && timeChanged) mail = { type: 'BOOKING_RESCHEDULED', token: newToken() };
    }
    if (mail?.token) derived.manageTokenHash = hashToken(mail.token);

    await strapi.db.query(UID.reservation).update({ where: { id: r.id }, data: derived });
    const final = { ...merged, ...derived };
    await syncLock(trx, {
      documentId: r.documentId,
      doctorDocumentId: r.doctor.documentId,
      startAt: final.startAt,
      blockedUntil: final.blockedUntil,
      status: final.bookingStatus,
      kind: final.kind,
      expiresAt: final.expiresAt,
    });

    if (mail) {
      const locale = r.language || 'zh-HK';
      await enqueue(mail.type, r.email, locale, {
        name: r.patientName,
        reference: final.reference,
        when: formatWhen(final.startAt, locale),
        oldWhen: before ? formatWhen(before.startAt, locale) : undefined,
        doctor: locale === 'en' ? r.doctor.nameEn : r.doctor.nameZh,
        service: locale === 'en' ? r.service?.nameEn : r.service?.nameZh,
        manageUrl: mail.token ? manageUrl(mail.token) : undefined,
        reason: r.cancelReason ?? undefined,
        clinicPhone: data.settings.clinicPhone,
      }, final.reference);
    }

    if (!internal) {
      const user = strapi.requestContext.get()?.state?.user;
      await strapi.db.query(UID.audit).create({
        data: {
          actorType: 'ADMIN',
          actorId: user ? String(user.email ?? user.id) : null,
          action: `reservation.${context.action}`,
          target: final.reference,
          before: before ? { status: before.bookingStatus, startAt: before.startAt, doctor: before.doctor?.slug } : null,
          after: { status: final.bookingStatus, startAt: final.startAt, doctor: r.doctor.slug },
        },
      });
    }

    const wasActive = before && ACTIVE_STATUSES.includes(before.bookingStatus);
    freed = Boolean(wasActive && (!ACTIVE_STATUSES.includes(final.bookingStatus) || timeChanged));
    return out;
  });

  if (freed) scheduleWaitlistMatch();
  return result;
}
