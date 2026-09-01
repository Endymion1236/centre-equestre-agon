"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Download, Upload, Check, FileText, Building2, Receipt, Calculator, Search, Printer, Plus, Sparkles, Bot, AlertTriangle, EyeOff, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { PLAN_COMPTABLE } from "@/lib/ventilation-comptable";
import {
  analyserPeriodeCsv,
  cleLigneBancaire,
  encaissementEnDetail,
  estDansFenetreBancaire,
  parserCsvBancaire,
  parserDateBancaire,
  parserDetailCa,
  periodePrecedente,
  trouverSousEnsembleMontant,
} from "./rapprochement-utils";
import { construireFecVentes } from "./fec-utils";
import PanneauxDebug from "./PanneauxDebug";
import OngletRemise from "./OngletRemise";
import { modeLabels } from "./libelles-modes";
import {
  calculerSyntheseFactures,
  calculerTotauxJournaliers,
  filtrerFacturesPeriode,
} from "./synthese-compta-utils";
import {
  construireExportComptable,
  type TypeExportComptable,
} from "./exports-csv-utils";

interface Payment {
  id: string;
  familyName: string;
  items: { activityTitle: string; priceHT: number; tva: number; priceTTC: number }[];
  totalTTC: number;
  paymentMode: string;
  paymentRef: string;
  status: string;
  paidAmount: number;
  date: any;
  reconciledByBank?: boolean;
}

// Plan comptable partagé avec l'export CA ventilé (lib/ventilation-comptable).
const accounts = PLAN_COMPTABLE;


