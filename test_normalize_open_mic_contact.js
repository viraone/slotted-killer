const fs = require('fs');

const appSource = fs.readFileSync('app.js', 'utf8');
const functionStart = appSource.indexOf('function normalizeOpenMicContact(');
const functionEnd = appSource.indexOf('function normalizeOpenMicRecord(', functionStart);

if (functionStart === -1 || functionEnd === -1) {
  console.error('Could not find normalizeOpenMicContact function in app.js');
  process.exit(1);
}

eval(appSource.slice(functionStart, functionEnd));

const testCases = [
  {
    name: 'a link keeps the generic Contact label and opens in a new tab',
    contact: 'https://www.instagram.com/stonedgooseproductions/',
    expected: { href: 'https://www.instagram.com/stonedgooseproductions/', label: 'Contact', isLink: true }
  },
  {
    name: 'a formatted phone number dials and shows the digits',
    contact: '(360) 239-3881',
    expected: { href: 'tel:+13602393881', label: '(360) 239-3881', isLink: false }
  },
  {
    name: 'a phone number written any other way still dials',
    contact: '360-239-3881',
    expected: { href: 'tel:+13602393881', label: '360-239-3881', isLink: false }
  },
  {
    name: 'a leading country code is not doubled up',
    contact: '+1 360 239 3881',
    expected: { href: 'tel:+13602393881', label: '+1 360 239 3881', isLink: false }
  },
  {
    name: 'text that is neither a link nor a phone number is dropped',
    contact: 'call the bar',
    expected: { href: '', label: '', isLink: false }
  },
  {
    name: 'a number with too few digits to dial is dropped',
    contact: '239-3881',
    expected: { href: '', label: '', isLink: false }
  },
  {
    name: 'a non-http scheme never reaches an href',
    contact: 'javascript:alert(1)',
    expected: { href: '', label: '', isLink: false }
  },
  {
    name: 'a missing contact is dropped',
    contact: '',
    expected: { href: '', label: '', isLink: false }
  }
];

let allPassed = true;
for (const testCase of testCases) {
  const actual = normalizeOpenMicContact(testCase.contact);
  if (JSON.stringify(actual) === JSON.stringify(testCase.expected)) {
    console.log(`PASS: ${testCase.name}`);
  } else {
    console.error(`FAIL: ${testCase.name}`);
    console.error(`  expected ${JSON.stringify(testCase.expected)}`);
    console.error(`  actual   ${JSON.stringify(actual)}`);
    allPassed = false;
  }
}

// Every contact in the real file should reach a card; one that normalizes away
// is a host's phone number or link that no visitor can see.
const records = JSON.parse(fs.readFileSync('data/open-mics.json', 'utf8'));
const dropped = records
  .filter((record) => String(record.contact || '').trim() && !normalizeOpenMicContact(record.contact).href)
  .map((record) => `${record.name} (${record.contact})`);
if (dropped.length) {
  console.error(`FAIL: data/open-mics.json has unusable contacts: ${dropped.join(', ')}`);
  allPassed = false;
} else {
  const usable = records.filter((record) => String(record.contact || '').trim()).length;
  console.log(`PASS: all ${usable} contacts in data/open-mics.json reach a card`);
}

if (!allPassed) process.exit(1);
