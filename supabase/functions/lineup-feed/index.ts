// Public lineup for the Friday show: only name, set length and start time.
// Signed-in comics also get their own "selected" status (matched by email).
// Replaces reading the whole Google Sheet from the browser, which exposed
// every comic's email and Instagram to anyone with the sheet's link.
import { lineupOf, selectionFor, formatSetLength, formatStartTime, showDate } from "../_shared/lineup.ts";
import { readSheetRows, requiredEnv } from "../_shared/sheet.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

async function emailOf(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (token === anon) return "";
  const response = await fetch(`${requiredEnv("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "";
  const user = await response.json();
  return String(user.email ?? "").toLowerCase();
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const [rows, email] = await Promise.all([readSheetRows(), emailOf(request)]);
    const mine = email ? selectionFor(rows, email) : undefined;
    const lineup = lineupOf(rows, mine);
    return json(
      {
        show_date: showDate(new Date()),
        posted: lineup.length > 0,
        lineup,
        me: email ? { selected: !!mine, set_length: mine ? formatSetLength(mine.setLength) : "", start_time: mine ? formatStartTime(mine.startTime) : "" } : null,
      },
      200,
      // Per-person answers must never be shared between visitors.
      { "cache-control": email ? "private, no-store" : "public, max-age=30" },
    );
  } catch (error) {
    console.error("lineup-feed failed:", error instanceof Error ? error.message : error);
    return json({ error: "The lineup could not be loaded." }, 502);
  }
}

if (import.meta.main) Deno.serve(handler);
