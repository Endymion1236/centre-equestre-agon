/**
 * src/lib/superpdp-regles.ts — lecture des réponses de Super PDP (plateforme agréée).
 *
 * Novembre 2026 : essai de Super PDP en bac à sable, pour récupérer les
 * factures fournisseurs par API (Cecurity, la plateforme du cabinet, ne
 * répond pas) et émettre nos factures. Ce module ne parle à personne : il
 * met en forme ce que l'API renvoie. Pur, sans import, testé
 * (tests/unit/superpdp-regles.test.ts).
 */

export type RoleSuperPdp = "club" | "fournisseur";

export interface FactureResumee {
  id: number;
  sens: "reçue" | "envoyée";
  numero: string;
  date: string;
  vendeur: string;
  acheteur: string;
  ttc: number | null;
  statut: string;
}

const nombre = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Dernier statut connu d'une facture (événements triés par id). */
export function dernierStatut(events: { id?: number; status_code?: string; status_text?: string }[] | undefined): string {
  const liste = [...(events || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  const e = liste[liste.length - 1];
  return e ? (e.status_text || e.status_code || "—") : "en cours de traitement";
}

/** Une facture de l'API, telle qu'on l'affiche. */
export function resumerFacture(f: any): FactureResumee {
  const en = f?.en_invoice || {};
  return {
    id: Number(f?.id) || 0,
    sens: f?.direction === "in" ? "reçue" : "envoyée",
    numero: String(en.number || f?.external_id || "—"),
    date: String(en.issue_date || (f?.created_at || "").slice(0, 10) || "—"),
    vendeur: String(en.seller?.name || "—"),
    acheteur: String(en.buyer?.name || "—"),
    ttc: nombre(en.totals?.total_with_vat ?? en.totals?.amount_due_for_payment),
    statut: dernierStatut(f?.events),
  };
}

/** Variables d'environnement attendues pour un rôle. */
export function variablesDuRole(role: RoleSuperPdp): { id: string; secret: string } {
  return role === "club"
    ? { id: "SUPERPDP_CLIENT_ID", secret: "SUPERPDP_CLIENT_SECRET" }
    : { id: "SUPERPDP_FOURNISSEUR_CLIENT_ID", secret: "SUPERPDP_FOURNISSEUR_CLIENT_SECRET" };
}
