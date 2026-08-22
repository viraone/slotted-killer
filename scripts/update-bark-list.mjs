import { readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const BARK_INDEX_URL = 'https://www.barkentertainment.com/open-mic';
export const TARGET_ID = 'tacoma-comedy-6th-3829-6th-ave-tacoma-wa-98406';
const DATA_PATH = new URL('../data/open-mics.json', import.meta.url);
const TEMP_PATH = new URL('../data/open-mics.json.tmp', import.meta.url);
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

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

export function findBarkListCandidates(html) {
  const candidates = [];
  const anchorPattern = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const attributes = `${match[1]} ${match[4]}`;
    const ariaMatch = /aria-label\s*=\s*(["'])(.*?)\1/i.exec(attributes);
    const label = cleanLabel(ariaMatch ? ariaMatch[2] : match[5]);
    if (!/6th\s*&\s*proctor/i.test(label) || !/\blist\b/i.test(label)) continue;
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

export function updateRecord(records, selected) {
  const record = records.find((item) => item.id === TARGET_ID);
  if (!record) throw new Error(`Open mic record not found: ${TARGET_ID}`);
  if (record.listUrl === selected.url) return false;
  record.listLabel = selected.label;
  record.listUrl = selected.url;
  record.listSourceUrl = BARK_INDEX_URL;
  return true;
}

export async function run() {
  const response = await fetch(BARK_INDEX_URL, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`BARK returned HTTP ${response.status}`);
  const html = await response.text();
  const selected = chooseBarkList(findBarkListCandidates(html));
  if (!selected) throw new Error('No link matching “6th & Proctor” and “List” was found');

  const records = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  if (!Array.isArray(records)) throw new Error('data/open-mics.json must contain an array');
  if (!updateRecord(records, selected)) {
    console.log(`BARK list unchanged: ${selected.label} -> ${selected.url}`);
    return false;
  }

  await writeFile(TEMP_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  await rename(TEMP_PATH, DATA_PATH);
  console.log(`Updated BARK list: ${selected.label} -> ${selected.url}`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`BARK list refresh failed; keeping the previous URL: ${error.message}`);
    process.exitCode = 1;
  });
}
