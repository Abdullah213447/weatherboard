/**
 * Creates, or updates in place, the QStash schedule that triggers the
 * reminder sender. Safe to run again: the schedule has a fixed id, so a
 * second run replaces the first instead of adding a duplicate.
 *
 *   node scripts/reminder-schedule.mjs            create or update, then show it
 *   node scripts/reminder-schedule.mjs --trigger  also send one run now
 *   node scripts/reminder-schedule.mjs --logs     show recent deliveries and their answers
 *
 * Reads QSTASH_URL and QSTASH_TOKEN from .env.local. Those two stay on this
 * machine: the deployed functions only verify signatures and never need them.
 * Nothing secret is printed.
 */
import { Client } from '@upstash/qstash';

process.loadEnvFile(new URL('../.env.local', import.meta.url));

const SCHEDULE_ID = 'weatherboard-reminders';
const DESTINATION = `${process.env.VAPID_SUBJECT}/api/push/dispatch`;
const { QSTASH_URL: baseUrl, QSTASH_TOKEN: token } = process.env;
if (!baseUrl || !token || !process.env.VAPID_SUBJECT) {
  throw new Error('QSTASH_URL, QSTASH_TOKEN and VAPID_SUBJECT must be set in .env.local.');
}

const client = new Client({ baseUrl, token });
const flags = new Set(process.argv.slice(2));

await client.schedules.create({
  scheduleId: SCHEDULE_ID,
  destination: DESTINATION,
  cron: '*/5 * * * *',
  method: 'POST',
  body: '{}',
  headers: { 'content-type': 'application/json' },
  // No retries: anything still due is picked up by the next run five minutes later,
  // and a retry could overlap with it.
  retries: 0,
});

const schedules = await client.schedules.list();
const ours = schedules.filter((schedule) => schedule.destination === DESTINATION);
console.log(`${schedules.length} schedule(s) on the account; ${ours.length} for this app:`);
for (const schedule of ours) {
  console.log(
    `  id=${schedule.scheduleId} cron="${schedule.cron}" retries=${schedule.retries} paused=${schedule.isPaused ?? false}`,
  );
  console.log(`  destination=${schedule.destination}`);
}

if (flags.has('--trigger')) {
  const { messageId } = await client.publish({
    url: DESTINATION,
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
    retries: 0,
  });
  console.log(`triggered one run by hand: message ${messageId}`);
}

if (flags.has('--logs')) {
  const { logs } = await client.logs({ filter: { url: DESTINATION } });
  const delivered = logs.filter((entry) => ['DELIVERED', 'ERROR', 'FAILED'].includes(entry.state));
  console.log(`recent deliveries (${delivered.length}):`);
  for (const entry of delivered.slice(0, 8)) {
    const body = entry.responseBody ? String(entry.responseBody).slice(0, 200) : '';
    console.log(
      `  ${new Date(entry.time).toISOString()} ${entry.state} status=${entry.responseStatus ?? '-'} ${entry.scheduleId ? 'scheduled' : 'manual'} ${body}`,
    );
  }
}
