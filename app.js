const SUPABASE_URL = 'https://ldodkbdzljfpbnzrpxpu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PgqsEOo17xzDQrVpTUPa1Q_LoZg6rhy';
const LINEUP_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const homeSection = document.getElementById('home-section');
const openMicMapSection = document.getElementById('openmicmap-section');
const openMicMapDayLabel = document.getElementById('openMicMapDayLabel');
const openMicMapDateLabel = document.getElementById('openMicMapDateLabel');
const openMicDayButtons = document.querySelectorAll('.open-mic-day-button');
const openMicTypeButtons = document.querySelectorAll('.open-mic-type-button');
const openMicLocationButton = document.getElementById('openMicLocationButton');
const openMicLocationStatus = document.getElementById('openMicLocationStatus');
const openMicMapStatus = document.getElementById('openMicMapStatus');
const openMicMapList = document.getElementById('openMicMapList');
const openMicTonightTitle = document.getElementById('openMicTonightTitle');
const openMicTonightCount = document.getElementById('openMicTonightCount');
const openMicTonightNext = document.getElementById('openMicTonightNext');
const openMicTonightLast = document.getElementById('openMicTonightLast');
const openMicTonightList = document.getElementById('openMicTonightList');
const tripIntelModal = document.getElementById('tripIntelModal');
const tripIntelClose = document.getElementById('tripIntelClose');
const tripIntelVenueName = document.getElementById('tripIntelVenueName');
const tripIntelRoute = document.getElementById('tripIntelRoute');
const tripIntelDrive = document.getElementById('tripIntelDrive');
const tripIntelParkingHunt = document.getElementById('tripIntelParkingHunt');
const tripIntelTotal = document.getElementById('tripIntelTotal');
const tripIntelTransit = document.getElementById('tripIntelTransit');
const tripIntelWeather = document.getElementById('tripIntelWeather');
const tripIntelParking = document.getElementById('tripIntelParking');
const tripIntelSignupLocation = document.getElementById('tripIntelSignupLocation');
const tripIntelAppleMaps = document.getElementById('tripIntelAppleMaps');
const tripIntelGoogleMaps = document.getElementById('tripIntelGoogleMaps');
const tripIntelGoogleMapsTransit = document.getElementById('tripIntelGoogleMapsTransit');
const tripIntelAlarm = document.getElementById('tripIntelAlarm');
const tripIntelFeedback = document.getElementById('tripIntelFeedback');
const signupDetailsModal = document.getElementById('signupDetailsModal');
const signupDetailsClose = document.getElementById('signupDetailsClose');
const signupDetailsVenueName = document.getElementById('signupDetailsVenueName');
const signupDetailsText = document.getElementById('signupDetailsText');
const lineupSection = document.getElementById('lineup-section');
const lineupRows = document.getElementById('lineupRows');
const lineupStatus = document.getElementById('lineupStatus');
const addMicSection = document.getElementById('addmic-section');
const adminSection = document.getElementById('admin-section');
const signupCard = document.getElementById('signupCard');
const signupForm = document.getElementById('signupForm');
const emailInput = document.getElementById('email');
const submitButton = document.getElementById('submitButton');
const formMessage = document.getElementById('formMessage');
const signupWindowStatus = document.getElementById('signupWindowStatus');
const signupWindowStatusText = document.getElementById('signupWindowStatusText');
const verificationSentCard = document.getElementById('verificationSentCard');
const successCard = document.getElementById('successCard');
const instagramInfoButton = document.getElementById('instagramInfoButton');
const instagramInfoTooltip = document.getElementById('instagramInfoTooltip');
const verificationSection = document.getElementById('verification-section');
const verificationLoadingCard = document.getElementById('verificationLoadingCard');
const verificationSuccessCard = document.getElementById('verificationSuccessCard');
const verificationErrorCard = document.getElementById('verificationErrorCard');
const verificationErrorMessage = document.getElementById('verificationErrorMessage');
const verificationTabRequested =
  new URLSearchParams(window.location.search).get('verify') === '1';
const signupRequested =
  new URLSearchParams(window.location.search).get('signup') === '1';
const lineupRequested =
  new URLSearchParams(window.location.search).get('lineup') === '1';
const addMicRequested =
  new URLSearchParams(window.location.search).get('addmic') === '1';
// Unlisted entry point for the review panel: stagetimepnw.com/?admin=1
// Verification takes precedence if both params somehow appear together.
const adminRequested = !verificationTabRequested
  && new URLSearchParams(window.location.search).get('admin') === '1';

let supabaseClient = null;
let verificationInProgress = false;
let verificationHandled = false;
let lineupRefreshTimer = null;
// Requests for Read The Room close Thursday 10:00 PM Seattle time (so the
// host can finalize the lineup and send notifications) and reopen once
// Friday's show wraps at 9:40 PM — the same boundary getSeattleScheduleMode
// uses to switch the nav into lineup mode.
const SIGNUP_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SIGNUP_CLOSE_MINUTES = 22 * 60; // Thu 10:00 PM
const SIGNUP_REOPEN_MINUTES = 21 * 60 + 40; // Fri 9:40 PM

let signupWindowIsOpen = true;
let signupSubmissionInFlight = false;

function enterStandaloneVerificationMode() {
  document.body.classList.add('verification-mode');
  homeSection.hidden = true;
  openMicMapSection.hidden = true;
  lineupSection.hidden = true;
  addMicSection.hidden = true;
  adminSection.hidden = true;
  verificationSection.hidden = false;
  document.body.classList.remove('addmic-mode');
  document.body.classList.remove('admin-mode');
  stopLineupRefreshTimer();
}

if (verificationTabRequested) {
  enterStandaloneVerificationMode();
}

function stopLineupRefreshTimer() {
  if (lineupRefreshTimer === null) return;
  window.clearInterval(lineupRefreshTimer);
  lineupRefreshTimer = null;
}

function startLineupRefreshTimer() {
  if (lineupRefreshTimer !== null || verificationTabRequested || lineupSection.hidden) return;
  lineupRefreshTimer = window.setInterval(() => {
    if (verificationTabRequested || lineupSection.hidden) {
      stopLineupRefreshTimer();
      return;
    }
    window.location.reload();
  }, LINEUP_REFRESH_INTERVAL_MS);
}

function showHomeView() {
  if (verificationTabRequested) return;
  stopLineupRefreshTimer();
  homeSection.hidden = false;
  openMicMapSection.hidden = true;
  lineupSection.hidden = true;
  addMicSection.hidden = true;
  adminSection.hidden = true;
  verificationSection.hidden = true;
  document.body.classList.remove('lineup-mode');
  document.body.classList.remove('openmicmap-mode');
  document.body.classList.remove('addmic-mode');
  document.body.classList.remove('admin-mode');
}

function showOpenMicMapView() {
  if (verificationTabRequested) return;
  stopLineupRefreshTimer();
  homeSection.hidden = true;
  openMicMapSection.hidden = false;
  lineupSection.hidden = true;
  addMicSection.hidden = true;
  adminSection.hidden = true;
  verificationSection.hidden = true;
  document.body.classList.remove('lineup-mode');
  document.body.classList.remove('addmic-mode');
  document.body.classList.remove('admin-mode');
  document.body.classList.add('openmicmap-mode');
}

function showAddMicView() {
  if (verificationTabRequested) return;
  stopLineupRefreshTimer();
  homeSection.hidden = true;
  openMicMapSection.hidden = true;
  lineupSection.hidden = true;
  addMicSection.hidden = false;
  adminSection.hidden = true;
  verificationSection.hidden = true;
  document.body.classList.remove('lineup-mode');
  document.body.classList.remove('openmicmap-mode');
  document.body.classList.remove('admin-mode');
  document.body.classList.add('addmic-mode');
  scheduleAddMicPreview();
}

function showAdminView() {
  if (verificationTabRequested) return;
  stopLineupRefreshTimer();
  homeSection.hidden = true;
  openMicMapSection.hidden = true;
  lineupSection.hidden = true;
  addMicSection.hidden = true;
  adminSection.hidden = false;
  verificationSection.hidden = true;
  document.body.classList.remove('lineup-mode');
  document.body.classList.remove('openmicmap-mode');
  document.body.classList.remove('addmic-mode');
  document.body.classList.add('admin-mode');
}

function showLineupView() {
  if (verificationTabRequested) return;
  homeSection.hidden = true;
  openMicMapSection.hidden = true;
  lineupSection.hidden = false;
  addMicSection.hidden = true;
  adminSection.hidden = true;
  verificationSection.hidden = true;
  document.body.classList.add('lineup-mode');
  document.body.classList.remove('openmicmap-mode');
  document.body.classList.remove('addmic-mode');
  document.body.classList.remove('admin-mode');
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-button').forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('text-red-400', isActive);
    btn.classList.toggle('text-zinc-400', !isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });
}

// During the Friday lineup window (6:00 AM - 9:40 PM Seattle time) the
// second nav tab becomes "Tonight's Line Up" and opens the lineup instead
// of the signup form. Outside the window it reverts to "Open Mic Sign-Up".
function isLineupWindowActive() {
  return !signupRequested && getSeattleScheduleMode() === 'lineup';
}

function updateSignupNavLabel() {
  const label = document.getElementById('signupNavLabel');
  if (label) label.textContent = isLineupWindowActive() ? "Tonight's Line Up" : 'Open Mic Sign-Up';
}
updateSignupNavLabel();
window.setInterval(updateSignupNavLabel, 60 * 1000);

updateSignupWindowStatus();
window.setInterval(updateSignupWindowStatus, 30 * 1000);

document.querySelectorAll('.nav-button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    setActiveNav(view);
    updateSignupNavLabel();
    if (view === 'openmicmap') {
      showOpenMicMapView();
      renderOpenMicMapView();
    } else if (view === 'addmic') {
      showAddMicView();
    } else if (view === 'admin') {
      showAdminView();
      loadAdminData();
    } else if (isLineupWindowActive()) {
      loadLineup();
      startLineupRefreshTimer();
    } else {
      showHomeView();
    }
  });
});

openMicLocationButton.addEventListener('click', () => {
  const buttonText = document.getElementById('openMicLocationButtonText');

  // Toggle OFF if already active
  if (userOpenMicLocation) {
    userOpenMicLocation = null;
    openMicReachabilityRequests.clear();
    buttonText.textContent = 'Show Distance';
    openMicLocationStatus.textContent = 'Turn on location to see distance and drive times.';
    renderOpenMicMapView();
    return;
  }

  // Otherwise, toggle ON
  if (!navigator.geolocation) {
    openMicLocationStatus.textContent = 'Geolocation is not supported by your browser.';
    return;
  }

  buttonText.textContent = 'Locating…';
  openMicLocationStatus.textContent = 'Requesting location permissions…';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userOpenMicLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      buttonText.textContent = 'Disable Distance';
      openMicLocationStatus.textContent = 'Showing distances from your current location.';
      renderOpenMicMapView();
    },
    (error) => {
      console.error('Geolocation error:', error);
      userOpenMicLocation = null;
      buttonText.textContent = 'Show Distance';
      openMicLocationStatus.textContent = 'Location access denied or unavailable.';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// --- Open Mic Map ---
const OPEN_MIC_JSON_URL = 'data/open-mics.json';
// Mics approved in the admin panel, merged in on top of the JSON file above.
const PUBLISHED_OPEN_MICS_URL =
  `${SUPABASE_URL}/rest/v1/published_open_mics?select=record&is_active=eq.true`;
const OPEN_MIC_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const OPEN_MIC_CALENDAR_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EARTH_RADIUS_MILES = 3958.8;
const ESTIMATED_ROAD_DISTANCE_MULTIPLIER = 1.25;
const ESTIMATED_METRO_SPEED_MPH = 25;
const ESTIMATED_TRANSIT_SPEED_MPH = 12;
const OPEN_MIC_ARRIVAL_BUFFER_MINUTES = 15;
const OPEN_MIC_COORDINATE_OVERRIDES = {
  'spice-of-life-variety-open-mic-darren-s-speakeasy-renton-wa': {
    latitude: 47.4797,
    longitude: -122.2031
  }
};
let selectedOpenMicDayName = null;
let selectedOpenMicType = 'all';
let userOpenMicLocation = null;
const openMicReachabilityRequests = new Set();

openMicDayButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const dayName = button.dataset.openMicDay;
    if (!OPEN_MIC_CALENDAR_DAYS.includes(dayName)) return;

    selectedOpenMicDayName = dayName;
    renderOpenMicMapView();
  });
});

openMicTypeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedOpenMicType = button.dataset.openMicType;
    renderOpenMicMapView();
  });
});

const isLocalOpenMicDevelopment = ['localhost', '127.0.0.1', '::1']
  .includes(window.location.hostname);

function isOpenMicDayActive(value) {
  return /^y/i.test(String(value || '').trim());
}

function parseTimeStringToMinutes(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const ampmMatch = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?/i.exec(value);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]) % 12;
    const minute = ampmMatch[2] ? Number(ampmMatch[2]) : 0;
    if (/p/i.test(ampmMatch[3])) hour += 12;
    return hour * 60 + minute;
  }
  const militaryMatch = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (militaryMatch) {
    const hour = Number(militaryMatch[1]);
    const minute = Number(militaryMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
  }
  return null;
}

function parseSignupStartTimes(rawTime) {
  const text = String(rawTime || '').trim();
  if (!text) return { signupMinutes: null, startMinutes: null };
  const slashIndex = text.indexOf('/');
  const signupPart = slashIndex === -1 ? '' : text.slice(0, slashIndex);
  const startPart = slashIndex === -1 ? text : text.slice(slashIndex + 1);
  const signupMinutes = parseTimeStringToMinutes(signupPart);
  const startMinutes = parseTimeStringToMinutes(startPart) ?? signupMinutes;
  return { signupMinutes, startMinutes };
}

function normalizeOpenMicRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const name = String(record.name || '').trim();
  if (!name) return null;

  const rawTime = String(record.timeSignupStart || '').trim();
  const { signupMinutes, startMinutes } = parseSignupStartTimes(rawTime);

  const days = {};
  OPEN_MIC_DAY_NAMES.forEach((day) => {
    days[day] = isOpenMicDayActive(record[day.toLowerCase()]);
  });

  const website = String(record.webSignup || '').trim();
  const contact = String(record.contact || '').trim();
  const listLabel = String(record.listLabel || '').trim();
  const listUrl = String(record.listUrl || '').trim();
  const coordinateOverride = OPEN_MIC_COORDINATE_OVERRIDES[String(record.id || '').trim()];
  const latitude = Number(record.latitude ?? coordinateOverride?.latitude);
  const longitude = Number(record.longitude ?? coordinateOverride?.longitude);

  return {
    id: String(record.id || '').trim(),
    name,
    venue: String(record.venue || '').trim(),
    address: String(record.location || '').trim(),
    rawTime,
    signupMinutes,
    startMinutes,
    days,
    recurrence: record.recurrence && typeof record.recurrence === 'object' && !Array.isArray(record.recurrence)
      ? record.recurrence
      : null,
    anchorDate: String(record.anchorDate || record.recurrence?.anchorDate || record.recurrence?.startDate || '').trim(),
    recurrenceText: String(record.recurrenceText || '').trim(),
    signupType: String(record.signupType || '').trim().toLowerCase(),
    signupDetails: String(record.signupDetails || record.signupInstructions || '').trim(),
    showWhenInactive: record.showWhenInactive === true,
    price: String(record.priceForTime || '').trim(),
    micType: String(record.openMicType || '').trim(),
    ageRequirement: String(record.ageRequirement || '').trim(),
    notes: String(record.requirementsInfo || '').trim(),
    signupLocationNote: String(record.signupLocationNote || '').trim(),
    parkingHuntMinutes: Number.isFinite(Number(record.parkingHuntMins))
      ? Math.max(0, Math.round(Number(record.parkingHuntMins)))
      : null,
    host: String(record.host || '').trim(),
    hostSchedule: normalizeHostSchedule(record.hostSchedule),
    wheelchairAccessible: record.wheelchairAccessible === true,
    website: /^https?:\/\//i.test(website) ? website : '',
    contact: /^https?:\/\//i.test(contact) ? contact : '',
    listLabel,
    listUrl: /^https?:\/\//i.test(listUrl) ? listUrl : '',
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null
  };
}



