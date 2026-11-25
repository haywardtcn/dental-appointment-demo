// End-to-end check of the demo against a running Strapi (plan.md §12):
// patient booking, manage and cancel, duplicates, admin edits through the Content Manager,
// admin actions, waitlist reschedule, schedule-rule conflicts, emergency close and the calendar feed.
// Start Strapi with BOOKING_RATE_LIMIT=off (it books more than 5 times a minute), then run:
//   node scripts/e2e-test.mjs   (each run uses new random patients and cleans up what it blocks)
const HOST = process.env.STRAPI_URL || 'http://localhost:1337';
const API = `${HOST}/api/booking`;
const CM = `${HOST}/content-manager`;
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'admin@clearlight.demo';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Clearlight2026';

let failed = 0;
const check = (name, ok, info = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? `  → ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 300)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const rand = () => Math.random().toString(36).slice(2, 7);
const person = () => {
  const id = rand();
  return { name: `測試${id}`, phone: `9${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, email: `e2e.${id}@example.com`, consent: true, locale: 'zh-HK' };
};

async function slotsFor(service, from, to) {
  const { data } = await http('GET', `${API}/availability?service=${service}&from=${from}&to=${to ?? from}`);
  return data.days.flatMap((d) => d.slots.map((s) => ({ ...s, date: d.date })));
}
const hkDate = (offsetDays) => new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function book(service, slot, who) {
  const hold = await http('POST', `${API}/holds`, { service, doctor: 'any', startAt: slot.start });
  if (hold.status !== 201) return { hold };
  const confirm = await http('POST', `${API}/holds/${hold.data.holdId}/confirm`, who, { 'x-hold-token': hold.data.holdToken, 'idempotency-key': rand() });
  return { hold, confirm };
}

