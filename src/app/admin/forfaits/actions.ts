/**
 * src/app/admin/forfaits/actions.ts
 *
 * Les écritures Firestore de l'écran « Forfaits annuels » : créer une
 * inscription à l'année, désinscrire un cavalier de tous ses cours, retirer
 * un seul créneau hebdomadaire, changer un créneau pour un autre.
 *
 * Pourquoi séparé : chacune de ces opérations parcourt des centaines de
 * créneaux de la saison et écrit dans plusieurs collections (creneaux,
 * forfaits, reservations, payments, avoirs, encaissements). Ce sont les
 * seules parties de l'écran qui modifient de la facturation réelle, et elles
 * représentaient à elles quatre plus du tiers du fichier. Rassemblées ici,
 * elles se relisent sans le JSX, et les garde-fous (séances clôturées
 * préservées, bornes de saison, capacité des créneaux) se voient d'un coup.
 *
 * Contrairement à `planning-firestore.ts`, ces fonctions parlent à
 * l'utilisateur (confirm / prompt / alert) : la proposition d'avoir est
 * entrelacée avec les écritures, et la sortir d'ici aurait demandé de
 * réécrire la logique — ce que ce découpage s'interdit. Elles ne touchent en
 * revanche à aucun état React : le rafraîchissement et les indicateurs de
 * chargement restent chez l'appelant.
 */

import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Family } from "@/types";
import { authFetch } from "@/lib/auth-fetch";
import { createEncaissement } from "@/lib/compta-encaissement";
import { NOMS_JOURS_DEPUIS_DIMANCHE } from "./constantes";
import { bornesSaisonForfait, debutEffectif, normaliseTitre, normaliseTitreAvecApostrophes } from "./calculs";
import type { PrixCreneau } from "./calculs";
import type { AncienCreneau, Creneau, Forfait, WeeklySlot } from "./types";

/**
 * Crée une inscription annuelle complète : inscription du cavalier à toutes
 * les séances des créneaux choisis, document(s) forfait, réservations et
 * paiement en attente.
 *
 * Ne capture pas les erreurs : c'est l'appelant qui les présente.
 * Retourne le nombre de séances concernées, pour le message de confirmation.
 */
