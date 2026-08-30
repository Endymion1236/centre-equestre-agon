/**
 * Serveur-side email template loader
 *
 * Charge les templates depuis Firestore (settings/emailTemplates)
 * avec fallback sur les templates par défaut définis ici.
 *
 * Les variables {parentName}, {montant}, etc. sont remplacées à l'exécution.
 *
 * ── Pourquoi ce fichier partage désormais l'habillage ─────────────────────
 *
 * Il portait sa propre copie du wrapper, des couleurs et des encadrés — une
 * troisième après celle de `email-templates.ts` et celle de la page
 * d'administration. Les trois avaient divergé, et comme ce sont ces
 * gabarits-ci qui partent sur les paiements (webhook CAWL, retour de
 * paiement, relances), c'était la version la plus vue qui était la moins
 * soignée. L'habillage vient maintenant de `email-templates.ts`, qui reste
 * la seule définition du design.
 */

import { adminDb } from "@/lib/firebase-admin";
import { renderDerouleStage } from "@/lib/stage-deroule";
import { emailLayout, emailParagraphe as P, emailFidelite } from "@/lib/email-templates";
import { DEFAULT_TEMPLATES } from "@/lib/email-templates-defauts";


/**
 * Clés de variables qui portent un montant.
 *
 * Elles arrivent des appelants en « 82.50 » (toFixed) et repartaient telles
 * quelles dans le message : un point décimal et pas d'espace avant l'euro,
 * l'écriture d'un tableur, pas celle d'une facture française. Formatées ici
 * une bonne fois, les gabarits personnalisés enregistrés dans Firestore en
 * profitent aussi sans être réécrits.
 */
const CLES_MONTANT = new Set([
  "montant", "acompte", "solde", "total", "totalTTC", "prix", "montantAvoir", "montantRegle",
]);

function formaterMontant(valeur: string | number): string {
  const n = typeof valeur === "number" ? valeur : Number(String(valeur).replace(",", "."));
  if (!Number.isFinite(n)) return String(valeur);
  return n.toFixed(2).replace(".", ",");
}

// ── Cache pour éviter de relire Firestore à chaque appel ──
let cachedTemplates: Record<string, { subject: string; body: string }> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTemplates(): Promise<Record<string, { subject: string; body: string }>> {
  const now = Date.now();
  if (cachedTemplates && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedTemplates;
  }

  try {
    const snap = await adminDb.collection("settings").doc("emailTemplates").get();
    if (snap.exists) {
      const saved = snap.data() as Record<string, any>;
      const merged = { ...DEFAULT_TEMPLATES };
      for (const key of Object.keys(merged)) {
        if (saved[key]?.subject) merged[key].subject = saved[key].subject;
        if (saved[key]?.body) merged[key].body = saved[key].body;
      }
      // Templates custom ajoutés dans l'admin mais pas dans les défauts
      for (const key of Object.keys(saved)) {
        if (!merged[key] && saved[key]?.subject && saved[key]?.body) {
          merged[key] = { subject: saved[key].subject, body: saved[key].body };
        }
      }
      cachedTemplates = merged;
    } else {
      cachedTemplates = { ...DEFAULT_TEMPLATES };
    }
  } catch (e) {
    console.warn("⚠️ Impossible de charger les templates email depuis Firestore, fallback sur défauts:", e);
    cachedTemplates = { ...DEFAULT_TEMPLATES };
  }

  cacheTimestamp = now;
  return cachedTemplates!;
}

/**
 * Charge un template email depuis Firestore (avec fallback sur les défauts)
 * et remplace les variables {xxx} par les valeurs fournies.
 * 
 * @returns { subject, html } — le HTML est wrappé dans le design du club
 */
