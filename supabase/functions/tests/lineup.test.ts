import assert from "node:assert/strict";
import {
  formatSetLength, formatStartTime, isClosedWindow, isSelected, lineupOf, parseSheet, prettyShowDate,
  selectionFor, showDate, shouldEmail, windowStart,
} from "../_shared/lineup.ts";

const header = ["NAME", "", "", "EMAIL", "INSTAGRAM", "SLOT TYPE", "TIME SUBMITTED", "START"];
const sheet = [
  header,
  ["Nick Cody", "5", "7:00 PM", "", "", "", "", ""],
  ["Jason Katz", "", "", "jason@example.com", "@jk", "First Available", "2026-10-01T02:00:00+00:00", ""],
  ["Lori Peck", "7", "7:10 PM", "Lori@Example.com", "@lp", "First Available", "2026-10-02T02:30:51+00:00", ""],
  ["Old Timer", "5", "8:00 PM", "old@example.com", "", "First Available", "2026-09-20T02:00:00+00:00", ""],
  ["English John", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
];

Deno.test("parses rows and drops the header and blank rows", () => {
  const rows = parseSheet(sheet);
  assert.equal(rows.length, 5);
  assert.equal(rows[2].email, "lori@example.com");
  assert.equal(rows[1].setLength, "");
});

Deno.test("selected = set or time typed, or a hand-typed name; untouched requests are not", () => {
  const rows = parseSheet(sheet);
  assert.deepEqual(rows.map(isSelected), [true, false, true, true, true]);
});

Deno.test("the lineup keeps sheet order and formats set and time", () => {
  assert.deepEqual(lineupOf(parseSheet(sheet)).map((e) => [e.name, e.set_length, e.start_time]), [
    ["Nick Cody", "5 min", "7:00 PM"], ["Lori Peck", "7 min", "7:10 PM"], ["Old Timer", "5 min", "8:00 PM"], ["English John", "", ""],
  ]);
});

Deno.test("formatters", () => {
  assert.equal(formatSetLength("5"), "5 min");
  assert.equal(formatSetLength("Headliner"), "Headliner");
  assert.equal(formatStartTime("19:05"), "7:05 PM");
  assert.equal(formatStartTime("7:00 PM"), "7:00 PM");
  assert.equal(formatStartTime("0:30"), "12:30 AM");
});

Deno.test("finds a comic by email, ignoring case, only when selected", () => {
  const rows = parseSheet(sheet);
  assert.equal(selectionFor(rows, "LORI@example.com")?.name, "Lori Peck");
  assert.equal(selectionFor(rows, "jason@example.com"), undefined);
  assert.equal(selectionFor(rows, "nobody@example.com"), undefined);
  assert.equal(selectionFor(rows, ""), undefined);
});

const at = (s: string) => new Date(s);
Deno.test("closed window: Thu 10 PM to Fri 9:40 PM Seattle", () => {
  assert.equal(isClosedWindow(at("2026-10-01T21:59:00-07:00")), false);
  assert.equal(isClosedWindow(at("2026-10-01T22:00:00-07:00")), true);
  assert.equal(isClosedWindow(at("2026-10-02T12:00:00-07:00")), true);
  assert.equal(isClosedWindow(at("2026-10-02T21:39:00-07:00")), true);
  assert.equal(isClosedWindow(at("2026-10-02T21:40:00-07:00")), false);
  assert.equal(isClosedWindow(at("2026-10-05T12:00:00-07:00")), false);
  assert.equal(isClosedWindow(at("2026-11-05T22:00:00-08:00")), true); // after the clocks change
});

Deno.test("show date and window start", () => {
  assert.equal(showDate(at("2026-10-01T22:30:00-07:00")), "2026-10-02");
  assert.equal(showDate(at("2026-10-02T21:41:00-07:00")), "2026-10-09");
  assert.equal(showDate(at("2026-10-05T10:00:00-07:00")), "2026-10-09");
  assert.equal(prettyShowDate("2026-10-09"), "Friday, Oct 9");
  assert.equal(windowStart(at("2026-10-01T22:30:00-07:00")).toISOString(), "2026-09-26T04:40:00.000Z");
  assert.equal(windowStart(at("2026-10-02T21:41:00-07:00")).toISOString(), "2026-10-03T04:40:00.000Z");
});

Deno.test("who gets emailed: this round's selected requesters, only once closed", () => {
  const rows = parseSheet(sheet);
  const thursdayNight = at("2026-10-01T22:30:00-07:00");
  assert.deepEqual(rows.filter((r) => shouldEmail(r, thursdayNight)).map((r) => r.name), ["Lori Peck"]);
  // Open window: nobody is emailed yet.
  assert.equal(rows.filter((r) => shouldEmail(r, at("2026-10-01T12:00:00-07:00"))).length, 0);
  // Last week's leftover (Old Timer) is never emailed, nor are untouched requests or walk-ins.
});
