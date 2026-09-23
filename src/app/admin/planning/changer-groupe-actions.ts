/**
 * src/app/admin/planning/changer-groupe-actions.ts
 *
 * L'exécution d'un changement de groupe. Les règles — ce qui coince, ce que
 * devient le prix, ce que devient la ligne de commande — sont dans
 * `@/lib/changement-groupe` et se testent sans base. Ici, uniquement les
 * lectures et les écritures Firestore, dans un ordre qui ne laisse jamais le
 * cavalier nulle part.
 *
 * L'ordre compte :
 *   1. on REJOINT d'abord le nouveau groupe. Si une place vient d'être prise
 *      entre l'ouverture de l'écran et la validation, l'inscription échoue et
 *      on s'arrête là : le cavalier n'a pas bougé ;
 *   2. on quitte ensuite l'ancien ;
 *   3. on retaille la ligne de commande ;
 *   4. on prévient la liste d'attente, s'il y a lieu.
 */

import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  createReservation, createAvoir, deleteReservations,
  enrollChildInCreneau, findStageCreneaux, removeChildFromCreneau,
} from "@/lib/planning-services";
import { planifierChangementGroupe, type CreneauStage, type PlanChangementGroupe } from "@/lib/changement-groupe";
import { notifierListeAttenteSiPlaceLibre } from "./inscription-actions";

export interface CibleChangement {
  /** Les jours du stage visé, déjà chargés par l'écran. */
  creneaux: (CreneauStage & { id: string })[];
  periodeId?: string | null;
}

export interface ContexteChangement {
  creneauId: string;
  childId: string;
  /** Tous les créneaux connus de l'écran, pour repérer un conflit d'horaire. */
  creneauxConnus: CreneauStage[];
  periodeSource?: string | null;
}

/**
 * Rassemble l'état nécessaire au plan : les jours du stage actuel, la ligne de
 * commande qui les porte, et ce qui a déjà été encaissé dessus.
 */
export async function prepererChangement(
  ctx: ContexteChangement,
  cible: CibleChangement,
): Promise<{ plan: PlanChangementGroupe; paymentId: string | null; childName: string; familyId: string; familyName: string } | null> {
  const snap = await getDoc(doc(db, "creneaux", ctx.creneauId));
  if (!snap.exists()) return null;
  const creneau = { id: snap.id, ...snap.data() } as any;
  const inscrit = (creneau.enrolled || []).find((e: any) => e.childId === ctx.childId);
  if (!inscrit) return null;

  // Les jours du stage actuel où l'enfant est effectivement inscrit : un
  // cavalier venu « une journée seulement » ne doit pas être délogé des jours
  // où il n'est pas.
  const tousLesJours = await findStageCreneaux(creneau.activityTitle, creneau.date);
  const source = (tousLesJours as any[]).filter((c) =>
    (c.enrolled || []).some((e: any) => e.childId === ctx.childId));

  // La ligne de commande : on la cherche par le stageKey porté par
  // l'inscription, qui est la seule clé fiable entre les deux (cf. types.ts).
  const { payment, item } = await trouverLigneDeStage(inscrit.familyId, ctx.childId, inscrit.stageKey, creneau.activityTitle);
  const dejaEncaisse = payment ? await sommeEncaissements(payment.id) : 0;

  const plan = planifierChangementGroupe({
    childId: ctx.childId,
    childName: inscrit.childName || "",
    source: source.length > 0 ? source : [creneau],
    cible: cible.creneaux,
    creneauxConnus: ctx.creneauxConnus,
    item,
    autresItems: (payment?.items || []).filter((i: any) => i !== item),
    dejaEncaisse,
    numeroFacture: payment?.invoiceNumber || null,
    periodeSource: ctx.periodeSource ?? null,
    periodeCible: cible.periodeId ?? null,
  });

  return {
    plan,
    paymentId: payment?.id || null,
    childName: inscrit.childName || "",
    familyId: inscrit.familyId,
    familyName: inscrit.familyName || "",
  };
}

/** La commande et la ligne qui portent ce stage pour cet enfant. */
async function trouverLigneDeStage(
  familyId: string, childId: string, stageKey: string | undefined, activityTitle: string,
): Promise<{ payment: any | null; item: any | null }> {
  const snap = await getDocs(query(collection(db, "payments"), where("familyId", "==", familyId)));
  for (const d of snap.docs) {
    const p = { id: d.id, ...d.data() } as any;
    if (p.status === "cancelled") continue;
    const items = p.items || [];
    // 1. La clé du stage, posée sur l'inscription comme sur la ligne.
    if (stageKey) {
      const parCle = items.find((i: any) => i.childId === childId && i.stageKey === stageKey);
      if (parCle) return { payment: p, item: parCle };
    }
    // 2. Repli pour les inscriptions antérieures au stageKey : le titre.
    const parTitre = items.find((i: any) =>
      i.childId === childId && String(i.activityTitle || "").includes(activityTitle));
    if (parTitre) return { payment: p, item: parTitre };
  }
  return { payment: null, item: null };
}

async function sommeEncaissements(paymentId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", paymentId)));
  return snap.docs.reduce((s, d) => s + (Number(d.data().montant) || 0), 0);
}

export interface ResultatChangement {
  ok: boolean;
  message: string;
  refAvoir?: string;
}

/**
 * Applique un plan validé. Le plan doit venir de `prepererChangement` :
 * on ne recalcule rien ici, mais on revérifie qu'il est jouable.
 */
