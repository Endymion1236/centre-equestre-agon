/**
 * src/app/admin/forfaits/calculs.ts
 *
 * Tous les calculs de l'écran « Forfaits annuels » qui ne touchent ni à
 * Firestore ni à l'état React : agrégation des créneaux hebdomadaires,
 * recherches et filtres, bornes de saison, montant réellement encaissé,
 * tarification d'une inscription (forfait + licence + adhésion + réduction
 * famille).
 *
 * Pourquoi séparé : ce sont les seules fonctions de l'écran dont le résultat
 * finit sur une facture. Isolées ici, à entrées explicites et sans état
 * caché, elles se relisent — et se corrigent — sans avoir à démêler le JSX
 * de 1400 lignes qui les entourait.
 */

import type { Family } from "@/types";
import { compareCreneauxByDow } from "@/lib/creneau-sort";
import { dayLabels, NOMS_JOURS_DEPUIS_DIMANCHE, LICENCE_FFE_MOINS18, LICENCE_FFE_PLUS18, ADHESION_PRICE } from "./constantes";
import type { Creneau, CreneauReel, Forfait, Payment, RegleReductionFamille, WeeklySlot } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Normalisation des titres d'activité
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalisation « large » : minuscules, accents retirés, espaces multiples
 * réduits. Sert au changement de créneau, pour retrouver un cours malgré :
 *  - les renommages d'activités entre saisons (ex: "Galop 3-5" → "Galop 3-5 ados")
 *  - les accents et casse différents
 */
