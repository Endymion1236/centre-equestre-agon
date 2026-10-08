/**
 * src/lib/carte-rattachement.ts — rattacher à une carte de séances des
 * séances déjà prises (carte vendue après coup).
 *
 * Octobre 2026, Nicolas : « j'ai inscrit Fred en cours particulier à 45 € ;
 * j'aimerais lui prendre une carte de 5 séances valable seulement pour les
 * cours particuliers, a posteriori — comment affecter les commandes prises
 * sur cette carte ? ».
 *
 * Mêmes règles que le montoir quand une carte apparaît après l'inscription
 * (montoir/seance-par-carte) :
 *   - seules les séances que la carte couvre (type de carte, cavalier ou
 *     famille, fin de validité) sont proposées ;
 *   - une séance dont la commande est encore vierge (rien reçu, pas de
 *     facture) passe sur la carte : la carte est débitée, la ligne quitte sa
 *     commande, et une commande vidée est annulée ;
 *   - une séance déjà réglée ou facturée reste à sa commande : la passer sur
 *     la carte ferait payer deux fois ; il faut un avoir ;
 *   - une séance déjà décomptée de cette carte n'est pas proposée ;
 *   - jamais plus de séances que la carte n'en a encore.
 *
 * Module pur, testé seul (tests/unit/carte-rattachement.test.ts).
 */
import { typeCarteCouvre } from "@/lib/cartes-seances";

export interface CarteRattachable {
  id: string;
  familyId?: string | null;
  childId?: string | null;
  familiale?: boolean;
  activityType?: string | null;
  remainingSessions?: number | null;
  dateFin?: string | null;
  history?: any[] | null;
}

export interface InfoCreneau { activityType?: string | null; formuleChoisie?: string | null; date?: string | null; startTime?: string | null; activityTitle?: string | null }

export interface SeanceCandidate {
  cle: string;
  paymentId: string;
  creneauId: string;
  childId: string;
  childName: string;
  date: string;
  startTime: string;
  titre: string;
  prixTTC: number;
  rattachable: boolean;
  motif?: string;
}

const commandeVierge = (p: any) =>
  p.status !== "paid" && !((Number(p.paidAmount) || 0) > 0.009) && !p.invoiceNumber;

const dejaSurLaCarte = (carte: CarteRattachable, creneauId: string, childName: string) =>
  (carte.history || []).some((h: any) => h?.creneauId === creneauId && !h.credit && !h.annule && h.childName === childName);

/** Les séances du cavalier (ou de la famille) que la carte pourrait reprendre. */
export function seancesCandidates(
  carte: CarteRattachable,
  commandes: any[],
  creneaux: Record<string, InfoCreneau>,
): SeanceCandidate[] {
  const sortie: SeanceCandidate[] = [];
  for (const p of commandes) {
    if (!p || p.status === "cancelled") continue;
    if (carte.familiale ? p.familyId !== carte.familyId : false) continue;
    (p.items || []).forEach((i: any, k: number) => {
      if (!i?.creneauId || !i.childId) return;
      if (!carte.familiale && i.childId !== carte.childId) return;
      const info: InfoCreneau = { activityType: i.activityType, date: i.date, startTime: i.startTime, activityTitle: i.activityTitle, ...(creneaux[i.creneauId] || {}) };
      if (!typeCarteCouvre(carte.activityType, info)) return;
      const childName = String(i.childName || "");
      if (dejaSurLaCarte(carte, i.creneauId, childName)) return;
      const date = String(info.date || "");
      let motif: string | undefined;
      if (carte.dateFin && date && date > carte.dateFin) motif = "après la fin de validité de la carte";
      else if (!commandeVierge(p)) motif = p.invoiceNumber ? `facture ${p.invoiceNumber} émise : il faut un avoir` : "déjà réglée : il faut un avoir";
      sortie.push({
        cle: `${p.id}:${k}`,
        paymentId: p.id, creneauId: i.creneauId, childId: i.childId, childName, date,
        startTime: String(info.startTime || ""), titre: String(i.activityTitle || info.activityTitle || "Séance"),
        prixTTC: Math.round((Number(i.priceTTC) || 0) * 100) / 100,
        rattachable: !motif, ...(motif ? { motif } : {}),
      });
    });
  }
  return sortie.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

export interface PlanRattachement {
  seances: SeanceCandidate[];
  /** Commandes à corriger : lignes restantes, ou annulation si plus rien. */
  ajustements: { paymentId: string; annuler: boolean; items: any[]; totalTTC: number }[];
  erreur?: string;
}

/** Ce que le rattachement des séances choisies va écrire, avant toute écriture. */
export function planRattachement(
  carte: CarteRattachable,
  commandes: any[],
  candidates: SeanceCandidate[],
  cles: string[],
): PlanRattachement {
  const choisies = candidates.filter((c) => c.rattachable && cles.includes(c.cle));
  const restantes = Number(carte.remainingSessions) || 0;
  if (choisies.length > restantes) {
    return { seances: [], ajustements: [], erreur: `La carte n'a plus que ${restantes} séance${restantes > 1 ? "s" : ""}.` };
  }
  const parCommande = new Map<string, Set<number>>();
  for (const c of choisies) {
    const k = Number(c.cle.split(":").pop());
    if (!parCommande.has(c.paymentId)) parCommande.set(c.paymentId, new Set());
    parCommande.get(c.paymentId)!.add(k);
  }
  const ajustements = [...parCommande.entries()].map(([paymentId, indices]) => {
    const p = commandes.find((x) => x.id === paymentId);
    const items = (p?.items || []).filter((_: any, k: number) => !indices.has(k));
    const totalTTC = Math.round(items.reduce((s: number, i: any) => s + (Number(i.priceTTC) || 0), 0) * 100) / 100;
    return { paymentId, annuler: items.length === 0, items, totalTTC };
  });
  return { seances: choisies, ajustements };
}

/** Ligne d'historique de la carte pour une séance reprise après coup. */
export function ligneHistoriqueRattachement(s: SeanceCandidate, maintenant: string) {
  return {
    date: maintenant,
    activityTitle: s.titre,
    creneauId: s.creneauId, creneauDate: s.date, startTime: s.startTime,
    childName: s.childName,
    rattachement: true,
  };
}
