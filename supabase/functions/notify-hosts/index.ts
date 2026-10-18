// Emails the show's hosts when a comedian writes to them on the "Message the Hosts" tab.
// Runs every minute from pg_cron (same secret as the signup sync). Takes the comedian messages the hosts have not
// been told about yet, sends one email per comedian per run (a burst of three lines is one email), to every host in
// host_chat_members, and marks the messages notified. Hosts' own replies are never emailed about.
import { requiredEnv } from "../_shared/sheet.ts";

const jsonHeaders = { "content-type": "application/json" };
const MAX_PER_RUN = 50;
const TIME_ZONE = "America/Los_Angeles";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface PendingMessage {
  id: number;
  created_at: string;
  comedian_id: string;
  author_name: string;
  body: string | null;
  photo_path: string | null;
}

export function buildHostsAlert(input: {
  comedian: string;
  email: string;
  messages: { body: string | null; photo: boolean; at: string }[];
  url: string;
}) {
  const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const lines = input.messages.map((m) => `${time(m.at)}  ${m.body ?? ""}${m.photo ? (m.body ? " (with a photo)" : "(a photo)") : ""}`.trimEnd());
  const subject = `${input.comedian} messaged the hosts`;
  const text = [
    `${input.comedian} (${input.email}) wrote on Message the Hosts:`,
    "",
    ...lines,
    "",
    `Reply in the Hosts tab: ${input.url}`,
    "",
    "— StageTime PNW",
  ].join("\n");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#18181b">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#dc2626">Message the Hosts</p>
<h1 style="margin:0 0 6px;font-size:24px;line-height:1.2">${escapeHtml(input.comedian)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#52525b">${escapeHtml(input.email)}</p>
${input.messages
  .map(
    (m) => `<div style="padding:12px 14px;background:#f4f4f5;border-radius:12px;margin:0 0 8px">
<div style="font-size:12px;color:#71717a;margin:0 0 4px">${escapeHtml(time(m.at))}</div>
<div style="font-size:16px;line-height:1.4;white-space:pre-wrap">${escapeHtml(m.body ?? "")}${m.photo ? `<span style="color:#71717a">${m.body ? " (with a photo)" : "(a photo)"}</span>` : ""}</div>
</div>`
  )
  .join("")}
<p style="margin:20px 0 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px">Reply in the Hosts tab</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">StageTime PNW</p>
</div>`;
  return { subject, text, html };
}

async function sendEmail(to: string[], mail: { subject: string; text: string; html: string }, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "idempotency-key": idempotencyKey },
    body: JSON.stringify({ from: requiredEnv("SIGNUP_NOTIFICATION_FROM"), to, ...mail }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}

function serviceHeaders() {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { ...jsonHeaders, apikey: key, authorization: `Bearer ${key}` };
}

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders(), ...(init.headers ?? {}) } });
}

async function comedianEmail(id: string): Promise<string> {
  const response = await fetch(`${requiredEnv("SUPABASE_URL")}/auth/v1/admin/users/${id}`, { headers: serviceHeaders() });
  if (!response.ok) return "";
  const user = await response.json();
  return typeof user?.email === "string" ? user.email : "";
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("SYNC_FUNCTION_SECRET")}`) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const url = Deno.env.get("HOSTS_CHAT_URL") ?? "https://stagetimepnw.tapandlaunch.com/hosts";

  try {
    // A sample to one address, to see what the hosts will get. Reads and writes nothing.
    if (typeof body?.test_to === "string" && body.test_to.includes("@")) {
      const mail = buildHostsAlert({
        comedian: "Jamie Lee",
        email: "jamie@example.com",
        messages: [{ body: "Running about 10 minutes late, sorry!", photo: false, at: new Date().toISOString() }],
        url,
      });
      await sendEmail([body.test_to], { ...mail, subject: `[TEST] ${mail.subject}` }, `hosts-alert-test-${crypto.randomUUID()}`);
      return json({ test_sent_to: body.test_to });
    }

    const pendingResponse = await rest(
      `comedian_messages?from_host=eq.false&hosts_notified_at=is.null&order=created_at.asc&limit=${MAX_PER_RUN}&select=id,created_at,comedian_id,author_name,body,photo_path`
    );
    if (!pendingResponse.ok) throw new Error(`Could not read messages (${pendingResponse.status})`);
    const pending = (await pendingResponse.json()) as PendingMessage[];
    if (pending.length === 0) return json({ sent: 0, errors: [] });

    const hostsResponse = await rest("host_chat_members?select=email");
    if (!hostsResponse.ok) throw new Error(`Could not read the hosts (${hostsResponse.status})`);
    const hosts = ((await hostsResponse.json()) as { email: string }[]).map((h) => h.email);
    if (hosts.length === 0) return json({ sent: 0, errors: ["No hosts to email"] });

    const byComedian = new Map<string, PendingMessage[]>();
    for (const m of pending) byComedian.set(m.comedian_id, [...(byComedian.get(m.comedian_id) ?? []), m]);

    const errors: string[] = [];
    let sent = 0;
    for (const [comedianId, messages] of byComedian) {
      const ids = messages.map((m) => m.id);
      try {
        const mail = buildHostsAlert({
          comedian: messages[0].author_name,
          email: await comedianEmail(comedianId),
          messages: messages.map((m) => ({ body: m.body, photo: !!m.photo_path, at: m.created_at })),
          url,
        });
        await sendEmail(hosts, mail, `hosts-alert-${ids.join("-")}`);
        const mark = await rest(`comedian_messages?id=in.(${ids.join(",")})`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ hosts_notified_at: new Date().toISOString() }),
        });
        if (!mark.ok) throw new Error(`Sent, but could not mark the messages (${mark.status})`);
        sent += 1;
      } catch (error) {
        errors.push(`${messages[0].author_name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    return json({ sent, errors });
  } catch (error) {
    console.error("notify-hosts failed:", error instanceof Error ? error.message : error);
    return json({ error: "Notification run failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
