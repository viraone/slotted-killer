// Unit tests for the pure parts of the submit-open-mic edge function.
// Run: npx -y deno@2 test --allow-env supabase/functions/tests/

import assert from "node:assert/strict";
import {
  buildNotification,
  corsHeaders,
  DEFAULT_NOTIFICATION_TO,
  formatClock,
  parseSubmission,
  type Submission,
  ValidationError,
} from "../submit-open-mic/index.ts";

const SUPABASE_URL = "https://ldodkbdzljfpbnzrpxpu.supabase.co";
const FLYER_URL =
  `${SUPABASE_URL}/storage/v1/object/public/open-mic-flyers/2026-09-07/broadview-abc.png`;

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submitter_name: "Callan Hercules",
    submitter_email: "Callan@Example.com",
    submitter_instagram: "@calherc",
    submitter_role: "host",
    submitter_notes: null,
    mic_name: "Broadview Comedy Open Mic",
    venue: "Broadview Tap House",
    location: "217 N 125th St, Seattle, WA 98133",
    days: ["Tuesday"],
    recurrence_text: "Every Tuesday",
    signup_time: "19:30",
    start_time: "20:00",
    end_time: null,
    signup_type: "in-person",
    web_signup: null,
    open_mic_type: "Comedy",
    age_requirement: "21+",
    price: "Free",
    host: "Callan Hercules",
    flyer_url: null,
    record: { name: "Broadview Comedy Open Mic", tuesday: "Yes" },
    page_url: "https://stagetimepnw.com/?addmic=1",
    ...overrides,
  };
}

function expectValidationError(body: unknown, matcher: RegExp): void {
  assert.throws(
    () => parseSubmission(body, SUPABASE_URL),
    (error: unknown) => error instanceof ValidationError && matcher.test((error as Error).message),
    `expected a ValidationError matching ${matcher}`,
  );
}

Deno.test("parseSubmission accepts a valid submission and lowercases the email", () => {
  const submission = parseSubmission(validBody(), SUPABASE_URL);
  assert.equal(submission.submitter_email, "callan@example.com");
  assert.equal(submission.mic_name, "Broadview Comedy Open Mic");
  assert.deepEqual(submission.days, ["Tuesday"]);
  assert.equal(submission.end_time, null);
  assert.equal(submission.flyer_url, null);
});

Deno.test("parseSubmission trims text and drops blank optional fields", () => {
  const submission = parseSubmission(
    validBody({ mic_name: "  Spaced Mic  ", venue: "   ", host: "" }),
    SUPABASE_URL,
  );
  assert.equal(submission.mic_name, "Spaced Mic");
  assert.equal(submission.venue, null);
  assert.equal(submission.host, null);
});

Deno.test("parseSubmission keeps only real weekdays, in week order", () => {
  const submission = parseSubmission(
    validBody({ days: ["Saturday", "nonsense", "Monday", 7] }),
    SUPABASE_URL,
  );
  assert.deepEqual(submission.days, ["Monday", "Saturday"]);
});

