"use client";

/**
 * src/app/admin/comptabilite/useRapprochement.ts
 *
 * Le rapprochement bancaire : lecture du relevé, rapprochement automatique
 * avec les encaissements, et report du résultat dans la base.
 *
 * C'était le plus gros morceau de l'écran comptable — plus de mille deux
 * cents lignes de logique mêlées au rendu. Le comportement est repris tel
 * quel, y compris les protections apprises en production :
 *
 *   - un encaissement, un bordereau, un paiement ne sont consommés qu'une
 *     fois, pour que deux lignes de même montant ne se partagent pas la même
 *     recette ;
 *   - un pointage manuel ou ignoré survit à un nouvel import du relevé ;
 *   - on ne dépointe que dans le mois du relevé importé, sans quoi un CSV
 *     partiel effaçait le pointage des mois précédents ;
 *   - les lignes sont rangées dans le document du mois correspondant à leur
 *     propre date, et non à celle du relevé, à cause des relevés à cheval.
 */

import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { enregistrerEncaissement } from "@/lib/encaissement";
import {
  analyserPeriodeCsv,
  cleLigneBancaire,
  dateBancaireIso,
  encaissementsCouvertsParLigne,
  parserCsvBancaire,
} from "./rapprochement-utils";
import { rapprocherReleve } from "./rapprochement-matching";

/** Une ligne du relevé bancaire, telle qu'affichée et telle qu'enregistrée. */
export interface LigneBancaire {
  date: string;
  label: string;
  amount: number;
  matched: boolean;
  matchType: string;
  matchDetail: string;
  matchedEncs?: { familyName: string; montant: number; date: string; activityTitle: string; mode: string }[];
  missingAmounts?: number[];
  manualPaymentId?: string;
  /** Remise de prélèvements SEPA à laquelle la ligne est rapprochée. */
  remiseSepaId?: string;
  uncertain?: boolean;
}

export interface DonneesRapprochement {
  payments: any[];
  remises: any[];
  remisesSepa: any[];
  encaissementsCompta: any[];
  /** Mois affiché (YYYY-MM). */
  period: string;
  /** Rechargement des données de l'écran après une écriture. */
  fetchData: () => void;
}