export async function creerForfaitAnnuel(params: {
  selFamily: string;
  selChild: string;
  childName: string;
  fam: Family & { firestoreId: string };
  creneaux: Creneau[];
  selectedSlotsData: WeeklySlot[];
  slotsPrices: PrixCreneau[];
  frequence: "1x" | "2x" | "3x";
  licenceFFE: boolean;
  licenceType: "moins18" | "plus18";
  adhesion: boolean;
  payPlan: "1x" | "3x" | "10x";
  licencePrice: number;
  adhesionPrice: number;
  grandTotal: number;
  childRank: number;
  familyDiscountPercent: number;
  familyDiscountAmount: number;
}): Promise<number> {
  const {
    selFamily, selChild, childName, fam, creneaux, selectedSlotsData, slotsPrices,
    frequence, licenceFFE, licenceType, adhesion, payPlan,
    licencePrice, adhesionPrice, grandTotal, childRank, familyDiscountPercent, familyDiscountAmount,
  } = params;

  // 1. Batch enroll child in all creneaux for selected slots
  const allCreneauIds = selectedSlotsData.flatMap(s => s.creneauIds);
  // Précalcul des forfaitIds par slotKey (rempli après la création des forfaits)
  // En attendant, on marque l'enrolled avec paymentSource pour que la
  // désinscription d'UN créneau crée un rattrapage et non un avoir.
  for (const creneauId of allCreneauIds) {
    const creneau = creneaux.find(c => c.id === creneauId);
    if (!creneau) continue;
    if ((creneau.enrolled || []).some((e: any) => e.childId === selChild)) continue;
    const newEnrolled = [...(creneau.enrolled || []), {
      childId: selChild,
      childName,
      familyId: selFamily,
      familyName: fam.parentName || "—",
      enrolledAt: new Date().toISOString(),
      // Marqueur : inscription couverte par un forfait annuel.
      // handleUnenroll utilise ce flag pour ne PAS créer d'avoir
      // mais un simple rattrapage. forfaitId reste null ici car le
      // forfait est créé juste après ; la détection par activité +
      // jour + heure prendra le relais si besoin.
      paymentSource: "forfait",
      forfaitId: null,
    }];
    await updateDoc(doc(db, "creneaux", creneauId), {
      enrolled: newEnrolled,
      enrolledCount: newEnrolled.length,
    });
  }

  // 2. Create forfait document(s)
  // Saison FFE de la création : aujourd'hui → si mois >= sept, Y, sinon Y-1.
  // Sert au filtrage rangEnfantFamille pour ne pas mélanger les saisons.
  const _now = new Date();
  const _seasonStartYear = _now.getMonth() >= 8 ? _now.getFullYear() : _now.getFullYear() - 1;
  for (const sp of slotsPrices) {
    await addDoc(collection(db, "forfaits"), {
      familyId: selFamily,
      familyName: fam.parentName || "—",
      childId: selChild,
      childName,
      slotKey: `${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}`,
      activityTitle: sp.slot.activityTitle,
      dayLabel: sp.slot.dayLabel,
      startTime: sp.slot.startTime,
      endTime: sp.slot.endTime,
      totalSessions: sp.sessions,
      attendedSessions: 0,
      licenceFFE,
      licenceType,
      adhesion,
      forfaitPriceTTC: sp.forfaitPrice,
      totalPaidTTC: 0,
      paymentPlan: payPlan,
      status: "active",
      frequence,
      creneauIds: sp.slot.creneauIds,
      seasonStartYear: _seasonStartYear,
      createdAt: serverTimestamp(),
    });
  }

  // 3. Create reservation records
  for (const sp of slotsPrices) {
    await addDoc(collection(db, "reservations"), {
      familyId: selFamily,
      familyName: fam.parentName || "—",
      childId: selChild,
      childName,
      activityTitle: sp.slot.activityTitle,
      activityType: "cours",
      type: "annual",
      forfaitType: frequence,
      slotKey: sp.slot.key,
      dayOfWeek: sp.slot.dayOfWeek,
      dayLabel: sp.slot.dayLabel,
      startTime: sp.slot.startTime,
      endTime: sp.slot.endTime,
      totalSessions: sp.sessions,
      creneauIds: sp.slot.creneauIds,
      status: "confirmed",
      createdAt: serverTimestamp(),
    });
  }

  // 4. Create payment record
  await addDoc(collection(db, "payments"), {
    familyId: selFamily,
    familyName: fam.parentName || "—",
    childId: selChild,
    childName,
    type: "inscription_annuelle",
    forfaitType: frequence,
    items: [
      ...(licenceFFE ? [{ activityTitle: `Licence FFE (${licenceType === "moins18" ? "-18" : "+18"})`, priceTTC: licencePrice }] : []),
      ...(adhesion ? [{ activityTitle: "Adhésion annuelle", priceTTC: adhesionPrice }] : []),
      ...slotsPrices.map(sp => ({
        activityTitle: `Forfait ${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}`,
        priceTTC: sp.forfaitPrice,
      })),
      ...(familyDiscountAmount > 0 ? [{ activityTitle: `Réduction famille (${childRank}ème enfant, -${familyDiscountPercent}%)`, priceTTC: -familyDiscountAmount }] : []),
    ],
    totalTTC: grandTotal,
    paidAmount: 0,
    paymentMode: "pending",
    paymentRef: payPlan !== "1x" ? payPlan : "",
    status: "pending",
    date: serverTimestamp(),
  });

  return allCreneauIds.length;
}

/**
 * Désinscrit un cavalier de TOUS ses cours annuels futurs (via l'API
 * /api/admin/unenroll-annual), résilie le forfait, puis propose un avoir au
 * prorata des séances non effectuées.
 *
 * Retourne `true` si la désinscription a réussi — à charge de l'appelant de
 * recharger les données. En cas d'échec côté API, le message d'erreur est
 * affiché ici et la fonction retourne `false`.
 */
