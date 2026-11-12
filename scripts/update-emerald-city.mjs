import { readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CALENDAR_URL = 'https://www.emeraldcitycomedy.com/calendar';
export const RECORD_ID = 'emerald-city-comedy-club-210-broadway-e-seattle-wa-98102';
const DATA_PATH = new URL('../data/open-mics.json', import.meta.url);
const TEMP_PATH = new URL('../data/open-mics.json.emerald.tmp', import.meta.url);
const TIME_ZONE = 'America/Los_Angeles';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const OPEN_MIC_PATTERN = /open mic/i;

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

export function seattleDateKey(value) {
  return dateKeyFormatter.format(new Date(value));
}

function utcNoon(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function weekdayOf(dateKey) {
  return utcNoon(dateKey).getUTCDay();
}

function addDays(dateKey, days) {
  const date = utcNoon(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(dateKey) {
  const [year, month] = dateKey.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}

export function buildEmeraldSchedule(events, todayDateKey) {
  if (!Array.isArray(events)) throw new Error('Calendar events must be an array');
  if (events.length < 10) {
    throw new Error(`Calendar feed has only ${events.length} events; refusing to update the schedule`);
  }

  const openMicEvents = events.filter(
    (event) => typeof event?.startDate === 'string' && OPEN_MIC_PATTERN.test(event.name || '')
  );
  if (!openMicEvents.length) {
    throw new Error('No open mic events found in the calendar feed; refusing to update the schedule');
  }

  // Intl formats every startDate as its Seattle calendar day, never the UTC day.
  const listedDates = [...new Set(openMicEvents.map((event) => seattleDateKey(event.startDate)))]
    .filter((dateKey) => dateKey > todayDateKey)
    .sort();

  const confirmedThrough = listedDates.length ? lastDayOfMonth(listedDates[listedDates.length - 1]) : null;

  const skipDates = [];
  if (confirmedThrough) {
    const listed = new Set(listedDates);
    // Start strictly after today: tonight's show may already have dropped out of the feed.
    for (let dateKey = addDays(todayDateKey, 1); dateKey <= confirmedThrough; dateKey = addDays(dateKey, 1)) {
      if (weekdayOf(dateKey) === 2 && !listed.has(dateKey)) skipDates.push(dateKey);
    }
  }

  const additionalDates = listedDates.filter((dateKey) => weekdayOf(dateKey) !== 2);

  return { skipDates, additionalDates, confirmedThrough, listedDates };
}

export function extractEvents(html) {
  const match = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error('No application/ld+json block found on the calendar page');
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Calendar JSON could not be parsed: ${error.message}`);
  }
  const events = data?.Events;
  if (!Array.isArray(events)) throw new Error('Calendar JSON has no Events array');
  return events;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

export async function run() {
  const todayDateKey = seattleDateKey(new Date());
  const html = await fetchText(CALENDAR_URL);
  const schedule = buildEmeraldSchedule(extractEvents(html), todayDateKey);

  const records = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  if (!Array.isArray(records)) throw new Error('data/open-mics.json must contain an array');
  const record = records.find((item) => item.id === RECORD_ID);
  if (!record) throw new Error(`Open mic record not found: ${RECORD_ID}`);

  const recurrence = record.recurrence || (record.recurrence = {});
  const previous = JSON.stringify({
    skipDates: recurrence.skipDates,
    additionalDates: recurrence.additionalDates,
    confirmedThrough: recurrence.confirmedThrough,
    checkedAt: recurrence.checkedAt
  });

  // With no upcoming open mic posted yet, keep the last known dates and horizon: every
  // date past that horizon already reads "not posted yet", while wiping it would make the
  // weekly Tuesday rule claim shows that nobody has announced.
  if (schedule.confirmedThrough) {
    recurrence.skipDates = schedule.skipDates;
    recurrence.additionalDates = schedule.additionalDates;
    recurrence.confirmedThrough = schedule.confirmedThrough;
  }
  recurrence.checkedAt = todayDateKey;

  const changed = previous !== JSON.stringify({
    skipDates: recurrence.skipDates,
    additionalDates: recurrence.additionalDates,
    confirmedThrough: recurrence.confirmedThrough,
    checkedAt: recurrence.checkedAt
  });

  if (changed) {
    await writeFile(TEMP_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    await rename(TEMP_PATH, DATA_PATH);
  }

  console.log(
    `Emerald City open mic: ${schedule.listedDates.length} listed dates, ` +
    `confirmed through ${schedule.confirmedThrough ?? 'none'}, ` +
    `${schedule.skipDates.length} skip dates${changed ? '' : ' (unchanged)'}`
  );
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`Emerald City calendar refresh failed; keeping the previous data: ${error.message}`);
    process.exitCode = 1;
  });
}
