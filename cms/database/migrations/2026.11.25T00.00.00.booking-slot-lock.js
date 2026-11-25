'use strict';

// Strapi does not manage this table. It holds one row per reservation that occupies time,
// and the exclusion constraint makes double booking impossible at the database level (plan.md §5.2).
module.exports = {
  async up(knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS booking_slot_lock (
        reservation_document_id text PRIMARY KEY,
        doctor_document_id      text NOT NULL,
        period                  tstzrange NOT NULL,
        kind                    text NOT NULL,
        expires_at              timestamptz,
        active                  boolean NOT NULL DEFAULT true,
        CONSTRAINT booking_slot_lock_no_overlap
          EXCLUDE USING gist (doctor_document_id WITH =, period WITH &&) WHERE (active)
      )
    `);
    await knex.raw(
      'CREATE INDEX IF NOT EXISTS booking_slot_lock_active_idx ON booking_slot_lock (doctor_document_id) WHERE active'
    );
  },
};