// ------------------------------------------------------------------ admin session
const login = await http('POST', `${HOST}/admin/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
check('admin login', login.status === 200, login.data);
const A = { authorization: `Bearer ${login.data?.data?.token}` };
const cm = (method, path, body) => http(method, `${CM}${path}`, body, A);
const RES = '/collection-types/api::reservation.reservation';
const findRes = async (reference) => (await cm('GET', `${RES}?filters[reference][$eq]=${reference}`)).data?.results?.[0];

// ------------------------------------------------------------------ patient: book, view, cancel
const services = await http('GET', `${API}/services`);
check('public services list', services.status === 200 && services.data.services.length >= 5, services.data);

const p1 = person();
const day1 = (await slotsFor('checkup', hkDate(3), hkDate(10)))[0];
const b1 = await book('checkup', day1, p1);
check('patient hold → 201', b1.hold.status === 201, b1.hold.data);
check('patient confirm → reference', b1.confirm?.status === 201 && /^QG-/.test(b1.confirm.data.reference), b1.confirm?.data);
const ref1 = b1.confirm?.data.reference;
const manageToken = b1.confirm?.data.manageToken;

const again = await http('POST', `${API}/holds`, { service: 'checkup', startAt: day1.start });
check('same slot again → 409 SLOT_TAKEN', again.status === 409 && again.data.error.code === 'SLOT_TAKEN', again.data);

const view = await http('GET', `${API}/manage?token=${manageToken}`);
check('manage page shows the booking', view.status === 200 && view.data.reference === ref1 && view.data.status === 'CONFIRMED', view.data);

const dupSlot = (await slotsFor('checkup', hkDate(11), hkDate(20)))[0];
const dup = await book('checkup', dupSlot, { ...p1, email: `other.${rand()}@example.com` });
check('same person + service again → DUPLICATE_BOOKING', dup.confirm?.status === 409 && dup.confirm.data.error.code === 'DUPLICATE_BOOKING', dup.confirm?.data);
if (dup.hold.status === 201) await http('DELETE', `${API}/holds/${dup.hold.data.holdId}`, null, { 'x-hold-token': dup.hold.data.holdToken });

// ------------------------------------------------------------------ admin: Content Manager sees the booking
const r1 = await findRes(ref1);
check('CM list finds the booking', Boolean(r1), r1);
const r1Full = (await cm('GET', `${RES}/${r1?.documentId}`)).data?.data;
check('CM edit view has bookingStatus CONFIRMED', r1Full?.bookingStatus === 'CONFIRMED', r1Full && { bookingStatus: r1Full.bookingStatus });
check('CM edit view has calendar title', /已確認/.test(r1Full?.calendarTitle ?? ''), r1Full?.calendarTitle);

const del = await cm('DELETE', `${RES}/${r1?.documentId}`);
check('CM delete is refused', del.status === 400, del.data);

// ------------------------------------------------------------------ calendar feed
const range = `start=${hkDate(-1)}T00:00:00Z&end=${hkDate(30)}T00:00:00Z`;
const calAnon = await http('GET', `${HOST}/strapi-calendar?${range}`);
check('calendar feed without login → 401', calAnon.status === 401, calAnon.status);
const cal = await http('GET', `${HOST}/strapi-calendar?${range}`, null, A);
check('calendar feed shows the booking', cal.status === 200 && cal.data.some((e) => e.id === r1?.documentId), cal.status);

// ------------------------------------------------------------------ admin: phone booking, status actions, cancel
const doctors = (await cm('GET', '/collection-types/api::doctor.doctor')).data.results;
const svcList = (await cm('GET', '/collection-types/api::service.service')).data.results;
const svc = (slug) => svcList.find((s) => s.slug === slug).documentId;
const phoneSlot = (await slotsFor('family', hkDate(4), hkDate(12)))[1];
const p2 = person();
const phoneBooking = await cm('POST', RES, {
  startAt: phoneSlot.start,
  doctor: { connect: [{ documentId: doctors[0].documentId }] },
  service: { connect: [{ documentId: svc('family') }] },
  patientName: p2.name, phone: p2.phone, email: p2.email,
});
const pb = phoneBooking.data?.data;
check('CM phone booking created', phoneBooking.status === 200 || phoneBooking.status === 201, phoneBooking.data);
const pbFull = (await cm('GET', `${RES}/${pb?.documentId}`)).data?.data;
check('phone booking: defaults, reference, end time', pbFull?.bookingStatus === 'CONFIRMED' && /^QG-/.test(pbFull?.reference ?? '') && Boolean(pbFull?.endAt), pbFull && { s: pbFull.bookingStatus, ref: pbFull.reference, end: pbFull.endAt });

const overlap = await cm('POST', RES, {
  startAt: phoneSlot.start,
  doctor: { connect: [{ documentId: doctors[0].documentId }] },
  service: { connect: [{ documentId: svc('checkup') }] },
  patientName: 'overlap', phone: person().phone,
});
check('CM overlapping booking refused', overlap.status === 400 && overlap.data.error.details?.code === 'SLOT_TAKEN', overlap.data);

const arrived = await http('POST', `${HOST}/booking-admin/reservations/${pb?.documentId}/arrived`, {}, A);
check('action: mark arrived', arrived.status === 200 && arrived.data.status === 'ARRIVED', arrived.data);
const completed = await http('POST', `${HOST}/booking-admin/reservations/${pb?.documentId}/completed`, {}, A);
check('action: mark completed', completed.status === 200, completed.data);
const afterDone = (await cm('GET', `${RES}/${pb?.documentId}`)).data?.data;
check('CM shows COMPLETED', afterDone?.bookingStatus === 'COMPLETED', afterDone?.bookingStatus);

const edit = await cm('PUT', `${RES}/${r1?.documentId}`, { internalNote: 'e2e: admin edit' });
check('CM edit keeps the booking CONFIRMED', edit.status === 200 && edit.data.data.bookingStatus === 'CONFIRMED', edit.data?.data?.bookingStatus ?? edit.data);

// ------------------------------------------------------------------ waitlist: admin adds, offer, patient accepts → old booking cancelled
const p3 = person();
const late = (await slotsFor('implant', hkDate(25), hkDate(40))).at(-1);
const b3 = await book('implant', late, p3);
check('patient books a late implant slot', b3.confirm?.status === 201, b3.confirm?.data);
const old3 = await findRes(b3.confirm?.data.reference);
const wl = await cm('POST', '/collection-types/api::waitlist-entry.waitlist-entry', {
  service: { connect: [{ documentId: svc('implant') }] },
  dateFrom: hkDate(0), dateTo: hkDate(40),
  name: p3.name, phone: p3.phone, email: p3.email, language: 'zh-HK',
  replacesReservation: { connect: [{ documentId: old3?.documentId }] },
});
check('CM waitlist entry created', wl.status === 200 || wl.status === 201, wl.data);
let offerToken = null;
for (let i = 0; i < 30 && !offerToken; i++) {
  const logs = (await cm('GET', `/collection-types/api::notification-log.notification-log?filters[to][$eq]=${encodeURIComponent(p3.email)}&filters[type][$eq]=WAITLIST_OFFER`)).data?.results ?? [];
  offerToken = logs.map((l) => /offer\?token=([\w-]+)/.exec(l.body ?? '')?.[1]).find(Boolean) ?? null;
  if (!offerToken) await sleep(3000);
}
check('waitlist offer emailed', Boolean(offerToken));
const wlFull = (await cm('GET', `/collection-types/api::waitlist-entry.waitlist-entry/${wl.data?.data?.documentId}`)).data?.data;
check('CM waitlist shows queueStatus OFFERED', wlFull?.queueStatus === 'OFFERED', wlFull?.queueStatus);
if (offerToken) {
  const offer = await http('GET', `${API}/waitlist/offer?token=${offerToken}`);
  check('offer is open and earlier than the booking', offer.data?.status === 'OPEN' && new Date(offer.data.startAt) < new Date(late.start), offer.data);
  const accept = await http('POST', `${API}/waitlist/offer/confirm`, { token: offerToken });
  check('patient accepts offer', accept.status === 201, accept.data);
  const oldAfter = (await cm('GET', `${RES}/${old3?.documentId}`)).data?.data;
  check('old booking cancelled by the move', oldAfter?.bookingStatus === 'CANCELLED', oldAfter?.bookingStatus);
}

// ------------------------------------------------------------------ schedule rule makes a conflict
const ruleDay = phoneSlot.date;
const p4 = person();
const r4slot = (await slotsFor('checkup', ruleDay)).find((s) => s.start !== phoneSlot.start);
const b4 = await book('checkup', r4slot, p4);
const rule = await cm('POST', '/collection-types/api::schedule-rule.schedule-rule', {
  name: `e2e 休息 ${rand()}`, effect: 'CLOSE', repeat: 'DATE_RANGE', dateFrom: ruleDay, dateTo: ruleDay, reasonZh: 'e2e 測試', reasonEn: 'e2e', timeRanges: [],
});
check('CM schedule rule created', rule.status === 200 || rule.status === 201, rule.data);
await sleep(2500);
const r4 = await findRes(b4.confirm?.data.reference);
check('booking flagged as conflict', r4?.conflict === true, r4 && { conflict: r4.conflict, reason: r4.conflictReason });
const closedDay = await slotsFor('checkup', ruleDay);
check('closed day has no slots', closedDay.length === 0, closedDay.length);
await cm('DELETE', `/collection-types/api::schedule-rule.schedule-rule/${rule.data?.data?.documentId}`);
await sleep(1000);
check('day reopens after the rule is deleted', (await slotsFor('checkup', ruleDay)).length > 0);

// ------------------------------------------------------------------ emergency close, then undo the blocks
const emDay = hkDate(45);
const emSlot = (await slotsFor('checkup', emDay, hkDate(52)))[0];
const p5 = person();
const b5 = await book('checkup', emSlot, p5);
const window = { from: `${emSlot.date}T00:00:00+08:00`, to: `${emSlot.date}T23:59:00+08:00`, reason: 'e2e 黑雨', notify: true };
const preview = await http('POST', `${HOST}/booking-admin/emergency/preview`, window, A);
check('emergency preview lists the booking', preview.status === 200 && preview.data.reservations.some((r) => r.reference === b5.confirm?.data.reference), preview.data);
const close = await http('POST', `${HOST}/booking-admin/emergency/close`, window, A);
check('emergency close cancels it', close.status === 200 && close.data.cancelled >= 1, close.data);
check('closed day is not bookable', (await slotsFor('checkup', emSlot.date)).length === 0);
const blocks = (await cm('GET', `${RES}?filters[kind][$eq]=BLOCK&filters[startAt][$gte]=${encodeURIComponent(window.from)}&filters[startAt][$lte]=${encodeURIComponent(window.to)}`)).data?.results ?? [];
for (const b of blocks) await http('POST', `${HOST}/booking-admin/reservations/${b.documentId}/cancel`, { reason: 'e2e cleanup' }, A);
check('blocks lifted after cleanup', (await slotsFor('checkup', emSlot.date)).length > 0);

// ------------------------------------------------------------------ patient cancels; email outbox
const cancel = await http('POST', `${API}/manage/cancel`, { token: manageToken });
check('patient cancels through manage link', cancel.status === 200 && cancel.data.status === 'CANCELLED', cancel.data);
check('slot is free again', (await slotsFor('checkup', day1.date)).some((s) => s.start === day1.start));

await sleep(35_000);
const sent = (await cm('GET', `/collection-types/api::notification-log.notification-log?filters[to][$eq]=${encodeURIComponent(p1.email)}`)).data?.results ?? [];
check('emails delivered to the log', sent.length >= 2 && sent.every((n) => n.deliveryStatus === 'SENT'), sent.map((n) => [n.type, n.deliveryStatus]));

const settings = await cm('GET', '/single-types/api::clinic-setting.clinic-setting');
check('clinic settings readable in CM', settings.status === 200 && settings.data.data.holdMinutes === 10, settings.data);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
