const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
// Share the host Date so Date objects created by the test satisfy instanceof
// inside the VM realm.
const context = { Date };
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
  'getOpenMicHoliday',
  'getOpenMicHolidayStatus'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

// VM objects live in another realm, so plain clone them before deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));
const dateAtSeattleNoon = (isoDate) => new Date(`${isoDate}T20:00:00Z`);
const holidayName = (date) => {
  const holiday = context.getOpenMicHoliday(date);
  return holiday ? holiday.name : null;
};
const micRecord = (overrides = {}) => context.normalizeOpenMicRecord({
  id: 'holiday-test-mic',
  name: 'Holiday Test Mic',
  thursday: 'yes',
  recurrence: { type: 'weekly', weekday: 'Thursday' },
  ...overrides
});
const status = (mic, date) => context.getOpenMicHolidayStatus(mic, date);

// Each labelled holiday, by Seattle calendar date.
const thanksgiving2026 = dateAtSeattleNoon('2026-11-26');
const christmasEve2026 = dateAtSeattleNoon('2026-12-24');
const christmasDay2026 = dateAtSeattleNoon('2026-12-25');
const newYearsEve2026 = dateAtSeattleNoon('2026-12-31');
const newYearsDay2027 = dateAtSeattleNoon('2027-01-01');

assert.deepEqual(plain(context.getOpenMicHoliday(thanksgiving2026)), { name: 'Thanksgiving' },
  'the fourth Thursday of November is Thanksgiving');
assert.equal(holidayName(christmasEve2026), 'Christmas Eve', 'December 24 is Christmas Eve');
assert.equal(holidayName(christmasDay2026), 'Christmas Day', 'December 25 is Christmas Day');
assert.equal(holidayName(newYearsEve2026), "New Year's Eve", 'December 31 is New Year\'s Eve');
assert.equal(holidayName(newYearsDay2027), "New Year's Day", 'January 1 is New Year\'s Day');
assert.equal(holidayName(dateAtSeattleNoon('2027-11-25')), 'Thanksgiving',
  'Thanksgiving still lands on the fourth Thursday in another year');

assert.equal(holidayName(dateAtSeattleNoon('2026-11-25')), null, 'an ordinary Wednesday is not a holiday');
assert.equal(holidayName(dateAtSeattleNoon('2026-12-23')), null, 'the day before Christmas Eve is not a holiday');
assert.equal(holidayName(dateAtSeattleNoon('2027-01-02')), null, 'the day after New Year\'s Day is not a holiday');
assert.equal(holidayName(new Date('2027-01-01T04:00:00Z')), "New Year's Eve",
  'a UTC date that is still December 31 in Seattle is New Year\'s Eve');
assert.equal(context.getOpenMicHoliday(null), null, 'a missing date is not a holiday');
assert.equal(context.getOpenMicHoliday(new Date('not a date')), null, 'an invalid date is not a holiday');

// A Thursday mic on holidays: unconfirmed by default, null on a normal day or
// on a holiday it does not normally run.
const weeklyThursday = micRecord();
assert.deepEqual(plain(weeklyThursday.holidayConfirmed), {},
  'a mic without holiday confirmations normalizes to an empty object');
assert.equal(status(weeklyThursday, thanksgiving2026), 'unconfirmed',
  'a Thursday mic on Thanksgiving is unconfirmed');
assert.equal(status(weeklyThursday, christmasEve2026), 'unconfirmed',
  'a Thursday mic on Christmas Eve is unconfirmed');
assert.equal(status(weeklyThursday, dateAtSeattleNoon('2026-11-25')), null,
  'a normal day has no holiday status');
assert.equal(status(weeklyThursday, christmasDay2026), null,
  'a Thursday mic has no holiday status on Christmas Day, a Friday');