// Per-date hosts (e.g. the MC scraped from the BARK monthly list), keyed YYYY-MM-DD.
function normalizeHostSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([date, host]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && String(host || '').trim())
      .map(([date, host]) => [date, String(host).trim()])
  );
}

function formatSeattleIsoDate(date) {
  const seattle = getSeattleNow(date);
  return `${seattle.year}-${String(seattle.month).padStart(2, '0')}-${String(seattle.dayOfMonth).padStart(2, '0')}`;
}

function getOpenMicHost(mic, date) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const scheduled = mic.hostSchedule?.[formatSeattleIsoDate(date)];
    if (scheduled) return scheduled;
  }
  return mic.host;
}

// Mics approved in the admin panel live in Supabase rather than the JSON file, so
// they show up without a redeploy. On an id collision the file wins: once a record
// has been folded into data/open-mics.json that git-reviewed copy is the one to
// trust, and the panel flags the leftover published row so it can be hidden.
function mergeOpenMicRecords(fileRecords, publishedRecords) {
  const byId = new Map();
  const add = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const id = String(record.id || '').trim().toLowerCase();
    // Records without an id can't collide, so keep every one of them.
    const key = id || `untitled:${byId.size}`;
    if (byId.has(key)) return;
    byId.set(key, record);
  };
  (Array.isArray(fileRecords) ? fileRecords : []).forEach(add);
  (Array.isArray(publishedRecords) ? publishedRecords : []).forEach(add);
  return [...byId.values()];
}

// A Supabase hiccup must never blank the list: the JSON file alone is a fine page.
async function fetchPublishedOpenMicRecords() {
  try {
    const response = await fetch(PUBLISHED_OPEN_MICS_URL, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows.map((row) => row?.record).filter(Boolean) : [];
  } catch (err) {
    console.error('Unable to load published open mics:', err);
    return [];
  }
}

let openMicDataPromise = null;
function loadOpenMicData() {
  if (!openMicDataPromise) {
    openMicDataPromise = (async () => {
      const [fileRecords, publishedRecords] = await Promise.all([
        (async () => {
          const response = await fetch(OPEN_MIC_JSON_URL);
          if (!response.ok) throw new Error(`Failed to fetch open mic JSON: HTTP ${response.status}`);
          const records = await response.json();
          if (!Array.isArray(records)) throw new Error('Open mic JSON must contain an array of records');
          return records;
        })(),
        fetchPublishedOpenMicRecords()
      ]);
      return mergeOpenMicRecords(fileRecords, publishedRecords)
        .map(normalizeOpenMicRecord)
        .filter(Boolean);
    })().catch((err) => {
      openMicDataPromise = null;
      throw err;
    });
  }
  return openMicDataPromise;
}

// Called after the admin panel publishes or hides a mic, so the next render refetches.
function invalidateOpenMicData() {
  openMicDataPromise = null;
}

function getSeattleNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    dayName: values.weekday,
    year: Number(values.year),
    month: Number(values.month),
    dayOfMonth: Number(values.day),
    minutesSinceMidnight: Number(values.hour) * 60 + Number(values.minute)
  };
}

function getWeekdayOccurrenceInMonth(dayOfMonth) {
  return Math.floor((Number(dayOfMonth) - 1) / 7) + 1;
}

function getNextSeattleWeekdayDate(dayName, date = new Date()) {
  const seattleNow = getSeattleNow(date);
  const currentDayIndex = OPEN_MIC_CALENDAR_DAYS.indexOf(seattleNow.dayName);
  const selectedDayIndex = OPEN_MIC_CALENDAR_DAYS.indexOf(dayName);
  const daysAhead = (selectedDayIndex - currentDayIndex + 7) % 7;
  return {
    date: new Date(Date.UTC(seattleNow.year, seattleNow.month - 1, seattleNow.dayOfMonth + daysAhead, 20)),
    isToday: daysAhead === 0
  };
}

function formatSeattleCalendarDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function updateOpenMicDaySelector(dayName) {
  openMicDayButtons.forEach((button) => {
    const isSelected = button.dataset.openMicDay === dayName;
    button.setAttribute('aria-pressed', String(isSelected));
    button.classList.toggle('border-[#00C805]', isSelected);
    button.classList.toggle('bg-[#00C805]', isSelected);
    button.classList.toggle('text-black', isSelected);
    button.classList.toggle('font-black', isSelected);
    button.classList.toggle('border-zinc-700', !isSelected);
    button.classList.toggle('bg-transparent', !isSelected);
    button.classList.toggle('text-zinc-400', !isSelected);
  });
}

function updateOpenMicTypeFilter(selectedType) {
  openMicTypeButtons.forEach((button) => {
    const isSelected = button.dataset.openMicType === selectedType;
    button.setAttribute('aria-pressed', String(isSelected));
    button.classList.toggle('border-[#00C805]', isSelected);
    button.classList.toggle('bg-[#00C805]', isSelected);
    button.classList.toggle('text-black', isSelected);
    button.classList.toggle('font-black', isSelected);
    button.classList.toggle('border-zinc-700', !isSelected);
    button.classList.toggle('bg-transparent', !isSelected);
    button.classList.toggle('text-zinc-400', !isSelected);
    button.classList.toggle('font-bold', !isSelected);
  });
}

// Buckets the free-text openMicType field into the filter categories. There is
// no clean "music-only" category in the data — every music mention is paired
// with comedy or filed under variety — so comedy-only mics are their own
// bucket and everything else with a type falls under Music & Variety.
function classifyOpenMicCategory(micType) {
  const text = String(micType || '').toLowerCase();
  if (!text) return null;
  const mentionsOtherTalent = /music|variety|mix|anything|talent|voice/.test(text);
  return mentionsOtherTalent ? 'variety' : 'comedy';
}

function filterOpenMicsByType(mics, selectedType) {
  if (selectedType === 'all') return mics;
  return mics.filter((mic) => classifyOpenMicCategory(mic.micType) === selectedType);
}

