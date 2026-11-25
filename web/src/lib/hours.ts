import type { TFunction } from 'i18next';
import type { Lang } from '../i18n';
import type { ClinicStatus } from './api';

// Opening hours in minutes after midnight, Hong Kong time, keyed by weekday (0 = Sunday).
// These are the fallback; applyLiveHours replaces them with the admin's schedule rules.
const HOURS: Record<number, [number, number][]> = {
  0: [],
  1: [[570, 780], [870, 1140]],
  2: [[570, 780], [870, 1140]],
  3: [[570, 780], [870, 1140]],
  4: [[570, 780], [870, 1140]],
  5: [[570, 780], [870, 1140]],
  6: [[570, 810]],
};

// Real opening times for the coming days (holidays, emergency closures), keyed by YYYY-MM-DD.
const LIVE_DAYS = new Map<string, [number, number][]>();

export function applyLiveHours(s: ClinicStatus) {
  for (const [weekday, ranges] of Object.entries(s.weekly)) HOURS[Number(weekday) % 7] = ranges.map((r) => [r.start, r.end]);
  LIVE_DAYS.clear();
  for (const d of s.days) LIVE_DAYS.set(d.date, d.open.map((r) => [r.start, r.end]));
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rangesOn = (d: Date) => LIVE_DAYS.get(isoDate(d)) ?? HOURS[d.getDay()];

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
  const m = now.getHours() * 60 + now.getMinutes();
  const today = rangesOn(now);
  for (let i = 0; i < today.length; i++) {
    const [start, end] = today[i];
    if (m >= start && m < end) return { open: true, text: t('status.openUntil', { time: formatTime(end, lang) }) };
    if (m < start) {
      const key = i === 0 ? 'status.opensToday' : 'status.backAfterLunch';
      return { open: false, text: t(key, { time: formatTime(start, lang) }) };
    }
  }
  for (let k = 1; k <= 14; k++) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
    const ranges = rangesOn(next);
    if (ranges.length) {
      const day = k === 1 ? t('status.tomorrow') : dayName(next.getDay(), lang);
      return { open: false, text: t('status.closedUntil', { day, time: formatTime(ranges[0][0], lang) }) };
    }
  }
  return { open: false, text: '' };
}

/** "12月2日（星期三）" or "Wed 2 Dec" for a YYYY-MM-DD date. */
export function dateLabel(iso: string, lang: Lang): string {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return lang === 'zh-HK'
    ? `${m}月${day}日（${dayName(d.getDay(), lang)}）`
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "上午9:30" or "9:30 am" for an "HH:mm" time. */
export function timeLabel(hhmm: string, lang: Lang): string {
  const [h, m] = hhmm.split(':').map(Number);
  return formatTime(h * 60 + m, lang);
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
