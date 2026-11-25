import { describe, expect, it } from 'vitest';
import { availableSlots, hkDay, planDay, ruleApplies, sessionStarts, sessionsNeeded, subtract, union, type Rule } from '../src/booking/schedule';

const rule = (r: Partial<Rule>): Rule => ({
  id: r.name ?? 'r', name: 'r', effect: 'OPEN', repeat: 'WEEKLY', daysOfWeek: [], nthWeek: null, dateFrom: null, dateTo: null,
  ranges: [], sessionMinutes: null, maxBookings: null, priority: 0, doctorIds: [], serviceIds: [], reasonZh: null, reasonEn: null, ...r,
});
const h = (hh: number, mm = 0) => hh * 60 + mm;

const weekdays = rule({ name: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5], ranges: [{ start: h(9, 30), end: h(13) }, { start: h(14, 30), end: h(19) }] });
const saturday = rule({ name: 'sat', daysOfWeek: [6], ranges: [{ start: h(9, 30), end: h(13, 30) }] });
const holidayClose = rule({ name: 'ph', effect: 'CLOSE', repeat: 'PUBLIC_HOLIDAY' });
const holidays = new Map([['2026-12-25', { nameZh: '聖誕節', nameEn: 'Christmas Day' }]]);
const base = [weekdays, saturday, holidayClose];

// 2026-12-01 is a Tuesday, 2026-12-05 a Saturday, 2026-12-06 a Sunday.
const tue = hkDay('2026-12-01');

describe('ranges', () => {
  it('merges and cuts', () => {
    expect(union([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 30, end: 40 }])).toEqual([{ start: 0, end: 20 }, { start: 30, end: 40 }]);
    expect(subtract([{ start: 0, end: 100 }], [{ start: 20, end: 30 }])).toEqual([{ start: 0, end: 20 }, { start: 30, end: 100 }]);
  });
});

describe('repeat', () => {
  it('WEEKLY / DATE_RANGE / nth weekday / last weekday / holidays', () => {
    expect(ruleApplies(weekdays, tue, 'd', null, holidays)).toBe(true);
    expect(ruleApplies(weekdays, hkDay('2026-12-06'), 'd', null, holidays)).toBe(false);
    const range = rule({ repeat: 'DATE_RANGE', dateFrom: '2026-12-20', dateTo: '2026-12-31' });
    expect(ruleApplies(range, hkDay('2026-12-19'), 'd', null, holidays)).toBe(false);
    expect(ruleApplies(range, hkDay('2026-12-20'), 'd', null, holidays)).toBe(true);
    const firstSat = rule({ repeat: 'MONTHLY_NTH_WEEKDAY', daysOfWeek: [6], nthWeek: 1 });
    expect(ruleApplies(firstSat, hkDay('2026-12-05'), 'd', null, holidays)).toBe(true);
    expect(ruleApplies(firstSat, hkDay('2026-12-12'), 'd', null, holidays)).toBe(false);
    const lastSat = rule({ repeat: 'MONTHLY_NTH_WEEKDAY', daysOfWeek: [6], nthWeek: -1 });
    expect(ruleApplies(lastSat, hkDay('2026-12-26'), 'd', null, holidays)).toBe(true);
    expect(ruleApplies(lastSat, hkDay('2026-12-19'), 'd', null, holidays)).toBe(false);
    expect(ruleApplies(holidayClose, hkDay('2026-12-25'), 'd', null, holidays)).toBe(true);
    const before = rule({ repeat: 'BEFORE_PUBLIC_HOLIDAY' });
    expect(ruleApplies(before, hkDay('2026-12-24'), 'd', null, holidays)).toBe(true);
  });

  it('doctor and service limits', () => {
    const onlyImplant = rule({ serviceIds: ['implant'], daysOfWeek: [2] });
    expect(ruleApplies(onlyImplant, tue, 'd', 'implant', holidays)).toBe(true);
    expect(ruleApplies(onlyImplant, tue, 'd', 'checkup', holidays)).toBe(false);
    expect(ruleApplies(onlyImplant, tue, 'd', null, holidays)).toBe(false);
    const onlyLee = rule({ doctorIds: ['lee'], daysOfWeek: [2] });
    expect(ruleApplies(onlyLee, tue, 'chan', null, holidays)).toBe(false);
  });
});

