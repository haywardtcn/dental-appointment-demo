import type { TFunction } from 'i18next';
import type { Lang } from '../i18n';

// Opening hours in minutes after midnight, Hong Kong time, keyed by weekday (0 = Sunday).
const HOURS: Record<number, [number, number][]> = {
  0: [],
  1: [[570, 780], [870, 1140]],
  2: [[570, 780], [870, 1140]],
  3: [[570, 780], [870, 1140]],
  4: [[570, 780], [870, 1140]],
  5: [[570, 780], [870, 1140]],
  6: [[570, 810]],
};

const SLOT_MINUTES = 30;
const BOOKABLE_DAYS = 26;

/** Wall-clock time in Hong Kong, as a local Date so getDay()/getHours() read HK values. */
export function hkNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
}

export function formatTime(minutes: number, lang: Lang): string {
  const h = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const h12 = h > 12 ? h - 12 : h;
  if (lang === 'zh-HK') return `${h < 12 ? '上午' : '下午'}${h12}:${mm}`;
  return `${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

function dayName(day: number, lang: Lang): string {
  return new Date(2024, 0, 7 + day).toLocaleDateString(lang, { weekday: 'long' });
}

export function clinicStatus(lang: Lang, t: TFunction): { open: boolean; text: string } {
  const now = hkNow();
  const d = now.getDay();
  const m = now.getHours() * 60 + now.getMinutes();
  const today = HOURS[d];
  for (let i = 0; i < today.length; i++) {
    const [start, end] = today[i];
    if (m >= start && m < end) return { open: true, text: t('status.openUntil', { time: formatTime(end, lang) }) };
    if (m < start) {
      const key = i === 0 ? 'status.opensToday' : 'status.backAfterLunch';
      return { open: false, text: t(key, { time: formatTime(start, lang) }) };
    }
  }
  for (let k = 1; k <= 7; k++) {
    const next = (d + k) % 7;
    if (HOURS[next].length) {
      const day = k === 1 ? t('status.tomorrow') : dayName(next, lang);
      return { open: false, text: t('status.closedUntil', { day, time: formatTime(HOURS[next][0][0], lang) }) };
    }
  }
  return { open: false, text: '' };
}

export type BookingDate = { value: string; label: string; day: number };

/** The next bookable days, starting tomorrow and skipping days the clinic is closed. */
export function bookingDates(lang: Lang): BookingDate[] {
  const out: BookingDate[] = [];
  const base = hkNow();
  for (let i = 1; out.length < BOOKABLE_DAYS && i < 40; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (!HOURS[d.getDay()].length) continue;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label =
      lang === 'zh-HK'
        ? `${d.getMonth() + 1}月${d.getDate()}日（${dayName(d.getDay(), lang)}）`
        : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    out.push({ value, label, day: d.getDay() });
  }
  return out;
}

export function slotsFor(day: number, lang: Lang): { value: string; label: string }[] {
  return HOURS[day].flatMap(([start, end]) => {
    const slots = [];
    for (let m = start; m + SLOT_MINUTES <= end; m += SLOT_MINUTES) slots.push({ value: String(m), label: formatTime(m, lang) });
    return slots;
  });
}

export function hoursRows(lang: Lang, t: TFunction) {
  const today = hkNow().getDay();
  const groups: { key: 'weekdays' | 'saturday' | 'sunday'; days: number[] }[] = [
    { key: 'weekdays', days: [1, 2, 3, 4, 5] },
    { key: 'saturday', days: [6] },
    { key: 'sunday', days: [0] },
  ];
  return groups.map(({ key, days }) => {
    const ranges = HOURS[days[0]];
    return {
      key,
      day: t(`contact.days.${key}`),
      time: ranges.length
        ? ranges.map(([s, e]) => `${formatTime(s, lang)} – ${formatTime(e, lang)}`).join(lang === 'zh-HK' ? '、' : ', ')
        : t('contact.closed'),
      today: days.includes(today),
    };
  });
}
