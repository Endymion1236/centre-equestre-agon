"use client";

/**
 * src/app/admin/comptabilite/page.tsx
 *
 * Écran Comptabilité : le poste de travail de Nicolas une fois par mois.
 *
 * Cette page ORCHESTRE, elle ne calcule presque rien elle-même :
 *  • elle charge les quatre collections dont tout le reste dépend
 *    (payments, encaissements, remises, remises-sepa) ;
 *  • elle tient l'état partagé entre onglets — période affichée, lignes
 *    bancaires, sélections en cours — pour qu'un aller-retour entre
 *    « Bordereaux » et « Rapprochement » ne fasse rien perdre ;
 *  • elle délègue l'affichage à un composant par onglet, et les calculs aux
 *    modules voisins (rapprochement.ts, csv-bancaire.ts, fec.ts, detail-ca.ts).
 *
 * Ce qui RESTE ici et doit y rester : `updateAndSaveBankLines`, le seul point
 * d'entrée par lequel une modification de pointage descend en base. Il appelle
 * dans l'ordre les trois synchronisations de sync-firestore.ts puis recharge
 * les données. Toute action de l'écran qui touche une ligne bancaire doit
 * passer par lui, sinon les trois vues du même argent — la banque, les
 * bordereaux, le livre de caisse — divergent silencieusement.
 */

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card } from "@/components/ui";
import { Loader2, Download, FileText, Building2, Receipt, Calculator, Printer, EyeOff } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { modeLabels, tabClasses } from "./constants";
import type { BankLine, CaDetailPreview, Payment, TabColor, TabId } from "./types";
import { verifierPeriodeCsv, parserLignesCsvBancaire } from "./csv-bancaire";
import { rapprocherLignesBancaires } from "./rapprochement";
import { genererFEC } from "./fec";
import { syncReconciledFromBankLines, saveBankLinesByMonth, syncVersementsEspeces } from "./sync-firestore";
import { OngletJournal } from "./OngletJournal";
import { OngletTva } from "./OngletTva";
import { OngletRemises } from "./OngletRemises";
import { OngletRapprochement } from "./OngletRapprochement";
import { OngletIgnorees } from "./OngletIgnorees";
import { OngletFec } from "./OngletFec";
import { OngletExportCsv } from "./OngletExportCsv";
import { ModalePointageManuel } from "./ModalePointageManuel";
import { ModaleDetailCa } from "./ModaleDetailCa";
import { AssistantIa } from "./AssistantIa";
import { PanelResetCompta } from "./PanelResetCompta";
import { PanelDiagRemises } from "./PanelDiagRemises";
import { PanelDepointerCb } from "./PanelDepointerCb";
import { PanelMigrationBankLines } from "./PanelMigrationBankLines";

