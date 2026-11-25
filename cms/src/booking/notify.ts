import { UID, frontendUrl, maskEmail } from './util';

/**
 * Email via an outbox (plan.md §6): business code only writes PENDING rows inside its transaction,
 * and the dispatch job sends them later, so a rolled-back booking never sends anything.
 */

export type NotificationType =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'REMINDER_24H'
  | 'WAITLIST_JOINED'
  | 'WAITLIST_OFFER'
  | 'EXISTING_BOOKING_REMINDER'
  | 'ADMIN_ALERT';

export interface Vars {
  name?: string;
  reference?: string;
  when?: string;
  oldWhen?: string;
  doctor?: string;
  service?: string;
  manageUrl?: string;
  offerUrl?: string;
  leaveUrl?: string;
  expires?: string;
  reason?: string;
  message?: string;
  clinicPhone?: string;
}

const ADDRESS_ZH = '銅鑼灣晴光道 18 號海晴中心 12 樓 1203 室（港鐵 F 出口）';
const ADDRESS_EN = 'Room 1203, 12/F, Hoi Ching Centre, 18 Ching Kwong Road, Causeway Bay (MTR Exit F)';

function render(type: NotificationType, locale: string, v: Vars): { subject: string; body: string } {
  const en = locale === 'en';
  const phone = v.clinicPhone ?? '+852 2888 0000';
  const sign = en ? `\n\nClearlight Dental · ${phone}` : `\n\n晴光牙科醫務中心 · ${phone}`;
  const when = en ? `${v.when} (Hong Kong time)` : `${v.when}（香港時間）`;
  const t: Record<NotificationType, [string, string]> = {
    BOOKING_CONFIRMED: en
      ? [
          `Booking confirmed · ${v.reference}`,
          `Dear ${v.name},\n\nYour appointment is confirmed.\n\nReference: ${v.reference}\nTime: ${when}\nService: ${v.service}\nDentist: ${v.doctor}\nAddress: ${ADDRESS_EN}\n\nView or cancel your booking: ${v.manageUrl}\nTo change the time, please call us.`,
        ]
      : [
          `預約確認 · ${v.reference}`,
          `${v.name} 你好：\n\n你的預約已經確認。\n\n編號：${v.reference}\n時間：${when}\n服務：${v.service}\n醫生：${v.doctor}\n地址：${ADDRESS_ZH}\n\n查看或取消預約：${v.manageUrl}\n如需更改時間，請致電診所。`,
        ],
    BOOKING_CANCELLED: en
      ? [`Booking cancelled · ${v.reference}`, `Dear ${v.name},\n\nYour appointment on ${when} has been cancelled.${v.reason ? `\nReason: ${v.reason}` : ''}\n\nPlease call us if you would like a new time.`]
      : [`預約已取消 · ${v.reference}`, `${v.name} 你好：\n\n你於 ${when} 的預約已經取消。${v.reason ? `\n原因：${v.reason}` : ''}\n\n如需重新預約，請致電診所。`],
    BOOKING_RESCHEDULED: en
      ? [`Booking moved · ${v.reference}`, `Dear ${v.name},\n\nYour appointment has moved${v.oldWhen ? ` from ${v.oldWhen}` : ''} to ${when}.\nService: ${v.service}\nDentist: ${v.doctor}\n\nView or cancel your booking: ${v.manageUrl}`]
      : [`預約時間已更改 · ${v.reference}`, `${v.name} 你好：\n\n你的預約${v.oldWhen ? `已由 ${v.oldWhen} ` : ''}改為 ${when}。\n服務：${v.service}\n醫生：${v.doctor}\n\n查看或取消預約：${v.manageUrl}`],
    REMINDER_24H: en
      ? [`Reminder: appointment tomorrow · ${v.reference}`, `Dear ${v.name},\n\nThis is a reminder of your appointment on ${when}.\nService: ${v.service}\nDentist: ${v.doctor}\nAddress: ${ADDRESS_EN}\n\nView or cancel: ${v.manageUrl}`]
      : [`提提你：明日預約 · ${v.reference}`, `${v.name} 你好：\n\n提提你明日的預約：${when}\n服務：${v.service}\n醫生：${v.doctor}\n地址：${ADDRESS_ZH}\n\n查看或取消：${v.manageUrl}`],
    WAITLIST_JOINED: en
      ? [`You are on the waiting list`, `Dear ${v.name},\n\nWe have added you to the waiting list for ${v.service}. We will email you as soon as a time comes up.\n\nLeave the waiting list: ${v.leaveUrl}`]
      : [`已加入輪候名單`, `${v.name} 你好：\n\n我們已將你加入「${v.service}」的輪候名單，一有時段會即時電郵通知你。\n\n退出輪候：${v.leaveUrl}`],
    WAITLIST_OFFER: en
      ? [`A time is free for you`, `Dear ${v.name},\n\nA time is free: ${when}\nService: ${v.service}\nDentist: ${v.doctor}\n\nWe are holding it for you until ${v.expires}. Accept it here: ${v.offerUrl}${v.message ? `\n\n${v.message}` : ''}`]
      : [`有時段可以預約`, `${v.name} 你好：\n\n有時段空出：${when}\n服務：${v.service}\n醫生：${v.doctor}\n\n我們會為你保留至 ${v.expires}，請按此確認：${v.offerUrl}${v.message ? `\n\n${v.message}` : ''}`],
    EXISTING_BOOKING_REMINDER: en
      ? [`About your existing booking`, `Dear ${v.name},\n\nSomeone tried to make another booking with your phone or email. You already have a booking for this service.\n\nView it here: ${v.manageUrl}\nTo change the time, please call us.`]
      : [`關於你現有的預約`, `${v.name} 你好：\n\n有人嘗試用你的電話或電郵再次預約。你已經有一個相同服務的預約。\n\n查看預約：${v.manageUrl}\n如需更改時間，請致電診所。`],
    ADMIN_ALERT: [`[晴光預約] ${v.reason ?? '需要跟進'}`, `${v.message ?? ''}\n\n後台：${process.env.PUBLIC_URL || 'http://localhost:1337'}/admin`],
  };
  const [subject, body] = t[type];
  return { subject, body: type === 'ADMIN_ALERT' ? body : body + sign };
}

