/**
 * Annuler un débit de carte de séances posé par erreur.
 *
 * Cas d'origine (septembre 2026) : un créneau « Adultes G1 à G4 » apparu le
 * samedi — copie de celui du vendredi — a été clôturé au montoir. Tout
 * cavalier non marqué absent y compte comme présent : la carte familiale a
 * perdu une séance pour un cours qui n'a jamais eu lieu, et aucun écran ne
 * permettait de la rendre.
 *
 * Le débit n'est pas effacé : il est marqué annulé (motif, date) et une ligne
 * « +1 » est ajoutée, comme le fait déjà une désinscription. L'historique
 * reste lisible pour la famille, et le montoir, qui repère un créneau déjà
 * débité à sa ligne d'historique, ne redébitera pas si on reclôture.
 *
 * Module pur, partagé avec les tests.
 */

export interface LigneHistoriqueCarte {
  date?: string;
  activityTitle?: string;
  childName?: string;
  creneauId?: string;
  creneauDate?: string;
  credit?: boolean;
  presence?: string;
  annule?: boolean;
  [cle: string]: any;
}

export interface CarteADebiter {
  totalSessions?: number;
  usedSessions?: number;
  remainingSessions?: number;
  history?: LigneHistoriqueCarte[];
}

/** Ligne qui a réellement consommé une séance et peut encore être annulée. */
export function debitAnnulable(ligne: LigneHistoriqueCarte | undefined): boolean {
  return !!ligne && !ligne.credit && ligne.presence !== "absent" && !ligne.annule;
}

/** Séances réellement consommées d'après l'historique (hors absences, recrédits, débits annulés). */
export function seancesUtilisees(history: LigneHistoriqueCarte[] | undefined): number {
  return (history || []).filter(debitAnnulable).length;
}

export function annulerDebitCarte(
  carte: CarteADebiter,
  index: number,
  opts: { motif: string; maintenant: string },
):
  | { ok: true; maj: { remainingSessions: number; usedSessions: number; status: "active"; history: LigneHistoriqueCarte[] } }
  | { ok: false; raison: string } {
  const history = carte.history || [];
  const ligne = history[index];
  if (!ligne) return { ok: false, raison: "Ligne introuvable : la carte a changé, rechargez la page." };
  if (ligne.credit) return { ok: false, raison: "Cette ligne est déjà un recrédit." };
  if (ligne.presence === "absent") return { ok: false, raison: "Absence justifiée : aucune séance n'a été débitée." };
  if (ligne.annule) return { ok: false, raison: "Ce débit est déjà annulé." };

  const total = Number(carte.totalSessions) || 0;
  const restantes = (Number(carte.remainingSessions) || 0) + 1;
  if (total > 0 && restantes > total) {
    return { ok: false, raison: `La carte aurait ${restantes} séances pour ${total} achetées : vérifiez son historique.` };
  }
  const motif = opts.motif.trim() || "débit par erreur";

  const nouvelHistorique = history.map((h, i) =>
    i === index ? { ...h, annule: true, annuleLe: opts.maintenant, motifAnnulation: motif } : h,
  );
  nouvelHistorique.push({
    date: opts.maintenant,
    activityTitle: `Recrédit — ${ligne.activityTitle || "Séance"} (${motif})`,
    ...(ligne.childName ? { childName: ligne.childName } : {}),
    ...(ligne.creneauId ? { creneauId: ligne.creneauId } : {}),
    credit: true,
  });

  return {
    ok: true,
    maj: {
      remainingSessions: restantes,
      usedSessions: Math.max(0, (Number(carte.usedSessions) || 0) - 1),
      status: "active",
      history: nouvelHistorique,
    },
  };
}