// A holiday confirmation survives normalization and marks the date confirmed.
const confirmedMic = micRecord({
  holidayConfirmed: {
    '2026-11-26': { confirmedOn: '2026-11-20', source: 'host' },
    '2026-12-24': { confirmedOn: '2026-12-18', source: 'venue-post' }
  }
});
assert.deepEqual(plain(confirmedMic.holidayConfirmed), {
  '2026-11-26': { confirmedOn: '2026-11-20', source: 'host' },
  '2026-12-24': { confirmedOn: '2026-12-18', source: 'venue-post' }
}, 'valid holiday confirmations are kept');
assert.equal(status(confirmedMic, thanksgiving2026), 'confirmed', 'a host confirmation marks Thanksgiving confirmed');
assert.equal(status(confirmedMic, christmasEve2026), 'confirmed', 'a venue post marks Christmas Eve confirmed');

// A skip date marks the mic off, and it wins over a confirmation.
const offMic = micRecord({
  recurrence: { type: 'weekly', weekday: 'Thursday', skipDates: ['2026-11-26'] }
});
assert.equal(status(offMic, thanksgiving2026), 'off', 'a skipped holiday is off');
assert.equal(status(offMic, christmasEve2026), 'unconfirmed', 'the skip only applies to its own date');

const skippedAndConfirmed = micRecord({
  recurrence: { type: 'weekly', weekday: 'Thursday', skipDates: ['2026-11-26'] },
  holidayConfirmed: { '2026-11-26': { confirmedOn: '2026-11-20', source: 'host' } }
});
assert.equal(status(skippedAndConfirmed, thanksgiving2026), 'off',
  'a skip date beats a holiday confirmation');

// Ignoring skipDates must not turn a mic that never runs that weekday into off.
const mondayMicSkippingThanksgiving = micRecord({
  thursday: '',
  monday: 'yes',
  recurrence: { type: 'weekly', weekday: 'Monday', skipDates: ['2026-11-26'] }
});
assert.equal(status(mondayMicSkippingThanksgiving, thanksgiving2026), null,
  'a Monday mic is not labelled on a skipped Thursday holiday');

// An unposted venue calendar is exactly the unconfirmed case, not a cancellation.
const postedThroughMic = micRecord({
  recurrence: { type: 'weekly', weekday: 'Thursday', confirmedThrough: '2026-11-19' }
});
assert.equal(status(postedThroughMic, thanksgiving2026), 'unconfirmed',
  'an unposted venue calendar leaves the holiday unconfirmed');

// Malformed holidayConfirmed values normalize away and never confirm a date.
const badHolidayConfirmedValues = [
  undefined,
  null,
  'yes',
  42,
  [],
  ['2026-11-26'],
  { '2026-11-26': null },
  { '2026-11-26': 'host' },
  { '2026-11-26': [] },
  { '2026-11-26': { confirmedOn: '11/20/2026', source: 'host' } },
  { '2026-11-26': { confirmedOn: '2026-11-20', source: 'friend' } },
  { '2026-11-26': { source: 'host' } },
  { 'not-a-date': { confirmedOn: '2026-11-20', source: 'host' } }
];
badHolidayConfirmedValues.forEach((value, index) => {
  const mic = micRecord({ holidayConfirmed: value });
  assert.deepEqual(plain(mic.holidayConfirmed), {},
    `bad holidayConfirmed input #${index} normalizes to an empty object`);
  assert.equal(status(mic, thanksgiving2026), 'unconfirmed',
    `bad holidayConfirmed input #${index} cannot confirm the holiday`);
});

const paddedConfirmation = micRecord({
  holidayConfirmed: { '2026-11-26': { confirmedOn: ' 2026-11-20 ', source: 'venue-post' } }
});
assert.deepEqual(plain(paddedConfirmation.holidayConfirmed), {
  '2026-11-26': { confirmedOn: '2026-11-20', source: 'venue-post' }
}, 'confirmation dates are trimmed');
assert.equal(status(paddedConfirmation, thanksgiving2026), 'confirmed',
  'a padded confirmation still confirms the holiday');

// Missing or invalid inputs return null instead of throwing.
assert.equal(status(null, thanksgiving2026), null, 'a missing mic has no holiday status');
assert.equal(status(weeklyThursday, null), null, 'a missing date has no holiday status');
assert.equal(status(weeklyThursday, new Date('not a date')), null, 'an invalid date has no holiday status');

console.log('PASS: holiday dates and open mic holiday statuses are labelled by the Seattle calendar');
