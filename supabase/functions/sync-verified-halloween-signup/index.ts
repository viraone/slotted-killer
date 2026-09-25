// Appends each verified Halloween Costume Contest sign-up to its own Google
// Sheet (HALLOWEEN_GOOGLE_SHEET_ID). Same outbox pattern and Google service
// account as sync-verified-signup (the Friday sync), kept as a separate
// function so the Friday sync is never affected. Called every minute by the
// sync-verified-halloween-signups cron job.

type SyncJob = {
  signup_id: number;
  sheet_synced_at: string | null;
  created_at: string;
};

type HalloweenSignup = {
  id: number;
  name: string;
  email: string;
  instagram: string | null;
  costume: string;
  created_at: string;
  is_verified: boolean;
};

const jsonHeaders = { "content-type": "application/json" };
const SHEET_RANGE = "A:F";

const pacificTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
});

export function formatPacific(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : pacificTime.format(date);
}

// Columns: Submitted (Pacific), Verified (Pacific), Name, Email, Instagram, Costume
export function buildSheetRow(signup: HalloweenSignup, verifiedAt: string): string[] {
  const instagram = signup.instagram && signup.instagram !== "@n/a" ? signup.instagram : "";
  return [
    formatPacific(signup.created_at),
    formatPacific(verifiedAt),
    signup.name,
    signup.email,
    instagram,
    signup.costume,
  ];
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getGoogleAccessToken(): Promise<string> {
  const credentials = JSON.parse(decodeBase64Utf8(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64")));
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google service-account configuration is incomplete");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedJwt = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  const result = await response.json();
  if (!result.access_token) throw new Error("Google authentication returned no access token");
  return result.access_token;
}

async function appendSheetRow(accessToken: string, row: string[]): Promise<void> {
  const sheetId = requiredEnv("HALLOWEEN_GOOGLE_SHEET_ID");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ majorDimension: "ROWS", values: [row] }),
  });
  if (!response.ok) throw new Error(`Google Sheets append failed (${response.status})`);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown sync failure";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
}

async function updateJob(signupId: number, values: Record<string, unknown>): Promise<void> {
  const response = await supabaseRequest(`halloween_signup_sheet_sync?signup_id=eq.${signupId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to update sync state (${response.status})`);
}

async function loadSignup(signupId: number): Promise<HalloweenSignup | null> {
  const response = await supabaseRequest(
    `halloween_signups?id=eq.${signupId}&select=id,name,email,instagram,costume,created_at,is_verified&limit=1`,
  );
  if (!response.ok) throw new Error(`Unable to load Halloween signup (${response.status})`);
  const rows = await response.json();
  return rows[0] ?? null;
}

async function claimJobs(limit: number): Promise<SyncJob[]> {
  const response = await supabaseRequest("rpc/claim_halloween_signup_sheet_sync_jobs", {
    method: "POST",
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!response.ok) throw new Error(`Unable to claim sync jobs (${response.status})`);
  return response.json();
}

async function processJob(job: SyncJob, getToken: () => Promise<string>): Promise<void> {
  try {
    if (job.sheet_synced_at) {
      await updateJob(job.signup_id, { status: "completed", last_error: null });
      return;
    }

    const signup = await loadSignup(job.signup_id);
    if (!signup || signup.is_verified !== true) {
      throw new Error("Verified Halloween signup was not found");
    }

    await appendSheetRow(await getToken(), buildSheetRow(signup, job.created_at));
    await updateJob(job.signup_id, {
      status: "completed",
      last_error: null,
      sheet_synced_at: new Date().toISOString(),
    });
  } catch (error) {
    try {
      await updateJob(job.signup_id, { status: "retry", last_error: sanitizeError(error) });
    } catch (stateError) {
      console.error("Unable to persist sanitized Halloween sync failure", {
        category: "STATE_UPDATE_FAILED",
        signupId: job.signup_id,
        message: sanitizeError(stateError),
      });
    }
  }
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const expectedSecret = requiredEnv("SYNC_FUNCTION_SECRET");
  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const jobs = await claimJobs(10);
    let token: Promise<string> | null = null;
    const getToken = () => (token ??= getGoogleAccessToken());
    for (const job of jobs) await processJob(job, getToken);
    return new Response(JSON.stringify({ claimed: jobs.length }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("Halloween signup sync invocation failed", {
      category: "SYNC_INVOCATION_FAILED",
      message: sanitizeError(error),
    });
    return new Response(JSON.stringify({ error: "Sync invocation failed" }), { status: 500, headers: jsonHeaders });
  }
}

if (import.meta.main) Deno.serve(handler);
