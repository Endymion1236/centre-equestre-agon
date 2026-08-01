// ─────────────────────────────────────────────────────────────────────────
//  Garde-fou d'envoi d'emails — phase de préparation (avant mise en service)
// ─────────────────────────────────────────────────────────────────────────
// Les familles ont été importées avec leurs vrais emails, mais on n'est PAS
// prêt à leur écrire. Tant que le "mode restreint" est actif, SEULS les
// destinataires autorisés reçoivent des emails :
//   - les 3 emails admin
//   - le compte de test laserbayagon@gmail.com
//   - les emails des FICHES MONITEURS actives (Paramètres > Moniteurs) —
//     même source que le récap quotidien, whitelist automatique
//   - tout email ajouté dans la variable d'env EMAIL_ALLOWLIST
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
let cached: { restricted: boolean | null; staff: string[]; at: number } | null = null;
const CACHE_MS = 20_000;

export async function refreshEmailMode(): Promise<void> {
  if (cached && Date.now() - cached.at < CACHE_MS) return;
  let restricted: boolean | null = null;
  let staff: string[] = [];
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.collection("settings").doc("email").get();
    const d = snap.exists ? (snap.data() as any) : null;
    if (d && typeof d.restricted === "boolean") restricted = d.restricted;

    // Emails des fiches moniteurs ACTIVES : whitelist automatiquement.
    // Meme source que le recap quotidien (daily-notifications) — par
    // construction, une monitrice qui recoit son planning est autorisee a
    // le recevoir. Deux listes separees auraient fini par diverger : fiche
    // ajoutee, recap envoye… et bloque par le garde-fou.
    const monSnap = await adminDb.collection("moniteurs").where("status", "==", "active").get();
    staff = monSnap.docs
      .map((doc) => norm((doc.data() as any).email))
      .filter(Boolean);
  } catch {
    restricted = null; // erreur → fallback sur la variable d'env
    staff = [];        // erreur → aucune fiche whitelistee (fail-safe)
  }
  cached = { restricted, staff, at: Date.now() };
}

/** Le mode restreint est actif si le flag Firestore le dit, sinon selon EMAIL_RESTRICTED_MODE. */
export function isEmailRestricted(): boolean {
  // FAIL-SAFE : si refreshEmailMode() n'a jamais tourné dans cette invocation
  // (route/lib qui a oublié de l'appeler), on est RESTREINT, quelle que soit
  // la variable d'env. Une route ne peut JAMAIS écrire aux familles sans
  // avoir explicitement lu le mode à jour. (Incident du 15/07/2026 : la lib
  // satisfaction n'appelait pas refreshEmailMode et retombait sur l'env.)
  if (!cached) return true;
  if (cached.restricted !== null) return cached.restricted;
  return norm(process.env.EMAIL_RESTRICTED_MODE || "on") !== "off";
}

/**
 * Liste blanche : admins + compte test + fiches moniteurs actives
 * + emails supplémentaires (env EMAIL_ALLOWLIST).
 * Les fiches viennent du cache rempli par refreshEmailMode() — si la route
 * a oublié de l'appeler, le fail-safe d'isEmailRestricted bloque de toute
 * façon tout envoi, staff compris.
 */
function allowlist(): Set<string> {
  const extra = (process.env.EMAIL_ALLOWLIST || "")
    .split(",").map(norm).filter(Boolean);
  const staff = cached?.staff || [];
  return new Set([...ADMIN_EMAILS, ...TEST_EMAILS, ...staff, ...extra].map(norm));
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
