const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);

const start = source.indexOf('function buildOpenMicSearchCountSentence(');
assert.ok(start >= 0, 'buildOpenMicSearchCountSentence exists in app.js');
const end = source.indexOf('\nfunction ', start + 1);
vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);

const build = context.buildOpenMicSearchCountSentence;
const sentenceOf = (parts) => parts.map((part) => {
  if (part.type === 'count' || part.type === 'separator') return part.text;
  if (part.type === 'space') return ' ';
  if (part.type === 'day') return part.commaAfter ? `${part.name},` : part.name;
  throw new Error(`Unexpected part type: ${part.type}`);
}).join('');
const dayParts = (parts) => parts.filter((part) => part.type === 'day');
const separatorParts = (parts) => parts.filter((part) => part.type === 'separator');

// deepStrictEqual compares prototypes too, and parts built inside the vm
// context carry that realm's Array/Object prototypes. Round-trip through JSON
// so the comparison works across realms without loosening any assertion.
const toHost = (value) => JSON.parse(JSON.stringify(value));
const assertDeepEqual = (actual, expected) => assert.deepEqual(toHost(actual), expected);

// One day: the count line ends with "on" and the day pill.
assert.equal(sentenceOf(build(1, ['Tuesday'])), '1 open mic found on Tuesday');
assert.equal(sentenceOf(build(3, ['Tuesday'])), '3 open mics found on Tuesday');
assert.equal(separatorParts(build(1, ['Tuesday'])).length, 0);

// Two days: "and" is a separator span.
const twoDays = build(2, ['Sunday', 'Monday']);
assert.equal(sentenceOf(twoDays), '2 open mics found on Sunday and Monday');
assertDeepEqual(separatorParts(twoDays), [{ type: 'separator', text: 'and' }]);
assertDeepEqual(dayParts(twoDays).map(({ name, commaAfter }) => [name, commaAfter]), [
  ['Sunday', false],
  ['Monday', false]
]);

// Three days: the comma has no space before it and is wrapped with its pill;
// only the last pair gets "and".
const threeDays = build(3, ['Sunday', 'Monday', 'Friday']);
assert.equal(sentenceOf(threeDays), '3 open mics found on Sunday, Monday and Friday');
assertDeepEqual(dayParts(threeDays).map(({ name, commaAfter }) => [name, commaAfter]), [
  ['Sunday', true],
  ['Monday', false],
  ['Friday', false]
]);
assertDeepEqual(separatorParts(threeDays), [{ type: 'separator', text: 'and' }]);

// Four or more days: "Jump to:" and then the pills with no commas or "and".
const fourDays = build(12, ['Sunday', 'Monday', 'Tuesday', 'Wednesday']);
assert.equal(
  sentenceOf(fourDays),
  '12 open mics found. Jump to: Sunday Monday Tuesday Wednesday'
);
assertDeepEqual(dayParts(fourDays).map(({ name }) => name), [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday'
]);
assert.equal(separatorParts(fourDays).length, 0);
assert.equal(dayParts(fourDays).some(({ commaAfter }) => commaAfter), false);
assertDeepEqual(fourDays[0], { type: 'count', text: '12 open mics found. Jump to:' });

// No day names: just the count sentence.
assert.equal(sentenceOf(build(2, [])), '2 open mics found');
assert.equal(sentenceOf(build(1, [])), '1 open mic found');
assertDeepEqual(build(2, []), [{ type: 'count', text: '2 open mics found' }]);

// Zero results keep today's plain "0 open mics" count span.
assertDeepEqual(build(0, []), [{ type: 'count', text: '0 open mics' }]);
assert.equal(sentenceOf(build(0, ['Sunday'])), '0 open mics');

// City name cases
assert.equal(sentenceOf(build(1, ['Tuesday'], 'Renton')), '1 open mic found in Renton on Tuesday');
assert.equal(sentenceOf(build(2, ['Sunday', 'Monday'], 'Renton')), '2 open mics found in Renton on Sunday and Monday');
assert.equal(sentenceOf(build(3, ['Sunday', 'Monday', 'Friday'], 'Renton')), '3 open mics found in Renton on Sunday, Monday and Friday');
assert.equal(
  sentenceOf(build(12, ['Sunday', 'Monday', 'Tuesday', 'Wednesday'], 'Renton')),
  '12 open mics found in Renton. Jump to: Sunday Monday Tuesday Wednesday'
);
assert.equal(sentenceOf(build(2, [], 'Renton')), '2 open mics found in Renton');
assert.equal(sentenceOf(build(1, [], 'Renton')), '1 open mic found in Renton');
assertDeepEqual(build(2, [], 'Renton'), [{ type: 'count', text: '2 open mics found in Renton' }]);
assertDeepEqual(build(0, [], 'Renton'), [{ type: 'count', text: '0 open mics found in Renton' }]);
assert.equal(sentenceOf(build(0, ['Sunday'], 'Renton')), '0 open mics found in Renton');

console.log('test_search_count_sentence.js passed');
