"use client";

/**
 * src/app/admin/comptabilite/sync-firestore.ts
 *
 * Les trois écritures en cascade qui gardent la comptabilité cohérente après
 * un rapprochement bancaire.
 *
 * Le même euro est vu par trois écrans différents : le relevé bancaire, les
 * bordereaux de remise, et le livre de caisse. Rapprocher une ligne du relevé
 * doit se répercuter sur les deux autres, sinon un encaissement réapparaît
 * dans « à remettre » alors qu'il est déjà en banque, ou un versement
 * d'espèces manque au livre de caisse.
 *
 * Ces fonctions n'ont AUCUN état React : elles reçoivent les données du mois
 * et écrivent. C'est ce qui permet de les appeler depuis l'import CSV comme
 * depuis un pointage manuel, avec la garantie qu'elles font la même chose.
 *
 * ⚠️ RÈGLE DE PÉRIODE, valable pour les trois : on ne DÉ-marque jamais rien
 * en dehors du mois affiché. Un import partiel d'avril ne doit pas défaire le
 * rapprochement de mars — c'est un bug réellement vécu, et le filtre de
 * période en est la seule protection.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BankLine, Payment } from "./types";

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
export async function syncReconciledFromBankLines(params: {
  lines: BankLine[];
  encaissementsCompta: any[];
  payments: Payment[];
  remises: any[];
  period: string;
}) {
  const { lines, encaissementsCompta, payments, remises, period } = params;
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
}

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
export async function saveBankLinesByMonth(
  lines: BankLine[],
  mode: "user-update" | "csv-import" = "user-update"
) {
  // 1. Grouper par mois (YYYY-MM extrait de DD/MM/YYYY)
  const byMonth: Record<string, BankLine[]> = {};
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
}


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
export async function syncVersementsEspeces(lines: BankLine[]) {
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
}
