// 50 requests race for the same slot; exactly one may get it (plan.md §12).
// Run with the server started as BOOKING_RATE_LIMIT=off, then: node scripts/concurrency-test.mjs
const API = process.env.API_URL || 'http://localhost:1337/api/booking';
const N = Number(process.env.N || 50);

const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const avail = await (await fetch(`${API}/availability?service=checkup&from=${day}&to=${day}`)).json();
const slot = avail.days.find((d) => d.slots.length)?.slots.at(-1);
if (!slot) throw new Error(`no free slot on ${day}`);

const results = await Promise.all(
  Array.from({ length: N }, () =>
    fetch(`${API}/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'checkup', doctor: 'any', startAt: slot.start }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }))
  )
);

const won = results.filter((r) => r.status === 201);
const byStatus = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`slot ${slot.start}: ${JSON.stringify(byStatus)}`);
for (const w of won) {
  await fetch(`${API}/holds/${w.body.holdId}`, { method: 'DELETE', headers: { 'x-hold-token': w.body.holdToken } });
}
if (won.length !== 1) {
  console.error(`FAIL: ${won.length} requests got the slot`);
  process.exit(1);
}
console.log('PASS: exactly one hold');
