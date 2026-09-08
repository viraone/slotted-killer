// Receives an "Add Your Mic" submission from stagetimepnw.com/add-mic, stores it
// in public.open_mic_submissions with the service role, and emails the admin
// through Resend (same provider as sync-verified-signup).
//
// Env (project secrets): RESEND_API_KEY, SIGNUP_NOTIFICATION_FROM (already set for
// sync-verified-signup) and optionally OPEN_MIC_NOTIFICATION_TO (defaults below).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

export type Submission = {
  submitter_name: string;
  submitter_email: string;
  submitter_instagram: string | null;
  submitter_role: string | null;
  submitter_notes: string | null;
  mic_name: string;
  venue: string | null;
  location: string;
  days: string[];
  recurrence_text: string | null;
  signup_time: string | null;
  start_time: string | null;
  end_time: string | null;
  signup_type: string | null;
  web_signup: string | null;
  open_mic_type: string | null;
  age_requirement: string | null;
  price: string | null;
  host: string | null;
  flyer_url: string | null;
  record: Record<string, unknown>;
  page_url: string | null;
};

export const DEFAULT_NOTIFICATION_TO = "vxayananh@gmail.com";
const FLYER_BUCKET = "open-mic-flyers";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SIGNUP_TYPES = ["in-person", "online", "both"];
const ROLES: Record<string, string> = {
  host: "hosts it",
  booker: "books / produces it",
  venue: "is with the venue",
  performer: "performs there",
  other: "other",
};
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