export async function appliquerChangement(
  ctx: ContexteChangement,
  cible: CibleChangement,
  prepare: NonNullable<Awaited<ReturnType<typeof prepererChangement>>>,
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void,
): Promise<ResultatChangement> {
  if (!prepare.plan.possible) return { ok: false, message: prepare.plan.blocages.join(" ") };

  // L'écran a pu rester ouvert le temps qu'une place se prenne ailleurs.
  // `enrollChildInCreneau` n'arbitre pas la capacité — c'est volontaire, un
  // admin doit pouvoir surbooker sciemment — donc le seul garde-fou est ce
  // recalcul, fait à la seconde où l'on valide.
  const frais = await prepererChangement(ctx, cible);
  if (!frais) return { ok: false, message: "L'inscription de départ est introuvable." };
  if (!frais.plan.possible) return { ok: false, message: frais.plan.blocages.join(" ") };

  const { plan, paymentId, childName, familyId, familyName } = frais;

  const snap = await getDoc(doc(db, "creneaux", ctx.creneauId));
  if (!snap.exists()) return { ok: false, message: "Le créneau de départ n'existe plus." };
  const creneauSource = { id: snap.id, ...snap.data() } as any;
  const inscrit = (creneauSource.enrolled || []).find((e: any) => e.childId === ctx.childId);
  if (!inscrit) return { ok: false, message: `${childName} n'est plus inscrit(e) à ce stage.` };

  // ── 1. Rejoindre le nouveau groupe ─────────────────────────────────────
  const nouvelleInscription = {
    ...inscrit,
    stageKey: plan.stageKeyCible,
    enrolledAt: inscrit.enrolledAt || new Date().toISOString(),
    deplaceLe: new Date().toISOString(),
  };
  const rejoints: string[] = [];
  for (const id of plan.rejoindre) {
    const ok = await enrollChildInCreneau(id, nouvelleInscription as any);
    if (!ok) {
      // Place prise entre-temps : on défait ce qu'on vient de poser et on
      // laisse le cavalier là où il était.
      for (const dejaFait of rejoints) {
        await removeChildFromCreneau(dejaFait, ctx.childId);
        await deleteReservations(dejaFait, ctx.childId);
      }
      return { ok: false, message: `Impossible d'inscrire ${childName} dans le nouveau groupe — rien n'a été modifié.` };
    }
    rejoints.push(id);
    const jour = cible.creneaux.find((c) => c.id === id);
    if (jour) await createReservation(nouvelleInscription as any, jour);
  }

  // ── 2. Quitter l'ancien ────────────────────────────────────────────────
  for (const id of plan.quitter) {
    await removeChildFromCreneau(id, ctx.childId);
    await deleteReservations(id, ctx.childId);
  }

  // Les jours communs aux deux groupes gardent l'inscription, mais leur clé
  // de stage doit suivre, sinon la ligne de commande ne les reconnaît plus.
  const communs = cible.creneaux
    .map((c) => c.id!)
    .filter((id) => id && !plan.rejoindre.includes(id));
  for (const id of communs) await reposerStageKey(id, ctx.childId, plan.stageKeyCible);

  // ── 3. Retailler la ligne de commande ──────────────────────────────────
  let refAvoir: string | undefined;
  if (paymentId && plan.itemModifie) {
    const paySnap = await getDoc(doc(db, "payments", paymentId));
    const items = (paySnap.data()?.items || []) as any[];
    // On retrouve la ligne par sa clé d'origine : l'index aurait pu bouger.
    const ancienneCle = (plan.itemModifie as any)._deplaceDepuis?.stageKey;
    const ancienTitre = (plan.itemModifie as any)._deplaceDepuis?.activityTitle;
    const nouveauxItems = items.map((i) => {
      const cest = i.childId === ctx.childId
        && (ancienneCle ? i.stageKey === ancienneCle : i.activityTitle === ancienTitre);
      return cest ? plan.itemModifie : i;
    });
    await updateDoc(doc(db, "payments", paymentId), {
      items: nouveauxItems,
      totalTTC: plan.totalCommande,
      paidAmount: plan.paidAmount,
      status: plan.statut,
      updatedAt: serverTimestamp(),
    });

    if (plan.avoir > 0) {
      refAvoir = await createAvoir(
        familyId, familyName, plan.avoir,
        `Changement de groupe ${childName} — ${creneauSource.activityTitle} → ${cible.creneaux[0]?.activityTitle || ""}`,
        paymentId, "desinscription",
      );
    }
  }

  // ── 4. Liste d'attente ─────────────────────────────────────────────────
  // Uniquement quand le cavalier quitte vraiment le stage : changer de groupe
  // à l'intérieur d'un même stage ne libère rien au niveau de la semaine, et
  // prévenir une famille pour une place qu'elle ne pourra pas prendre est pire
  // que se taire.
  if (plan.notifierListeAttente) {
    for (const id of plan.quitter) {
      const libre = await getDoc(doc(db, "creneaux", id));
      if (libre.exists()) await notifierListeAttenteSiPlaceLibre(id, { id, ...libre.data() }, toast);
    }
  }

  const suite = plan.ecart === 0
    ? "même tarif"
    : `${plan.ecart > 0 ? "+" : ""}${plan.ecart.toFixed(2)}€ pour la famille`;
  return {
    ok: true,
    refAvoir,
    message: `${childName} déplacé(e) vers « ${cible.creneaux[0]?.activityTitle} » (${suite})`,
  };
}

/** Met à jour la clé de stage d'une inscription conservée sur un jour commun. */
async function reposerStageKey(creneauId: string, childId: string, stageKey: string) {
  const snap = await getDoc(doc(db, "creneaux", creneauId));
  if (!snap.exists()) return;
  const enrolled = (snap.data().enrolled || []) as any[];
  if (!enrolled.some((e) => e.childId === childId)) return;
  await updateDoc(doc(db, "creneaux", creneauId), {
    enrolled: enrolled.map((e) => (e.childId === childId ? { ...e, stageKey } : e)),
  });
}
