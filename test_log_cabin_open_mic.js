const assert = require('node:assert/strict');
const fs = require('node:fs');

const records = JSON.parse(fs.readFileSync('data/open-mics.json', 'utf8'));
const mic = records.find(record => record.id === 'log-cabin-bar-grill-7035-pacific-ave-se-olympia-wa-98503');

assert.ok(mic, 'Log Cabin listing exists');
assert.equal(mic.timeSignupStart, 'Online/7pm-9pm');
assert.equal(mic.signupType, 'online');
assert.equal(mic.webSignup, 'https://www.stonedgooseproductions.com/open-mics');
assert.match(mic.signupDetails, /12 eight-minute spots/i);
assert.match(mic.signupDetails, /four-weeks-out date is added every Tuesday morning/i);
assert.match(mic.requirementsInfo, /12 eight-minute spots every Monday/i);

console.log('PASS: Log Cabin Monday uses the current online 12-spot format');