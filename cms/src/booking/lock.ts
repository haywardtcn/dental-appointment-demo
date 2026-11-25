import { errors } from '@strapi/utils';
import type { Busy } from './schedule';
import { ACTIVE_STATUSES } from './util';

/**
 * booking_slot_lock mirrors every reservation that occupies time. Its exclusion constraint is what
 * actually prevents double booking (plan.md §5.2); availability checks are only a first filter.
 */

export interface LockSource {
  documentId: string;
  doctorDocumentId: string;
  startAt: Date | string;
  blockedUntil: Date | string;
  status: string;
  kind: string;
  expiresAt: Date | string | null;
}

export const SLOT_TAKEN = 'SLOT_TAKEN';

export function isSlotTaken(err: unknown): boolean {
  const e = err as { details?: { code?: string }; code?: string } | null;
  return e?.details?.code === SLOT_TAKEN || e?.code === '23P01';
}

type Knex = any;

/** Keeps the lock row in step with the reservation, inside the caller's transaction. */
export async function syncLock(trx: Knex, r: LockSource): Promise<void> {
  const active = ACTIVE_STATUSES.includes(r.status);
  if (!active) {
    await trx.raw('UPDATE booking_slot_lock SET active = false WHERE reservation_document_id = ?', [r.documentId]);
    return;
  }

  const kind = r.kind === 'BLOCK' ? 'BLOCK' : r.status === 'HELD' ? 'HOLD' : 'BOOKED';
  const start = new Date(r.startAt).toISOString();
  const end = new Date(r.blockedUntil).toISOString();

  // The constraint cannot use now(), so holds that have run out are cleared here before claiming the time.
  const stale = await trx.raw(
    `UPDATE booking_slot_lock SET active = false
      WHERE doctor_document_id = ? AND active AND kind = 'HOLD' AND expires_at < now()
        AND period && tstzrange(?, ?, '[)') AND reservation_document_id <> ?
      RETURNING reservation_document_id`,
    [r.doctorDocumentId, start, end, r.documentId]
  );
  const staleIds = stale.rows.map((row: { reservation_document_id: string }) => row.reservation_document_id);
  if (staleIds.length) {
    await trx('reservations').whereIn('document_id', staleIds).andWhere('status', 'HELD').update({ status: 'EXPIRED' });
  }

  try {
    // A savepoint keeps the surrounding transaction usable when the constraint rejects the row.
    await trx.raw('SAVEPOINT slot_lock');
    await trx.raw(
      `INSERT INTO booking_slot_lock (reservation_document_id, doctor_document_id, period, kind, expires_at, active)
       VALUES (?, ?, tstzrange(?, ?, '[)'), ?, ?, true)
       ON CONFLICT (reservation_document_id) DO UPDATE
         SET doctor_document_id = EXCLUDED.doctor_document_id, period = EXCLUDED.period,
             kind = EXCLUDED.kind, expires_at = EXCLUDED.expires_at, active = true`,
      [r.documentId, r.doctorDocumentId, start, end, kind, kind === 'HOLD' && r.expiresAt ? new Date(r.expiresAt).toISOString() : null]
    );
    await trx.raw('RELEASE SAVEPOINT slot_lock');
  } catch (err) {
    await trx.raw('ROLLBACK TO SAVEPOINT slot_lock');
    if ((err as { code?: string }).code === '23P01') {
      throw new errors.ApplicationError('呢個時段已經有預約或者已封鎖 · This time is already taken', { code: SLOT_TAKEN });
    }
    throw err;
  }
}

/** Occupied time per doctor in [from, to), ignoring holds that have run out. */
export async function busyByDoctor(doctorIds: string[], from: Date, to: Date): Promise<Map<string, Busy[]>> {
  const out = new Map<string, Busy[]>(doctorIds.map((id) => [id, []]));
  if (!doctorIds.length) return out;
  const res = await strapi.db.connection.raw(
    `SELECT doctor_document_id, lower(period) AS s, upper(period) AS e, kind
       FROM booking_slot_lock
      WHERE active AND (kind <> 'HOLD' OR expires_at > now())
        AND doctor_document_id = ANY(?) AND period && tstzrange(?, ?, '[)')`,
    [doctorIds, from.toISOString(), to.toISOString()]
  );
  for (const row of res.rows) {
    out.get(row.doctor_document_id)?.push({ start: new Date(row.s).getTime(), end: new Date(row.e).getTime(), kind: row.kind });
  }
  return out;
}
