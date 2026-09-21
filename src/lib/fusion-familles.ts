/**
 * src/lib/fusion-familles.ts — déplacer tout ce qu'une fiche famille porte
 * vers une autre fiche.
 *
 * Trois moments partagent ce geste :
 *  - la fusion de doublons décidée par l'admin (Cavaliers → Fusionner) ;
 *  - la première connexion d'un parent dont la fiche avait été créée au club :
 *    sa fiche est copiée sous l'identifiant de son compte, et l'ancienne doit
 *    passer le relais — commandes, réservations, places au planning, cartes,
 *    mandats. Jusqu'au 21/09/2026, elle était simplement SUPPRIMÉE : trois
 *    familles ont payé un acompte de stage le matin, se sont connectées
 *    l'après-midi, et leur fiche affichait Facturé 0 / Payé 0 ;
 *  - la réparation, depuis Cohérence, d'une commande restée sur une fiche
 *    disparue ou absorbée.
 *
 * Le journal des encaissements n'est jamais modifié (immuable, NF525) : il
 * suit les commandes par `paymentId`.
 */

import { adminDb } from "@/lib/firebase-admin";

/** Collections dont les documents portent `familyId` et suivent la famille. */
export const COLLECTIONS_SUIVANT_LA_FAMILLE = [
  "payments", "forfaits", "avoirs", "fidelite", "reservations", "devis",
  "cartes", "mandats-sepa", "echeances-sepa", "payment_declarations",
  "rattrapages", "recurrences", "waitlist", "bonsRecup",
] as const;

const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dateKey = (b: any): string => {
  if (!b) return "";
  const d = typeof b?.toDate === "function" ? b.toDate() : new Date(b);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
export const nomCavalier = (c: any) => `${c?.firstName || ""} ${c?.lastName || ""}`.trim() || c?.name || "sans nom";

export interface AppariementEnfants {
  /** id d'un enfant de la fiche absorbée → enfant conservé qu'il désigne. */
  correspondances: Map<string, any>;
  /** Enfants de la fiche absorbée sans équivalent : à ajouter à la conservée. */
  aAjouter: any[];
}

/**
 * Les deux fiches d'un doublon portent souvent les MÊMES enfants sous des ids
 * différents (fiche recréée à la connexion du parent, enfant re-saisi). On
 * reconnaît un même cavalier par prénom (sans accents ni majuscules) + date de
 * naissance identiques — le NOM peut différer (coquille, nom de l'autre
 * parent). Un enfant présent sous le même id des deux côtés (fiche copiée) n'a
 * rien à faire. Pur : testable sans base.
 */
export function apparierEnfants(enfantsConserves: any[], enfantsAbsorbes: any[]): AppariementEnfants {
  const idsConserves = new Set((enfantsConserves || []).map((c: any) => c?.id));
  const correspondances = new Map<string, any>();
  const aAjouter: any[] = [];
  for (const c of enfantsAbsorbes || []) {
    if (!c) continue;
    if (idsConserves.has(c.id)) continue; // strictement le même enregistrement
    const candidats = (enfantsConserves || []).filter((k: any) => norm(k?.firstName) && norm(k.firstName) === norm(c.firstName));
    // Date identique d'abord ; à défaut, prénom seul quand une date manque
    // d'un côté. Deux dates renseignées et DIFFÉRENTES = deux enfants.
    const exact = candidats.find((k: any) => dateKey(k.birthDate) && dateKey(k.birthDate) === dateKey(c.birthDate));
    const souple = candidats.find((k: any) => !dateKey(k.birthDate) || !dateKey(c.birthDate));
    const cible = exact || souple;
    if (cible && c.id) correspondances.set(c.id, cible);
    else aAjouter.push(c);
  }
  return { correspondances, aAjouter };
}

/** Une fiche candidate au rattachement, telle qu'on a besoin de la juger. */
export interface FicheCandidate {
  id: string;
  status?: string | null;
  children?: any[] | null;
}

/**
 * Parmi les fiches portant l'adresse d'un compte, laquelle lui appartient ?
 *
 * Sa propre fiche ne compte pas, une fiche déjà absorbée non plus. Une fiche
 * avec des cavaliers l'emporte sur une fiche vide : c'est celle du bureau,
 * celle qu'on cherche. Deux fiches avec des cavaliers à la même adresse, on
 * ne tranche pas — donner les enfants d'une famille à une autre serait pire
 * que de ne rien faire, et l'écran des comptes orphelins le signalera.
 */
export function choisirFicheARattacher<T extends FicheCandidate>(candidates: T[], uid: string): T | null {
  const utiles = (candidates || []).filter((f) => f && f.id !== uid && f.status !== "merged");
  const avecCavaliers = utiles.filter((f) => Array.isArray(f.children) && f.children.length > 0);
  if (avecCavaliers.length === 1) return avecCavaliers[0];
  if (avecCavaliers.length > 1) return null;
  return utiles.length === 1 ? utiles[0] : null;
}

/**
 * Le contenu d'une fiche rattachée à un compte.
 *
 * La fiche du bureau fait foi : c'est elle qui porte les cavaliers, l'adresse
 * postale, le téléphone. Mais ce que la famille avait saisi de son côté, sur
 * la fiche vide créée à sa première connexion, n'est pas perdu pour autant :
 * tout champ que le bureau n'a pas rempli garde la valeur du compte.
 */
export function fusionnerChampsFiche(
  ficheDuCompte: Record<string, any>,
  ficheDuBureau: Record<string, any>,
): Record<string, any> {
  const resultat: Record<string, any> = { ...(ficheDuCompte || {}) };
  for (const [cle, valeur] of Object.entries(ficheDuBureau || {})) {
    if (!champVide(valeur) || champVide(resultat[cle])) resultat[cle] = valeur;
  }
  return resultat;
}

const champVide = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Champs jamais recopiés d'une fiche absorbée : ils désignent le compte, ou
 * sont gérés ailleurs dans la fusion.
 */
const CHAMPS_NON_TRANSFERABLES = new Set([
  "id", "authUid", "authProvider", "parentEmail", "children",
  "status", "mergedInto", "mergedAt", "createdAt", "updatedAt",
]);

/**
 * Ce que la fiche absorbée peut apporter à la fiche conservée : le téléphone,
 * l'adresse postale, la civilité — tout ce que le bureau avait saisi et que
 * l'espace créé par la famille n'a pas.
 *
 * Uniquement les TROUS : un champ déjà rempli côté conservé n'est jamais
 * écrasé. « Conserver » doit vouloir dire quelque chose.
 */
export function champsACompleter(
  ficheConservee: Record<string, any>,
  ficheAbsorbee: Record<string, any>,
): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const [cle, valeur] of Object.entries(ficheAbsorbee || {})) {
    if (CHAMPS_NON_TRANSFERABLES.has(cle)) continue;
    if (champVide(valeur)) continue;
    if (!champVide((ficheConservee || {})[cle])) continue;
    patch[cle] = valeur;
  }
  return patch;
}