export async function loadTemplate(
  key: string,
  variables: Record<string, string | number> = {},
  /**
   * Bloc ajouté à la fin du corps, AVANT l'habillage — typiquement les
   * conditions d'annulation. Les appelants le concaténaient au HTML déjà
   * enveloppé : l'encadré se retrouvait sous le pied de page, hors de la
   * carte, dans une largeur qui ne correspondait à rien. Passé ici, il est
   * dans le message.
   */
  supplement = "",
): Promise<{ subject: string; html: string }> {
  const templates = await getTemplates();
  const template = templates[key] || DEFAULT_TEMPLATES[key];

  if (!template) {
    console.warn(`⚠️ Template "${key}" introuvable, email générique`);
    return {
      subject: "Centre Équestre d'Agon-Coutainville",
      html: emailLayout(P("Bonjour,") + P("Merci pour votre confiance.")),
    };
  }

  // Remplacer les {variables} dans le sujet et le body
  let subject = template.subject;
  let body = template.body;

  // {deroule} : bloc « Comment se déroule la séance ». Résolu ici pour que
  // TOUS les chemins d'envoi (webhook CAWL, status, relances) en bénéficient
  // sans avoir à le passer explicitement. Vide si le réglage n'est pas saisi.
  if (body.includes("{deroule}") && variables.deroule === undefined) {
    let bloc = "";
    try {
      if (adminDb) {
        const snap = await adminDb.collection("settings").doc("stageDeroule").get();
        bloc = renderDerouleStage(snap.exists ? (snap.data() as any) : null);
      }
    } catch {
      bloc = ""; // un réglage illisible ne doit pas empêcher l'email de partir
    }
    body = body.replace(/\{deroule\}/g, bloc);
  }

  // {fidelite} : points gagnés sur ce règlement. Résolu ici, comme {deroule},
  // pour que tous les chemins d'envoi en bénéficient. Le bloc reste vide si
  // le programme est désactivé ou si aucun point n'a été crédité — un email
  // ne doit pas annoncer un avantage qui n'existe pas.
  if (body.includes("{fidelite}")) {
    let bloc = "";
    const familyId = variables.familyId ? String(variables.familyId) : "";
    const base = Number(String(variables.montant ?? "").replace(",", "."));
    if (familyId && Number.isFinite(base) && base > 0) {
      try {
        const reglages = await adminDb.collection("settings").doc("fidelite").get();
        const d = reglages.exists ? (reglages.data() as Record<string, unknown>) : null;
        if (d && d.enabled !== false) {
          const taux = Number(d.taux) || 100;
          const minPoints = Number(d.minPoints) || 500;
          // Même règle qu'à l'attribution (lib/fidelite) : 1 point par euro.
          const gagnes = Math.floor(base);
          const compte = await adminDb.collection("fidelite").doc(familyId).get();
          // Le solde est lu APRÈS l'attribution : les appelants créditent les
          // points avant d'envoyer l'email. S'il ne l'a pas encore été, on
          // annonce au moins les points de ce règlement.
          const total = Math.max(Number((compte.data() || {}).points) || 0, gagnes);
          bloc = emailFidelite(gagnes, total, taux, minPoints);
        }
      } catch {
        bloc = ""; // la fidélité ne doit jamais empêcher un email de partir
      }
    }
    body = body.replace(/\{fidelite\}/g, bloc);
  }

  // {dateSolde} : une date réelle vaut mieux que « 7 jours avant le stage »,
  // qui oblige la famille à compter. Quand l'appelant ne la connaît pas, on
  // retombe sur l'ancienne formulation plutôt que d'afficher un trou.
  if (body.includes("{dateSolde}") && !variables.dateSolde) {
    body = body.replace(/Solde, avant le \{dateSolde\}/g, "Solde restant");
  }

  for (const [varKey, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${varKey}\\}`, "g");
    const strValue = CLES_MONTANT.has(varKey) ? formaterMontant(value) : String(value);
    subject = subject.replace(regex, strValue);
    body = body.replace(regex, strValue);
  }

  return {
    subject,
    html: emailLayout(body + supplement),
  };
}

/**
 * Invalide le cache des templates (utile après sauvegarde dans l'admin)
 */
export function invalidateTemplateCache() {
  cachedTemplates = null;
  cacheTimestamp = 0;
}
