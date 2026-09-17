const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);
for (const name of ['getWeekdayOccurrenceInMonth', 'openMicOccursOnSeattleDate']) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}
const records = JSON.parse(fs.readFileSync('data/open-mics.json', 'utf8'));
const mic = records.find(record => record.id === 'j-michaels-pub-and-eatery-15770-redmond-way-redmond-wa-98052');
assert.ok(mic);
const occurs = (month, dayOfMonth, dayName = 'Tuesday') => context.openMicOccursOnSeattleDate(mic, { year: 2026, month, dayOfMonth, dayName });
assert.equal(occurs(9, 15), true, 'September 15 exception appears');
assert.equal(occurs(9, 8), true, 'Second Tuesday remains active');
assert.equal(occurs(9, 22), true, 'Fourth Tuesday remains active');
assert.equal(occurs(9, 1), false, 'First Tuesday remains inactive');
assert.equal(occurs(9, 29), false, 'Fifth Tuesday remains inactive');
assert.equal(occurs(10, 20), false, 'Exception does not repeat next month');
assert.equal(occurs(9, 14, 'Monday'), false, 'Incorrect flyer date remains inactive');
assert.equal(mic.timeSignupStart, '7pm/7:30pm');
assert.equal(mic.host, 'Amy Staugh');

const risingStar = records.find(record => record.id === 'rising-star-comedy-phoenix-pub-12510-pacific-ave-s-tacoma-wa-98444');
assert.ok(risingStar);
const risingStarOccurs = (month, dayOfMonth) => context.openMicOccursOnSeattleDate(risingStar, {
  year: 2026,
  month,
  dayOfMonth,
  dayName: 'Tuesday'
});
assert.equal(risingStarOccurs(9, 22), false, 'Rising Star does not appear before its start date');
assert.equal(risingStarOccurs(10, 13), true, 'Rising Star appears on its start date');
assert.equal(risingStarOccurs(10, 27), true, 'Rising Star continues on the fourth Tuesday');
console.log('PASS: one-time date, regular recurrence, flyer details, and neighboring dates');
