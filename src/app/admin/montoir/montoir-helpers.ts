/**
 * src/app/admin/montoir/montoir-helpers.ts
 *
 * Les calculs du montoir qui ne dependent d'AUCUN etat React : age d'un
 * cavalier, nom d'usage d'un equide, indisponibilite active a une date,
 * liste des poneys montables du jour, charge journaliere par poney.
 *
 * Pourquoi les isoler : ce sont eux qui decident ce que la monitrice a le
 * droit d'affecter en bord de carriere. Tant qu'ils vivaient au milieu des
 * `useState` de la page, on ne pouvait ni les relire ni les verifier sans
 * dérouler 1 500 lignes. Ici, chacun prend ses donnees en parametre et rend
 * toujours le meme resultat pour les memes entrees.
 *
 * Code DEPLACE tel quel depuis page.tsx : aucun calcul n'a ete retouche.
 */

import type { Creneau } from "./types";

export const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const bd = new Date(typeof birthDate === "string" ? birthDate : birthDate?.seconds ? birthDate.seconds * 1000 : birthDate);
  if (isNaN(bd.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return `${age} ans`;
};

// Nom affiché : surnom usuel si renseigné, sinon nom officiel
export const displayName = (eq: any): string => (eq?.surnom && eq.surnom.trim()) ? eq.surnom : (eq?.name || "");

// NB : le schéma côté création (cavalerie/TabIndispos) utilise { active, dateDebut, dateFin }
// On supporte aussi les anciens formats { status, startDate, endDate } par sécurité.
export const isIndispoActive = (i: any, dateStr: string): boolean => {
  // Terminée ? (deux conventions possibles)
  if (i.active === false) return false;
  if (i.status === "terminee") return false;

  const startRaw = i.dateDebut ?? i.startDate;
  const endRaw = i.dateFin ?? i.endDate;
  const start = startRaw?.seconds
    ? new Date(startRaw.seconds * 1000).toISOString().split("T")[0]
    : (typeof startRaw === "string" ? startRaw.split("T")[0] : "");
  const end = endRaw?.seconds
    ? new Date(endRaw.seconds * 1000).toISOString().split("T")[0]
    : (typeof endRaw === "string" ? endRaw.split("T")[0] : "");

  // Pas encore commencée
  if (start && dateStr < start) return false;
  // Déjà terminée (date de fin dépassée)
  if (end && dateStr > end) return false;
  return true;
};

// Liste des équidés disponibles (pas sortis, pas indisponibles)
export const listerEquidesDisponibles = (equides: any[], indisponibilites: any[], dateStr: string): any[] => {
  const activeIndispos = indisponibilites
    .filter((i: any) => isIndispoActive(i, dateStr))
    .map((i: any) => i.equideId);

  return equides
    .filter(e => e.status !== "sorti" && e.status !== "deces" && !activeIndispos.includes(e.id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
};

/** Les indisponibles du jour, avec le motif a afficher a cote du nom. */
export const listerEquidesIndisponibles = (equides: any[], indisponibilites: any[], dateStr: string): { name: string; reason: string }[] => {
  const activeIndispos = indisponibilites.filter((i: any) => isIndispoActive(i, dateStr));
  return activeIndispos.map((i: any) => {
    const eq = equides.find(e => e.id === i.equideId);
    return { name: eq ? displayName(eq) : "?", reason: i.motif || "Indisponible" };
  });
};

// ── Charge journalière des poneys (nb séances + nb heures aujourd'hui) ──────
export const calculerChargePoneys = (creneaux: Creneau[]): Record<string, { seances: number; heures: number }> => {
  const charge: Record<string, { seances: number; heures: number }> = {};
  creneaux.forEach(c => {
    const dur = (() => {
      const [sh, sm] = (c.startTime || "00:00").split(":").map(Number);
      const [eh, em] = (c.endTime || "00:00").split(":").map(Number);
      return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    })();
    (c.enrolled || []).forEach((e: any) => {
      if (!e.horseName) return;
      if (!charge[e.horseName]) charge[e.horseName] = { seances: 0, heures: 0 };
      // Si rotation activée : ce poney fait dur/N heures dans ce créneau
      // (N = nb de créneaux simultanés avec rotation qui ont ce poney)
      let heuresReelles = dur;
      if (c.rotationPoneys) {
        const simultanes = creneaux.filter(other =>
          other.id !== c.id &&
          other.rotationPoneys &&
          other.startTime < c.endTime && other.endTime > c.startTime &&
          (other.enrolled || []).some((oe: any) => oe.horseName === e.horseName)
        );
        if (simultanes.length > 0) {
          heuresReelles = dur / (simultanes.length + 1);
        }
      }
      charge[e.horseName].seances++;
      charge[e.horseName].heures = Math.round((charge[e.horseName].heures + heuresReelles) * 10) / 10;
    });
  });
  return charge;
};

/**
 * Signature d'une reprise (titre + heure de debut).
 *
 * Sert au re-scroll : quand on change de jour DEPUIS une reprise, on revient
 * sur la reprise equivalente du nouveau jour plutot que de remonter en haut.
 */
export const repriseSig = (c: any) => `${(c.activityTitle || "").trim()}__${c.startTime || ""}`;

/** Id deterministe d'une chute : une seule par cavalier et par seance. */
export const chuteKey = (cid: string, childId: string) => `${cid}_${childId}`;