function oneOf(value: unknown, field: string, options: string[]): string | null {
  const chosen = text(value, field, { max: 40 });
  if (chosen === null) return null;
  if (!options.includes(chosen)) throw new ValidationError(`${field} has an unexpected value.`);
  return chosen;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseSubmission(body: unknown, supabaseUrl: string): Submission {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Expected a JSON object.");
  }
  const input = body as Record<string, unknown>;

  const submitter_email = text(input.submitter_email, "Email", { required: true, max: 254 })!.toLowerCase();
  if (!isEmail(submitter_email)) throw new ValidationError("That email address doesn't look valid.");

  const rawDays = Array.isArray(input.days) ? input.days : [];
  const days = WEEKDAYS.filter((day) => rawDays.includes(day));
  if (!days.length) throw new ValidationError("Pick at least one day of the week.");

  const record = input.record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new ValidationError("The listing record is missing.");
  }
  if (JSON.stringify(record).length > 20_000) throw new ValidationError("The listing record is too large.");

  const flyer_url = text(input.flyer_url, "Flyer", { max: 1000 });
  const flyerPrefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${FLYER_BUCKET}/`;
  if (flyer_url && !flyer_url.startsWith(flyerPrefix)) {
    throw new ValidationError("Flyers must be uploaded through the form.");
  }

  return {
    submitter_name: text(input.submitter_name, "Your name", { required: true, max: 120 })!,
    submitter_email,
    submitter_instagram: text(input.submitter_instagram, "Your Instagram", { max: 120 }),
    submitter_role: oneOf(input.submitter_role, "Your role", Object.keys(ROLES)),
    submitter_notes: text(input.submitter_notes, "Notes", { max: 4000 }),
    mic_name: text(input.mic_name, "Open mic name", { required: true, max: 160 })!,
    venue: text(input.venue, "Venue", { max: 160 }),
    location: text(input.location, "Address", { required: true, max: 300 })!,
    days,
    recurrence_text: text(input.recurrence_text, "Schedule", { max: 200 }),
    signup_time: text(input.signup_time, "Sign-up time", { max: 20 }),
    start_time: text(input.start_time, "Start time", { max: 20 }),
    end_time: text(input.end_time, "End time", { max: 20 }),
    signup_type: oneOf(input.signup_type, "Sign-up method", SIGNUP_TYPES),
    web_signup: text(input.web_signup, "Online sign-up link", { max: 1000 }),
    open_mic_type: text(input.open_mic_type, "Mic type", { max: 120 }),
    age_requirement: text(input.age_requirement, "Age", { max: 40 }),
    price: text(input.price, "Cost", { max: 120 }),
    host: text(input.host, "Host", { max: 160 }),
    flyer_url,
    record: record as Record<string, unknown>,
    page_url: text(input.page_url, "Page", { max: 1000 }),
  };
}

// "19:30" -> "7:30 PM"
export function formatClock(value: string | null): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return value?.trim() || "—";
  const hour24 = Number(match[1]) % 24;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

function projectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
}

export function buildNotification(
  submission: Submission,
  id: number | null,
  createdAt: string,
  supabaseUrl: string,
): { subject: string; text: string } {
  const record = submission.record;
  const str = (key: string): string => {
    const value = record[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const when = new Date(createdAt);
  const stamp = Number.isNaN(when.getTime())
    ? createdAt
    : new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(when);
  const ref = projectRef(supabaseUrl);
  const roleLabel = submission.submitter_role ? ROLES[submission.submitter_role] : "";

  const lines: Array<string | null> = [
    "A new open mic was submitted through stagetimepnw.com/add-mic.",
    "",
    "THE MIC",
    `- Name: ${submission.mic_name}`,
    submission.venue ? `- Venue: ${submission.venue}` : null,
    `- Address: ${submission.location}`,
    `- Schedule: ${submission.recurrence_text || submission.days.join(", ")}`,
    `- Sign-up: ${formatClock(submission.signup_time)} · Show: ${formatClock(submission.start_time)}${
      submission.end_time ? ` – ${formatClock(submission.end_time)}` : ""
    }`,
    `- Sign-up method: ${submission.signup_type || "—"}${submission.web_signup ? ` · ${submission.web_signup}` : ""}`,
    str("signupDetails") ? `- Sign-up details: ${str("signupDetails")}` : null,
    `- Type: ${submission.open_mic_type || "—"} · Age: ${submission.age_requirement || "—"} · Cost: ${
      submission.price || "—"
    }`,
    submission.host ? `- Host: ${submission.host}` : null,
    str("contact") ? `- Contact: ${str("contact")}` : null,
    str("website") ? `- Website: ${str("website")}` : null,
    str("requirementsInfo") ? `- Details & rules: ${str("requirementsInfo")}` : null,
    record.wheelchairAccessible === true ? "- Wheelchair accessible" : null,
    submission.flyer_url ? `- Flyer: ${submission.flyer_url}` : null,
    "",
    "SUBMITTED BY",
    `- ${submission.submitter_name} <${submission.submitter_email}>${roleLabel ? ` (${roleLabel})` : ""}`,
    submission.submitter_instagram ? `- Instagram: ${submission.submitter_instagram}` : null,
    submission.submitter_notes ? `- Notes: ${submission.submitter_notes}` : null,
    "- Reply to this email to reach them directly.",
    "",
    "REVIEW",
    `- Submission ${id === null ? "" : `#${id} `}received ${stamp} (Seattle time)`,
    ref ? `- Table: https://supabase.com/dashboard/project/${ref}/editor` : null,
    "- Pull it: node scripts/pull-open-mic-submissions.mjs",
    "- After pasting into data/open-mics.json: node scripts/geocode-open-mics.mjs --write",
    "",
    "open-mics.json record:",
    JSON.stringify(record, null, 2),
  ];

  return {
    subject: `New open mic submission: ${submission.mic_name}`,
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

async function insertSubmission(submission: Submission): Promise<{ id: number; created_at: string }> {
  const response = await supabaseRequest("open_mic_submissions?select=id,created_at", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(submission),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Unable to save submission (${response.status}): ${detail}`);
  }
  const rows = await response.json();
  if (!rows?.[0]?.id) throw new Error("Unable to save submission: no id returned");
  return rows[0];
}

async function markNotification(id: number, values: Record<string, unknown>): Promise<void> {
  const response = await supabaseRequest(`open_mic_submissions?id=eq.${id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Unable to record notification state (${response.status})`);
}

async function sendNotification(submission: Submission, id: number, createdAt: string): Promise<void> {
  const notification = buildNotification(submission, id, createdAt, requiredEnv("SUPABASE_URL"));
  const to = Deno.env.get("OPEN_MIC_NOTIFICATION_TO")?.trim() || DEFAULT_NOTIFICATION_TO;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "idempotency-key": `open-mic-submission-${id}`,
    },
    body: JSON.stringify({
      from: requiredEnv("SIGNUP_NOTIFICATION_FROM"),
      to: [to],
      reply_to: submission.submitter_email,
      subject: notification.subject,
      text: notification.text,
    }),
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

  let submission: Submission;
  try {
    submission = parseSubmission(body, requiredEnv("SUPABASE_URL"));
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message }, 400, cors);
    console.error("Submission parsing failed", { category: "PARSE_FAILED", message: sanitizeError(error) });
    return json({ error: "Could not read your submission. Please try again." }, 500, cors);
  }

  let saved: { id: number; created_at: string };
  try {
    saved = await insertSubmission(submission);
  } catch (error) {
    console.error("Submission insert failed", { category: "INSERT_FAILED", message: sanitizeError(error) });
    return json({ error: "Could not save your submission. Please try again in a minute." }, 500, cors);
  }

  // The row is safe at this point; email problems must not fail the request.
  let emailSent = false;
  try {
    await sendNotification(submission, saved.id, saved.created_at);
    emailSent = true;
    await markNotification(saved.id, { notified_at: new Date().toISOString(), notify_error: null });
  } catch (error) {
    const message = sanitizeError(error);
    console.error("Submission notification failed", { category: "NOTIFY_FAILED", id: saved.id, message });
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