Deno.test("parseSubmission rejects missing and malformed required fields", () => {
  expectValidationError(validBody({ submitter_name: "  " }), /Your name is required/);
  expectValidationError(validBody({ mic_name: undefined }), /Open mic name is required/);
  expectValidationError(validBody({ location: null }), /Address is required/);
  expectValidationError(validBody({ submitter_email: "not-an-email" }), /doesn't look valid/);
  expectValidationError(validBody({ days: [] }), /at least one day/);
  expectValidationError(validBody({ days: ["Funday"] }), /at least one day/);
  expectValidationError(validBody({ record: undefined }), /listing record is missing/);
  expectValidationError(validBody({ record: [] }), /listing record is missing/);
  expectValidationError(validBody({ mic_name: 42 }), /Open mic name must be text/);
  expectValidationError("just a string", /Expected a JSON object/);
  expectValidationError(null, /Expected a JSON object/);
});

Deno.test("parseSubmission rejects values outside the allowed sets", () => {
  expectValidationError(validBody({ signup_type: "carrier-pigeon" }), /Sign-up method has an unexpected value/);
  expectValidationError(validBody({ submitter_role: "admin" }), /Your role has an unexpected value/);
});

Deno.test("parseSubmission enforces length caps", () => {
  expectValidationError(validBody({ mic_name: "x".repeat(161) }), /Open mic name is too long/);
  expectValidationError(validBody({ submitter_notes: "x".repeat(4001) }), /Notes is too long/);
  expectValidationError(
    validBody({ record: { blob: "x".repeat(20_001) } }),
    /listing record is too large/,
  );
});

Deno.test("parseSubmission only accepts flyers from the project's storage bucket", () => {
  const submission = parseSubmission(validBody({ flyer_url: FLYER_URL }), SUPABASE_URL);
  assert.equal(submission.flyer_url, FLYER_URL);

  expectValidationError(
    validBody({ flyer_url: "https://evil.test/flyer.png" }),
    /uploaded through the form/,
  );
  expectValidationError(
    validBody({ flyer_url: `${SUPABASE_URL}/storage/v1/object/public/other-bucket/x.png` }),
    /uploaded through the form/,
  );
});

Deno.test("formatClock renders 24-hour input as 12-hour time", () => {
  assert.equal(formatClock("19:30"), "7:30 PM");
  assert.equal(formatClock("20:00"), "8:00 PM");
  assert.equal(formatClock("00:15"), "12:15 AM");
  assert.equal(formatClock("12:00"), "12:00 PM");
  assert.equal(formatClock(null), "—");
  assert.equal(formatClock("whenever"), "whenever");
});

Deno.test("corsHeaders echoes allowed origins and falls back to production", () => {
  assert.equal(
    corsHeaders("https://stagetimepnw.com")["access-control-allow-origin"],
    "https://stagetimepnw.com",
  );
  assert.equal(
    corsHeaders("https://www.stagetimepnw.com")["access-control-allow-origin"],
    "https://www.stagetimepnw.com",
  );
  assert.equal(
    corsHeaders("http://localhost:8765")["access-control-allow-origin"],
    "http://localhost:8765",
  );
  assert.equal(
    corsHeaders("https://evil.test")["access-control-allow-origin"],
    "https://stagetimepnw.com",
  );
  assert.equal(corsHeaders(null)["access-control-allow-origin"], "https://stagetimepnw.com");
});

Deno.test("buildNotification includes the mic, the submitter and the pasteable record", () => {
  const submission: Submission = parseSubmission(
    validBody({
      end_time: "22:00",
      flyer_url: FLYER_URL,
      submitter_notes: "Starting next week.",
      record: {
        name: "Broadview Comedy Open Mic",
        signupDetails: "In-person signup starts at 7:30 PM.",
        requirementsInfo: "5 minute sets.",
        contact: "https://www.instagram.com/calherc/",
        website: "https://broadviewtaphouse.com",
        wheelchairAccessible: true,
      },
    }),
    SUPABASE_URL,
  );

  const { subject, text } = buildNotification(
    submission,
    12,
    "2026-09-07T21:05:00.000Z",
    SUPABASE_URL,
  );

  assert.equal(subject, "New open mic submission: Broadview Comedy Open Mic");
  assert.match(text, /stagetimepnw\.com\/add-mic/);
  assert.match(text, /- Venue: Broadview Tap House/);
  assert.match(text, /- Address: 217 N 125th St, Seattle, WA 98133/);
  assert.match(text, /- Schedule: Every Tuesday/);
  assert.match(text, /- Sign-up: 7:30 PM · Show: 8:00 PM – 10:00 PM/);
  assert.match(text, /- Sign-up details: In-person signup starts at 7:30 PM\./);
  assert.match(text, /- Details & rules: 5 minute sets\./);
  assert.match(text, /- Wheelchair accessible/);
  assert.match(text, /- Contact: https:\/\/www\.instagram\.com\/calherc\//);
  assert.match(text, new RegExp(`- Flyer: ${FLYER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(text, /- Callan Hercules <callan@example\.com> \(hosts it\)/);
  assert.match(text, /- Instagram: @calherc/);
  assert.match(text, /- Notes: Starting next week\./);
  assert.match(text, /Submission #12 received Sep 7, 2026, 2:05 PM \(Seattle time\)/);
  assert.match(text, /- Approve or reject it: https:\/\/stagetimepnw\.com\/\?admin=1/);
  assert.match(text, /dashboard\/project\/ldodkbdzljfpbnzrpxpu\/editor/);
  assert.match(text, /pull-open-mic-submissions\.mjs/);
  assert.match(text, /"name": "Broadview Comedy Open Mic"/);
});

Deno.test("buildNotification omits optional lines that have no value", () => {
  const submission = parseSubmission(
    validBody({
      venue: null,
      host: null,
      submitter_instagram: null,
      submitter_role: null,
      submitter_notes: null,
      flyer_url: null,
      recurrence_text: null,
      record: { name: "Bare Mic" },
    }),
    SUPABASE_URL,
  );

  const { text } = buildNotification(submission, 3, "2026-09-07T21:05:00.000Z", SUPABASE_URL);

  assert.doesNotMatch(text, /- Venue:/);
  assert.doesNotMatch(text, /- Host:/);
  assert.doesNotMatch(text, /- Instagram:/);
  assert.doesNotMatch(text, /- Notes:/);
  assert.doesNotMatch(text, /- Flyer:/);
  assert.doesNotMatch(text, /- Wheelchair accessible/);
  assert.doesNotMatch(text, /null/);
  // Falls back to the day list when there's no recurrence sentence.
  assert.match(text, /- Schedule: Tuesday/);
});

Deno.test("the default notification address is the admin's", () => {
  assert.equal(DEFAULT_NOTIFICATION_TO, "vxayananh@gmail.com");
});
