import * as admin from '../../../booking/admin';
import * as jobs from '../../../booking/jobs';

// Exposed as a service so the booking-admin plugin can reach the booking code without importing it.
export default () => ({ ...admin, ...jobs });
