import assert from "node:assert/strict";
import { handler } from "../approve-open-mic/index.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test");
Deno.env.set("RESEND_API_KEY", "resend-test");
Deno.env.set("SIGNUP_NOTIFICATION_FROM", "StageTime PNW <mics@stagetimepnw.com>");

for (const scenario of ["success", "anonymous", "expired", "nonadmin", "publish-failed", "email-failed", "already-sent", "timestamp-failed"]) {
  Deno.test(`approval notification: ${scenario}`, async () => {
    const original = globalThis.fetch;
    const calls: { url: string; body: any; headers: any }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, headers: init?.headers });
      const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
      if (url.endsWith("/auth/v1/user")) return reply({ id: "admin" }, scenario === "expired" ? 401 : 200);
      if (url.endsWith("/is_app_admin")) return reply(scenario !== "nonadmin");
      if (url.endsWith("/approve_open_mic_submission")) return reply({}, scenario === "publish-failed" ? 400 : 200);
      if (url.includes("api.resend.com")) return reply({ id: "mail" }, scenario === "email-failed" ? 500 : 200);
      if (init?.method === "PATCH") return reply({}, scenario === "timestamp-failed" ? 500 : 200);
      if (url.includes("open_mic_submissions")) return reply([{
        submitter_name: "Taylor", submitter_email: "submitter@example.com", mic_name: "Thursday Comedy",
        approval_notified_at: scenario === "already-sent" ? "2026-09-10T00:00:00Z" : null,
      }]);
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    try {
      const response = await handler(new Request("https://example.test", {
        method: "POST", headers: scenario === "anonymous" ? {} : { authorization: "Bearer admin-session" },
        body: JSON.stringify({ submission_id: 7, record: { name: "Thursday Comedy" }, submitter_email: "attacker@example.com" }),
      }));
      const data = await response.json();
      const mail = calls.find((call) => call.url.includes("api.resend.com"));
      if (["anonymous", "expired", "nonadmin", "publish-failed"].includes(scenario)) {
        assert.ok(response.status >= 400);
        assert.equal(mail, undefined);
        if (scenario !== "publish-failed") assert.ok(!calls.some((call) => call.url.endsWith("/approve_open_mic_submission")));
      } else {
        assert.equal(data.ok, true);
        assert.equal(data.emailSent, !["email-failed", "timestamp-failed"].includes(scenario));
        if (scenario === "already-sent") assert.equal(mail, undefined);
        else {
          assert.deepEqual(mail?.body.to, ["submitter@example.com"]);
          assert.match(mail?.body.text, /Hi Taylor/);
          assert.match(mail?.body.text, /Thursday Comedy/);
          assert.match(mail?.body.text, /https:\/\/stagetimepnw.com/);
          assert.equal(mail?.headers["idempotency-key"], "open-mic-approved-7");
          const approval = calls.findIndex((call) => call.url.endsWith("/approve_open_mic_submission"));
          assert.ok(approval < calls.indexOf(mail!));
          assert.equal(calls[approval].headers.authorization, "Bearer admin-session");
        }
      }
    } finally { globalThis.fetch = original; }
  });
}
