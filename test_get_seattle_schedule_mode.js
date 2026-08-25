const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const functionStart = indexHtml.indexOf('function getSeattleScheduleMode(');
const functionEnd = indexHtml.indexOf('function prioritizeVerificationView(', functionStart);

if (functionStart === -1 || functionEnd === -1) {
  console.error('Could not find getSeattleScheduleMode function in index.html');
  process.exit(1);
}

eval(indexHtml.slice(functionStart, functionEnd));

const testCases = [
  { name: 'Thursday 11:59 PM', date: '2023-10-26T23:59:00-07:00', expected: 'signup' },
  { name: 'Friday 5:59 AM', date: '2023-10-27T05:59:00-07:00', expected: 'signup' },
  { name: 'Friday 6:00 AM', date: '2023-10-27T06:00:00-07:00', expected: 'lineup' },
  { name: 'Friday 6:01 AM', date: '2023-10-27T06:01:00-07:00', expected: 'lineup' },
  { name: 'Friday 12:59 PM', date: '2023-10-27T12:59:00-07:00', expected: 'lineup' },
  { name: 'Friday 1:00 PM', date: '2023-10-27T13:00:00-07:00', expected: 'lineup' },
  { name: 'Friday 11:59 PM', date: '2023-10-27T23:59:00-07:00', expected: 'lineup' },
  { name: 'Saturday 12:00 AM', date: '2023-10-28T00:00:00-07:00', expected: 'lineup' },
  { name: 'Saturday 5:59 AM', date: '2023-10-28T05:59:00-07:00', expected: 'lineup' },
  { name: 'Saturday 6:00 AM', date: '2023-10-28T06:00:00-07:00', expected: 'signup' },
  { name: 'Saturday 6:01 AM', date: '2023-10-28T06:01:00-07:00', expected: 'signup' }
];

let allPassed = true;

for (const testCase of testCases) {
  const actual = getSeattleScheduleMode(new Date(testCase.date));
  if (actual === testCase.expected) {
    console.log(`PASS: ${testCase.name} = ${actual}`);
  } else {
    console.error(`FAIL: ${testCase.name}; expected ${testCase.expected}, got ${actual}`);
    allPassed = false;
  }
}

const usesSeattleTimezone = indexHtml.includes("timeZone: 'America/Los_Angeles'");
console.log(`PASS: America/Los_Angeles configured = ${usesSeattleTimezone}`);
if (!usesSeattleTimezone) allPassed = false;

if (!allPassed) process.exit(1);
