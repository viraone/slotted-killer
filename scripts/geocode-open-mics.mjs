#!/usr/bin/env node

/**
 * Developer-only one-time geocoder for data/open-mics.json.
 *
 * Uses the public OpenStreetMap Nominatim search endpoint and follows its
 * usage policy: an identifying User-Agent, serialized requests, and a delay
 * exceeding one second. Existing coordinates are the persistent cache, so
 * reruns only request unresolved records.
 * If Nominatim cannot resolve a structured U.S. street address, the script
 * falls back to the public, credential-free U.S. Census Geocoder.
 *
 * Run manually:
 *   node scripts/geocode-open-mics.mjs --write
 *
 * Policy: https://operations.osmfoundation.org/policies/nominatim/
 */

import { readFile, rename, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/open-mics.json', import.meta.url);
const TEMP_PATH = new URL('../data/open-mics.json.geocoding', import.meta.url);
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const CENSUS_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const USER_AGENT = 'StageTimePNW-open-mic-geocoder/1.0 (https://stagetimepnw.com/)';
const REQUEST_DELAY_MS = 1100;
const WRITE_CHANGES = process.argv.includes('--write');
const WASHINGTON_BOUNDS = {
  minLatitude: 45.4,
  maxLatitude: 49.1,
  minLongitude: -124.9,
  maxLongitude: -116.8
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isUsableCoordinate(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= WASHINGTON_BOUNDS.minLatitude
    && latitude <= WASHINGTON_BOUNDS.maxLatitude
    && longitude >= WASHINGTON_BOUNDS.minLongitude
    && longitude <= WASHINGTON_BOUNDS.maxLongitude;
}

function buildQueries(location) {
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

async function geocode(query) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', '-124.9,49.1,-116.8,45.4');
  url.searchParams.set('bounded', '1');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
  const results = await response.json();
  const match = results[0];
  if (!match) return null;

  const latitude = Number(match.lat);
  const longitude = Number(match.lon);
  return isUsableCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

async function geocodeWithCensus(query) {
  if (!/\d/.test(query)) return null;
  const url = new URL(CENSUS_ENDPOINT);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  if (!response.ok) throw new Error(`Census Geocoder returned HTTP ${response.status}`);
  const payload = await response.json();
  const match = payload?.result?.addressMatches?.[0];
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  return isUsableCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

async function save(records) {
  await writeFile(TEMP_PATH, `${JSON.stringify(records, null, 2)}\n`);
  await rename(TEMP_PATH, DATA_PATH);
}

const records = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const locationCache = new Map();
for (const record of records) {
  if (isUsableCoordinate(Number(record.latitude), Number(record.longitude))) {
    locationCache.set(record.location, {
      latitude: Number(record.latitude),
      longitude: Number(record.longitude)
    });
  }
}

let resolved = 0;
const unresolved = [];
for (const record of records) {
  if (isUsableCoordinate(Number(record.latitude), Number(record.longitude))) continue;

  let coordinates = locationCache.get(record.location) || null;
  if (!coordinates) {
    for (const query of buildQueries(record.location)) {
      try {
        coordinates = await geocode(query);
      } catch (error) {
        console.error(`Geocoding failed for ${record.name}: ${error.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
      if (coordinates) break;
    }
    if (!coordinates) {
      for (const query of buildQueries(record.location)) {
        try {
          coordinates = await geocodeWithCensus(query);
        } catch (error) {
          console.error(`Census fallback failed for ${record.name}: ${error.message}`);
        }
        if (coordinates) break;
      }
    }
  }

  if (!coordinates) {
    unresolved.push({ id: record.id, name: record.name, location: record.location });
    continue;
  }

  record.latitude = Number(coordinates.latitude.toFixed(6));
  record.longitude = Number(coordinates.longitude.toFixed(6));
  locationCache.set(record.location, coordinates);
  resolved += 1;
  if (WRITE_CHANGES) await save(records);
  console.log(`Resolved: ${record.name}`);
}

console.log(JSON.stringify({
  writeMode: WRITE_CHANGES,
  records: records.length,
  resolvedThisRun: resolved,
  withCoordinates: records.filter((record) =>
    isUsableCoordinate(Number(record.latitude), Number(record.longitude))).length,
  unresolved
}, null, 2));

if (!WRITE_CHANGES && resolved > 0) {
  console.log('Dry run only. Re-run with --write to update data/open-mics.json.');
}
