// ─── Types partagés ─────────────────────────────────────────────────────────

export interface Creneau {
  id?: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  enrolled: any[];
  status: string;
  priceHT?: number;
  priceTTC?: number;
  tvaTaux?: number;
  // Identifiant unique du lot de créneaux d'un stage multi-jours. Deux stages
  // créés séparément ont toujours des stageGroupId différents, même s'ils
  // partagent la même activité ET le même titre. Absent sur les créneaux
  // antérieurs à ce champ (fallback : activityId + titre).
  stageGroupId?: string;
}

// ── Deux créneaux appartiennent-ils au même stage ? ──
// Priorité au stageGroupId (fiable à 100%). Fallback legacy : même activityId
// + même titre — limite connue : deux stages homonymes créés depuis la même
// activité AVANT l'introduction du stageGroupId restent indissociables.
/** Lundi de la semaine d'une date ISO, en UTC pour éviter tout décalage. */
function lundiDe(dateISO: string): string {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().split("T")[0];
}

export function sameStage(a: any, b: any): boolean {
  if (!a || !b) return false;

  // Un stage se déroule sur UNE semaine. Deux créneaux de semaines différentes
  // ne sont jamais le même stage, quels que soient leurs autres champs.
  // Sans cette barrière, les règles de repli ci-dessous rapprochaient le
  // « Stage galop d'or » de la Toussaint et celui d'août — au même titre et à
  // la même heure — et une suppression de stage emportait toute l'année.
  const sa = lundiDe(a.date), sb = lundiDe(b.date);
  if (sa && sb && sa !== sb) return false;

  // Priorité 1 : identifiant de lot explicite (stages créés ensemble)
  if (a.stageGroupId && b.stageGroupId) return a.stageGroupId === b.stageGroupId;
  // Priorité 2 : même activité + même titre (stages depuis la même activité)
  if (a.activityId && b.activityId) return a.activityId === b.activityId && a.activityTitle === b.activityTitle;
  // Priorité 3 (repli) : ni l'un ni l'autre n'a d'identifiant fiable
  // (stages anciens ou créés jour par jour à la main) → titre + horaire.
  return a.activityTitle === b.activityTitle && a.startTime === b.startTime;
}

export interface EnrolledChild {
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  enrolledAt: string;
  // ── Marquage source de paiement (couverture inscription) ─────────────
  // Permet à l'UI de savoir comment l'inscription est couverte
  // financièrement, sans devoir matcher un item de paiement précis :
  //  - 'card'    : carte de séances (débit à la clôture)
  //  - 'forfait' : forfait annuel (un seul paiement couvre toute la saison)
  //  - undefined : paiement classique au créneau (suppose un match par creneauId)
  paymentSource?: "card" | "forfait";
  forfaitId?: string | null;
  cardId?: string | null;
  presence?: "present" | "absent" | null;
  stageKey?: string;
}

export interface Period {
  startDate: string;
  endDate: string;
}

