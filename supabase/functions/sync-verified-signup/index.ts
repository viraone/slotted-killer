type SyncJob = {
  signup_id: number;
  sheet_synced_at: string | null;
  email_sent_at: string | null;
};

type Signup = {
  id: number;
  name: string;
  email: string;
  instagram: string | null;
  slot_type: string | null;
  created_at: string;
  is_verified: boolean;
};

const jsonHeaders = { "content-type": "application/json" };

export function buildSheetRow(signup: Signup): string[] {
  return [
    signup.name,
    "",
    "",
    signup.email,
    signup.instagram ?? "",
    signup.slot_type ?? "",
    signup.created_at,
  ];
}

export function buildNotification(signup: Signup) {
  return {
    subject: `New Verified Signup: ${signup.name}`,
    text: [
      "A new comedian just verified their email!",
      "",
      `- Name: ${signup.name}`,
      `- Email: ${signup.email}`,
      `- Instagram: ${signup.instagram ?? ""}`,
      `- Slot Type: ${signup.slot_type ?? ""}`,
    ].join("\n"),
  };
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

async function appendSheetRow(signup: Signup): Promise<void> {
  const sheetId = requiredEnv("GOOGLE_SHEET_ID");
  const range = requiredEnv("GOOGLE_SHEET_RANGE");
  const accessToken = await getGoogleAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ majorDimension: "ROWS", values: [buildSheetRow(signup)] }),
  });
  if (!response.ok) throw new Error(`Google Sheets append failed (${response.status})`);
}

async function sendNotification(signup: Signup): Promise<void> {
  const notification = buildNotification(signup);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "idempotency-key": `verified-signup-${signup.id}`,
    },
    body: JSON.stringify({
      from: requiredEnv("SIGNUP_NOTIFICATION_FROM"),
      to: [requiredEnv("SIGNUP_NOTIFICATION_TO")],
      subject: notification.subject,
      text: notification.text,
    }),
  });
  if (!response.ok) throw new Error(`Notification delivery failed (${response.status})`);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown sync failure";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function supabaseHeaders(serviceRoleKey: string) {
  return {
    ...jsonHeaders,
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(serviceRoleKey), ...(init.headers ?? {}) },
  });
}

async function updateJob(signupId: number, values: Record<string, unknown>): Promise<void> {
  const response = await supabaseRequest(`signup_sheet_sync?signup_id=eq.${signupId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to update sync state (${response.status})`);
}

async function loadSignup(signupId: number): Promise<Signup | null> {
  const response = await supabaseRequest(
    `signups?id=eq.${signupId}&select=id,name,email,instagram,slot_type,created_at,is_verified&limit=1`,
  );
  if (!response.ok) throw new Error(`Unable to load canonical signup (${response.status})`);
  const rows = await response.json();
  return rows[0] ?? null;
}

async function claimJobs(limit: number): Promise<SyncJob[]> {
  const response = await supabaseRequest("rpc/claim_signup_sheet_sync_jobs", {
    method: "POST",
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!response.ok) throw new Error(`Unable to claim sync jobs (${response.status})`);
  return response.json();
}

async function processJob(job: SyncJob): Promise<void> {
  try {
    const signup = await loadSignup(job.signup_id);
    if (!signup || signup.is_verified !== true) {
      throw new Error("Canonical verified signup was not found");
    }

    let sheetSyncedAt = job.sheet_synced_at;
    let emailSentAt = job.email_sent_at;

    if (!sheetSyncedAt) {
      await appendSheetRow(signup);
      sheetSyncedAt = new Date().toISOString();
      await updateJob(job.signup_id, { sheet_synced_at: sheetSyncedAt });
    }

    if (!emailSentAt) {
      await sendNotification(signup);
      emailSentAt = new Date().toISOString();
      await updateJob(job.signup_id, { email_sent_at: emailSentAt });
    }

    await updateJob(job.signup_id, {
      status: "completed",
      last_error: null,
      sheet_synced_at: sheetSyncedAt,
      email_sent_at: emailSentAt,
    });
  } catch (error) {
    try {
      await updateJob(job.signup_id, { status: "retry", last_error: sanitizeError(error) });
    } catch (stateError) {
      console.error("Unable to persist sanitized sync failure", {
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
    for (const job of jobs) await processJob(job);
    return new Response(JSON.stringify({ claimed: jobs.length }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("Verified signup sync invocation failed", {
      category: "SYNC_INVOCATION_FAILED",
      message: sanitizeError(error),
    });
    return new Response(JSON.stringify({ error: "Sync invocation failed" }), { status: 500, headers: jsonHeaders });
  }
}

if (import.meta.main) Deno.serve(handler);
