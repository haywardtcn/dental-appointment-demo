import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { scheduleConflictScan } from './booking/admin';
import { invalidateScheduleData } from './booking/data';
import { reservationWrite } from './booking/reservations';
import { seed } from './booking/seed';
import { UID } from './booking/util';
import { waitlistWrite } from './booking/waitlist';

const WRITES = ['create', 'update', 'delete', 'publish', 'unpublish', 'discardDraft'];
// Types whose changes alter which times are bookable.
const SCHEDULE_TYPES: string[] = [UID.rule, UID.holiday, UID.setting, UID.doctor, UID.service];

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    // Every write goes through here, from the booking API and from the Content Manager alike (plan.md §5.3).
    strapi.documents.use(async (context, next) => {
      const { uid, action } = context as { uid: string; action: string };
      if (!WRITES.includes(action)) return next();

      if (uid === UID.reservation) {
        if (action === 'delete') throw new errors.ApplicationError('預約唔可以刪除，請將狀態改做「CANCELLED」· Bookings cannot be deleted; set the status to CANCELLED');
        if (action === 'create' || action === 'update') return reservationWrite(context, next);
      }
      if (uid === UID.waitlist && (action === 'create' || action === 'update')) return waitlistWrite(context, next);
      if (uid === UID.doctor && action === 'delete') {
        throw new errors.ApplicationError('醫生唔可以刪除，請將「active」關閉 · Dentists cannot be deleted; switch off active');
      }

      const result = await next();
      if (SCHEDULE_TYPES.includes(uid)) {
        invalidateScheduleData();
        scheduleConflictScan();
      }
      return result;
    });
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await seed();
    } catch (err) {
      strapi.log.error(`[seed] ${(err as Error).stack ?? err}`);
    }
  },
};