export interface SlotDef {
  activityId: string;
  day: number;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const dayNamesFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Comparateur stable pour trier les créneaux.
 * Réexporté depuis @/lib/creneau-sort pour que les imports existants depuis
 * "./types" continuent de fonctionner. Voir creneau-sort.ts pour la doc.
 */
export { compareCreneaux } from "@/lib/creneau-sort";

export const typeColors: Record<string, string> = {
  stage: "#27ae60",
  stage_journee: "#16a085",
  balade: "#e67e22",
  cours: "#2050A0",
  competition: "#7c3aed",
  anniversaire: "#D63031",
  ponyride: "#16a085",
  animation: "#e84393",
};

export const payModes = [
  { id: "cb_terminal", label: "CB", icon: "💳" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💶" },
  { id: "cheque_vacances", label: "Chq.Vac.", icon: "🏖️" },
  { id: "pass_sport", label: "Pass'Sport", icon: "🎽" },
  { id: "ancv", label: "ANCV", icon: "🎫" },
  { id: "carte", label: "Carte", icon: "🎟️" },
  { id: "avoir", label: "Avoir", icon: "💜" },
  { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
];

// ─── Helpers dates ───────────────────────────────────────────────────────────

export function getWeekDates(offset: number): Date[] {
  const t = new Date();
  const m = new Date(t);
  m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(m);
    d.setDate(m.getDate() + i);
    return d;
  });
}

export function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtDateFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function fmtMonthFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper partagé : match d'un item de paiement avec un créneau visible.
//
//  Cas couverts (par ordre de priorité) :
//
//  1. Cours unique : item a un creneauId → match strict
//
//  2. Stage moderne : enrolled.stageKey existe ET item.stageKey existe
//     → match strict sur stageKey complet (format "activityTitle_premierJour")
//     Aucune confusion possible entre 2 stages de même titre sur 2 semaines.
//
//  3. Stage legacy (avant le fix stageKey) : enrolled n'a pas de stageKey
//     → fallback sur préfixe item.stageKey commence par activityTitle + "_"
//     Limite : un cavalier qui a payé "Stage galop d'or" semaine 1 apparaît
//     "réglé" sur "Stage galop d'or" semaine 2 si l'inscription est antérieure
//     au déploiement de ce fix. Pour les nouveaux stages c'est correct.
//
//  4. Très ancien : ni creneauId ni stageKey → match par activityTitle.includes
//
//  Le bug initial (Charlyse Pierre stage A payé, stage B inscriptions
//  apparaissait "réglé") reste corrigé : ces 2 stages ont des activityTitle
//  différents donc aucun cas ne matche.
// ─────────────────────────────────────────────────────────────────────────────
export function itemMatchesCreneau(
  item: any,
  enrolledOrChildId: string | { childId: string; stageKey?: string },
  creneau: { id?: string; activityTitle: string }
): boolean {
  // Compatibilité ascendante : accepte string (childId) ou objet enrolled
  const childId = typeof enrolledOrChildId === "string"
    ? enrolledOrChildId
    : enrolledOrChildId.childId;
  const enrolledStageKey = typeof enrolledOrChildId === "object"
    ? enrolledOrChildId.stageKey
    : undefined;

  if (item.childId !== childId) return false;

  // 0. Stage réservé en ligne : la ligne porte TOUS ses jours dans
  //    `creneauIds`, et `creneauId` ne contient que le premier — la règle
  //    stricte ci-dessous ne reconnaissait donc que le lundi. Éliona Travers,
  //    le 01/09/2026 : « acompte versé » le lundi, « non réglé » du mardi au
  //    vendredi, et un impayé annoncé sur quatre créneaux payés.
  if (Array.isArray(item.creneauIds) && item.creneauIds.length > 0) {
    if (creneau.id && item.creneauIds.includes(creneau.id)) return true;
    // Pas dans la liste : on laisse les règles de stage ci-dessous trancher
    // (un jour ajouté après coup au même stage, par exemple).
  }

  // 1. Cours unique : creneauId strict
  if (item.creneauId && !(Array.isArray(item.creneauIds) && item.creneauIds.length > 0)) {
    return item.creneauId === creneau.id;
  }

  // 2. Stage moderne : on a le stageKey dans l'enrolled → match strict
  if (enrolledStageKey && item.stageKey) {
    return item.stageKey === enrolledStageKey;
  }

  // 3. Stage legacy : seul l'item a un stageKey, on tente le préfixe
  if (item.stageKey) {
    return String(item.stageKey).startsWith(creneau.activityTitle + "_");
  }

  // 4. Très ancien : fallback activityTitle
  return String(item.activityTitle || "").includes(creneau.activityTitle);
}

// ─── Statut de règlement d'un cavalier sur un créneau ───────────────────────
//
// Trois états, trois couleurs, et la même règle partout :
//
//   rouge  — rien reçu (ni carte, ni acompte, ni espèces)
//   orange — payé partiellement (l'acompte de stage, une échéance…)
//   vert   — réglé
//
// Avant, « payé partiellement » et « rien reçu » partageaient le même orange
// « en attente » : le planning regardait le STATUT de la commande, et les
// statuts `pending` et `partial` tombaient dans la même branche. Une famille
// ayant versé 150 € d'acompte pour cinq enfants était affichée comme celle
// qui n'avait rien envoyé. La couleur suit désormais l'argent réellement
// encaissé (`paidAmount`), pas le statut.
//
// Le mode de règlement (carte en ligne, Celeris, forfait) ne change plus la
// couleur — il reste dans le libellé. Une pastille verte veut dire « c'est
// payé », quelle que soit la façon dont c'est arrivé.
//
// Ce calcul vivait recopié dans les quatre vues du planning (jour, semaine,
// timeline, panneau d'inscription), ce qui explique qu'il n'ait jamais
// évolué : il est désormais ici, une seule fois.

export type EtatPaiement = "regle" | "partiel" | "impaye";

export interface StatutPaiement {
  etat: EtatPaiement;
  /** Libellé court, affiché à côté du nom : « carte », « acompte versé »… */
  label: string;
  /** Phrase de survol, avec les montants. */
  detail: string;
  /** Classe Tailwind de la pastille ronde. */
  point: string;
  /** Couleur du texte et de la pastille (styles en ligne). */
  couleur: string;
  /** Fond de la pilule (vue jour). */
  fond: string;
  icone: string;
}

const APPARENCE: Record<EtatPaiement, Omit<StatutPaiement, "etat" | "label" | "detail">> = {
  regle:   { point: "bg-green-500",  couleur: "#16a34a", fond: "#f0fdf4", icone: "✓" },
  partiel: { point: "bg-orange-400", couleur: "#d97706", fond: "#fffbeb", icone: "◐" },
  impaye:  { point: "bg-red-500",    couleur: "#dc2626", fond: "#fef2f2", icone: "✗" },
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Ce qu'un ensemble de commandes a réellement encaissé.
 *
 * Un même calcul sert deux fois : les commandes qui couvrent l'inscription,
 * et celle qui a vendu la carte de séances dont la place est décomptée.
 */
function argentRecu(commandes: any[]): {
  etat: EtatPaiement; regle: number; total: number; reste: number;
} {
  const arrondi = (n: number) => Math.round(n * 100) / 100;
  const regle = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.paidAmount) || 0), 0));
  const total = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.totalTTC) || 0), 0));
  const reste = arrondi(Math.max(0, total - regle));
  // Le statut de la commande ne fait foi que dans un sens : `paid` suffit à
  // dire réglé, mais `pending` ne prouve rien — c'est le montant qui tranche.
  const etat: EtatPaiement =
    commandes.some((p: any) => p.status === "paid") || (total > 0 && reste < 0.01) ? "regle"
      : regle > 0.009 ? "partiel"
      : "impaye";
  return { etat, regle, total, reste };
}

