const assert = require('node:assert/strict');

function event(name, startDate) {
  return { '@type': 'Event', name, startDate, endDate: startDate, location: 'Emerald City Comedy Club' };
}

const BASE_EVENTS = [
  event('Open Mic Night', '2026-12-02T03:00:00Z'),
  event('OPEN MIC (comedy)', '2026-12-23T03:00:00Z'),
  event('Weekly Open Mic', '2026-12-30T03:00:00Z'),
  event('Comedy Showcase', '2026-11-20T04:00:00Z'),
  event('Headliner Night', '2026-11-21T04:00:00Z'),
  event('Late Show', '2026-12-04T04:00:00Z'),
  event('New Material Night', '2026-12-05T04:00:00Z'),
  event('Holiday Special', '2026-12-11T04:00:00Z'),
  event('Club Favorite', '2026-12-12T04:00:00Z'),
  event('Big Name Drop-In', '2026-12-18T04:00:00Z'),
  event('Comedy Jam', '2026-12-19T04:00:00Z'),
  event('Year End Show', '2026-12-26T04:00:00Z')
];

async function main() {
  const { buildEmeraldSchedule } = await import('./scripts/update-emerald-city.mjs');
  const TODAY = '2026-11-12';

  const base = buildEmeraldSchedule(BASE_EVENTS, TODAY);

  assert.deepEqual(base.listedDates, ['2026-12-01', '2026-12-22', '2026-12-29']);
  assert.equal(base.confirmedThrough, '2026-12-31');
  assert.deepEqual(base.additionalDates, []);

  for (const dateKey of ['2026-11-17', '2026-11-24', '2026-12-08', '2026-12-15']) {
    assert.ok(base.skipDates.includes(dateKey), `expected ${dateKey} in skipDates`);
  }
  for (const dateKey of ['2026-12-01', '2026-12-22', '2026-12-29']) {
    assert.ok(!base.skipDates.includes(dateKey), `did not expect listed date ${dateKey} in skipDates`);
  }
  assert.deepEqual(base.skipDates, ['2026-11-17', '2026-11-24', '2026-12-08', '2026-12-15']);
  assert.ok(base.skipDates.every((dateKey) => dateKey <= '2026-12-31'));
  assert.ok(base.skipDates.every((dateKey) => dateKey > TODAY));

  // UTC vs Seattle: 2026-12-02T03:00:00Z is the evening of Dec 1 in Seattle.
  assert.ok(base.listedDates.includes('2026-12-01'));
  assert.ok(!base.listedDates.includes('2026-12-02'));

  // A non-Tuesday open mic lands in additionalDates and never in skipDates.
  const withWednesday = buildEmeraldSchedule(
    [...BASE_EVENTS, event('Midweek Open Mic', '2026-12-17T03:00:00Z')],
    TODAY
  );
  assert.deepEqual(withWednesday.additionalDates, ['2026-12-16']);
  assert.ok(withWednesday.listedDates.includes('2026-12-16'));
  assert.ok(!withWednesday.skipDates.includes('2026-12-16'));
  assert.deepEqual(withWednesday.skipDates, base.skipDates);

  // A bad fetch must never wipe the schedule.
  assert.throws(
    () => buildEmeraldSchedule(BASE_EVENTS.map((item) => ({ ...item, name: 'Comedy Showcase' })), TODAY),
    /No open mic events/
  );
  assert.throws(() => buildEmeraldSchedule(BASE_EVENTS.slice(0, 9), TODAY), /only 9 events/);

  console.log('test_update_emerald_city: all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
