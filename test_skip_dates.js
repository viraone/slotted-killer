const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);
context.OPEN_MIC_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
context.OPEN_MIC_COORDINATE_OVERRIDES = {};

for (const name of [
  'isOpenMicDayActive',
  'parseTimeStringToMinutes',
  'parseSignupStartTimes',
  'normalizeOpenMicContact',
  'normalizeHostSchedule',
  'normalizeSkipDates',
  'normalizeOpenMicRecord',
  'getSeattleNow',
  'getWeekdayOccurrenceInMonth',
  'openMicOccursOnSeattleDate',
  'openMicIsPreviewCandidateForDate',
  'getNextOpenMicOccurrenceDate',
  'getNotHappeningBadgeText'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

// Same shape getSeattleNow returns, and the same objects the other date tests use.
const seattleDate = (year, month, dayOfMonth, dayName) => ({ year, month, dayOfMonth, dayName });
const occurs = (mic, ...args) => context.openMicOccursOnSeattleDate(mic, seattleDate(...args));
const preview = (mic, ...args) => context.openMicIsPreviewCandidateForDate(mic, seattleDate(...args));
const badgeText = (mic, isToday, ...args) => context.getNotHappeningBadgeText(mic, seattleDate(...args), isToday);

// A weekly Monday/Thursday mic that is skipped on Thursday 2026-11-12.
const skipMic = context.normalizeOpenMicRecord({
  id: 'skip-test-mic',
  name: 'Skip Test Mic',
  timeSignupStart: '7pm/7:30pm',
  monday: 'yes',
  thursday: 'yes',
  showWhenInactive: true,
  recurrence: { type: 'weekly', weekday: 'Monday', skipDates: ['2026-11-12'] }
});
assert.ok(skipMic, 'normalized skip test mic exists');

const noSkipMic = context.normalizeOpenMicRecord({
  name: 'No Skip Mic',
  monday: 'yes',
  thursday: 'yes',
  showWhenInactive: true,
  recurrence: { type: 'weekly', weekday: 'Monday' }
});
assert.ok(noSkipMic, 'normalized no-skip mic exists');

// normalizeOpenMicRecord keeps skipDates as an array of date strings.
assert.deepEqual(Array.from(skipMic.recurrence.skipDates), ['2026-11-12'],
  'skipDates survive normalization');

const dirtySkipMic = context.normalizeOpenMicRecord({
  name: 'Dirty Skip Mic',
  recurrence: { type: 'weekly', weekday: 'Monday', skipDates: ['2026-11-12', 42, null, '', 'not-a-date'] }
});
assert.deepEqual(Array.from(dirtySkipMic.recurrence.skipDates), ['2026-11-12'],
  'non-string and malformed skip entries are dropped');

assert.deepEqual(Array.from(noSkipMic.recurrence.skipDates), [],
  'missing skipDates normalizes to an empty array');
assert.deepEqual(Array.from(context.normalizeSkipDates('2026-11-12')), [],
  'a non-array skipDates normalizes to an empty array');
assert.equal(context.normalizeSkipDates(undefined).length, 0,
  'undefined skipDates normalizes to an empty array');

// A skip beats the weekly day flags, and the other Thursdays still run.
assert.equal(occurs(skipMic, 2026, 11, 5, 'Thursday'), true,
  'Thursday before the skip still occurs');
assert.equal(occurs(skipMic, 2026, 11, 12, 'Thursday'), false,
  'a skipped date never occurs');
assert.equal(occurs(skipMic, 2026, 11, 16, 'Monday'), true,
  'the Monday recurrence is unaffected');
assert.equal(occurs(skipMic, 2026, 11, 19, 'Thursday'), true,
  'the next Thursday occurs again');

// Missing, empty and junk skipDates change nothing and never crash.
assert.equal(occurs(noSkipMic, 2026, 11, 12, 'Thursday'), true,
  'a mic without skipDates keeps its normal behaviour');
assert.equal(occurs({ ...skipMic, recurrence: { ...skipMic.recurrence, skipDates: [] } },
  2026, 11, 12, 'Thursday'), true, 'an empty skipDates list has no effect');
assert.equal(occurs({ ...skipMic, recurrence: { ...skipMic.recurrence, skipDates: [42, null, {}] } },
  2026, 11, 12, 'Thursday'), true, 'non-string skipDates entries have no effect');
assert.equal(occurs({ ...skipMic, recurrence: { ...skipMic.recurrence, skipDates: '2026-11-12' } },
  2026, 11, 12, 'Thursday'), true, 'a non-array skipDates is ignored');

// A date in both skipDates and additionalDates is skipped.
const bothMic = context.normalizeOpenMicRecord({
  name: 'Skip Plus Extra Date',
  friday: 'yes',
  recurrence: { type: 'weekly', weekday: 'Monday', additionalDates: ['2026-11-20'], skipDates: ['2026-11-20'] }
});
assert.ok(bothMic, 'normalized skip-plus-additional mic exists');
assert.equal(occurs(bothMic, 2026, 11, 20, 'Friday'), false,
  'a skip wins over an additional date');

// The next occurrence after a skipped date skips over it.
const nextAfterSkip = context.getNextOpenMicOccurrenceDate(skipMic, new Date('2026-11-12T12:00:00-08:00'));
assert.ok(nextAfterSkip, 'a next occurrence is found');
assert.equal(nextAfterSkip.toISOString().slice(0, 10), '2026-11-16',
  'the next occurrence jumps from the skipped Thursday to Monday');

// Preview cards: skipped Thursday previews; a normal Thursday or a Tuesday does not.
assert.equal(preview(skipMic, 2026, 11, 12, 'Thursday'), true,
  'the skipped Thursday is a locked preview');
assert.equal(preview(skipMic, 2026, 11, 5, 'Thursday'), false,
  'a Thursday the mic runs is not a preview');
assert.equal(preview(skipMic, 2026, 11, 10, 'Tuesday'), false,
  'a day the mic never runs is not a preview');
assert.equal(preview({ ...skipMic, showWhenInactive: false }, 2026, 11, 12, 'Thursday'), false,
  'a mic without showWhenInactive is never a preview');

// Badge text.
assert.equal(badgeText(skipMic, false, 2026, 11, 12, 'Thursday'), 'Not on the November list',
  'a skipped date names the month it is off');
assert.equal(badgeText(skipMic, true, 2026, 11, 12, 'Thursday'), 'Not on the November list',
  'the month wording holds for today too');
assert.equal(badgeText(noSkipMic, false, 2026, 11, 5, 'Thursday'), 'Not happening this Thursday',
  'the original day wording is unchanged');
assert.equal(badgeText(noSkipMic, true, 2026, 11, 5, 'Thursday'), 'Not happening tonight',
  'the original tonight wording is unchanged');

console.log('PASS: skip dates are normalized, override recurrence, drive preview cards and badge text');