export function statutPaiementCavalier(
  enrolled: { childId: string; familyId?: string; stageKey?: string; paymentSource?: string; cardId?: string },
  payments: any[],
  creneau: { id?: string; activityTitle: string },
): StatutPaiement {
  const habiller = (etat: EtatPaiement, label: string, detail: string): StatutPaiement =>
    ({ etat, label, detail, ...APPARENCE[etat] });
  const vivantes = payments.filter((p: any) => p.status !== "cancelled");

  // ── Carte de séances ────────────────────────────────────────────────────
  // La place n'est pas facturée ici : elle est décomptée d'une carte, vendue
  // une fois pour dix séances. C'est donc le règlement de LA CARTE qui décide
  // de la couleur — une carte remise sans encaissement n'est pas une place
  // payée.
  if (enrolled.paymentSource === "card") {
    const carteId = enrolled.cardId;
    const commandes = carteId
      ? vivantes.filter((p: any) =>
          p.cardId === carteId || (p.items || []).some((i: any) => i.cardId === carteId))
      : [];
    if (commandes.length === 0) {
      // Carte importée ou saisie avant que les cartes soient rattachées à une
      // commande : rien ne permet de dire qu'elle n'est pas payée.
      return habiller("regle", "carte", "Séance décomptée d'une carte — aucune commande retrouvée pour cette carte.");
    }
    const { etat, regle, total, reste } = argentRecu(commandes);
    if (etat === "regle") return habiller("regle", "carte", `Séance décomptée d'une carte réglée (${eur(total)}).`);
    if (etat === "partiel") {
      return habiller("partiel", "carte à solder", `Carte réglée en partie : ${eur(regle)} sur ${eur(total)} — reste ${eur(reste)}.`);
    }
    return habiller("impaye", "carte à régler", `Carte remise sans encaissement — ${eur(total)} dus.`);
  }

  // ── Règlements portés par l'inscription elle-même ───────────────────────
  if (enrolled.paymentSource === "celeris") {
    return habiller("regle", "réglé (Celeris)", "Encaissé dans Celeris, avant la reprise.");
  }
  // ── Forfait annuel ──────────────────────────────────────────────────────
  // La séance n'est pas facturée non plus : elle est couverte par le forfait,
  // payé comptant ou en trois à dix fois. C'est donc l'avancement du forfait
  // qui décide, échéance par échéance — une seule encaissée sur dix, ce n'est
  // pas « réglé ».
  if (enrolled.paymentSource === "forfait") {
    const echeances = vivantes.filter((p: any) =>
      p.familyId === enrolled.familyId &&
      (p.items || []).some((i: any) => i.childId === enrolled.childId) &&
      (!!p.forfaitRef || (p.items || []).some((i: any) =>
        /forfait|adh[ée]sion|[ée]ch[ée]ance/i.test(String(i.activityTitle || "")))),
    );

    if (echeances.length === 0) {
      return habiller("impaye", "forfait à régler", "Forfait annuel enregistré, mais aucune commande retrouvée.");
    }

    // Ici on compte les échéances, pas le statut d'une commande : un forfait
    // en dix fois dont la première est encaissée a bien une commande `paid`,
    // et c'est ce raccourci qui le faisait passer pour réglé toute l'année.
    const { regle, total, reste } = argentRecu(echeances);

    // Combien d'échéances sont effectivement rentrées.
    //
    // Deux formes coexistent. Le paiement en trois ou dix fois crée une
    // commande par échéance : il suffit de compter celles qui sont réglées.
    // Le prélèvement SEPA n'en crée qu'UNE, de référence, dont le montant
    // encaissé grossit à chaque remise déposée (cf. Prélèvements SEPA,
    // markDeposited) — le nombre de prélèvements passés s'en déduit.
    const sepa = echeances.some((p: any) =>
      p.status === "sepa_scheduled" || p.paymentMode === "prelevement_sepa");
    const nbEcheances = Math.max(
      echeances.length,
      ...echeances.map((p: any) => Number(p.echeancesTotal) || 0),
    );
    const parEcheance = nbEcheances > 0 ? total / nbEcheances : 0;
    const payees = echeances.length > 1
      ? echeances.filter((p: any) =>
          p.status === "paid" || (Number(p.paidAmount) || 0) >= (Number(p.totalTTC) || 0) - 0.01).length
      : parEcheance > 0 ? Math.round(regle / parEcheance) : 0;
    const mention = sepa ? " Les prélèvements sont suivis dans Paiements › Prélèvements SEPA." : "";

    if ((payees >= nbEcheances && payees > 0) || (total > 0 && reste < 0.01)) {
      return habiller("regle", sepa ? "forfait (SEPA)" : "forfait", `Forfait annuel réglé — ${eur(regle || total)}.`);
    }
    if (regle > 0.009) {
      return habiller(
        "partiel",
        nbEcheances > 1 ? `forfait ${payees}/${nbEcheances}${sepa ? " SEPA" : ""}` : "forfait partiellement réglé",
        `${eur(regle)} reçus sur ${eur(total)} — reste ${eur(reste)} sur le forfait.${mention}`,
      );
    }
    return habiller(
      "impaye",
      sepa ? "SEPA, rien prélevé" : "forfait à régler",
      sepa
        ? `Prélèvement mensuel programmé, mais aucune remise encaissée à ce jour — ${eur(total)}.${mention}`
        : `Aucune échéance encaissée — ${eur(total)} dus.`,
    );
  }

  // ── Commandes de la famille qui couvrent cette inscription ──────────────
  const commandes = vivantes.filter((p: any) =>
    p.familyId === enrolled.familyId &&
    (p.items || []).some((i: any) => itemMatchesCreneau(i, enrolled, creneau)),
  );

  if (commandes.length === 0) {
    return habiller("impaye", "non réglé", "Aucune commande enregistrée pour cette inscription.");
  }

  const { etat, regle, total, reste } = argentRecu(commandes);
  // Une commande peut porter plusieurs cavaliers (le panier unique d'une
  // famille) : les montants sont ceux de la commande, on le dit.
  const portee = commandes.length > 1 ? "des commandes" : "de la commande";

  if (etat === "regle") return habiller("regle", "réglé", `Réglé — ${eur(regle || total)}.`);

  if (etat === "partiel") {
    // « Acompte versé » quand le montant reçu correspond à l'acompte attendu :
    // c'est le mot qu'emploie la famille, et il dit que le reste est prévu.
    const estAcompte = commandes.some((p: any) =>
      Number(p.acompteAmount) > 0 && regle + 0.01 >= Number(p.acompteAmount));
    return habiller(
      "partiel",
      estAcompte ? "acompte versé" : "partiellement réglé",
      `${eur(regle)} reçus sur ${eur(total)} — reste ${eur(reste)} ${portee}.`,
    );
  }

  return habiller("impaye", "non réglé", `Rien d'encaissé — ${eur(total)} dus ${portee}.`);
}

