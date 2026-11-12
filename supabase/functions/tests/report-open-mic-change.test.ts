// Tests for the report-open-mic-change request handler with the network stubbed,
// so no Supabase or Resend call leaves the machine.
// Run: deno test --allow-env supabase/functions/tests/report-open-mic-change.test.ts

import assert from "node:assert/strict";
import {
  buildNotification,
  handler,
  HOURLY_REPORT_LIMIT,
  parseReport,
  ValidationError,
} from "../report-open-mic-change/index.ts";

const SUPABASE_URL = "https://ldodkbdzljfpbnzrpxpu.supabase.co";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("RESEND_API_KEY", "test-resend-key");
Deno.env.set("SIGNUP_NOTIFICATION_FROM", "StageTime PNW <mics@stagetimepnw.com>");
Deno.env.delete("OPEN_MIC_NOTIFICATION_TO");

const validBody = {
  mic_id: "tacoma-comedy-6th-3829-6th-ave-tacoma-wa-98406",
  mic_name: "Tacoma Comedy Club – 6th & Proctor",
  show_date: "2026-11-12",
  change_type: "not_this_date",
  comment: "Checked the TCC calendar, no open mic this Thursday.",
  reporter_email: "Fan@Example.com",
  page_url: "https://stagetimepnw.com/",
};

type Call = { url: string; method: string; body: unknown };

function stubFetch(options: { recentCount?: number; insertStatus?: number; resendStatus?: number } = {}) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = init?.body;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });

    if (url.includes("api.resend.com")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "email_1" }), { status: options.resendStatus ?? 200 }));
    }
    if (url.includes("/rest/v1/open_mic_change_reports") && method === "HEAD") {
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "content-range": `0-0/${options.recentCount ?? 0}` },
        }),
      );
    }
    if (url.includes("/rest/v1/open_mic_change_reports") && method === "POST") {
      const status = options.insertStatus ?? 201;
      const rows = status >= 400
        ? { code: "42P01", message: "relation does not exist" }
        : [{ id: 11, created_at: "2026-11-11T21:05:00.000Z" }];
      return Promise.resolve(new Response(JSON.stringify(rows), { status }));
    }
    if (url.includes("/rest/v1/open_mic_change_reports") && method === "PATCH") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response("unexpected call", { status: 500 }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function post(body: unknown, origin = "https://stagetimepnw.com"): Request {
  return new Request("https://example.test/functions/v1/report-open-mic-change", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

Deno.test("parseReport accepts a full report and lowercases the email", () => {
  const report = parseReport(validBody);
  assert.equal(report.change_type, "not_this_date");
  assert.equal(report.show_date, "2026-11-12");
  assert.equal(report.reporter_email, "fan@example.com");
});

Deno.test("parseReport rejects bad input", () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ["unknown type", { ...validBody, change_type: "exploded" }],
    ["no comment", { ...validBody, comment: "  " }],
    ["no mic name", { ...validBody, mic_name: "" }],
    ["fake date", { ...validBody, show_date: "2026-02-31" }],
    ["not-this-date without a date", { ...validBody, show_date: null }],
    ["bad email", { ...validBody, reporter_email: "nope" }],
    ["long comment", { ...validBody, comment: "x".repeat(2001) }],
  ];
  for (const [label, body] of bad) {
    assert.throws(() => parseReport(body), ValidationError, label);
  }
});

Deno.test("parseReport allows a closed-for-good report with no date and no email", () => {
  const report = parseReport({ ...validBody, change_type: "closed_for_good", show_date: null, reporter_email: null });
  assert.equal(report.show_date, null);
  assert.equal(report.reporter_email, null);
});

Deno.test("buildNotification names the mic, type, date and review link", () => {
  const notification = buildNotification(parseReport(validBody), 11, "2026-11-11T21:05:00.000Z", SUPABASE_URL);
  assert.match(notification.subject, /Tacoma Comedy Club/);
  assert.match(notification.subject, /Not happening on this date/);
  assert.match(notification.text, /Thursday, Nov 12, 2026/);
  assert.match(notification.text, /https:\/\/stagetimepnw\.com\/\?admin=1/);
  assert.match(notification.text, /fan@example\.com/);
});

Deno.test("handler saves the report and emails the admin", async () => {
  const stub = stubFetch();
  try {
    const response = await handler(post(validBody));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: 11, emailSent: true });
    const resend = stub.calls.find((call) => call.url.includes("api.resend.com"));
    assert.deepEqual((resend?.body as { to: string[] }).to, ["vxayananh@gmail.com"]);
    assert.equal((resend?.body as { reply_to: string }).reply_to, "fan@example.com");
    const insert = stub.calls.find((call) => call.method === "POST" && call.url.includes("change_reports"));
    assert.equal((insert?.body as { comment: string }).comment, validBody.comment);
  } finally {
    stub.restore();
  }
});

Deno.test("handler still succeeds when the email fails", async () => {
  const stub = stubFetch({ resendStatus: 500 });
  try {
    const response = await handler(post(validBody));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: 11, emailSent: false });
  } finally {
    stub.restore();
  }
});

Deno.test("handler ignores honeypot posts without saving", async () => {
  const stub = stubFetch();
  try {
    const response = await handler(post({ ...validBody, company: "Acme" }));
    assert.equal(response.status, 200);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("handler returns 400 for invalid input and saves nothing", async () => {
  const stub = stubFetch();
  try {
    const response = await handler(post({ ...validBody, comment: "" }));
    assert.equal(response.status, 400);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("handler stops at the hourly limit without saving or emailing", async () => {
  const stub = stubFetch({ recentCount: HOURLY_REPORT_LIMIT });
  try {
    const response = await handler(post(validBody));
    assert.equal(response.status, 429);
    assert.equal(stub.calls.some((call) => call.method === "POST"), false);
  } finally {
    stub.restore();
  }
});

Deno.test("handler returns 500 when the row cannot be saved", async () => {
  const stub = stubFetch({ insertStatus: 500 });
  try {
    const response = await handler(post(validBody));
    assert.equal(response.status, 500);
    assert.equal(stub.calls.some((call) => call.url.includes("api.resend.com")), false);
  } finally {
    stub.restore();
  }
});

Deno.test("handler answers CORS preflight and rejects GET", async () => {
  const options = await handler(new Request("https://example.test/", { method: "OPTIONS", headers: { origin: "https://stagetimepnw.com" } }));
  assert.equal(options.status, 204);
  const get = await handler(new Request("https://example.test/", { method: "GET" }));
  assert.equal(get.status, 405);
});
