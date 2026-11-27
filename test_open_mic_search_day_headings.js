const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
// Share the host Date so dates created by the test satisfy instanceof inside
// the VM realm.
const context = { Date };
vm.createContext(context);

for (const name of [
  'getSeattleNow',
  'buildOpenMicSearchDayHeading'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

// Friday 2026-11-27, 20:00 UTC is still Friday in Seattle.
const NOW = new Date(Date.UTC(2026, 10, 27, 20));
const heading = (date) => context.buildOpenMicSearchDayHeading(date, NOW);

const today = heading(new Date(Date.UTC(2026, 10, 27, 20)));
assert.equal(String(today.day), 'Friday');
assert.equal(String(today.detail), 'Nov 27 · Today');

const tomorrow = heading(new Date(Date.UTC(2026, 10, 28, 20)));
assert.equal(String(tomorrow.day), 'Saturday');
assert.equal(String(tomorrow.detail), 'Nov 28 · Tomorrow');

const inTwoDays = heading(new Date(Date.UTC(2026, 10, 29, 20)));
assert.equal(String(inTwoDays.day), 'Sunday');
assert.equal(String(inTwoDays.detail), 'Nov 29 · in 2 days');

const missing = heading(null);
assert.equal(String(missing.day), 'Date not posted');
assert.equal(String(missing.detail), '');

console.log('test_open_mic_search_day_headings.js passed');