export function useRapprochement({
  payments, remises, remisesSepa, encaissementsCompta, period, fetchData,
}: DonneesRapprochement) {
  const [bankLines, setBankLines] = useState<LigneBancaire[]>([]);

  // ─────────────────────────────────────────────────────────────────────────
  //  encaisserPaiementsPointes : une facture en attente pointée sur une ligne
  //  du relevé est ENCAISSÉE, pas seulement marquée « réglée ».
  //
  //  Avant, pointer un virement attendu se contentait de passer le paiement à
  //  « paid » : pas d'écriture au journal, pas de numéro de facture, et le
  //  mode restait vide. La somme était pourtant bien reçue. On passe donc par
  //  enregistrerEncaissement, la même porte que la caisse (journal chaîné
  //  NF525, numéro séquentiel, points de fidélité), avec la date et le libellé
  //  de la banque.
  //
  //  Règles :
  //   - une ligne « à vérifier » (uncertain) n'encaisse rien : le lien est
  //     posé, l'écriture attend la confirmation de Nicolas ;
  //   - une facture déjà soldée n'est pas ré-encaissée, on la marque juste
  //     rapprochée ;
  //   - une facture en échéancier SEPA se règle par la remise, jamais ici ;
  //   - la clé de la ligne bancaire est écrite sur l'encaissement : relancer
  //     la synchronisation ne crée pas de doublon.
  // ─────────────────────────────────────────────────────────────────────────
  const encaisserPaiementsPointes = async (lines: LigneBancaire[]) => {
    let nbEncaisses = 0;
    for (const bl of lines) {
      if (!bl.matched || bl.uncertain || bl.matchType === "Ignoré" || !bl.manualPaymentId) continue;
      const pid = bl.manualPaymentId;
      try {
        const pSnap = await getDoc(doc(db, "payments", pid));
        if (!pSnap.exists()) continue;
        const p = pSnap.data() as any;
        if (p.status === "cancelled" || p.status === "sepa_scheduled") continue;
        if (p.status === "paid") {
          if (!p.reconciledByBank) await updateDoc(doc(db, "payments", pid), { reconciledByBank: true });
          continue;
        }
        const cle = cleLigneBancaire(bl);
        const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", pid)));
        if (encSnap.docs.some(d => (d.data() as any).bankLineKey === cle)) {
          // Déjà encaissée par cette ligne (synchronisation relancée).
          if (!p.reconciledByBank) await updateDoc(doc(db, "payments", pid), { reconciledByBank: true });
          continue;
        }
        await enregistrerEncaissement(
          pid, p, bl.amount, "virement",
          `Virement reçu le ${bl.date} — ${bl.label.slice(0, 80)}`,
          "",
          dateBancaireIso(bl.date),
          {
            bankLineKey: cle,
            bankLineLabel: bl.label,
            reconciledByBank: true,
            reconciledAt: serverTimestamp(),
          },
        );
        await updateDoc(doc(db, "payments", pid), { reconciledByBank: true });
        nbEncaisses++;
      } catch (e) {
        console.error(`[encaisser-pointes] paiement ${pid} :`, e);
      }
    }
    if (nbEncaisses > 0) console.log(`[encaisser-pointes] ✅ ${nbEncaisses} virement(s) encaissé(s) au journal`);
    return nbEncaisses;
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  syncReconciledFromBankLines : synchronise reconciledByBank sur les
  //  encaissements et payments en fonction des bankLines actuelles.
  //
  //  - Tout encaissement présent dans matchedEncs d'une bankLine matchée
  //    (hors "Ignoré") passe à reconciledByBank=true.
  //  - Tout encaissement qui avait reconciledByBank=true mais qui n'est plus
  //    référencé par aucune bankLine matchée → reconciledByBank=false.
  //  - Même logique pour les payments virement via manualPaymentId.
  //
  //  Pour éviter de casser des rapprochements antérieurs (périodes précédentes),
  //  on ne dé-marque QUE les encs dont la date appartient à la période courante.
  //  ─────────────────────────────────────────────────────────────────────────
  const syncReconciledFromBankLines = async (lines: typeof bankLines) => {
    try {
      // 1. Construire l'ensemble cible des encs et payments à marquer rapprochés
      const targetEncIds = new Set<string>();
      const targetPaymentIds = new Set<string>();

      for (const bl of lines) {
        if (!bl.matched) continue;
        if (bl.matchType === "Ignoré") continue;

        if (bl.manualPaymentId) {
          targetPaymentIds.add(bl.manualPaymentId);
          // Les écritures de cette facture que la banque vient de créditer —
          // le virement encaissé à la caisse ou par le pointage lui-même, la
          // CB passée au terminal — sont couvertes par cette ligne. Sans ce
          // lien, l'écriture restait « à remettre » et une écriture créée au
          // pointage était dé-marquée à la synchronisation suivante.
          if (!bl.uncertain) {
            const duPaiement = encaissementsCompta.filter((e: any) => e.paymentId === bl.manualPaymentId);
            for (const e of encaissementsCouvertsParLigne(bl, duPaiement)) targetEncIds.add(e.id);
          }
        }

        // Pour chaque encs référencé dans matchedEncs, on prend UN candidat
        // pas encore consommé. C'est crucial : une remise "Sous-ensemble CB
        // Terminal" peut contenir plusieurs encs du même jour, même famille,
        // même montant (ex: 3 promenades de 25€ pour la même famille). Sans
        // déduplication via consumedEncIds, find() renvoie toujours le même
        // premier candidat → un seul enc marqué reconciledByBank au lieu de N.
        for (const enc of (bl.matchedEncs || [])) {
          const candidate = encaissementsCompta.find((e: any) => {
            if (targetEncIds.has(e.id)) return false; // déjà consommé
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
            return (e.familyName || "") === enc.familyName
              && Math.abs((e.montant || 0) - enc.montant) < 0.02
              && d === enc.date;
          });
          if (candidate) targetEncIds.add(candidate.id);
        }
      }

      // 2. Encaissements : marquer ceux qui doivent l'être, dé-marquer ceux
      //    qui ne le sont plus (uniquement dans la période courante).
      const encUpdates: Promise<any>[] = [];
      for (const e of encaissementsCompta) {
        const wasReconciled = Boolean(e.reconciledByBank);
        const shouldBeReconciled = targetEncIds.has(e.id);
        if (shouldBeReconciled && !wasReconciled) {
          encUpdates.push(updateDoc(doc(db, "encaissements", e.id), {
            reconciledByBank: true,
            reconciledAt: serverTimestamp(),
          }));
        } else if (!shouldBeReconciled && wasReconciled) {
          // Ne dé-marquer que si l'enc est dans la période courante
          const encDate = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (encDate) {
            const pm = `${encDate.getFullYear()}-${String(encDate.getMonth() + 1).padStart(2, "0")}`;
            if (pm === period) {
              encUpdates.push(updateDoc(doc(db, "encaissements", e.id), {
                reconciledByBank: false,
                reconciledAt: null,
              }));
            }
          }
        }
      }

      // 3. Factures pointées : encaissées au journal (ou simplement marquées
      //    rapprochées si déjà soldées), cf. encaisserPaiementsPointes.
      await encaisserPaiementsPointes(lines);

      // Dé-marquer les payments précédemment rapprochés qui ne sont plus cibles
      const paymentUpdates: Promise<any>[] = [];
      for (const p of payments) {
        if (!p.reconciledByBank) continue;
        if (targetPaymentIds.has(p.id)) continue;
        if (p.paymentMode !== "virement" && p.paymentMode) continue;
        // Uniquement période courante
        const pd = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
        if (!pd) continue;
        const pm = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
        if (pm !== period) continue;
        // Une facture dont le virement est au journal reste réglée : dé-pointer
        // ne retire que le lien avec la banque (le journal est inaltérable, une
        // erreur se corrige par contre-passation à la caisse). Seule une facture
        // marquée réglée SANS écriture — l'ancien pointage — revient en attente.
        const aUneEcriture = encaissementsCompta.some((e: any) => e.paymentId === p.id && (e.montant || 0) > 0);
        paymentUpdates.push(updateDoc(doc(db, "payments", p.id), aUneEcriture
          ? { reconciledByBank: false }
          : { status: "pending", paidAmount: 0, reconciledByBank: false }));
      }

      if (encUpdates.length > 0 || paymentUpdates.length > 0) {
        await Promise.all([...encUpdates, ...paymentUpdates]);
        console.log(`[sync-reconciled] ✅ ${encUpdates.length} enc(s) + ${paymentUpdates.length} payment(s) mis à jour`);
      }

      // 4. Remises : pointer celles dont tous les encs sont rapprochés
      // IMPORTANT : on n'agit que sur les remises de la période courante.
      // Sans ce filtre, travailler sur mai dépointerait des remises d'avril
      // (leurs encs ne sont pas dans targetEncIds qui ne reflète que les
      // bankLines de la période courante).
      const remiseUpdates: Promise<any>[] = [];
      for (const r of (remises || [])) {
        const encIds = r.encaissementIds || [];
        if (encIds.length === 0) continue;

        // Filtre période : ne traiter que les remises créées dans le mois courant
        const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
        if (!rDate) continue;
        const rPeriod = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, "0")}`;
        if (rPeriod !== period) continue;

        const allConsumed = encIds.every((id: string) => targetEncIds.has(id));
        if (allConsumed && !r.pointee) {
          remiseUpdates.push(updateDoc(doc(db, "remises", r.id), {
            pointee: true,
            pointeeDate: new Date().toISOString(),
            pointeeNote: "Synchronisation automatique depuis le rapprochement bancaire",
            updatedAt: serverTimestamp(),
          }));
        } else if (!allConsumed && r.pointee && r.pointeeNote?.includes("Synchronisation")) {
          // Dé-pointer UNIQUEMENT si c'était une remise pointée automatiquement
          // (on ne touche pas aux remises pointées manuellement par l'utilisateur)
          remiseUpdates.push(updateDoc(doc(db, "remises", r.id), {
            pointee: false,
            pointeeDate: null,
            pointeeNote: null,
            updatedAt: serverTimestamp(),
          }));
        }
      }
      if (remiseUpdates.length > 0) {
        await Promise.all(remiseUpdates);
        console.log(`[sync-reconciled] ✅ ${remiseUpdates.length} remise(s) (dé)pointée(s)`);
      }
    } catch (e) {
      console.error("[sync-reconciled] Erreur:", e);
    }
  };

  // Sauvegarder les bankLines dans Firestore après modification manuelle
  const updateAndSaveBankLines = async (updated: typeof bankLines) => {
    setBankLines(updated);
    try {
      // Sauvegarder en groupant par mois (chaque bankLine va dans le doc
      // rapprochements/{YYYY-MM} correspondant à sa propre date, pas la
      // période active. Cf. saveBankLinesByMonth pour le détail.)
      await saveBankLinesByMonth(updated);
      // Synchroniser reconciledByBank sur encs/payments/remises
      await syncReconciledFromBankLines(updated);
      // Synchroniser les versements bancaires du livre de caisse
      await syncVersementsEspeces(updated);
      // Rafraîchir les données pour que l'UI reflète les changements
      fetchData();
    } catch (e) { console.error("Erreur sauvegarde rapprochement:", e); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  saveBankLinesByMonth : sauvegarde les bankLines en les routant chacune
  //  dans le doc rapprochements/{YYYY-MM} correspondant à SA date.
  //
  //  Avant ce helper, toutes les bankLines étaient sauvegardées dans le doc
  //  de la période active à l'import, ce qui créait des doublons quand on
  //  importait un CSV à cheval sur plusieurs mois (bug rapporté par Nicolas).
  //
  //  Le helper :
  //  1. Groupe les bankLines par mois selon bl.date (format DD/MM/YYYY)
  //  2. Pour chaque mois concerné : récupère le doc existant, fusionne les
  //     bankLines (par bankLineKey = date|label|amount), réécrit le doc.
  //  3. Les bankLines de l'état courant écrasent celles du doc existant
  //     (clés identiques) — c'est l'intention : on remonte les pointages
  //     que l'utilisateur vient de modifier.
  //
  //  Note : cette fonction NE PURGE PAS les bankLines orphelines qui
  //  pourraient exister dans des docs d'autres mois. Pour ça, voir
  //  /api/admin/migrate-bankLines (étape 1 de la migration).
  // ─────────────────────────────────────────────────────────────────────────
  // mode "user-update" : les nouvelles bankLines écrasent les anciennes (intentionnel
  //   pour remonter une modif utilisateur de pointage / dépointage / Détail CA).
  // mode "csv-import" : on préserve toujours les pointages existants — une bankLine
  //   réimportée en mode "À traiter" ne doit JAMAIS écraser un pointage manuel posé
  //   précédemment (bug rencontré par Nicolas le 28/04 après réimport CSV qui avait
  //   tout dépointé). Si la nouvelle apporte un nouveau pointage (matched: true), on
  //   le prend ; sinon on garde l'existant.
  const saveBankLinesByMonth = async (
    lines: typeof bankLines,
    mode: "user-update" | "csv-import" = "user-update"
  ) => {
    // 1. Grouper par mois (YYYY-MM extrait de DD/MM/YYYY)
    const byMonth: Record<string, typeof bankLines> = {};
    for (const bl of lines) {
      const m = bl.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) {
        console.warn("[saveBankLinesByMonth] bankLine sans date parseable:", bl);
        continue;
      }
      const ym = `${m[3]}-${m[2].padStart(2, "0")}`;
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(bl);
    }

    // 2. Pour chaque mois : merge avec le doc existant
    for (const [ym, blGroup] of Object.entries(byMonth)) {
      try {
        const existingSnap = await getDoc(doc(db, "rapprochements", ym));
        const existingBls: any[] = (existingSnap.exists() ? (existingSnap.data() as any).bankLines : []) || [];

        // Map des bankLines à fusionner par clé "date|label|amount"
        const keyOf = (b: any) => `${b.date}|${b.label}|${Math.round(b.amount * 100)}`;
        const merged = new Map<string, any>();
        for (const eb of existingBls) merged.set(keyOf(eb), eb);
        for (const nb of blGroup) {
          const key = keyOf(nb);
          const existing = merged.get(key);
          const incoming = {
            date: nb.date, label: nb.label, amount: nb.amount,
            matched: nb.matched, matchType: nb.matchType, matchDetail: nb.matchDetail,
            matchedEncs: nb.matchedEncs || null,
            missingAmounts: nb.missingAmounts || null,
            manualPaymentId: nb.manualPaymentId || null,
            remiseSepaId: nb.remiseSepaId || null,
            uncertain: nb.uncertain || false,
          };

          if (mode === "csv-import" && existing && existing.matched && !incoming.matched) {
            // L'existante est pointée et la nouvelle (du CSV) ne l'est pas → on
            // CONSERVE l'existante. C'est le cas typique d'un réimport CSV : une
            // remise CB qu'on a pointée à la main via "Détail CA" doit garder son
            // pointage même si le CSV la réimporte avec matched=false par défaut.
            continue;
          }
          merged.set(key, incoming);
        }
        const allBls = Array.from(merged.values());

        await setDoc(doc(db, "rapprochements", ym), {
          period: ym,
          bankLines: allBls,
          totalLines: allBls.length,
          totalMatched: allBls.filter((b: any) => b.matched).length,
          totalAmount: Math.round(allBls.reduce((s: number, b: any) => s + (b.amount || 0), 0) * 100) / 100,
          updatedAt: serverTimestamp(),
        });
        console.log(`[saveBankLinesByMonth] ✅ ${ym} : ${allBls.length} bankLines (${blGroup.length} de cette session, mode=${mode})`);
      } catch (e) {
        console.error(`[saveBankLinesByMonth] erreur sur ${ym}:`, e);
        throw e;
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  syncVersementsEspeces : synchronise les sorties du livre de caisse
  //  avec les lignes bancaires de type versement d'espèces
  // ─────────────────────────────────────────────────────────────────────────
  //  Pour chaque bankLine matchée de libellé "VERSEMENT D'ESPECES..." on veut :
  //    - s'il n'existe pas d'encaissement especes négatif avec bankLineKey correspondant → on le crée
  //    - s'il existe mais la bankLine n'est plus matchée → on le supprime
  //  La "bankLineKey" est un identifiant stable : date|label|amount.
  //  Tag Firestore : isVersementBanque=true, bankLineKey="..."
  //
  //  Note : on ne fait ça QUE pour les VERSEMENT D'ESPECES (pas les chèques/CB
  //  car ces encaissements physiques sont déjà comptabilisés individuellement
  //  et les remises ne sortent pas du livre de caisse espèces).
  // ─────────────────────────────────────────────────────────────────────────
  const syncVersementsEspeces = async (lines: typeof bankLines) => {
    try {
      // Charger tous les versements existants (encaissements avec isVersementBanque=true)
      const snap = await getDocs(query(collection(db, "encaissements"), where("isVersementBanque", "==", true)));
      const existing = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const existingByKey = new Map<string, any>();
      for (const v of existing) {
        if (v.bankLineKey) existingByKey.set(v.bankLineKey, v);
      }

      // Parcourir les bankLines et créer/supprimer les versements
      for (const bl of lines) {
        const isVersement = bl.label.toUpperCase().includes("VERSEMENT") &&
          (bl.label.toUpperCase().includes("ESPECE") || bl.label.toUpperCase().includes("ESP."));
        if (!isVersement) continue;

        const key = `${bl.date}|${bl.label}|${bl.amount.toFixed(2)}`;
        const existingVers = existingByKey.get(key);

        // bankLine rapprochée (auto ou manuelle) et pas "Ignoré" → il FAUT un versement
        const shouldExist = bl.matched && bl.matchType !== "Ignoré";

        if (shouldExist && !existingVers) {
          // Créer le versement
          const p1 = bl.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          const bankDateObj = p1
            ? new Date(`${p1[3]}-${p1[2].padStart(2, "0")}-${p1[1].padStart(2, "0")}T12:00:00`)
            : new Date();
          await addDoc(collection(db, "encaissements"), {
            mode: "especes",
            modeLabel: "Versement banque",
            montant: -Math.abs(bl.amount),
            date: bankDateObj,
            familyName: "—",
            activityTitle: "Versement en banque",
            raison: `Versement bancaire auto (rapprochement du ${bl.date})`,
            ref: `VERS-${bankDateObj.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.round(bl.amount)}`,
            isVersementBanque: true,
            bankLineKey: key,
            bankLineLabel: bl.label,
            bankLineAmount: bl.amount,
            createdAt: serverTimestamp(),
          });
          console.log(`[sync-versements] ✅ Versement créé pour "${bl.label}" (${bl.amount}€)`);
        } else if (!shouldExist && existingVers) {
          // Supprimer le versement (bankLine dé-pointée ou ignorée)
          await deleteDoc(doc(db, "encaissements", existingVers.id));
          console.log(`[sync-versements] 🗑️ Versement supprimé pour "${bl.label}" (${bl.amount}€)`);
        }
      }
    } catch (e) {
      console.error("[sync-versements] Erreur:", e);
    }
  };
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;

      // ─────────────────────────────────────────────────────────────────────
      //  Garde-fou : detection de la periode reellement contenue dans le CSV
      // ─────────────────────────────────────────────────────────────────────
      // Le Credit Agricole renvoie une ligne "Liste des operations du compte
      // entre le DD/MM/YYYY et le DD/MM/YYYY" en debut de fichier. Si Nicolas
      // se trompe dans son filtre cote banque (intervalle inverse, dates
      // futures non encore comptabilisees, etc.), le CSV peut ne contenir
      // qu'une periode tronquee, voire une seule journee.
      // On lit cette ligne et on previent au moindre doute :
      //   - periode tres courte (< 3 jours)
      //   - date de fin tres ancienne (> 30 jours avant aujourd'hui)
      // Confirmation requise avant de poursuivre l'import dans ces cas-la.
      const periodeCsv = analyserPeriodeCsv(raw);
      if (periodeCsv) {
        const { startStr, endStr, nbJours, alertes } = periodeCsv;
        if (alertes.length > 0) {
          const ok = window.confirm(
            `⚠️ Periode lue dans le CSV : ${startStr} → ${endStr} (${nbJours} jour${nbJours > 1 ? "s" : ""})\n\n` +
            alertes.join("\n") +
            `\n\nCela peut indiquer un filtre de date incorrect cote banque ` +
            `(intervalle inverse, dates futures, etc.).\n\n` +
            `Continuer quand meme l'import ?`,
          );
          if (!ok) {
            e.target.value = "";
            return;
          }
        } else {
          console.log(`📅 CSV : ${startStr} → ${endStr} (${nbJours} jours)`);
        }
      }
      // Si la ligne de periode est absente (autre banque que CA), on continue
      // sans verification : le format simple n'a pas de header de periode.
      
      const parsed = parserCsvBancaire(raw);

      // ─────────────────────────────────────────────────────────────────────
      //  Smart matching — version robuste avec unicité
      // Le rapprochement lui-même est une fonction pure, testée à part
      // (rapprochement-matching.ts). Elle ne touche pas à la base : ce qu'il
      // faut y écrire se déduit des ensembles qu'elle renvoie.
      const {
        finalMatched, autoOverwritten, manuelsPreserves,
        usedEncIds, usedRemiseSepaIds, usedPaymentIds, usedRemiseIds,
      } = rapprocherReleve(parsed, {
        encaissementsCompta, payments, remises, remisesSepa, period, bankLines,
      });
      if (autoOverwritten > 0) {
        console.log(`ℹ️ Re-import : ${autoOverwritten} ligne(s) auto-rapprochée(s) recalculée(s), ${manuelsPreserves} pointage(s) manuel(s) préservé(s)`);
      }

      setBankLines(finalMatched as any);

      // ─────────────────────────────────────────────────────────────────────
      //  Détection indirecte des remises consommées
      // ─────────────────────────────────────────────────────────────────────
      //  Quand le matching consomme des encaissements un par un (bloc 'par jour
      //  exact' ou 'sous-ensemble'), les remises (bordereaux) ne sont pas
      //  ajoutées à usedRemiseIds. On rattrape ici : si tous les encaissements
      //  d'un bordereau existant sont dans usedEncIds, alors ce bordereau
      //  doit être considéré comme consommé aussi.
      for (const r of (remises || [])) {
        if (usedRemiseIds.has(r.id)) continue; // déjà marquée
        const encIds = r.encaissementIds || [];
        if (encIds.length === 0) continue;
        // Tous les encaissements du bordereau doivent être dans usedEncIds
        const allConsumed = encIds.every((id: string) => usedEncIds.has(id));
        if (allConsumed) {
          usedRemiseIds.add(r.id);
          console.log(`[sync-remises] Remise "${r.id}" marquée consommée indirectement (${encIds.length} encs)`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      //  Marquer les encaissements rapprochés avec reconciledByBank=true
      // ─────────────────────────────────────────────────────────────────────
      //  Objectif : les sortir de la liste "Encaissements à remettre" côté
      //  bordereau, puisqu'ils sont déjà rapprochés directement avec la banque
      //  (cas des CB terminal remises automatiquement par la banque).
      //
      //  On compare avec l'état actuel en Firestore : on ne touche que les
      //  encs qui sont dans usedEncIds MAIS pas encore marqués reconciledByBank.
      //  Réciproquement, un enc marqué reconciledByBank qui n'est plus dans
      //  usedEncIds (cas : la bankLine a été dé-pointée) doit être remis à false.
      try {
        const allEncsSnap = await getDocs(collection(db, "encaissements"));
        const updates: Promise<any>[] = [];
        for (const d of allEncsSnap.docs) {
          const data = d.data() as any;
          const isUsed = usedEncIds.has(d.id);
          const wasReconciled = Boolean(data.reconciledByBank);
          if (isUsed && !wasReconciled) {
            updates.push(updateDoc(doc(db, "encaissements", d.id), {
              reconciledByBank: true,
              reconciledAt: serverTimestamp(),
            }));
          } else if (!isUsed && wasReconciled) {
            // Ne pas dé-marquer si l'encaissement a été rapproché lors d'un autre
            // import (ex : CSV précédent). On ne dé-marque QUE si l'encaissement
            // est dans la période du CSV courant (sinon on pourrait casser un
            // rapprochement précédent).
            const encDate = data.date?.seconds ? new Date(data.date.seconds * 1000) : null;
            if (encDate) {
              const pm = `${encDate.getFullYear()}-${String(encDate.getMonth() + 1).padStart(2, "0")}`;
              if (pm === period) {
                updates.push(updateDoc(doc(db, "encaissements", d.id), {
                  reconciledByBank: false,
                  reconciledAt: null,
                }));
              }
            }
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
          console.log(`✅ ${updates.length} encaissement(s) mis à jour (reconciledByBank)`);
        }
      } catch (e) {
        console.error("Erreur mise à jour reconciledByBank:", e);
      }

      // ─────────────────────────────────────────────────────────────────────
      //  Pointer automatiquement les remises (bordereaux) rapprochées
      // ─────────────────────────────────────────────────────────────────────
      //  Quand le matching consomme une remise via usedRemiseIds (bloc a0 des
      //  chèques/espèces), on marque la remise comme pointée côté bordereau
      //  pour garder les deux vues synchronisées.
      try {
        const remiseUpdates: Promise<any>[] = [];
        for (const rid of usedRemiseIds) {
          const rSnap = await getDoc(doc(db, "remises", rid));
          if (!rSnap.exists()) continue;
          const r = rSnap.data() as any;
          if (r.pointee) continue; // déjà pointée
          remiseUpdates.push(updateDoc(doc(db, "remises", rid), {
            pointee: true,
            pointeeDate: new Date().toISOString(),
            pointeeNote: "Pointée automatiquement par rapprochement bancaire",
            updatedAt: serverTimestamp(),
          }));
        }
        // Réciproquement, dé-pointer les remises qui ont été dé-matchées dans le CSV courant
        // (si pointeeNote = "Pointée automatiquement..." et remise n'est plus dans usedRemiseIds)
        // IMPORTANT : on ne traite que les remises de la période courante. Sans ce filtre,
        // un import CSV partiel d'avril dépointerait toutes les remises pointées-auto
        // de mars et antérieures (un bug réel observé : Nicolas a perdu l'état pointé de
        // remises antérieures en réimportant un CSV plus court).
        const allRemisesSnap = await getDocs(collection(db, "remises"));
        for (const d of allRemisesSnap.docs) {
          const r = d.data() as any;
          if (!r.pointee) continue;
          if (r.pointeeNote !== "Pointée automatiquement par rapprochement bancaire") continue;
          if (usedRemiseIds.has(d.id)) continue; // toujours matchée

          // Filtre période : ne dé-pointer que les remises créées dans le mois courant
          const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
          if (!rDate) continue;
          const rPeriod = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, "0")}`;
          if (rPeriod !== period) continue;

          remiseUpdates.push(updateDoc(doc(db, "remises", d.id), {
            pointee: false,
            pointeeDate: null,
            pointeeNote: null,
            updatedAt: serverTimestamp(),
          }));
        }
        if (remiseUpdates.length > 0) {
          await Promise.all(remiseUpdates);
          console.log(`✅ ${remiseUpdates.length} remise(s) synchronisée(s) (pointée/dépointée)`);
        }
      } catch (e) {
        console.error("Erreur synchronisation remises:", e);
      }

      // ─────────────────────────────────────────────────────────────────────
      //  Bug #8 : encaisser les virements attendus que le relevé confirme
      // ─────────────────────────────────────────────────────────────────────
      // Quand un virement attendu est rapproché, la facture sort de l'alerte
      // « virements attendus > 7 j ». Elle passait autrefois à « paid » d'un
      // trait, sans écriture ; désormais l'encaissement est réel (journal,
      // numéro de facture, mode « virement »), cf. encaisserPaiementsPointes.
      // Les lignes « à vérifier » attendent la confirmation avant d'écrire.
      if ((finalMatched as any[]).some(bl => bl.matched && bl.manualPaymentId)) {
        try {
          const nb = await encaisserPaiementsPointes(finalMatched as any);
          if (nb > 0) console.log(`✅ ${nb} virement(s) attendu(s) encaissé(s) depuis le relevé`);
          // Recharger les paiements pour rafraîchir l'UI
          fetchData();
        } catch (e) {
          console.error("Erreur encaissement des virements rapprochés:", e);
        }
      }

      // Sauvegarder dans Firestore (groupé par mois selon la date de chaque
      // bankLine, plus la période active à l'import — fix du bug de doublons
      // découvert par Nicolas le 28/04 sur les CSV à cheval sur 2 mois)
      try {
        await saveBankLinesByMonth(finalMatched as any, "csv-import");
        console.log(`✅ Rapprochement sauvegardé (${finalMatched.length} lignes réparties par mois)`);
        // Synchroniser les versements bancaires (sorties du livre de caisse)
        await syncVersementsEspeces(finalMatched as any);
      } catch (e) { console.error("Erreur sauvegarde rapprochement:", e); }
    };
    reader.readAsText(file, "ISO-8859-1"); // Encodage Crédit Agricole = Latin1
  };

  // ── Charger un rapprochement sauvegardé ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "rapprochements", period));
        if (snap.exists()) {
          const data = snap.data();
          setBankLines((data.bankLines || []).map((bl: any) => ({
            ...bl,
            matchedEncs: bl.matchedEncs || undefined,
            manualPaymentId: bl.manualPaymentId || undefined,
            remiseSepaId: bl.remiseSepaId || undefined,
            uncertain: bl.uncertain || false,
          })));
        } else {
          setBankLines([]);
        }
      } catch { setBankLines([]); }
    })();
  }, [period]);

  // ─────────────────────────────────────────────────────────────────────────
  //  relancerRapprochement : rejouer le rapprochement automatique sur le
  //  relevé déjà importé, avec l'état ACTUEL des recettes.
  //
  //  Le rapprochement ne tournait qu'à l'import du CSV. Une facture créée
  //  ensuite pour un virement déjà sur le relevé, une remise SEPA déposée
  //  après coup : la ligne restait « à traiter » jusqu'au prochain import.
  //  Ici, les lignes pointées à la main ou ignorées sont conservées telles
  //  quelles ; les autres sont recalculées comme à un import.
  // ─────────────────────────────────────────────────────────────────────────
  const relancerRapprochement = async () => {
    if (bankLines.length === 0) return { avant: 0, apres: 0 };
    const avant = bankLines.filter(b => b.matched && b.matchType !== "Ignoré").length;
    const base: LigneBancaire[] = bankLines.map(bl =>
      bl.matched && (bl.matchType === "Manuel" || bl.matchType === "Ignoré")
        ? bl
        : { date: bl.date, label: bl.label, amount: bl.amount, matched: false, matchType: "", matchDetail: "" },
    );
    const { finalMatched } = rapprocherReleve(base, {
      encaissementsCompta, payments, remises, remisesSepa, period, bankLines,
    });
    await updateAndSaveBankLines(finalMatched);
    const apres = finalMatched.filter(b => b.matched && b.matchType !== "Ignoré").length;
    return { avant, apres };
  };

  return {
    bankLines, setBankLines,
    handleCSVImport,
    relancerRapprochement,
    updateAndSaveBankLines,
    saveBankLinesByMonth,
    syncVersementsEspeces,
    syncReconciledFromBankLines,
  };
}
