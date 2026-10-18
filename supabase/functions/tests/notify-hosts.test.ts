import assert from "node:assert/strict";
import { buildHostsAlert, handler } from "../notify-hosts/index.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("RESEND_API_KEY", "resend-key");
Deno.env.set("SIGNUP_NOTIFICATION_FROM", "StageTime PNW <noreply@example.com>");
Deno.env.set("SYNC_FUNCTION_SECRET", "secret");

const post = (body: unknown, auth = "Bearer secret") =>
  new Request("https://example.test/notify-hosts", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) });

Deno.test("the alert names the comedian, lists each line with its Pacific time, and links to the Hosts tab", () => {
  const mail = buildHostsAlert({
    comedian: "Dog Dude",
    email: "dog@example.com",
    messages: [
      { body: "Running 10 min late", photo: false, at: "2026-10-23T02:12:00Z" },
      { body: null, photo: true, at: "2026-10-23T02:13:30Z" },
    ],
    url: "https://stagetimepnw.tapandlaunch.com/hosts",
  });
  assert.equal(mail.subject, "Dog Dude messaged the hosts");
  assert.match(mail.text, /Dog Dude \(dog@example\.com\) wrote/);
  assert.match(mail.text, /7:12 PM {2}Running 10 min late/);
  assert.match(mail.text, /7:13 PM {2}\(a photo\)/);
  assert.match(mail.text, /https:\/\/stagetimepnw\.tapandlaunch\.com\/hosts/);
  assert.match(mail.html, /Reply in the Hosts tab/);
});

Deno.test("HTML in a message is shown as text, not rendered", () => {
  const mail = buildHostsAlert({ comedian: "<b>x</b>", email: "x@example.com", messages: [{ body: "<script>alert(1)</script>", photo: false, at: "2026-10-23T02:12:00Z" }], url: "https://example.test" });
  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&lt;b&gt;x&lt;\/b&gt;/);
});

Deno.test("refuses calls without the shared secret", async () => {
  const response = await handler(post({}, "Bearer wrong"));
  assert.equal(response.status, 401);
});

Deno.test("sends nothing when there are no pending messages", async () => {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
  };
  try {
    const response = await handler(post({}));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 0, errors: [] });
    assert.equal(calls.filter((u) => u.includes("resend.com")).length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("one email per comedian per run, to every host, then the messages are marked", async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes("comedian_messages?") && (init?.method ?? "GET") === "GET") {
      return Promise.resolve(Response.json([
        { id: 1, created_at: "2026-10-23T02:12:00Z", comedian_id: "c1", author_name: "Dog Dude", body: "Late!", photo_path: null },
        { id: 2, created_at: "2026-10-23T02:12:30Z", comedian_id: "c1", author_name: "Dog Dude", body: "10 min", photo_path: null },
        { id: 3, created_at: "2026-10-23T02:14:00Z", comedian_id: "c2", author_name: "Jason Katz", body: "Can I go later?", photo_path: null },
      ]));
    }
    if (url.includes("host_chat_members")) return Promise.resolve(Response.json([{ email: "a@example.com" }, { email: "b@example.com" }, { email: "c@example.com" }]));
    if (url.includes("/auth/v1/admin/users/")) return Promise.resolve(Response.json({ email: url.endsWith("c1") ? "dog@example.com" : "jason@example.com" }));
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    const response = await handler(post({}));
    assert.deepEqual(await response.json(), { sent: 2, errors: [] });
    const emails = calls.filter((c) => c.url.includes("resend.com"));
    assert.equal(emails.length, 2);
    assert.deepEqual((emails[0].body as { to: string[] }).to, ["a@example.com", "b@example.com", "c@example.com"]);
    assert.match((emails[0].body as { text: string }).text, /Late!\n7:12 PM {2}10 min/);
    const marks = calls.filter((c) => c.method === "PATCH").map((c) => c.url);
    assert.ok(marks.some((u) => u.includes("id=in.(1,2)")));
    assert.ok(marks.some((u) => u.includes("id=in.(3)")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