/**
 * Extrait la liste dédoublonnée des noms de moniteurs depuis un snapshot
 * Firestore. La base peut contenir des doublons (ex. "Alice" et "Alice "
 * hérités d'un ancien bug) qui créaient deux boutons dont un seul réagissait.
 * On normalise (trim) et on déduplique sur le nom (insensible à la casse),
 * en conservant la première graphie rencontrée.
 */
export function moniteursUniques(docs: { data: () => any }[]): string[] {
  const vus = new Set<string>();
  const noms: string[] = [];
  for (const d of docs) {
    const brut = d.data()?.name;
    if (!brut) continue;
    const nom = String(brut).trim();
    const cle = nom.toLowerCase();
    if (!nom || vus.has(cle)) continue;
    vus.add(cle);
    noms.push(nom);
  }
  return noms.sort();
}


// ═══ Âge d'un cavalier inscrit ═══════════════════════════════════════════
//
// Le panneau d'inscription et la vue jour cherchaient l'enfant par son
// identifiant dans la famille de l'inscription. Quand l'identifiant ne
// correspond plus (enfant recréé, famille scindée, import Celeris posé avec
// un autre identifiant) ou que la fiche n'a pas de date de naissance, l'âge
// disparaissait sans un mot. On cherche plus large — même famille par le
// nom, toutes les familles par l'identifiant, puis ce que l'inscription
// porte elle-même — et on dit quand la fiche est incomplète.

