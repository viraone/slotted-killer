// Receives a "Report a change" form post from stagetimepnw.com (an open mic was
// cancelled for a date, closed for good, changed time or venue, ...), stores it in
// public.open_mic_change_reports with the service role, and emails the admin
// through Resend (same provider as submit-open-mic).
//
// Env (project secrets): RESEND_API_KEY, SIGNUP_NOTIFICATION_FROM (already set for
// submit-open-mic) and optionally OPEN_MIC_NOTIFICATION_TO (defaults below).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

export type ChangeReport = {
  mic_id: string | null;
  mic_name: string;
  show_date: string | null;
  change_type: string;
  comment: string;
  reporter_email: string | null;
  page_url: string | null;
};

export const DEFAULT_NOTIFICATION_TO = "vxayananh@gmail.com";
export const CHANGE_TYPES: Record<string, string> = {
  not_this_date: "Not happening on this date",
  closed_for_good: "No longer happening",
  time_change: "Time change",
  venue_change: "Venue or address change",
  other: "Something else",
};
// Reports allowed per hour, all visitors together. Past this the form says to try later.
export const HOURLY_REPORT_LIMIT = 30;
const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?stagetimepnw\.com$/i,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
];
const jsonHeaders = { "content-type": "application/json" };

export class ValidationError extends Error {}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))
    ? origin
    : "https://stagetimepnw.com";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function text(
  value: unknown,
  field: string,
  { required = false, max = 500 }: { required?: boolean; max?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ValidationError(`${field} is required.`);
    return null;
  }
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max} characters).`);
  return trimmed;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseReport(body: unknown): ChangeReport {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Expected a JSON object.");
  }
  const input = body as Record<string, unknown>;

  const change_type = text(input.change_type, "What changed", { required: true, max: 40 })!;
  if (!Object.hasOwn(CHANGE_TYPES, change_type)) {
    throw new ValidationError("What changed has an unexpected value.");
  }

  const show_date = text(input.show_date, "Show date", { max: 10 });
  if (show_date !== null && !isRealDate(show_date)) {
    throw new ValidationError("Show date must look like 2026-11-12.");
  }
  if (change_type === "not_this_date" && show_date === null) {
    throw new ValidationError("Pick the date that isn't happening.");
  }

  const reporter_email = text(input.reporter_email, "Email", { max: 254 })?.toLowerCase() ?? null;
  if (reporter_email !== null && !isEmail(reporter_email)) {
    throw new ValidationError("That email address doesn't look valid.");
  }

  return {
    mic_id: text(input.mic_id, "Open mic", { max: 200 }),
    mic_name: text(input.mic_name, "Open mic name", { required: true, max: 160 })!,
    show_date,
    change_type,
    comment: text(input.comment, "Comment", { required: true, max: 2000 })!,
    reporter_email,
    page_url: text(input.page_url, "Page", { max: 1000 }),
  };
}

function projectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
}

// "2026-11-12" -> "Thursday, Nov 12, 2026"
export function formatShowDate(value: string | null): string {
  if (!value || !isRealDate(value)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function buildNotification(
  report: ChangeReport,
  id: number | null,
  createdAt: string,
  supabaseUrl: string,
): { subject: string; text: string } {
  const when = new Date(createdAt);
  const stamp = Number.isNaN(when.getTime())
    ? createdAt
    : new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(when);
  const ref = projectRef(supabaseUrl);
  const label = CHANGE_TYPES[report.change_type] ?? report.change_type;

  const lines: Array<string | null> = [
    "Someone reported a change to an open mic on stagetimepnw.com.",
    "",
    "THE REPORT",
    `- Open mic: ${report.mic_name}`,
    report.mic_id ? `- Listing id: ${report.mic_id}` : null,
    `- What changed: ${label}`,
    `- Date: ${formatShowDate(report.show_date)}`,
    `- Their comment: ${report.comment}`,
    report.reporter_email
      ? `- Reporter: ${report.reporter_email} (reply to this email to reach them)`
      : "- Reporter: left no email",
    report.page_url ? `- Sent from: ${report.page_url}` : null,
    "",
    "REVIEW",
    `- Report ${id === null ? "" : `#${id} `}received ${stamp} (Seattle time)`,
    "- Accept or dismiss it: https://stagetimepnw.com/?admin=1",
    "- Accepting only records your decision; update the listing afterwards.",
    ref ? `- Table: https://supabase.com/dashboard/project/${ref}/editor` : null,
  ];

  return {
    subject: `Open mic change reported: ${report.mic_name} (${label})`.replace(/[\r\n]+/g, " "),
    text: lines.filter((line) => line !== null).join("\n"),
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown failure";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function supabaseHeaders(serviceRoleKey: string) {
  return {
    ...jsonHeaders,
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(serviceRoleKey), ...(init.headers ?? {}) },
  });
}