function openMicOccursOnSeattleDate(mic, seattleNow) {
  const recurrence = mic.recurrence;
  if (!recurrence) return Boolean(mic.days[seattleNow.dayName]);

  const recurrenceWeekdayMatches = String(recurrence.weekday || '').toLowerCase()
    === seattleNow.dayName.toLowerCase();

  // Weekly mics can run on more than one day. Honor every enabled day flag,
  // while retaining recurrence.weekday as a fallback for older records.
  if (recurrence.type === 'weekly') {
    return Boolean(mic.days[seattleNow.dayName]) || recurrenceWeekdayMatches;
  }

  if (!recurrenceWeekdayMatches) return false;

  const occurrence = getWeekdayOccurrenceInMonth(seattleNow.dayOfMonth);
  const daysInMonth = new Date(Date.UTC(seattleNow.year, seattleNow.month, 0)).getUTCDate();
  const isLastWeekdayOfMonth = seattleNow.dayOfMonth + 7 > daysInMonth;

  switch (recurrence.type) {
    case 'monthly-nth-weekday':
      return Number(recurrence.nth) === -1
        ? isLastWeekdayOfMonth
        : occurrence === Number(recurrence.nth);
    case 'monthly-multiple-nth-weekdays':
      return Array.isArray(recurrence.nth)
        && recurrence.nth.some((nth) => (
          Number(nth) === -1 ? isLastWeekdayOfMonth : occurrence === Number(nth)
        ));
    case 'monthly-last-weekday':
      return isLastWeekdayOfMonth;
    case 'monthly-first-and-last-weekday':
      return occurrence === 1 || isLastWeekdayOfMonth;
    case 'biweekly':
    case 'bi-weekly':
    case 'every-other-week': {
      const anchorStr = recurrence.anchorDate || recurrence.startDate || mic.anchorDate;
      if (!anchorStr) return false;
      const parts = anchorStr.split('-').map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return false;
      const anchorUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
      const currentUtc = Date.UTC(seattleNow.year, seattleNow.month - 1, seattleNow.dayOfMonth);
      const diffDays = Math.round((currentUtc - anchorUtc) / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.round(diffDays / 7);
      return (diffWeeks % 2 === 0);
    }
    default:
      return false;
  }
}

function getNextOpenMicOccurrenceDate(mic, afterDate) {
  const start = getSeattleNow(afterDate);
  for (let daysAhead = 1; daysAhead <= 370; daysAhead += 1) {
    const candidate = new Date(Date.UTC(
      start.year,
      start.month - 1,
      start.dayOfMonth + daysAhead,
      20
    ));
    if (openMicOccursOnSeattleDate(mic, getSeattleNow(candidate))) return candidate;
  }
  return null;
}

function formatUpcomingOpenMicDate(date) {
  const { year, month, dayOfMonth } = getSeattleNow(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${dayOfMonth} ${year}`;
}

function selectOpenMicsForSeattleDate(allMics, date, compareCurrentTime) {
  const seattleNow = getSeattleNow(date);
  const { dayName, minutesSinceMidnight } = seattleNow;
  let todays = allMics.filter((mic) => openMicOccursOnSeattleDate(mic, seattleNow)).slice();

  // Sort strictly chronologically by start time (earliest to latest in the day)
  todays.sort((a, b) => {
    const timeA = a.startMinutes ?? a.signupMinutes ?? 9999;
    const timeB = b.startMinutes ?? b.signupMinutes ?? 9999;
    if (timeA !== timeB) return timeA - timeB;

    // If start times are identical, sort by closest distance if available
    if (userOpenMicLocation) {
      const distA = getOpenMicTravelEstimate(a)?.distanceMiles ?? Infinity;
      const distB = getOpenMicTravelEstimate(b)?.distanceMiles ?? Infinity;
      if (distA !== distB) return distA - distB;
    }

    return a.name.localeCompare(b.name);
  });

  // Highlight rule: before any mic starts, highlight the earliest upcoming
  // mic. Once mics start, highlight the most recently STARTED one and hold
  // it until the next start time actually arrives (e.g. the 7:30 mic stays
  // highlighted until 8:00 sharp). Ties within a start time keep the sort
  // order above (distance, then name). Time-TBD mics count as latest.
  let nextMic = null;
  if (compareCurrentTime) {
    const effectiveMinutes = (mic) => mic.startMinutes ?? mic.signupMinutes ?? 9999;
    const started = todays.filter((mic) => effectiveMinutes(mic) <= minutesSinceMidnight);
    if (started.length > 0) {
      const currentTier = effectiveMinutes(started[started.length - 1]);
      nextMic = started.find((mic) => effectiveMinutes(mic) === currentTier);
    } else {
      nextMic = todays[0] || null;
    }
  } else {
    nextMic = todays.length > 0 ? todays[0] : null;
  }

  // The last mic of the day is always the latest in time
  const lastMic = todays.length > 1 ? todays[todays.length - 1] : (todays.length === 1 ? todays[0] : null);

  return { dayName, todays, nextMic, lastMic };
}

function formatMinutesToClock(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const normalizedMinutes = ((Number(minutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function degreesToRadians(degrees) {
  return Number(degrees) * Math.PI / 180;
}

function calculateHaversineMiles(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
  const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = degreesToRadians(fromLatitude);
  const toLatitudeRadians = degreesToRadians(toLatitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitudeRadians) * Math.cos(toLatitudeRadians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateOpenMicDriveMinutes(straightLineMiles) {
  const estimatedRoadMiles = Number(straightLineMiles) * ESTIMATED_ROAD_DISTANCE_MULTIPLIER;
  return Math.max(0, Math.round((estimatedRoadMiles / ESTIMATED_METRO_SPEED_MPH) * 60));
}

function estimateOpenMicTransitMinutes(straightLineMiles) {
  return Math.max(10, Math.round((Number(straightLineMiles) * 1.3 / 12) * 60 + 8));
}

function getOpenMicTravelEstimate(mic, userLocation = userOpenMicLocation) {
  if (!userLocation || mic.latitude === null || mic.longitude === null) return null;
  const distanceMiles = calculateHaversineMiles(
    userLocation.latitude,
    userLocation.longitude,
    mic.latitude,
    mic.longitude
  );
  return {
    distanceMiles,
    driveMinutes: estimateOpenMicDriveMinutes(distanceMiles),
    transitMinutes: estimateOpenMicTransitMinutes(distanceMiles)
  };
}

function getOpenMicReachability(mic, travelEstimate, currentSeattleMinutes) {
  if (!travelEstimate) return null;
  const deadlineMinutes = mic.signupMinutes ?? mic.startMinutes;
  if (deadlineMinutes === null) return null;
  const leaveByMinutes = deadlineMinutes
    - travelEstimate.driveMinutes
    - OPEN_MIC_ARRIVAL_BUFFER_MINUTES;
  const canMakeIt = currentSeattleMinutes <= leaveByMinutes;
  return {
    canMakeIt,
    leaveByMinutes,
    status: canMakeIt
      ? 'YOU CAN MAKE IT'
      : mic.signupMinutes !== null
        ? 'TOO LATE TO MAKE SIGNUP'
        : 'TOO LATE TO MAKE IT'
  };
}

function buildOpenMicTimeLabel(mic) {
  if (mic.name === 'Spice of Life Variety Open Mic') {
    return '6:00 PM - Midnight';
  }
  const startLabel = formatMinutesToClock(mic.startMinutes);
  if (startLabel) return `Start ${startLabel}`;
  return 'Time not listed';
}

function buildOpenMicListButtonLabel(listLabel) {
  const month = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ].find((name) => new RegExp(`\\b${name}\\b`, 'i').test(String(listLabel || '')));
  return month ? `See ${month} List` : 'See List';
}

const TRIP_INTEL_DEFAULT_PARKING_HUNT_MINUTES = 8;
const TRIP_INTEL_SIGNUP_FALLBACK = 'Check with host or bar staff upon arrival.';
const TRIP_INTEL_PARKING_FALLBACK = 'Street and nearby neighborhood parking available.';
const tripIntelWeatherCache = new Map();
let activeTripIntel = null;
let tripIntelRequestToken = 0;
let tripIntelReturnFocus = null;

function getWeatherCondition(code) {
  const numericCode = Number(code);
  if (numericCode === 0) return { emoji: '☀️', label: 'Clear' };
  if (numericCode === 1) return { emoji: '🌤️', label: 'Mostly clear' };
  if ([2, 3].includes(numericCode)) return { emoji: '⛅', label: 'Partly cloudy' };
  if ([45, 48].includes(numericCode)) return { emoji: '🌫️', label: 'Fog' };
  if ([51, 53, 55, 56, 57].includes(numericCode)) return { emoji: '🌦️', label: 'Drizzle' };
  if ([61, 63, 65, 66, 67].includes(numericCode)) return { emoji: '🌧️', label: 'Rain' };
  if ([71, 73, 75, 77].includes(numericCode)) return { emoji: '🌨️', label: 'Snow' };
  if ([80, 81, 82].includes(numericCode)) return { emoji: '🌦️', label: 'Rain showers' };
  if ([85, 86].includes(numericCode)) return { emoji: '🌨️', label: 'Snow showers' };
  if ([95, 96, 99].includes(numericCode)) return { emoji: '⛈️', label: 'Thunderstorms' };
  return { emoji: '🌡️', label: 'Conditions unavailable' };
}

const OBA_API_KEY = 'ceb473d5-b12a-4833-82da-c4c721a62f17'; // Tip: Request your own free key from OneBusAway / Puget Sound Developer Portal for higher limits
const OBA_BASE_URL = 'https://api.pugetsound.onebusaway.org/api/where';
const transitArrivalsCache = new Map();

// JSONP request helper with proper cleanup and error handling
function fetchOneBusAwayJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'oba_cb_' + Math.random().toString(36).substring(2, 10);
    const script = document.createElement('script');
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error('OneBusAway request timed out'));
    }, 6000);

    function cleanup() {
      if (script.parentNode) script.remove();
      delete window[callbackName];
      clearTimeout(timeout);
    }

    window[callbackName] = (data) => {
      if (timedOut) return;
      cleanup();
      resolve(data);
    };

    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callbackName}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('OneBusAway API rate-limited or unavailable'));
    };
    document.head.appendChild(script);
  });
}

async function fetchOneBusAwayTransit(originLat, originLon, destLat, destLon) {
  const cacheKey = `${originLat.toFixed(3)},${originLon.toFixed(3)}`;
  const nowMs = Date.now();

  // Return cached results if fetched within the last 60 seconds
  if (transitArrivalsCache.has(cacheKey)) {
    const cached = transitArrivalsCache.get(cacheKey);
    if (nowMs - cached.timestamp < 60000) {
      return cached.data;
    }
  }

  try {
    // Step 1: Find stops within 800m
    const stopsUrl = `${OBA_BASE_URL}/stops-for-location.json?key=${OBA_API_KEY}&lat=${originLat}&lon=${originLon}&radius=800`;
    const stopsData = await fetchOneBusAwayJsonp(stopsUrl);
    const stops = stopsData?.data?.list || [];

    if (!stops.length) {
      return { error: 'No Puget Sound transit stops within a 10-minute walk.' };
    }

    // Sort stops by distance to user
    stops.sort((a, b) => {
      const distA = calculateHaversineMiles(originLat, originLon, a.lat, a.lon);
      const distB = calculateHaversineMiles(originLat, originLon, b.lat, b.lon);
      return distA - distB;
    });

    // Query only the top 1-2 nearest stops to avoid 429 rate limiting
    const primaryStops = stops.slice(0, 2);
    const upcomingRoutes = [];

    for (const stop of primaryStops) {
      try {
        const arrivalsUrl = `${OBA_BASE_URL}/arrivals-and-departures-for-stop/${encodeURIComponent(stop.id)}.json?key=${OBA_API_KEY}&minutesBefore=0&minutesAfter=75`;
        const arrData = await fetchOneBusAwayJsonp(arrivalsUrl);
        const arrivals = arrData?.data?.entry?.arrivalsAndDepartures || [];
        const stopDistMiles = calculateHaversineMiles(originLat, originLon, stop.lat, stop.lon);
        const walkMinutes = Math.max(1, Math.round((stopDistMiles / 3.0) * 60));

        arrivals.forEach((arr) => {
          const targetTime = arr.predictedArrivalTime || arr.scheduledArrivalTime || arr.predictedDepartureTime || arr.scheduledDepartureTime;
          const minutesUntil = Math.round((targetTime - nowMs) / 60000);

          if (minutesUntil >= 0 && minutesUntil <= 90) {
            upcomingRoutes.push({
              routeShortName: arr.routeShortName || arr.routeId,
              headsign: arr.tripHeadsign || stop.direction || 'Inbound',
              minutesUntil,
              walkMinutes,
              stopName: stop.name,
              isRealTime: Boolean(arr.predictedArrivalTime || arr.predictedDepartureTime)
            });
          }
        });
      } catch (e) {
        // Continue if one stop fails
      }
    }

    // Sort by soonest departure
    upcomingRoutes.sort((a, b) => a.minutesUntil - b.minutesUntil);

    // Deduplicate: Keep ONLY 1 card per distinct Route number
    const uniqueRoutes = [];
    const seenRoutes = new Set();

    for (const item of upcomingRoutes) {
      const routeKey = String(item.routeShortName || item.routeId || '').trim().toLowerCase();
      if (routeKey && !seenRoutes.has(routeKey)) {
        seenRoutes.add(routeKey);
        uniqueRoutes.push(item);
      }
    }

    const result = {
      stopsFound: stops.length,
      nearestStop: primaryStops[0]?.name,
      routes: uniqueRoutes // Returns only distinct routes (e.g. Route 9 and Route 49)
    };

    transitArrivalsCache.set(cacheKey, { timestamp: nowMs, data: result });
    return result;
  } catch (err) {
    console.warn('OneBusAway transit lookup:', err.message);
    return { error: 'Live transit feed temporarily busy. Tap "Bus Routes" below for full schedule.' };
  }
}


async function fetchTripIntelWeather(mic) {
  const params = new URLSearchParams({
    latitude: String(mic.latitude),
    longitude: String(mic.longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch'
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Weather request failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.current) throw new Error('Weather response did not include current conditions');
  return payload.current;
}

function getCachedTripIntelWeather(mic) {
  const cacheKey = `${mic.latitude},${mic.longitude}`;
  if (!tripIntelWeatherCache.has(cacheKey)) {
    const request = fetchTripIntelWeather(mic).catch((error) => {
      tripIntelWeatherCache.delete(cacheKey);
      throw error;
    });
    tripIntelWeatherCache.set(cacheKey, request);
  }
  return tripIntelWeatherCache.get(cacheKey);
}

function getTripTrafficCondition(driveMinutes) {
  const minutes = Number(driveMinutes);
  if (minutes <= 20) return { label: 'Clear', className: 'text-emerald-400' };
  if (minutes <= 35) return { label: 'Moderate', className: 'text-yellow-400' };
  return { label: 'Heavy', className: 'text-red-400' };
}

async function hydrateTripIntelPillWeather(mic, weatherElement) {
  try {
    const weather = await getCachedTripIntelWeather(mic);
    if (!weatherElement.isConnected) return;
    const condition = getWeatherCondition(weather.weather_code);
    weatherElement.textContent = `${condition.emoji} ${Math.round(weather.temperature_2m)}°F`;
    weatherElement.setAttribute('aria-label', `${condition.label}, ${Math.round(weather.temperature_2m)} degrees Fahrenheit`);
  } catch {
    if (!weatherElement.isConnected) return;
    weatherElement.textContent = '🌡️ Weather unavailable';
    weatherElement.setAttribute('aria-label', 'Live weather unavailable');
  }
}

function summarizeNearbyParking(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return {
      summary: TRIP_INTEL_PARKING_FALLBACK,
      huntMinutes: 10
    };
  }

  const feeValues = elements.map((element) => String(element.tags?.fee || '').toLowerCase());
  const hasFree = feeValues.some((fee) => ['no', 'free'].includes(fee));
  const hasPaid = feeValues.some((fee) => ['yes', 'paid'].includes(fee));
  const parkingType = hasFree
    ? 'Free parking is mapped nearby.'
    : hasPaid
      ? 'Paid parking or meters are mapped nearby.'
      : 'Parking is mapped nearby; check access signs and posted restrictions.';
  const countLabel = `${elements.length} mapped parking ${elements.length === 1 ? 'option' : 'options'} within 300 m.`;
  return {
    summary: `${countLabel} ${parkingType}`,
    huntMinutes: elements.length >= 4 ? 4 : hasFree ? 6 : 7
  };
}

async function fetchTripIntelParking(mic) {
  const query = `[out:json][timeout:8];nwr["amenity"="parking"](around:300,${mic.latitude},${mic.longitude});out tags center;`;
  const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Parking request failed: HTTP ${response.status}`);
  const payload = await response.json();
  return summarizeNearbyParking(payload.elements);
}

function updateTripIntelTotals(driveMinutes, parkingHuntMinutes) {
  const drive = Math.max(0, Math.round(Number(driveMinutes) || 0));
  const parking = Math.max(0, Math.round(Number(parkingHuntMinutes) || 0));
  tripIntelDrive.textContent = `${drive} min`;
  tripIntelParkingHunt.textContent = `+${parking} min`;
  tripIntelTotal.textContent = `${drive + parking} min`;
  if (activeTripIntel) {
    activeTripIntel.driveMinutes = drive;
    activeTripIntel.parkingHuntMinutes = parking;
    activeTripIntel.totalMinutes = drive + parking;
  }
}

function closeTripIntelModal() {
  if (tripIntelModal.hidden) return;
  tripIntelRequestToken += 1;
  tripIntelModal.classList.remove('is-open');
  tripIntelModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('trip-intel-open');
  window.setTimeout(() => {
    tripIntelModal.hidden = true;
    activeTripIntel = null;
    tripIntelReturnFocus?.focus({ preventScroll: true });
    tripIntelReturnFocus = null;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
}

let signupDetailsReturnFocus = null;

function openSignupDetailsModal(mic, trigger) {
  signupDetailsReturnFocus = trigger;
  signupDetailsVenueName.textContent = mic.venue || mic.name;
  signupDetailsText.textContent = mic.signupDetails;
  signupDetailsModal.hidden = false;
  signupDetailsModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('trip-intel-open');
  requestAnimationFrame(() => {
    signupDetailsModal.classList.add('is-open');
    signupDetailsClose.focus({ preventScroll: true });
  });
}

function closeSignupDetailsModal() {
  if (signupDetailsModal.hidden) return;
  signupDetailsModal.classList.remove('is-open');
  signupDetailsModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('trip-intel-open');
  window.setTimeout(() => {
    signupDetailsModal.hidden = true;
    signupDetailsReturnFocus?.focus({ preventScroll: true });
    signupDetailsReturnFocus = null;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
}

async function openTripIntelModal(mic, travelEstimate, trigger) {
  if (!travelEstimate || mic.latitude === null || mic.longitude === null) return;
  const requestToken = ++tripIntelRequestToken;
  const venueName = mic.venue || mic.name;
  const defaultParkingHunt = mic.parkingHuntMinutes ?? TRIP_INTEL_DEFAULT_PARKING_HUNT_MINUTES;
  activeTripIntel = {
    mic,
    driveMinutes: travelEstimate.driveMinutes,
    parkingHuntMinutes: defaultParkingHunt,
    totalMinutes: travelEstimate.driveMinutes + defaultParkingHunt
  };
  tripIntelReturnFocus = trigger;
  tripIntelVenueName.textContent = venueName;
  tripIntelRoute.textContent = `Current location ➜ ${venueName} (${travelEstimate.distanceMiles.toFixed(1)} mi)`;
  tripIntelWeather.className = 'trip-intel-loading';
  tripIntelWeather.textContent = 'Loading live conditions…';
  tripIntelParking.textContent = 'Checking nearby parking…';
  tripIntelSignupLocation.textContent = mic.signupLocationNote || TRIP_INTEL_SIGNUP_FALLBACK;
  tripIntelFeedback.textContent = '';
  tripIntelAppleMaps.href = `https://maps.apple.com/?daddr=${encodeURIComponent(mic.address)}`;
  tripIntelGoogleMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mic.address)}`;
  const originParam = userOpenMicLocation ? `&origin=${userOpenMicLocation.latitude},${userOpenMicLocation.longitude}` : '';
  tripIntelGoogleMapsTransit.href = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(mic.address)}&travelmode=transit`;
  if (tripIntelTransit) {
    tripIntelTransit.textContent = travelEstimate.transitMinutes ? `~${travelEstimate.transitMinutes} min` : '—';
  }
  updateTripIntelTotals(travelEstimate.driveMinutes, defaultParkingHunt);

  const transitContent = document.getElementById('tripIntelTransitContent');
  if (transitContent) {
    transitContent.innerHTML = '<p class="trip-intel-loading">Locating nearest bus lines &amp; live departures…</p>';
  }

  tripIntelModal.hidden = false;
  tripIntelModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('trip-intel-open');
  requestAnimationFrame(() => {
    tripIntelModal.classList.add('is-open');
    tripIntelClose.focus({ preventScroll: true });
  });

  const userLoc = userOpenMicLocation || { latitude: 47.6062, longitude: -122.3321 };

  const [weatherResult, parkingResult, transitResult] = await Promise.allSettled([
    getCachedTripIntelWeather(mic),
    fetchTripIntelParking(mic),
    fetchOneBusAwayTransit(userLoc.latitude, userLoc.longitude, mic.latitude, mic.longitude)
  ]);
  if (requestToken !== tripIntelRequestToken || tripIntelModal.hidden) return;

  if (weatherResult.status === 'fulfilled') {
    const weather = weatherResult.value;
    const condition = getWeatherCondition(weather.weather_code);
    const precipitation = Number(weather.precipitation) > 0
      ? `${Number(weather.precipitation).toFixed(2)} in precipitation`
      : 'No current precipitation';
    tripIntelWeather.className = 'trip-intel-weather-line';
    tripIntelWeather.innerHTML = `
      <span>${condition.emoji} <strong>${Math.round(weather.temperature_2m)}°F</strong> (feels ${Math.round(weather.apparent_temperature)}°)</span>
      <span>${condition.label} · ${precipitation}</span>
    `;
  } else {
    tripIntelWeather.className = 'trip-intel-loading';
    tripIntelWeather.textContent = 'Live weather is temporarily unavailable.';
  }

  if (parkingResult.status === 'fulfilled') {
    const parking = parkingResult.value;
    tripIntelParking.textContent = parking.summary;
    updateTripIntelTotals(travelEstimate.driveMinutes, mic.parkingHuntMinutes ?? parking.huntMinutes);
  } else {
    tripIntelParking.textContent = TRIP_INTEL_PARKING_FALLBACK;
    updateTripIntelTotals(travelEstimate.driveMinutes, defaultParkingHunt);
  }

  if (transitResult.status === 'fulfilled' && transitContent) {
    const transitData = transitResult.value;
    if (transitData.error || !transitData.routes?.length) {
      transitContent.innerHTML = `
        <div class="rounded-lg bg-zinc-950 p-3 border border-zinc-800 text-zinc-400">
          <p class="font-medium text-xs">${transitData.error || 'No active bus departures found right now.'}</p>
          <p class="text-[11px] text-zinc-500 mt-1">Use the "Bus Routes" button below for full schedule &amp; transfer steps.</p>
        </div>
      `;
    } else {
      const routeCards = transitData.routes.map((r) => `
        <div class="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="rounded bg-blue-600 px-2 py-0.5 text-xs font-black text-white">Route ${r.routeShortName}</span>
              <span class="truncate text-xs font-bold text-zinc-200">${r.headsign}</span>
              ${r.isRealTime ? '<span class="text-[10px] text-emerald-400 font-bold">● Live</span>' : ''}
            </div>
            <p class="mt-1 text-[11px] text-zinc-400">Board at <span class="text-zinc-200 font-medium">${r.stopName}</span> (🚶 ~${r.walkMinutes} min walk)</p>
          </div>
          <div class="text-right pl-3">
            <span class="text-sm font-black ${r.minutesUntil <= 5 ? 'text-amber-400' : 'text-blue-300'}">in ${r.minutesUntil} min</span>
          </div>
        </div>
      `).join('');

      transitContent.innerHTML = `
        <div class="space-y-2">
          ${routeCards}
        </div>
      `;
    }
  }
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsFloatingDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

function downloadTripIntelReminder() {
  if (!activeTripIntel) return;
  const { mic, totalMinutes } = activeTripIntel;
  const signupMinutes = mic.signupMinutes ?? mic.startMinutes;
  if (signupMinutes === null) {
    tripIntelFeedback.textContent = 'A sign-up or start time is needed to set this reminder.';
    return;
  }

  const selectedDate = getNextSeattleWeekdayDate(
    selectedOpenMicDayName || getSeattleNow(new Date()).dayName,
    new Date()
  ).date;
  const selectedDateParts = getSeattleNow(selectedDate);
  const signupAt = new Date(Date.UTC(
    selectedDateParts.year,
    selectedDateParts.month - 1,
    selectedDateParts.dayOfMonth,
    Math.floor(signupMinutes / 60),
    signupMinutes % 60
  ));
  const leaveAt = new Date(signupAt.getTime() - totalMinutes * 60 * 1000);
  const reminderEnds = new Date(leaveAt.getTime() + 15 * 60 * 1000);
  const venueName = mic.venue || mic.name;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rickshaw//Trip Venue Intel//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${escapeIcsText(mic.id)}@rickshaw`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;TZID=America/Los_Angeles:${formatIcsFloatingDate(leaveAt)}`,
    `DTEND;TZID=America/Los_Angeles:${formatIcsFloatingDate(reminderEnds)}`,
    `SUMMARY:${escapeIcsText(`Leave now for ${venueName}`)}`,
    `LOCATION:${escapeIcsText(mic.address)}`,
    `DESCRIPTION:${escapeIcsText(`Allow ${totalMinutes} minutes for driving and parking before ${formatMinutesToClock(signupMinutes)} sign-up.`)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Leave now for ${venueName}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `leave-for-${String(mic.id || 'open-mic').replace(/[^a-z0-9-]+/gi, '-')}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  tripIntelFeedback.textContent = `Calendar reminder created for ${formatMinutesToClock(signupMinutes - totalMinutes)}.`;
}
const tripIntelTransitCardBtn = document.getElementById('tripIntelTransitCardBtn');
if (tripIntelTransitCardBtn) {
  tripIntelTransitCardBtn.addEventListener('click', () => {
    const transitSection = document.getElementById('tripIntelTransitSection');
    if (transitSection) {
      transitSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      transitSection.classList.add('ring-2', 'ring-blue-500');
      setTimeout(() => transitSection.classList.remove('ring-2', 'ring-blue-500'), 1500);
    }
  });
}
tripIntelClose.addEventListener('click', closeTripIntelModal);
tripIntelModal.addEventListener('click', (event) => {
  if (event.target.matches('[data-trip-intel-close]')) closeTripIntelModal();
});
tripIntelAlarm.addEventListener('click', downloadTripIntelReminder);
signupDetailsClose.addEventListener('click', closeSignupDetailsModal);
signupDetailsModal.addEventListener('click', (event) => {
  if (event.target.matches('[data-signup-details-close]')) closeSignupDetailsModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !signupDetailsModal.hidden) closeSignupDetailsModal();
  if (event.key !== 'Tab' || signupDetailsModal.hidden) return;
  const focusable = [...signupDetailsModal.querySelectorAll('button:not([disabled]), a[href]')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !tripIntelModal.hidden) closeTripIntelModal();
  if (event.key !== 'Tab' || tripIntelModal.hidden) return;
  const focusable = [...tripIntelModal.querySelectorAll('button:not([disabled]), a[href]')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function renderOpenMicTonightPanel(mics, nextMic, lastMic) {
  openMicTonightCount.textContent = `${mics.length} ${mics.length === 1 ? 'open mic' : 'open mics'}`;
  openMicTonightNext.textContent = nextMic
    ? `${formatMinutesToClock(nextMic.startMinutes) || 'Time TBD'} · ${nextMic.name}`
    : '—';

  openMicTonightLast.textContent = lastMic
    ? `${formatMinutesToClock(lastMic.startMinutes) || 'Time TBD'} · ${lastMic.name}`
    : '—';

  const items = mics.map((mic) => {
    const isNext = nextMic && mic.id === nextMic.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#00C805]';

    const time = document.createElement('span');
    time.className = `w-16 shrink-0 text-xs font-black ${isNext ? 'text-[#00C805]' : 'text-zinc-500'}`;
    time.textContent = formatMinutesToClock(mic.startMinutes) || 'TBD';

    const name = document.createElement('span');
    name.className = `min-w-0 flex-1 truncate text-sm font-semibold ${isNext ? 'text-white font-bold' : 'text-zinc-300'} group-hover:text-white`;
    name.textContent = mic.name;

    const arrow = document.createElement('span');
    arrow.className = 'text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-[#00C805]';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    button.append(time, name, arrow);
    button.addEventListener('click', () => {
      const card = document.getElementById(`open-mic-card-${mic.id}`);
      if (!card) return;
      setActiveOpenMicCard(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.focus({ preventScroll: true });
    });
    return button;
  });
  openMicTonightList.replaceChildren(...items);
}

function setActiveOpenMicCard(card) {
  document.querySelectorAll('.open-mic-card--active').forEach((el) => {
    if (el !== card) el.classList.remove('open-mic-card--active');
  });
  card.classList.add('open-mic-card--active');
}

function renderOpenMicCard(mic, isNext, isToday = true, currentSeattleMinutes = null, upcomingDate = null, selectedDateObj = null) {
  const isLockedPreview = Boolean(upcomingDate);
  const card = document.createElement('article');
  card.id = `open-mic-card-${mic.id}`;
  card.tabIndex = -1;
  card.className = isLockedPreview
    ? 'open-mic-card relative rounded-xl border border-dashed border-zinc-700 bg-zinc-950/35 p-4 opacity-60 grayscale-[35%] shadow-inner shadow-black/30 transition hover:opacity-80'
    : 'open-mic-card relative cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/45 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/70';

  if (!isLockedPreview) {
    // Highlight the soonest mic by default; clicking any card moves the highlight.
    if (isNext) card.classList.add('open-mic-card--active');
    card.addEventListener('click', () => setActiveOpenMicCard(card));
  }

  const badges = document.createElement('div');
  badges.className = 'mb-2 flex min-h-5 flex-wrap items-center gap-1.5';

  if (isLockedPreview) {
    const badge = document.createElement('span');
    badge.className = 'inline-block rounded-lg border border-zinc-500 bg-zinc-900 px-3.5 py-2 text-sm font-black uppercase tracking-wider text-zinc-100 shadow-sm';
    badge.textContent = `Next Open Mic ${formatUpcomingOpenMicDate(upcomingDate)}`;
    badges.append(badge);

  } else if (isNext) {
    const badge = document.createElement('span');
    badge.className = 'inline-block rounded bg-[#00C805] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black';
    badge.textContent = 'Next Open Mic';
    badges.append(badge);

    if (isToday) {
      const todayBadge = document.createElement('span');
      todayBadge.className = 'inline-block rounded border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300';
      todayBadge.textContent = 'Happening Today';
      badges.append(todayBadge);
    }
  }
  card.append(badges);

  const isNonWeeklyRecurring = Boolean(mic.recurrence && mic.recurrence.type !== 'weekly');
  if (!isLockedPreview && isNonWeeklyRecurring && selectedDateObj) {
    const confirmBadge = document.createElement('span');
    confirmBadge.className = 'inline-block rounded border border-[#00C805]/50 bg-[#00C805]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#00C805]';
    confirmBadge.textContent = `✓ Happening ${formatUpcomingOpenMicDate(selectedDateObj)}`;
    badges.append(confirmBadge);
  }

  const headingRow = document.createElement('div');
  headingRow.className = 'flex items-start justify-between gap-4';

  const name = document.createElement('h3');
  name.className = 'min-w-0 text-base font-black leading-tight text-zinc-50 sm:text-lg';
  name.textContent = mic.name;

  const startTime = document.createElement('p');
  startTime.className = `shrink-0 text-sm font-black ${isNext && !isLockedPreview ? 'text-[#00C805]' : 'text-zinc-200'}`;
  startTime.textContent = formatMinutesToClock(mic.startMinutes) || 'Time TBD';
  headingRow.append(name, startTime);
  card.append(headingRow);

  const venueIsRedundant = mic.venue
    && mic.name.toLowerCase().includes(mic.venue.toLowerCase());
  if (mic.venue && !venueIsRedundant) {
    const venue = document.createElement('p');
    venue.className = 'mt-1 text-sm font-semibold text-zinc-300';
    venue.textContent = mic.venue;
    card.append(venue);
  }

  if (mic.recurrenceText) {
    const recurrence = document.createElement('p');
    recurrence.className = 'mt-1 text-[10px] font-bold uppercase tracking-wide text-[#00C805]';
    recurrence.textContent = mic.recurrenceText;
    card.append(recurrence);
  }

  const timeLine = document.createElement('p');
  timeLine.className = 'mt-1 text-sm font-semibold leading-5 text-zinc-400 sm:text-base';
  timeLine.textContent = buildOpenMicTimeLabel(mic);
  card.append(timeLine);

  const travelEstimate = getOpenMicTravelEstimate(mic);
  if (travelEstimate) {
    if (
      isToday
      && currentSeattleMinutes !== null
      && openMicReachabilityRequests.has(mic.id)
    ) {
      const reachability = getOpenMicReachability(mic, travelEstimate, currentSeattleMinutes);
      if (reachability) {
        const reachabilityBadge = document.createElement('div');
        reachabilityBadge.className = `mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border ${reachability.canMakeIt
          ? 'border-[#00C805]/30 bg-zinc-950/90 shadow-[0_0_15px_rgba(0,200,5,0.15)]'
          : 'border-rose-500/30 bg-zinc-950/90 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
          } px-3.5 py-2`;

        const statusWrap = document.createElement('div');
        statusWrap.className = 'flex items-center gap-2';

        const statusDot = document.createElement('span');
        statusDot.className = `inline-block h-2 w-2 rounded-full ${reachability.canMakeIt
          ? 'bg-[#00C805] shadow-[0_0_8px_#00C805]'
          : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
          }`;

        const statusText = document.createElement('span');
        statusText.className = `text-xs font-black tracking-wider uppercase ${reachability.canMakeIt ? 'text-emerald-400' : 'text-rose-400'
          }`;
        statusText.textContent = reachability.status;

        statusWrap.append(statusDot, statusText);

        const leaveByWrap = document.createElement('div');
        leaveByWrap.className = 'flex items-center gap-1.5 text-xs text-zinc-300';
        leaveByWrap.innerHTML = `
          <svg class="h-3.5 w-3.5 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="text-zinc-400 font-medium">Leave by</span>
          <span class="font-bold text-white">${formatMinutesToClock(reachability.leaveByMinutes)}</span>
        `;

        reachabilityBadge.append(statusWrap, leaveByWrap);
        card.append(reachabilityBadge);
      }
    }

    const travelBadge = document.createElement('button');
    travelBadge.type = 'button';
    travelBadge.className = 'trip-intel-trigger mt-2.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-full border border-emerald-800/70 bg-zinc-950 px-3 py-2 text-xs shadow-[0_0_10px_rgba(34,197,94,0.1)] sm:flex-nowrap';
    travelBadge.setAttribute('aria-label', `Open trip and venue information for ${mic.venue || mic.name}`);
    const traffic = getTripTrafficCondition(travelEstimate.driveMinutes);
    travelBadge.innerHTML = `
      <span class="trip-intel-live-dot" aria-hidden="true"></span>
      <span class="font-bold text-white">${travelEstimate.distanceMiles.toFixed(1)} mi</span>
      <span class="trip-intel-pill-separator" aria-hidden="true">•</span>
      <span class="whitespace-nowrap text-zinc-200">🚗 ${travelEstimate.driveMinutes} min (<span class="font-bold ${traffic.className}">${traffic.label}</span>)</span>
      <span class="trip-intel-pill-separator" aria-hidden="true">•</span>
      <span data-trip-pill-weather class="whitespace-nowrap font-semibold text-zinc-200" aria-label="Loading live weather">🌡️ --°F</span>
      <span class="hidden text-zinc-600 sm:inline" aria-hidden="true">|</span>
      <span class="trip-intel-pill-cta">🚗 Directions & Transit <span class="trip-intel-pill-arrow" aria-hidden="true">↗</span></span>
    `;
    travelBadge.addEventListener('click', () => openTripIntelModal(mic, travelEstimate, travelBadge));
    card.append(travelBadge);
    hydrateTripIntelPillWeather(mic, travelBadge.querySelector('[data-trip-pill-weather]'));
  }

  if (mic.address) {
    const address = document.createElement('p');
    address.className = 'mt-2 text-base font-medium leading-6 text-zinc-300';
    address.textContent = mic.address;
    card.append(address);
  }

  const hasMeta = mic.micType || mic.price || mic.ageRequirement;
  if (hasMeta) {
    const metaContainer = document.createElement('div');
    metaContainer.className = 'mt-3 flex flex-wrap items-center gap-2';

    if (mic.micType) {
      const typeBadge = document.createElement('span');
      const isCoreType = /comedy|music|variety|anything is allowed/i.test(mic.micType);
      typeBadge.className = isCoreType
        ? 'rounded-md border border-red-500 bg-red-950/50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
        : 'rounded-md border border-red-500/40 bg-red-950/30 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-red-300';
      typeBadge.textContent = mic.micType;
      metaContainer.append(typeBadge);
    }

    if (mic.price) {
      const priceBadge = document.createElement('span');
      const isFree = /free/i.test(mic.price);
      priceBadge.className = `rounded-md border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 text-xs font-bold ${isFree ? 'text-[#00C805]' : 'text-zinc-200'}`;
      priceBadge.textContent = mic.price;
      metaContainer.append(priceBadge);
    }

    if (mic.ageRequirement) {
      const ageBadge = document.createElement('span');
      ageBadge.className = 'rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-400';
      ageBadge.textContent = mic.ageRequirement;
      metaContainer.append(ageBadge);
    }

    card.append(metaContainer);
  }

  if (mic.notes) {
    const notesContainer = document.createElement('div');
    notesContainer.className = 'mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3';

    const notesLabel = document.createElement('span');
    notesLabel.className = 'text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1';
    notesLabel.textContent = 'Details & Rules';

    const notesText = document.createElement('p');
    notesText.className = 'text-sm font-semibold leading-relaxed text-zinc-200';
    notesText.textContent = mic.notes;

    notesContainer.append(notesLabel, notesText);
    card.append(notesContainer);
  }

  const cardHost = getOpenMicHost(mic, upcomingDate || selectedDateObj);
  // When a list link exists the host is shown on that button instead of as a line.
  const hostOnListButton = Boolean(cardHost && mic.listUrl);
  const hostBadgeClass = 'inline-flex items-center gap-1.5 rounded-md border border-amber-400/80 bg-gradient-to-r from-amber-500/25 to-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.35)] transition hover:border-amber-300 hover:text-amber-100 hover:shadow-[0_0_16px_rgba(251,191,36,0.5)]';
  const buildHostBadgeContent = (el) => {
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🎤';
    const label = document.createElement('span');
    label.className = 'text-amber-400/90 font-bold normal-case tracking-normal';
    label.textContent = 'Host:';
    const name = document.createElement('span');
    name.className = 'normal-case tracking-normal text-white';
    name.textContent = cardHost;
    el.replaceChildren(icon, label, name);
  };
  if (cardHost && !hostOnListButton) {
    const hostRow = document.createElement('div');
    hostRow.className = 'mt-3 flex flex-wrap items-center gap-2';
    const hostBadge = document.createElement('span');
    hostBadge.className = hostBadgeClass;
    buildHostBadgeContent(hostBadge);
    hostRow.append(hostBadge);
    card.append(hostRow);
  }
  if (mic.wheelchairAccessible) {
    const details = document.createElement('p');
    details.className = 'mt-3 text-sm font-medium leading-6 text-zinc-300';
    details.textContent = 'Wheelchair accessible';
    card.append(details);
  }

  if (mic.address || mic.website || mic.signupDetails || mic.contact || mic.listUrl || (travelEstimate && isToday)) {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-3';

    if (mic.website) {
      const websiteLink = document.createElement('a');
      websiteLink.href = mic.website;
      websiteLink.target = '_blank';
      websiteLink.rel = 'noopener noreferrer';
      websiteLink.className = 'rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-[#00C805] hover:text-[#00C805]';
      websiteLink.textContent = mic.signupType === 'online' ? 'Online Signup' : 'Website / Signup';
      actions.append(websiteLink);
    }

    if (mic.signupDetails) {
      const signupDetailsButton = document.createElement('button');
      signupDetailsButton.type = 'button';
      signupDetailsButton.setAttribute('aria-haspopup', 'dialog');
      signupDetailsButton.setAttribute('aria-controls', 'signupDetailsModal');
      signupDetailsButton.className = 'rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-[#00C805] hover:text-[#00C805]';
      signupDetailsButton.textContent = 'Signup details';
      signupDetailsButton.addEventListener('click', () => openSignupDetailsModal(mic, signupDetailsButton));
      actions.append(signupDetailsButton);
    }

    if (mic.listUrl) {
      const listLink = document.createElement('a');
      listLink.href = mic.listUrl;
      listLink.target = '_blank';
      listLink.rel = 'noopener noreferrer';
      if (hostOnListButton) {
        listLink.className = hostBadgeClass;
        buildHostBadgeContent(listLink);
        listLink.title = buildOpenMicListButtonLabel(mic.listLabel);
      } else {
        listLink.className = 'rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-[#00C805] hover:text-[#00C805]';
        listLink.textContent = buildOpenMicListButtonLabel(mic.listLabel);
      }
      actions.append(listLink);
    }

    if (mic.contact) {
      const contactLink = document.createElement('a');
      contactLink.href = mic.contact;
      contactLink.target = '_blank';
      contactLink.rel = 'noopener noreferrer';
      contactLink.className = 'rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-[#00C805] hover:text-[#00C805]';
      contactLink.textContent = 'Contact';
      actions.append(contactLink);
    }

    card.append(actions);
  }

  return card;
}

let openMicMapRenderToken = 0;
let lastRenderedOpenMicNextId = null;
async function renderOpenMicMapView() {
  const renderToken = ++openMicMapRenderToken;
  openMicMapList.replaceChildren();
  openMicMapStatus.hidden = true;
  const now = new Date();
  if (!selectedOpenMicDayName) selectedOpenMicDayName = getSeattleNow(now).dayName;
  const selectedDate = getNextSeattleWeekdayDate(selectedOpenMicDayName, now);
  const selectedDateParts = getSeattleNow(selectedDate.date);
  openMicMapDayLabel.textContent = selectedDateParts.dayName;
  openMicMapDateLabel.textContent = formatSeattleCalendarDate(selectedDate.date);
  openMicTonightTitle.textContent = `${selectedDateParts.dayName}'s Mics`;
  updateOpenMicDaySelector(selectedDateParts.dayName);
  updateOpenMicTypeFilter(selectedOpenMicType);

  try {
    const allMics = filterOpenMicsByType(await loadOpenMicData(), selectedOpenMicType);
    if (renderToken !== openMicMapRenderToken) return;

    const { dayName, todays, nextMic, lastMic } = selectOpenMicsForSeattleDate(
      allMics,
      selectedDate.isToday ? now : selectedDate.date,
      selectedDate.isToday
    );
    lastRenderedOpenMicNextId = nextMic ? nextMic.id : null;
    const selectedSeattleDate = getSeattleNow(selectedDate.date);
    const upcomingPreviews = allMics
      .filter((mic) => (
        mic.showWhenInactive
        && String(mic.recurrence?.weekday || '').toLowerCase() === dayName.toLowerCase()
        && !openMicOccursOnSeattleDate(mic, selectedSeattleDate)
      ))
      .map((mic) => ({
        mic,
        date: getNextOpenMicOccurrenceDate(mic, selectedDate.date)
      }))
      .filter(({ date }) => Boolean(date))
      .sort((a, b) => a.date - b.date);
    openMicMapDayLabel.textContent = dayName;

    // Render sidebar with chronologically sorted order
    renderOpenMicTonightPanel(todays, nextMic, lastMic);

    if (todays.length === 0 && upcomingPreviews.length === 0) {
      const dayPhrase = selectedDate.isToday ? 'today' : 'this day';
      openMicMapStatus.textContent = selectedOpenMicType === 'all'
        ? `No open mics listed for ${dayPhrase}.`
        : `No matching open mics for ${dayPhrase}. Try clearing the type filter.`;
      openMicMapStatus.hidden = false;
      return;
    }

    if (selectedDate.isToday && !nextMic) {
      openMicMapStatus.textContent = 'No more open mics scheduled for today.';
      openMicMapStatus.hidden = false;
    }

    const cardsToRender = [
      ...todays.map((mic) => ({ mic, upcomingDate: null })),
      ...upcomingPreviews.map(({ mic, date }) => ({ mic, upcomingDate: date }))
    ].sort((a, b) => {
      const timeA = a.mic.startMinutes ?? a.mic.signupMinutes ?? 9999;
      const timeB = b.mic.startMinutes ?? b.mic.signupMinutes ?? 9999;
      if (timeA !== timeB) return timeA - timeB;
      return a.mic.name.localeCompare(b.mic.name);
    });

    // Keep every card in chronological order, including locked monthly previews.
    cardsToRender.forEach(({ mic, upcomingDate }) => {
      const isNext = nextMic && mic.id === nextMic.id;
      openMicMapList.append(renderOpenMicCard(
        mic,
        isNext,
        selectedDate.isToday,
        selectedDate.isToday ? getSeattleNow(now).minutesSinceMidnight : null,
        upcomingDate,
        selectedDate.date
      ));
    });
  } catch (err) {
    if (renderToken !== openMicMapRenderToken) return;
    console.error('Unable to load open mic listings:', err);
    openMicMapList.replaceChildren();
    renderOpenMicTonightPanel([], null, null);
    openMicMapStatus.textContent = 'Open mic listings are temporarily unavailable.';
    openMicMapStatus.hidden = false;
  }
}

// Keep the "Next Open Mic" highlight in sync with the clock while the map
// view is open. Only re-render when the computed next mic changes, so a
// user's manually selected card isn't reset every minute.
window.setInterval(async () => {
  if (openMicMapSection.hidden) return;
  const now = new Date();
  const seattleNow = getSeattleNow(now);
  if (!selectedOpenMicDayName || selectedOpenMicDayName !== seattleNow.dayName) return;
  try {
    const allMics = filterOpenMicsByType(await loadOpenMicData(), selectedOpenMicType);
    const { nextMic } = selectOpenMicsForSeattleDate(allMics, now, true);
    const nextId = nextMic ? nextMic.id : null;
    if (nextId !== lastRenderedOpenMicNextId) renderOpenMicMapView();
  } catch {
    // Data unavailable; the main render path already surfaces this error.
  }
}, 60 * 1000);

function getSeattleScheduleMode(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hoursSinceMidnight = Number(values.hour) % 24;
  const minutesSinceMidnight = hoursSinceMidnight * 60 + Number(values.minute);

  if (values.weekday === 'Fri' && minutesSinceMidnight >= 6 * 60 && minutesSinceMidnight < 21 * 60 + 40) {
    return 'lineup';
  }
  return 'signup';
}

function getSeattleWeekdayAndMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const minutesSinceMidnight = (Number(values.hour) % 24) * 60 + Number(values.minute);
  return { weekday: values.weekday, minutesSinceMidnight };
}

function isSignupRequestWindowOpen(date = new Date()) {
  const { weekday, minutesSinceMidnight } = getSeattleWeekdayAndMinutes(date);
  if (weekday === 'Thu' && minutesSinceMidnight >= SIGNUP_CLOSE_MINUTES) return false;
  if (weekday === 'Fri' && minutesSinceMidnight < SIGNUP_REOPEN_MINUTES) return false;
  return true;
}

function minutesUntilSignupReopen(date = new Date()) {
  const { weekday, minutesSinceMidnight } = getSeattleWeekdayAndMinutes(date);
  const daysUntilFriday = (SIGNUP_WEEKDAYS.indexOf('Fri') - SIGNUP_WEEKDAYS.indexOf(weekday) + 7) % 7;
  return daysUntilFriday * 1440 + (SIGNUP_REOPEN_MINUTES - minutesSinceMidnight);
}

function updateSignupWindowStatus() {
  if (!signupWindowStatus || !signupWindowStatusText) return;

  const now = new Date();
  signupWindowIsOpen = isSignupRequestWindowOpen(now);

  signupWindowStatus.classList.remove('signup-window-status--open', 'signup-window-status--closed');

  if (signupWindowIsOpen) {
    signupWindowStatus.classList.add('signup-window-status--open');
    signupWindowStatusText.textContent = 'Sign Up Requests Open — Closes Thursday at 10:00 PM';
  } else {
    signupWindowStatus.classList.add('signup-window-status--closed');
    signupWindowStatusText.textContent = 'Sign Up Requests Closed — Reopens After Friday’s Show';
  }

  if (!signupSubmissionInFlight) {
    submitButton.disabled = !signupWindowIsOpen;
    submitButton.textContent = signupWindowIsOpen ? 'Submit & Verify Email' : 'Requests Closed';
  }
}

function prioritizeVerificationView() {
  if (verificationTabRequested) {
    enterStandaloneVerificationMode();
  }
}

function formatSetLength(value) {
  if (value == null || String(value).trim() === '') return '—';
  const text = String(value).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text} MIN` : text.toUpperCase();
}

function formatStartTime(value) {
  if (value == null || String(value).trim() === '') return '—';
  const text = String(value).trim();
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!timeMatch) return text;

  const hours = Number(timeMatch[1]);
  if (hours > 23) return text;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${timeMatch[2]} ${suffix}`;
}

function renderLineup(rows) {
  lineupRows.replaceChildren();

  rows.forEach((performer) => {
    const row = document.createElement('div');
    row.className = 'lineup-row';

    const name = document.createElement('div');
    name.className = 'lineup-row__name';
    name.textContent = performer.name || 'TBA';

    const setLength = document.createElement('div');
    setLength.className = 'lineup-row__set';
    setLength.textContent = formatSetLength(performer.set_length);

    const startTime = document.createElement('div');
    startTime.className = 'lineup-row__time';
    startTime.textContent = formatStartTime(performer.start_time);

    row.append(name, setLength, startTime);
    lineupRows.append(row);
  });
}

const LINEUP_SHEET_ID = '1CiqV18PMOPVienqn4HrqMVuMkxXX4bDJd08HATQk8gU';
const LINEUP_SHEET_NAME = 'Intake & Contacts';

async function fetchLineupFromSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${LINEUP_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(LINEUP_SHEET_NAME)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sheet request failed (${response.status})`);

  const text = await response.text();
  const jsonMatch = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!jsonMatch) throw new Error('Unexpected sheet response format');

  const payload = JSON.parse(jsonMatch[1]);
  if (payload.status !== 'ok') throw new Error('Sheet query returned an error');

  const cellText = (row, index) => {
    if (index < 0 || !row) return '';
    const cell = row.c?.[index];
    if (!cell) return '';
    if (cell.f != null && String(cell.f).trim() !== '') return String(cell.f).trim();
    if (cell.v != null) return String(cell.v).trim();
    return '';
  };

  const cols = payload.table.cols.map((col) => (col.label || '').trim().toUpperCase());
  let nameIndex = cols.indexOf('NAME');
  let setIndex = cols.indexOf('SET') !== -1 ? cols.indexOf('SET') : cols.indexOf('LENGTH');
  let timeIndex = cols.indexOf('TIME');
  let dataRows = payload.table.rows;

  if (nameIndex === -1) {
    // Google Sheets didn't auto-detect a header row for this tab (blank header
    // cells break its heuristic), so the header text ends up in the first data row.
    const headerRow = payload.table.rows[0];
    const headerCells = (headerRow?.c || []).map((_, i) => cellText(headerRow, i).toUpperCase());
    nameIndex = headerCells.indexOf('NAME');
    setIndex = headerCells.indexOf('SET') !== -1 ? headerCells.indexOf('SET') : headerCells.indexOf('LENGTH');
    timeIndex = headerCells.indexOf('TIME');
    dataRows = payload.table.rows.slice(1);

    if (nameIndex === -1) nameIndex = 0;
    if (setIndex === -1) setIndex = nameIndex + 1;
    if (timeIndex === -1) timeIndex = nameIndex + 2;
  }

  return dataRows
    .map((row) => ({
      name: cellText(row, nameIndex),
      set_length: cellText(row, setIndex),
      start_time: cellText(row, timeIndex),
    }))
    .filter((entry) => entry.name !== '');
}

async function loadLineup() {
  if (verificationTabRequested) return;

  showLineupView();
  lineupRows.replaceChildren();
  lineupStatus.hidden = false;
  lineupStatus.textContent = "Loading tonight's lineup...";
  lineupStatus.closest('.lineup-board').setAttribute('aria-busy', 'true');

  let data = null;
  let error = null;
  try {
    data = await fetchLineupFromSheet();
  } catch (err) {
    error = err;
  }

  if (verificationTabRequested) return;

  if (error) {
    console.error('Unable to load lineup:', error);
    lineupStatus.textContent = 'The lineup could not be loaded. Please refresh the page.';
  } else if (!data?.length) {
    lineupStatus.textContent = "Tonight's lineup has not been posted yet.";
  } else {
    renderLineup(data);
    lineupStatus.hidden = true;
  }

  lineupStatus.closest('.lineup-board').setAttribute('aria-busy', 'false');
}

function showFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.className = `text-center text-sm ${isError ? 'text-red-400' : 'text-emerald-400'}`;
}

function closeInstagramInfo() {
  instagramInfoTooltip.classList.add('hidden');
  instagramInfoButton.setAttribute('aria-expanded', 'false');
}

instagramInfoButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = instagramInfoButton.getAttribute('aria-expanded') === 'true';
  instagramInfoTooltip.classList.toggle('hidden', isOpen);
  instagramInfoButton.setAttribute('aria-expanded', String(!isOpen));
});

document.addEventListener('click', (event) => {
  if (!instagramInfoTooltip.contains(event.target)) closeInstagramInfo();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeInstagramInfo();
});

emailInput.addEventListener('input', () => {
  formMessage.textContent = '';
  formMessage.classList.add('hidden');
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signupForm.reportValidity()) return;
  if (!signupWindowIsOpen) {
    showFormMessage('Requests for this week have closed. Check back after Friday’s show.', true);
    return;
  }
  if (!supabaseClient) {
    showFormMessage('Add your Supabase URL and anon key in index.html before submitting.', true);
    return;
  }

  const name = document.getElementById('name').value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const phone = document.getElementById('phone')?.value.trim() || '';
  const instagram = document.getElementById('instagram')?.value.trim() || '@n/a';
  const slot_type = document.getElementById('slotType')?.value || 'First Available';
  const performedBefore = new FormData(signupForm).get('performed_before') === 'true';

  signupSubmissionInFlight = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending Verification…';
  formMessage.classList.add('hidden');

  const { data: hasActiveVerifiedSignup, error: duplicateCheckError } = await supabaseClient.rpc(
    'has_active_verified_signup',
    { p_email: email }
  );

  if (duplicateCheckError) {
    console.error('Unable to check for an existing verified sign-up:', duplicateCheckError);
    showFormMessage('Could not check this email address. Please try again.', true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  if (typeof hasActiveVerifiedSignup !== 'boolean') {
    console.error('Unable to check for an existing verified sign-up: RPC returned an invalid response.');
    showFormMessage('Could not check this email address. Please try again.', true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  if (hasActiveVerifiedSignup === true) {
    showFormMessage('An account has already been verified with this email address. Please use a different email to continue.', true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  const signupRecord = {
    name,
    email,
    phone: phone || 'N/A',
    instagram: instagram || '@n/a',
    performed_before: performedBefore,
    no_show_agreement: true,
    guarantee_agreement: true,
    slot_type,
    is_verified: false
  };

  const { data: insertedSignup, error: insertError } = await supabaseClient
    .from('signups')
    .insert([signupRecord])
    .select('id')
    .single();

  if (insertError) {
    console.error('Unable to save sign-up:', insertError);
    showFormMessage(`Could not save your submission: ${insertError.message}`, true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  if (insertedSignup?.id == null) {
    console.error('Unable to save sign-up: no signup ID was returned.');
    showFormMessage('Could not save your submission. Please try again.', true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  const redirectUrl = new URL(window.location.origin + window.location.pathname);
  redirectUrl.searchParams.set('verify', '1');

  const { error: authError } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl.toString() }
  });

  if (authError) {
    console.error('Unable to send magic link:', authError);
    showFormMessage(`Your submission was saved, but the verification email could not be sent: ${authError.message}`, true);
    signupSubmissionInFlight = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit & Verify Email';
    return;
  }

  signupForm.reset();
  signupCard.classList.add('hidden');
  verificationSentCard.classList.remove('hidden');
  signupSubmissionInFlight = false;
  submitButton.disabled = false;
  submitButton.textContent = 'Submit & Verify Email';
});

async function verifyPendingSignup(session) {
  if (!verificationTabRequested) return;
  const userEmail = session?.user?.email;
  if (!userEmail || !supabaseClient || verificationInProgress || verificationHandled) return;

  enterStandaloneVerificationMode();
  verificationInProgress = true;

  try {
    const { data: claimSucceeded, error: claimError } = await supabaseClient.rpc(
      'claim_pending_signup'
    );

    if (claimError) {
      console.error('Unable to claim verified sign-up:', claimError);
      verificationLoadingCard.classList.add('hidden');
      verificationErrorCard.classList.remove('hidden');
      if (claimError.message) {
        verificationErrorMessage.textContent = claimError.message;
      }
      return;
    }

    console.log('Claim pending signup succeeded:', claimSucceeded === true);

    if (claimSucceeded !== true) {
      console.error('Unable to claim verified sign-up: RPC returned false.');
      verificationLoadingCard.classList.add('hidden');
      verificationErrorCard.classList.remove('hidden');
      return;
    }

    verificationHandled = true;
    verificationLoadingCard.classList.add('hidden');
    verificationErrorCard.classList.add('hidden');
    verificationSuccessCard.classList.remove('hidden');
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Unexpected error during verification:', err);
    verificationLoadingCard.classList.add('hidden');
    verificationErrorCard.classList.remove('hidden');
  } finally {
    verificationInProgress = false;
  }
}

// --- Submit Your Open Mic form (internally: the "addmic" view, /add-mic) ---
// Hosts submit a mic; the submission is stored in Supabase
// (public.open_mic_submissions) with a `record` already shaped like an
// entry in data/open-mics.json. Review and publish it in the admin panel
// (/?admin=1), which geocodes the address and copies the record into
// public.published_open_mics.
const ADD_MIC_FLYER_BUCKET = 'open-mic-flyers';
const ADD_MIC_FLYER_MAX_BYTES = 10 * 1024 * 1024;
const ADD_MIC_ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'Last' };
const ADD_MIC_TYPE_LABELS = {
  comedy: 'Comedy',
  music: 'Music Mic',
  variety: 'Variety / Mix Mic / Anything is allowed',
  improv: 'Improv Comedy'
};
const ADD_MIC_AGE_LABELS = { 21: '21+', 18: '18+', all: 'All Ages' };
const ADD_MIC_GROUP_RULES = [
  { name: 'days' },
  { name: 'frequency' },
  { name: 'monthlyWeeks', when: () => getAddMicRadio('frequency') === 'monthly' },
  { name: 'signupType' },
  { name: 'micType' },
  { name: 'age' },
  { name: 'price' }
];

const addMicForm = document.getElementById('addMicForm');
const addMicFormWrap = document.getElementById('addMicFormWrap');
const addMicSubmitButton = document.getElementById('addMicSubmitButton');
const addMicFormMessage = document.getElementById('addMicFormMessage');
const addMicSuccessCard = document.getElementById('addMicSuccessCard');
const addMicSuccessTitle = document.getElementById('addMicSuccessTitle');
const addMicSuccessName = document.getElementById('addMicSuccessName');
const addMicSuccessMic = document.getElementById('addMicSuccessMic');
const addMicSuccessFlyerNote = document.getElementById('addMicSuccessFlyerNote');
const addMicSubmitAnother = document.getElementById('addMicSubmitAnother');
const addMicBackToList = document.getElementById('addMicBackToList');
const addMicMonthlyWeeks = document.getElementById('addMicMonthlyWeeks');
const addMicBiweeklyAnchor = document.getElementById('addMicBiweeklyAnchor');
const addMicAnchorDate = document.getElementById('addMicAnchorDate');
const addMicAnchorWarning = document.getElementById('addMicAnchorWarning');
const addMicSignupTime = document.getElementById('addMicSignupTime');
const addMicSignupRequiredMark = document.getElementById('addMicSignupRequiredMark');
const addMicSignupOptionalMark = document.getElementById('addMicSignupOptionalMark');
const addMicOnlineLinkWrap = document.getElementById('addMicOnlineLinkWrap');
const addMicWebSignup = document.getElementById('addMicWebSignup');
const addMicTypeOtherWrap = document.getElementById('addMicTypeOtherWrap');
const addMicTypeOther = document.getElementById('addMicTypeOther');
const addMicCoverAmountWrap = document.getElementById('addMicCoverAmountWrap');
const addMicCoverAmount = document.getElementById('addMicCoverAmount');
const addMicDropzone = document.getElementById('addMicDropzone');
const addMicDropzoneIdle = document.getElementById('addMicDropzoneIdle');
const addMicFlyerInput = document.getElementById('addMicFlyer');
const addMicFlyerThumb = document.getElementById('addMicFlyerThumb');
const addMicFlyerThumbFallback = document.getElementById('addMicFlyerThumbFallback');
const addMicFlyerName = document.getElementById('addMicFlyerName');
const addMicFlyerSize = document.getElementById('addMicFlyerSize');
const addMicFlyerRemove = document.getElementById('addMicFlyerRemove');
const addMicFlyerError = document.getElementById('addMicFlyerError');
const addMicPreviewTargets = [
  document.getElementById('addMicPreviewDesktop'),
  document.getElementById('addMicPreviewMobile')
].filter(Boolean);

let addMicFlyerFile = null;
let addMicFlyerObjectUrl = null;
let addMicSubmissionInFlight = false;
let addMicAttemptedSubmit = false;
let addMicPreviewFrame = null;

function addMicFormValue(name) {
  const field = addMicForm.elements[name];
  if (!field || field instanceof RadioNodeList) return '';
  return String(field.value ?? '').trim();
}

function getAddMicChecked(name) {
  return [...addMicForm.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function getAddMicRadio(name) {
  return getAddMicChecked(name)[0] || '';
}

// "19:30" -> "7:30pm", "19:00" -> "7pm" (the timeSignupStart shorthand used in the JSON)
function formatTimeInputShort(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!match) return '';
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return minute === '00' ? `${hour12}${suffix}` : `${hour12}:${minute}${suffix}`;
}

// "19:30" -> "7:30 PM"
function formatTimeInputLong(value) {
  const minutes = parseTimeStringToMinutes(String(value || '').trim());
  return minutes === null ? '' : formatMinutesToClock(minutes);
}

function joinNaturally(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

function slugifyAddMic(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Accepts "@handle", "instagram.com/handle", "venue.com" or a full URL and
// returns an https:// URL (the cards only link http(s) values).
function normalizeAddMicUrl(value, { instagramHandles = false } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^@/.test(text)) {
    const handle = text.slice(1).replace(/[^a-z0-9._]/gi, '');
    return handle ? `https://www.instagram.com/${handle}/` : '';
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text)) return `https://${text}`;
  if (instagramHandles && /^[a-z0-9._]{1,30}$/i.test(text)) return `https://www.instagram.com/${text}/`;
  return '';
}

function formatCoverAmount(value) {
  const text = String(value || '').trim();
  if (!text) return 'Cover charge';
  return /^\d+(\.\d{1,2})?$/.test(text) ? `$${text}` : text;
}

function buildAddMicRecord() {
  const name = addMicFormValue('micName');
  const venue = addMicFormValue('venue');
  const street = addMicFormValue('street');
  const city = addMicFormValue('city');
  const state = addMicFormValue('state');
  const zip = addMicFormValue('zip');
  // Only compose an address once there's a street or city, so the live
  // preview doesn't show a lone "WA" before anyone types.
  const location = (street || city)
    ? [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : '';

  const checkedDays = getAddMicChecked('days');
  const days = OPEN_MIC_DAY_NAMES.filter((day) => checkedDays.includes(day));
  const frequency = getAddMicRadio('frequency') || 'weekly';
  const monthlyWeeks = getAddMicChecked('monthlyWeeks')
    .map(Number)
    .filter((nth) => Number.isInteger(nth))
    .sort((a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b));
  const anchorDate = addMicFormValue('anchorDate');

  const signupType = getAddMicRadio('signupType') || 'in-person';
  const signupTime = addMicFormValue('signupTime');
  const startTime = addMicFormValue('startTime');
  const endTime = addMicFormValue('endTime');
  const webSignup = signupType === 'in-person' ? '' : normalizeAddMicUrl(addMicFormValue('webSignup'));

  const micTypeKey = getAddMicRadio('micType');
  const openMicType = micTypeKey === 'other'
    ? addMicFormValue('micTypeOther')
    : (ADD_MIC_TYPE_LABELS[micTypeKey] || '');
  const ageRequirement = ADD_MIC_AGE_LABELS[getAddMicRadio('age')] || '';
  const priceKey = getAddMicRadio('price') || 'free';
  const priceForTime = priceKey === 'purchase'
    ? 'Free; purchase required to perform'
    : priceKey === 'cover'
      ? formatCoverAmount(addMicFormValue('coverAmount'))
      : 'Free';

  const host = addMicFormValue('host');
  const contact = normalizeAddMicUrl(addMicFormValue('contact'), { instagramHandles: true });
  const website = normalizeAddMicUrl(addMicFormValue('website'));
  const rules = addMicFormValue('rules');
  const wheelchairAccessible = Boolean(addMicForm.elements.wheelchairAccessible?.checked);

  // Recurrence, matching the shapes already in data/open-mics.json.
  const dayText = joinNaturally(days);
  const weekday = days[0] || '';
  let recurrenceText = '';
  let recurrence = null;
  let showWhenInactive = false;
  if (days.length) {
    if (frequency === 'biweekly') {
      recurrenceText = `Every Other ${dayText}`;
      recurrence = { type: 'biweekly', weekday, ...(anchorDate ? { anchorDate } : {}) };
      showWhenInactive = true;
    } else if (frequency === 'monthly') {
      if (monthlyWeeks.length === 1) {
        const nth = monthlyWeeks[0];
        recurrenceText = nth === -1
          ? `Last ${dayText} of the Month`
          : `Every ${ADD_MIC_ORDINALS[nth]} ${dayText}`;
        recurrence = { type: 'monthly-nth-weekday', weekday, nth };
      } else if (monthlyWeeks.length > 1) {
        recurrenceText = `Every ${joinNaturally(monthlyWeeks.map((nth) => ADD_MIC_ORDINALS[nth]))} ${dayText}`;
        recurrence = { type: 'monthly-multiple-nth-weekdays', weekday, nth: monthlyWeeks };
      } else {
        recurrenceText = `Monthly · ${dayText}`;
      }
      showWhenInactive = true;
    } else {
      recurrenceText = `Every ${dayText}`;
      recurrence = { type: 'weekly', weekday };
    }
  }

  // "7pm/7:30pm-9pm" = signup / start - end
  const signupShort = formatTimeInputShort(signupTime);
  const startShort = formatTimeInputShort(startTime);
  const endShort = formatTimeInputShort(endTime);
  const signupPart = signupShort || (signupType === 'online' ? 'online' : '');
  const timeSignupStart = (signupPart || startShort)
    ? `${signupPart}/${startShort}${startShort && endShort ? `-${endShort}` : ''}`
    : '';

  const signupLong = formatTimeInputLong(signupTime);
  let signupDetails = addMicFormValue('signupDetails');
  if (!signupDetails) {
    if (signupType === 'online') {
      signupDetails = 'Sign up online in advance.';
    } else if (signupType === 'both') {
      signupDetails = signupLong
        ? `Sign up online in advance or in person at ${signupLong}.`
        : 'Sign up online in advance or in person.';
    } else if (signupLong) {
      signupDetails = `In-person signup starts at ${signupLong}.`;
    }
  }

  const record = {
    id: slugifyAddMic(`${venue || name} ${location}`),
    name,
    ...(venue ? { venue } : {}),
    location,
    timeSignupStart,
    signupType,
    ...(signupDetails ? { signupDetails } : {}),
    monday: days.includes('Monday') ? 'Yes' : 'no',
    tuesday: days.includes('Tuesday') ? 'Yes' : 'no',
    wednesday: days.includes('Wednesday') ? 'Yes' : 'no',
    thursday: days.includes('Thursday') ? 'Yes' : 'no',
    friday: days.includes('Friday') ? 'Yes' : 'no',
    saturday: days.includes('Saturday') ? 'Yes' : 'no',
    sunday: days.includes('Sunday') ? 'Yes' : 'no',
    priceForTime,
    openMicType,
    ageRequirement,
    requirementsInfo: rules,
    ...(host ? { host } : {}),
    ...(wheelchairAccessible ? { wheelchairAccessible: true } : {}),
    ...(contact ? { contact } : {}),
    ...(website ? { website } : {}),
    webSignup,
    ...(recurrenceText ? { recurrenceText } : {}),
    ...(recurrence ? { recurrence } : {}),
    ...(showWhenInactive ? { showWhenInactive: true } : {})
  };

  return {
    record,
    meta: { days, frequency, monthlyWeeks, anchorDate, signupType, signupTime, startTime, endTime }
  };
}

function renderAddMicPreview() {
  addMicPreviewFrame = null;
  if (!addMicPreviewTargets.length) return;
  const { record } = buildAddMicRecord();
  const isPlaceholder = !record.name;
  const mic = normalizeOpenMicRecord(isPlaceholder ? { ...record, name: 'Your Open Mic' } : record);

  addMicPreviewTargets.forEach((target) => {
    target.classList.toggle('addmic-preview--placeholder', isPlaceholder);
    if (!mic) {
      const empty = document.createElement('p');
      empty.className = 'addmic-preview-empty';
      empty.textContent = 'Start filling in the form and your listing will appear here.';
      target.replaceChildren(empty);
      return;
    }
    const card = renderOpenMicCard(mic, false, false, null, null, null);
    card.removeAttribute('id');
    card.classList.remove('cursor-pointer');
    // The list card highlights itself on click; keep the preview static.
    card.addEventListener('click', () => card.classList.remove('open-mic-card--active'));
    target.replaceChildren(card);
  });
}

function scheduleAddMicPreview() {
  if (!addMicForm || addMicPreviewFrame !== null) return;
  addMicPreviewFrame = window.requestAnimationFrame(renderAddMicPreview);
}

function updateAddMicAnchorWarning() {
  if (!addMicAnchorDate || !addMicAnchorWarning) return;
  const value = addMicAnchorDate.value;
  const days = getAddMicChecked('days');
  if (!value || addMicBiweeklyAnchor.hidden || !days.length) {
    addMicAnchorWarning.hidden = true;
    return;
  }
  const [year, month, day] = value.split('-').map(Number);
  const picked = new Date(year, month - 1, day);
  if (Number.isNaN(picked.getTime())) {
    addMicAnchorWarning.hidden = true;
    return;
  }
  const weekday = OPEN_MIC_CALENDAR_DAYS[picked.getDay()];
  if (days.includes(weekday)) {
    addMicAnchorWarning.hidden = true;
    return;
  }
  const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(picked);
  addMicAnchorWarning.textContent = `Heads up: ${formatted} is a ${weekday}, but you picked ${joinNaturally(days)}.`;
  addMicAnchorWarning.hidden = false;
}

function syncAddMicConditionalFields() {
  if (!addMicForm) return;
  const frequency = getAddMicRadio('frequency');
  addMicMonthlyWeeks.hidden = frequency !== 'monthly';
  addMicBiweeklyAnchor.hidden = frequency !== 'biweekly';
  addMicAnchorDate.required = frequency === 'biweekly';

  const signupType = getAddMicRadio('signupType');
  const needsLink = signupType === 'online' || signupType === 'both';
  addMicOnlineLinkWrap.hidden = !needsLink;
  addMicWebSignup.required = needsLink;
  const signupTimeRequired = signupType !== 'online';
  addMicSignupTime.required = signupTimeRequired;
  addMicSignupRequiredMark.hidden = !signupTimeRequired;
  addMicSignupOptionalMark.hidden = signupTimeRequired;

  const micType = getAddMicRadio('micType');
  addMicTypeOtherWrap.hidden = micType !== 'other';
  addMicTypeOther.required = micType === 'other';

  const price = getAddMicRadio('price');
  addMicCoverAmountWrap.hidden = price !== 'cover';
  addMicCoverAmount.required = price === 'cover';

  updateAddMicAnchorWarning();
}

// Pill groups are custom controls, so they get custom required-checks.
function validateAddMicGroups() {
  let firstInvalid = null;
  ADD_MIC_GROUP_RULES.forEach((rule) => {
    const group = addMicForm.querySelector(`[data-addmic-group="${rule.name}"]`);
    if (!group) return;
    const applies = rule.when ? rule.when() : true;
    const invalid = applies && getAddMicChecked(rule.name).length === 0;
    group.classList.toggle('addmic-group--invalid', invalid);
    const error = group.querySelector('.addmic-error');
    if (error) error.hidden = !invalid;
    if (invalid && !firstInvalid) firstInvalid = group;
  });
  return firstInvalid;
}

function clearAddMicGroupErrors() {
  addMicForm.querySelectorAll('[data-addmic-group]').forEach((group) => {
    group.classList.remove('addmic-group--invalid');
    const error = group.querySelector('.addmic-error');
    if (error) error.hidden = true;
  });
}

function showAddMicMessage(message, isError = false) {
  addMicFormMessage.textContent = message;
  addMicFormMessage.className = `text-center text-sm font-semibold ${isError ? 'text-red-400' : 'text-[#00C805]'}`;
}

function hideAddMicMessage() {
  addMicFormMessage.textContent = '';
  addMicFormMessage.classList.add('hidden');
}

function setAddMicSubmitting(isSubmitting, label = 'Submit my mic') {
  addMicSubmissionInFlight = isSubmitting;
  addMicSubmitButton.disabled = isSubmitting;
  addMicSubmitButton.textContent = label;
}

function formatFileSize(bytes) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function clearAddMicFlyer() {
  addMicFlyerFile = null;
  if (addMicFlyerObjectUrl) {
    URL.revokeObjectURL(addMicFlyerObjectUrl);
    addMicFlyerObjectUrl = null;
  }
  addMicFlyerInput.value = '';
  addMicFlyerThumb.removeAttribute('src');
  addMicFlyerThumb.classList.remove('hidden');
  addMicFlyerThumbFallback.classList.add('hidden');
  addMicDropzone.classList.remove('has-file');
  addMicDropzoneIdle.classList.remove('hidden');
  addMicFlyerRemove.classList.add('hidden');
}

function setAddMicFlyer(file) {
  addMicFlyerError.hidden = true;
  if (!file) {
    clearAddMicFlyer();
    return;
  }
  const looksLikeImage = /^image\//i.test(file.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
  if (!looksLikeImage) {
    clearAddMicFlyer();
    addMicFlyerError.textContent = 'Please choose an image file (JPG, PNG, WEBP, GIF or HEIC).';
    addMicFlyerError.hidden = false;
    return;
  }
  if (file.size > ADD_MIC_FLYER_MAX_BYTES) {
    clearAddMicFlyer();
    addMicFlyerError.textContent = 'That file is over 10 MB. Try a smaller export or a screenshot of the flyer.';
    addMicFlyerError.hidden = false;
    return;
  }
  if (addMicFlyerObjectUrl) URL.revokeObjectURL(addMicFlyerObjectUrl);
  addMicFlyerFile = file;
  addMicFlyerObjectUrl = URL.createObjectURL(file);
  addMicFlyerThumb.classList.remove('hidden');
  addMicFlyerThumbFallback.classList.add('hidden');
  addMicFlyerThumb.src = addMicFlyerObjectUrl;
  addMicFlyerName.textContent = file.name;
  addMicFlyerSize.textContent = formatFileSize(file.size);
  addMicDropzone.classList.add('has-file');
  addMicDropzoneIdle.classList.add('hidden');
  addMicFlyerRemove.classList.remove('hidden');
}

async function uploadAddMicFlyer(file, slug) {
  const extension = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${new Date().toISOString().slice(0, 10)}/${slug || 'open-mic'}-${Date.now().toString(36)}.${extension}`;
  const { error } = await supabaseClient.storage
    .from(ADD_MIC_FLYER_BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
      cacheControl: '31536000'
    });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(ADD_MIC_FLYER_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

// supabase-js wraps non-2xx function responses; the useful message is in the body.
async function describeAddMicError(error, data) {
  if (data?.error) return data.error;
  if (!error) return 'unexpected response. Please try again.';
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // Body wasn't JSON; fall through to the generic message.
  }
  return error.message || 'please try again.';
}

function showAddMicSuccess(submitterName, micName, flyerFailed) {
  addMicSuccessName.textContent = submitterName;
  addMicSuccessMic.textContent = micName;
  addMicSuccessFlyerNote.hidden = !flyerFailed;
  addMicFormWrap.hidden = true;
  addMicSuccessCard.classList.remove('hidden');
  addMicSuccessCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  addMicSuccessTitle.focus({ preventScroll: true });
}

function resetAddMicForm() {
  addMicForm.reset();
  clearAddMicFlyer();
  addMicFlyerError.hidden = true;
  addMicAttemptedSubmit = false;
  clearAddMicGroupErrors();
  hideAddMicMessage();
  setAddMicSubmitting(false);
  syncAddMicConditionalFields();
  scheduleAddMicPreview();
}

if (addMicForm) {
  addMicForm.addEventListener('input', () => {
    hideAddMicMessage();
    scheduleAddMicPreview();
  });

  addMicForm.addEventListener('change', () => {
    syncAddMicConditionalFields();
    if (addMicAttemptedSubmit) validateAddMicGroups();
    scheduleAddMicPreview();
  });

  addMicFlyerInput.addEventListener('change', () => setAddMicFlyer(addMicFlyerInput.files?.[0] || null));
  addMicFlyerRemove.addEventListener('click', () => {
    clearAddMicFlyer();
    addMicFlyerError.hidden = true;
  });
  addMicFlyerThumb.addEventListener('error', () => {
    // HEIC and friends won't render in most browsers; show a placeholder instead.
    if (!addMicFlyerFile) return;
    addMicFlyerThumb.classList.add('hidden');
    addMicFlyerThumbFallback.classList.remove('hidden');
  });
  ['dragenter', 'dragover'].forEach((type) => {
    addMicDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      addMicDropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    addMicDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      addMicDropzone.classList.remove('is-dragover');
    });
  });
  addMicDropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) setAddMicFlyer(file);
  });

  addMicSubmitAnother.addEventListener('click', () => {
    resetAddMicForm();
    addMicSuccessCard.classList.add('hidden');
    addMicFormWrap.hidden = false;
    addMicSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('addMicName')?.focus({ preventScroll: true });
  });

  addMicBackToList.addEventListener('click', () => {
    resetAddMicForm();
    addMicSuccessCard.classList.add('hidden');
    addMicFormWrap.hidden = false;
    setActiveNav('openmicmap');
    showOpenMicMapView();
    renderOpenMicMapView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  addMicForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (addMicSubmissionInFlight) return;
    addMicAttemptedSubmit = true;
    syncAddMicConditionalFields();

    const firstInvalidGroup = validateAddMicGroups();
    const firstInvalidField = addMicForm.checkValidity()
      ? null
      : addMicForm.querySelector('input:invalid, select:invalid, textarea:invalid');
    if (firstInvalidGroup || firstInvalidField) {
      // Surface whichever problem comes first on the page.
      const groupComesFirst = firstInvalidGroup && (
        !firstInvalidField
        || Boolean(firstInvalidGroup.compareDocumentPosition(firstInvalidField) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
      if (groupComesFirst) {
        firstInvalidGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalidGroup.querySelector('input')?.focus({ preventScroll: true });
      } else {
        addMicForm.reportValidity();
      }
      showAddMicMessage('Please fill in the highlighted fields.', true);
      return;
    }

    const submitterName = addMicFormValue('submitterName');
    const submitterEmail = addMicFormValue('submitterEmail').toLowerCase();
    const { record, meta } = buildAddMicRecord();

    // Honeypot: bots fill the hidden "company" field. Pretend it worked.
    if (addMicFormValue('company')) {
      showAddMicSuccess(submitterName, record.name, false);
      return;
    }

    if (!supabaseClient) {
      showAddMicMessage('Submissions are temporarily unavailable. Please try again in a few minutes.', true);
      return;
    }

    hideAddMicMessage();
    setAddMicSubmitting(true, 'Submitting…');

    let flyerUrl = null;
    let flyerNote = '';
    if (addMicFlyerFile) {
      setAddMicSubmitting(true, 'Uploading flyer…');
      try {
        flyerUrl = await uploadAddMicFlyer(addMicFlyerFile, record.id);
      } catch (err) {
        console.error('Unable to upload flyer:', err);
        flyerNote = `Flyer upload failed (${addMicFlyerFile.name}): ${err?.message || err}`;
      }
      setAddMicSubmitting(true, 'Submitting…');
    }

    const notes = addMicFormValue('notes');
    const submission = {
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      submitter_instagram: addMicFormValue('submitterInstagram') || null,
      submitter_role: addMicFormValue('submitterRole') || null,
      submitter_notes: [notes, flyerNote].filter(Boolean).join('\n\n') || null,
      mic_name: record.name,
      venue: record.venue || null,
      location: record.location,
      days: meta.days,
      recurrence_text: record.recurrenceText || null,
      signup_time: meta.signupTime || null,
      start_time: meta.startTime || null,
      end_time: meta.endTime || null,
      signup_type: meta.signupType,
      web_signup: record.webSignup || null,
      open_mic_type: record.openMicType || null,
      age_requirement: record.ageRequirement || null,
      price: record.priceForTime || null,
      host: record.host || null,
      flyer_url: flyerUrl,
      record,
      page_url: window.location.href
    };

    // The edge function saves the row with the service role and emails the
    // admin, so the browser never writes to the table directly.
    let result;
    try {
      result = await supabaseClient.functions.invoke('submit-open-mic', { body: submission });
    } catch (err) {
      // invoke normally reports failures in `error`, but a dropped
      // connection can reject instead. Never leave the button spinning.
      console.error('Unable to reach the open mic submission function:', err);
      showAddMicMessage('Could not submit your mic. Check your connection and try again.', true);
      setAddMicSubmitting(false);
      return;
    }

    const { data, error } = result || {};

    if (error || !data?.ok) {
      console.error('Unable to save open mic submission:', error || data);
      showAddMicMessage(`Could not submit your mic: ${await describeAddMicError(error, data)}`, true);
      setAddMicSubmitting(false);
      return;
    }

    setAddMicSubmitting(false);
    showAddMicSuccess(submitterName, record.name, Boolean(addMicFlyerFile) && !flyerUrl);
  });

  syncAddMicConditionalFields();
  scheduleAddMicPreview();
}

// --- Admin review panel (internally: the "admin" view, /?admin=1) ---
// Approving a submission copies its record into public.published_open_mics via
// approve_open_mic_submission(); loadOpenMicData() merges that table on top of
// data/open-mics.json, so the mic is live in seconds with no redeploy. Every
// write goes through an admin-gated security-definer RPC — the browser holds no
// write grants on either table.
const ADMIN_STATUS_LABELS = {
  new: 'New',
  added: 'Published',
  rejected: 'Rejected',
  duplicate: 'Duplicate'
};
// The same sanity box scripts/geocode-open-mics.mjs uses.
const ADMIN_WASHINGTON_BOUNDS = {
  minLatitude: 45.4,
  maxLatitude: 49.1,
  minLongitude: -124.9,
  maxLongitude: -116.8
};
const ADMIN_CENSUS_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const ADMIN_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const ADMIN_NOMINATIM_DELAY_MS = 1100;

const adminSignInCard = document.getElementById('adminSignInCard');
const adminSignInForm = document.getElementById('adminSignInForm');
const adminEmailInput = document.getElementById('adminEmail');
const adminSignInButton = document.getElementById('adminSignInButton');
const adminSignInMessage = document.getElementById('adminSignInMessage');
const adminNavButton = document.getElementById('adminNavButton');

// The tab is always in the DOM (still clickable) but styled like a dead,
// greyed-out item for everyone except a confirmed admin.
function setAdminNavGhost(ghost) {
  adminNavButton.classList.toggle('nav-button--ghost', ghost);
  if (ghost) adminNavButton.setAttribute('tabindex', '-1');
  else adminNavButton.removeAttribute('tabindex');
}
const adminPanel = document.getElementById('adminPanel');
const adminStatusFilter = document.getElementById('adminStatusFilter');
const adminRefreshButton = document.getElementById('adminRefreshButton');
const adminSignOutButton = document.getElementById('adminSignOutButton');
const adminWhoami = document.getElementById('adminWhoami');
const adminQueue = document.getElementById('adminQueue');
const adminQueueStatus = document.getElementById('adminQueueStatus');


const ADMIN_PRIMARY_BUTTON =
  'rounded-lg bg-[#00C805] px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60';
const ADMIN_SECONDARY_BUTTON =
  'rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60';

let adminIsAuthorized = false;
// Edits made in the queue, keyed by submission id, so a half-finished record
// survives a re-render of the list.
const adminEditedRecords = new Map();
// Ids already committed to data/open-mics.json. A published row sharing one is
// shadowed by the file (see mergeOpenMicRecords), so the panel flags it.
let adminFileIds = new Set();

function adminEl(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function showAdminSignInMessage(message, isError = false) {
  adminSignInMessage.textContent = message;
  adminSignInMessage.className = `mt-3 text-sm ${isError ? 'text-red-400' : 'text-emerald-400'}`;
}

function isUsableOpenMicCoordinate(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= ADMIN_WASHINGTON_BOUNDS.minLatitude
    && latitude <= ADMIN_WASHINGTON_BOUNDS.maxLatitude
    && longitude >= ADMIN_WASHINGTON_BOUNDS.minLongitude
    && longitude <= ADMIN_WASHINGTON_BOUNDS.maxLongitude;
}

// Ported from scripts/geocode-open-mics.mjs so the panel and the offline
// geocoder try the same address variants for a stubborn address.
function buildOpenMicGeocodeQueries(location) {
  const value = String(location || '').trim();
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const firstAddressPart = parts.findIndex((part) => /\d/.test(part));
  const addressOnly = firstAddressPart > 0 ? parts.slice(firstAddressPart).join(', ') : '';
  const withoutUnit = value
    .replace(/\s+(?:#\s*\w+|suite\s*#?\w+|ste\s*\w+|units?\s+[a-z](?:-[a-z])?|annex building)(?=,|$)/i, '')
    .trim();
  const withoutConflictingDirectional = withoutUnit
    .replace(/\b(NE|NW|SE|SW)\s+(?:NE|NW|SE|SW)(?=,)/i, '$1');
  const withoutUnitParts = withoutUnit.split(',').map((part) => part.trim()).filter(Boolean);
  const firstCleanAddressPart = withoutUnitParts.findIndex((part) => /\d/.test(part));
  const cleanAddressOnly = firstCleanAddressPart > 0
    ? withoutUnitParts.slice(firstCleanAddressPart).join(', ')
    : '';
  return [...new Set([
    value,
    addressOnly,
    withoutUnit,
    cleanAddressOnly,
    withoutConflictingDirectional
  ].filter(Boolean))];
}

async function geocodeWithCensus(query) {
  if (!/\d/.test(query)) return null;
  const url = new URL(ADMIN_CENSUS_ENDPOINT);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Census Geocoder returned HTTP ${response.status}`);
  const payload = await response.json();
  const match = payload?.result?.addressMatches?.[0];
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  return isUsableOpenMicCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

async function geocodeWithNominatim(query) {
  const url = new URL(ADMIN_NOMINATIM_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('viewbox', '-124.9,49.1,-116.8,45.4');
  url.searchParams.set('bounded', '1');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
  const results = await response.json();
  const latitude = Number(results?.[0]?.lat);
  const longitude = Number(results?.[0]?.lon);
  return isUsableOpenMicCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

// Census first: no API key, CORS headers, and no User-Agent requirement — which
// a browser can't satisfy anyway, and Nominatim's usage policy asks for one. So
// Nominatim is only the fallback, throttled to its one-request-per-second rule.
async function geocodeOpenMicAddress(location) {
  const queries = buildOpenMicGeocodeQueries(location);
  if (!queries.length) return null;

  for (const query of queries) {
    try {
      const coordinates = await geocodeWithCensus(query);
      if (coordinates) return coordinates;
    } catch (err) {
      console.error(`Census lookup failed for "${query}":`, err);
    }
  }

  for (const [index, query] of queries.entries()) {
    if (index > 0) await new Promise((resolve) => window.setTimeout(resolve, ADMIN_NOMINATIM_DELAY_MS));
    try {
      const coordinates = await geocodeWithNominatim(query);
      if (coordinates) return coordinates;
    } catch (err) {
      console.error(`Nominatim lookup failed for "${query}":`, err);
    }
  }

  return null;
}

// "19:30" -> "7:30 PM", matching the edge function's formatClock.
function formatAdminClock(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return String(value || '').trim() || '—';
  const hour24 = Number(match[1]) % 24;
  return `${hour24 % 12 || 12}:${match[2]} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function formatAdminTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || '')
    : date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
}

function normalizeAdminId(value) {
  return String(value || '').trim().toLowerCase();
}

async function sendAdminMagicLink(email) {
  const redirectUrl = new URL(window.location.origin + window.location.pathname);
  redirectUrl.searchParams.set('admin', '1');
  // shouldCreateUser:false — a typo'd address must never mint a new auth user.
  return supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: false }
  });
}

adminSignInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = adminEmailInput.value.trim().toLowerCase();
  if (!email) {
    showAdminSignInMessage('Enter your admin email address.', true);
    return;
  }

  adminSignInButton.disabled = true;
  adminSignInButton.textContent = 'Sending…';
  const { error } = await sendAdminMagicLink(email);
  adminSignInButton.disabled = false;
  adminSignInButton.textContent = 'Email me a link';

  // Deliberately the same answer either way: with shouldCreateUser off, a
  // specific error would tell a stranger which addresses are admins.
  if (error) console.error('Unable to send the admin magic link:', error);
  showAdminSignInMessage('If that address is an admin, the sign-in link is on its way.');
});

adminSignOutButton.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  adminEditedRecords.clear();
  showAdminSignInMessage('Signed out.');
});

adminStatusFilter.addEventListener('change', () => loadAdminSubmissions());
adminRefreshButton.addEventListener('click', () => loadAdminData());

// Reveals the panel only when the RPC agrees the signed-in email is an admin.
// The RPC is also what every write re-checks, so this is UI, not the gate.
async function refreshAdminAuthorization(session) {
  if (!session?.user?.email) {
    adminIsAuthorized = false;
    setAdminNavGhost(true);
    adminPanel.hidden = true;
    adminSignInCard.hidden = false;
    return false;
  }

  const email = session.user.email;
  let authorized = false;
  try {
    const { data, error } = await supabaseClient.rpc('is_app_admin');
    if (error) throw error;
    authorized = data === true;
  } catch (err) {
    console.error('Unable to check admin access:', err);
  }

  adminIsAuthorized = authorized;
  setAdminNavGhost(!authorized);
  adminPanel.hidden = !authorized;
  adminSignInCard.hidden = authorized;

  if (!authorized) {
    showAdminSignInMessage(`${email} is not an admin account.`, true);
    await supabaseClient.auth.signOut();
    return false;
  }

  adminWhoami.textContent = `Signed in as ${email}`;
  return true;
}

async function loadAdminFileIds() {
  try {
    const response = await fetch(OPEN_MIC_JSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = await response.json();
    adminFileIds = new Set(
      (Array.isArray(records) ? records : [])
        .map((record) => normalizeAdminId(record?.id))
        .filter(Boolean)
    );
  } catch (err) {
    console.error('Unable to read data/open-mics.json for the admin panel:', err);
  }
}

async function loadAdminData() {
  if (!adminIsAuthorized) return;
  await loadAdminFileIds();
  await loadAdminSubmissions();
}


// Acting on a card removes it from the queue, so the outcome has to be
// reported outside the card that is about to be re-rendered away.
function setAdminQueueNotice(text, tone = 'text-zinc-400') {
  adminQueueStatus.hidden = false;
  adminQueueStatus.className = `text-sm ${tone}`;
  adminQueueStatus.textContent = text;
}

async function loadAdminSubmissions() {
  if (!adminIsAuthorized) return;
  setAdminQueueNotice('Loading submissions…');
  adminQueue.replaceChildren();

  const status = adminStatusFilter.value;
  let request = supabaseClient
    .from('open_mic_submissions')
    .select('*')
    .order('created_at', { ascending: true });
  if (status !== 'all') request = request.eq('status', status);

  const { data, error } = await request;
  if (error) {
    console.error('Unable to load submissions:', error);
    setAdminQueueNotice(`Could not load submissions: ${error.message}`, 'text-red-400');
    return;
  }
  if (!data?.length) {
    setAdminQueueNotice(status === 'all' ? 'No submissions yet.' : `No ${status} submissions.`);
    return;
  }

  adminQueueStatus.hidden = true;
  data.forEach((row) => adminQueue.append(renderAdminSubmissionCard(row)));
}
 


function renderAdminSubmissionCard(row) {
  const card = adminEl('article', 'addmic-card');
  const startingRecord = adminEditedRecords.get(row.id)
    || (row.record && typeof row.record === 'object' && !Array.isArray(row.record) ? row.record : {});

  const header = adminEl('div', 'mb-4 flex flex-wrap items-start justify-between gap-3');
  const heading = adminEl('div', 'min-w-0');
  heading.append(adminEl('h3', 'text-lg font-black text-zinc-50', `#${row.id} · ${row.mic_name}`));
  heading.append(adminEl('p', 'text-sm text-zinc-400', row.location));
  header.append(heading);

  const badges = adminEl('div', 'flex flex-wrap items-center gap-2');
  badges.append(adminEl(
    'span',
    `admin-badge${row.status === 'new' ? ' admin-badge--new' : ''}`,
    ADMIN_STATUS_LABELS[row.status] || row.status
  ));
  if (adminFileIds.has(normalizeAdminId(startingRecord.id))) {
    badges.append(adminEl('span', 'admin-badge admin-badge--warn', 'Already in JSON'));
  }
  header.append(badges);
  card.append(header);

  const facts = adminEl('dl', 'grid gap-x-6 gap-y-1 text-sm text-zinc-300 sm:grid-cols-2');
  const fact = (label, value) => {
    if (!value) return;
    const wrap = adminEl('div', 'flex min-w-0 gap-2');
    wrap.append(adminEl('dt', 'shrink-0 font-semibold text-zinc-500', `${label}:`));
    wrap.append(adminEl('dd', 'min-w-0 break-words', value));
    facts.append(wrap);
  };
  fact('Venue', row.venue);
  fact('Schedule', row.recurrence_text || (row.days || []).join(', '));
  fact(
    'Sign-up',
    `${formatAdminClock(row.signup_time)} · show ${formatAdminClock(row.start_time)}`
    + `${row.end_time ? ` – ${formatAdminClock(row.end_time)}` : ''}`
  );
  fact('Method', [row.signup_type, row.web_signup].filter(Boolean).join(' · '));
  fact('Details', [row.open_mic_type, row.age_requirement, row.price].filter(Boolean).join(' · '));
  fact('Host', row.host);
  fact(
    'From',
    `${row.submitter_name} <${row.submitter_email}>${row.submitter_role ? ` (${row.submitter_role})` : ''}`
  );
  fact('Instagram', row.submitter_instagram);
  fact('Received', formatAdminTimestamp(row.created_at));
  fact('Their notes', row.submitter_notes);
  fact('Review notes', row.review_notes);
  card.append(facts);

  if (row.flyer_url) {
    const flyer = adminEl('a', 'mt-3 inline-block text-sm font-semibold text-[#00C805] underline', 'Open the flyer');
    flyer.href = row.flyer_url;
    flyer.target = '_blank';
    flyer.rel = 'noopener noreferrer';
    card.append(flyer);
  }

  // Editable record beside a live listing preview, using the same
  // normalize/render pair the Submit Your Open Mic preview uses.
  const grid = adminEl(
    'div',
    'mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start'
  );
  const editorWrap = adminEl('div', 'min-w-0');
  editorWrap.append(adminEl(
    'label',
    'mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500',
    'open-mics.json record'
  ));
  const editor = adminEl('textarea', 'field');
  editor.value = JSON.stringify(startingRecord, null, 2);
  editor.spellcheck = false;
  editorWrap.append(editor);
  const editorError = adminEl('p', 'mt-1 text-sm text-red-400');
  editorError.hidden = true;
  editorWrap.append(editorError);
  grid.append(editorWrap);

  const previewWrap = adminEl('div', 'addmic-preview min-w-0');
  grid.append(previewWrap);
  card.append(grid);

  function readEditor() {
    try {
      const parsed = JSON.parse(editor.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('the record must be a JSON object');
      }
      editorError.hidden = true;
      return parsed;
    } catch (err) {
      editorError.textContent = `Invalid JSON: ${err.message}`;
      editorError.hidden = false;
      return null;
    }
  }

  function renderPreview() {
    const parsed = readEditor();
    const mic = parsed ? normalizeOpenMicRecord(parsed) : null;
    if (!mic) {
      previewWrap.replaceChildren(
        adminEl('p', 'addmic-preview-empty', 'The record needs a name before it can preview.')
      );
      return;
    }
    const previewCard = renderOpenMicCard(mic, false, false, null, null, null);
    previewCard.removeAttribute('id');
    previewCard.classList.remove('cursor-pointer');
    previewWrap.replaceChildren(previewCard);
  }

  editor.addEventListener('input', () => {
    const parsed = readEditor();
    if (parsed) adminEditedRecords.set(row.id, parsed);
    renderPreview();
  });
  renderPreview();

  // Coordinates. Submitted records never carry them, so approving geocodes the
  // address first — otherwise the mic would list without a map pin.
  const coordsRow = adminEl('div', 'mt-4 flex flex-wrap items-end gap-2');
  const makeCoordInput = (label, value) => {
    const wrap = adminEl('div');
    wrap.append(adminEl('label', 'mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500', label));
    const input = adminEl('input', 'field w-36 py-2 text-sm');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = Number.isFinite(Number(value)) && value !== undefined && value !== null && value !== ''
      ? String(value)
      : '';
    wrap.append(input);
    coordsRow.append(wrap);
    return input;
  };
  const latitudeInput = makeCoordInput('Latitude', startingRecord.latitude);
  const longitudeInput = makeCoordInput('Longitude', startingRecord.longitude);
  const lookupButton = adminEl('button', ADMIN_SECONDARY_BUTTON, 'Look up address');
  lookupButton.type = 'button';
  coordsRow.append(lookupButton);
  card.append(coordsRow);

  const notesInput = adminEl('input', 'field mt-4 py-2 text-sm');
  notesInput.type = 'text';
  notesInput.placeholder = 'Review notes (saved with Reject or Duplicate)';
  notesInput.value = row.review_notes || '';
  card.append(notesInput);

  const actions = adminEl('div', 'mt-4 flex flex-wrap items-center gap-2');
  const approveButton = adminEl('button', ADMIN_PRIMARY_BUTTON, 'Approve & publish');
  approveButton.type = 'button';
  const rejectButton = adminEl('button', ADMIN_SECONDARY_BUTTON, 'Reject');
  rejectButton.type = 'button';
  const duplicateButton = adminEl('button', ADMIN_SECONDARY_BUTTON, 'Mark duplicate');
  duplicateButton.type = 'button';
  const reopenButton = adminEl('button', ADMIN_SECONDARY_BUTTON, 'Back to new');
  reopenButton.type = 'button';
  actions.append(approveButton, rejectButton, duplicateButton, reopenButton);
  card.append(actions);

  const message = adminEl('p', 'mt-3 text-sm text-zinc-400');
  message.hidden = true;
  card.append(message);

  const buttons = [approveButton, rejectButton, duplicateButton, reopenButton, lookupButton];
  function setBusy(busy) {
    buttons.forEach((button) => { button.disabled = busy; });
  }
  function say(text, tone = 'text-zinc-400') {
    message.hidden = false;
    message.className = `mt-3 text-sm ${tone}`;
    message.textContent = text;
  }

  function readCoordinates() {
    const latitude = Number(latitudeInput.value.trim());
    const longitude = Number(longitudeInput.value.trim());
    const provided = latitudeInput.value.trim() !== '' || longitudeInput.value.trim() !== '';
    return { latitude, longitude, provided, usable: isUsableOpenMicCoordinate(latitude, longitude) };
  }

  async function lookupCoordinates(address) {
    say('Looking up the address…');
    const coordinates = await geocodeOpenMicAddress(address);
    if (!coordinates) return null;
    latitudeInput.value = String(coordinates.latitude);
    longitudeInput.value = String(coordinates.longitude);
    return coordinates;
  }

  lookupButton.addEventListener('click', async () => {
    setBusy(true);
    const parsed = readEditor();
    const coordinates = await lookupCoordinates(parsed?.location || row.location);
    setBusy(false);
    say(
      coordinates
        ? `Found ${coordinates.latitude}, ${coordinates.longitude}.`
        : 'No match. Enter the coordinates by hand, or publish without a map pin.',
      coordinates ? 'text-emerald-400' : 'text-yellow-400'
    );
  });

  // Set once the admin has been warned that a mic would publish with no pin;
  // pressing Approve again goes ahead anyway.
  let approveWithoutCoordinatesConfirmed = false;

  approveButton.addEventListener('click', async () => {
    const parsed = readEditor();
    if (!parsed) {
      say('Fix the JSON above before publishing.', 'text-red-400');
      return;
    }

    setBusy(true);
    let coordinates = readCoordinates();
    if (!coordinates.usable && !coordinates.provided && !approveWithoutCoordinatesConfirmed) {
      await lookupCoordinates(parsed.location || row.location);
      coordinates = readCoordinates();
    }

    if (!coordinates.usable && !approveWithoutCoordinatesConfirmed) {
      approveWithoutCoordinatesConfirmed = true;
      setBusy(false);
      say(
        coordinates.provided
          ? 'Those coordinates are outside Washington. Fix them, or press Approve again to publish without a map pin.'
          : 'Could not geocode that address. Add coordinates, or press Approve again to publish without a map pin.',
        'text-yellow-400'
      );
      return;
    }

    const record = { ...parsed };
    if (coordinates.usable) {
      record.latitude = coordinates.latitude;
      record.longitude = coordinates.longitude;
    }

    const { error } = await supabaseClient.rpc('approve_open_mic_submission', {
      p_submission_id: row.id,
      p_record: record
    });
    setBusy(false);

    if (error) {
      console.error('Unable to publish the submission:', error);
      say(`Could not publish: ${error.message}`, 'text-red-400');
      return;
    }

    adminEditedRecords.delete(row.id);
    invalidateOpenMicData();
    await loadAdminData();
    setAdminQueueNotice(
      `Published “${record.name || row.mic_name}”${coordinates.usable ? '' : ' without a map pin'}.`
      + ' It is live on the list now.',
      'text-emerald-400'
    );
  });

  async function review(status, label) {
    setBusy(true);
    const { error } = await supabaseClient.rpc('review_open_mic_submission', {
      p_submission_id: row.id,
      p_status: status,
      p_notes: notesInput.value.trim() || null
    });
    setBusy(false);

    if (error) {
      console.error(`Unable to mark the submission ${status}:`, error);
      say(`Could not mark it ${label}: ${error.message}`, 'text-red-400');
      return;
    }
    await loadAdminData();
    setAdminQueueNotice(`#${row.id} ${row.mic_name} is now marked ${label}.`, 'text-emerald-400');
  }

  rejectButton.addEventListener('click', () => review('rejected', 'rejected'));
  duplicateButton.addEventListener('click', () => review('duplicate', 'a duplicate'));
  reopenButton.addEventListener('click', () => review('new', 'new'));

  return card;
}


async function initializeApp() {
  const configured = !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_');
  if (!configured) {
    if (verificationTabRequested) {
      enterStandaloneVerificationMode();
      verificationLoadingCard.classList.add('hidden');
      verificationErrorCard.classList.remove('hidden');
      verificationErrorMessage.textContent = 'Supabase configuration is missing.';
    } else {
      showFormMessage('Add your Supabase URL and anon key in index.html before submitting.', true);
    }
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    // The admin panel keeps its session; verification signs itself out again.
    // INITIAL_SESSION is initializeApp's job, so this only handles the magic
    // link landing and sign-out.
    if (adminRequested) {
      if (event === 'INITIAL_SESSION') return;
      const wasAuthorized = adminIsAuthorized;
      const authorized = await refreshAdminAuthorization(session);
      if (authorized && !wasAuthorized) await loadAdminData();
      return;
    }

    if (!verificationTabRequested) return;

    const hasVerificationSession = Boolean(session?.user?.email);
    console.log('Auth event:', event);
    console.log('Verification session available:', hasVerificationSession);

    if (event === 'SIGNED_IN' && hasVerificationSession) {
      window.setTimeout(() => verifyPendingSignup(session), 0);
    }
  });

  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  const hasVerificationSession = Boolean(session?.user?.email);
  console.log('Startup verification session available:', hasVerificationSession);

  if (sessionError) {
    console.error('Unable to read the authentication session:', sessionError);
  }

  if (verificationTabRequested) {
    enterStandaloneVerificationMode();
    if (hasVerificationSession) {
      await verifyPendingSignup(session);
    } else {
      window.setTimeout(() => {
        if (!verificationHandled && !verificationInProgress) {
          verificationLoadingCard.classList.add('hidden');
          verificationErrorCard.classList.remove('hidden');
        }
      }, 5000);
    }
    return;
  }

  if (adminRequested) {
    setActiveNav('admin');
    showAdminView();
    if (await refreshAdminAuthorization(session)) await loadAdminData();
    return;
  }

  // Not on ?admin=1, but an admin session may still be live from an earlier
  // visit — reveal the nav tab so the panel is one tap away.
  if (session?.user?.email) {
    supabaseClient.rpc('is_app_admin').then(({ data }) => {
      adminIsAuthorized = data === true;
      setAdminNavGhost(!adminIsAuthorized);
      adminPanel.hidden = !adminIsAuthorized;
      adminSignInCard.hidden = adminIsAuthorized;
      if (adminIsAuthorized) adminWhoami.textContent = `Signed in as ${session.user.email}`;
    }).catch((err) => console.error('Unable to check admin access:', err));
  }

  const scheduledMode = getSeattleScheduleMode();
  const lineupModeRequested = lineupRequested && !signupRequested && !addMicRequested;

  if (addMicRequested) {
    // Shared link for hosts: stagetimepnw.com/add-mic
    setActiveNav('addmic');
    showAddMicView();
  } else if (lineupModeRequested || (!signupRequested && scheduledMode === 'lineup')) {
    setActiveNav('home');
    await loadLineup();
    startLineupRefreshTimer();
  } else if (signupRequested) {
    setActiveNav('home');
    showHomeView();
  } else {
    // Default landing view: the PNW open mic list & map.
    setActiveNav('openmicmap');
    showOpenMicMapView();
    renderOpenMicMapView();
  }
}

initializeApp();
