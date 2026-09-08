// End-to-end tests for the submit-open-mic request handler with the network
// stubbed, so no Supabase or Resend call leaves the machine.
// Run: npx -y deno@2 test --allow-env supabase/functions/tests/

import assert from "node:assert/strict";
import { handler } from "../submit-open-mic/index.ts";

const SUPABASE_URL = "https://ldodkbdzljfpbnzrpxpu.supabase.co";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("RESEND_API_KEY", "test-resend-key");
Deno.env.set("SIGNUP_NOTIFICATION_FROM", "StageTime PNW <mics@stagetimepnw.com>");
Deno.env.delete("OPEN_MIC_NOTIFICATION_TO");

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

type StubOptions = {
  insertStatus?: number;
  insertRows?: unknown;
  resendStatus?: number;
  patchStatus?: number;
};

function stubFetch(options: StubOptions = {}): { calls: Call[]; restore: () => void } {
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
    calls.push({
      url,
      method,
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (url.includes("api.resend.com")) {
      const status = options.resendStatus ?? 200;
      return Promise.resolve(new Response(JSON.stringify({ id: "email_1" }), { status }));
    }
    if (url.includes("/rest/v1/open_mic_submissions") && method === "POST") {
      const status = options.insertStatus ?? 201;
      const rows = status >= 400
        ? { code: "42P01", message: "relation does not exist" }
        : options.insertRows ?? [{ id: 7, created_at: "2026-09-07T21:05:00.000Z" }];
      return Promise.resolve(new Response(JSON.stringify(rows), { status }));
    }
    if (url.includes("/rest/v1/open_mic_submissions") && method === "PATCH") {
      // 204 responses must have a null body, or constructing this throws.
      return Promise.resolve(new Response(null, { status: options.patchStatus ?? 204 }));
    }
    return Promise.resolve(new Response("unexpected call", { status: 500 }));
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

function request(body: unknown, init: RequestInit = {}): Request {
  return new Request("https://ldodkbdzljfpbnzrpxpu.functions.supabase.co/submit-open-mic", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://stagetimepnw.com" },
    body: JSON.stringify(body),
    ...init,
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submitter_name: "Callan Hercules",
    submitter_email: "callan@example.com",
    submitter_role: "host",
    mic_name: "Broadview Comedy Open Mic",
    venue: "Broadview Tap House",
    location: "217 N 125th St, Seattle, WA 98133",
    days: ["Tuesday"],
    recurrence_text: "Every Tuesday",
    signup_time: "19:30",
    start_time: "20:00",
    signup_type: "in-person",
    open_mic_type: "Comedy",
    age_requirement: "21+",
    price: "Free",
    record: { name: "Broadview Comedy Open Mic", tuesday: "Yes" },
    page_url: "https://stagetimepnw.com/?addmic=1",
    ...overrides,
  };
}

Deno.test("a valid submission is stored, emailed to the admin, and marked notified", async () => {
  const { calls, restore } = stubFetch();
  try {
    const response = await handler(request(validBody()));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: 7, emailSent: true });
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://stagetimepnw.com",
    );

    const insert = calls.find((call) => call.url.includes("/rest/v1/") && call.method === "POST");
    assert.ok(insert, "expected an insert call");
    assert.equal((insert.headers as Record<string, string>).apikey, "test-service-role-key");
    assert.equal((insert.body as Record<string, unknown>).mic_name, "Broadview Comedy Open Mic");

    const email = calls.find((call) => call.url.includes("api.resend.com"));
    assert.ok(email, "expected a Resend call");
    const payload = email.body as Record<string, unknown>;
    assert.deepEqual(payload.to, ["vxayananh@gmail.com"]);
    assert.equal(payload.from, "StageTime PNW <mics@stagetimepnw.com>");
    assert.equal(payload.reply_to, "callan@example.com");
    assert.equal(payload.subject, "New open mic submission: Broadview Comedy Open Mic");
    assert.match(String(payload.text), /217 N 125th St/);
    assert.equal(
      (email.headers as Record<string, string>)["idempotency-key"],
      "open-mic-submission-7",
    );

    const patches = calls.filter((call) => call.method === "PATCH");
    assert.equal(patches.length, 1, "a clean run should patch exactly once");
    assert.match(patches[0].url, /id=eq\.7/);
    assert.ok((patches[0].body as Record<string, unknown>).notified_at);
    assert.equal((patches[0].body as Record<string, unknown>).notify_error, null);
  } finally {
    restore();
  }
});

Deno.test("OPEN_MIC_NOTIFICATION_TO overrides the default recipient", async () => {
  Deno.env.set("OPEN_MIC_NOTIFICATION_TO", "someone.else@example.com");
  const { calls, restore } = stubFetch();
  try {
    await handler(request(validBody()));
    const email = calls.find((call) => call.url.includes("api.resend.com"));
    assert.deepEqual((email!.body as Record<string, unknown>).to, ["someone.else@example.com"]);
  } finally {
    restore();
    Deno.env.delete("OPEN_MIC_NOTIFICATION_TO");
  }
});

Deno.test("a failed email still keeps the submission and records the error", async () => {
  const { calls, restore } = stubFetch({ resendStatus: 422 });
  try {
    const response = await handler(request(validBody()));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: 7, emailSent: false });

    const patches = calls.filter((call) => call.method === "PATCH");
    assert.equal(patches.length, 1, "expected exactly one failure patch");
    assert.match(patches[0].url, /id=eq\.7/);
    assert.match(String((patches[0].body as Record<string, unknown>).notify_error), /422/);
    assert.equal((patches[0].body as Record<string, unknown>).notified_at, undefined);
  } finally {
    restore();
  }
});

Deno.test("a failed insert returns an error and sends no email", async () => {
  const { calls, restore } = stubFetch({ insertStatus: 400 });
  try {
    const response = await handler(request(validBody()));
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /Could not save your submission/);
    assert.equal(calls.some((call) => call.url.includes("api.resend.com")), false);
  } finally {
    restore();
  }
});

Deno.test("validation failures return 400 with a readable message and touch nothing", async () => {
  const { calls, restore } = stubFetch();
  try {
    const response = await handler(request(validBody({ submitter_email: "nope" })));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /doesn't look valid/);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("the honeypot field is accepted silently and stores nothing", async () => {
  const { calls, restore } = stubFetch();
  try {
    const response = await handler(request(validBody({ company: "spam corp" })));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: null, emailSent: false });
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("malformed JSON and wrong methods are rejected", async () => {
  const { calls, restore } = stubFetch();
  try {
    const bad = new Request("https://example.test/submit-open-mic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const badResponse = await handler(bad);
    assert.equal(badResponse.status, 400);
    assert.match((await badResponse.json()).error, /Invalid JSON/);

    const getResponse = await handler(new Request("https://example.test/submit-open-mic"));
    assert.equal(getResponse.status, 405);

    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("preflight requests answer with CORS headers and no body", async () => {
  const { calls, restore } = stubFetch();
  try {
    const response = await handler(request(null, { method: "OPTIONS", body: null }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(await response.text(), "");
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
