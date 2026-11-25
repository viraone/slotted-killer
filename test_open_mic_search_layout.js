const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
// Share the host Date so dates created by the test satisfy instanceof inside
// the VM realm.
const context = { EARTH_RADIUS_MILES: 3958.8, Date };
vm.createContext(context);

for (const name of [
  'getSeattleNow',
  'formatSeattleIsoDate',
  'getWeekdayOccurrenceInMonth',
  'openMicOccursOnSeattleDate',
  'degreesToRadians',
  'calculateHaversineMiles',
  'getOpenMicSearchStartMinutes',
  'pickOpenMicSearchNearby',
  'formatOpenMicSearchCountdownLabel'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_DAYS_OFF = Object.fromEntries(DAYS.map((day) => [day, false]));
const makeMic = (id, overrides = {}) => ({
  id,
  name: overrides.name || id,
  venue: '',
  address: '',
  startMinutes: 1200,
  signupMinutes: null,
  endMinutes: null,
  latitude: 47.48,
  longitude: -122.2,
  recurrence: { type: 'weekly', weekday: 'Tuesday', skipDates: [] },
  ...overrides,
  days: { ...ALL_DAYS_OFF, ...(overrides.days || {}) }
});
const entryFor = (mic, date) => ({ mic, date, isToday: false, dayName: '', dateLabel: '' });

// Tuesday 2026-11-24, noon in Seattle. The matched mic's next result is
// Sunday 2026-12-06, so there are twelve earlier dates to search.
const NOW = new Date(Date.UTC(2026, 10, 24, 20));
const NEXT_RESULT = new Date(Date.UTC(2026, 11, 6, 20));
const matchedSunday = makeMic('matched-sunday', {
  days: { Sunday: true },
  recurrence: { type: 'weekly', weekday: 'Sunday', skipDates: [] }
});
const nextEntry = entryFor(matchedSunday, NEXT_RESULT);
const nearbyIds = (result) => result.results.map(({ mic }) => mic.id).join(',');

// Coordinates are required on every matched mic; without them there is no origin.
const noCoords = makeMic('no-coords', {
  latitude: null,
  longitude: null,
  days: { Tuesday: true }
});
const closeTuesday = makeMic('close-tuesday', { days: { Tuesday: true } });
assert.equal(
  context.pickOpenMicSearchNearby([noCoords, closeTuesday], [entryFor(noCoords, NEXT_RESULT)], NOW),
  null,
  'a matched mic without coordinates hides the nearby section'
);

// A mic just outside the 15 straight-line miles does not qualify.
const farTuesday = makeMic('far-tuesday', {
  latitude: 47.48 + 0.30,
  longitude: -122.2,
  days: { Tuesday: true }
});
assert.equal(
  context.pickOpenMicSearchNearby([farTuesday], [nextEntry], NOW),
  null,
  'nothing within 15 miles hides the nearby section'
);

// The section is only for one to three matched mics.
const fourEntries = ['a', 'b', 'c', 'd'].map((id) => entryFor(
  makeMic(id, { days: { Tuesday: true } }),
  NEXT_RESULT
));
assert.equal(
  context.pickOpenMicSearchNearby([], fourEntries, NOW),
  null,
  'more than three matched mics hides the nearby section'
);

// The nearest three of that date are kept, then listed by start time.
const candidates = [
  makeMic('a', { latitude: 47.48 + 0.0145, days: { Tuesday: true }, startMinutes: 1200 }),
  makeMic('b', { latitude: 47.48 + 0.0290, days: { Tuesday: true }, startMinutes: 1080 }),
  makeMic('c', { latitude: 47.48 + 0.0435, days: { Tuesday: true }, startMinutes: 1140 }),
  makeMic('d', { latitude: 47.48 + 0.0580, days: { Tuesday: true }, startMinutes: 960 }),
  makeMic('e', { latitude: 47.48 + 0.0725, days: { Tuesday: true }, startMinutes: 900 })
];
const capped = context.pickOpenMicSearchNearby(candidates, [nextEntry], NOW);
assert.ok(capped, 'a nearby date is found');
assert.equal(capped.dateKey, '2026-11-24', 'the soonest date with a nearby mic wins');
assert.equal(nearbyIds(capped), 'b,c,a', 'the nearest three are kept and shown in start-time order');

// Today's mics that already started are skipped; later ones still qualify.
const startedTuesday = makeMic('started-tuesday', {
  latitude: 47.48 + 0.0145,
  days: { Tuesday: true },
  startMinutes: 660
});
const laterTuesday = makeMic('later-tuesday', {
  latitude: 47.48 + 0.0290,
  days: { Tuesday: true },
  startMinutes: 1140
});
const afterStart = context.pickOpenMicSearchNearby([startedTuesday, laterTuesday], [nextEntry], NOW);
assert.ok(afterStart, 'a later mic today still finds a nearby date');
assert.equal(nearbyIds(afterStart), 'later-tuesday', 'today\'s already-started mic is skipped');

// If any matched mic is still to come today, there is no nearby section.
const matchedTonight = makeMic('matched-tonight', {
  days: { Tuesday: true },
  startMinutes: 1140
});
assert.equal(
  context.pickOpenMicSearchNearby([matchedTonight], [entryFor(matchedTonight, NOW)], NOW),
  null,
  'a matched mic still to come today hides the nearby section'
);

// skipDates is respected before recurrence, so today falls through to next Tuesday.
const skippedToday = makeMic('skipped-today', {
  latitude: 47.48 + 0.0145,
  days: { Tuesday: true },
  recurrence: { type: 'weekly', weekday: 'Tuesday', skipDates: ['2026-11-24'] }
});
const afterSkip = context.pickOpenMicSearchNearby([skippedToday], [nextEntry], NOW);
assert.ok(afterSkip, 'a skipped today still searches later dates');
assert.equal(afterSkip.dateKey, '2026-12-01', 'the next non-skipped occurrence is used');
assert.equal(nearbyIds(afterSkip), 'skipped-today', 'the skipped mic appears on its next occurrence');

// The countdown label uses Seattle calendar days.
const countdown = (date) => context.formatOpenMicSearchCountdownLabel(date, NOW);
assert.equal(countdown(new Date(Date.UTC(2026, 10, 24, 20))), 'Today');
assert.equal(countdown(new Date(Date.UTC(2026, 10, 25, 3))), 'Today',
  'a UTC date that is still the same Seattle day stays Today');
assert.equal(countdown(new Date(Date.UTC(2026, 10, 25, 20))), 'Tomorrow');
assert.equal(countdown(new Date(Date.UTC(2026, 10, 26, 20))), 'Next up · in 2 days');
assert.equal(countdown(new Date(Date.UTC(2026, 10, 29, 20))), 'Next up · in 5 days');
assert.equal(countdown(NEXT_RESULT), 'Next up · in 12 days');
assert.equal(countdown(null), '');
assert.equal(countdown(new Date('not a date')), '');

console.log('test_open_mic_search_layout.js passed');
