import { adminDb } from "@/lib/firebase-admin";

// ═══════════════════════════════════════════════════════════════════
// Helper Gmail OAuth (lecture seule) pour l'assistant boîte de réception.
// - Client ID/secret : variables d'env (GMAIL_OAUTH_CLIENT_ID / _SECRET).
// - Le refresh_token est stocké dans Firestore settings/gmail_oauth
//   (admin SDK, jamais exposé au client).
// ═══════════════════════════════════════════════════════════════════

const SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";
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

  // Adresse REELLEMENT connectee : on ne se fie jamais a ce que l'admin croit
  // avoir choisi dans le selecteur de compte Google. Un compte Google bati sur
  // une adresse non-Gmail (ex. une adresse Orange) s'authentifie sans probleme
  // mais n'a AUCUNE boite mail : l'API repond alors "Mail service not enabled".
  // On le detecte ici, a la connexion, plutot que de stocker une liaison morte.
  let email: string | null = null;
  let mailError: string | null = null;
  try {
    const p = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    if (p.ok) {
      email = (await p.json())?.emailAddress || null;
    } else {
      const txt = await p.text();
      mailError = /mail service not enabled/i.test(txt)
        ? "Ce compte Google n'a pas de boite Gmail. Reconnecte-toi en choisissant un compte @gmail.com."
        : `Profil Gmail illisible (${p.status})`;
    }
  } catch {
    mailError = "Profil Gmail illisible";
  }

  await adminDb
    .collection("settings")
    .doc("gmail_oauth")
    .set(
      {
        email,
        mailError,
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

/** Adresse reellement connectee + erreur eventuelle detectee a la connexion. */
export async function gmailAccount(): Promise<{ email: string | null; mailError: string | null }> {
  try {
    const snap = await adminDb.collection("settings").doc("gmail_oauth").get();
    const d = snap.exists ? (snap.data() as any) : null;
    return { email: d?.email || null, mailError: d?.mailError || null };
  } catch {
    return { email: null, mailError: null };
  }
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
  threadId: string;
  messageId: string; // header Message-ID (pour In-Reply-To)
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  /** Pièce jointe audio (message vocal du répondeur), si présente. */
  audioAttachmentId?: string;
  audioFilename?: string;
}

/**
 * Cherche une pièce jointe audio dans le payload d'un message.
 * Le payload est déjà chargé (format=full) : aucun appel réseau supplémentaire.
 */
function findAudioAttachment(
  payload: any
): { attachmentId: string; filename: string } | null {
  const walk = (part: any): { attachmentId: string; filename: string } | null => {
    if (!part) return null;
    const mime = (part.mimeType || "").toLowerCase();
    const name = part.filename || "";
    const isAudio = mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(name);
    if (isAudio && part.body?.attachmentId) {
      return { attachmentId: part.body.attachmentId, filename: name || "message.mp3" };
    }
    if (part.parts) {
      for (const p of part.parts) {
        const r = walk(p);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(payload);
}

/**
 * Télécharge une pièce jointe et renvoie ses octets.
 * Gmail renvoie du base64url — d'où la conversion avant décodage.
 */
export async function gmailGetAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`gmail attachment ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data?.data) throw new Error("Pièce jointe vide");
  return Buffer.from(String(data.data).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function gmailListRecent(max = 12): Promise<GmailMessage[]> {
  const token = await getAccessToken();
  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${max}&q=${encodeURIComponent("in:inbox -category:promotions -category:social")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    // Google explique TOUJOURS la cause dans le corps de la réponse
    // (scope manquant, requête invalide, compte sans Gmail…). Sans ça,
    // un "400" seul est indiagnosticable.
    throw new Error(`gmail list ${listRes.status}: ${await listRes.text()}`);
  }
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
      const audio = findAudioAttachment(m.payload);
      messages.push({
        id,
        threadId: m.threadId || "",
        messageId: headerVal(headers, "Message-ID"),
        from,
        subject: headerVal(headers, "Subject"),
        date: headerVal(headers, "Date"),
        snippet: m.snippet || "",
        body: extractBody(m.payload),
        audioAttachmentId: audio?.attachmentId,
        audioFilename: audio?.filename,
      });
    } catch {
      /* skip */
    }
  }
  return messages;
}

// Encodage RFC2047 (accents dans l'objet).
/**
 * Lit un FIL complet (thread Gmail) dans l'ordre chronologique.
 * Sert à donner le contexte de la conversation à l'assistant boîte :
 * quand une famille re-répond avec les infos demandées, l'analyse voit
 * la demande initiale ET les réponses déjà envoyées.
 */
export async function gmailGetThread(
  threadId: string
): Promise<{ from: string; date: string; body: string }[]> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`gmail thread ${res.status}`);
  const data = await res.json();
  const msgs = (data.messages || []).map((m: any) => ({
    from: headerVal(m.payload?.headers, "From"),
    date: headerVal(m.payload?.headers, "Date"),
    body: extractBody(m.payload),
    internalDate: Number(m.internalDate || 0),
  }));
  msgs.sort((a: any, b: any) => a.internalDate - b.internalDate);
  return msgs.map(({ from, date, body }: any) => ({ from, date, body }));
}

function rfc2047(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s || "", "utf8").toString("base64")}?=`;
}
function wrap76(b64: string): string {
  return (b64.match(/.{1,76}/g) || []).join("\r\n");
}

/**
 * Envoie une réponse depuis la boîte connectée (ceagon50@gmail.com).
 * Toujours déclenché par un clic humain — jamais automatique.
 */
export async function gmailSend(opts: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string; // header Message-ID d'origine (pour rester dans le fil)
}): Promise<void> {
  const token = await getAccessToken();
  const headers = [
    `To: ${opts.to}`,
    `Subject: ${rfc2047(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (opts.inReplyTo) {
    headers.push(`In-Reply-To: ${opts.inReplyTo}`);
    headers.push(`References: ${opts.inReplyTo}`);
  }
  const bodyB64 = wrap76(Buffer.from(opts.body || "", "utf8").toString("base64"));
  const mime = headers.join("\r\n") + "\r\n\r\n" + bodyB64;
  const raw = Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(opts.threadId ? { raw, threadId: opts.threadId } : { raw }),
  });
  if (!res.ok) throw new Error(`gmail send ${res.status}: ${await res.text()}`);
}

/** Met un message à la corbeille (nécessite le scope gmail.modify). */
export async function gmailTrash(id: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}/messages/${id}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`gmail trash ${res.status}: ${await res.text()}`);
}