export default function ComptabilitePage() {
  const searchParams = useSearchParams();
  const showResetPanel = searchParams?.get("debug") === "reset";
  const showDiagPanel = searchParams?.get("debug") === "diag";
  const showDepointerCbPanel = searchParams?.get("debug") === "reset-cb";
  const showMigrateBlsPanel = searchParams?.get("debug") === "migrate-banklines";

  const [tab, setTab] = useState<TabId>("journal");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [remises, setRemises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtres remise
  const [remiseDateFrom, setRemiseDateFrom] = useState("");
  const [remiseDateTo, setRemiseDateTo] = useState("");
  const [remiseModeFilter, setRemiseModeFilter] = useState("");
  // Filtres de la liste "Encaissements à remettre"
  const [aRemettreDateFrom, setARemettreDateFrom] = useState("");
  const [aRemettreDateTo, setARemettreDateTo] = useState("");
  // Édition remise (ajouter/retirer paiements)
  const [editingRemiseId, setEditingRemiseId] = useState<string | null>(null);
  const [editingRemiseSearch, setEditingRemiseSearch] = useState("");
  // Pointage manuel remise
  const [pointageRemiseId, setPointageRemiseId] = useState<string | null>(null);
  const [pointageNote, setPointageNote] = useState("");
  const [pointageDate, setPointageDate] = useState(""); // date de pointage bancaire choisie par l'utilisateur
  const [pointageMontantReel, setPointageMontantReel] = useState(""); // montant réellement encaissé (espèces avec écart)
  const [openRemiseId, setOpenRemiseId] = useState<string | null>(null);

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
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  // Pointage manuel
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null); // index de la bankLine
  const [expandedBankLine, setExpandedBankLine] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState("");

  // Option A : modale pour coller le détail d'une remise depuis le site Crédit Agricole
  const [showCADetailModal, setShowCADetailModal] = useState<number | null>(null);
  const [caDetailText, setCaDetailText] = useState("");
  const [caDetailPreview, setCaDetailPreview] = useState<CaDetailPreview | null>(null);

  // Sélection manuelle pour bordereau de remise : IDs des encaissements cochés
  const [selectedForRemise, setSelectedForRemise] = useState<Set<string>>(new Set());
  // Filtre d'affichage par mode dans la liste à remettre ("" = tous)
  const [remiseModeView, setRemiseModeView] = useState<string>("");

  // Sauvegarder les bankLines dans Firestore après modification manuelle
  const updateAndSaveBankLines = async (updated: BankLine[]) => {
    setBankLines(updated);
    try {
      // Sauvegarder en groupant par mois (chaque bankLine va dans le doc
      // rapprochements/{YYYY-MM} correspondant à sa propre date, pas la
      // période active. Cf. saveBankLinesByMonth pour le détail.)
      await saveBankLinesByMonth(updated);
      // Synchroniser reconciledByBank sur encs/payments/remises
      await syncReconciledFromBankLines({
        lines: updated, encaissementsCompta, payments, remises, period,
      });
      // Synchroniser les versements bancaires du livre de caisse
      await syncVersementsEspeces(updated);
      // Rafraîchir les données pour que l'UI reflète les changements
      fetchData();
    } catch (e) { console.error("Erreur sauvegarde rapprochement:", e); }
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

  // Filter by period
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Seules les factures (paid) apparaissent dans le journal — les proformas (pending/draft) sont exclues
      if ((p as any).status === "cancelled" || (p as any).status === "pending" || (p as any).status === "draft") return false;
      const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
      if (!d) return false;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return pm === period;
    });
  }, [payments, period]);

  const totalHT = filteredPayments.reduce((s, p) => s + (p.items || []).reduce((ss, i) => ss + (i.priceHT || 0), 0), 0);
  const totalTVA = filteredPayments.reduce((s, p) => {
    return s + (p.items || []).reduce((ss, i) => ss + (i.priceTTC || 0) - (i.priceHT || 0), 0);
  }, 0);
  const totalTTC = filteredPayments.reduce((s, p) => s + (p.totalTTC || 0), 0);

  // TVA by rate
  const tvaByRate = useMemo(() => {
    const map: Record<number, { ht: number; tva: number; ttc: number }> = {};
    filteredPayments.forEach((p) => {
      (p.items || []).forEach((i) => {
        const rate = i.tva || 5.5;
        if (!map[rate]) map[rate] = { ht: 0, tva: 0, ttc: 0 };
        map[rate].ht += i.priceHT || 0;
        map[rate].tva += (i.priceTTC || 0) - (i.priceHT || 0);
        map[rate].ttc += i.priceTTC || 0;
      });
    });
    return Object.entries(map).sort(([a], [b]) => parseFloat(a) - parseFloat(b));
  }, [filteredPayments]);

  // By payment mode
  const byMode = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPayments.forEach((p) => {
      map[p.paymentMode] = (map[p.paymentMode] || 0) + (p.totalTTC || 0);
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filteredPayments]);

  // Daily totals by payment mode
  // Totaux journaliers depuis les VRAIS encaissements (pas les factures)
  const dailyTotals = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const periodEnc = encaissementsCompta.filter(e => {
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) return false;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return pm === period;
    });
    periodEnc.forEach((e) => {
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) return;
      const dateStr = d.toLocaleDateString("fr-FR");
      if (!map[dateStr]) map[dateStr] = {};
      map[dateStr][e.mode || "autre"] = (map[dateStr][e.mode || "autre"] || 0) + (e.montant || 0);
    });
    return map;
  }, [encaissementsCompta, period]);

  // ── Import du relevé bancaire ───────────────────────────────────────────
  // Le fichier est lu en Latin1 (encodage du Crédit Agricole), vérifié,
  // parsé (csv-bancaire.ts) puis rapproché (rapprochement.ts). Tout ce qui
  // suit le rapprochement est de la SYNCHRONISATION Firestore : c'est là que
  // le résultat du calcul devient un état durable, et c'est pour ça que ça
  // reste dans la page.
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;

      // Garde-fou de période : si l'admin annule, on remet l'input file à zéro
      // pour qu'un nouveau choix du MÊME fichier redéclenche bien un onChange.
      if (!verifierPeriodeCsv(raw)) {
        e.target.value = "";
        return;
      }

      const parsed = parserLignesCsvBancaire(raw);

      // Rapprochement. On récupère les ensembles consommés : ils sont
      // indispensables aux synchronisations ci-dessous, qui doivent savoir
      // exactement quels encaissements et quels bordereaux ont servi.
      const { matched, usedEncIds, usedRemiseIds } = rapprocherLignesBancaires({
        parsed, period, encaissementsCompta, payments, remises, remisesSepa,
      });

      // ─────────────────────────────────────────────────────────────────────
      //  Bug #2 : Fusion avec les matchs manuels existants
      // ─────────────────────────────────────────────────────────────────────
      // Si une ligne identique (même date + libellé + montant) existait déjà
      // dans le rapprochement avec un pointage MANUEL ou IGNORÉ, on conserve
      // ce pointage pour ne pas le perdre au re-import.
      const previousBankLines = bankLines;
      const lineKey = (l: any) => `${l.date}|${l.label}|${l.amount.toFixed(2)}`;
      const previousManualByKey = new Map<string, any>();
      for (const prev of previousBankLines) {
        if (prev.matchType === "Manuel" || prev.matchType === "Ignoré") {
          previousManualByKey.set(lineKey(prev), prev);
        }
      }

      const finalMatched = matched.map((bl: any) => {
        const prev = previousManualByKey.get(lineKey(bl));
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
        finalMatched.some((m: any) => lineKey(m) === lineKey(p))
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

  // Génération du FEC : cf. fec.ts. Le wrapper existe pour que l'onglet et le
  // bouton « Export complet du mois » appellent la même chose sans avoir à
  // connaître la période ni la liste filtrée.
  const generateFEC = () => genererFEC(filteredPayments, period);

  const nbIgnores = bankLines.filter(b => b.matched && b.matchType === "Ignoré").length;

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
        <OngletJournal
          filteredPayments={filteredPayments}
          encaissementsCompta={encaissementsCompta}
          period={period}
          totalHT={totalHT}
          totalTVA={totalTVA}
          totalTTC={totalTTC}
        />
      )}

      {/* ─── TVA ─── */}
      {!loading && tab === "tva" && (
        <OngletTva
          tvaByRate={tvaByRate}
          byMode={byMode}
          totalHT={totalHT}
          totalTVA={totalTVA}
          totalTTC={totalTTC}
        />
      )}

      {/* ─── Bordereaux de remise ─── */}
      {!loading && tab === "remise" && (
        <OngletRemises
          remises={remises}
          encaissementsCompta={encaissementsCompta}
          payments={payments}
          fetchData={fetchData}
          remiseDateFrom={remiseDateFrom} setRemiseDateFrom={setRemiseDateFrom}
          remiseDateTo={remiseDateTo} setRemiseDateTo={setRemiseDateTo}
          remiseModeFilter={remiseModeFilter} setRemiseModeFilter={setRemiseModeFilter}
          aRemettreDateFrom={aRemettreDateFrom} setARemettreDateFrom={setARemettreDateFrom}
          aRemettreDateTo={aRemettreDateTo} setARemettreDateTo={setARemettreDateTo}
          remiseModeView={remiseModeView} setRemiseModeView={setRemiseModeView}
          selectedForRemise={selectedForRemise} setSelectedForRemise={setSelectedForRemise}
          editingRemiseId={editingRemiseId} setEditingRemiseId={setEditingRemiseId}
          editingRemiseSearch={editingRemiseSearch} setEditingRemiseSearch={setEditingRemiseSearch}
          openRemiseId={openRemiseId} setOpenRemiseId={setOpenRemiseId}
          pointageRemiseId={pointageRemiseId} setPointageRemiseId={setPointageRemiseId}
          pointageNote={pointageNote} setPointageNote={setPointageNote}
          pointageDate={pointageDate} setPointageDate={setPointageDate}
          pointageMontantReel={pointageMontantReel} setPointageMontantReel={setPointageMontantReel}
        />
      )}

      {/* ─── Rapprochement bancaire ─── */}
      {!loading && tab === "rapprochement" && (
        <OngletRapprochement
          payments={payments}
          bankLines={bankLines}
          setBankLines={setBankLines}
          encaissementsCompta={encaissementsCompta}
          remises={remises}
          fetchData={fetchData}
          handleCSVImport={handleCSVImport}
          updateAndSaveBankLines={updateAndSaveBankLines}
          expandedBankLine={expandedBankLine} setExpandedBankLine={setExpandedBankLine}
          setShowManualMatch={setShowManualMatch}
          setManualSearch={setManualSearch}
          setShowCADetailModal={setShowCADetailModal}
          setCaDetailText={setCaDetailText}
          setCaDetailPreview={setCaDetailPreview}
          nbIgnores={nbIgnores}
          analyserRapprochement={analyserRapprochement}
          iaLoading={iaLoading}
          iaStats={iaStats}
          iaAnalysis={iaAnalysis}
        />
      )}

      {/* ─── Modal : Pointage manuel ─── */}
      {showManualMatch !== null && (
        <ModalePointageManuel
          index={showManualMatch}
          bankLines={bankLines}
          manualSearch={manualSearch}
          setManualSearch={setManualSearch}
          setShowManualMatch={setShowManualMatch}
          filteredPayments={filteredPayments}
          updateAndSaveBankLines={updateAndSaveBankLines}
          fetchData={fetchData}
        />
      )}

      {/* ─── Modal : Saisie détail remise CA (Option A) ─── */}
      {showCADetailModal !== null && (
        <ModaleDetailCa
          index={showCADetailModal}
          bankLines={bankLines}
          encaissementsCompta={encaissementsCompta}
          caDetailText={caDetailText}
          setCaDetailText={setCaDetailText}
          caDetailPreview={caDetailPreview}
          setCaDetailPreview={setCaDetailPreview}
          setShowCADetailModal={setShowCADetailModal}
          updateAndSaveBankLines={updateAndSaveBankLines}
        />
      )}

      {/* ─── Onglet Ignorées : lignes bancaires volontairement écartées ─── */}
      {!loading && tab === "rapprochement_ignores" && (
        <OngletIgnorees
          bankLines={bankLines}
          nbIgnores={nbIgnores}
          updateAndSaveBankLines={updateAndSaveBankLines}
        />
      )}

      {/* ─── Export FEC ─── */}
      {!loading && tab === "fec" && (
        <OngletFec
          period={period}
          filteredPayments={filteredPayments}
          generateFEC={generateFEC}
        />
      )}

      {/* ─── Export CSV paramétrable ─── */}
      {!loading && tab === "export" && (
        <OngletExportCsv
          filteredPayments={filteredPayments}
          payments={payments}
          period={period}
        />
      )}

      {/* ── Assistant IA flottant ─────────────────────────────────────────── */}
      <AssistantIa
        showAssistant={showAssistant} setShowAssistant={setShowAssistant}
        iaQuestion={iaQuestion} setIaQuestion={setIaQuestion}
        iaAnswer={iaAnswer} setIaAnswer={setIaAnswer}
        iaAnswerLoading={iaAnswerLoading}
        poserQuestion={poserQuestion}
      />

      {/* ═══ PANELS DEBUG ═══
          Chacun s'ouvre via un paramètre d'URL et porte son propre état :
          ?debug=reset (remise à zéro), ?debug=diag (diagnostic remises),
          ?debug=reset-cb (dépointage CB), ?debug=migrate-banklines. */}
      {showResetPanel && <PanelResetCompta />}

      {showDiagPanel && (
        <PanelDiagRemises
          remises={remises}
          encaissementsCompta={encaissementsCompta}
          loading={loading}
        />
      )}

      {showDepointerCbPanel && <PanelDepointerCb period={period} />}

      {showMigrateBlsPanel && <PanelMigrationBankLines />}
    </div>
  );
}
