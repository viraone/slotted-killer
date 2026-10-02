// Reads the host's Google Sheet with the same service account the signup sync
// uses, so the sheet can be made private (nothing here needs it public).
import { parseSheet, type SheetRow } from "./lineup.ts";

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(): Promise<string> {
  const binary = atob(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"));
  const credentials = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  if (!credentials.client_email || !credentials.private_key) throw new Error("Google service-account configuration is incomplete");

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }))}`;
  const pem = String(credentials.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  const result = await response.json();
  if (!result.access_token) throw new Error("Google authentication returned no access token");
  return result.access_token;
}

let cache: { at: number; rows: SheetRow[] } | null = null;
const CACHE_MS = 30_000;

/** The sheet's rows, cached for 30 seconds so a busy Friday doesn't hit
 * Google's read quota. */
export async function readSheetRows(force = false): Promise<SheetRow[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const sheetId = requiredEnv("GOOGLE_SHEET_ID");
  const tab = Deno.env.get("LINEUP_SHEET_TAB") ?? "Intake & Contacts";
  const range = `'${tab}'!A1:H1000`;
  const token = await getGoogleAccessToken();
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Google Sheets read failed (${response.status})`);
  const body = await response.json();
  const rows = parseSheet(body.values ?? []);
  cache = { at: Date.now(), rows };
  return rows;
}