export default function ComptabilitePage() {
  const searchParams = useSearchParams();
  // Les panneaux de maintenance sont montés par PanneauxDebug selon ce
  // paramètre : l'écran comptable n'a plus à connaître lequel s'affiche.
  const debugParam = searchParams?.get("debug") ?? null;


  const [tab, setTab] = useState<"journal" | "tva" | "rapprochement" | "rapprochement_ignores" | "remise" | "fec" | "export">(
    // ?tab=rapprochement : la checklist « Boucler le mois » envoie directement
    // sur le pointage bancaire quand un écart mérite d'être creusé.
    searchParams?.get("tab") === "rapprochement" ? "rapprochement" : "journal",
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [remises, setRemises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtres remise
  // Filtres de la liste "Encaissements à remettre"
  // Édition remise (ajouter/retirer paiements)
  // Pointage manuel remise

  // ── IA ──────────────────────────────────────────────────────────────────────
  const [iaLoading, setIaLoading] = useState(false);
  const [iaAnalysis, setIaAnalysis] = useState<string | null>(null);
  const [iaStats, setIaStats] = useState<any>(null);
  const [iaQuestion, setIaQuestion] = useState("");
  const [iaAnswer, setIaAnswer] = useState<string | null>(null);
  const [iaAnswerLoading, setIaAnswerLoading] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [bankLines, setBankLines] = useState<{ date: string; label: string; amount: number; matched: boolean; matchType: string; matchDetail: string; matchedEncs?: { familyName: string; montant: number; date: string; activityTitle: string; mode: string }[]; missingAmounts?: number[]; manualPaymentId?: string; uncertain?: boolean }[]>([]);
  // Pointage manuel
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null); // index de la bankLine
  const [expandedBankLine, setExpandedBankLine] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState("");

  // Option A : modale pour coller le détail d'une remise depuis le site Crédit Agricole
  const [showCADetailModal, setShowCADetailModal] = useState<number | null>(null);
  const [caDetailText, setCaDetailText] = useState("");
  const [caDetailPreview, setCaDetailPreview] = useState<{ found: any[]; missing: number[]; total: number } | null>(null);

  // Sélection manuelle pour bordereau de remise : IDs des encaissements cochés
  // Filtre d'affichage par mode dans la liste à remettre ("" = tous)

  // ─────────────────────────────────────────────────────────────────────────
  //  Diagnostic remises (panel ?debug=diag)
  //  Calcule un rapport read-only à partir des données déjà chargées dans
  //  l'UI (remises, encaissementsCompta, payments). Pas de requête supplémentaire.
  // ─────────────────────────────────────────────────────────────────────────

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

  const [encaissementsCompta, setEncaissementsCompta] = useState<any[]>([]);
  const [remisesSepa, setRemisesSepa] = useState<any[]>([]);

  const fetchData = () => {
    getDocs(query(collection(db, "payments"), orderBy("date", "desc")))
      .then((snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Payment[]))
      .catch(() => {
        getDocs(collection(db, "payments")).then((snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Payment[]));
      })
      .finally(() => setLoading(false));
    getDocs(collection(db, "remises"))
      .then((snap) => setRemises(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    getDocs(collection(db, "encaissements"))
      .then((snap) => setEncaissementsCompta(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    getDocs(collection(db, "remises-sepa"))
      .then((snap) => setRemisesSepa(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  const filteredPayments = useMemo(
    () => filtrerFacturesPeriode(payments, period),
    [payments, period],
  );
  const { totalHT, totalTVA, totalTTC, tvaByRate, byMode } = useMemo(
    () => calculerSyntheseFactures(filteredPayments),
    [filteredPayments],
  );
  const dailyTotals = useMemo(
    () => calculerTotauxJournaliers(encaissementsCompta, period),
    [encaissementsCompta, period],
  );

  // CSV import handler — smart matching
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

  // ── Analyser avec l'IA ───────────────────────────────────────────────────
  const analyserRapprochement = async () => {
    if (bankLines.length === 0) return;
    setIaLoading(true);
    setIaAnalysis(null);
    try {
      const periodEnc = encaissementsCompta.filter(e => {
        const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
        if (!d) return false;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === period;
      });
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "rapprochement",
          bankLines: bankLines.map(l => ({ date: l.date, label: l.label, amount: l.amount, matched: l.matched, matchDetail: l.matchDetail })),
          encaissements: periodEnc.map(e => ({
            date: e.date?.seconds ? new Date(e.date.seconds*1000).toLocaleDateString("fr-FR") : "—",
            mode: e.mode, montant: e.montant || 0, familyName: e.familyName || "—",
            activityTitle: e.activityTitle || "",
          })),
          periode: period,
        }),
      });
      const data = await res.json();
      if (data.success) { setIaAnalysis(data.analysis); setIaStats(data.stats); }
      else setIaAnalysis(`Erreur : ${data.error}`);
    } catch (e: any) { setIaAnalysis(`Erreur : ${e.message}`); }
    setIaLoading(false);
  };

  const poserQuestion = async () => {
    if (!iaQuestion.trim()) return;
    setIaAnswerLoading(true);
    setIaAnswer(null);
    try {
      const totalCA = filteredPayments.reduce((s, p) => s + safeNumber(p.totalTTC), 0);
      const totalEnc = filteredPayments.filter(p => p.status === "paid").reduce((s, p) => s + safeNumber(p.paidAmount), 0);
      const modeMap: Record<string, number> = {};
      filteredPayments.filter(p => p.status === "paid").forEach(p => {
        modeMap[modeLabels[p.paymentMode] || p.paymentMode] = (modeMap[modeLabels[p.paymentMode] || p.paymentMode] || 0) + safeNumber(p.paidAmount);
      });
      const topFamilles = Object.entries(
        filteredPayments.filter(p=>p.status==="paid").reduce((acc: any, p) => {
          acc[p.familyName] = (acc[p.familyName] || 0) + safeNumber(p.paidAmount); return acc;
        }, {})
      ).sort((a: any, b: any) => b[1]-a[1]).slice(0,5).map(([name, total]) => ({ name, total: total as number }));
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question: iaQuestion,
          context: {
            totalCA, totalEncaisse: totalEnc,
            nbPaiements: filteredPayments.length,
            nbImpayés: filteredPayments.filter(p => (p.status === "pending" || p.status === "partial") && p.paymentMode !== "cheque_differe").length,
            topFamilles, periode: period,
            encaissementsParMode: modeMap,
          },
        }),
      });
      const data = await res.json();
      setIaAnswer(data.success ? data.answer : `Erreur : ${data.error}`);
    } catch (e: any) { setIaAnswer(`Erreur : ${e.message}`); }
    setIaAnswerLoading(false);
  };
  const generateFEC = () => {
    const content = construireFecVentes(filteredPayments);
    const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FEC_${period.replace("-", "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nbIgnores = bankLines.filter(b => b.matched && b.matchType === "Ignoré").length;

  // Classes Tailwind par couleur — on évite l'interpolation dynamique car Tailwind
  // purge les classes non détectées en compilation. On garde des chaînes complètes.
  type TabColor = "blue" | "purple" | "green" | "indigo" | "slate" | "rose" | "amber";
  const tabClasses: Record<TabColor, { active: string; inactive: string }> = {
    blue:   { active: "bg-blue-500 text-white border-blue-500",       inactive: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    purple: { active: "bg-purple-500 text-white border-purple-500",   inactive: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
    green:  { active: "bg-green-600 text-white border-green-600",     inactive: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
    indigo: { active: "bg-indigo-500 text-white border-indigo-500",   inactive: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
    slate:  { active: "bg-slate-500 text-white border-slate-500",     inactive: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
    rose:   { active: "bg-rose-600 text-white border-rose-600",       inactive: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
    amber:  { active: "bg-amber-500 text-white border-amber-500",     inactive: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  };

  const tabs: Array<{ id: typeof tab; label: string; icon: any; color: TabColor }> = [
    { id: "journal" as const,                label: "Journal des ventes", icon: Receipt,    color: "blue"   },
    { id: "tva" as const,                    label: "TVA",                icon: Calculator, color: "purple" },
    { id: "remise" as const,                 label: "Bordereaux remise",  icon: Printer,    color: "green"  },
    { id: "rapprochement" as const,          label: "Rapprochement",      icon: Building2,  color: "indigo" },
    { id: "rapprochement_ignores" as const,  label: nbIgnores > 0 ? `Ignorées (${nbIgnores})` : "Ignorées", icon: EyeOff, color: "slate" },
    { id: "fec" as const,                    label: "Export FEC",         icon: FileText,   color: "rose"   },
    { id: "export" as const,                 label: "Export CSV",         icon: Download,   color: "amber"  },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold text-blue-800">Comptabilité</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <Link href="/admin/comptabilite/diag-especes"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-2 rounded-lg no-underline">
            🔍 Diagnostic
          </Link>
          <Link href="/admin/comptabilite/masse-salariale"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 px-3 py-2 rounded-lg no-underline">
            👥 Masse salariale
          </Link>
          <Link href="/admin/comptabilite/tresorerie"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-lg no-underline">
            🏦 Trésorerie
          </Link>
          <Link href="/admin/comptabilite/cloture-mois"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-3 py-2 rounded-lg no-underline">
            ✅ Boucler le mois
          </Link>
          <Link href="/admin/comptabilite/resultat"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-lg no-underline">
            📈 Résultat
          </Link>
          <Link href="/admin/comptabilite/depenses"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 px-3 py-2 rounded-lg no-underline">
            🧾 Dépenses
          </Link>
          <Link href="/admin/comptabilite/livre-caisse"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-3 py-2 rounded-lg no-underline">
            💵 Livre de caisse
          </Link>
          <Link href="/admin/comptabilite/cloture-journaliere"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 px-3 py-2 rounded-lg no-underline">
            🔒 Clôture Z
          </Link>
          <Link href="/admin/comptabilite/fond-caisse"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-2 rounded-lg no-underline">
            💰 Fond de caisse
          </Link>
          <button
            onClick={async () => {
              try {
                // 1. FEC
                generateFEC();
                // 2. PDF synthèse (ouvre dans nouvel onglet)
                const periodEnc = encaissementsCompta.filter(e => {
                  const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                  if (!d) return false;
                  const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  return pm === period;
                });
                const res = await authFetch("/api/compta-export-pdf", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    period,
                    payments: filteredPayments,
                    encaissements: periodEnc,
                  }),
                });
                if (!res.ok) {
                  alert("Erreur génération PDF : " + await res.text());
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                // Ne pas révoquer immédiatement pour que l'onglet puisse charger
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              } catch (e: any) {
                console.error("[export compta] échec:", e);
                alert("Erreur lors de l'export : " + e.message);
              }
            }}
            disabled={filteredPayments.length === 0}
            className="flex items-center gap-2 text-white font-body text-sm font-semibold px-4 py-2 rounded-full border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:-translate-y-px active:scale-[0.96]"
            style={{
              background: "linear-gradient(135deg, #2050A0 0%, #122A5A 100%)",
              boxShadow: "0 4px 12px rgba(32, 80, 160, 0.28)",
            }}
            title="Télécharge le FEC (.txt) et ouvre le PDF de synthèse">
            <Download size={16} />
            Export complet du mois
          </button>
          <label className="font-body text-xs text-slate-500">Période :</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* KPIs */}
      {(() => {
        const periodEncaissements = encaissementsCompta.filter(e => {
          const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (!d) return false;
          const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return pm === period;
        });
        const totalEncaisse = periodEncaissements.reduce((s, e) => s + (e.montant || 0), 0);
        const totalAvoirsEmis = periodEncaissements.filter(e => e.isAvoir).reduce((s, e) => s + Math.abs(e.montant || 0), 0);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
            {[
              { label: "CA HT", value: `${totalHT.toFixed(0)}€`, color: "text-blue-500" },
              { label: "TVA collectée", value: `${totalTVA.toFixed(0)}€`, color: "text-orange-500" },
              { label: "CA TTC (facturé)", value: `${totalTTC.toFixed(0)}€`, color: "text-blue-800" },
              { label: "Total encaissé", value: `${totalEncaisse.toFixed(0)}€`, color: "text-green-600" },
              { label: "Avoirs émis", value: totalAvoirsEmis > 0 ? `-${totalAvoirsEmis.toFixed(0)}€` : "0€", color: totalAvoirsEmis > 0 ? "text-red-500" : "text-slate-400" },
              { label: "Paiements", value: filteredPayments.length.toString(), color: "text-slate-600" },
            ].map((k, i) => (
              <Card key={i} padding="sm">
                <div className={`font-body text-xl font-bold ${k.color}`}>{k.value}</div>
                <div className="font-body text-[10px] text-slate-500 uppercase">{k.label}</div>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(({ id, label, icon: Icon, color }) => {
          const isActive = tab === id;
          const cls = tabClasses[color];
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
                ${isActive ? cls.active : cls.inactive}`}>
              <Icon size={16} /> {label}
            </button>
          );
        })}
      </div>

      {loading && <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>}

      {/* ─── Journal des ventes ─── */}
      {!loading && tab === "journal" && (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
          <div className="min-w-[700px]">
          <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span className="w-20">Date</span>
            <span className="flex-1">Client</span>
            <span className="w-40">Prestation</span>
            <span className="w-20 text-center">Mode</span>
            <span className="w-16 text-right">HT</span>
            <span className="w-16 text-right">TVA</span>
            <span className="w-16 text-right">TTC</span>
          </div>
          {filteredPayments.length === 0 ? (
            <div className="p-8 text-center font-body text-sm text-slate-500">Aucun paiement sur cette période.</div>
          ) : (
            <>
              {filteredPayments.map((p) => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const ht = (p.items || []).reduce((s, i) => s + (i.priceHT || 0), 0);
                const tva = (p.totalTTC || 0) - ht;
                return (
                  <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30">
                    <span className="w-20 font-body text-xs text-slate-500">{d.toLocaleDateString("fr-FR")}</span>
                    <span className="flex-1 font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                    <span className="w-40 font-body text-xs text-slate-600 truncate">{(p.items || []).map((i) => i.activityTitle).join(", ")}</span>
                    <span className="w-20 text-center"><Badge color="blue">{modeLabels[p.paymentMode] || p.paymentMode}</Badge></span>
                    <span className="w-16 text-right font-body text-xs text-slate-600">{ht.toFixed(2)}€</span>
                    <span className="w-16 text-right font-body text-xs text-orange-500">{tva.toFixed(2)}€</span>
                    <span className="w-16 text-right font-body text-sm font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                  </div>
                );
              })}

              {/* ── Avoirs (encaissements négatifs) ── */}
              {(() => {
                const avoirEncaissements = encaissementsCompta.filter(e => {
                  if (!e.isAvoir) return false;
                  const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                  if (!d) return false;
                  const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  return pm === period;
                });
                if (avoirEncaissements.length === 0) return null;
                const totalAvoirs = avoirEncaissements.reduce((s, e) => s + Math.abs(e.montant || 0), 0);
                return (
                  <>
                    <div className="px-5 py-2 bg-red-50/50 border-b border-red-200/50 flex font-body text-[10px] font-semibold text-red-500 uppercase tracking-wider">
                      <span>Avoirs émis sur la période</span>
                    </div>
                    {avoirEncaissements.map((e: any) => {
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : new Date();
                      return (
                        <div key={e.id} className="px-5 py-3 border-b border-red-100/50 last:border-b-0 flex items-center hover:bg-red-50/20 bg-red-50/10">
                          <span className="w-20 font-body text-xs text-slate-500">{d.toLocaleDateString("fr-FR")}</span>
                          <span className="flex-1 font-body text-sm font-semibold text-red-700">{e.familyName}</span>
                          <span className="w-40 font-body text-xs text-red-500 truncate">{e.activityTitle || e.modeLabel || "Avoir"}</span>
                          <span className="w-20 text-center"><Badge color="red">{e.avoirRef || "Avoir"}</Badge></span>
                          <span className="w-16 text-right font-body text-xs text-red-400">—</span>
                          <span className="w-16 text-right font-body text-xs text-red-400">—</span>
                          <span className="w-16 text-right font-body text-sm font-semibold text-red-600">-{Math.abs(e.montant || 0).toFixed(2)}€</span>
                        </div>
                      );
                    })}
                    <div className="px-5 py-2 bg-red-50/30 flex font-body text-xs font-semibold text-red-600">
                      <span className="flex-1">Total avoirs</span>
                      <span className="w-40"></span><span className="w-20"></span>
                      <span className="w-16"></span><span className="w-16"></span>
                      <span className="w-16 text-right">-{totalAvoirs.toFixed(2)}€</span>
                    </div>
                  </>
                );
              })()}

              <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
                <span className="flex-1">TOTAL</span>
                <span className="w-40"></span><span className="w-20"></span>
                <span className="w-16 text-right text-blue-800">{totalHT.toFixed(2)}€</span>
                <span className="w-16 text-right text-orange-500">{totalTVA.toFixed(2)}€</span>
                <span className="w-16 text-right text-blue-500">{totalTTC.toFixed(2)}€</span>
              </div>
            </>
          )}
          </div>
          </div>
        </Card>
      )}

      {/* ─── TVA ─── */}
      {!loading && tab === "tva" && (
        <div className="flex flex-col gap-5">
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="flex-1">Taux TVA</span>
              <span className="w-24 text-right">Base HT</span>
              <span className="w-24 text-right">TVA</span>
              <span className="w-24 text-right">TTC</span>
            </div>
            {tvaByRate.map(([rate, data]) => (
              <div key={rate} className="px-5 py-3 border-b border-blue-500/8 flex items-center">
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">{rate}%</span>
                <span className="w-24 text-right font-body text-sm text-slate-600">{data.ht.toFixed(2)}€</span>
                <span className="w-24 text-right font-body text-sm font-semibold text-orange-500">{data.tva.toFixed(2)}€</span>
                <span className="w-24 text-right font-body text-sm font-semibold text-blue-500">{data.ttc.toFixed(2)}€</span>
              </div>
            ))}
            <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
              <span className="flex-1">TOTAL</span>
              <span className="w-24 text-right">{totalHT.toFixed(2)}€</span>
              <span className="w-24 text-right text-orange-500">{totalTVA.toFixed(2)}€</span>
              <span className="w-24 text-right text-blue-500">{totalTTC.toFixed(2)}€</span>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Répartition par mode de paiement</h3>
            <div className="flex flex-col gap-2">
              {byMode.map(([mode, amount]) => (
                <div key={mode} className="flex items-center justify-between py-2 border-b border-blue-500/8 last:border-b-0">
                  <span className="font-body text-sm text-slate-600">{modeLabels[mode] || mode}</span>
                  <span className="font-body text-sm font-semibold text-blue-500">{amount.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Bordereaux de remise ─── */}
      {!loading && tab === "remise" && (
        <OngletRemise payments={payments} remises={remises}
          encaissementsCompta={encaissementsCompta} fetchData={fetchData} />
      )}

      {/* ─── Rapprochement bancaire ─── */}
      {!loading && tab === "rapprochement" && (
        <div className="flex flex-col gap-5">

          {/* ── Dashboard rapprochement ────────────────────────────────── */}
          {(() => {
            // Virements en attente depuis > 7 jours
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const virAttendus = payments.filter(p =>
              p.paymentMode === "virement" &&
              (p.status === "pending" || p.status === "partial") &&
              p.date?.seconds && new Date(p.date.seconds * 1000) < sevenDaysAgo
            );
            // Stats bankLines
            const nbMatched = bankLines.filter(b => b.matched).length;
            const nbPending = bankLines.filter(b => !b.matched).length;
            const montantPending = bankLines.filter(b => !b.matched).reduce((s, b) => s + b.amount, 0);

            return (
              <>
                {/* KPIs rapprochement */}
                {bankLines.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-green-600">{nbMatched}</div>
                      <div className="font-body text-[11px] text-slate-500">✅ Rapprochées</div>
                    </Card>
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-orange-500">{nbPending}</div>
                      <div className="font-body text-[11px] text-slate-500">⏳ À traiter</div>
                      {nbPending > 0 && <div className="font-body text-[10px] text-orange-400">{montantPending.toFixed(0)}€</div>}
                    </Card>
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-blue-500">
                        {bankLines.length > 0 ? Math.round((nbMatched / bankLines.length) * 100) : 0}%
                      </div>
                      <div className="font-body text-[11px] text-slate-500">Taux match</div>
                    </Card>
                  </div>
                )}

                {/* Alertes virements attendus non reçus */}
                {virAttendus.length > 0 && (
                  <Card padding="md" className="border-orange-200 bg-orange-50">
                    <div className="font-body text-sm font-semibold text-orange-700 mb-2">
                      ⚠️ {virAttendus.length} virement{virAttendus.length > 1 ? "s" : ""} attendu{virAttendus.length > 1 ? "s" : ""} depuis plus de 7 jours
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {virAttendus.map((p: any) => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                        const joursAttente = d ? Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)) : "?";
                        return (
                          <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                            <div>
                              <span className="font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                              <span className="font-body text-xs text-slate-500 ml-2">
                                {(p.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 40)}
                              </span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-body text-sm font-bold text-orange-600">{(p.totalTTC || 0).toFixed(2)}€</div>
                              <div className="font-body text-[10px] text-slate-400">J+{joursAttente}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="font-body text-xs text-orange-600 mt-2">
                      Total attendu : <strong>{virAttendus.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0).toFixed(2)}€</strong>
                    </div>
                  </Card>
                )}
              </>
            );
          })()}

          <Card padding="md" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              Importez votre relevé bancaire au format CSV pour rapprocher les mouvements avec vos encaissements. Les virements sont également matchés par nom de famille dans le libellé. Cliquez sur "Pointer" pour les lignes non rapprochées.
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Importer un relevé bancaire</h3>
            <p className="font-body text-xs text-slate-500 mb-2">Compatible Crédit Agricole, LCL, BNP, Société Générale (CSV avec séparateur point-virgule)</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="font-body text-xs text-amber-900">
                <b>Remises CB :</b> le matching automatique par "sous-ensemble" est désactivé pour éviter les associations erronées. Les remises <code className="bg-amber-100 px-1 rounded">REMISE CARTE</code> arrivent en "À traiter" — utilise le bouton <b>Détail CA</b> sur chaque remise pour coller le détail des transactions copié depuis le site Crédit Agricole.
                <br />
                Les chèques, espèces et virements continuent d'être matchés automatiquement.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-2 font-body text-sm font-semibold text-blue-500 bg-white px-5 py-3 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors inline-flex">
                <Upload size={16} /> Importer CSV
                <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
              </label>
              {bankLines.length > 0 && bankLines.some(b => b.matched) && (
                <button
                  onClick={async () => {
                    if (!confirm("Synchroniser les encaissements et remises avec les lignes bancaires actuellement matchées ?\n\n• Les encaissements reliés seront marqués 'rapprochés' (donc retirés de 'à remettre').\n• Les remises dont tous les encaissements sont rapprochés seront pointées automatiquement.")) return;
                    try {
                      // 1. Reconstruire usedEncIds à partir des bankLines matchées
                      //    Via matchedEncs on a (familyName, montant, date, activityTitle)
                      //    → on retrouve les encaissements correspondants
                      const targetEncIds = new Set<string>();
                      const targetRemiseIds = new Set<string>();
                      const targetPaymentIds = new Set<string>();

                      for (const bl of bankLines) {
                        if (!bl.matched) continue;
                        if (bl.matchType === "Ignoré") continue;

                        // Paiement virement : via manualPaymentId
                        if (bl.manualPaymentId) targetPaymentIds.add(bl.manualPaymentId);

                        // Encaissements individuels : via matchedEncs
                        // Déduplication multi-set : plusieurs encs peuvent partager
                        // le même triplet (familyName, montant, date) — typique des
                        // remises "Sous-ensemble CB Terminal" qui regroupent N
                        // promenades du même jour à 25€ pour la même famille.
                        // On exclut les ids déjà consommés pour qu'à chaque enc
                        // de matchedEncs corresponde un enc Firestore distinct.
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

                        // Remises bancaires : détection via matchType "Chèques" / "Espèces"
                        // + montant exact → on cherche un bordereau existant
                        if (bl.matchType === "Chèques" || bl.matchType === "Espèces") {
                          const remiseMatch = (remises || []).find((r: any) =>
                            Math.abs((r.total || 0) - bl.amount) < 0.02 &&
                            (r.paymentMode === (bl.matchType === "Chèques" ? "cheque" : "especes") || r.paymentMode === "mixte")
                          );
                          if (remiseMatch) targetRemiseIds.add(remiseMatch.id);
                        }
                      }

                      // 1.bis. Détection indirecte des remises via leurs encaissements
                      //        Si tous les encs d'une remise sont dans targetEncIds, on pointe la remise.
                      for (const r of (remises || [])) {
                        if (targetRemiseIds.has(r.id)) continue;
                        const encIds = r.encaissementIds || [];
                        if (encIds.length === 0) continue;
                        const allConsumed = encIds.every((id: string) => targetEncIds.has(id));
                        if (allConsumed) {
                          targetRemiseIds.add(r.id);
                          console.log(`[resync] Remise ${r.id} détectée indirectement via encs`);
                        }
                      }

                      // 2. Marquer les encaissements
                      const encUpdates: Promise<any>[] = [];
                      for (const encId of targetEncIds) {
                        encUpdates.push(updateDoc(doc(db, "encaissements", encId), {
                          reconciledByBank: true,
                          reconciledAt: serverTimestamp(),
                        }));
                      }

                      // 3. Marquer les remises comme pointées
                      const remiseUpdates: Promise<any>[] = [];
                      for (const rid of targetRemiseIds) {
                        remiseUpdates.push(updateDoc(doc(db, "remises", rid), {
                          pointee: true,
                          pointeeDate: new Date().toISOString(),
                          pointeeNote: "Synchronisation rétroactive depuis le rapprochement bancaire",
                          updatedAt: serverTimestamp(),
                        }));
                      }

                      // 4. Marquer les paiements virement comme payés
                      const paymentUpdates: Promise<any>[] = [];
                      for (const pid of targetPaymentIds) {
                        const pSnap = await getDoc(doc(db, "payments", pid));
                        if (!pSnap.exists()) continue;
                        const p = pSnap.data() as any;
                        if (p.status === "paid") continue;
                        paymentUpdates.push(updateDoc(doc(db, "payments", pid), {
                          status: "paid",
                          paidAmount: p.totalTTC || p.paidAmount || 0,
                          paidAt: serverTimestamp(),
                          reconciledByBank: true,
                        }));
                      }

                      await Promise.all([...encUpdates, ...remiseUpdates, ...paymentUpdates]);

                      // 5. Créer les versements espèces manquants (sync livre de caisse)
                      await syncVersementsEspeces(bankLines);

                      alert(`✅ Synchronisation terminée\n\n• ${encUpdates.length} encaissement(s) marqués rapprochés\n• ${remiseUpdates.length} remise(s) pointée(s)\n• ${paymentUpdates.length} paiement(s) virement marqué(s) payés`);
                      fetchData();
                    } catch (e: any) {
                      console.error("Erreur sync rétroactive:", e);
                      alert(`Erreur : ${e.message || e}`);
                    }
                  }}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-3 rounded-lg border border-purple-200 cursor-pointer">
                  🔄 Resynchroniser
                </button>
              )}
              {bankLines.length > 0 && bankLines.some(b => b.matched) && (
                <button
                  onClick={async () => {
                    // ─────────────────────────────────────────────────────────
                    // NETTOYAGE DES DOUBLONS matchedEncs
                    //
                    // Bug historique : l'algo de matching a parfois inscrit
                    // le même triplet (famille, montant, date) dans matchedEncs
                    // de plusieurs bankLines, alors qu'il n'existe qu'UN seul
                    // encaissement Firestore correspondant. Conséquence : le
                    // compteur "à remettre" reste élevé car les bankLines
                    // suivantes n'ont pas de cible réelle.
                    //
                    // Ce bouton :
                    //   1. Parcourt les bankLines dans l'ordre
                    //   2. Pour chaque entrée matchedEncs, cherche un enc
                    //      Firestore non encore consommé (triplet exact)
                    //   3. Les entrées orphelines (déjà consommées) sont
                    //      retirées
                    //   4. Si une bankLine perd toutes ses entrées → on la
                    //      dé-matche
                    //   5. Affiche un rapport, demande confirmation, écrit
                    // ─────────────────────────────────────────────────────────
                    try {
                      const claimedEncIds = new Set<string>();
                      const cleanedLines = bankLines.map(bl => ({ ...bl, matchedEncs: bl.matchedEncs ? [...bl.matchedEncs] : undefined }));

                      let totalOrphans = 0;
                      let linesEmptied = 0;
                      const reportSamples: string[] = [];

                      for (let i = 0; i < cleanedLines.length; i++) {
                        const bl = cleanedLines[i];
                        if (!bl.matched) continue;
                        if (bl.matchType === "Ignoré") continue;
                        if (!bl.matchedEncs || bl.matchedEncs.length === 0) continue;

                        const kept: typeof bl.matchedEncs = [];
                        const orphans: typeof bl.matchedEncs = [];

                        for (const enc of bl.matchedEncs) {
                          // Cherche un enc Firestore non encore consommé
                          const candidate = encaissementsCompta.find((e: any) => {
                            if (claimedEncIds.has(e.id)) return false;
                            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                            return (e.familyName || "") === enc.familyName
                              && Math.abs((e.montant || 0) - enc.montant) < 0.02
                              && d === enc.date;
                          });
                          if (candidate) {
                            claimedEncIds.add(candidate.id);
                            kept.push(enc);
                          } else {
                            orphans.push(enc);
                          }
                        }

                        if (orphans.length > 0) {
                          totalOrphans += orphans.length;
                          if (reportSamples.length < 5) {
                            reportSamples.push(`Ligne ${bl.date} (${bl.amount}€) : ${orphans.length} orphelin(s) — ex: ${orphans[0].familyName} ${orphans[0].montant}€`);
                          }
                          cleanedLines[i].matchedEncs = kept;
                          if (kept.length === 0) {
                            // Toutes les entrées étaient orphelines → on dé-matche
                            // SAUF si c'est un type qui ne dépend pas de matchedEncs
                            // (Virement avec manualPaymentId, Chèques/Espèces remises…)
                            const hasOtherAnchor = bl.manualPaymentId
                              || bl.matchType === "Chèques"
                              || bl.matchType === "Espèces";
                            if (!hasOtherAnchor) {
                              cleanedLines[i] = {
                                ...cleanedLines[i],
                                matched: false,
                                matchType: "",
                                matchDetail: "",
                                matchedEncs: undefined,
                              };
                              linesEmptied++;
                            }
                          }
                        }
                      }

                      if (totalOrphans === 0) {
                        alert("✅ Aucun doublon détecté.\n\nToutes les entrées matchedEncs correspondent à un encaissement Firestore distinct.");
                        return;
                      }

                      const message = `🧹 Rapport de nettoyage\n\n`
                        + `• ${totalOrphans} entrée(s) orpheline(s) à retirer\n`
                        + `• ${linesEmptied} ligne(s) bancaire(s) à dé-matcher (devenues vides)\n\n`
                        + `Exemples :\n${reportSamples.map(s => `  ${s}`).join("\n")}\n\n`
                        + `Confirmer l'écriture en base ?`;

                      if (!confirm(message)) return;

                      await saveBankLinesByMonth(cleanedLines);

                      setBankLines(cleanedLines);
                      alert(`✅ Nettoyage terminé\n\n• ${totalOrphans} doublon(s) retiré(s)\n• ${linesEmptied} ligne(s) dé-matchée(s)\n\nClique maintenant sur "Resynchroniser" pour mettre à jour les encaissements.`);
                    } catch (e: any) {
                      console.error("[clean-duplicates] Erreur:", e);
                      alert(`Erreur : ${e.message || e}`);
                    }
                  }}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-3 rounded-lg border border-amber-200 cursor-pointer">
                  🧹 Nettoyer doublons
                </button>
              )}
            </div>
            {bankLines.length > 0 && bankLines.some(b => b.matched) && (
              <p className="font-body text-[11px] text-slate-500 mt-2">
                "Resynchroniser" marque tous les encaissements/remises/paiements correspondant aux rapprochements actuels. "Nettoyer doublons" retire les entrées matchedEncs qui pointent vers un encaissement déjà revendiqué par une autre ligne bancaire.
              </p>
            )}
          </Card>

          {bankLines.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className="w-24">Date</span>
                <span className="flex-1">Libellé bancaire</span>
                <span className="w-24 text-right">Montant</span>
                <span className="w-28 text-center">Rapprochement</span>
                <span className="w-20 text-center">Statut</span>
                <span className="w-20 text-center">Action</span>
              </div>
              {bankLines
                .map((bl, i) => ({ bl, i }))
                .filter(({ bl }) => bl.matchType !== "Ignoré") // les ignorées sont dans l'onglet dédié
                .map(({ bl, i }) => {
                  // Détecter une remise CB partiellement matchée via Détail CA
                  // (X/Y transactions trouvées avec N manquantes). On stocke
                  // missingAmounts[] depuis le commit Détail CA pour pouvoir les
                  // afficher au survol et signaler visuellement la ligne.
                  const hasMissing = !!(bl.missingAmounts && bl.missingAmounts.length > 0);
                  const missingTooltip = hasMissing
                    ? `${bl.missingAmounts!.length} transaction(s) non retrouvée(s) :\n` +
                      bl.missingAmounts!.map(a => `• ${a.toFixed(2)}€`).join("\n") +
                      `\n\nCela signifie que ces montants apparaissent dans le détail Crédit Agricole de cette remise mais qu'aucun encaissement CB Terminal n'a été enregistré dans Claude pour ces montants. Vérifie le TPE ou ajoute les paiements manquants.`
                    : undefined;
                return (
                <div key={i}>
                <div title={missingTooltip}
                  className={`px-5 py-3 border-b border-blue-500/8 flex items-center ${
                    bl.matched
                      ? hasMissing
                        ? "bg-amber-50 border-l-4 border-l-amber-500" // surlignage : remise CB partielle
                        : ""
                      : "bg-orange-50"
                  }`}>
                  <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                  <div className="flex-1">
                    <div className="font-body text-sm text-blue-800 flex items-center gap-1.5">
                      {bl.label}
                      {hasMissing && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-900 cursor-help">
                          ⚠ {bl.missingAmounts!.length} manquant{bl.missingAmounts!.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {bl.matched && bl.matchDetail && (
                      <div className="font-body text-xs text-green-600 mt-0.5 flex items-center gap-1">
                        {bl.matchedEncs && bl.matchedEncs.length > 1 ? (
                          <button onClick={() => setExpandedBankLine(expandedBankLine === i ? null : i)}
                            className="flex items-center gap-1 text-green-600 bg-transparent border-none cursor-pointer p-0 font-body text-xs hover:text-green-800">
                            <span className={`inline-block transition-transform ${expandedBankLine === i ? "rotate-90" : ""}`}>▶</span>
                            ↳ {bl.matchDetail}
                          </button>
                        ) : (
                          <span>↳ {bl.matchDetail}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="w-24 text-right font-body text-sm font-semibold text-green-600">{bl.amount.toFixed(2)}€</span>
                  <span className="w-28 text-center">
                    {bl.matched && bl.matchType && (
                      <Badge color={
                        bl.matchType === "Ignoré" ? "gray"
                        : bl.uncertain ? "yellow"
                        : bl.matchType === "Manuel" ? "orange"
                        : "blue"
                      }>
                        {bl.uncertain ? "⚠️ " : ""}{bl.matchType}
                      </Badge>
                    )}
                  </span>
                  <span className="w-20 text-center">
                    <Badge color={bl.matched ? (bl.uncertain ? "yellow" : "green") : "orange"}>
                      {bl.matched ? (bl.uncertain ? "À vérifier" : "OK") : "À traiter"}
                    </Badge>
                  </span>
                  <span className="w-20 text-center">
                    {!bl.matched && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setShowManualMatch(i); setManualSearch(""); }}
                          className="font-body text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-blue-100">
                          Pointer
                        </button>
                        {/* Bouton Détail CA : uniquement pour les remises CB */}
                        {(bl.label.toUpperCase().includes("REMISE") && (bl.label.toUpperCase().includes("CARTE") || bl.label.toUpperCase().includes("CB") || bl.label.toUpperCase().includes("TPE"))) && (
                          <button onClick={() => { setShowCADetailModal(i); setCaDetailText(""); setCaDetailPreview(null); }}
                            className="font-body text-[10px] text-purple-600 bg-purple-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-purple-100"
                            title="Coller le détail de la remise depuis le site Crédit Agricole">
                            📋 Détail CA
                          </button>
                        )}
                        <button onClick={() => {
                          const updated = [...bankLines];
                          updated[i] = { ...updated[i], matched: true, matchType: "Ignoré", matchDetail: "Ignoré manuellement" };
                          updateAndSaveBankLines(updated);
                        }}
                          className="font-body text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-slate-100">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {bl.matched && bl.matchType === "Ignoré" && (
                      <button onClick={() => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "" };
                        updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">
                        Restaurer
                      </button>
                    )}
                    {/* Bouton "Dé-pointer" universel pour tout match hors Ignoré.
                        La sync auto dans updateAndSaveBankLines se charge de repasser
                        les encs à reconciledByBank=false et les payments virement à pending. */}
                    {bl.matched && bl.matchType !== "Ignoré" && (
                      <button onClick={async () => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "", matchedEncs: undefined, manualPaymentId: undefined, uncertain: false };
                        await updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100"
                        title="Annuler ce rapprochement et remettre l'encaissement dans 'à remettre'">
                        Dé-pointer
                      </button>
                    )}
                  </span>
                </div>
                {/* Accordéon détail des encaissements */}
                {expandedBankLine === i && bl.matchedEncs && bl.matchedEncs.length > 1 && (
                  <div className="px-5 py-2 bg-green-50 border-b border-green-200">
                    <div className="ml-24">
                      <table className="w-full" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr className="font-body text-[10px] text-slate-400 uppercase">
                            <th className="text-left py-1 pr-3">Date</th>
                            <th className="text-left py-1 pr-3">Famille</th>
                            <th className="text-left py-1 pr-3">Activité</th>
                            <th className="text-right py-1">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bl.matchedEncs.map((enc, j) => (
                            <tr key={j} className="font-body text-xs border-t border-green-100">
                              <td className="py-1.5 pr-3 text-slate-500">{enc.date}</td>
                              <td className="py-1.5 pr-3 text-blue-800 font-semibold">{enc.familyName}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{enc.activityTitle}</td>
                              <td className="py-1.5 text-right text-green-700 font-semibold">{enc.montant.toFixed(2)}€</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                </div>
              )})}
              <div className="px-5 py-3 bg-sand flex justify-between font-body text-sm">
                <span className="font-semibold text-blue-800">
                  {bankLines.filter(b => b.matchType !== "Ignoré").length} lignes affichées
                  {nbIgnores > 0 && (
                    <span className="text-slate-500 font-normal ml-2">
                      ({nbIgnores} ignorée{nbIgnores > 1 ? "s" : ""} dans l'onglet dédié)
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-green-600 font-semibold">
                    {bankLines.filter((b) => b.matched && b.matchType !== "Ignoré").length} rapprochées
                  </span>
                  {" · "}
                  <span className="text-orange-500 font-semibold">
                    {bankLines.filter((b) => !b.matched).length} à traiter
                  </span>
                </span>
              </div>
            </Card>
          )}

          {/* ── Bouton IA + analyse ── */}
          {bankLines.length > 0 && (
            <div className="flex flex-col gap-4">
              <button onClick={analyserRapprochement} disabled={iaLoading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
                {iaLoading
                  ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours...</>
                  : <><Sparkles size={16} /> Analyser avec l'IA</>}
              </button>

              {iaStats && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total relevé", value: `${iaStats.totalBanque}€`, color: "text-blue-800" },
                    { label: "Total encaissé", value: `${iaStats.totalEnc}€`, color: "text-green-600" },
                    { label: "Écart", value: `${iaStats.ecart}€`, color: parseFloat(iaStats.ecart) === 0 ? "text-green-600" : "text-orange-500" },
                  ].map(s => (
                    <div key={s.label} className="bg-sand rounded-xl p-3 text-center">
                      <div className={`font-body text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="font-body text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {iaAnalysis && (
                <Card padding="md" className="border-purple-200 bg-purple-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <span className="font-body text-sm font-semibold text-blue-800">Analyse IA</span>
                    <Badge color="blue">{iaStats?.tauxRapprochement}% rapproché</Badge>
                  </div>
                  <div className="font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">
                    {iaAnalysis}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Modal : Pointage manuel ─── */}
      {showManualMatch !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowManualMatch(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Pointer manuellement</h2>
                <p className="font-body text-xs text-slate-500">
                  Mouvement : {bankLines[showManualMatch]?.label} — {bankLines[showManualMatch]?.amount.toFixed(2)}€
                </p>
              </div>
              <button onClick={() => setShowManualMatch(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Filtrer par client, montant…" value={manualSearch} onChange={e => setManualSearch(e.target.value)}
                  className="w-full font-body text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="flex flex-col gap-1.5">
                {filteredPayments
                  .filter(p => {
                    if (!manualSearch) return true;
                    const q = manualSearch.toLowerCase();
                    return p.familyName?.toLowerCase().includes(q) ||
                      (p.totalTTC || 0).toFixed(2).includes(q) ||
                      (modeLabels[p.paymentMode] || "").toLowerCase().includes(q);
                  })
                  .slice(0, 50)
                  .map(p => {
                    const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                    const amountMatch = bankLines[showManualMatch] && Math.abs((p.totalTTC || 0) - bankLines[showManualMatch].amount) < 0.02;
                    return (
                      <div key={p.id}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:border-blue-300 ${amountMatch ? "border-green-300 bg-green-50/30" : "border-gray-100"}`}
                        onClick={async () => {
                          const updated = [...bankLines];
                          updated[showManualMatch!] = {
                            ...updated[showManualMatch!],
                            matched: true,
                            matchType: "Manuel",
                            matchDetail: `${p.familyName} — ${(p.totalTTC || 0).toFixed(2)}€ (${modeLabels[p.paymentMode] || p.paymentMode})`,
                            manualPaymentId: p.id,
                          };
                          await updateAndSaveBankLines(updated);

                          // Bug #8 : si le paiement pointé est un virement pending/partial,
                          // on le marque comme encaissé pour sortir de l'alerte "virements attendus"
                          if (p.paymentMode === "virement" && (p.status === "pending" || p.status === "partial")) {
                            try {
                              await updateDoc(doc(db, "payments", p.id), {
                                status: "paid",
                                paidAmount: p.totalTTC || 0,
                                paidAt: serverTimestamp(),
                                reconciledByBank: true,
                              });
                              fetchData();
                            } catch (e) {
                              console.error("Erreur mise à jour paiement:", e);
                            }
                          }
                          setShowManualMatch(null);
                        }}>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{p.familyName || "—"}</div>
                          <div className="font-body text-xs text-slate-500">
                            {d?.toLocaleDateString("fr-FR")} · {(p.items || []).map(i => i.activityTitle).join(", ") || "—"} · {modeLabels[p.paymentMode] || p.paymentMode}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-body text-sm font-bold ${amountMatch ? "text-green-600" : "text-blue-500"}`}>{(p.totalTTC || 0).toFixed(2)}€</div>
                          {amountMatch && <div className="font-body text-[10px] text-green-500">Montant exact</div>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal : Saisie détail remise CA (Option A) ─── */}
      {showCADetailModal !== null && (() => {
        const bl = bankLines[showCADetailModal];
        if (!bl) return null;

        // Parse les montants depuis le texte copié depuis le site CA.
        // Le site CA affiche chaque transaction avec : Date + Heure + Montant + N°Carte + N°Ticket.
        //
        // DIFFICULTÉ : les numéros de ticket ou de carte peuvent contenir des chiffres qui,
        // collés au montant (sans séparateur propre), causent des faux positifs.
        // Exemple : "13:59:09 175,00 EUR" où la regex gloutonne capture "09 175,00" = 9175 €.
        //
        // STRATÉGIE : on s'ancre TOUJOURS sur le pattern "HH:MM[:SS]" qui précède le montant.
        // C'est l'ancre la plus fiable car toutes les tx CB ont une heure d'horodatage.
        // Fallback : parsing ligne par ligne avec regex stricte (sans ancre heure) si aucune
        // tx détectée avec heure (ex: l'utilisateur a copié juste les montants).
        //
        // Limites : montants 0.01 € à 50 000 € ; exclusion des lignes "total"/"somme".
        // Essai de matching : on cherche parmi les CB terminal NON CONSOMMÉS ceux
        // dont le montant correspond aux montants parsés (dans une fenêtre ±3j)
        const tryMatch = (text: string) => {
          const amounts = parserDetailCa(text);
          if (amounts.length === 0) { setCaDetailPreview(null); return; }

          // Date bancaire (pour la fenêtre)
          const bankDateParsed = (() => {
            const p1 = bl.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (p1) return new Date(`${p1[3]}-${p1[2].padStart(2,"0")}-${p1[1].padStart(2,"0")}`);
            return null;
          })();

          // ───────────────────────────────────────────────────────────────────
          // Anti-fuite : construire un compteur des triplets (famille|montant|date)
          // déjà revendiqués par d'AUTRES bankLines matchées. On exclut ensuite
          // de cbPool les encs dont le triplet est déjà "consommé" autant de fois
          // qu'il apparaît ailleurs.
          //
          // Sans ça, valider Détail CA sur la bankLine du 24/04 puis sur celle
          // du 25/04 pouvait réinjecter les mêmes encs dans les 2 matchedEncs,
          // créant des références fantômes qui pourrissent le compteur
          // "Encaissements à remettre".
          // ───────────────────────────────────────────────────────────────────
          const triplet = (e: any) => {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
            return `${e.familyName || ""}|${(e.montant || 0).toFixed(2)}|${d}`;
          };
          const claimedTripletCount = new Map<string, number>();
          for (let blIdx = 0; blIdx < bankLines.length; blIdx++) {
            if (blIdx === showCADetailModal) continue; // on ignore la bankLine en cours
            const otherBl = bankLines[blIdx];
            if (!otherBl.matched) continue;
            if (otherBl.matchType === "Ignoré") continue;
            for (const enc of (otherBl.matchedEncs || [])) {
              const k = `${enc.familyName || ""}|${(enc.montant || 0).toFixed(2)}|${enc.date || ""}`;
              claimedTripletCount.set(k, (claimedTripletCount.get(k) || 0) + 1);
            }
          }

          // Encaissements CB terminal libres dans la fenêtre ±7j (large pour ne rien rater)
          // On accumule les "consommations" de triplets au fur et à mesure pour
          // exclure correctement les encs en surplus quand il y a des doublons légitimes.
          const tripletConsumed = new Map<string, number>();
          const cbPool = encaissementsCompta.filter(e => {
            if (e.mode !== "cb_terminal") return false;
            if (e.remiseId) return false; // déjà dans une remise
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) return false;
            if (bankDateParsed) {
              const diff = Math.abs(bankDateParsed.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
              if (diff > 7) return false;
            }
            // Filtre anti-fuite : ce triplet est-il revendiqué par une autre bankLine ?
            const k = triplet(e);
            const claimed = claimedTripletCount.get(k) || 0;
            const consumed = tripletConsumed.get(k) || 0;
            if (consumed < claimed) {
              tripletConsumed.set(k, consumed + 1);
              return false; // exclu : un autre rapprochement le revendique déjà
            }
            return true;
          });

          // Pour chaque montant, trouve le meilleur candidat (sans réutilisation)
          const used = new Set<string>();
          const found: any[] = [];
          const missing: number[] = [];
          for (const amount of amounts) {
            const candidate = cbPool.find(e => !used.has(e.id) && Math.abs((e.montant || 0) - amount) < 0.02);
            if (candidate) {
              used.add(candidate.id);
              found.push({ ...candidate, _amount: amount });
            } else {
              missing.push(amount);
            }
          }
          const total = amounts.reduce((s, a) => s + a, 0);
          setCaDetailPreview({ found, missing, total });
        };

        const blAmount = bl.amount;
        const parsed = caDetailText ? parserDetailCa(caDetailText) : [];
        const parsedTotal = parsed.reduce((s, a) => s + a, 0);
        const totalMatches = Math.abs(parsedTotal - blAmount) < 0.02;

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCADetailModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Détail remise Crédit Agricole</h2>
                  <p className="font-body text-xs text-slate-500">
                    Mouvement : {bl.label} — <strong>{bl.amount.toFixed(2)}€</strong>
                  </p>
                </div>
                <button onClick={() => setShowCADetailModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="font-body text-xs text-blue-800 leading-relaxed">
                    <strong>Mode d'emploi :</strong><br />
                    1. Connectez-vous au site Crédit Agricole → Comptes → Cliquer sur la remise CB<br />
                    2. Sélectionner tout le tableau des transactions (ou juste la colonne "Montant")<br />
                    3. Copier puis coller ci-dessous. Le système extrait automatiquement les montants en EUR.
                  </p>
                </div>

                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Coller le détail copié depuis le site CA :</label>
                <textarea
                  value={caDetailText}
                  onChange={e => { setCaDetailText(e.target.value); tryMatch(e.target.value); }}
                  placeholder="20/04/2026 17:02:34  95,00 EUR  497711******5900  ...&#10;20/04/2026 16:24:00  105,00 EUR  ..."
                  rows={6}
                  className="w-full font-mono text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-purple-400 resize-none"
                />

                {parsed.length > 0 && (
                  <div className="mt-3 bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between font-body text-xs">
                      <span className="text-slate-600">
                        <strong>{parsed.length}</strong> montant(s) extrait(s) — Total : <strong>{parsedTotal.toFixed(2)}€</strong>
                      </span>
                      <span className={totalMatches ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"}>
                        {totalMatches ? "✓ correspond au mouvement" : `⚠ écart de ${(parsedTotal - blAmount).toFixed(2)}€`}
                      </span>
                    </div>
                    {caDetailPreview && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="font-body text-xs font-semibold text-green-700 mb-1">✓ Trouvés ({caDetailPreview.found.length})</div>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {caDetailPreview.found.map((e, idx) => (
                              <div key={idx} className="bg-green-50 rounded px-2 py-1 font-body text-[11px]">
                                <strong>{(e.montant || 0).toFixed(2)}€</strong> — {e.familyName || "?"} ({e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?"})
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="font-body text-xs font-semibold text-orange-700 mb-1">⚠ Manquants ({caDetailPreview.missing.length})</div>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {caDetailPreview.missing.map((amount, idx) => (
                              <div key={idx} className="bg-orange-50 rounded px-2 py-1 font-body text-[11px]">
                                <strong>{amount.toFixed(2)}€</strong> — pas d'encaissement CB correspondant
                              </div>
                            ))}
                            {caDetailPreview.missing.length === 0 && (
                              <div className="font-body text-[11px] text-slate-400 italic">Tous les montants matchent !</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
                <button onClick={() => setShowCADetailModal(null)}
                  className="font-body text-sm text-slate-600 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!caDetailPreview || caDetailPreview.found.length === 0}
                  onClick={() => {
                    if (!caDetailPreview || caDetailPreview.found.length === 0) return;
                    const updated = [...bankLines];
                    const foundSum = caDetailPreview.found.reduce((s, e) => s + (e.montant || 0), 0);
                    updated[showCADetailModal!] = {
                      ...updated[showCADetailModal!],
                      matched: true,
                      matchType: "Manuel",
                      matchDetail: `Détail CA : ${caDetailPreview.found.length}/${parsed.length} transactions trouvées = ${foundSum.toFixed(2)}€${caDetailPreview.missing.length > 0 ? ` (${caDetailPreview.missing.length} manquant(s))` : ""}`,
                      matchedEncs: caDetailPreview.found.map((e: any) => ({
                        familyName: e.familyName || "",
                        montant: e.montant || 0,
                        date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
                        activityTitle: e.activityTitle || "",
                        mode: "CB Terminal",
                      })),
                      // Stocker les manquants pour les afficher au survol sur l'écran principal
                      missingAmounts: caDetailPreview.missing.length > 0 ? caDetailPreview.missing : undefined,
                    };
                    updateAndSaveBankLines(updated);
                    setShowCADetailModal(null);
                  }}
                  className="font-body text-sm text-white border-none rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
                  Valider le rapprochement
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Onglet Ignorées : lignes bancaires volontairement écartées ─── */}
      {/* L'utilisateur a cliqué "Ignorer" sur ces lignes (commission, frais,
          virement personnel...). Elles ne polluent plus l'onglet rapprochement
          principal mais restent consultables et restaurables ici. */}
      {!loading && tab === "rapprochement_ignores" && (
        <div className="flex flex-col gap-5">
          <Card padding="md" className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <EyeOff className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Lignes bancaires ignorées</h3>
                <p className="font-body text-sm text-slate-600">
                  Ces lignes ont été marquées comme volontairement écartées du rapprochement
                  (commissions, frais bancaires, virements personnels…). Elles restent stockées
                  pour traçabilité mais n'apparaissent plus dans l'onglet principal.
                </p>
                <p className="font-body text-xs text-slate-500 mt-2">
                  Cliquer sur <b>Restaurer</b> remet la ligne dans la liste des lignes à traiter.
                </p>
              </div>
            </div>
          </Card>

          {bankLines.filter(b => b.matchType === "Ignoré").length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="font-body text-sm text-slate-500 italic">
                Aucune ligne ignorée pour le moment.
              </p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="bg-blue-500/8 px-5 py-3 border-b border-blue-500/8 flex items-center font-body text-xs font-semibold text-blue-800 uppercase tracking-wide">
                    <span className="w-24">Date</span>
                    <span className="flex-1">Libellé bancaire</span>
                    <span className="w-24 text-right">Montant</span>
                    <span className="w-32 text-center">Action</span>
                  </div>
                  {bankLines
                    .map((bl, i) => ({ bl, i }))
                    .filter(({ bl }) => bl.matchType === "Ignoré")
                    .map(({ bl, i }) => (
                      <div key={i} className="px-5 py-3 border-b border-blue-500/8 flex items-center bg-slate-50/50">
                        <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                        <div className="flex-1">
                          <div className="font-body text-sm text-slate-700">{bl.label}</div>
                          {bl.matchDetail && (
                            <div className="font-body text-xs text-slate-500 mt-0.5">
                              ↳ {bl.matchDetail}
                            </div>
                          )}
                        </div>
                        <span className="w-24 text-right font-body text-sm font-semibold text-slate-600">
                          {bl.amount.toFixed(2)}€
                        </span>
                        <span className="w-32 text-center">
                          <button
                            onClick={() => {
                              const updated = [...bankLines];
                              updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "" };
                              updateAndSaveBankLines(updated);
                            }}
                            className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
                            Restaurer
                          </button>
                        </span>
                      </div>
                    ))}
                  <div className="px-5 py-3 bg-sand flex justify-between font-body text-sm">
                    <span className="font-semibold text-slate-600">
                      {nbIgnores} ligne{nbIgnores > 1 ? "s" : ""} ignorée{nbIgnores > 1 ? "s" : ""}
                    </span>
                    <span className="text-slate-500">
                      Total : {bankLines.filter(b => b.matchType === "Ignoré").reduce((s, b) => s + b.amount, 0).toFixed(2)}€
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── Export FEC ─── */}
      {!loading && tab === "fec" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Exporter le FEC</h3>
            <p className="font-body text-sm text-slate-600 mb-4">
              Génère le Fichier des Écritures Comptables au format réglementaire (Art. L47 A-I du LPF).
              Ce fichier contient toutes les écritures de la période sélectionnée, prêt à envoyer à votre comptable.
            </p>
            <div className="flex gap-4 mb-4">
              <div>
                <div className="font-body text-xs font-semibold text-slate-500">Période</div>
                <div className="font-body text-sm font-semibold text-blue-800">{new Date(period + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</div>
              </div>
              <div>
                <div className="font-body text-xs font-semibold text-slate-500">Écritures</div>
                <div className="font-body text-sm font-semibold text-blue-800">{filteredPayments.length} paiements → ~{filteredPayments.length * 3} lignes</div>
              </div>
              <div>
                <div className="font-body text-xs font-semibold text-slate-500">Format</div>
                <div className="font-body text-sm font-semibold text-blue-800">TXT (TAB)</div>
              </div>
            </div>
            <button onClick={generateFEC} disabled={filteredPayments.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all
                ${filteredPayments.length === 0 ? "bg-gray-200 text-slate-500" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
              <Download size={16} /> Télécharger le FEC — {period}
            </button>
          </Card>

          <Card padding="md" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-xs text-blue-800 leading-relaxed">
              <strong>Colonnes du FEC :</strong> JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum,
              CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit,
              EcritureLet, DateLet, ValidDate, Montantdevise, Idevise.
              <br /><br />
              <strong>Plan comptable utilisé :</strong> {accounts.length} comptes importés de Celeris.
              TVA principale à 5.50% pour l&apos;enseignement équestre.
            </div>
          </Card>
        </div>
      )}

      {/* ─── Export CSV paramétrable ─── */}
      {!loading && tab === "export" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Export CSV paramétrable</h3>
            <p className="font-body text-sm text-slate-600 mb-4">
              Exportez vos données comptables au format CSV, compatible avec tous les logiciels comptables
              (Celeris, Sage, Ciel, EBP, QuickBooks, etc.).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                { id: "ventes", label: "Journal des ventes", desc: "Toutes les ventes avec détail HT/TVA/TTC par article" },
                { id: "reglements", label: "Journal des règlements", desc: "Tous les encaissements par mode de paiement" },
                { id: "clients", label: "Balance clients", desc: "Solde de chaque client (facturé vs payé)" },
              ].map(exp => (
                <Card key={exp.id} padding="sm" className="flex flex-col">
                  <div className="font-body text-sm font-semibold text-blue-800 mb-1">{exp.label}</div>
                  <div className="font-body text-xs text-slate-500 mb-3 flex-1">{exp.desc}</div>
                  <button onClick={() => {
                    const csv = construireExportComptable(
                      exp.id as TypeExportComptable,
                      filteredPayments,
                      payments,
                    );
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = exp.id + "_" + period + ".csv"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                    className="flex items-center justify-center gap-2 py-2 rounded-lg font-body text-xs font-semibold text-blue-500 bg-blue-50 border-none cursor-pointer hover:bg-blue-100">
                    <Download size={14} /> Télécharger
                  </button>
                </Card>
              ))}
            </div>
            <Card padding="sm" className="bg-blue-50 border-blue-500/8">
              <div className="font-body text-xs text-blue-800">
                Format CSV avec séparateur point-virgule (;), encodage UTF-8 avec BOM.
                Compatible Excel, Libre Office, et import direct dans les logiciels comptables.
              </div>
            </Card>
          </Card>
        </div>
      )}

      {/* ── Assistant IA flottant ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
        {/* Panel assistant */}
        {showAssistant && (
          <div className="bg-white rounded-2xl shadow-2xl border border-purple-100 w-96 flex flex-col overflow-hidden"
            style={{ maxHeight: "70vh" }}>
            <div className="flex items-center justify-between px-4 py-3 text-white"
              style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                <span className="font-body text-sm font-semibold">Assistant comptable IA</span>
              </div>
              <button onClick={() => setShowAssistant(false)}
                className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-lg leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 200 }}>
              {/* Suggestions */}
              {!iaAnswer && (
                <div className="flex flex-col gap-2">
                  <p className="font-body text-xs text-slate-500 mb-1">Questions fréquentes :</p>
                  {[
                    "Quel est mon taux d'impayés ce mois ?",
                    "Quelles familles doivent le plus ?",
                    "Quel mode de paiement est le plus utilisé ?",
                    "Compare encaissé vs facturé",
                  ].map(q => (
                    <button key={q} onClick={() => { setIaQuestion(q); }}
                      className="text-left font-body text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Réponse IA */}
              {iaAnswerLoading && (
                <div className="flex items-center gap-2 text-purple-600 font-body text-sm">
                  <Loader2 size={14} className="animate-spin" /> Analyse en cours...
                </div>
              )}
              {iaAnswer && (
                <div className="bg-purple-50 rounded-xl p-3 font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">
                  {iaAnswer}
                </div>
              )}
              {iaAnswer && (
                <button onClick={() => { setIaAnswer(null); setIaQuestion(""); }}
                  className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500 text-left">
                  ← Nouvelle question
                </button>
              )}
            </div>

            {/* Input question */}
            <div className="border-t border-gray-100 p-3 flex gap-2">
              <input value={iaQuestion} onChange={e => setIaQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); poserQuestion(); } }}
                placeholder="Posez votre question..."
                className="flex-1 font-body text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
              <button onClick={poserQuestion} disabled={!iaQuestion.trim() || iaAnswerLoading}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white border-none cursor-pointer disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                <Bot size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Bouton flottant */}
        <button onClick={() => setShowAssistant(!showAssistant)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer hover:scale-105 transition-transform"
          style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}
          title="Assistant comptable IA">
          {showAssistant ? <span className="text-xl">✕</span> : <Sparkles size={22} />}
        </button>
      </div>

      {/* Panneaux de maintenance (?debug=…) — voir PanneauxDebug.tsx */}
      <PanneauxDebug debug={debugParam} period={period} remises={remises}
        encaissementsCompta={encaissementsCompta} loading={loading} />
    </div>
  );
}
