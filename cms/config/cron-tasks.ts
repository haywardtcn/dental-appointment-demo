import { runJob, type JobName } from '../src/booking/jobs';

// Strapi runs these in-process; the demo runs a single instance (plan.md §9).
const every = (rule: string, name: JobName) => ({ [name]: { task: () => runJob(name), options: { rule, tz: 'Asia/Hong_Kong' } } });

export default {
  ...every('*/30 * * * * *', 'expireHolds'),
  ...every('*/30 * * * * *', 'dispatchOutbox'),
  ...every('0 * * * * *', 'waitlistMatch'),
  ...every('0 */15 * * * *', 'reminders'),
  ...every('0 10 * * * *', 'purgeAbandonedHolds'),
  ...every('0 5 0 * * *', 'expireWaitlist'),
  ...every('0 0 3 1 11 *', 'importHolidays'),
};
