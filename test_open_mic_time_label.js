const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

// Load only the pure helpers we need, in the order they depend on each other,
// so the browser-only top-level code (window, document, fetch) never runs.
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Could not find function ${name} in app.js`);
  let depth = 0;
  let i = source.indexOf('{', start);
  const braceStart = i;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for function ${name}`);
}

const context = {};
vm.createContext(context);
['parseTimeStringToMinutes', 'parseSignupStartTimes', 'formatMinutesToClock', 'buildOpenMicTimeLabel']
  .forEach((name) => {
    vm.runInContext(extractFunction(name), context);
  });

const { parseSignupStartTimes, buildOpenMicTimeLabel } = context;

// Build a mic the same way the site does: parse the raw timeSignupStart string
// into signupMinutes/startMinutes/endMinutes and attach them to a minimal mic.
function makeMic(name, rawTime) {
  const { signupMinutes, startMinutes, endMinutes } = parseSignupStartTimes(rawTime);
  return { name, rawTime, signupMinutes, startMinutes, endMinutes };
}

// Edge case: Spice of Life with "/7pm-11pm" -> "7:00 PM - 11:00 PM"
assert.equal(
  buildOpenMicTimeLabel(makeMic('Spice of Life Variety Open Mic', '/7pm-11pm')),
  '7:00 PM - 11:00 PM'
);

// Edge case: Spice of Life with a different range such as "/6pm-9pm" -> "6:00 PM - 9:00 PM"
assert.equal(
  buildOpenMicTimeLabel(makeMic('Spice of Life Variety Open Mic', '/6pm-9pm')),
  '6:00 PM - 9:00 PM'
);

// Edge case: Spice of Life with no end time -> falls back to "Start <start>"
assert.equal(
  buildOpenMicTimeLabel(makeMic('Spice of Life Variety Open Mic', '/7pm')),
  'Start 7:00 PM'
);

// Edge case: Spice of Life with no time at all -> "Time not listed"
assert.equal(
  buildOpenMicTimeLabel(makeMic('Spice of Life Variety Open Mic', '')),
  'Time not listed'
);

// Edge case: every other mic, including ones whose time has an end such as
// "/7pm-9pm" -> unchanged ("Start 7:00 PM")
assert.equal(
  buildOpenMicTimeLabel(makeMic('Some Other Open Mic', '/7pm-9pm')),
  'Start 7:00 PM'
);

console.log('test_open_mic_time_label.js passed');
