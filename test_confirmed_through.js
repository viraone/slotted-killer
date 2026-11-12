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
  'normalizeDateKey',
  'normalizeOpenMicRecord',
  'getSeattleNow',
  'getWeekdayOccurrenceInMonth',
  'openMicOccursOnSeattleDate',
  'openMicIsPreviewCandidateForDate',
  'openMicIsUnconfirmedForDate',
  'getNextOpenMicOccurrenceDate',
  'formatCheckedAtDate'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

// Same shape getSeattleNow returns, and the same objects the other date tests use.
const seattleDate = (year, month, dayOfMonth, dayName) => ({ year, month, dayOfMonth, dayName });
const occurs = (mic, ...args) => context.openMicOccursOnSeattleDate(mic, seattleDate(...args));
const unconfirmed = (mic, ...args) => context.openMicIsUnconfirmedForDate(mic, seattleDate(...args));

// The bot's Emerald City record: Tuesdays only, a fortnightly gap in the
// posted schedule, and a calendar that stops at the end of December.
const horizonMic = context.normalizeOpenMicRecord({
  id: 'confirmed-through-mic',
  name: 'Confirmed Through Mic',
  timeSignupStart: '6pm/7pm',
  tuesday: 'Yes',
  showWhenInactive: true,
  recurrence: {
    type: 'weekly',
    weekday: 'Tuesday',
    skipDates: ['2026-11-17', '2026-11-24', '2026-12-08', '2026-12-15'],
    confirmedThrough: '2026-12-31',
    checkedAt: '2026-11-12'
  }
});
assert.ok(horizonMic, 'normalized confirmed-through mic exists');

// (a) Normalization keeps valid keys and nulls anything malformed.
assert.equal(horizonMic.recurrence.confirmedThrough, '2026-12-31',
  'a valid confirmedThrough survives normalization');
assert.equal(horizonMic.recurrence.checkedAt, '2026-11-12',
  'a valid checkedAt survives normalization');

const dirtyKeysMic = context.normalizeOpenMicRecord({
  name: 'Dirty Keys Mic',
  recurrence: { type: 'weekly', weekday: 'Tuesday', confirmedThrough: '2026-1-1', checkedAt: 20261112 }
});
assert.equal(dirtyKeysMic.recurrence.confirmedThrough, null,
  'a malformed confirmedThrough becomes null');
assert.equal(dirtyKeysMic.recurrence.checkedAt, null,
  'a non-string checkedAt becomes null');

const missingKeysMic = context.normalizeOpenMicRecord({
  name: 'Missing Keys Mic',
  recurrence: { type: 'weekly', weekday: 'Tuesday' }
});
assert.equal(missingKeysMic.recurrence.confirmedThrough, null,
  'a missing confirmedThrough becomes null');
assert.equal(missingKeysMic.recurrence.checkedAt, null,
  'a missing checkedAt becomes null');

const noRecurrenceMic = context.normalizeOpenMicRecord({ name: 'No Recurrence Mic' });
assert.equal(noRecurrenceMic.recurrence, null, 'a record without recurrence still normalizes');

assert.equal(context.normalizeDateKey(' 2026-12-31 '), '2026-12-31', 'a date key is trimmed');
assert.equal(context.normalizeDateKey('12/31/2026'), null, 'a non-ISO date is rejected');
assert.equal(context.normalizeDateKey(''), null, 'an empty date key is rejected');
assert.equal(context.normalizeDateKey(null), null, 'a null date key is rejected');
assert.equal(context.normalizeDateKey(20261231), null, 'a numeric date key is rejected');

// (b) Weekly Tuesdays occur up to the posted horizon, except the skipped ones.
assert.equal(occurs(horizonMic, 2026, 11, 10, 'Tuesday'), true,
  'a Tuesday before the skipped dates still occurs');
assert.equal(occurs(horizonMic, 2026, 12, 1, 'Tuesday'), true,
  'a listed Tuesday inside the horizon still occurs');
