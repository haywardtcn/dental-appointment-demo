import { DateTime } from 'luxon';

/**
 * Pure schedule maths (plan.md §3.4, §4): turns schedule rules into open ranges, cuts them into
 * x-minute sessions, and finds the start times a service fits. Nothing here touches the database.
 */

export const ZONE = 'Asia/Hong_Kong';

export type Effect = 'OPEN' | 'CLOSE' | 'SESSION_LENGTH' | 'DAILY_LIMIT';
export type Repeat = 'WEEKLY' | 'DATE_RANGE' | 'MONTHLY_NTH_WEEKDAY' | 'PUBLIC_HOLIDAY' | 'BEFORE_PUBLIC_HOLIDAY';

/** Minutes after midnight, half-open: [start, end). */
export interface Range {
  start: number;
  end: number;
}

export interface Rule {
  id: string;
  name: string;
  effect: Effect;
  repeat: Repeat;
  daysOfWeek: number[];
  nthWeek: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  ranges: Range[];
  sessionMinutes: number | null;
  maxBookings: number | null;
  priority: number;
  doctorIds: string[];
  serviceIds: string[];
  reasonZh: string | null;
  reasonEn: string | null;
}

export interface Holiday {
  nameZh: string | null;
  nameEn: string | null;
}

export type DayStatus = 'OPEN' | 'CLOSED' | 'HOLIDAY';

export interface DayPlan {
  date: string;
  status: DayStatus;
  open: Range[];
  sessionMinutes: number;
  maxBookings: number | null;
  reasonZh: string | null;
  reasonEn: string | null;
  openedBy: string[];
  closedBy: string[];
}

export interface Busy {
  start: number;
  end: number;
  kind: string;
}

export interface Slot {
  start: number;
  end: number;
  blockedUntil: number;
}

const FULL_DAY: Range = { start: 0, end: 24 * 60 };

