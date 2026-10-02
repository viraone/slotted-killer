// Rules for the Friday lineup, shared by the lineup feed and the selection
// email. Pure functions only (no Deno APIs, no network) so they are easy to
// test. The host picks the lineup by typing a set length and a start time next
// to a comic's name in the Google Sheet; walk-ins are typed in by name only.

export interface SheetRow {
  name: string;
  setLength: string;
  startTime: string;
  email: string;
  instagram: string;
  /** When the request was made, as the sync function wrote it (ISO). */
  submittedAt: string;
}

export interface LineupEntry {
  name: string;
  set_length: string;
  start_time: string;
  /** Set only on the asking comic's own row, so the page can mark it. */
  mine?: true;
}

const clean = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Turns the sheet's rows (array of arrays) into typed rows. The header row is
 * recognised by a first cell of NAME; blank headers fall back to the fixed
 * column order A name, B set, C time, D email, E Instagram, G submitted. */
export function parseSheet(values: unknown[][]): SheetRow[] {
  if (!values.length) return [];
  const first = (values[0] ?? []).map((c) => clean(c).toUpperCase());
  const hasHeader = first[0] === "NAME";
  const find = (...labels: string[]) => first.findIndex((h) => labels.includes(h));
  const findLike = (word: string) => first.findIndex((h) => h.includes(word));
  const idx = {
    name: 0,
    set: hasHeader && find("SET", "LENGTH") !== -1 ? find("SET", "LENGTH") : 1,
    time: hasHeader && find("TIME") !== -1 ? find("TIME") : 2,
    email: hasHeader && findLike("EMAIL") !== -1 ? findLike("EMAIL") : 3,
    ig: hasHeader && findLike("INSTAGRAM") !== -1 ? findLike("INSTAGRAM") : 4,
    submitted: hasHeader && findLike("SUBMITTED") !== -1 ? findLike("SUBMITTED") : 6,
  };
  return (hasHeader ? values.slice(1) : values)
    .map((r) => ({
      name: clean(r[idx.name]),
      setLength: clean(r[idx.set]),
      startTime: clean(r[idx.time]),
      email: clean(r[idx.email]).toLowerCase(),
      instagram: clean(r[idx.ig]),
      submittedAt: clean(r[idx.submitted]),
    }))
    .filter((r) => r.name !== "");
}

/** In the lineup = the host typed a set length or a time, or typed the name by
 * hand (a walk-in has no email). A request nobody has touched is not. */
export function isSelected(r: SheetRow): boolean {
  return r.name !== "" && (r.setLength !== "" || r.startTime !== "" || r.email === "");
}

export function formatSetLength(value: string): string {
  const t = clean(value);
  if (!t) return "";
  return /^\d+(?:\.\d+)?$/.test(t) ? `${t} min` : t;
}

export function formatStartTime(value: string): string {
  const t = clean(value);
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return t;
  const h = Number(m[1]);
  if (h > 23) return t;
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

export function lineupOf(rows: SheetRow[], mine?: SheetRow): LineupEntry[] {
  return rows.filter(isSelected).map((r) => ({
    name: r.name,
    set_length: formatSetLength(r.setLength),
    start_time: formatStartTime(r.startTime),
    // Marked by row, not by position or name, so it follows the comic when the host moves them.
    ...(mine && r === mine ? { mine: true as const } : {}),
  }));
}

/** The comic's own row: the last one with their email, if they're selected. */
export function selectionFor(rows: SheetRow[], email: string): SheetRow | undefined {
  const e = clean(email).toLowerCase();
  if (!e) return undefined;
  return [...rows].reverse().find((r) => r.email === e && isSelected(r));
}

// ---- Seattle clock -------------------------------------------------------
const TZ = "America/Los_Angeles";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Local {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

export function seattle(date: Date): Local {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    weekday: WEEKDAYS.indexOf(p.weekday), minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

/** The instant when it is y-m-d h:min on the Seattle clock. */
export function seattleInstant(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const at = seattle(new Date(guess));
  const shown = Date.UTC(at.year, at.month - 1, at.day, Math.floor(at.minutes / 60), at.minutes % 60);
  return new Date(guess - (shown - guess));
}

const REOPEN = 21 * 60 + 40; // Friday 9:40 PM
const CLOSE = 22 * 60; // Thursday 10:00 PM

/** Requests are closed from Thursday 10 PM until Friday 9:40 PM. */
export function isClosedWindow(now: Date): boolean {
  const t = seattle(now);
  return (t.weekday === 4 && t.minutes >= CLOSE) || (t.weekday === 5 && t.minutes < REOPEN);
}

/** The most recent Friday 9:40 PM (Seattle) at or before `now`: when this
 * round of requests opened. */
export function windowStart(now: Date): Date {
  const t = seattle(now);
  let back = (t.weekday - 5 + 7) % 7;
  if (back === 0 && t.minutes < REOPEN) back = 7;
  const d = new Date(Date.UTC(t.year, t.month - 1, t.day - back));
  return seattleInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 21, 40);
}

/** Date (YYYY-MM-DD) of the show the current round of requests is for. */
export function showDate(now: Date): string {
  const t = seattle(now);
  let ahead = (5 - t.weekday + 7) % 7;
  if (ahead === 0 && t.minutes >= REOPEN) ahead = 7;
  const d = new Date(Date.UTC(t.year, t.month - 1, t.day + ahead));
  return d.toISOString().slice(0, 10);
}

export function prettyShowDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function parseSubmitted(value: string): number {
  const t = clean(value);
  if (!t) return NaN;
  const iso = /(?:Z|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}Z`;
  return Date.parse(iso);
}

/** Should this row get the "You're in" email right now? Only people who asked
 * in this round of requests (so last week's leftovers are never emailed),
 * who are selected, with an email, and only once requests have closed. */
export function shouldEmail(r: SheetRow, now: Date): boolean {
  if (!r.email || !isSelected(r) || !isClosedWindow(now)) return false;
  const at = parseSubmitted(r.submittedAt);
  return Number.isFinite(at) && at >= windowStart(now).getTime();
}
