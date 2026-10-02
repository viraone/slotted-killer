import assert from "node:assert/strict";
import { lineupOf, parseSheet, selectionFor } from "../_shared/lineup.ts";
const rows = [["NAME", "SET", "TIME", "EMAIL", "INSTAGRAM", "SLOT TYPE", "TIME SUBMITTED"], ["Nick Cody", "5", "7:00 PM", "", "", "", ""], ["Donald Robert", "3", "7:05 PM", "", "", "", ""], ["Lori Peck", "3", "7:08 PM", "", "", "", ""], ["Sara Cannon", "3", "7:11 PM", "", "", "", ""], ["Kylee Nelspn", "3", "7:14 PM", "", "", "", ""], ["Ali Williams", "3", "7:17 PM", "", "", "", ""], ["David Babu", "3", "7:20 PM", "", "", "", ""], ["Masih Ahmad", "3", "7:23 PM", "", "", "", ""], ["Javann Jones", "3", "7:26 PM", "", "", "", ""], ["Ronak Sharma", "3", "7:29 PM", "", "", "", ""], ["Kevin Shiuan", "3", "7:32 PM", "", "", "", ""], ["April Lotshaw", "3", "7:35 PM", "", "", "", ""], ["Danny Anderson", "3", "7:38 PM", "", "", "", ""], ["Timothy Edwards", "3", "7:41 PM", "", "", "", ""], ["Brian Fukuda", "3", "7:44 PM", "", "", "", ""], ["Bree Real", "10", "7:47 PM", "", "", "", ""], ["Cody Clemens", "3", "7:57 PM", "", "", "", ""], ["BLAKE KILTOFF", "3", "8:00 PM", "", "", "", ""], ["Craig Stewart", "3", "8:03 PM", "", "", "", ""], ["Sam Song", "3", "8:06 PM", "", "", "", ""], ["Jordan Moore", "3", "8:09 PM", "", "", "", ""], ["Jason Katz", "3", "8:12 PM", "", "", "", ""], ["English John", "3", "8:15 PM", "", "", "", ""], ["Sterling Washington", "3", "8:18 PM", "", "", "", ""]];
Deno.test("the real Friday list: 24 comics, set length then time, in sheet order", () => {
  const l = lineupOf(parseSheet(rows));
  assert.equal(l.length, 24);
  assert.deepEqual(l[0], { name: "Nick Cody", set_length: "5 min", start_time: "7:00 PM" });
  assert.deepEqual(l[15], { name: "Bree Real", set_length: "10 min", start_time: "7:47 PM" });
  assert.deepEqual(l[23], { name: "Sterling Washington", set_length: "3 min", start_time: "8:18 PM" });
});
