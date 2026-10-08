/**
 * src/lib/sepa-prenotification-resume.ts — UNE pré-notification SEPA pour
 * toutes les commandes d'une famille.
 *
 * Octobre 2026, Nicolas : « dans le cas des prélèvements SEPA qui règlent
 * plusieurs commandes, la pré-notification envoie un mail par commande ; il
 * faudrait un résumé global — les DUHEM ont 8 pré-notifications ». Chaque
 * commande programmée en SEPA déclenchait son propre email.
 *
 * Le résumé rassemble : le calendrier (montant total prélevé à chaque date),
 * le détail par commande (prestations, montant), le total et les mandats.
 *
 * Module pur, testé seul (tests/unit/sepa-prenotification-resume.test.ts).
 */

export interface CommandePrenotif { id: string; items?: { activityTitle?: string }[] | null }
export interface EcheancePrenotif { commandeId: string; dateEcheance: string; montant: number; mandatId?: string | null; status?: string | null }

export interface ResumePrenotification {
  /** Une ligne par date : ce qui sera prélevé ce jour-là, toutes commandes confondues. */
  parDate: { date: string; montant: number; nbCommandes: number }[];
  /** Une ligne par commande : prestations et montant restant à prélever. */
  commandes: { id: string; prestations: string; montant: number; nbEcheances: number }[];
  total: number;
  mandats: string[];
  nbEcheances: number;
}

const c = (n: unknown) => Math.round((Number(n) || 0) * 100);

export function resumePrenotification(commandes: CommandePrenotif[], echeances: EcheancePrenotif[]): ResumePrenotification {
  const enAttente = echeances.filter((e) => (e.status ?? "pending") === "pending" && c(e.montant) > 0);
  const dates = new Map<string, { cts: number; cmds: Set<string> }>();
  for (const e of enAttente) {
    const d = String(e.dateEcheance || "").slice(0, 10);
    if (!dates.has(d)) dates.set(d, { cts: 0, cmds: new Set() });
    const x = dates.get(d)!;
    x.cts += c(e.montant);
    x.cmds.add(e.commandeId);
  }
  const parDate = [...dates.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, x]) => ({ date, montant: x.cts / 100, nbCommandes: x.cmds.size }));
  const lignesCommandes = commandes
    .map((cmd) => {
      const siennes = enAttente.filter((e) => e.commandeId === cmd.id);
      return {
        id: cmd.id,
        prestations: (cmd.items || []).map((i) => i?.activityTitle).filter(Boolean).join(", ") || "Commande",
        montant: siennes.reduce((s, e) => s + c(e.montant), 0) / 100,
        nbEcheances: siennes.length,
      };
    })
    .filter((x) => x.nbEcheances > 0);
  return {
    parDate,
    commandes: lignesCommandes,
    total: enAttente.reduce((s, e) => s + c(e.montant), 0) / 100,
    mandats: [...new Set(enAttente.map((e) => String(e.mandatId || "")).filter(Boolean))],
    nbEcheances: enAttente.length,
  };
}

/** Regroupe des commandes « à prévenir » par famille, pour un email par famille. */
export function grouperParFamille<T extends { id: string; familyId?: string | null; familyName?: string | null }>(commandes: T[]): { familyId: string; familyName: string; ids: string[] }[] {
  const m = new Map<string, { familyId: string; familyName: string; ids: string[] }>();
  for (const p of commandes) {
    const k = p.familyId || `sans-famille:${p.id}`;
    if (!m.has(k)) m.set(k, { familyId: p.familyId || "", familyName: p.familyName || "", ids: [] });
    m.get(k)!.ids.push(p.id);
  }
  return [...m.values()];
}