// How many reports arrived in the last hour, from every visitor together.
async function reportsInLastHour(): Promise<number> {
  const since = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const response = await supabaseRequest(`open_mic_change_reports?select=id&created_at=gte.${since}`, {
    method: "HEAD",
    headers: { prefer: "count=exact", range: "0-0" },
  });
  if (!response.ok) throw new Error(`Unable to count recent reports (${response.status})`);
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function insertReport(report: ChangeReport): Promise<{ id: number; created_at: string }> {
  const response = await supabaseRequest("open_mic_change_reports?select=id,created_at", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(report),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Unable to save report (${response.status}): ${detail}`);
  }
  const rows = await response.json();
  if (!rows?.[0]?.id) throw new Error("Unable to save report: no id returned");
  return rows[0];
}

async function markNotification(id: number, values: Record<string, unknown>): Promise<void> {
  const response = await supabaseRequest(`open_mic_change_reports?id=eq.${id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Unable to record notification state (${response.status})`);
}

async function sendNotification(report: ChangeReport, id: number, createdAt: string): Promise<void> {
  const notification = buildNotification(report, id, createdAt, requiredEnv("SUPABASE_URL"));
  const to = Deno.env.get("OPEN_MIC_NOTIFICATION_TO")?.trim() || DEFAULT_NOTIFICATION_TO;
  const payload: Record<string, unknown> = {
    from: requiredEnv("SIGNUP_NOTIFICATION_FROM"),
    to: [to],
    subject: notification.subject,
    text: notification.text,
  };
  if (report.reporter_email) payload.reply_to = report.reporter_email;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "idempotency-key": `open-mic-change-report-${id}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Notification delivery failed (${response.status})`);
}

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, cors);
  }

  // Honeypot: the form's hidden "company" field. Bots fill it; pretend it worked.
  if (body && typeof body === "object" && typeof (body as Record<string, unknown>).company === "string"
    && String((body as Record<string, unknown>).company).trim()) {
    return json({ ok: true, id: null, emailSent: false }, 200, cors);
  }

  let report: ChangeReport;
  try {
    report = parseReport(body);
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message }, 400, cors);
    console.error("Report parsing failed", { category: "PARSE_FAILED", message: sanitizeError(error) });
    return json({ error: "Could not read your report. Please try again." }, 500, cors);
  }

  try {
    if (await reportsInLastHour() >= HOURLY_REPORT_LIMIT) {
      return json({ error: "We're getting a lot of reports right now. Please try again in a little while." }, 429, cors);
    }
  } catch (error) {
    // A failed count must not block a genuine report.
    console.error("Report rate check failed", { category: "RATE_CHECK_FAILED", message: sanitizeError(error) });
  }

  let saved: { id: number; created_at: string };
  try {
    saved = await insertReport(report);
  } catch (error) {
    console.error("Report insert failed", { category: "INSERT_FAILED", message: sanitizeError(error) });
    return json({ error: "Could not save your report. Please try again in a minute." }, 500, cors);
  }

  // The row is safe at this point; email problems must not fail the request.
  let emailSent = false;
  try {
    await sendNotification(report, saved.id, saved.created_at);
    emailSent = true;
    await markNotification(saved.id, { notified_at: new Date().toISOString(), notify_error: null });
  } catch (error) {
    const message = sanitizeError(error);
    console.error("Report notification failed", { category: "NOTIFY_FAILED", id: saved.id, message });
    try {
      await markNotification(saved.id, { notify_error: message });
    } catch (stateError) {
      console.error("Unable to persist notification failure", {
        category: "STATE_UPDATE_FAILED",
        id: saved.id,
        message: sanitizeError(stateError),
      });
    }
  }

  return json({ ok: true, id: saved.id, emailSent }, 200, cors);
}

if (import.meta.main) Deno.serve(handler);
