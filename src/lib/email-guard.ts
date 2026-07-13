// ─────────────────────────────────────────────────────────────────────────
//  Garde-fou d'envoi d'emails — phase de préparation (avant mise en service)
// ─────────────────────────────────────────────────────────────────────────
// Les familles ont été importées avec leurs vrais emails, mais on n'est PAS
// prêt à leur écrire. Tant que le "mode restreint" est actif, SEULS les
// destinataires autorisés reçoivent des emails :
//   - les 3 emails admin
//   - le compte de test laserbayagon@gmail.com
//   - tout email ajouté dans la variable d'env EMAIL_ALLOWLIST
//     (séparés par des virgules — y mettre les emails des moniteurs)
//
// Pour ROUVRIR l'envoi à tout le monde le jour de la mise en service :
//   définir la variable Vercel  EMAIL_RESTRICTED_MODE = off
//
// Par défaut (variable absente), le mode restreint est ACTIF — sécurité maximale.

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];
const TEST_EMAILS = ["laserbayagon@gmail.com"];

const norm = (e: string) => (e || "").trim().toLowerCase();

// ── Override Firestore (interrupteur admin, effet immédiat sans redéploiement) ──
// settings/email.restricted (boolean) prend le pas sur EMAIL_RESTRICTED_MODE.
// Le cache mémoire ne persiste pas en serverless : chaque route appelle
// `await refreshEmailMode()` en tête pour lire la valeur à jour dans la requête.
let cached: { restricted: boolean | null; at: number } | null = null;
const CACHE_MS = 20_000;

export async function refreshEmailMode(): Promise<void> {
  if (cached && Date.now() - cached.at < CACHE_MS) return;
  let restricted: boolean | null = null;
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.collection("settings").doc("email").get();
    const d = snap.exists ? (snap.data() as any) : null;
    if (d && typeof d.restricted === "boolean") restricted = d.restricted;
  } catch {
    restricted = null; // erreur → fallback sur la variable d'env
  }
  cached = { restricted, at: Date.now() };
}

/** Le mode restreint est actif si le flag Firestore le dit, sinon selon EMAIL_RESTRICTED_MODE. */
export function isEmailRestricted(): boolean {
  if (cached && cached.restricted !== null) return cached.restricted;
  return norm(process.env.EMAIL_RESTRICTED_MODE || "on") !== "off";
}

/** Liste blanche : admins + compte test + emails supplémentaires (env EMAIL_ALLOWLIST). */
function allowlist(): Set<string> {
  const extra = (process.env.EMAIL_ALLOWLIST || "")
    .split(",").map(norm).filter(Boolean);
  return new Set([...ADMIN_EMAILS, ...TEST_EMAILS, ...extra].map(norm));
}

/**
 * Retourne true si on a le droit d'envoyer un email à ce destinataire.
 * - Mode restreint OFF  → toujours true.
 * - Mode restreint ON   → true seulement si le destinataire est dans la liste blanche.
 */
export function isRecipientAllowed(to: string | undefined | null): boolean {
  if (!isEmailRestricted()) return true;
  if (!to) return false;
  return allowlist().has(norm(to));
}

/** Message de log uniforme quand un envoi est bloqué par le garde-fou. */
export function blockedLog(to: string | undefined | null, context: string): string {
  return `[email-guard] MODE RESTREINT — envoi bloqué vers "${to}" (${context}). ` +
    `Autoriser via EMAIL_ALLOWLIST ou EMAIL_RESTRICTED_MODE=off.`;
}