export async function desinscrireDeTousLesCoursAnnuels(f: Forfait): Promise<boolean> {
  const res = await authFetch("/api/admin/unenroll-annual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childId: f.childId, childName: f.childName, familyId: f.familyId }),
  });
  const data = await res.json();
  if (!data.success) {
    alert(`❌ Erreur : ${data.error}`);
    return false;
  }

  await updateDoc(doc(db, "forfaits", f.id), { status: "cancelled", updatedAt: serverTimestamp() });

  // ── Proposition d'avoir au prorata des seances non effectuees ──
  // (demande Nicolas, option C : case a cocher + montant pre-rempli
  // modifiable). On ne cree un avoir QUE si l'admin le confirme, car
  // ce n'est pas systematique (depend du motif de depart et du
  // reglement interieur du club).
  const prix = f.forfaitPriceTTC || 0;
  const dejaPaye = f.totalPaidTTC || 0;
  const total = f.totalSessions || 0;
  const faites = f.attendedSessions || 0;
  const restantes = Math.max(0, total - faites);

  // Prorata sur ce qui a ete REELLEMENT paye (on ne fait pas d'avoir
  // sur de l'argent non encaisse). Arrondi a 2 decimales.
  const prorataPaye = (dejaPaye > 0 && total > 0)
    ? Math.round((dejaPaye / total) * restantes * 100) / 100
    : 0;

  if (dejaPaye > 0 && prorataPaye > 0) {
    const proposer = confirm(
      `✅ ${data.message}\n\n` +
      `${f.childName} a payé ${dejaPaye.toFixed(2)}€ sur ${total} séances.\n` +
      `Séances effectuées : ${faites} · non effectuées : ${restantes}\n\n` +
      `Veux-tu créer un AVOIR pour les séances non effectuées ?\n` +
      `Montant proposé (prorata) : ${prorataPaye.toFixed(2)}€\n\n` +
      `OK = créer l'avoir · Annuler = ne rien créer`
    );

    if (proposer) {
      // Permettre d'ajuster le montant (geste commercial, frais retenus...)
      const saisie = prompt(
        `Montant de l'avoir en € (modifiable) :`,
        prorataPaye.toFixed(2)
      );
      const montant = saisie !== null ? parseFloat(saisie.replace(",", ".")) : NaN;
      if (!isNaN(montant) && montant > 0) {
        try {
          const expiry = new Date();
          expiry.setMonth(expiry.getMonth() + 12); // avoir valable 12 mois
          const refAvoir = `AV-${Date.now().toString(36).toUpperCase()}`;
          await addDoc(collection(db, "avoirs"), {
            familyId: f.familyId,
            familyName: f.childName ? `${f.childName}` : "",
            type: "avoir",
            amount: montant,
            usedAmount: 0,
            remainingAmount: montant,
            reason: `Désinscription forfait ${f.activityTitle || ""} — ${restantes} séance(s) non effectuée(s) sur ${total}`,
            reference: refAvoir,
            expiryDate: Timestamp.fromDate(expiry),
            status: "actif",
            usageHistory: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          // Trace comptable (encaissement negatif = dette envers la famille)
          try {
            await createEncaissement({
              paymentId: "",
              familyId: f.familyId,
              familyName: f.childName || "",
              montant: -montant,
              mode: "avoir",
              modeLabel: "Avoir",
              raison: `Avoir ${refAvoir} — désinscription forfait`,
            });
          } catch (e) { console.warn("Encaissement avoir:", e); }
          alert(`✅ Avoir de ${montant.toFixed(2)}€ créé (réf ${refAvoir}). Visible dans le menu Avoirs.`);
        } catch (e) {
          console.error("Création avoir:", e);
          alert("⚠️ La désinscription a réussi mais la création de l'avoir a échoué. Crée-le manuellement dans le menu Avoirs.");
        }
      }
    }
  }

  return true;
}

/**
 * Retire UN seul créneau hebdo (les futurs cours du même jour+heure+activité
 * jusqu'a la fin de saison), sans toucher au forfait ni au paiement.
 *
 * `slotsAvantRetrait` et `montantDejaPaye` sont mesurés par l'appelant AVANT
 * l'appel : le calcul de l'avoir a besoin de l'état d'avant retrait, et le
 * déduire après coup (par un « +1 ») s'était révélé faux.
 *
 * `rafraichir` est appelé avant chaque sortie qui a modifié des données.
 */
export async function retirerCreneauHebdo(params: {
  forfait: Forfait;
  slot: { key: string; dayLabel: string; startTime: string; activityTitle: string };
  creneaux: Creneau[];
  slotsAvantRetrait: number;
  montantDejaPaye: number;
  rafraichir: () => Promise<void> | void;
}): Promise<void> {
  const { forfait: f, slot, creneaux, slotsAvantRetrait, montantDejaPaye, rafraichir } = params;

  const today = new Date().toISOString().split("T")[0];
  const seasonEnd = bornesSaisonForfait(f).fin;
  const dayNames = NOMS_JOURS_DEPUIS_DIMANCHE;
  const slotDow = dayNames.indexOf(slot.dayLabel);

  // Normalisation tolérante (apostrophes typographiques, accents, casse)
  const normalize = normaliseTitreAvecApostrophes;
  const slotTitleNorm = normalize(slot.activityTitle);

  // Compteurs de debug pour comprendre pourquoi le retrait peut renvoyer 0
  let removed = 0;
  let candidatesMatched = 0;
  let skippedClosed = 0;
  let skippedNotEnrolled = 0;
  let skippedTitleMismatch = 0;

  for (const c of creneaux) {
    const cAny = c as any;
    if (cAny.date < today || cAny.date > seasonEnd) continue;
    const dow = new Date(cAny.date + "T12:00:00").getDay();
    if (dow !== slotDow) continue;
    if (cAny.startTime !== slot.startTime) continue;
    // A ce point on a un créneau qui matche jour+heure ; on regarde si
    // c'est bien la bonne activite et si Eliot est inscrit
    candidatesMatched++;
    const enrolled = cAny.enrolled || [];
    if (!enrolled.some((e: any) => e.childId === f.childId)) {
      skippedNotEnrolled++;
      continue;
    }
    // Match plus tolérant : normalize avec apostrophes/accents
    if (normalize(cAny.activityTitle) !== slotTitleNorm) {
      skippedTitleMismatch++;
      console.warn("[handleRemoveSlot] Title mismatch:", { creneau: cAny.activityTitle, slot: slot.activityTitle });
      continue;
    }
    if (cAny.status === "closed") {
      skippedClosed++;
      continue;
    }
    const newEnrolled = enrolled.filter((e: any) => e.childId !== f.childId);
    await updateDoc(doc(db, "creneaux", cAny.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
    removed++;
  }
  console.log(`[handleRemoveSlot] Retiré ${removed} ; candidats=${candidatesMatched}, !inscrit=${skippedNotEnrolled}, !titre=${skippedTitleMismatch}, clôturés=${skippedClosed}`);

  if (removed === 0) {
    const details: string[] = [];
    if (candidatesMatched === 0) details.push(`Aucun créneau ${slot.dayLabel} ${slot.startTime} trouvé sur la saison du forfait.`);
    if (skippedNotEnrolled > 0) details.push(`${skippedNotEnrolled} créneaux trouvés mais ${f.childName} n'y est pas inscrit(e).`);
    if (skippedTitleMismatch > 0) details.push(`${skippedTitleMismatch} créneaux trouvés mais avec un autre titre (voir console).`);
    if (skippedClosed > 0) {
      details.push(`${skippedClosed} séance(s) où ${f.childName} est inscrit(e) mais clôturée(s) (préservées par défaut).`);
    }
    // Si le SEUL cas qui restait est "clôturé" : proposer de forcer
    if (skippedClosed > 0 && skippedNotEnrolled === 0 || (skippedClosed > 0 && removed === 0)) {
      const force = confirm(
        `⚠️ Aucune séance retirée.\n\n${details.join("\n")}\n\n` +
        `Forcer le retrait des ${skippedClosed} séance(s) clôturée(s) ?\n` +
        `Attention : ces séances ne devraient normalement pas être clôturées dans le futur. ` +
        `Forcer leur retrait peut être une bonne idée si c'est un résidu de test.`
      );
      if (force) {
        let forcedRemoved = 0;
        for (const c of creneaux) {
          const cAny = c as any;
          if (cAny.date < today || cAny.date > seasonEnd) continue;
          if (cAny.status !== "closed") continue;
          const dow = new Date(cAny.date + "T12:00:00").getDay();
          if (dow !== slotDow) continue;
          if (cAny.startTime !== slot.startTime) continue;
          if (normalize(cAny.activityTitle) !== slotTitleNorm) continue;
          const enrolled = cAny.enrolled || [];
          if (!enrolled.some((e: any) => e.childId === f.childId)) continue;
          const newEnrolled = enrolled.filter((e: any) => e.childId !== f.childId);
          await updateDoc(doc(db, "creneaux", cAny.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
          forcedRemoved++;
        }
        alert(`✅ ${forcedRemoved} séance(s) clôturée(s) forcée(s) en retrait.`);
        await rafraichir();
        return;
      }
    } else {
      alert(`⚠️ Aucune séance retirée.\n\n${details.join("\n")}`);
    }
  } else {
    alert(`✅ ${f.childName} retiré(e) de ${removed} séance(s) sur ${slot.dayLabel} ${slot.startTime}`);

    // ── Proposition d'avoir au cas par cas (demande Nicolas) ──
    // Quand on retire UN cours d'un forfait DEJA PAYE, proposer un avoir.
    // Montant suggere = prix paye / nb total de creneaux du forfait (part
    // d'un cours). Pre-rempli mais modifiable, et entierement optionnel.
    const dejaPaye = montantDejaPaye;
    if (dejaPaye > 0) {
      // Nombre de creneaux AVANT retrait, capture en debut de fonction
      // (avant toute modif) -> fiable, contrairement a un "+1" deduit.
      const slotsAvant = slotsAvantRetrait;
      const partUnCours = slotsAvant > 0
        ? Math.round((dejaPaye / slotsAvant) * 100) / 100
        : 0;

      if (partUnCours > 0) {
        const proposer = confirm(
          `Ce forfait est payé (${dejaPaye.toFixed(2)}€ pour ${slotsAvant} cours).\n\n` +
          `Tu viens de retirer 1 cours. Veux-tu créer un AVOIR pour ce cours retiré ?\n` +
          `Montant proposé : ${partUnCours.toFixed(2)}€ (part d'un cours)\n\n` +
          `OK = créer l'avoir · Annuler = ne rien créer`
        );
        if (proposer) {
          const saisie = prompt(`Montant de l'avoir en € (modifiable) :`, partUnCours.toFixed(2));
          const montant = saisie !== null ? parseFloat(saisie.replace(",", ".")) : NaN;
          if (!isNaN(montant) && montant > 0) {
            try {
              const expiry = new Date();
              expiry.setMonth(expiry.getMonth() + 12);
              const refAvoir = `AV-${Date.now().toString(36).toUpperCase()}`;
              await addDoc(collection(db, "avoirs"), {
                familyId: f.familyId,
                familyName: f.familyName || f.childName || "",
                type: "avoir",
                amount: montant,
                usedAmount: 0,
                remainingAmount: montant,
                reason: `Retrait du cours ${slot.activityTitle} (${slot.dayLabel} ${slot.startTime}) — forfait ${f.activityTitle || ""}`,
                reference: refAvoir,
                expiryDate: Timestamp.fromDate(expiry),
                status: "actif",
                usageHistory: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              try {
                await createEncaissement({
                  paymentId: "",
                  familyId: f.familyId,
                  familyName: f.childName || "",
                  montant: -montant,
                  mode: "avoir",
                  modeLabel: "Avoir",
                  raison: `Avoir ${refAvoir} — retrait cours forfait`,
                });
              } catch (e) { console.warn("Encaissement avoir:", e); }
              alert(`✅ Avoir de ${montant.toFixed(2)}€ créé (réf ${refAvoir}). Visible dans le menu Avoirs.`);
            } catch (e) {
              console.error("Création avoir:", e);
              alert("⚠️ Le cours a été retiré mais la création de l'avoir a échoué. Crée-le manuellement dans le menu Avoirs.");
            }
          }
        }
      }
    }
  }
  await rafraichir();
}

/**
 * Déplace un forfait vers un autre créneau : désinscription des séances de
 * l'ancien, inscription dans celles du nouveau, mise à jour du document
 * forfait. Les paiements ne sont PAS modifiés.
 *
 * Si `oldSlot` est fourni, seul ce créneau précis bouge ; sinon (comportement
 * legacy des forfaits 1×/sem qui changent de jour) tous les créneaux du
 * cavalier sont remplacés.
 *
 * Ne capture pas les erreurs : c'est l'appelant qui les présente.
 */
export async function changerCreneauForfait(params: {
  forfait: Forfait;
  newSlot: WeeklySlot;
  oldSlot?: AncienCreneau;
}): Promise<void> {
  const { forfait, newSlot, oldSlot } = params;

  // 1. Désinscrire de tous les créneaux futurs NON-CLÔTURÉS de la SAISON DU FORFAIT
  // Si oldSlot fourni : on filtre AUSSI par jour+heure+activite pour ne
  // toucher qu'au créneau précis qu'on change.
  const today = new Date().toISOString().split("T")[0];
  // ── Borne fin de saison : depend du forfait, pas d'aujourd'hui ─────
  // Le forfait stocke seasonStartYear (annee de debut de saison FFE).
  // La saison va de 1er sept Y au 30 juin Y+1.
  // Si seasonStartYear absent (forfaits anciens), fallback sur aujourd'hui :
  //   - mois >= sept → Y/Y+1, fin = juin Y+1
  //   - mois < sept → Y-1/Y, fin = juin Y
  const { debut: _seasonStartStr, fin: _seasonEndStr } = bornesSaisonForfait(forfait);
  // Borne basse effective : si le forfait est pour une saison future, on
  // veut quand meme respecter today (pas inscrire dans le passe). Si la
  // saison du forfait a deja commence, on prend max(seasonStart, today).
  const _effectiveStartStr = debutEffectif(today, _seasonStartStr);

  const futureSnap = await getDocs(query(
    collection(db, "creneaux"),
    where("date", ">=", _effectiveStartStr),
    where("date", "<=", _seasonEndStr),
  ));
  let removed = 0;
  let skippedClosed = 0;
  for (const d of futureSnap.docs) {
    const data = d.data();
    // Ignorer les créneaux clôturés (l'historique reste intact)
    if (data.status === "closed") {
      const hasChildClosed = (data.enrolled || []).some((e: any) => e.childId === forfait.childId);
      if (hasChildClosed) skippedClosed++;
      continue;
    }
    // Si oldSlot fourni : ne toucher QUE les créneaux qui correspondent
    // au slot precis qu'on change (même jour, même heure, même activite).
    // Sans oldSlot : on touche tous les créneaux ou l'enfant est inscrit
    // (comportement legacy pour les forfaits 1x/sem qui changent de jour).
    if (oldSlot) {
      const dow = new Date(data.date + "T12:00:00").getDay();
      if (dow !== oldSlot.dayOfWeek) continue;
      if (data.startTime !== oldSlot.startTime) continue;
      if (data.activityTitle !== oldSlot.activityTitle) continue;
    }
    const enrolled = data.enrolled || [];
    const hasChild = enrolled.some((e: any) => e.childId === forfait.childId);
    if (hasChild && data.activityType !== "stage" && data.activityType !== "stage_journee") {
      const newEnrolled = enrolled.filter((e: any) => e.childId !== forfait.childId);
      await updateDoc(doc(db, "creneaux", d.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
      removed++;
    }
  }
  console.log(`📋 Désinscrit de ${removed} créneaux (${skippedClosed} clôturés préservés, borne ${_seasonEndStr}${oldSlot ? ", slot précis" : ", tous slots"})`);

  // 2. Inscrire dans les nouveaux créneaux (tous les futurs du même jour+heure+activité)
  // Match plus tolérant que l'exact match du titre, pour gérer :
  //  - les renommages d'activités entre saisons (ex: "Galop 3-5" → "Galop 3-5 ados")
  //  - les accents et casse différents
  // Stratégie : activityId identique OU titre normalisé identique.
  // Normalisation : lowercase + suppression des accents + trim + espaces multiples.
  const normalize = normaliseTitre;
  const newSlotTitleNorm = normalize(newSlot.activityTitle);

  // ── Borne de fin de saison ─────────────────────────────────────
  // On reutilise la même borne que pour la phase de desinscription
  // (calculee plus haut, _seasonEndStr). Le but : que le transfert reste
  // dans la SAISON DU FORFAIT, et n'aille pas deborder sur saison
  // suivante (qui sera une nouvelle inscription a part).
  const seasonEndStr = _seasonEndStr;

  let added = 0;
  let skippedFull = 0;
  let skippedOffSeason = 0;
  for (const d of futureSnap.docs) {
    const data = d.data();
    if (data.status === "closed") continue; // pas de réinscription sur clôturé
    // Borne fin de saison : ignorer tout créneau au-delà du 30 juin
    if (data.date > seasonEndStr) {
      // On ne compte que ceux qui matchent par ailleurs (sinon le compteur
      // exploserait avec tous les créneaux de la prochaine saison).
      const matchAct = (data.activityId && newSlot.activityId && data.activityId === newSlot.activityId)
        || normalize(data.activityTitle) === newSlotTitleNorm;
      if (matchAct && data.startTime === newSlot.startTime
          && new Date(data.date + "T12:00:00").getDay() === newSlot.dayOfWeek) {
        skippedOffSeason++;
      }
      continue;
    }
    // Match : activityId identique OU titre normalisé identique
    const matchByActivityId = data.activityId && newSlot.activityId && data.activityId === newSlot.activityId;
    const matchByTitle = normalize(data.activityTitle) === newSlotTitleNorm;
    if (
      (matchByActivityId || matchByTitle) &&
      data.startTime === newSlot.startTime &&
      new Date(data.date + "T12:00:00").getDay() === newSlot.dayOfWeek &&
      data.date >= _effectiveStartStr
    ) {
      const enrolled = data.enrolled || [];
      // Vérifier la capacité du créneau (ne pas surcharger un cours plein)
      if (enrolled.length >= (data.maxPlaces || 99)) {
        skippedFull++;
        continue;
      }
      if (!enrolled.some((e: any) => e.childId === forfait.childId)) {
        enrolled.push({
          childId: forfait.childId, childName: forfait.childName,
          familyId: forfait.familyId, familyName: forfait.familyName,
          enrolledAt: new Date().toISOString(),
          // Marquage forfait pour visibilité (badge vert émeraude au lieu de gris)
          paymentSource: "forfait",
          forfaitId: forfait.id,
        });
        await updateDoc(doc(db, "creneaux", d.id), { enrolled, enrolledCount: enrolled.length });
        added++;
      }
    }
  }
  console.log(`📋 Inscrit dans ${added} nouveaux créneaux (borne saison ${seasonEndStr})${skippedFull > 0 ? ` (${skippedFull} pleins ignorés)` : ""}${skippedOffSeason > 0 ? ` (${skippedOffSeason} hors saison ignorés)` : ""}`);

  // 3. Mettre à jour le forfait
  const newSlotKey = `${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}`;
  await updateDoc(doc(db, "forfaits", forfait.id), {
    slotKey: newSlotKey,
    activityTitle: newSlot.activityTitle,
    dayLabel: newSlot.dayLabel,
    startTime: newSlot.startTime,
    endTime: newSlot.endTime,
    updatedAt: serverTimestamp(),
  });

  const parts = [
    `✅ Créneau modifié !`,
    ``,
    `${forfait.childName} est maintenant inscrit(e) en ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}`,
    ``,
    `${removed} ancien(s) créneau(x) retiré(s)`,
    `${added} nouveau(x) créneau(x) ajouté(s)`,
  ];
  if (skippedClosed > 0) parts.push(`${skippedClosed} créneau(x) clôturé(s) préservé(s) (historique intact)`);
  if (skippedFull > 0) parts.push(`⚠️ ${skippedFull} créneau(x) ignoré(s) car COMPLET(S)`);
  parts.push(``, `Paiements inchangés.`);
  alert(parts.join("\n"));
}