assert.equal(occurs(horizonMic, 2026, 11, 17, 'Tuesday'), false,
  'a skipped Tuesday inside the horizon does not occur');
assert.equal(occurs(horizonMic, 2026, 12, 8, 'Tuesday'), false,
  'a second skipped Tuesday inside the horizon does not occur');
assert.equal(occurs(horizonMic, 2027, 1, 5, 'Tuesday'), false,
  'a Tuesday past confirmedThrough does not occur');
assert.equal(occurs(horizonMic, 2027, 1, 12, 'Tuesday'), false,
  'later Tuesdays past confirmedThrough do not occur either');

// (c) Only days past the horizon become unconfirmed previews.
assert.equal(unconfirmed(horizonMic, 2027, 1, 5, 'Tuesday'), true,
  'a Tuesday past confirmedThrough is an unconfirmed preview');
assert.equal(context.openMicIsPreviewCandidateForDate(horizonMic, seattleDate(2027, 1, 5, 'Tuesday')), true,
  'the past-horizon Tuesday is still a preview candidate');
assert.equal(unconfirmed(horizonMic, 2026, 11, 17, 'Tuesday'), false,
  'a skipped day inside the horizon stays an ordinary not-happening preview');
assert.equal(unconfirmed(horizonMic, 2026, 12, 29, 'Tuesday'), false,
  'a Tuesday that occurs is not a preview at all');
assert.equal(unconfirmed(horizonMic, 2027, 1, 6, 'Wednesday'), false,
  'a day the mic never runs is never unconfirmed');
assert.equal(unconfirmed({ ...horizonMic, showWhenInactive: false }, 2027, 1, 5, 'Tuesday'), false,
  'a mic without showWhenInactive is never an unconfirmed preview');

const noHorizonMic = context.normalizeOpenMicRecord({
  id: 'no-horizon-mic',
  name: 'No Horizon Mic',
  timeSignupStart: '6pm/7pm',
  tuesday: 'Yes',
  showWhenInactive: true,
  recurrence: { type: 'weekly', weekday: 'Tuesday', skipDates: ['2026-11-17'] }
});
assert.equal(unconfirmed(noHorizonMic, 2027, 1, 5, 'Tuesday'), false,
  'a mic without confirmedThrough is never unconfirmed');
assert.equal(occurs(noHorizonMic, 2027, 1, 5, 'Tuesday'), true,
  'a mic without confirmedThrough keeps its old far-future behaviour');
assert.equal(occurs(noHorizonMic, 2026, 11, 17, 'Tuesday'), false,
  'its skipDates still apply');

// (d) Nothing is found past the horizon; before it, the skipped Tuesdays are
// jumped over. The bot also skips Nov 24 and Dec 15 (see
// test_update_emerald_city.js), so Nov 12 leads to Dec 1, not Nov 24.
const afterHorizon = context.getNextOpenMicOccurrenceDate(
  horizonMic,
  new Date('2026-12-29T12:00:00-08:00')
);
assert.equal(afterHorizon, null, 'no next occurrence exists past the posted horizon');

const nextFromNov12 = context.getNextOpenMicOccurrenceDate(
  horizonMic,
  new Date('2026-11-12T12:00:00-08:00')
);
assert.ok(nextFromNov12, 'a next occurrence is found before the horizon');
assert.equal(nextFromNov12.toISOString().slice(0, 10), '2026-12-01',
  'the next occurrence jumps over the skipped November Tuesdays');

// (e) The checked-at note has a month abbreviation and no leading zero.
assert.equal(context.formatCheckedAtDate('2026-11-12'), 'Nov 12',
  'a date key formats as month abbreviation plus day');
assert.equal(context.formatCheckedAtDate('2026-12-03'), 'Dec 3',
  'the day never keeps a leading zero');
assert.equal(context.formatCheckedAtDate(''), '', 'an empty date key formats as empty text');
assert.equal(context.formatCheckedAtDate('not-a-date'), '', 'a malformed date key formats as empty text');

console.log('PASS: confirmedThrough caps recurrence, drives unconfirmed previews, and checkedAt formats');
