#!/usr/bin/env node

/**
 * Pull "Add Your Mic" submissions out of Supabase as paste-ready
 * data/open-mics.json records.
 *
 * The normal way to review a submission is the admin panel at
 * https://stagetimepnw.com/?admin=1 — approving there publishes the mic to
 * public.published_open_mics and it is live in seconds. This script is the
 * offline fallback, and the way to fold a published record into the JSON file
 * so it lives in git (after which the panel flags the published row as safe to
 * hide, since the file wins on an id collision).
 *
 * Needs the project's service role key (submissions are not readable with the
 * anon key). Put it in .env as SUPABASE_SERVICE_ROLE_KEY=... or pass it in the
 * environment. Never commit it.
 *
 *   node scripts/pull-open-mic-submissions.mjs                # new submissions, summary + records
 *   node scripts/pull-open-mic-submissions.mjs --json         # records only, as a JSON array
 *   node scripts/pull-open-mic-submissions.mjs --status all   # new | added | rejected | duplicate | all
 *   node scripts/pull-open-mic-submissions.mjs --mark-added 3,4
 *   node scripts/pull-open-mic-submissions.mjs --mark-rejected 5
 *
 * After pasting a record into data/open-mics.json run
 *   node scripts/geocode-open-mics.mjs --write
 * to fill in latitude/longitude.
 */

import { readFile } from 'node:fs/promises';

const DEFAULT_SUPABASE_URL = 'https://ldodkbdzljfpbnzrpxpu.supabase.co';
const ENV_PATH = new URL('../.env', import.meta.url);
const TABLE = 'open_mic_submissions';

async function loadDotEnv() {
  let text;
  try {
    text = await readFile(ENV_PATH, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(argv) {
  const args = { status: 'new', json: false, markAdded: [], markRejected: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--status') args.status = String(argv[++i] || 'new').toLowerCase();
    else if (arg === '--mark-added') args.markAdded = parseIds(argv[++i]);
    else if (arg === '--mark-rejected') args.markRejected = parseIds(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/pull-open-mic-submissions.mjs [--status new|added|rejected|duplicate|all] [--json] [--mark-added ids] [--mark-rejected ids]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseIds(value) {
  const ids = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Expected a comma-separated list of submission ids, e.g. --mark-added 3,4');
  }
  return ids;
}

async function supabaseRequest(baseUrl, key, path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${init.method || 'GET'} ${path} failed: HTTP ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function markStatus(baseUrl, key, ids, status) {
  const updated = await supabaseRequest(
    baseUrl,
    key,
    `${TABLE}?id=in.(${ids.join(',')})`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, reviewed_at: new Date().toISOString() })
    }
  );
  console.log(`Marked ${updated.length} submission(s) as ${status}: ${updated.map((row) => `#${row.id} ${row.mic_name}`).join(', ') || 'none'}`);
}

function formatSummary(row) {
  const lines = [
    `#${row.id} · ${row.mic_name}${row.venue ? ` @ ${row.venue}` : ''} · ${row.status}`,
    `   ${row.location}`,
    `   ${row.recurrence_text || (row.days || []).join(', ') || 'days not set'} · signup ${row.signup_time || '—'} · start ${row.start_time || '—'}${row.end_time ? ` · ends ${row.end_time}` : ''}`,
    `   ${[row.open_mic_type, row.age_requirement, row.price, row.host ? `host: ${row.host}` : ''].filter(Boolean).join(' · ')}`,
    `   from ${row.submitter_name} <${row.submitter_email}>${row.submitter_role ? ` (${row.submitter_role})` : ''}${row.submitter_instagram ? ` ${row.submitter_instagram}` : ''} on ${new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
  ];
  lines.push(row.notified_at
    ? `   emailed ${new Date(row.notified_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
    : `   email not sent${row.notify_error ? `: ${row.notify_error}` : ''}`);
  if (row.flyer_url) lines.push(`   flyer: ${row.flyer_url}`);
  if (row.submitter_notes) lines.push(`   notes: ${row.submitter_notes.replace(/\s*\n+\s*/g, ' / ')}`);
  return lines.join('\n');
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env (never commit it) or pass it in the environment.');
  }

  if (args.markAdded.length) await markStatus(baseUrl, key, args.markAdded, 'added');
  if (args.markRejected.length) await markStatus(baseUrl, key, args.markRejected, 'rejected');
  if (args.markAdded.length || args.markRejected.length) return;

  const filter = args.status === 'all' ? '' : `&status=eq.${encodeURIComponent(args.status)}`;
  const rows = await supabaseRequest(baseUrl, key, `${TABLE}?select=*&order=created_at.asc${filter}`);

  if (args.json) {
    console.log(JSON.stringify(rows.map((row) => row.record), null, 2));
    return;
  }

  if (!rows.length) {
    console.log(`No ${args.status === 'all' ? '' : `${args.status} `}submissions.`);
    return;
  }

  console.log(`${rows.length} ${args.status === 'all' ? '' : `${args.status} `}submission(s)\n`);
  for (const row of rows) {
    console.log(formatSummary(row));
    console.log('\n' + JSON.stringify(row.record, null, 2) + '\n');
  }
  console.log('Paste the record(s) into data/open-mics.json, then run: node scripts/geocode-open-mics.mjs --write');
  console.log(`Mark as handled with: node scripts/pull-open-mic-submissions.mjs --mark-added ${rows.map((row) => row.id).join(',')}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
