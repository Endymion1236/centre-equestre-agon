import { adminDb } from "@/lib/firebase-admin";

// ═══════════════════════════════════════════════════════════════════
// Helper Gmail OAuth (lecture seule) pour l'assistant boîte de réception.
// - Client ID/secret : variables d'env (GMAIL_OAUTH_CLIENT_ID / _SECRET).
// - Le refresh_token est stocké dans Firestore settings/gmail_oauth
//   (admin SDK, jamais exposé au client).
// ═══════════════════════════════════════════════════════════════════

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
  return `${base.replace(/\/$/, "")}/api/auth/gmail/callback`;
}

export function gmailConfigured(): boolean {
  return !!(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET);
}

export function gmailAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_OAUTH_CLIENT_ID || "",
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // pour obtenir un refresh_token
    prompt: "consent", // force la remise d'un refresh_token
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function gmailExchangeCode(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET || "",
      redirect_uri: gmailRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  const t = await res.json();
  await adminDb
    .collection("settings")
    .doc("gmail_oauth")
    .set(
      {
        refreshToken: t.refresh_token || null,
        accessToken: t.access_token || null,
        expiresAt: Date.now() + (t.expires_in ? t.expires_in * 1000 : 0),
        connectedAt: Date.now(),
      },
      { merge: true }
    );
}

async function getAccessToken(): Promise<string> {
  const snap = await adminDb.collection("settings").doc("gmail_oauth").get();
  const d = snap.exists ? (snap.data() as any) : null;
  if (!d || !d.refreshToken) throw new Error("Gmail non connecté");
  // Token encore valide (marge 60 s) ?
  if (d.accessToken && d.expiresAt && Date.now() < d.expiresAt - 60_000) {
    return d.accessToken;
  }
  // Rafraîchir
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: d.refreshToken,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`refresh ${res.status}: ${await res.text()}`);
  const t = await res.json();
  const accessToken = t.access_token;
  await adminDb
    .collection("settings")
    .doc("gmail_oauth")
    .set(
      { accessToken, expiresAt: Date.now() + (t.expires_in ? t.expires_in * 1000 : 0) },
      { merge: true }
    );
  return accessToken;
}

export async function gmailIsConnected(): Promise<boolean> {
  try {
    const snap = await adminDb.collection("settings").doc("gmail_oauth").get();
    return !!(snap.exists && (snap.data() as any).refreshToken);
  } catch {
    return false;
  }
}

function headerVal(headers: any[], name: string): string {
  const h = (headers || []).find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function decodeB64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// Extrait le corps texte d'un message Gmail (préfère text/plain, sinon strip HTML).
function extractBody(payload: any): string {
  if (!payload) return "";
  const walk = (part: any): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) return decodeB64Url(part.body.data);
    if (part.parts) {
      for (const p of part.parts) {
        const r = walk(p);
        if (r) return r;
      }
    }
    return "";
  };
  let txt = walk(payload);
  if (!txt) {
    // fallback : html strippé
    const html = (function walkHtml(part: any): string {
      if (!part) return "";
      if (part.mimeType === "text/html" && part.body?.data) return decodeB64Url(part.body.data);
      if (part.parts) for (const p of part.parts) { const r = walkHtml(p); if (r) return r; }
      return "";
    })(payload);
    txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return txt.slice(0, 6000);
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export async function gmailListRecent(max = 12): Promise<GmailMessage[]> {
  const token = await getAccessToken();
  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${max}&q=${encodeURIComponent("in:inbox -category:promotions -category:social")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new Error(`gmail list ${listRes.status}`);
  const list = await listRes.json();
  const ids: string[] = (list.messages || []).map((m: any) => m.id);

  const messages: GmailMessage[] = [];
  for (const id of ids) {
    try {
      const mRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mRes.ok) continue;
      const m = await mRes.json();
      const headers = m.payload?.headers || [];
      const fromRaw = headerVal(headers, "From");
      // "Nom <email>" → on garde l'email si présent
      const emailMatch = fromRaw.match(/<([^>]+)>/);
      const from = emailMatch ? emailMatch[1] : fromRaw;
      messages.push({
        id,
        from,
        subject: headerVal(headers, "Subject"),
        date: headerVal(headers, "Date"),
        snippet: m.snippet || "",
        body: extractBody(m.payload),
      });
    } catch {
      /* skip */
    }
  }
  return messages;
}
