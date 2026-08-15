/**
 * src/app/admin/planning/enroll-helpers.ts
 *
 * Fonctions pures du panneau d'inscription : lire une donnée, décider d'un
 * état, formater un libellé. Aucune écriture Firestore, aucun état React.
 *
 * Pourquoi les avoir sorties du composant : chacune répond à une question que
 * l'admin se pose à voix haute devant l'écran — « est-ce que ce cavalier est
 * déjà pris à cette heure-là ? », « ce forfait couvre-t-il CE créneau ? »,
 * « cette inscription est-elle réglée ? ». Tant qu'elles étaient noyées dans
 * le JSX, la réponse changeait d'un bloc à l'autre sans qu'on s'en aperçoive
 * (le même test écrit deux fois, à deux endroits, avec une condition en
 * moins). Les rassembler ici garantit qu'il n'existe qu'UNE réponse par
 * question, et la rend vérifiable.
 */

import { itemMatchesCreneau, isForfaitChildPaye } from "./types";
import { estQuinzaine, estSemaineAttendue } from "@/lib/rythme";

/** Âge en années à partir d'une date de naissance (string, Date ou Timestamp). */
export const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const bd = new Date(
    typeof birthDate === "string" ? birthDate :
    birthDate?.seconds ? birthDate.seconds * 1000 : birthDate
  );
  if (isNaN(bd.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return `${age} ans`;
};

/**
 * Nom de famille deduit de `parentName` : le formulaire de creation n'a qu'un
 * seul champ (pas de nom/prenom separes comme dans /admin/cavaliers). On
 * retient le mot ECRIT EN MAJUSCULES s'il y en a un ("DUPONT Marie" -> DUPONT),
 * sinon le dernier mot. Sert de valeur par defaut au nom des enfants.
 */
export function deduireNomFoyer(parentName: string): string {
  const brut = (parentName || "").trim();
  if (!brut) return "";
  const mots = brut.split(/\s+/).filter(Boolean);
  const estMaj = (m: string) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m);
  // Cas courant "LE MOAL Sophie" / "DUPONT Marie" : on prend TOUS les mots
  // en majuscules consécutifs, pas seulement le premier (noms composés).
  const majuscules = mots.filter(estMaj);
  if (majuscules.length > 0) return majuscules.join(" ");
  // Aucune majuscule ("Marie Dupont") : convention nom en dernier.
  return (mots[mots.length - 1] || "").toUpperCase();
}

/**
 * Nom AFFICHE d'un inscrit : le `childName` est copie dans le creneau au
 * moment de l'inscription, donc il ne suit pas un renommage ulterieur
 * (ex. une date de naissance saisie par erreur dans le champ nom, corrigee
 * ensuite dans la fiche). On lit donc le nom ACTUEL de la fiche famille et
 * on ne retombe sur la copie que si l'enfant n'y est plus.
 */
export function nomActuel(e: any, families: any[]): string {
  const fam = families.find((f: any) => f.firestoreId === e.familyId);
  const child: any = (fam?.children || []).find((c: any) => c.id === e.childId);
  if (!child) return e.childName || "—";
  const nom = `${child.firstName || ""} ${child.lastName || ""}`.trim();
  return nom || e.childName || "—";
}

