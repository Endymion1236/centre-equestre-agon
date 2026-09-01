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
import {
  analyserPeriodeCsv,
  cleLigneBancaire,
  encaissementEnDetail,
  estDansFenetreBancaire,
  parserCsvBancaire,
  parserDateBancaire,
  periodePrecedente,
  trouverSousEnsembleMontant,
} from "./rapprochement-utils";

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

        if (bl.manualPaymentId) targetPaymentIds.add(bl.manualPaymentId);

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

      // 3. Payments virement : marquer paid ceux qui sont pointés, dé-marquer
      //    ceux qui étaient rapprochés mais ne le sont plus.
      const paymentUpdates: Promise<any>[] = [];
      for (const pid of targetPaymentIds) {
        const pSnap = await getDoc(doc(db, "payments", pid));
        if (!pSnap.exists()) continue;
        const p = pSnap.data() as any;
        if (p.status === "paid" && p.reconciledByBank) continue;
        paymentUpdates.push(updateDoc(doc(db, "payments", pid), {
          status: "paid",
          paidAmount: p.totalTTC || p.paidAmount || 0,
          paidAt: serverTimestamp(),
          reconciledByBank: true,
        }));
      }
      // Dé-marquer les payments précédemment rapprochés qui ne sont plus cibles
      for (const p of payments) {
        if (!p.reconciledByBank) continue;
        if (targetPaymentIds.has(p.id)) continue;
        if (p.paymentMode !== "virement") continue;
        // Uniquement période courante
        const pd = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
        if (!pd) continue;
        const pm = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
        if (pm !== period) continue;
        paymentUpdates.push(updateDoc(doc(db, "payments", p.id), {
          status: "pending",
          paidAmount: 0,
          reconciledByBank: false,
        }));
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
      // ─────────────────────────────────────────────────────────────────────
      // Principe : chaque encaissement et chaque remise SEPA ne peut être
      // consommé qu'UNE SEULE FOIS. On utilise des Sets pour tracker ce qui
      // a déjà été matché, afin que deux lignes bancaires de même montant ne
      // se partagent pas le même encaissement.

      const usedEncIds = new Set<string>();        // ids des encaissements déjà rapprochés
      const usedRemiseSepaIds = new Set<string>(); // ids des remises SEPA déjà rapprochées
      const usedPaymentIds = new Set<string>();    // ids des paiements (virements) déjà rapprochés
      const usedRemiseIds = new Set<string>();     // ids des bordereaux de remise (chèques/espèces) déjà rapprochés

      // ─────────────────────────────────────────────────────────────────────
      const matched = parsed.map((bl) => {
        const label = bl.label.toUpperCase();
        const bankDate = parserDateBancaire(bl.date);

        // Calcul de la période précédente pour élargir le pool
        // (les chèques / CB terminal peuvent être datés du mois d'avant)
        const prevPeriod = periodePrecedente(period);

        // Encaissements de la période, avec leur date
        // On EXCLUT les encaissements déjà consommés par une autre bankLine
        const periodEnc = encaissementsCompta.filter(e => {
          if (usedEncIds.has(e.id)) return false;
          const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (!d) return false;
          const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return pm === period;
        });

        // Pool élargi : période courante + précédente (utile pour chèques/CB
        // remis en début de mois mais datés du mois d'avant)
        const periodEncExtended = encaissementsCompta.filter(e => {
          if (usedEncIds.has(e.id)) return false;
          const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (!d) return false;
          const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return pm === period || pm === prevPeriod;
        });

        // Fenêtre de ±3 jours autour de la date bancaire
        const inWindow = (enc: any) => estDansFenetreBancaire(enc, bankDate);

        // ── 1. CB en ligne (CAWL) payout ─────────────────────────────────
        // CAWL verse les fonds ~2-7 jours après les paiements, regroupés,
        // net de commissions (~2.9% + 0.25€). On cherche dans une fenêtre large.
        if (label.includes("CAWL") || label.includes("WORLDLINE") || label.includes("STRIPE") || label.includes("STP")) {
          const cbEncs = periodEnc.filter(e =>
            e.mode === "cb_online" || e.mode === "cb_cawl"
          );

          // a) Match exact (montant identique, rare mais possible)
          const exactCb = cbEncs.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (exactCb) {
            usedEncIds.add(exactCb.id);
            return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `CB en ligne ${exactCb.familyName} — ${exactCb.montant?.toFixed(2)}€`, matchedEncs: [encaissementEnDetail(exactCb)] };
          }

          // b) Total CB en ligne de la période (payout global)
          const cbTotal = cbEncs.reduce((s, e) => s + (e.montant || 0), 0);
          if (cbTotal > 0 && Math.abs(cbTotal - bl.amount) < 0.02) {
            cbEncs.forEach(e => usedEncIds.add(e.id));
            return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbEncs.length} transaction(s) = ${cbTotal.toFixed(2)}€`, matchedEncs: cbEncs.map(encaissementEnDetail) };
          }

          // c) Total CB en ligne net de commissions
          if (cbTotal > 0) {
            const estimatedFees = cbEncs.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
            const cbNet = Math.round((cbTotal - estimatedFees) * 100) / 100;
            if (Math.abs(cbNet - bl.amount) < 1.00) { // tolérance 1€ sur les commissions
              cbEncs.forEach(e => usedEncIds.add(e.id));
              return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbEncs.length} tx = ${cbTotal.toFixed(2)}€ brut − ~${estimatedFees.toFixed(2)}€ frais ≈ ${cbNet.toFixed(2)}€`, matchedEncs: cbEncs.map(encaissementEnDetail) };
            }
          }

          // d) Grouper par semaine et chercher un sous-ensemble
          if (bankDate && cbEncs.length > 0) {
            // Chercher les paiements CB en ligne des 7-14 jours avant le payout
            const cbWindow = cbEncs.filter(e => {
              const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
              if (!d) return false;
              const diff = (bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
              return diff >= 2 && diff <= 14; // payout arrive 2-14 jours après
            });
            const windowTotal = cbWindow.reduce((s, e) => s + (e.montant || 0), 0);
            if (windowTotal > 0 && Math.abs(windowTotal - bl.amount) < 0.02) {
              cbWindow.forEach(e => usedEncIds.add(e.id));
              return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbWindow.length} tx (J-2 à J-14) = ${windowTotal.toFixed(2)}€`, matchedEncs: cbWindow.map(encaissementEnDetail) };
            }
            // Net de commissions
            if (windowTotal > 0) {
              const wFees = cbWindow.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
              const wNet = Math.round((windowTotal - wFees) * 100) / 100;
              if (Math.abs(wNet - bl.amount) < 1.00) {
                cbWindow.forEach(e => usedEncIds.add(e.id));
                return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbWindow.length} tx = ${windowTotal.toFixed(2)}€ − ~${wFees.toFixed(2)}€ frais`, matchedEncs: cbWindow.map(encaissementEnDetail) };
              }
            }
          }
        }

        // ── 2. CB terminal — matching agrégat par jour ───────────────────
        // La banque remet en 1 virement le total CB d'une journée (J-1, J-2, etc.)
        if (label.includes("REMISE") || label.includes("CB") || label.includes("TPE") || label.includes("CARTE")) {
          // Pool élargi : un virement de remise CB du 3 novembre peut concerner des CB du 30 octobre
          const cbEncs = periodEncExtended.filter(e => e.mode === "cb_terminal");

          // a) Grouper les encaissements CB par jour
          const cbByDay: Record<string, { total: number; count: number; encs: any[] }> = {};
          for (const e of cbEncs) {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) continue;
            const dayKey = d.toISOString().split("T")[0];
            if (!cbByDay[dayKey]) cbByDay[dayKey] = { total: 0, count: 0, encs: [] };
            cbByDay[dayKey].total += (e.montant || 0);
            cbByDay[dayKey].count++;
            cbByDay[dayKey].encs.push(e);
          }

          // b) Chercher un jour dont le total CB = montant de la remise (dans une fenêtre J-3)
          for (const [dayKey, dayData] of Object.entries(cbByDay)) {
            const dayTotal = Math.round(dayData.total * 100) / 100;
            if (Math.abs(dayTotal - bl.amount) < 0.02) {
              // Vérifier que ce jour est dans la fenêtre (la remise arrive J+1 ou J+2 après les CB)
              if (bankDate) {
                const encDay = new Date(dayKey);
                const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
                if (diff < -1 || diff > 5) continue; // la remise doit être APRÈS les CB (J+0 à J+5)
              }
              const dayLabel = dayKey.split("-").reverse().join("/");
              dayData.encs.forEach(e => usedEncIds.add(e.id));
              return {
                ...bl, matched: true, matchType: "CB Terminal",
                matchDetail: `${dayData.count} transaction(s) CB du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
                matchedEncs: dayData.encs.map(encaissementEnDetail),
              };
            }
          }

          // b.bis) Sous-ensemble d'un jour : DÉSACTIVÉ (option B retenue par
          //        Nicolas le 28/04). Ce matching trouvait n'importe quelle
          //        combinaison d'encaissements CB du jour qui faisait tomber
          //        le total juste, sans tenir compte de l'heure réelle des
          //        transactions. Résultat : il "mélangeait" les transactions
          //        entre remises bancaires, créant de fausses associations
          //        (cas vécu : 495€ gourmelon attribués à la mauvaise remise).
          //
          //        Désormais, ces remises CB arrivent en "À traiter" et il
          //        faut utiliser le bouton Détail CA pour coller le détail
          //        copié depuis le site Crédit Agricole, qui produit un
          //        matching transaction par transaction fiable.
          //
          //        Si tu lis ce code et que tu veux réactiver, sache que la
          //        cause de la défaillance est qu'on ne dispose pas de
          //        l'horaire des transactions dans encaissements, donc on
          //        ne peut pas distinguer 2 CB de même montant le même jour.

          // c) Agrégat multi-jours : DÉSACTIVÉ aussi (cohérent avec b.bis).
          //    Combinait 2-3 jours consécutifs pour matcher une remise.
          //    Risque similaire de mélange entre remises bancaires.

          // d) Dernier recours : match exact montant unitaire
          const exactCB = cbEncs.filter(inWindow).find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (exactCB) {
            usedEncIds.add(exactCB.id);
            return { ...bl, matched: true, matchType: "CB Terminal", matchDetail: `CB ${exactCB.familyName} — ${exactCB.activityTitle || ""}`, matchedEncs: [encaissementEnDetail(exactCB)] };
          }
        }

        // ── 3. Virement / SEPA / Prélèvement ──────────────────────────────
        if (label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV")) {

          // a) Match remise SEPA (somme des prélèvements groupés) — priorité maximum
          //    Les remises SEPA sont typiquement reçues sous forme "PRLV SEPA" ou avec la référence ICS
          if (label.includes("PRLV") || label.includes("SEPA") || label.includes("ICS")) {
            const remiseMatch = remisesSepa.find(r => {
              if (usedRemiseSepaIds.has(r.id)) return false; // déjà consommée
              if (Math.abs((r.montantTotal || 0) - bl.amount) >= 0.02) return false;
              // La remise doit être dans la même période OU dans une fenêtre proche de la date bancaire
              if (r.datePrelevement?.startsWith(period)) return true;
              if (bankDate && r.datePrelevement) {
                const rd = new Date(r.datePrelevement);
                const diff = Math.abs(bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
                return diff <= 7;
              }
              return false;
            });
            if (remiseMatch) {
              usedRemiseSepaIds.add(remiseMatch.id);
              return { ...bl, matched: true, matchType: "Prélèvement SEPA", matchDetail: `Remise SEPA n°${remiseMatch.numero} — ${remiseMatch.nbTransactions} prélèvements` };
            }
          }

          // b) Match par NOM de famille dans le libellé bancaire — PRIORITÉ ABSOLUE
          //    Ex: "VIR DE MLLE MARIE JOUSSE" → on cherche un encaissement ou paiement virement
          //    dont la famille correspond, dans une fenêtre ±30 jours.
          //    CRITIQUE : on fait CE match AVANT le match par montant seul, sinon on risque
          //    de matcher un faux positif (encaissement d'une autre famille de même montant).

          // b.1) Parmi les ENCAISSEMENTS virement/sepa de la période, priorité au nom qui matche le libellé
          const virEncs = periodEnc.filter(e =>
            e.mode === "virement" || e.mode === "sepa" || e.mode === "prelevement_sepa"
          );
          const encNameMatches = virEncs.filter(e => {
            if (!e.familyName) return false;
            const nameParts = e.familyName.toUpperCase().split(/\s+/).filter((n: string) => n.length > 2);
            return nameParts.some((part: string) => label.includes(part));
          });
          // Nom + montant exact + fenêtre → idéal
          const encNameAmountInWindow = encNameMatches.find(e => inWindow(e) && Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (encNameAmountInWindow) {
            usedEncIds.add(encNameAmountInWindow.id);
            return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${encNameAmountInWindow.familyName}`, matchedEncs: [encaissementEnDetail(encNameAmountInWindow)] };
          }
          // Nom + montant exact (même hors fenêtre, jusqu'à 15j)
          const encNameAmount = encNameMatches.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (encNameAmount) {
            usedEncIds.add(encNameAmount.id);
            return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${encNameAmount.familyName}`, matchedEncs: [encaissementEnDetail(encNameAmount)] };
          }

          // b.2) Parmi les PAIEMENTS virement en attente (pending/partial), match par nom
          const virPayments = payments.filter(p => {
            if (p.paymentMode !== "virement") return false;
            if (p.status !== "pending" && p.status !== "partial") return false;
            if (usedPaymentIds.has(p.id)) return false;
            if (bankDate && p.date?.seconds) {
              const d = new Date(p.date.seconds * 1000);
              const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
              if (diff > 60) return false; // au-delà de 60j, on considère que ce n'est pas lié
            }
            return true;
          });
          const paymentNameMatches = virPayments.filter(p => {
            if (!p.familyName) return false;
            const nameParts = p.familyName.toUpperCase().split(/\s+/).filter((n: string) => n.length > 2);
            return nameParts.some((part: string) => label.includes(part));
          });
          // Nom + montant exact
          const paymentNameAmount = paymentNameMatches.find(p => Math.abs((p.totalTTC || 0) - bl.amount) < 0.02);
          if (paymentNameAmount) {
            usedPaymentIds.add(paymentNameAmount.id);
            return {
              ...bl, matched: true, matchType: "Virement",
              matchDetail: `Virement ${paymentNameAmount.familyName}`,
              manualPaymentId: paymentNameAmount.id,
            };
          }
          // Nom uniquement si UN SEUL candidat (avertissement si montant différent)
          if (paymentNameMatches.length === 1) {
            const nameMatch = paymentNameMatches[0];
            const amountClose = Math.abs((nameMatch.totalTTC || 0) - bl.amount) < 0.02;
            usedPaymentIds.add(nameMatch.id);
            return {
              ...bl, matched: true, matchType: "Virement",
              matchDetail: `Virement ${nameMatch.familyName}${amountClose ? "" : ` ⚠️ montant: attendu ${nameMatch.totalTTC?.toFixed(2)}€, reçu ${bl.amount.toFixed(2)}€`}`,
              manualPaymentId: nameMatch.id,
              uncertain: !amountClose, // douteux si montant différent
            };
          }

          // c) Match individuel encaissement virement/sepa par MONTANT EXACT dans la fenêtre
          //    ATTENTION : ce bloc ne s'exécute QUE si aucun nom n'a été trouvé dans le libellé,
          //    pour éviter qu'un virement "JOUSSE 50€" soit faussement matché à un encaissement
          //    "GUYON 50€". On impose aussi qu'il n'y ait qu'UN SEUL candidat (pas d'ambigüité).
          const amountMatches = virEncs.filter(e =>
            inWindow(e) && Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (amountMatches.length === 1) {
            const match = amountMatches[0];
            usedEncIds.add(match.id);
            return {
              ...bl, matched: true, matchType: "Virement",
              matchDetail: `Virement ${match.familyName} (montant seul)`,
              matchedEncs: [encaissementEnDetail(match)],
              uncertain: true, // nom absent du libellé → à vérifier
            };
          }
          // Si plusieurs encaissements de même montant → ambigu, on laisse au pointage manuel

          // d) Match par montant exact sur les paiements virement EN ATTENTE uniquement
          const pendingVirPayments = payments.filter(p =>
            p.paymentMode === "virement" &&
            (p.status === "pending" || p.status === "partial") &&
            !usedPaymentIds.has(p.id)
          );
          const pendingAmountMatches = pendingVirPayments.filter(p =>
            Math.abs((p.totalTTC || 0) - bl.amount) < 0.02
          );
          if (pendingAmountMatches.length === 1) {
            const p = pendingAmountMatches[0];
            usedPaymentIds.add(p.id);
            return {
              ...bl, matched: true, matchType: "Virement",
              matchDetail: `Virement ${p.familyName} (montant seul)`,
              manualPaymentId: p.id,
              uncertain: true, // nom absent du libellé → à vérifier
            };
          }
        }

        // ── 4. Chèque ─────────────────────────────────────────────────────
        if (label.includes("CHQ") || label.includes("CHEQUE") || label.includes("REMISE CHQ")) {

          // a0) PRIORITÉ ABSOLUE : chercher un bordereau de remise chèque qui
          //     correspond EXACTEMENT à ce mouvement bancaire. Les bordereaux
          //     sont créés manuellement via l'onglet "Bordereaux remise" et
          //     contiennent la liste exacte des chèques remis à la banque.
          const remiseMatch = (remises || []).find((r: any) => {
            if (usedRemiseIds.has(r.id)) return false;
            if (r.paymentMode !== "cheque" && r.paymentMode !== "mixte") return false;
            if (Math.abs((r.total || 0) - bl.amount) >= 0.02) return false;
            // Fenêtre : la remise bancaire arrive dans les 10 jours après la création du bordereau
            if (bankDate && r.date?.seconds) {
              const rd = new Date(r.date.seconds * 1000);
              const diff = (bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
              if (diff < -1 || diff > 15) return false;
            }
            return true;
          });
          if (remiseMatch) {
            usedRemiseIds.add(remiseMatch.id);
            // Marquer les encaissements du bordereau comme consommés
            const encIds = remiseMatch.encaissementIds || [];
            encIds.forEach((id: string) => usedEncIds.add(id));
            // Récupérer les détails des encaissements pour l'affichage
            const remiseEncs = encaissementsCompta.filter(e => encIds.includes(e.id));
            const dayLabel = remiseMatch.date?.seconds
              ? new Date(remiseMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
              : "?";
            return {
              ...bl, matched: true, matchType: "Chèques",
              matchDetail: `Bordereau du ${dayLabel} — ${remiseMatch.nbPaiements || encIds.length} chèque(s) = ${(remiseMatch.total || 0).toFixed(2)}€`,
              matchedEncs: remiseEncs.map(encaissementEnDetail),
            };
          }

          // Pool élargi : une remise chèque peut contenir des chèques du mois d'avant
          const allChqEncs = periodEncExtended.filter(e => e.mode === "cheque");

          // a) Chèque unitaire (montant exact)
          const match = allChqEncs.filter(inWindow).find(e =>
            Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (match) {
            usedEncIds.add(match.id);
            return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName}`, matchedEncs: [encaissementEnDetail(match)] };
          }

          // b) Remise chèques groupée par JOUR EXACT
          //    La banque remet souvent tous les chèques d'une journée en 1 virement.
          //    On groupe d'abord par jour et on cherche un jour dont la somme = montant remise.
          const chqByDay: Record<string, { total: number; count: number; encs: any[] }> = {};
          for (const e of allChqEncs) {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) continue;
            const dayKey = d.toISOString().split("T")[0];
            if (!chqByDay[dayKey]) chqByDay[dayKey] = { total: 0, count: 0, encs: [] };
            chqByDay[dayKey].total += (e.montant || 0);
            chqByDay[dayKey].count++;
            chqByDay[dayKey].encs.push(e);
          }
          // Chercher un jour dont le total = montant de la remise (fenêtre J-0 à J+7)
          for (const [dayKey, dayData] of Object.entries(chqByDay)) {
            const dayTotal = Math.round(dayData.total * 100) / 100;
            if (Math.abs(dayTotal - bl.amount) < 0.02) {
              if (bankDate) {
                const encDay = new Date(dayKey);
                const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
                // La remise arrive J+0 à J+7 après la saisie des chèques
                if (diff < -1 || diff > 10) continue;
              }
              const dayLabel = dayKey.split("-").reverse().join("/");
              dayData.encs.forEach(e => usedEncIds.add(e.id));
              return {
                ...bl, matched: true, matchType: "Chèques",
                matchDetail: `${dayData.count} chèque(s) du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
                matchedEncs: dayData.encs.map(encaissementEnDetail),
              };
            }
          }

          // b.bis) Sous-ensemble d'un jour : si tu as saisi 7 chèques mais que ta
          //        remise n'en contient que 6, on cherche la combinaison qui fait
          //        le montant exact. Utile si tu as oublié d'inclure un chèque.
          const chqTargetCents = Math.round(bl.amount * 100);
          for (const [dayKey, dayData] of Object.entries(chqByDay)) {
            if (bankDate) {
              const encDay = new Date(dayKey);
              const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
              if (diff < -1 || diff > 10) continue;
            }
            if (dayData.total < bl.amount - 0.02) continue;
            const freeEncs = dayData.encs.filter(e => !usedEncIds.has(e.id));
            const subset = trouverSousEnsembleMontant(freeEncs, chqTargetCents);
            if (subset && subset.length > 0) {
              const subsetSum = subset.reduce((s, e) => s + (e.montant || 0), 0);
              subset.forEach(e => usedEncIds.add(e.id));
              const dayLabel = dayKey.split("-").reverse().join("/");
              return {
                ...bl, matched: true, matchType: "Chèques",
                matchDetail: `Sous-ensemble ${subset.length}/${dayData.encs.length} chèque(s) du ${dayLabel} = ${subsetSum.toFixed(2)}€`,
                matchedEncs: subset.map(encaissementEnDetail),
              };
            }
          }

          // c) Agrégat multi-jours : 2-3 jours consécutifs
          const sortedDays = Object.keys(chqByDay).sort();
          for (let i = 0; i < sortedDays.length; i++) {
            let runningTotal = 0;
            let runningCount = 0;
            for (let j = i; j < Math.min(i + 3, sortedDays.length); j++) {
              runningTotal += chqByDay[sortedDays[j]].total;
              runningCount += chqByDay[sortedDays[j]].count;
              const roundedTotal = Math.round(runningTotal * 100) / 100;
              if (Math.abs(roundedTotal - bl.amount) < 0.02) {
                const days = sortedDays.slice(i, j + 1).map(d => d.split("-")[2] + "/" + d.split("-")[1]).join(", ");
                const allEncs = sortedDays.slice(i, j + 1).flatMap(d => chqByDay[d].encs);
                allEncs.forEach(e => usedEncIds.add(e.id));
                return {
                  ...bl, matched: true, matchType: "Chèques",
                  matchDetail: `Agrégat ${runningCount} chèque(s) (${days}) = ${roundedTotal.toFixed(2)}€`,
                  matchedEncs: allEncs.map(encaissementEnDetail),
                };
              }
            }
          }

          // d) Total de TOUS les chèques du mois (rare mais possible)
          const totalMois = Math.round(allChqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
          if (totalMois > 0 && Math.abs(totalMois - bl.amount) < 0.02) {
            allChqEncs.forEach(e => usedEncIds.add(e.id));
            return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${allChqEncs.length} chèque(s) du mois = ${totalMois.toFixed(2)}€`, matchedEncs: allChqEncs.map(encaissementEnDetail) };
          }
        }

        // ── 5. Espèces ────────────────────────────────────────────────────
        if (label.includes("ESP") || label.includes("VERSEMENT")) {

          // a0) PRIORITÉ : chercher un bordereau de remise espèces qui correspond
          const remiseEspMatch = (remises || []).find((r: any) => {
            if (usedRemiseIds.has(r.id)) return false;
            if (r.paymentMode !== "especes" && r.paymentMode !== "mixte") return false;
            if (Math.abs((r.total || 0) - bl.amount) >= 0.02) return false;
            if (bankDate && r.date?.seconds) {
              const rd = new Date(r.date.seconds * 1000);
              const diff = (bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
              if (diff < -1 || diff > 15) return false;
            }
            return true;
          });
          if (remiseEspMatch) {
            usedRemiseIds.add(remiseEspMatch.id);
            const encIds = remiseEspMatch.encaissementIds || [];
            encIds.forEach((id: string) => usedEncIds.add(id));
            const remiseEncs = encaissementsCompta.filter(e => encIds.includes(e.id));
            const dayLabel = remiseEspMatch.date?.seconds
              ? new Date(remiseEspMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
              : "?";
            return {
              ...bl, matched: true, matchType: "Espèces",
              matchDetail: `Bordereau du ${dayLabel} — ${remiseEspMatch.nbPaiements || encIds.length} enc. espèces = ${(remiseEspMatch.total || 0).toFixed(2)}€`,
              matchedEncs: remiseEncs.map(encaissementEnDetail),
            };
          }

          // b) On cherche un jour dont la somme des encaissements en espèces = montant du dépôt
          const espByDay: Record<string, { total: number; encs: any[] }> = {};
          for (const e of periodEnc.filter(e => e.mode === "especes")) {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) continue;
            const dayKey = d.toISOString().split("T")[0];
            if (!espByDay[dayKey]) espByDay[dayKey] = { total: 0, encs: [] };
            espByDay[dayKey].total += (e.montant || 0);
            espByDay[dayKey].encs.push(e);
          }
          for (const [dayKey, dayData] of Object.entries(espByDay)) {
            const dayTotal = Math.round(dayData.total * 100) / 100;
            if (Math.abs(dayTotal - bl.amount) < 0.02) {
              const dayLabel = dayKey.split("-").reverse().join("/");
              dayData.encs.forEach(e => usedEncIds.add(e.id));
              return { ...bl, matched: true, matchType: "Espèces", matchDetail: `Dépôt espèces du ${dayLabel} = ${dayTotal.toFixed(2)}€`, matchedEncs: dayData.encs.map(encaissementEnDetail) };
            }
          }
        }

        // ── 6. Montant exact toutes modes ─────────────────────────────────
        // Dernier recours : trouver un encaissement de même montant dans la fenêtre.
        // EXCLUSION : pour les virements (VIR / SEPA / PRLV), ce fallback est DÉSACTIVÉ.
        // Raison : un virement doit matcher par nom dans le libellé (bloc 3.b). Sans nom
        // qui colle, il vaut mieux laisser non-matché pour éviter les faux positifs
        // (ex : "VIR DE MME ROPIQUET 30€" faussement attribué à un encaissement
        // cb_terminal "Nicolas Richard — animation" de 30€ d'un autre jour).
        // IMPORTANT : même quand on l'accepte, on marque uncertain=true car ce match
        // ne repose que sur le montant, sans confirmation par le nom. Badge ⚠️ visible.
        const isVirementLabel = label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV");
        if (!isVirementLabel) {
          const exactMatch = periodEnc.filter(inWindow).find(e =>
            Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (exactMatch) {
            usedEncIds.add(exactMatch.id);
            return {
              ...bl, matched: true, matchType: "Montant exact",
              matchDetail: `${exactMatch.familyName} — ${exactMatch.activityTitle || ""}`,
              matchedEncs: [encaissementEnDetail(exactMatch)],
              uncertain: true, // match fragile : à vérifier
            };
          }
        }

        // ── DEBUG : ligne non rapprochée → on log pour diagnostic ────────
        // Pourquoi n'a-t-elle pas matché ? On affiche les encaissements du mois
        // qui auraient pu correspondre (même montant, ±5€), leur date, leur mode.
        const periodEncAll = encaissementsCompta.filter(e => {
          const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (!d) return false;
          const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return pm === period;
        });
        const candidatsMontantProche = periodEncAll.filter(e =>
          Math.abs((e.montant || 0) - bl.amount) < 5
        ).map(e => ({
          date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?",
          mode: e.mode,
          montant: (e.montant || 0).toFixed(2),
          famille: e.familyName || "?",
          id: e.id,
          utilisé: usedEncIds.has(e.id) ? "✅ déjà matché" : "❌ libre",
        }));
        const totalEspecesMois = Math.round(periodEncAll.filter(e => e.mode === "especes").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
        const totalChequesMois = Math.round(periodEncAll.filter(e => e.mode === "cheque").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
        const totalCBTerminalMois = Math.round(periodEncAll.filter(e => e.mode === "cb_terminal").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
        const totalCBOnlineMois = Math.round(periodEncAll.filter(e => e.mode === "cb_online" || e.mode === "cb_cawl").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;

        // Totaux journaliers par mode pour détecter un jour proche du montant bancaire
        const groupByDayMode = (mode: string | string[]) => {
          const modes = Array.isArray(mode) ? mode : [mode];
          const byDay: Record<string, { total: number; count: number; encs: any[] }> = {};
          for (const e of periodEncAll) {
            if (!modes.includes(e.mode)) continue;
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) continue;
            const dayKey = d.toLocaleDateString("fr-FR");
            if (!byDay[dayKey]) byDay[dayKey] = { total: 0, count: 0, encs: [] };
            byDay[dayKey].total += (e.montant || 0);
            byDay[dayKey].count++;
            byDay[dayKey].encs.push(e);
          }
          // Format : { "17/04/2026": "281.00€ (3 tx)", écart: "0.50€" }
          return Object.entries(byDay)
            .sort(([a],[b]) => {
              const pa = a.split("/").reverse().join("-");
              const pb = b.split("/").reverse().join("-");
              return pa.localeCompare(pb);
            })
            .map(([day, d]) => ({
              jour: day,
              total: d.total.toFixed(2) + "€",
              nb: d.count,
              écart_vs_banque: (d.total - bl.amount).toFixed(2) + "€",
              usedIds: d.encs.filter(e => usedEncIds.has(e.id)).length,
            }));
        };

        // Détection du type de ligne bancaire (CB, chèque, espèces, virement)
        const blType = label.includes("REMISE") && (label.includes("CARTE") || label.includes("CB") || label.includes("TPE")) ? "CB_TERMINAL"
          : label.includes("CHQ") || label.includes("CHEQUE") ? "CHEQUE"
          : label.includes("ESP") || label.includes("VERSEMENT") ? "ESPECES"
          : label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV") ? "VIREMENT"
          : "INCONNU";

        // Log à plat (format texte) pour faciliter la lecture/copie sans avoir à dérouler
        const lines: string[] = [];
        lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`🔍 NON RAPPROCHÉE : "${bl.label}"`);
        lines.push(`   Montant : ${bl.amount.toFixed(2)}€ | Date banque : ${bl.date} | Type détecté : ${blType}`);
        lines.push(`   Totaux ${period} : espèces=${totalEspecesMois.toFixed(2)}€ | chèques=${totalChequesMois.toFixed(2)}€ | cb_terminal=${totalCBTerminalMois.toFixed(2)}€ | cb_online=${totalCBOnlineMois.toFixed(2)}€`);

        if (blType === "CB_TERMINAL") {
          const days = groupByDayMode("cb_terminal");
          lines.push(`   CB terminal par jour :`);
          if (days.length === 0) lines.push(`      (aucun encaissement CB terminal sur ${period})`);
          for (const d of days) {
            lines.push(`      → ${d.jour} : ${d.total} (${d.nb} tx) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
          }
        }
        if (blType === "CHEQUE") {
          const days = groupByDayMode("cheque");
          lines.push(`   Chèques par jour :`);
          if (days.length === 0) lines.push(`      (aucun chèque enregistré sur ${period})`);
          for (const d of days) {
            lines.push(`      → ${d.jour} : ${d.total} (${d.nb} chèque(s)) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
          }
        }
        if (blType === "ESPECES") {
          const days = groupByDayMode("especes");
          lines.push(`   Espèces par jour :`);
          if (days.length === 0) lines.push(`      (aucun encaissement espèces sur ${period})`);
          for (const d of days) {
            lines.push(`      → ${d.jour} : ${d.total} (${d.nb} tx) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
          }
        }
        if (blType === "VIREMENT") {
          const vEncs = periodEncAll.filter(e => (e.mode === "virement" || e.mode === "sepa" || e.mode === "prelevement_sepa") && Math.abs((e.montant||0) - bl.amount) < 10);
          lines.push(`   Virements enc. proches (±10€) :`);
          if (vEncs.length === 0) lines.push(`      (aucun encaissement virement proche de ${bl.amount.toFixed(2)}€)`);
          for (const e of vEncs) {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?";
            lines.push(`      → ${d} : ${(e.montant||0).toFixed(2)}€ | ${e.familyName || "?"}`);
          }
        }

        if (candidatsMontantProche.length > 0) {
          lines.push(`   Candidats ±5€ (tous modes) :`);
          for (const c of candidatsMontantProche.slice(0, 5)) {
            lines.push(`      → ${c.date} | ${c.mode} | ${c.montant}€ | ${c.famille} | ${c.utilisé}`);
          }
        } else {
          lines.push(`   ❌ Aucun encaissement ±5€ dans la base → il manque probablement des saisies`);
        }

        console.log(lines.join("\n"));

        return bl;
      });

      // ─────────────────────────────────────────────────────────────────────
      //  Bug #2 : Fusion avec les matchs manuels existants
      // ─────────────────────────────────────────────────────────────────────
      // Si une ligne identique (même date + libellé + montant) existait déjà
      // dans le rapprochement avec un pointage MANUEL ou IGNORÉ, on conserve
      // ce pointage pour ne pas le perdre au re-import.
      const previousBankLines = bankLines;
      const previousManualByKey = new Map<string, any>();
      for (const prev of previousBankLines) {
        if (prev.matchType === "Manuel" || prev.matchType === "Ignoré") {
          previousManualByKey.set(cleLigneBancaire(prev), prev);
        }
      }

      const finalMatched = matched.map((bl: any) => {
        const prev = previousManualByKey.get(cleLigneBancaire(bl));
        if (prev) {
          // On garde le pointage manuel existant plutôt que l'auto-match
          return {
            ...bl,
            matched: prev.matched,
            matchType: prev.matchType,
            matchDetail: prev.matchDetail,
            matchedEncs: prev.matchedEncs || bl.matchedEncs,
            manualPaymentId: prev.manualPaymentId,
          };
        }
        return bl;
      });

      // ─────────────────────────────────────────────────────────────────────
      //  Bug #11 : Avertissement si doublons potentiels dans le nouveau CSV
      // ─────────────────────────────────────────────────────────────────────
      // Si le CSV importé contient des lignes déjà présentes avec un statut
      // automatique (non manuel), on informe l'utilisateur du nombre de lignes
      // qui seront écrasées (les auto-matchs se refont proprement à chaque import).
      const autoOverwritten = previousBankLines.filter(p =>
        p.matchType !== "Manuel" && p.matchType !== "Ignoré" &&
        finalMatched.some((m: any) => cleLigneBancaire(m) === cleLigneBancaire(p))
      ).length;
      if (autoOverwritten > 0) {
        console.log(`ℹ️ Re-import : ${autoOverwritten} ligne(s) auto-rapprochée(s) recalculée(s), ${previousManualByKey.size} pointage(s) manuel(s) préservé(s)`);
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
      //  Bug #8 : Mise à jour du status des paiements virement pointés
      // ─────────────────────────────────────────────────────────────────────
      // Quand un virement est rapproché (auto ou manuel), on marque le paiement
      // comme "paid" dans Firestore pour qu'il ne réapparaisse pas dans l'alerte
      // "virements attendus >7j" et pour que l'encaissement soit reflété côté compta.
      const paymentsToUpdate = new Set<string>();
      for (const bl of finalMatched as any[]) {
        if (bl.matched && bl.manualPaymentId) {
          paymentsToUpdate.add(bl.manualPaymentId);
        }
      }
      if (paymentsToUpdate.size > 0) {
        try {
          await Promise.all(Array.from(paymentsToUpdate).map(async (pid) => {
            const pSnap = await getDoc(doc(db, "payments", pid));
            if (!pSnap.exists()) return;
            const p = pSnap.data() as any;
            if (p.status === "paid") return; // déjà marqué
            await updateDoc(doc(db, "payments", pid), {
              status: "paid",
              paidAmount: p.totalTTC || p.paidAmount || 0,
              paidAt: serverTimestamp(),
              reconciledByBank: true,
            });
          }));
          console.log(`✅ ${paymentsToUpdate.size} paiement(s) virement marqué(s) comme encaissé(s)`);
          // Recharger les paiements pour rafraîchir l'UI
          fetchData();
        } catch (e) {
          console.error("Erreur mise à jour paiements rapprochés:", e);
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
            uncertain: bl.uncertain || false,
          })));
        } else {
          setBankLines([]);
        }
      } catch { setBankLines([]); }
    })();
  }, [period]);

  return {
    bankLines, setBankLines,
    handleCSVImport,
    updateAndSaveBankLines,
    saveBankLinesByMonth,
    syncVersementsEspeces,
    syncReconciledFromBankLines,
  };
}
