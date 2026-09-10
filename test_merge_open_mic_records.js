const fs = require('fs');

const appSource = fs.readFileSync('app.js', 'utf8');
const functionStart = appSource.indexOf('function mergeOpenMicRecords(');
const functionEnd = appSource.indexOf('async function fetchPublishedOpenMicRecords(', functionStart);

if (functionStart === -1 || functionEnd === -1) {
  console.error('Could not find mergeOpenMicRecords function in app.js');
  process.exit(1);
}

eval(appSource.slice(functionStart, functionEnd));

const file = (id, extra = {}) => ({ id, name: `${id} from file`, ...extra });
const published = (id, extra = {}) => ({ id, name: `${id} from Supabase`, ...extra });

const testCases = [
  {
    name: 'published mics are appended after the file records',
    fileRecords: [file('a'), file('b')],
    publishedRecords: [published('c')],
    expected: ['a from file', 'b from file', 'c from Supabase']
  },
  {
    name: 'the JSON file wins an id collision',
    fileRecords: [file('a')],
    publishedRecords: [published('a')],
    expected: ['a from file']
  },
  {
    name: 'id matching ignores case and surrounding whitespace',
    fileRecords: [file('Broadview-Tap-House')],
    publishedRecords: [published('  broadview-tap-house  ')],
    expected: ['Broadview-Tap-House from file']
  },
  {
    name: 'records without an id are all kept, since they cannot collide',
    fileRecords: [{ name: 'no id one' }, { name: 'no id two' }],
    publishedRecords: [{ name: 'no id three' }],
    expected: ['no id one', 'no id two', 'no id three']
  },
  {
    name: 'malformed rows are dropped',
    fileRecords: [file('a'), null, 'nope', ['also nope']],
    publishedRecords: [undefined, published('b')],
    expected: ['a from file', 'b from Supabase']
  },
  {
    name: 'a missing published list still returns the file records',
    fileRecords: [file('a')],
    publishedRecords: null,
    expected: ['a from file']
  },
  {
    name: 'a missing file list still returns the published records',
    fileRecords: undefined,
    publishedRecords: [published('a')],
    expected: ['a from Supabase']
  }
];

let allPassed = true;

for (const testCase of testCases) {
  const merged = mergeOpenMicRecords(testCase.fileRecords, testCase.publishedRecords);
  const actual = merged.map((record) => record.name);
  if (JSON.stringify(actual) === JSON.stringify(testCase.expected)) {
    console.log(`PASS: ${testCase.name}`);
  } else {
    console.error(`FAIL: ${testCase.name}`);
    console.error(`  expected ${JSON.stringify(testCase.expected)}`);
    console.error(`  got      ${JSON.stringify(actual)}`);
    allPassed = false;
  }
}

// The real file is the other half of the merge: duplicate ids in it would mean a
// record silently disappearing from the site.
const records = JSON.parse(fs.readFileSync('data/open-mics.json', 'utf8'));
const ids = records.map((record) => String(record.id || '').trim().toLowerCase()).filter(Boolean);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length) {
  console.error(`FAIL: data/open-mics.json has duplicate ids: ${duplicates.join(', ')}`);
  allPassed = false;
} else {
  console.log(`PASS: data/open-mics.json has ${ids.length} unique ids`);
}

if (!allPassed) process.exit(1);