export function normaliseTitre(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Variante utilisée par le RETRAIT d'un créneau, qui prétend en plus
 * uniformiser les apostrophes typographiques (titres du genre « Galop d'or »).
 *
 * Telle qu'elle est écrite, cette classe de caractères ne contient que deux
 * fois l'apostrophe ASCII : elle ne remplace donc rien de plus que
 * `normaliseTitre`. Le comportement est conservé à l'identique — le corriger
 * élargirait l'appariement des titres, donc le nombre de séances retirées
 * d'un forfait, ce qui n'est pas le rôle d'un découpage de fichier.
 * Les deux fonctions restent séparées pour cette raison : leurs appelants
 * n'ont jamais eu le même périmètre d'appariement.
 */
export function normaliseTitreAvecApostrophes(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Bornes de saison
// ─────────────────────────────────────────────────────────────────────────

/**
 * Bornes de la saison d'un forfait, au format "AAAA-MM-JJ".
 *
 * Le forfait stocke `seasonStartYear` (année de début de saison FFE) et la
 * saison va du 1er septembre Y au 30 juin Y+1. Si `seasonStartYear` est
 * absent (forfaits anciens), on retombe sur la saison d'aujourd'hui :
 *   - mois >= septembre → Y/Y+1, fin = juin Y+1
 *   - mois < septembre  → Y-1/Y, fin = juin Y
 *
 * L'enjeu : ne jamais déborder sur la saison suivante, qui fera l'objet
 * d'une nouvelle inscription à part.
 */
export function bornesSaisonForfait(forfait: Forfait): { debut: string; fin: string } {
  let anneeDebut: number;
  if ((forfait as any).seasonStartYear) {
    anneeDebut = (forfait as any).seasonStartYear;
  } else {
    const maintenant = new Date();
    anneeDebut = maintenant.getMonth() >= 8 ? maintenant.getFullYear() : maintenant.getFullYear() - 1;
  }
  return { debut: `${anneeDebut}-09-01`, fin: `${anneeDebut + 1}-06-30` };
}

/**
 * Borne basse effective d'un traitement : max(aujourd'hui, début de saison).
 * Si la saison du forfait est dans le futur, on prend le début de saison ; si
 * elle est commencée, on prend aujourd'hui — pour ne rien toucher au passé.
 */
export function debutEffectif(aujourdHui: string, debutSaison: string): string {
  return aujourdHui > debutSaison ? aujourdHui : debutSaison;
}

// ─────────────────────────────────────────────────────────────────────────
// Créneaux hebdomadaires
// ─────────────────────────────────────────────────────────────────────────

/**
 * Regroupe les séances à venir en créneaux hebdomadaires (même activité,
 * même jour de semaine, même heure de début), avec le nombre de séances de
 * la saison et les places restantes.
 *
 * `avgEnrolled` porte en réalité le MAXIMUM d'inscrits observé sur les
 * séances du créneau, pas une moyenne : on veut refuser une inscription dès
 * qu'une seule séance est pleine.
 */
export function construitCreneauxHebdo(creneaux: Creneau[]): WeeklySlot[] {
  const map: Record<string, WeeklySlot> = {};
  for (const c of creneaux) {
    const d = new Date(c.date);
    const dow = (d.getDay() + 6) % 7;
    const key = `${c.activityId}-${dow}-${c.startTime}`;
    if (!map[key]) {
      map[key] = {
        key, activityId: c.activityId, activityTitle: c.activityTitle,
        dayOfWeek: dow, dayLabel: dayLabels[dow],
        startTime: c.startTime, endTime: c.endTime,
        monitor: c.monitor, maxPlaces: c.maxPlaces,
        totalSessions: 0, avgEnrolled: 0, spotsAvailable: 0, creneauIds: [],
        priceTTC: c.priceTTC || ((c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100)),
      };
    }
    map[key].totalSessions++;
    map[key].creneauIds.push(c.id);
    const enrolled = c.enrolled?.length || 0;
    map[key].avgEnrolled = Math.max(map[key].avgEnrolled, enrolled);
  }
  for (const slot of Object.values(map)) {
    slot.spotsAvailable = slot.maxPlaces - slot.avgEnrolled;
  }
  return Object.values(map).sort(compareCreneauxByDow);
}

/** Recherche libre sur les créneaux : activité, jour, horaire ou moniteur. */
export function filtreCreneauxHebdo(weeklySlots: WeeklySlot[], slotSearch: string): WeeklySlot[] {
  if (!slotSearch.trim()) return weeklySlots;
  const q = slotSearch.toLowerCase();
  return weeklySlots.filter(s =>
    s.activityTitle.toLowerCase().includes(q) ||
    s.dayLabel.toLowerCase().includes(q) ||
    s.startTime.includes(q) ||
    s.monitor.toLowerCase().includes(q)
  );
}

/**
 * Créneaux proposés dans la modale « Changer de créneau » : tous les créneaux
 * hebdomadaires à venir (hors stages), sauf celui que le forfait occupe déjà,
 * filtrés par la recherche et triés par jour puis heure.
 */
export function construitCreneauxDisponibles(
  creneaux: Creneau[],
  f: Forfait,
  recherche: string,
): WeeklySlot[] {
  const today = new Date().toISOString().split("T")[0];
  // Construire les slots uniques depuis les créneaux futurs
  const futureCreneaux = creneaux.filter(c => c.date >= today && c.activityType !== "stage" && c.activityType !== "stage_journee");
  const slotsMap = new Map<string, WeeklySlot>();
  for (const c of futureCreneaux) {
    const dow = new Date(c.date + "T12:00:00").getDay();
    const key = `${dow}-${c.startTime}-${c.activityTitle}`;
    if (!slotsMap.has(key)) {
      slotsMap.set(key, {
        key, activityId: c.activityId, activityTitle: c.activityTitle,
        dayOfWeek: dow, dayLabel: dayLabels[(dow + 6) % 7],
        startTime: c.startTime, endTime: c.endTime, monitor: c.monitor,
        maxPlaces: c.maxPlaces, totalSessions: 1, avgEnrolled: (c.enrolled || []).length,
        spotsAvailable: c.maxPlaces - (c.enrolled || []).length,
        creneauIds: [c.id], priceTTC: c.priceTTC || 0,
      });
    } else {
      const s = slotsMap.get(key)!;
      s.totalSessions++;
      s.creneauIds.push(c.id);
    }
  }
  // Exclure le créneau actuel du forfait
  const currentDow = dayLabels.indexOf(f.dayLabel);
  const currentKey = `${(currentDow + 1) % 7}-${f.startTime}-${f.activityTitle}`;
  return [...slotsMap.values()].filter(s => {
    const isCurrent = s.activityTitle === f.activityTitle && s.dayLabel === f.dayLabel && s.startTime === f.startTime;
    if (isCurrent) return false;
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return s.activityTitle.toLowerCase().includes(q) || s.dayLabel.toLowerCase().includes(q) || s.startTime.includes(q) || s.monitor.toLowerCase().includes(q);
  }).sort(compareCreneauxByDow);
}

/**
 * Dérive les « slots hebdo » RÉELS d'un forfait depuis les créneaux Firestore.
 *
 * Un forfait stocke seulement son créneau principal (slotKey). Si l'enfant
 * est inscrit en 2x ou 3x par semaine, les autres créneaux ne sont pas
 * visibles dans le doc forfait — ils sont identifiables par enrolled[].
 * paymentSource === 'forfait' sur les créneaux futurs de la saison.
 * Cette fonction agrège les inscriptions et regroupe par slot hebdo unique.
 */
export function detecteCreneauxReels(f: Forfait, creneaux: Creneau[]): CreneauReel[] {
  const today = new Date().toISOString().split("T")[0];
  // Saison du forfait : on prend seasonStartYear si présent, sinon fallback createdAt
  const { debut: seasonStart, fin: seasonEnd } = bornesSaisonForfait(f);
  // Borne basse effective : max(today, seasonStart). Si la saison du forfait
  // est dans le futur, on prend seasonStart. Si elle est commencee, on prend
  // today (pour ne pas afficher des seances deja passees).
  const effectiveStart = debutEffectif(today, seasonStart);

  const slotMap = new Map<string, CreneauReel>();
  const dayNames = NOMS_JOURS_DEPUIS_DIMANCHE;

  for (const c of creneaux) {
    const cAny = c as any;
    if (cAny.date < effectiveStart || cAny.date > seasonEnd) continue;
    const enrolled = cAny.enrolled || [];
    const isEnrolled = enrolled.some((e: any) =>
      e.childId === f.childId && e.paymentSource === "forfait"
    );
    if (!isEnrolled) continue;

    const dow = new Date(cAny.date + "T12:00:00").getDay();
    const dayLabel = dayNames[dow];
    const key = `${dow}-${cAny.startTime}-${cAny.activityTitle}`;
    const isPrincipal = f.startTime === cAny.startTime && f.activityTitle === cAny.activityTitle;
    const existing = slotMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      slotMap.set(key, { key, dayLabel, startTime: cAny.startTime, endTime: cAny.endTime, activityTitle: cAny.activityTitle, count: 1, isPrincipal });
    }
  }
  // Tri par jour de semaine
  return Array.from(slotMap.values()).sort((a, b) => {
    const dayA = dayNames.indexOf(a.dayLabel);
    const dayB = dayNames.indexOf(b.dayLabel);
    if (dayA !== dayB) return dayA - dayB;
    return a.startTime.localeCompare(b.startTime);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Familles, forfaits : recherche et tri
// ─────────────────────────────────────────────────────────────────────────

/** Recherche libre sur les familles : parent, e-mail ou prénom d'un enfant. */
export function filtreFamilles(
  families: (Family & { firestoreId: string })[],
  familySearch: string,
): (Family & { firestoreId: string })[] {
  if (!familySearch.trim()) return families;
  const q = familySearch.toLowerCase();
  return families.filter(f =>
    f.parentName?.toLowerCase().includes(q) ||
    f.parentEmail?.toLowerCase().includes(q) ||
    (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q))
  );
}

/**
 * Liste affichée : filtre par statut, puis recherche multi-mots (tous les
 * mots doivent être présents), puis tri du plus récent au plus ancien.
 */
export function filtreEtTrieForfaits(forfaits: Forfait[], filterStatus: string, search: string): Forfait[] {
  let result = [...forfaits];
  if (filterStatus !== "all") result = result.filter(f => f.status === filterStatus || (filterStatus === "active" && f.status === "actif"));
  if (search) {
    const terms = search.toLowerCase().trim().split(/\s+/);
    result = result.filter(f => {
      const searchable = [f.familyName || "", f.childName || "", f.activityTitle || "", f.slotKey || ""].join(" ").toLowerCase();
      return terms.every(t => searchable.includes(t));
    });
  }
  return result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ─────────────────────────────────────────────────────────────────────────
// Argent
// ─────────────────────────────────────────────────────────────────────────

/**
 * Calcul du vrai montant paye pour un forfait (lit la collection payments,
 * source de verite). Le champ f.totalPaidTTC stocke dans le doc forfait
 * n'est PAS mis a jour a l'encaissement, donc on ne s'en sert pas pour
 * les compteurs (sinon "encaisse" reste a 0 alors que c'est paye).
 */
export function montantPayePourForfait(f: Forfait, payments: Payment[]): number {
  const related = payments.filter(p =>
    p.familyId === f.familyId &&
    (p.status === "paid" || p.status === "sepa_scheduled") &&
    (p.items || []).some((i: any) => i.activityTitle?.includes("Forfait") && i.activityTitle?.includes(f.activityTitle || ""))
  );
  return related.reduce((s, p) => s + (p.paidAmount || (p.status === "paid" ? p.totalTTC : 0) || 0), 0);
}

/** Prix d'un créneau hebdomadaire pour la saison, et nombre de séances. */
export interface PrixCreneau {
  slot: WeeklySlot;
  forfaitPrice: number;
  sessions: number;
}

/** Détail chiffré d'une inscription annuelle en cours de saisie. */
export interface TarifsInscription {
  slotsPrices: PrixCreneau[];
  totalForfaitBrut: number;
  childRank: number;
  familyDiscountPercent: number;
  familyDiscountAmount: number;
  totalForfait: number;
  licencePrice: number;
  adhesionPrice: number;
  grandTotal: number;
}

/**
 * Chiffrage complet d'une inscription annuelle en cours de saisie.
 *
 * Deux règles à ne pas perdre de vue :
 *  - le prix du créneau vaut soit un prix de forfait déjà annuel (> 100 €),
 *    soit un prix à la séance qu'on multiplie par le nombre de séances ;
 *  - la réduction famille dépend du RANG de l'enfant : on compte les autres
 *    enfants de la même famille déjà inscrits sur un forfait en cours, le
 *    nouvel enfant prenant le rang suivant.
 */
export function calculeTarifsInscription(params: {
  selectedSlotsData: WeeklySlot[];
  forfaits: Forfait[];
  selFamily: string;
  selChild: string;
  familyDiscountRules: RegleReductionFamille[];
  licenceFFE: boolean;
  licenceType: "moins18" | "plus18";
  adhesion: boolean;
}): TarifsInscription {
  const { selectedSlotsData, forfaits, selFamily, selChild, familyDiscountRules, licenceFFE, licenceType, adhesion } = params;

  const slotsPrices = selectedSlotsData.map(slot => {
    const price = slot.priceTTC || 0;
    const forfaitPrice = price > 100 ? price : price * slot.totalSessions;
    return { slot, forfaitPrice, sessions: slot.totalSessions };
  });
  const totalForfaitBrut = slotsPrices.reduce((sum, s) => sum + s.forfaitPrice, 0);

  // ── Réduction famille : compter les autres enfants de la même famille déjà inscrits ──
  const existingChildIds = selFamily
    ? [...new Set(forfaits.filter(f => f.familyId === selFamily && (f.status === "active" || f.status === "actif") && f.childId !== selChild).map(f => f.childId))]
    : [];
  const childRank = existingChildIds.length + 1; // 1er enfant = rang 1, 2ème = rang 2, etc.
  const familyRule = familyDiscountRules.find(r => r.nth === childRank);
  const familyDiscountPercent = familyRule?.discount || 0;
  const familyDiscountAmount = familyDiscountPercent > 0 ? Math.round(totalForfaitBrut * familyDiscountPercent / 100 * 100) / 100 : 0;
  const totalForfait = totalForfaitBrut - familyDiscountAmount;

  const licencePrice = licenceFFE ? (licenceType === "moins18" ? LICENCE_FFE_MOINS18 : LICENCE_FFE_PLUS18) : 0;
  const adhesionPrice = adhesion ? ADHESION_PRICE : 0;
  const grandTotal = totalForfait + licencePrice + adhesionPrice;

  return {
    slotsPrices, totalForfaitBrut, childRank, familyDiscountPercent, familyDiscountAmount,
    totalForfait, licencePrice, adhesionPrice, grandTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Affichage
// ─────────────────────────────────────────────────────────────────────────

/** Date Firestore (Timestamp, {seconds} ou date brute) en « 3 sept. 2025 ». */
export function formateDate(d: any): string {
  if (!d) return "—";
  const date = d.toDate ? d.toDate() : new Date(d.seconds ? d.seconds * 1000 : d);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
