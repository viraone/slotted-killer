import { corsHeaders } from "../submit-open-mic/index.ts";

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function approvalEmail(name: string, mic: string) {
  return {
    subject: "Your open mic is now live on StageTime PNW",
    text: [
      `Hi ${name},`,
      "",
      `Your open mic, “${mic},” has been approved and added to StageTime PNW.`,
      "",
      "View your listing at https://stagetimepnw.com and select the day your mic takes place.",
      "",
      "Thank you for helping us connect performers with open mics across the Pacific Northwest.",
      "",
      "StageTime PNW",
      "https://stagetimepnw.com",
    ].join("\n"),
  };
}

export async function handler(request: Request): Promise<Response> {
  const headers = { ...corsHeaders(request.headers.get("origin")), "content-type": "application/json" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in as an admin first." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!Number.isSafeInteger(body?.submission_id) || body.submission_id <= 0) {
    return json({ error: "Invalid submission id." }, 400);
  }

  let published = false;
  try {
    const base = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const userHeaders = { apikey: key, authorization, "content-type": "application/json" };
    // Validate the session remotely; never trust decoded claims from the caller.
    const user = await fetch(`${base}/auth/v1/user`, { headers: userHeaders });
    if (!user.ok) return json({ error: "Your session expired. Sign in again." }, 401);
    const access = await fetch(`${base}/rest/v1/rpc/is_app_admin`, {
      method: "POST", headers: userHeaders, body: "{}",
    });
    if (!access.ok || await access.json() !== true) return json({ error: "Admin access required." }, 403);

    const serviceHeaders = { ...userHeaders, authorization: `Bearer ${key}` };
    const rowUrl = `${base}/rest/v1/open_mic_submissions?id=eq.${body.submission_id}`;
    const rowResponse = await fetch(`${rowUrl}&select=submitter_name,submitter_email,mic_name,approval_notified_at`, { headers: serviceHeaders });
    if (!rowResponse.ok) throw new Error("Unable to read submission");
    const [submission] = await rowResponse.json();
    if (!submission) return json({ error: "Submission not found." }, 404);

    // Keep the existing database authorization and atomic publishing transaction.
    const approval = await fetch(`${base}/rest/v1/rpc/approve_open_mic_submission`, {
      method: "POST", headers: userHeaders,
      body: JSON.stringify({ p_submission_id: body.submission_id, p_record: body.record ?? null }),
    });
    if (!approval.ok) return json({ error: "Could not publish. Check the listing and try again." }, 400);
    published = true;
    if (submission.approval_notified_at) return json({ ok: true, emailSent: true });

    // Use stored submission data, never a browser-supplied recipient. A stable
    // payload and key also deduplicate concurrent requests/retries at Resend.
    const email = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json", authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "idempotency-key": `open-mic-approved-${body.submission_id}`,
      },
      body: JSON.stringify({
        from: env("SIGNUP_NOTIFICATION_FROM"), to: [submission.submitter_email],
        ...approvalEmail(submission.submitter_name, submission.mic_name),
      }),
    });
    if (!email.ok) throw new Error(`Email provider returned ${email.status}`);
    const saved = await fetch(rowUrl, {
      method: "PATCH", headers: serviceHeaders,
      body: JSON.stringify({ approval_notified_at: new Date().toISOString() }),
    });
    if (!saved.ok) throw new Error("Email accepted but notification timestamp could not be saved");
    return json({ ok: true, emailSent: true });
  } catch (error) {
    console.error("Open mic approval failed", { id: body.submission_id, published, error });
    return published
      ? json({ ok: true, emailSent: false })
      : json({ error: "Unable to complete approval. Please try again." }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