function calculerAge(birthDate: any): number | null {
  if (!birthDate) return null;
  const bd = new Date(
    typeof birthDate === "string" ? birthDate :
    birthDate?.seconds ? birthDate.seconds * 1000 :
    typeof birthDate?.toDate === "function" ? birthDate.toDate() : birthDate,
  );
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

const normaliserNom = (s: any) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export interface AgeCavalier {
  /** « 9 ans », ou "" si inconnu. */
  label: string;
  /** Fiche trouvée mais sans date de naissance → à compléter. */
  ficheSansDate: boolean;
}

export function ageCavalier(
  e: { childId?: string; familyId?: string; childName?: string; birthDate?: any; age?: any },
  families: any[],
): AgeCavalier {
  const fam = families.find((f: any) => f.firestoreId === e.familyId || f.id === e.familyId);
  let enfant = (fam?.children || []).find((c: any) => c.id === e.childId);
  if (!enfant) {
    for (const f of families) {
      enfant = (f?.children || []).find((c: any) => c.id === e.childId);
      if (enfant) break;
    }
  }
  if (!enfant && fam && e.childName) {
    const cible = normaliserNom(e.childName);
    enfant = (fam.children || []).find((c: any) =>
      normaliserNom(`${c.firstName || ""} ${c.lastName || ""}`) === cible || normaliserNom(c.firstName) === cible);
  }
  const age = calculerAge(enfant?.birthDate) ?? calculerAge(e.birthDate)
    ?? (typeof e.age === "number" && e.age > 0 ? e.age : null);
  if (age !== null) return { label: `${age} ans`, ficheSansDate: false };
  return { label: "", ficheSansDate: !!enfant };
}