export interface ApercuFusion {
  keep: { id: string; name: string; email: string };
  merge: { id: string; name: string; email: string; existe: boolean };
  enfantsConserves: string[];
  enfantsDeplaces: string[];
  enfantsAjoutes: number;
  enfantsFusionnes: { de: string; vers: string }[];
  reassign: Record<string, number>;
  creneauxTouches: number;
}

async function commitInBatches(ops: { ref: FirebaseFirestore.DocumentReference; data: any }[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = adminDb.batch();
    ops.slice(i, i + 450).forEach((o) => batch.set(o.ref, o.data, { merge: true }));
    await batch.commit();
  }
}

/**
 * Fusionne `mergeId` dans `keepId`. La fiche absorbée peut ne plus exister
 * (supprimée par l'ancien rattachement de compte) : on repointe alors tout ce
 * qui la référence encore, sans rien avoir à marquer.
 *
 * `dryRun` : ne modifie rien, renvoie ce qui serait déplacé.
 */
export async function fusionnerFamilles(params: {
  keepId: string;
  mergeId: string;
  dryRun?: boolean;
  /** Qui a décidé : email de l'admin, ou « system:lier-compte ». */
  mergedBy: string;
}): Promise<{ apercu: ApercuFusion; applique: boolean }> {
  const { keepId, mergeId, dryRun = false, mergedBy } = params;
  if (!keepId || !mergeId || keepId === mergeId) throw new Error("keepId/mergeId invalides");

  const keepSnap = await adminDb.collection("families").doc(keepId).get();
  if (!keepSnap.exists) throw new Error("fiche conservée introuvable");
  const mergeSnap = await adminDb.collection("families").doc(mergeId).get();
  const keep = keepSnap.data() as any;
  const merge = (mergeSnap.exists ? mergeSnap.data() : {}) as any;
  const keepName = keep.parentName || "";

  const { correspondances, aAjouter } = apparierEnfants(keep.children || [], merge.children || []);
  const cibleDe = (childId?: string) => (childId ? correspondances.get(childId) : null);
  const repointage = (dd: any) => {
    const cible = cibleDe(dd?.childId);
    return {
      familyId: keepId, familyName: keepName,
      ...(cible ? { childId: cible.id, childName: nomCavalier(cible) } : {}),
    };
  };

  // Documents qui suivent la famille.
  const counts: Record<string, number> = {};
  const reassignOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
  for (const coll of COLLECTIONS_SUIVANT_LA_FAMILLE) {
    try {
      const snap = await adminDb.collection(coll).where("familyId", "==", mergeId).get();
      if (snap.size === 0) continue;
      counts[coll] = snap.size;
      snap.docs.forEach((d) => reassignOps.push({ ref: d.ref, data: repointage(d.data()) }));
    } catch (e) {
      console.warn(`[fusion-familles] ${coll} illisible :`, e);
    }
  }

  // Places au planning : les entrées `enrolled` de la fiche absorbée.
  const crSnap = await adminDb.collection("creneaux").get();
  const creneauOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
  crSnap.docs.forEach((d) => {
    const c = d.data() as any;
    const enrolled = Array.isArray(c.enrolled) ? c.enrolled : [];
    if (!enrolled.some((e: any) => e?.familyId === mergeId)) return;
    const nouveau = enrolled.map((e: any) => (e?.familyId !== mergeId ? e : { ...e, ...repointage(e) }));
    creneauOps.push({ ref: d.ref, data: { enrolled: nouveau } });
  });

  const apercu: ApercuFusion = {
    keep: { id: keepId, name: keep.parentName || "", email: keep.parentEmail || "" },
    merge: { id: mergeId, name: merge.parentName || "", email: merge.parentEmail || "", existe: mergeSnap.exists },
    enfantsConserves: (keep.children || []).map(nomCavalier),
    enfantsDeplaces: aAjouter.map(nomCavalier),
    enfantsAjoutes: aAjouter.length,
    enfantsFusionnes: [...correspondances.entries()].map(([id, k]) => {
      const src = (merge.children || []).find((c: any) => c.id === id);
      return { de: nomCavalier(src || {}), vers: nomCavalier(k) };
    }),
    reassign: counts,
    creneauxTouches: creneauOps.length,
  };
  if (dryRun) return { apercu, applique: false };

  await commitInBatches(reassignOps);
  await commitInBatches(creneauOps);

  // Cavaliers de la fiche absorbée, et ce qu'elle seule savait : téléphone,
  // adresse postale, civilité. L'espace créé par une famille n'a souvent que
  // son adresse email ; sans cela, la fusion lui ferait perdre le reste.
  const complements = champsACompleter(keep, merge);
  if (aAjouter.length > 0 || Object.keys(complements).length > 0) {
    await adminDb.collection("families").doc(keepId).set(
      {
        ...complements,
        ...(aAjouter.length > 0 ? { children: [...(keep.children || []), ...aAjouter] } : {}),
      },
      { merge: true },
    );
  }
  // Continuité de connexion : si le conservé n'a pas d'auth et l'absorbé oui,
  // on repointe l'email de connexion vers le conservé.
  if (mergeSnap.exists && !keep.authUid && merge.authUid && merge.parentEmail) {
    await adminDb.collection("families").doc(keepId).set({ parentEmail: merge.parentEmail }, { merge: true });
  }
  // La fiche absorbée reste, marquée (réversible, et la connexion sur son
  // ancien identifiant bascule vers la conservée).
  if (mergeSnap.exists) {
    await adminDb.collection("families").doc(mergeId).set(
      { status: "merged", mergedInto: keepId, mergedAt: new Date(), children: [] }, { merge: true },
    );
  }
  await adminDb.collection("family-merges").add({
    keepId, mergeId, keepName, mergeName: merge.parentName || "",
    mergeExistait: mergeSnap.exists,
    counts, enfantsAjoutes: aAjouter.length, creneauxTouches: creneauOps.length,
    // Paires d'ids appariés (absorbé -> conservé) : indispensable pour
    // comprendre, après coup, où sont passées les références d'un cavalier.
    enfantsApparies: [...correspondances.entries()].map(([de, k]) => ({ de, vers: k.id })),
    mergedBy, mergedAt: new Date(),
  });
  return { apercu, applique: true };
}
