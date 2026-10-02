import assert from "node:assert/strict";
import { handler as feed } from "../lineup-feed/index.ts";
import { buildSelectionEmail, handler as notify } from "../notify-selected/index.ts";

// A real throwaway RSA key so the service-account sign-in code runs unchanged.
const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
let bin = ""; pkcs8.forEach((b) => (bin += String.fromCharCode(b)));
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin)}\n-----END PRIVATE KEY-----`;
Deno.env.set("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", btoa(JSON.stringify({ client_email: "svc@example.iam.gserviceaccount.com", private_key: pem })));
Deno.env.set("GOOGLE_SHEET_ID", "sheet123");
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("RESEND_API_KEY", "resend-key");
Deno.env.set("SIGNUP_NOTIFICATION_FROM", "StageTime PNW <noreply@example.com>");
Deno.env.set("SIGNUP_NOTIFICATION_TO", "host@example.com");
Deno.env.set("SYNC_FUNCTION_SECRET", "secret");

const THURSDAY_NIGHT = "2026-10-01T22:30:00-07:00";
const SHEET = [
  ["NAME", "", "", "EMAIL", "INSTAGRAM", "SLOT TYPE", "TIME SUBMITTED"],
  ["Nick Cody", "5", "7:00 PM", "", "", "", ""],
  ["Jason Katz", "", "", "jason@example.com", "@jk", "First Available", "2026-10-01T02:00:00+00:00"],
  ["Lori Peck", "7", "7:10 PM", "lori@example.com", "@lp", "First Available", "2026-10-02T02:30:51+00:00"],
  ["Old Timer", "5", "8:00 PM", "old@example.com", "", "First Available", "2026-09-20T02:00:00+00:00"],
  ["English John", "", "", "", "", "", ""],
];

interface World { enabled: boolean; sent: any[]; claims: Set<string>; alreadySent: string[]; resendOk: boolean; deletes: string[]; sheetReads: number }
function install(world: World, user: string | null = null) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return body({ access_token: "tok" });
    if (url.startsWith("https://sheets.googleapis.com/")) { world.sheetReads++; return body({ values: SHEET }); }
    if (url.includes("/auth/v1/user")) return user ? body({ email: user }) : body({}, 401);
    if (url.includes("/rest/v1/app_settings")) return body([{ value: world.enabled }]);
    if (url.includes("/rest/v1/selection_notifications")) {
      if (init.method === "POST") {
        const row = JSON.parse(String(init.body));
        if (world.claims.has(row.email)) return body([]);
        world.claims.add(row.email); return body([row], 201);
      }
      if (init.method === "DELETE") { world.deletes.push(url); return body([]); }
      return body(world.alreadySent.map((email) => ({ email })));
    }
    if (url === "https://api.resend.com/emails") {
      const payload = JSON.parse(String(init.body)); world.sent.push({ ...payload, key: (init.headers as any)["idempotency-key"] });
      return world.resendOk ? body({ id: "1" }) : body({}, 500);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return () => (globalThis.fetch = original);
}
const fresh = (): World => ({ enabled: true, sent: [], claims: new Set(), alreadySent: [], resendOk: true, deletes: [], sheetReads: 0 });
const post = (body: unknown, secret = "secret") => new Request("https://x/notify", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });

Deno.test("feed: public lineup has only name, set and time, never emails", async () => {
  const restore = install(fresh());
  try {
    const res = await feed(new Request("https://x/feed"));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.posted, true);
    assert.deepEqual(data.lineup.map((e: any) => e.name), ["Nick Cody", "Lori Peck", "Old Timer", "English John"]);
    assert.equal(data.me, null);
    assert.ok(!JSON.stringify(data).includes("@"), "no email or handle leaks");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  } finally { restore(); }
});

Deno.test("feed: a signed-in comic gets their own status, privately cached", async () => {
  const restore = install(fresh(), "Lori@Example.com");
  try {
    const res = await feed(new Request("https://x/feed", { headers: { authorization: "Bearer user-jwt" } }));
    const data = await res.json();
    assert.deepEqual(data.me, { selected: true, set_length: "7 min", start_time: "7:10 PM" });
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  } finally { restore(); }
  const restore2 = install(fresh(), "jason@example.com");
  try {
    const data = await (await feed(new Request("https://x/feed", { headers: { authorization: "Bearer user-jwt" } }))).json();
    assert.deepEqual(data.me, { selected: false, set_length: "", start_time: "" });
  } finally { restore2(); }
});

Deno.test("feed: answers CORS preflight and survives a Google failure with a safe message", async () => {
  assert.equal((await feed(new Request("https://x/feed", { method: "OPTIONS" }))).status, 204);
});

Deno.test("notify: refuses without the secret", async () => {
  const restore = install(fresh());
  try { assert.equal((await notify(post({}, "wrong"))).status, 401); } finally { restore(); }
});

Deno.test("notify: does nothing while switched off", async () => {
  const w = fresh(); w.enabled = false; const restore = install(w);
  try {
    const data = await (await notify(post({}))).json();
    assert.match(data.skipped, /switched off/); assert.equal(w.sent.length, 0);
  } finally { restore(); }
});

Deno.test("notify: dry run lists who would be emailed (only Lori) and sends nothing", async () => {
  const w = fresh(); const restore = install(w);
  try {
    const data = await (await notify(post({ dry: true, now: THURSDAY_NIGHT }))).json();
    assert.deepEqual(data.would_send.map((x: any) => x.name), ["Lori Peck"]);
    assert.equal(w.sent.length, 0);
  } finally { restore(); }
});

Deno.test("notify: sends once per person per show, to the right address, with reply-to the host", async () => {
  const w = fresh(); const restore = install(w);
  const realNow = Date.now; // run "now" at Thursday night
  const fixed = new Date(THURSDAY_NIGHT).getTime();
  Date.now = () => fixed; const RealDate = Date;
  // deno-lint-ignore no-global-assign
  globalThis.Date = class extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(fixed); } static now() { return fixed; } } as any;
  try {
    const first = await (await notify(post({}))).json();
    assert.equal(first.sent, 1);
    assert.equal(w.sent[0].to[0], "lori@example.com");
    assert.equal(w.sent[0].reply_to, "host@example.com");
    assert.match(w.sent[0].subject, /You're in for Read The Room, Friday, Oct 2/);
    assert.equal(w.sent[0].key, "selected-2026-10-02-lori@example.com");
    const second = await (await notify(post({}))).json();
    assert.equal(second.sent, 0, "a second run does not email her again");
    assert.equal(w.sent.length, 1);
  } finally { globalThis.Date = RealDate; Date.now = realNow; restore(); }
});

Deno.test("notify: a failed send releases the claim so the next run retries", async () => {
  const w = fresh(); w.resendOk = false; const restore = install(w);
  const fixed = new Date(THURSDAY_NIGHT).getTime(); const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(fixed); } static now() { return fixed; } } as any;
  try {
    const data = await (await notify(post({}))).json();
    assert.equal(data.sent, 0); assert.equal(data.errors.length, 1); assert.equal(w.deletes.length, 1);
  } finally { globalThis.Date = RealDate; restore(); }
});

Deno.test("notify: test mode sends a [TEST] sample and touches no sheet or table", async () => {
  const w = fresh(); const restore = install(w);
  try {
    const data = await (await notify(post({ test_to: "me@example.com" }))).json();
    assert.equal(data.sent_test, true); assert.equal(w.sheetReads, 0); assert.equal(w.claims.size, 0);
    assert.match(w.sent[0].subject, /^\[TEST\] You're in/);
  } finally { restore(); }
});

Deno.test("email text uses 'selected' wording, the slot, and no standby list", () => {
  const mail = buildSelectionEmail({ name: "Lori Peck", show: "Friday, Oct 2", startTime: "7:10 PM", setLength: "7 min" });
  assert.match(mail.text, /You're in!/); assert.match(mail.text, /7:10 PM · 7 min/);
  assert.ok(!/standby|pick/i.test(mail.text + mail.html));
  assert.ok(!mail.html.includes("<script"));
});
