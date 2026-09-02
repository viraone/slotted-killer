import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BARK_INDEX_URL = 'https://www.barkentertainment.com/open-mic';
export const TARGETS = [
  {
    id: 'tacoma-comedy-6th-3829-6th-ave-tacoma-wa-98406',
    label: '6th & Proctor',
    labelPattern: /6th\s*&\s*proctor/i
  },
  {
    id: 'tacoma-comedy-downtown-933-market-st-tacoma-wa-98402',
    label: 'Downtown',
    labelPattern: /\bdowntown\b/i
  }
];
const DATA_PATH = new URL('../data/open-mics.json', import.meta.url);
const TEMP_PATH = new URL('../data/open-mics.json.tmp', import.meta.url);
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const FETCH_TIMEOUT_MS = 20000;

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanLabel(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function findBarkListCandidates(html, labelPattern = TARGETS[0].labelPattern) {
  const candidates = [];
  const anchorPattern = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const attributes = `${match[1]} ${match[4]}`;
    const ariaMatch = /aria-label\s*=\s*(["'])(.*?)\1/i.exec(attributes);
    const label = cleanLabel(ariaMatch ? ariaMatch[2] : match[5]);
    if (!labelPattern.test(label) || !/\blist\b/i.test(label)) continue;
    const href = decodeHtml(match[3].trim());
    let url;
    try {
      url = new URL(href, BARK_INDEX_URL).href;
    } catch {
      continue;
    }
    const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`, 'i').test(label));
    candidates.push({ label, url, month: month >= 0 ? month : null, position: match.index });
  }
  return candidates;
}

export function chooseBarkList(candidates, now = new Date()) {
  if (!candidates.length) return null;
  const currentMonth = now.getUTCMonth();
  const score = (candidate) => {
    if (candidate.month === null) return -2000 + candidate.position / 1e7;
    let relativeMonth = candidate.month - currentMonth;
    if (relativeMonth < -6) relativeMonth += 12;
    if (relativeMonth > 6) relativeMonth -= 12;
    if (relativeMonth > 1) relativeMonth -= 12;
    return relativeMonth * 100 + candidate.position / 1e7;
  };
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}

// The monthly performer schedule is published as one or more PNG tables.
export function findScheduleImageUrls(html) {
  const urls = [];
  const imgPattern = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgPattern.exec(html))) {
    const srcMatch = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
    if (!srcMatch) continue;
    const src = decodeHtml(srcMatch[2]);
    const mediaMatch = /^(https:\/\/static\.wixstatic\.com\/media\/[^/?#]+~mv2\.(?:png|jpe?g|webp))/i.exec(src);
    if (!mediaMatch) continue;
    const altMatch = /\balt\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
    const alt = altMatch ? cleanLabel(altMatch[2]) : '';
    // Skip logos/icons; schedule graphics are large content images.
    const width = Number(/\bwidth\s*=\s*"(\d+)"/i.exec(match[0])?.[1] || 0);
    if (width && width < 300) continue;
    if (/logo|icon/i.test(alt)) continue;
    if (!urls.includes(mediaMatch[1])) urls.push(mediaMatch[1]);
  }
  return urls;
}

export function parseTesseractTsv(tsv) {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split('\t');
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  return lines
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length === header.length && Number(cols[idx.conf]) >= 0)
    .map((cols) => ({
      left: Number(cols[idx.left]),
      top: Number(cols[idx.top]),
      width: Number(cols[idx.width]),
      height: Number(cols[idx.height]),
      conf: Number(cols[idx.conf]),
      text: cols[idx.text].trim()
    }))
    .filter((word) => word.text);
}

function groupIntoRows(words) {
  const sorted = words.slice().sort((a, b) => a.top - b.top);
  const rows = [];
  for (const word of sorted) {
    const centerY = word.top + word.height / 2;
    const row = rows.find((r) => Math.abs(r.centerY - centerY) <= Math.max(8, word.height * 0.6));
    if (row) {
      row.words.push(word);
      row.centerY = row.words.reduce((sum, w) => sum + w.top + w.height / 2, 0) / row.words.length;
    } else {
      rows.push({ centerY, words: [word] });
    }
  }
  rows.forEach((row) => row.words.sort((a, b) => a.left - b.left));
  return rows;
}

function parseOrdinalDay(text) {
  const match = /^([0-9&lIoOsSbB|]{1,2})(st|nd|rd|th)?[.,]?$/i.exec(text);
  if (!match) return null;
  // Only the numeric part gets OCR look-alike fixes (e.g. "&th" -> "8th").
  const digits = match[1]
    .replace(/&/g, '8')
    .replace(/[lI|]/g, '1')
    .replace(/[oO]/g, '0')
    .replace(/[sS]/g, '5')
    .replace(/[bB]/g, '8');
  if (!/\d/.test(match[1]) && !match[2]) return null;
  const day = Number(digits);
  return day >= 1 && day <= 31 ? day : null;
}

function resolveYear(monthIndex, now) {
  // Lists cover the current or next month; pick the year that makes that true.
  const year = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  if (monthIndex - currentMonth < -6) return year + 1;
  if (monthIndex - currentMonth > 6) return year - 1;
  return year;
}

function toIsoDate(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCMonth() !== monthIndex) return null;
  return { iso: date.toISOString().slice(0, 10), weekday: WEEKDAYS[date.getUTCDay()] };
}

/**
 * Reads MC assignments from a Bark performer-schedule table. Every column in
 * the table has three header rows: "<Month> <Nth>", "<Weekday>", "MC <Name>".
 * Returns { 'YYYY-MM-DD': 'MC Name' }.
 */
export function extractMcSchedule(words, now = new Date()) {
  const rows = groupIntoRows(words);
  const schedule = {};

  for (let i = 0; i < rows.length; i += 1) {
    const weekdayWords = rows[i].words.filter((w) => WEEKDAYS.includes(w.text.toLowerCase()));
    if (!weekdayWords.length) continue;
    // Date cells can sit a few pixels apart, so merge the rows just above the weekdays.
    const dateWordsAll = rows.slice(Math.max(0, i - 2), i).flatMap((row) => row.words);
    const mcRow = rows.slice(i + 1, i + 3).find((row) => row.words.some((w) => /^mc$/i.test(w.text)));
    if (!dateWordsAll.length || !mcRow) continue;

    const columns = weekdayWords.map((w) => ({ centerX: w.left + w.width / 2, weekday: w.text.toLowerCase() }));
    const columnFor = (word) => {
      const centerX = word.left + word.width / 2;
      let best = null;
      for (const column of columns) {
        const distance = Math.abs(column.centerX - centerX);
        if (!best || distance < best.distance) best = { column, distance };
      }
      return best.column;
    };

    for (const column of columns) {
      const dateWords = dateWordsAll.filter((w) => columnFor(w) === column);
      const monthIndex = MONTHS.findIndex((name) => dateWords.some((w) => w.text.toLowerCase() === name));
      const day = dateWords.map((w) => parseOrdinalDay(w.text)).find((value) => value !== null);
      if (monthIndex < 0 || !day) continue;
      const resolved = toIsoDate(resolveYear(monthIndex, now), monthIndex, day);
      if (!resolved || resolved.weekday !== column.weekday) continue;

      // OCR occasionally drops the "MC" label; the rest of the cell is still the name.
      const mcWords = mcRow.words.filter((w) => columnFor(w) === column && !/^mc$/i.test(w.text));
      const name = mcWords.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!/^[A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*){0,3}$/.test(name)) continue;
      schedule[resolved.iso] = name;
    }
  }
  return schedule;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function ocrImage(url, workDir, index) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const imagePath = join(workDir, `schedule-${index}.png`);
  await writeFile(imagePath, Buffer.from(await response.arrayBuffer()));
  const { stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '--psm', '11', 'tsv'], {
    maxBuffer: 16 * 1024 * 1024
  });
  return parseTesseractTsv(stdout);
}

async function readMcSchedule(listUrl, now) {
  const html = await fetchText(listUrl);
  const imageUrls = findScheduleImageUrls(html);
  if (!imageUrls.length) throw new Error('No schedule images found on the list page');
  const workDir = await mkdtemp(join(tmpdir(), 'bark-ocr-'));
  try {
    const schedule = {};
    for (const [index, url] of imageUrls.entries()) {
      Object.assign(schedule, extractMcSchedule(await ocrImage(url, workDir, index), now));
    }
    return schedule;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function pruneSchedule(schedule, now) {
  // Keep yesterday onward so late-night viewers still see tonight's host.
  const cutoff = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Object.fromEntries(
    Object.entries(schedule)
      .filter(([date]) => date >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

export function updateRecord(records, target, selected, hostSchedule = null, now = new Date()) {
  const record = records.find((item) => item.id === target.id);
  if (!record) throw new Error(`Open mic record not found: ${target.id}`);
  let changed = false;

  if (record.listUrl !== selected.url || record.listLabel !== selected.label) {
    record.listLabel = selected.label;
    record.listUrl = selected.url;
    record.listSourceUrl = BARK_INDEX_URL;
    changed = true;
  }

  if (hostSchedule) {
    const merged = pruneSchedule({ ...(record.hostSchedule || {}), ...hostSchedule }, now);
    if (JSON.stringify(merged) !== JSON.stringify(record.hostSchedule || {})) {
      record.hostSchedule = merged;
      changed = true;
    }
  }
  return changed;
}

export async function run() {
  const now = new Date();
  const html = await fetchText(BARK_INDEX_URL);
  const records = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  if (!Array.isArray(records)) throw new Error('data/open-mics.json must contain an array');

  let changed = false;
  let failures = 0;
  for (const target of TARGETS) {
    const selected = chooseBarkList(findBarkListCandidates(html, target.labelPattern), now);
    if (!selected) {
      console.error(`No link matching “${target.label}” and “List” was found`);
      failures += 1;
      continue;
    }

    let hostSchedule = null;
    try {
      hostSchedule = await readMcSchedule(selected.url, now);
      console.log(`${target.label} MCs: ${JSON.stringify(hostSchedule)}`);
    } catch (error) {
      console.error(`${target.label} MC schedule unavailable; keeping previous hosts: ${error.message}`);
      failures += 1;
    }

    if (updateRecord(records, target, selected, hostSchedule, now)) {
      console.log(`Updated ${target.label}: ${selected.label} -> ${selected.url}`);
      changed = true;
    } else {
      console.log(`${target.label} unchanged: ${selected.label} -> ${selected.url}`);
    }
  }

  if (changed) {
    await writeFile(TEMP_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    await rename(TEMP_PATH, DATA_PATH);
  }
  if (failures) process.exitCode = 1;
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`BARK list refresh failed; keeping the previous data: ${error.message}`);
    process.exitCode = 1;
  });
}