/** Recherche multi-mots sur le parent, son email et les prénoms des enfants. */
export function filtrerFamilles<T extends { parentName?: string; parentEmail?: string; children?: any[] }>(
  familles: T[],
  search: string,
): T[] {
  if (!search) return familles;
  const terms = search.toLowerCase().trim().split(/\s+/);
  return familles.filter(f => {
    const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`).join(" ");
    const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase();
    return terms.every(t => searchable.includes(t));
  });
}

/**
 * Le cavalier est-il déjà pris ailleurs à cette heure-là ?
 *
 * Deux créneaux se chevauchent si l'un commence avant que l'autre ne finisse
 * et vice versa. Renvoie le créneau en conflit (pour pouvoir le nommer à
 * l'écran) ou undefined.
 */
export function trouveConflitHoraire(childId: string, creneau: any, allCreneaux: any[]): any | undefined {
  return allCreneaux.find(other => {
    if (other.id === creneau.id) return false;
    if (other.date !== creneau.date) return false;
    if (!(other.enrolled || []).some((e: any) => e.childId === childId)) return false;
    const s1 = creneau.startTime, e1 = creneau.endTime;
    const s2 = other.startTime, e2 = other.endTime;
    return s1 < e2 && s2 < e1;
  });
}

/**
 * Cavaliers en quinzaine NON attendus cette semaine.
 *
 * Ils ne sont pas dans `enrolled` — c'est voulu, sinon la feuille d'appel
 * les compterait présents. Mais un créneau où il « manque » quelqu'un sans
 * explication inquiète le moniteur et fait rouvrir le dossier. On les
 * retrouve donc à partir de leur forfait, pour les afficher en grisé comme un
 * rappel : ils existent, ils ne sont simplement pas là aujourd'hui.
 */
export function forfaitsQuinzaineNonAttendus(allForfaits: any[], creneau: any, enrolledIds: string[]): any[] {
  const jour = new Date(creneau.date + "T12:00:00")
    .toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
  return (allForfaits || []).filter((f: any) => {
    if (!estQuinzaine(f)) return false;
    if (f.status !== "actif" && f.status !== "active") return false;
    if (enrolledIds.includes(f.childId)) return false;
    if (estSemaineAttendue(creneau.date, f)) return false;
    return (f.activityTitle || "").toLowerCase() === (creneau.activityTitle || "").toLowerCase()
      && (f.dayLabel || "").toLowerCase() === jour
      && (f.startTime || "") === (creneau.startTime || "");
  });
}

/**
 * Place tenue pour une famille prévenue qu'un désistement a libéré un créneau.
 * Renvoie le hold seulement s'il est encore vivant : non expiré, et pas déjà
 * consommé par une inscription. Un hold mort ne doit RIEN afficher, sinon
 * l'admin croit la place bloquée alors qu'elle est libre.
 */
export function holdActifDe(creneau: any, enrolled: any[]): any | null {
  const h = (creneau as any).waitlistHold;
  if (!h?.until) return null;
  if (new Date(h.until).getTime() < Date.now()) return null;
  if (enrolled.some((e: any) => e.childId === h.childId)) return null;
  return h;
}

/** Familles distinctes (avec email) à prévenir pour ce créneau. */
export function destinatairesCreneau(enrolled: any[], families: any[]): { email: string; parentName: string; familyId: string }[] {
  const recipients: { email: string; parentName: string; familyId: string }[] = [];
  const seen = new Set<string>();
  for (const e of enrolled) {
    const fam = families.find((f: any) => f.firestoreId === e.familyId);
    if (fam?.parentEmail && !seen.has(fam.parentEmail)) {
      seen.add(fam.parentEmail);
      recipients.push({ email: fam.parentEmail, parentName: fam.parentName || "", familyId: fam.firestoreId });
    }
  }
  return recipients;
}

/**
 * Clé d'un créneau récurrent : « Cours poney — mercredi 14:00 ».
 *
 * Sert à la fois à écrire le forfait (slotKey) et à vérifier ensuite qu'un
 * forfait existant couvre bien CE créneau-ci. Les deux usages DOIVENT produire
 * la même chaîne, d'où la fonction unique.
 */
export function slotKeyDuCreneau(creneau: any): string {
  return `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
}

/** Le créneau est-il un cours (par opposition à balade, stage, compétition) ? */
export function estTypeCours(activityType: string): boolean {
  return activityType === "cours" || activityType === "cours_collectif" || activityType === "cours_particulier";
}

/** Le créneau est-il une sortie en extérieur (balade, promenade, pony ride) ? */
export function estTypeBalade(activityType: string): boolean {
  return ["balade", "promenade", "ponyride"].includes(activityType);
}

/**
 * Un forfait annuel actif couvre-t-il CE créneau précis ?
 *
 * Le type doit correspondre (un forfait cours ne paie pas une balade) et, si
 * le forfait porte un slotKey, il doit désigner exactement ce créneau : deux
 * cours du même type à deux horaires différents ne se remplacent pas.
 */
export function aUnForfaitPourCeCreneau(allForfaits: any[], childId: string, creneau: any): boolean {
  const isCours = estTypeCours(creneau.activityType);
  const isBalade = estTypeBalade(creneau.activityType);
  const currentSlotKey = slotKeyDuCreneau(creneau);
  return allForfaits.some((f: any) => {
    if (f.childId !== childId || f.status !== "actif") return false;
    const ft = f.activityType || "cours";
    const typeMatch = ft === "all" || (ft === "cours" && isCours) || (ft === "balade" && isBalade);
    if (!typeMatch) return false;
    // Si slotKey défini, doit correspondre exactement
    if (f.slotKey && f.slotKey !== currentSlotKey) return false;
    return true;
  });
}

/**
 * Carte de séances utilisable pour ce cavalier sur ce créneau : active, non
 * épuisée, non périmée, du bon type, et rattachée soit à l'enfant soit à la
 * famille (carte familiale).
 */
export function trouveCarteActive(allCartes: any[], childId: string, familyId: string | undefined, creneau: any): any | undefined {
  const isCours = estTypeCours(creneau.activityType);
  const isBalade = estTypeBalade(creneau.activityType);
  return allCartes.find((c: any) => {
    if (c.status !== "active" || (c.remainingSessions || 0) <= 0) return false;
    if (c.dateFin && new Date(c.dateFin) < new Date()) return false;
    if (c.familiale) {
      if (c.familyId !== familyId) return false;
    } else {
      if (c.childId !== childId) return false;
    }
    const ct = c.activityType || "cours";
    return (ct === "cours" && isCours) || (ct === "balade" && isBalade);
  });
}

/**
 * Couverture financière d'une inscription, telle qu'elle s'affiche en pastille
 * de couleur devant le nom du cavalier.
 *
 * ── Cas forfait annuel ─────────────────────────────────────────
 * Quand l'enfant est inscrit via un forfait annuel, on distingue 2 sous-cas
 * selon que le forfait est encaisse ou pas :
 *  - forfait paye    → vert emeraude "forfait" (couvert)
 *  - forfait pending → orange "forfait en attente" (commande cree mais non
 *    encore encaissee)
 * Sans cette distinction, on avait un faux positif (vert) sur tous les
 * creneaux d'un eleve qui n'avait pas encore paye.
 */
export function statutPaiementInscrit(e: any, payments: any[], creneau: any): {
  statusLabel: string;
  statusColor: string;
  hasPaid: boolean;
  hasPending: boolean;
  isForfaitPaid: boolean;
  isForfaitPending: boolean;
} {
  const isCard = e.paymentSource === "card";
  const isCeleris = e.paymentSource === "celeris";
  const isForfait = e.paymentSource === "forfait";
  const isForfaitPaid = isForfait && isForfaitChildPaye(payments, e.familyId, e.childId);
  const isForfaitPending = isForfait && !isForfaitPaid;
  const matchesThisEnrollment = (item: any) => itemMatchesCreneau(item, e, creneau);
  const hasPaid = isCard || isCeleris || isForfaitPaid || payments.some((p: any) =>
    p.familyId === e.familyId &&
    p.status === "paid" &&
    (p.items || []).some(matchesThisEnrollment)
  );
  const hasPending = !hasPaid && !isCeleris && (isForfaitPending || payments.some((p: any) =>
    p.familyId === e.familyId &&
    (p.status === "pending" || p.status === "partial") &&
    (p.items || []).some(matchesThisEnrollment)
  ));
  // Label : carte > celeris > forfait payé > forfait en attente > réglé > en attente > rien
  const statusLabel = isCard ? "carte"
    : isCeleris ? "réglé (Celeris)"
    : isForfaitPaid ? "forfait"
    : isForfaitPending ? "forfait à régler"
    : hasPaid ? "réglé"
    : hasPending ? "en attente"
    : "";
  const statusColor = isCard ? "bg-blue-500"
    : isCeleris ? "bg-teal-500"
    : isForfaitPaid ? "bg-emerald-500"
    : isForfaitPending ? "bg-amber-500"
    : hasPaid ? "bg-green-500"
    : hasPending ? "bg-orange-400"
    : "bg-gray-300";
  return { statusLabel, statusColor, hasPaid, hasPending, isForfaitPaid, isForfaitPending };
}
