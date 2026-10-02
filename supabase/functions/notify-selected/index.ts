// Emails each comic once when the host has selected them for Friday's show
// (typed a set length or time next to their name in the Google Sheet).
// Safety rails: off until app_settings.selection_emails_enabled is true; only
// sends once requests have closed (Thu 10 PM to Fri 9:40 PM); only to people
// who requested in this round; at most once per person per show; at most 25 a
// run. People who are not selected are never emailed.
import { isClosedWindow, prettyShowDate, shouldEmail, showDate, formatSetLength, formatStartTime, type SheetRow } from "../_shared/lineup.ts";
import { readSheetRows, requiredEnv } from "../_shared/sheet.ts";

const jsonHeaders = { "content-type": "application/json" };
const MAX_PER_RUN = 25;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildSelectionEmail(input: { name: string; show: string; startTime: string; setLength: string }) {
  const first = input.name.split(/\s+/)[0] || "there";
  const slot = [input.startTime, input.setLength].filter(Boolean).join(" · ");
  const subject = `You're in for Read The Room, ${input.show}`;
  const text = [
    `Hi ${first},`,
    "",
    "You're in!",
    "",
    "Read The Room",
    `${input.show} · Rickshaw Restaurant & Lounge`,
    slot ? `Your slot: ${slot}` : "",
    "",
    "If you can't make it, reply to this email as soon as you can so we can offer your spot to someone else.",
    "",
    "— StageTime PNW",
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#18181b">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#dc2626">Read The Room</p>
<h1 style="margin:0 0 6px;font-size:28px;line-height:1.15">You're in, ${escapeHtml(first)}!</h1>
<p style="margin:0 0 20px;font-size:15px;color:#52525b">${escapeHtml(input.show)} · Rickshaw Restaurant &amp; Lounge</p>
${slot ? `<div style="font-size:26px;font-weight:800;padding:16px 18px;background:#f4f4f5;border-radius:12px;margin:0 0 20px">${escapeHtml(slot)}</div>` : ""}
<p style="margin:0;font-size:14px;line-height:1.5;color:#52525b">If you can't make it, reply to this email as soon as you can so we can offer your spot to someone else.</p>
<p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">StageTime PNW</p>
</div>`;
  return { subject, text, html };
}

async function sendEmail(to: string, mail: { subject: string; text: string; html: string }, idempotencyKey: string) {
  const replyTo = Deno.env.get("SIGNUP_NOTIFICATION_TO");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "idempotency-key": idempotencyKey },
    body: JSON.stringify({ from: requiredEnv("SIGNUP_NOTIFICATION_FROM"), to: [to], ...(replyTo ? { reply_to: replyTo } : {}), ...mail }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}

function rest(path: string, init: RequestInit = {}) {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { ...jsonHeaders, apikey: key, authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
}

async function emailsEnabled(): Promise<boolean> {
  const response = await rest("app_settings?key=eq.selection_emails_enabled&select=value");
  if (!response.ok) throw new Error(`Could not read settings (${response.status})`);
  const rows = await response.json();
  return rows?.[0]?.value === true;
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("SYNC_FUNCTION_SECRET")}`) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const dry = body?.dry === true;

  try {
    // A sample to one address, to see what comics will get. Reads no sheet, writes nothing.
    if (typeof body?.test_to === "string" && body.test_to.includes("@")) {
      const mail = buildSelectionEmail({ name: "Jamie Lee", show: prettyShowDate(showDate(new Date())), startTime: "7:00 PM", setLength: "5 min" });
      await sendEmail(body.test_to, { ...mail, subject: `[TEST] ${mail.subject}` }, `selection-test-${crypto.randomUUID()}`);
      return json({ sent_test: true });
    }

    // `now` can only be overridden for a dry run (to see what would go out at another time).
    const now = dry && typeof body?.now === "string" ? new Date(body.now) : new Date();
    if (!dry && !(await emailsEnabled())) return json({ skipped: "selection emails are switched off" });
    if (!isClosedWindow(now)) return json({ skipped: "requests are still open" });

    const show = showDate(now);
    const rows = await readSheetRows(true);
    const seen = new Set<string>();
    const candidates: SheetRow[] = [];
    for (const r of rows) if (shouldEmail(r, now) && !seen.has(r.email)) { seen.add(r.email); candidates.push(r); }

    const existing = await rest(`selection_notifications?show_date=eq.${show}&select=email`);
    if (!existing.ok) throw new Error(`Could not read sent list (${existing.status})`);
    const already = new Set((await existing.json()).map((x: { email: string }) => x.email));
    const todo = candidates.filter((r) => !already.has(r.email)).slice(0, MAX_PER_RUN);

    if (dry) return json({ dry: true, show_date: show, would_send: todo.map((r) => ({ name: r.name, start_time: formatStartTime(r.startTime), set_length: formatSetLength(r.setLength) })), already_sent: already.size });

    const sent: string[] = [];
    const errors: string[] = [];
    for (const r of todo) {
      // Claim first (unique per person per show), so two overlapping runs can't both send.
      const claim = await rest("selection_notifications", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ email: r.email, show_date: show, name: r.name }),
      });
      if (!claim.ok || !(await claim.json())?.length) continue;
      try {
        const mail = buildSelectionEmail({ name: r.name, show: prettyShowDate(show), startTime: formatStartTime(r.startTime), setLength: formatSetLength(r.setLength) });
        await sendEmail(r.email, mail, `selected-${show}-${r.email}`);
        sent.push(r.name);
      } catch (error) {
        await rest(`selection_notifications?email=eq.${encodeURIComponent(r.email)}&show_date=eq.${show}`, { method: "DELETE" });
        errors.push(`${r.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    return json({ show_date: show, sent: sent.length, errors });
  } catch (error) {
    console.error("notify-selected failed:", error instanceof Error ? error.message : error);
    return json({ error: "Notification run failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
