const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);

for (const name of ['getChangeReportTypeLabel', 'buildChangeReportPayload', 'formatChangeReportDate']) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

const build = (fields) => context.buildChangeReportPayload(fields);
// vm objects live in another realm, so plain clone them before deepStrictEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));
const validDateReport = {
  micId: 'broadview-comedy',
  micName: 'Broadview Comedy Open Mic',
  changeType: 'not_this_date',
  showDate: '2026-11-12',
  comment: 'Cancelled that night for a private event.',
  email: '',
  pageUrl: 'https://stagetimepnw.com/'
};

// The success shape the edge function receives.
assert.deepEqual(plain(build(validDateReport)), {
  ok: true,
  payload: {
    mic_id: 'broadview-comedy',
    mic_name: 'Broadview Comedy Open Mic',
    show_date: '2026-11-12',
    change_type: 'not_this_date',
    comment: 'Cancelled that night for a private event.',
    reporter_email: null,
    page_url: 'https://stagetimepnw.com/',
    company: ''
  }
});

// Empty mic name, including whitespace-only, is rejected.
assert.deepEqual(plain(build({ ...validDateReport, micName: '' })), {
  ok: false,
  error: 'Pick the open mic.'
});
assert.deepEqual(plain(build({ ...validDateReport, micName: '    ' })), {
  ok: false,
  error: 'Pick the open mic.'
});

// Unknown change type is rejected.
assert.deepEqual(plain(build({ ...validDateReport, changeType: 'free_beer' })), {
  ok: false,
  error: 'Pick what changed.'
});

// not_this_date needs a date.
assert.deepEqual(plain(build({ ...validDateReport, showDate: '' })), {
  ok: false,
  error: 'Pick the date that is not happening.'
});
assert.deepEqual(plain(build({ ...validDateReport, showDate: null })), {
  ok: false,
  error: 'Pick the date that is not happening.'
});

// A fake calendar date is rejected, not silently rolled into March.
assert.deepEqual(plain(build({ ...validDateReport, showDate: '2026-02-31' })), {
  ok: false,
  error: 'Pick the date that is not happening.'
});

// closed_for_good with no date and no email is fine, and both fields are null.
const closed = build({
  micId: 'closed-mic',
  micName: 'Closed Mic',
  changeType: 'closed_for_good',
  showDate: '',
  comment: 'The venue closed for good.',
  email: '',
  pageUrl: ''
});
assert.equal(closed.ok, true, 'closed_for_good without a date is accepted');
assert.equal(closed.payload.show_date, null, 'an absent date becomes null');
assert.equal(closed.payload.reporter_email, null, 'an absent email becomes null');
assert.equal(closed.payload.page_url, null, 'an absent page URL becomes null');
assert.equal(closed.payload.company, '', 'the honeypot is always empty');

// A mic id is optional; an empty one becomes null.
assert.equal(build({ ...validDateReport, micId: '   ' }).payload.mic_id, null,
  'an empty mic id becomes null');

// Comment boundaries: exactly 2000 is fine, 2001 is rejected, blank is rejected.
const twoThousand = 'a'.repeat(2000);
assert.equal(build({ ...validDateReport, comment: twoThousand }).ok, true,
  'a comment of exactly 2000 characters is accepted');
assert.deepEqual(plain(build({ ...validDateReport, comment: `${twoThousand}a` })), {
  ok: false,
  error: 'Keep the comment under 2000 characters.'
});
assert.deepEqual(plain(build({ ...validDateReport, comment: '   \n\t  ' })), {
  ok: false,
  error: 'Tell us what changed.'
});

// Emails are trimmed, lowercased and validated.
const upperEmail = build({ ...validDateReport, email: '  Comic@Example.COM  ' });
assert.equal(upperEmail.ok, true, 'a valid uppercase email is accepted');
assert.equal(upperEmail.payload.reporter_email, 'comic@example.com',
  'the email is lowercased');
assert.deepEqual(plain(build({ ...validDateReport, email: 'not-an-email' })), {
  ok: false,
  error: 'That email address does not look valid.'
});

// Strings are trimmed in the payload.
const trimmed = build({
  micId: '  mic-1  ',
  micName: '  Test Mic  ',
  changeType: 'time_change',
  showDate: '  ',
  comment: '  It moved to 8 PM.  ',
  email: '  Fan@Example.com ',
  pageUrl: '  https://stagetimepnw.com/  '
});
assert.equal(trimmed.ok, true);
assert.equal(trimmed.payload.mic_name, 'Test Mic');
assert.equal(trimmed.payload.comment, 'It moved to 8 PM.');
assert.equal(trimmed.payload.reporter_email, 'fan@example.com');
assert.equal(trimmed.payload.page_url, 'https://stagetimepnw.com/');

// Date formatting is UTC-based and rejects impossible dates.
assert.equal(context.formatChangeReportDate('2026-11-12'), 'Thu, Nov 12, 2026');
assert.equal(context.formatChangeReportDate('nope'), '');
assert.equal(context.formatChangeReportDate('2026-02-31'), '');
assert.equal(context.formatChangeReportDate(''), '');

// Change type labels.
assert.equal(context.getChangeReportTypeLabel('time_change'), 'Time change');
assert.equal(context.getChangeReportTypeLabel('not_this_date'), 'Not happening on a certain date');
assert.equal(context.getChangeReportTypeLabel('closed_for_good'), 'No longer happening');
assert.equal(context.getChangeReportTypeLabel('venue_change'), 'Venue or address change');
assert.equal(context.getChangeReportTypeLabel('other'), 'Something else');
assert.equal(context.getChangeReportTypeLabel('mystery'), 'Something else');
assert.equal(context.getChangeReportTypeLabel(''), 'Something else');

console.log('PASS: change reports validate fields, build the edge function body, format dates and label change types');