describe('planDay', () => {
  it('opens on a weekday with a lunch gap', () => {
    const p = planDay(base, tue, 'd', null, holidays, 30);
    expect(p.status).toBe('OPEN');
    expect(p.open).toEqual(weekdays.ranges);
  });

  it('CLOSE beats OPEN, and the holiday name is the reason', () => {
    const p = planDay(base, hkDay('2026-12-25'), 'd', null, holidays, 30);
    expect(p.status).toBe('HOLIDAY');
    expect(p.reasonZh).toBe('聖誕節');
    expect(p.open).toEqual([]);
  });

  it('a half-day close cuts only its hours', () => {
    const early = rule({ name: 'early', effect: 'CLOSE', repeat: 'DATE_RANGE', dateFrom: '2026-12-01', dateTo: '2026-12-01', ranges: [{ start: h(16), end: h(19) }] });
    expect(planDay([...base, early], tue, 'd', null, holidays, 30).open).toEqual([{ start: h(9, 30), end: h(13) }, { start: h(14, 30), end: h(16) }]);
  });

  it('Sunday has no OPEN rule, so it is CLOSED', () => {
    expect(planDay(base, hkDay('2026-12-06'), 'd', null, holidays, 30).status).toBe('CLOSED');
  });

  it('session length: highest priority wins, default otherwise', () => {
    const a = rule({ effect: 'SESSION_LENGTH', daysOfWeek: [2], sessionMinutes: 20, priority: 1 });
    const b = rule({ effect: 'SESSION_LENGTH', daysOfWeek: [2], sessionMinutes: 45, priority: 5 });
    expect(planDay([...base, a, b], tue, 'd', null, holidays, 30).sessionMinutes).toBe(45);
    expect(planDay(base, tue, 'd', null, holidays, 30).sessionMinutes).toBe(30);
  });
});

describe('sessions and slots', () => {
  it('needs ceil((duration + buffer) / x) sessions', () => {
    expect(sessionsNeeded(25, 5, 30)).toBe(1);
    expect(sessionsNeeded(45, 15, 30)).toBe(2);
    expect(sessionsNeeded(75, 15, 30)).toBe(3);
    expect(sessionsNeeded(45, 15, 20)).toBe(3);
  });

  it('cuts from each range start and drops a short tail', () => {
    const p = planDay(base, hkDay('2026-12-05'), 'd', null, holidays, 45);
    // 09:30–13:30 with 45 min sessions: 09:30, 10:15, 11:00, 11:45, 12:30 (13:15 would end after 13:30)
    expect(sessionStarts(p, 1)).toEqual([h(9, 30), h(10, 15), h(11), h(11, 45), h(12, 30)]);
  });

  it('a 3-session service never crosses lunch', () => {
    const p = planDay(base, tue, 'd', null, holidays, 30);
    const starts = sessionStarts(p, 3);
    expect(starts).toContain(h(11, 30));
    expect(starts).not.toContain(h(12));
    expect(starts).toContain(h(14, 30));
  });

  it('removes busy, lead time and full days', () => {
    const p = planDay(base, tue, 'd', null, holidays, 30);
    const at = (m: number) => tue.plus({ minutes: m }).toMillis();
    const q = { plan: p, day: tue, durationMin: 25, bufferMin: 5, bookedCount: 0, now: at(h(9)), minLeadTimeMin: 60 };
    const slots = availableSlots({ ...q, busy: [{ start: at(h(10, 30)), end: at(h(11)), kind: 'BOOKED' }] });
    const starts = slots.map((s) => (s.start - tue.toMillis()) / 60_000);
    expect(starts[0]).toBe(h(10));
    expect(starts).not.toContain(h(10, 30));
    expect(slots[0].end - slots[0].start).toBe(25 * 60_000);
    expect(slots[0].blockedUntil - slots[0].start).toBe(30 * 60_000);
    const limited = planDay([...base, rule({ effect: 'DAILY_LIMIT', daysOfWeek: [2], maxBookings: 2 })], tue, 'd', null, holidays, 30);
    expect(availableSlots({ ...q, plan: limited, busy: [], bookedCount: 2 })).toEqual([]);
  });
});
