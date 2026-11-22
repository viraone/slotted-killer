const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);

const start = source.indexOf('function pickOpenMicSearchHighlightId(');
assert.ok(start >= 0, 'pickOpenMicSearchHighlightId exists in app.js');
const end = source.indexOf('\nfunction ', start + 1);
vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);

const pick = context.pickOpenMicSearchHighlightId;
const D = new Date(2026, 10, 23);
const D2 = new Date(2026, 10, 24);

// 1. Empty entries -> null
assert.equal(pick([], 600), null);

// 2. Single entry not today with no date -> null
assert.equal(pick([{ mic: { id: 'x', startMinutes: 1200 }, isToday: false, date: null }], 600), null);

// 3. No entry today: the earliest start on the soonest date wins
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1260 }, isToday: false, date: D },
      { mic: { id: 'b', startMinutes: 1080 }, isToday: false, date: D }
    ],
    600
  ),
  'b'
);

// 4. Today, none started yet: earliest today wins
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1080 }, isToday: true, date: D },
      { mic: { id: 'b', startMinutes: 1200 }, isToday: true, date: D }
    ],
    600
  ),
  'a'
);

// 5. Today, some started: most recently started tier wins
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1080 }, isToday: true, date: D },
      { mic: { id: 'b', startMinutes: 1200 }, isToday: true, date: D },
      { mic: { id: 'c', startMinutes: 1320 }, isToday: true, date: D }
    ],
    1210
  ),
  'b'
);

// 6. Tie in the started tier: first in sort order wins
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1080 }, isToday: true, date: D },
      { mic: { id: 'b', startMinutes: 1200 }, isToday: true, date: D },
      { mic: { id: 'c', startMinutes: 1200 }, isToday: true, date: D }
    ],
    1210
  ),
  'b'
);

// 7. signupMinutes used when startMinutes is missing
assert.equal(
  pick(
    [
      { mic: { id: 's', signupMinutes: 1080 }, isToday: true, date: D },
      { mic: { id: 't', startMinutes: 1200 }, isToday: true, date: D }
    ],
    1100
  ),
  's'
);

// 8. Today's started entry wins over a later date
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 600 }, isToday: true, date: D },
      { mic: { id: 'z', startMinutes: 540 }, isToday: false, date: D }
    ],
    700
  ),
  'a'
);

// 9. Today, none started, list not in time order: the earliest start wins
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1200 }, isToday: true, date: D },
      { mic: { id: 'b', startMinutes: 1080 }, isToday: true, date: D }
    ],
    600
  ),
  'b'
);

// 10. Today, some started, list not in time order: the most recently started wins
assert.equal(
  pick(
    [
      { mic: { id: 'c', startMinutes: 1320 }, isToday: true, date: D },
      { mic: { id: 'a', startMinutes: 1080 }, isToday: true, date: D },
      { mic: { id: 'b', startMinutes: 1200 }, isToday: true, date: D }
    ],
    1210
  ),
  'b'
);

// 11. No entry today, two dates: only the soonest date is considered
assert.equal(
  pick(
    [
      { mic: { id: 'a', startMinutes: 1260 }, isToday: false, date: D },
      { mic: { id: 'b', startMinutes: 1080 }, isToday: false, date: D2 }
    ],
    600
  ),
  'a'
);

console.log('test_open_mic_search_highlight.js passed');