export async function enqueue(
  type: NotificationType,
  to: string | null | undefined,
  locale: string | null | undefined,
  vars: Vars,
  reservationRef?: string | null
): Promise<void> {
  if (!to) return;
  const { subject, body } = render(type, locale || 'zh-HK', vars);
  await strapi.db.query(UID.notification).create({
    data: { type, to, language: locale || 'zh-HK', subject, body, status: 'PENDING', attempts: 0, reservationRef: reservationRef ?? null },
  });
}

export async function alertAdmin(reason: string, message: string): Promise<void> {
  const setting = (await strapi.documents(UID.setting).findFirst()) as { adminEmail?: string } | null;
  await enqueue('ADMIN_ALERT', setting?.adminEmail, 'zh-HK', { reason, message });
}

/** Has this address been sent this type within the window? Used to stop the duplicate-booking email being abused as spam. */
export async function sentRecently(type: NotificationType, to: string, minutes: number): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000);
  const count = await strapi.db.query(UID.notification).count({ where: { type, to, createdAt: { $gte: since } } });
  return count > 0;
}

const MAX_ATTEMPTS = 5;

export async function dispatchOutbox(): Promise<number> {
  const now = new Date();
  const rows = await strapi.db.query(UID.notification).findMany({
    where: { status: 'PENDING', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
    orderBy: { id: 'asc' },
    limit: 20,
  });
  for (const row of rows) {
    try {
      await strapi.plugin('email').service('email').send({ to: row.to, subject: row.subject, text: row.body });
      await strapi.db.query(UID.notification).update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1 } });
    } catch (err) {
      const attempts = row.attempts + 1;
      await strapi.db.query(UID.notification).update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: String((err as Error).message ?? err),
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
        },
      });
      strapi.log.warn(`[notify] send failed to ${maskEmail(row.to)}: ${(err as Error).message}`);
    }
  }
  return rows.length;
}

export const manageUrl = (token: string) => `${frontendUrl()}/manage?token=${token}`;
export const offerUrl = (token: string) => `${frontendUrl()}/offer?token=${token}`;
export const leaveUrl = (id: string, token: string) => `${frontendUrl()}/waitlist/leave?id=${id}&token=${token}`;