export function union(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function subtract(from: Range[], cut: Range[]): Range[] {
  let out = union(from);
  for (const c of union(cut)) {
    out = out.flatMap((r) => {
      if (c.end <= r.start || c.start >= r.end) return [r];
      const parts: Range[] = [];
      if (c.start > r.start) parts.push({ start: r.start, end: c.start });
      if (c.end < r.end) parts.push({ start: c.end, end: r.end });
      return parts;
    });
  }
  return out;
}

export function ruleApplies(
  rule: Rule,
  day: DateTime,
  doctorId: string | null,
  serviceId: string | null,
  holidays: Map<string, Holiday>
): boolean {
  const iso = day.toISODate()!;
  if (rule.dateFrom && iso < rule.dateFrom) return false;
  if (rule.dateTo && iso > rule.dateTo) return false;
  if (rule.doctorIds.length && (!doctorId || !rule.doctorIds.includes(doctorId))) return false;
  // A rule limited to some services never shapes the generic (no service) view of a day.
  if (rule.serviceIds.length && (!serviceId || !rule.serviceIds.includes(serviceId))) return false;

  switch (rule.repeat) {
    case 'WEEKLY':
      return rule.daysOfWeek.includes(day.weekday);
    case 'DATE_RANGE':
      return Boolean(rule.dateFrom);
    case 'MONTHLY_NTH_WEEKDAY': {
      if (!rule.daysOfWeek.includes(day.weekday)) return false;
      if (rule.nthWeek === -1) return day.plus({ days: 7 }).month !== day.month;
      return Math.ceil(day.day / 7) === rule.nthWeek;
    }
    case 'PUBLIC_HOLIDAY':
      return holidays.has(iso);
    case 'BEFORE_PUBLIC_HOLIDAY':
      return holidays.has(day.plus({ days: 1 }).toISODate()!);
    default:
      return false;
  }
}

function topByPriority(rules: Rule[]): Rule[] {
  if (!rules.length) return [];
  const top = Math.max(...rules.map((r) => r.priority));
  return rules.filter((r) => r.priority === top);
}

/** Open ranges, session length and limits for one doctor on one day. CLOSE always beats OPEN. */
export function planDay(
  rules: Rule[],
  day: DateTime,
  doctorId: string | null,
  serviceId: string | null,
  holidays: Map<string, Holiday>,
  defaultSessionMinutes: number
): DayPlan {
  const applicable = rules.filter((r) => ruleApplies(r, day, doctorId, serviceId, holidays));
  const opens = applicable.filter((r) => r.effect === 'OPEN');
  const closes = applicable.filter((r) => r.effect === 'CLOSE');
  const open = subtract(
    opens.flatMap((r) => r.ranges),
    closes.flatMap((r) => (r.ranges.length ? r.ranges : [FULL_DAY]))
  );

  const lengthRule = topByPriority(applicable.filter((r) => r.effect === 'SESSION_LENGTH' && r.sessionMinutes))[0];
  const limits = topByPriority(applicable.filter((r) => r.effect === 'DAILY_LIMIT' && r.maxBookings !== null));
  const iso = day.toISODate()!;

  let status: DayStatus = 'OPEN';
  let reasonZh: string | null = null;
  let reasonEn: string | null = null;
  if (!open.length) {
    const closer = closes.find((r) => r.reasonZh || r.reasonEn || r.repeat === 'PUBLIC_HOLIDAY');
    if (opens.length && closer) {
      status = 'HOLIDAY';
      const holiday = closer.repeat === 'PUBLIC_HOLIDAY' ? holidays.get(iso) : undefined;
      reasonZh = closer.reasonZh || holiday?.nameZh || closer.name;
      reasonEn = closer.reasonEn || holiday?.nameEn || closer.name;
    } else {
      status = 'CLOSED';
    }
  }

  return {
    date: iso,
    status,
    open,
    sessionMinutes: lengthRule?.sessionMinutes ?? defaultSessionMinutes,
    maxBookings: limits.length ? Math.min(...limits.map((r) => r.maxBookings as number)) : null,
    reasonZh,
    reasonEn,
    openedBy: opens.map((r) => r.name),
    closedBy: closes.map((r) => r.name),
  };
}

/** How many consecutive sessions a service needs. */
export function sessionsNeeded(durationMin: number, bufferMin: number, sessionMinutes: number): number {
  return Math.max(1, Math.ceil((durationMin + bufferMin) / sessionMinutes));
}

/** Session start times (minutes after midnight) where n sessions fit inside one open range. */
export function sessionStarts(plan: DayPlan, n: number): number[] {
  const x = plan.sessionMinutes;
  const out: number[] = [];
  for (const r of plan.open) {
    for (let t = r.start; t + n * x <= r.end; t += x) out.push(t);
  }
  return out;
}

export function sessionCount(plan: DayPlan): number {
  return plan.open.reduce((sum, r) => sum + Math.floor((r.end - r.start) / plan.sessionMinutes), 0);
}

export interface SlotQuery {
  plan: DayPlan;
  day: DateTime;
  durationMin: number;
  bufferMin: number;
  busy: Busy[];
  bookedCount: number;
  now: number;
  minLeadTimeMin: number;
}

/** Bookable slots for one doctor on one day, as epoch milliseconds. */
export function availableSlots(q: SlotQuery): Slot[] {
  if (q.plan.status !== 'OPEN') return [];
  if (q.plan.maxBookings !== null && q.bookedCount >= q.plan.maxBookings) return [];
  const x = q.plan.sessionMinutes;
  const n = sessionsNeeded(q.durationMin, q.bufferMin, x);
  const earliest = q.now + q.minLeadTimeMin * 60_000;
  const midnight = q.day.startOf('day');

  return sessionStarts(q.plan, n).flatMap((t) => {
    const start = midnight.plus({ minutes: t }).toMillis();
    const blockedUntil = midnight.plus({ minutes: t + n * x }).toMillis();
    if (start < earliest) return [];
    if (q.busy.some((b) => b.start < blockedUntil && b.end > start)) return [];
    return [{ start, end: start + q.durationMin * 60_000, blockedUntil }];
  });
}

/** "09:30:00.000" → 570 */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function hkDay(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: ZONE }).startOf('day');
}
