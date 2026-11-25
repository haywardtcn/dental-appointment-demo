import { expireHolds, importHolidays, purgeAbandonedHolds, sendReminders } from './admin';
import { dispatchOutbox } from './notify';
import { expireOffers, expireOldEntries, matchWaitlist } from './waitlist';

/** Cron jobs (plan.md §9). Each is safe to run again; a failure is logged and the next run retries. */
export const jobs = {
  expireHolds: async () => {
    await expireHolds();
    await expireOffers();
  },
  dispatchOutbox,
  waitlistMatch: () => matchWaitlist(),
  reminders: sendReminders,
  purgeAbandonedHolds,
  expireWaitlist: expireOldEntries,
  importHolidays,
};

export type JobName = keyof typeof jobs;

const running = new Set<JobName>();

export async function runJob(name: JobName) {
  // Skip a tick while the previous run of the same job is still going.
  if (running.has(name)) return;
  running.add(name);
  try {
    await jobs[name]();
  } catch (err) {
    strapi.log.error(`[job:${name}] ${(err as Error).stack ?? err}`);
  } finally {
    running.delete(name);
  }
}
