/**
 * Disponibilités réelles du planning — source unique de vérité.
 *
 * Extrait tel quel de /api/admin/inbox-assistant : ce calcul était enfermé
 * dans la route, alors qu'il doit servir à TOUS les consommateurs qui
 * proposent des créneaux (assistant email, agent admin, et demain l'agent
 * téléphonique). Une seule implémentation = un seul endroit à corriger.
 *
 * Règles portées ici (ne pas les redécouvrir ailleurs) :
 *  - un créneau n'est proposable que si `maxPlaces - enrolled.length > 0` ;
 *  - un STAGE se réserve à la SEMAINE : les jours sont regroupés par
 *    `stageGroupId` (fallback `activityId`) + lundi de la semaine, et le
 *    `priceTTC` du créneau est le prix de la SEMAINE COMPLÈTE, pas du jour ;
 *  - les places d'un groupe = le MINIMUM des places de ses jours (il faut
 *    une place chaque jour pour inscrire la semaine) ;
 *  - les critères d'âge/galop viennent de `activities`, rapprochés par TITRE.
 */

// Jour + date en toutes lettres (ex "mardi 14 juillet 2026"). Copié à
// l'identique de inbox-assistant : la route les réimporte désormais d'ici.
export function labelFr(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Nom du jour seul (ex "samedi"). */
export function jourFr(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long" }).format(d);
}

export interface DispoOptions {
  /** Jour de départ (YYYY-MM-DD, Europe/Paris). */
  today: string;
  /** Nombre de jours lus après `today`. Défaut 63 (≈ 9 semaines). */
  horizonJours?: number;
  /**
   * Fenêtre explicite, prioritaire sur `today`/`horizonJours`.
   * Utilisée par l'assistant email, qui déduit la période demandée du mail
   * (passe Haiku) pour ne lire que les créneaux utiles.
   */
  start?: string;
  end?: string;
}

export interface DispoResult {
  /** Dernier jour lu (YYYY-MM-DD) — à annoncer à l'IA pour borner ses réponses. */
  horizon: string;
  /** Créneaux non-stage disponibles (liste complète, non échantillonnée). */
  autresDispo: any[];
  /** Liste bornée destinée à un prompt IA (stages + échantillon d'autres). */
  activitesDispo: any[];
  /** Semaines de stage disponibles, triées par date de début. */
  stagesDispo: any[];
  /** groupId → groupe autoritaire (avec creneauIds) pour vérification serveur. */
  stageGroupMap: Map<string, any>;
  /** creneauId → données autoritaires pour vérification serveur. */
  creneauMap: Map<string, any>;
}

export async function calculerDisponibilites(
  adminDb: FirebaseFirestore.Firestore,
  opts: DispoOptions
): Promise<DispoResult> {
  const today = opts.today;
  const debutLecture = opts.start || today;
  // Horizon de lecture borné (≈ 9 semaines) : couvre l'été/les demandes
  // courantes SANS lire tout un planning programmé loin (coût des lectures).
  // Au-delà, l'assistant invite la famille à préciser sa demande.
  const horizon =
    opts.end ||
    (() => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + (opts.horizonJours ?? 63));
      return d.toISOString().slice(0, 10);
    })();
  
  // ── 1. Créneaux à venir réellement disponibles (fenêtre bornée) ───
  const creSnap = await adminDb
    .collection("creneaux")
    .where("date", ">=", debutLecture)
    .where("date", "<=", horizon)
    .orderBy("date", "asc")
    .limit(1500)
    .get();
  
  const available: any[] = [];
  const creneauMap = new Map<string, any>(); // id → données serveur autoritaires
  
  // Critères d'éligibilité par activité (ageMin/ageMax/galopRequired), saisis
  // dans /admin/activites. Reliés au créneau par le titre d'activité.
  const eligByTitle = new Map<string, any>();
  try {
    const actSnap = await adminDb.collection("activities").get();
    actSnap.forEach((d) => {
      const a = d.data() as any;
      if (a.title) {
        eligByTitle.set(String(a.title).trim().toLowerCase(), {
          ageMin: typeof a.ageMin === "number" ? a.ageMin : null,
          ageMax: typeof a.ageMax === "number" ? a.ageMax : null,
          galopRequired: a.galopRequired || null,
          conditionsAcces: a.conditionsAcces || null,
        });
      }
    });
  } catch {
    /* pas d'activités → pas de critères */
  }
  creSnap.forEach((doc) => {
    const c = doc.data() as any;
    const enrolledCount = Array.isArray(c.enrolled) ? c.enrolled.length : 0;
    const spots = (c.maxPlaces || 0) - enrolledCount;
    const prixTTC =
      typeof c.priceTTC === "number"
        ? c.priceTTC
        : typeof c.priceHT === "number"
        ? Math.round(c.priceHT * (1 + (c.tvaTaux ?? 5.5) / 100) * 100) / 100
        : null;
    // On NE FILTRE PLUS sur spots > 0. Un stage complet retire de la liste
    // devient invisible pour l'IA, qui invente alors une explication plausible
    // et fausse ("nos stages commencent a 8 ans") au lieu de dire "complet".
    // Il est conserve, marque, et la verification serveur refuse toujours de
    // l'inscrire (places <= 0).
    {
      const isStage = (c.activityType || "") === "stage" || (c.activityType || "") === "stage_journee";
      const demiJourneeOuverte = isStage && !!c.allowDayBooking;
      const elig = eligByTitle.get(String(c.activityTitle || "").trim().toLowerCase()) || {};
      available.push({
        creneauId: doc.id,
        titre: c.activityTitle || "",
        type: c.activityType || "cours",
        date: c.date,
        jour: jourFr(c.date),
        horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
        places: spots > 0 ? spots : 0,
        complet: spots <= 0,
        prixTTC,
        demiJourneeOuverte,
        prixJour: demiJourneeOuverte && typeof c.priceTTCDay === "number" && c.priceTTCDay > 0 ? c.priceTTCDay : null,
        ageMin: elig.ageMin ?? null,
        ageMax: elig.ageMax ?? null,
        galopRequired: elig.galopRequired ?? null,
        conditionsAcces: elig.conditionsAcces ?? null,
        moniteur: c.monitor || "",
        // Clé de regroupement semaine (même logique que la page réservation famille)
        stageKey: (c.stageGroupId || c.activityId || "") + "",
        // Prix admin par nombre de jours (prioritaires en mode jours)
        pricePerCount: {
          1: typeof c.price1day === "number" && c.price1day > 0 ? c.price1day : null,
          2: typeof c.price2days === "number" && c.price2days > 0 ? c.price2days : null,
          3: typeof c.price3days === "number" && c.price3days > 0 ? c.price3days : null,
          4: typeof c.price4days === "number" && c.price4days > 0 ? c.price4days : null,
        } as Record<number, number | null>,
      });
      creneauMap.set(doc.id, {
        titre: c.activityTitle || "",
        type: c.activityType || "cours",
        date: c.date,
        horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
        spots: spots > 0 ? spots : 0,
        complet: spots <= 0,
        prixTTC,
        ageMin: elig.ageMin ?? null,
        ageMax: elig.ageMax ?? null,
      });
    }
  });
  // On borne la liste transmise à l'IA (évite un prompt géant) MAIS on garantit
  // la couverture de tout l'été : on inclut TOUS les stages (le produit que les
  // familles réservent, peu nombreux), puis on complète avec un échantillon des
  // autres activités réparti sur les dates (pas seulement les plus proches).
  const isStageType = (t: string) => t === "stage" || t === "stage_journee";
  const stagesJours = available.filter((a) => isStageType(a.type));
  const autresDispo = available.filter((a) => !isStageType(a.type));
  
  // ── Regroupement des stages en SEMAINES (même clé que la page réservation :
  //    stageGroupId (lot de création) + lundi de la semaine). Un "stage" pour
  //    une famille = la semaine entière ; le prix TTC du créneau est le prix
  //    SEMAINE. On propose donc des GROUPES, jamais des jours isolés.
  const mondayOf = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const groupMapTmp = new Map<string, any[]>();
  stagesJours.forEach((a) => {
    const key = `${a.stageKey}_${mondayOf(a.date)}`;
    if (!groupMapTmp.has(key)) groupMapTmp.set(key, []);
    groupMapTmp.get(key)!.push(a);
  });
  const stageGroupMap = new Map<string, any>(); // groupId → groupe autoritaire
  const stagesDispo: any[] = [];
  groupMapTmp.forEach((jours, key) => {
    jours.sort((x, y) => (x.date < y.date ? -1 : 1));
    const first = jours[0];
    const last = jours[jours.length - 1];
    // Places du groupe = minimum des places restantes sur les jours (il faut
    // une place chaque jour pour inscrire la semaine).
    const places = Math.max(0, Math.min(...jours.map((j) => j.places)));
    // Une semaine est complete des qu'UN de ses jours l'est : il faut une
    // place chaque jour pour inscrire la semaine.
    const complet = places <= 0;
    const groupe = {
      groupId: key,
      titre: first.titre,
      type: first.type,
      nbJours: jours.length,
      dateDebut: first.date,
      dateFin: last.date,
      periode:
        jours.length > 1
          ? `du ${jourFr(first.date)} ${labelFr(first.date).replace(/^\S+\s/, "")} au ${jourFr(last.date)} ${labelFr(last.date).replace(/^\S+\s/, "")}`
          : labelFr(first.date),
      // Jours détaillés : permet à l'IA de proposer un sous-ensemble (mode jours)
      joursDates: jours.map((j) => ({ date: j.date, jour: j.jour })),
      horaire: first.horaire,
      places,
      complet,
      prixSemaineTTC: first.prixTTC, // prix TTC du créneau = prix de la SEMAINE COMPLÈTE
      demiJourneeOuverte: jours.some((j) => j.demiJourneeOuverte),
      prixJour: jours.find((j) => j.prixJour)?.prixJour ?? null,
      ageMin: first.ageMin,
      ageMax: first.ageMax,
      galopRequired: first.galopRequired,
      conditionsAcces: first.conditionsAcces,
      moniteur: first.moniteur,
    };
    stagesDispo.push(groupe);
    stageGroupMap.set(key, {
      ...groupe,
      creneauIds: jours.map((j) => j.creneauId),
      joursDetail: jours.map((j) => ({ creneauId: j.creneauId, date: j.date, jour: j.jour, complet: j.complet })),
      pricePerCount: first.pricePerCount || {},
    });
  });
  stagesDispo.sort((x, y) => (x.dateDebut < y.dateDebut ? -1 : 1));
  // Échantillon d'"autres" réparti : 1 sur N pour couvrir toute la période.
  const autresAvecPlace = autresDispo.filter((a) => !a.complet);
  const stepAutres = Math.max(1, Math.ceil(autresAvecPlace.length / 50));
  const autresEchantillon = autresAvecPlace.filter((_, i) => i % stepAutres === 0).slice(0, 50);
  const activitesDispo = [...stagesDispo.slice(0, 120), ...autresEchantillon];

  return { horizon, autresDispo, activitesDispo, stagesDispo, stageGroupMap, creneauMap };
}
