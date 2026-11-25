import { DateTime } from 'luxon';
import { importHolidays } from './admin';
import { availability } from './reservations';
import { UID, runInternal } from './util';

/**
 * First-run data so the demo works out of the box (plan.md §3.4 seed). Each part only runs when its
 * table is empty, so admin edits are never overwritten on restart.
 */

const range = (start: string, end: string) => ({ start: `${start}:00.000`, end: `${end}:00.000` });

const SERVICES = [
  { slug: 'checkup', nameZh: '一般檢查及洗牙', nameEn: 'Check-up and Cleaning', durationMin: 25, bufferMin: 5, sortOrder: 0 },
  { slug: 'family', nameZh: '家庭牙科', nameEn: 'Family Dentistry', durationMin: 45, bufferMin: 15, sortOrder: 1 },
  { slug: 'cosmetic', nameZh: '美容牙科', nameEn: 'Cosmetic Dentistry', durationMin: 45, bufferMin: 15, sortOrder: 2 },
  { slug: 'implant', nameZh: '植牙及假牙諮詢', nameEn: 'Implants and Dentures', durationMin: 45, bufferMin: 15, sortOrder: 3 },
  { slug: 'surgery', nameZh: '口腔外科', nameEn: 'Oral Surgery', durationMin: 75, bufferMin: 15, sortOrder: 4 },
];

const RULES = [
  { name: '平日開放時間', effect: 'OPEN', repeat: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5], timeRanges: [range('09:30', '13:00'), range('14:30', '19:00')] },
  { name: '星期六開放時間', effect: 'OPEN', repeat: 'WEEKLY', daysOfWeek: [6], timeRanges: [range('09:30', '13:30')] },
  { name: '公眾假期休息', effect: 'CLOSE', repeat: 'PUBLIC_HOLIDAY', timeRanges: [] },
  { name: '預設 session 長度', effect: 'SESSION_LENGTH', repeat: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], sessionMinutes: 30, timeRanges: [] },
  { name: '假期前一日早收（示範）', effect: 'CLOSE', repeat: 'BEFORE_PUBLIC_HOLIDAY', active: false, timeRanges: [range('16:00', '19:00')], reasonZh: '假期前一日早收', reasonEn: 'Early close before a holiday' },
  { name: '每月第一個星期六休息（示範）', effect: 'CLOSE', repeat: 'MONTHLY_NTH_WEEKDAY', active: false, daysOfWeek: [6], nthWeek: 1, timeRanges: [], reasonZh: '每月例休', reasonEn: 'Monthly closing day' },
];

const isEmpty = async (uid: string) => (await strapi.db.query(uid as any).count()) === 0;

async function seedAdminUsers() {
  if ((await strapi.db.query('admin::user').count()) > 0) return;
  const roles = strapi.service('admin::role');
  await roles.createRolesIfNoneExist();
  const superAdmin = await roles.getSuperAdmin();
  const editor = await strapi.db.query('admin::role').findOne({ where: { code: 'strapi-editor' } });
  const users = strapi.service('admin::user');
  await users.create({
    firstname: 'Clinic',
    lastname: 'Admin',
    email: process.env.DEMO_ADMIN_EMAIL || 'admin@clearlight.demo',
    password: process.env.DEMO_ADMIN_PASSWORD || 'Clearlight2026',
    isActive: true,
    roles: [superAdmin.id],
  });
  if (editor) {
    await users.create({
      firstname: 'Front',
      lastname: 'Desk',
      email: process.env.DEMO_FRONTDESK_EMAIL || 'frontdesk@clearlight.demo',
      password: process.env.DEMO_FRONTDESK_PASSWORD || 'Clearlight2026',
      isActive: true,
      roles: [editor.id],
    });
  }
  strapi.log.info('[seed] demo admin accounts created');
}

async function seedCalendarSettings() {
  const store = strapi.store({ environment: '', type: 'plugin', name: 'strapi-calendar' });
  const current = (await store.get({ key: 'settings' })) as { collection?: string } | null;
  if (current?.collection) return;
  await store.set({
    key: 'settings',
    value: {
      collection: UID.reservation,
      startField: 'startAt',
      endField: 'endAt',
      titleField: 'calendarTitle',
      colorField: 'calendarColor',
      defaultDuration: 30,
      drafts: true,
      startHour: '09:00',
      endHour: '19:30',
      defaultView: 'Week',
      monthView: true,
      weekView: true,
      workWeekView: false,
      dayView: true,
      todayButton: true,
      createButton: true,
      primaryColor: '#0F5C57',
      eventColor: '#0F5C57',
    },
  });
}

async function seedSampleBookings(doctorId: string) {
  if (!(await isEmpty(UID.reservation))) return;
  const patients = [
    { patientName: '陳大文（示範）', phone: '91234567', email: 'demo.chan@example.com', service: 'checkup' },
    { patientName: 'Mary Wong (demo)', phone: '62345678', email: 'mary.demo@example.com', service: 'implant', language: 'en' },
    { patientName: '李小姐（示範）', phone: '53456789', email: 'demo.lee@example.com', service: 'family' },
  ];
  const from = DateTime.now().setZone('Asia/Hong_Kong').plus({ days: 1 }).toISODate()!;
  for (const [i, p] of patients.entries()) {
    const days = (await availability({ service: p.service, from })).days.filter((d) => d.slots.length);
    const day = days[i];
    const slot = day?.slots[Math.min(2 + i * 3, day.slots.length - 1)];
    if (!slot) continue;
    const service = await strapi.db.query(UID.service).findOne({ where: { slug: p.service } });
    await runInternal(() =>
      strapi.documents(UID.reservation).create({
        data: {
          doctor: doctorId,
          service: service.documentId,
          startAt: slot.start,
          endAt: slot.end,
          kind: 'APPOINTMENT',
          bookingStatus: 'CONFIRMED',
          source: 'ADMIN',
          patientName: p.patientName,
          phone: p.phone,
          email: p.email,
          language: p.language ?? 'zh-HK',
          internalNote: '示範數據',
        } as any,
      })
    );
  }
}

export async function seed() {
  await seedAdminUsers();
  await seedCalendarSettings();

  if (await isEmpty(UID.setting)) {
    await strapi.documents(UID.setting).create({ data: { adminEmail: 'admin@clearlight.demo' } as any });
  }

  let doctor = await strapi.db.query(UID.doctor).findOne({ where: { slug: 'dr-chan' } });
  if (await isEmpty(UID.doctor)) {
    doctor = await strapi.documents(UID.doctor).create({
      data: { nameZh: '陳子朗醫生', nameEn: 'Dr Chan Tsz-long', slug: 'dr-chan', titleZh: '牙科醫生', titleEn: 'Dentist', color: '#0F5C57', sortOrder: 0 } as any,
    });
  }

  if (await isEmpty(UID.service)) {
    for (const s of SERVICES) {
      await strapi.documents(UID.service).create({ data: { ...s, bookable: true, doctors: doctor ? [doctor.documentId] : [] } as any });
    }
  }

  if (await isEmpty(UID.rule)) {
    for (const r of RULES) await strapi.documents(UID.rule).create({ data: { active: true, priority: 0, ...r } as any });
  }

  if (await isEmpty(UID.holiday)) {
    try {
      const { added } = await importHolidays();
      strapi.log.info(`[seed] imported ${added} Hong Kong public holidays from 1823`);
    } catch (err) {
      strapi.log.warn(`[seed] could not import public holidays: ${(err as Error).message}. Use 預約工具 → 排期預覽 → 立即 import later.`);
    }
  }

  if (doctor) await seedSampleBookings(doctor.documentId);
}
