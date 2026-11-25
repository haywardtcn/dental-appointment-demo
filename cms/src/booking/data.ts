import type { Holiday, Rule } from './schedule';
import { timeToMinutes } from './schedule';
import { UID } from './util';

export interface Settings {
  sessionMinutes: number;
  holdMinutes: number;
  minLeadTimeMin: number;
  bookingHorizonDays: number;
  waitlistOfferMinutes: number;
  waitlistMaxOffers: number;
  cancelCutoffHours: number;
  maxSameServiceBookings: number;
  maxActiveBookingsPerContact: number;
  adminEmail: string | null;
  clinicPhone: string;
}

export interface Doctor {
  documentId: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  color: string;
  sortOrder: number;
  serviceIds: string[];
}

export interface Service {
  documentId: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  durationMin: number;
  bufferMin: number;
  sortOrder: number;
  doctorIds: string[];
}

export interface ScheduleData {
  settings: Settings;
  rules: Rule[];
  holidays: Map<string, Holiday>;
  doctors: Doctor[];
  services: Service[];
}

const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 30,
  holdMinutes: 10,
  minLeadTimeMin: 120,
  bookingHorizonDays: 60,
  waitlistOfferMinutes: 30,
  waitlistMaxOffers: 3,
  cancelCutoffHours: 24,
  maxSameServiceBookings: 1,
  maxActiveBookingsPerContact: 3,
  adminEmail: null,
  clinicPhone: '+852 2888 0000',
};

// Settings change rarely and are re-read after any admin edit (invalidate), so a short cache is enough.
const TTL_MS = 30_000;
let cache: { at: number; data: ScheduleData } | null = null;

export function invalidateScheduleData() {
  cache = null;
}

const ids = (list?: { documentId: string }[] | null) => (list ?? []).map((x) => x.documentId);

export async function loadScheduleData(): Promise<ScheduleData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [settingRow, ruleRows, holidayRows, doctorRows, serviceRows] = await Promise.all([
    strapi.documents(UID.setting).findFirst(),
    strapi.documents(UID.rule).findMany({
      filters: { active: true },
      populate: { timeRanges: true, doctors: { fields: ['documentId'] }, services: { fields: ['documentId'] } },
      limit: 1000,
    }),
    strapi.documents(UID.holiday).findMany({ limit: 1000 }),
    strapi.documents(UID.doctor).findMany({
      filters: { active: true },
      populate: { services: { fields: ['documentId'] } },
      sort: ['sortOrder:asc', 'id:asc'],
      limit: 200,
    }),
    strapi.documents(UID.service).findMany({
      filters: { bookable: true },
      populate: { doctors: { fields: ['documentId', 'active'] } },
      sort: ['sortOrder:asc', 'id:asc'],
      limit: 200,
    }),
  ]);

  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = (settingRow as Record<string, unknown> | null)?.[key];
    if (value !== null && value !== undefined) (settings as unknown as Record<string, unknown>)[key] = value;
  }

  const rules: Rule[] = (ruleRows as any[]).map((r) => ({
    id: r.documentId,
    name: r.name,
    effect: r.effect,
    repeat: r.repeat,
    daysOfWeek: Array.isArray(r.daysOfWeek) ? r.daysOfWeek.map(Number) : [],
    nthWeek: r.nthWeek ?? null,
    dateFrom: r.dateFrom ?? null,
    dateTo: r.dateTo ?? null,
    ranges: (r.timeRanges ?? []).map((t: { start: string; end: string }) => ({
      start: timeToMinutes(t.start),
      end: timeToMinutes(t.end),
    })),
    sessionMinutes: r.sessionMinutes ?? null,
    maxBookings: r.maxBookings ?? null,
    priority: r.priority ?? 0,
    doctorIds: ids(r.doctors),
    serviceIds: ids(r.services),
    reasonZh: r.reasonZh ?? null,
    reasonEn: r.reasonEn ?? null,
  }));

  const holidays = new Map<string, Holiday>(
    (holidayRows as any[]).map((h) => [h.date, { nameZh: h.nameZh ?? null, nameEn: h.nameEn ?? null }])
  );

  const doctors: Doctor[] = (doctorRows as any[]).map((d) => ({
    documentId: d.documentId,
    slug: d.slug,
    nameZh: d.nameZh,
    nameEn: d.nameEn,
    color: d.color || '#0F5C57',
    sortOrder: d.sortOrder ?? 0,
    serviceIds: ids(d.services),
  }));
  const activeDoctorIds = new Set(doctors.map((d) => d.documentId));

  const services: Service[] = (serviceRows as any[]).map((s) => ({
    documentId: s.documentId,
    slug: s.slug,
    nameZh: s.nameZh,
    nameEn: s.nameEn,
    durationMin: s.durationMin,
    bufferMin: s.bufferMin ?? 0,
    sortOrder: s.sortOrder ?? 0,
    doctorIds: ids(s.doctors).filter((id) => activeDoctorIds.has(id)),
  }));

  const data = { settings, rules, holidays, doctors, services };
  cache = { at: Date.now(), data };
  return data;
}
