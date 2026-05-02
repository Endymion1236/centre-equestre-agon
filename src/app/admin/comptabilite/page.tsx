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
import { parseCreditAgricoleCsv } from "@/lib/rapprochement/parser-ca";
import { matchMontantExact } from "@/lib/rapprochement/matchers/montant-exact";
import { matchCbOnline } from "@/lib/rapprochement/matchers/cb-online";
import { matchEspeces } from "@/lib/rapprochement/matchers/especes";
import { matchCbTerminal } from "@/lib/rapprochement/matchers/cb-terminal";
import { matchVirement } from "@/lib/rapprochement/matchers/virement";

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

const accounts = [
  { code: "70641000", label: "Animations collectivité", tva: 5.5 },
  { code: "70611110", label: "Cotisations / Adhésions", tva: 5.5 },
  { code: "70611600", label: "Découverte / Familiarisation", tva: 5.5 },
  { code: "70605000", label: "Divers", tva: 20 },
  { code: "70619900", label: "Droits d'accès installations", tva: 5.5 },
  { code: "70611300", label: "Enseignement / Cartes", tva: 5.5 },
  { code: "70611700", label: "Enseignement / Coaching", tva: 5.5 },
  { code: "70611000", label: "Enseignement / Forfaits", tva: 5.5 },
  { code: "4386", label: "Formation professionnelle", tva: 0 },
  { code: "70613110", label: "Location poneys", tva: 20 },
  { code: "70630110", label: "Pensions équidé", tva: 5.5 },
  { code: "70611500", label: "Randonnées / Promenades", tva: 5.5 },
  { code: "70100000", label: "Refacturation FFE", tva: 0 },
  { code: "70880000", label: "Refacturation soin", tva: 20 },
  { code: "70611400", label: "Stages équitation", tva: 5.5 },
  { code: "70622011", label: "Transport", tva: 20 },
  { code: "70410000", label: "Ventes équidés", tva: 20 },
];

const modeLabels: Record<string, string> = {
  cb_terminal: "CB Terminal", cb_online: "CB en ligne", cheque: "Chèque", especes: "Espèces",
  cheque_vacances: "Chèques Vacances", pass_sport: "Pass'Sport", ancv: "ANCV",
  virement: "Virement", avoir: "Avoir", prelevement_sepa: "Prélèvement SEPA",
};

export default function ComptabilitePage() {
  const searchParams = useSearchParams();
  const showResetPanel = searchParams?.get("debug") === "reset";
  const showDiagPanel = searchParams?.get("debug") === "diag";
  const showDepointerCbPanel = searchParams?.get("debug") === "reset-cb";
  const showMigrateBlsPanel = searchParams?.get("debug") === "migrate-banklines";

  // ── Reset compta : debug panel accessible via ?debug=reset dans l'URL ──
  const [resetSecret, setResetSecret] = useState("");
  const [resetDryRun, setResetDryRun] = useState<any>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetApplied, setResetApplied] = useState<any>(null);

  // ── Diag remises : debug panel accessible via ?debug=diag dans l'URL ──
  const [diagReport, setDiagReport] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // ── Recherche d'un paiement par nom (sous-section du panel diag) ──
  const [diagSearch, setDiagSearch] = useState("");
  const [diagSearching, setDiagSearching] = useState(false);
  const [diagSearchResult, setDiagSearchResult] = useState<any>(null);
  const runDiagSearch = async () => {
    if (!diagSearch.trim()) return;
    setDiagSearching(true);
    setDiagSearchResult(null);
    try {
      const res = await authFetch(`/api/admin/diag-paiement?q=${encodeURIComponent(diagSearch.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setDiagSearchResult({ error: data?.error || `Erreur HTTP ${res.status}` });
      } else {
        setDiagSearchResult(data);
      }
    } catch (e: any) {
      setDiagSearchResult({ error: e?.message || "Erreur réseau" });
    }
    setDiagSearching(false);
  };

  // ── Dépointer CB en masse (?debug=reset-cb) ──
  const [depointerCbDryRun, setDepointerCbDryRun] = useState<any>(null);
  const [depointerCbApplied, setDepointerCbApplied] = useState<any>(null);
  const [depointerCbLoading, setDepointerCbLoading] = useState(false);

  const fetchDepointerCbDryRun = async () => {
    setDepointerCbLoading(true);
    setDepointerCbDryRun(null);
    setDepointerCbApplied(null);
    try {
      const res = await authFetch(`/api/admin/depointer-cb?period=${encodeURIComponent(period)}`);
      const data = await res.json();
      setDepointerCbDryRun(data);
    } catch (e: any) {
      setDepointerCbDryRun({ error: e?.message || "Erreur réseau" });
    }
    setDepointerCbLoading(false);
  };

  const applyDepointerCb = async () => {
    if (!depointerCbDryRun?.confirmToken) return;
    if (!confirm(`Confirmer le dépointage de ${depointerCbDryRun.aDepointer} encaissements CB sur ${period} ?\n\nIls réapparaîtront dans "Encaissements à remettre". Tu pourras les re-rapprocher via Détail CA sur les remises CARTE.\n\nCette action peut être refaite (idempotente).`)) return;
    setDepointerCbLoading(true);
    try {
      const res = await authFetch(`/api/admin/depointer-cb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, confirm: depointerCbDryRun.confirmToken }),
      });
      const data = await res.json();
      setDepointerCbApplied(data);
      // Reload de la page pour rafraîchir les données affichées
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setDepointerCbApplied({ error: e?.message || "Erreur réseau" });
    }
    setDepointerCbLoading(false);
  };

  // Auto-fetch dry-run quand on ouvre le panel : déclenché via callback ref
  // sur la modale (déclaration period plus bas). On utilise un ref-callback
  // qui se déclenche quand l'élément se monte.
  const depointerPanelInitRef = (el: HTMLDivElement | null) => {
    if (el && showDepointerCbPanel && !depointerCbDryRun && !depointerCbLoading) {
      fetchDepointerCbDryRun();
    }
  };

  // ── Migration bankLines par mois (?debug=migrate-banklines) ──
  // Redistribue toutes les bankLines dans le bon doc rapprochements/{ym}
  // selon leur date réelle. Utile une fois après le fix de l'étape 1
  // pour rattraper les données déjà mal rangées.
  const [migrateBlsDryRun, setMigrateBlsDryRun] = useState<any>(null);
  const [migrateBlsApplied, setMigrateBlsApplied] = useState<any>(null);
  const [migrateBlsLoading, setMigrateBlsLoading] = useState(false);
  const fetchMigrateBlsDryRun = async () => {
    setMigrateBlsLoading(true);
    setMigrateBlsDryRun(null);
    setMigrateBlsApplied(null);
    try {
      const res = await authFetch(`/api/admin/migrate-bankLines`);
      const data = await res.json();
      setMigrateBlsDryRun(data);
    } catch (e: any) {
      setMigrateBlsDryRun({ error: e?.message || "Erreur réseau" });
    }
    setMigrateBlsLoading(false);
  };
  const applyMigrateBls = async () => {
    if (!migrateBlsDryRun?.confirmToken) return;
    if (!confirm(`Confirmer la migration de ${migrateBlsDryRun.stats?.nbBlsMalRangees || 0} bankLines vers leur bon mois ?\n\nIdempotente : peut être relancée sans danger.\nUn marqueur 'migratedAt' sera posé sur chaque doc.`)) return;
    setMigrateBlsLoading(true);
    try {
      const res = await authFetch(`/api/admin/migrate-bankLines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: migrateBlsDryRun.confirmToken }),
      });
      const data = await res.json();
      setMigrateBlsApplied(data);
      setTimeout(() => window.location.reload(), 2500);
    } catch (e: any) {
      setMigrateBlsApplied({ error: e?.message || "Erreur réseau" });
    }
    setMigrateBlsLoading(false);
  };
  const migrateBlsPanelInitRef = (el: HTMLDivElement | null) => {
    if (el && showMigrateBlsPanel && !migrateBlsDryRun && !migrateBlsLoading) {
      fetchMigrateBlsDryRun();
    }
  };

  const [tab, setTab] = useState<"journal" | "tva" | "rapprochement" | "rapprochement_ignores" | "remise" | "fec" | "export">("journal");
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
  const [bankLines, setBankLines] = useState<{ date: string; label: string; amount: number; matched: boolean; matchType: string; matchDetail: string; matchedEncs?: { familyName: string; montant: number; date: string; activityTitle: string; mode: string }[]; manualPaymentId?: string; uncertain?: boolean }[]>([]);
  // Pointage manuel
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null); // index de la bankLine
  const [expandedBankLine, setExpandedBankLine] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState("");

  // Option A : modale pour coller le détail d'une remise depuis le site Crédit Agricole
  const [showCADetailModal, setShowCADetailModal] = useState<number | null>(null);
  const [caDetailText, setCaDetailText] = useState("");
  const [caDetailPreview, setCaDetailPreview] = useState<{ found: any[]; missing: number[]; total: number } | null>(null);

  // Sélection manuelle pour bordereau de remise : IDs des encaissements cochés
  const [selectedForRemise, setSelectedForRemise] = useState<Set<string>>(new Set());
  // Filtre d'affichage par mode dans la liste à remettre ("" = tous)
  const [remiseModeView, setRemiseModeView] = useState<string>("");

  // ─────────────────────────────────────────────────────────────────────────
  //  Diagnostic remises (panel ?debug=diag)
  //  Calcule un rapport read-only à partir des données déjà chargées dans
  //  l'UI (remises, encaissementsCompta, payments). Pas de requête supplémentaire.
  // ─────────────────────────────────────────────────────────────────────────
  const buildDiagReport = () => {
    const total = (remises || []).length;
    const parMois: Record<string, { count: number; totalEur: number; pointees: number }> = {};
    const parEtat = { pointees: 0, nonPointees: 0 };
    const parMode: Record<string, number> = {};
    const recentes: any[] = [];

    for (const r of (remises || [])) {
      const date = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      const moisCle = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : "???";
      if (!parMois[moisCle]) parMois[moisCle] = { count: 0, totalEur: 0, pointees: 0 };
      parMois[moisCle].count += 1;
      parMois[moisCle].totalEur += r.total || 0;
      if (r.pointee) parMois[moisCle].pointees += 1;

      if (r.pointee) parEtat.pointees += 1;
      else parEtat.nonPointees += 1;

      const mode = r.paymentMode || r.mode || "?";
      parMode[mode] = (parMode[mode] || 0) + 1;
    }

    const sorted = [...(remises || [])]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 15);

    for (const r of sorted) {
      const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      recentes.push({
        id: r.id,
        date: d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "???",
        mode: r.paymentMode || r.mode || "?",
        total: r.total || 0,
        pointee: !!r.pointee,
        pointeeNote: r.pointeeNote || null,
        nbEncaissements: (r.encaissementIds || []).length,
        nbPaymentsLegacy: (r.paymentIds || []).length,
      });
    }

    // Stats sur les encaissements pour comprendre l'écart
    const totalEnc = (encaissementsCompta || []).length;
    const reconciledEnc = (encaissementsCompta || []).filter((e: any) => e.reconciledByBank).length;
    const cbEnc = (encaissementsCompta || []).filter((e: any) => e.mode === "cb_terminal").length;

    return {
      total,
      parMois,
      parEtat,
      parMode,
      recentes,
      encaissements: { total: totalEnc, reconciled: reconciledEnc, cbTerminal: cbEnc },
    };
  };

  useEffect(() => {
    if (showDiagPanel && !diagLoading && !diagReport && (remises?.length !== undefined)) {
      // Attendre que les données soient chargées
      if (loading) return;
      setDiagLoading(true);
      try {
        const report = buildDiagReport();
        setDiagReport(report);
      } catch (e) {
        console.error("Erreur diag:", e);
      }
      setDiagLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiagPanel, loading, remises]);

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
  const saveBankLinesByMonth = async (lines: typeof bankLines) => {
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
        for (const nb of blGroup) merged.set(keyOf(nb), {
          date: nb.date, label: nb.label, amount: nb.amount,
          matched: nb.matched, matchType: nb.matchType, matchDetail: nb.matchDetail,
          matchedEncs: nb.matchedEncs || null,
          manualPaymentId: nb.manualPaymentId || null,
          uncertain: nb.uncertain || false,
        });
        const allBls = Array.from(merged.values());

        await setDoc(doc(db, "rapprochements", ym), {
          period: ym,
          bankLines: allBls,
          totalLines: allBls.length,
          totalMatched: allBls.filter((b: any) => b.matched).length,
          totalAmount: Math.round(allBls.reduce((s: number, b: any) => s + (b.amount || 0), 0) * 100) / 100,
          updatedAt: serverTimestamp(),
        });
        console.log(`[saveBankLinesByMonth] ✅ ${ym} : ${allBls.length} bankLines (${blGroup.length} de cette session)`);
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

  // CSV import handler — smart matching
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      
      const parsed = parseCreditAgricoleCsv(raw);

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
      // findSubsetSum : cherche une combinaison d'encaissements dont la somme
      // (en centimes) = targetCents (±2 centimes). Utilisé pour les remises CB
      // terminal : la banque peut faire plusieurs remises dans la même journée,
      // ou une transaction a pu être refusée. Exemple : 18 CB saisis = 2802€,
      // la banque remet 2766€ (une tx refusée) → on trouve la combinaison de
      // 17 CB qui fait 2766€.
      //
      // Algorithme : programmation dynamique sur les sommes atteignables.
      // Complexité O(n × S) où S = targetCents. Limite : 25 transactions max
      // et map plafonnée à 100k entries pour éviter OOM sur gros volumes.
      // ─────────────────────────────────────────────────────────────────────
      const findSubsetSum = (encs: any[], targetCents: number): any[] | null => {
        if (encs.length === 0 || encs.length > 25) return null;
        const centsValues = encs.map(e => Math.round((e.montant || 0) * 100));
        const totalCents = centsValues.reduce((s, c) => s + c, 0);
        if (targetCents > totalCents + 2) return null;
        if (targetCents <= 0) return null;
        // Match direct avec le total ?
        if (Math.abs(totalCents - targetCents) <= 2) return [...encs];

        let dp = new Map<number, number[]>();
        dp.set(0, []);
        for (let i = 0; i < centsValues.length; i++) {
          const current = centsValues[i];
          const nextDp = new Map(dp);
          for (const [sum, indices] of dp.entries()) {
            const newSum = sum + current;
            if (newSum > targetCents + 2) continue;
            if (!nextDp.has(newSum)) {
              const newIndices = [...indices, i];
              nextDp.set(newSum, newIndices);
              if (Math.abs(newSum - targetCents) <= 2) {
                return newIndices.map(idx => encs[idx]);
              }
            }
          }
          dp = nextDp;
          if (dp.size > 100000) return null;
        }
        return null;
      };

      // Parse la date de la ligne bancaire (formats : DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY)
      const parseBankDate = (s: string): Date | null => {
        if (!s) return null;
        const p1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (p1) {
          const dd = p1[1].padStart(2, "0"), mm = p1[2].padStart(2, "0");
          return new Date(`${p1[3]}-${mm}-${dd}`);
        }
        const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (p2) return new Date(s);
        const p3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (p3) {
          const dd = p3[1].padStart(2, "0"), mm = p3[2].padStart(2, "0");
          return new Date(`${p3[3]}-${mm}-${dd}`);
        }
        return null;
      };

      // Helper pour convertir un encaissement en détail affichable
      const encToDetail = (e: any) => ({
        familyName: e.familyName || "",
        montant: e.montant || 0,
        date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
        activityTitle: e.activityTitle || "",
        mode: e.modeLabel || e.mode || "",
      });

      const matched = parsed.map((bl) => {
        const label = bl.label.toUpperCase();
        const bankDate = parseBankDate(bl.date);

        // Calcul de la période précédente pour élargir le pool
        // (les chèques / CB terminal peuvent être datés du mois d'avant)
        const prevPeriod = (() => {
          const [y, m] = period.split("-").map(Number);
          const pm = m === 1 ? 12 : m - 1;
          const py = m === 1 ? y - 1 : y;
          return `${py}-${String(pm).padStart(2, "0")}`;
        })();

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
        const inWindow = (enc: any) => {
          if (!bankDate) return true; // pas de date → on essaie quand même
          const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
          if (!d) return false;
          const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
          return diff <= 3;
        };

        // ── 1. CB en ligne (CAWL) payout ─────────────────────────────────
        const cbOnlineResult = matchCbOnline(bl, {
          encs: encaissementsCompta,
          remises,
          remisesSepa,
          payments,
          period,
          usedEncIds,
          usedRemiseIds,
          usedRemiseSepaIds,
          usedPaymentIds,
        });
        if (cbOnlineResult) {
          return { ...bl, matched: true, ...cbOnlineResult };
        }

        // ── 2. CB terminal — matching agrégat par jour ───────────────────
        const cbTerminalResult = matchCbTerminal(bl, {
          encs: encaissementsCompta,
          remises,
          remisesSepa,
          payments,
          period,
          usedEncIds,
          usedRemiseIds,
          usedRemiseSepaIds,
          usedPaymentIds,
        });
        if (cbTerminalResult) {
          return { ...bl, matched: true, ...cbTerminalResult };
        }

        // ── 3. Virement / SEPA / Prélèvement ──────────────────────────────
        const virementResult = matchVirement(bl, {
          encs: encaissementsCompta,
          remises,
          remisesSepa,
          payments,
          period,
          usedEncIds,
          usedRemiseIds,
          usedRemiseSepaIds,
          usedPaymentIds,
        });
        if (virementResult) {
          return { ...bl, matched: true, ...virementResult };
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
              matchedEncs: remiseEncs.map(encToDetail),
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
            return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName}`, matchedEncs: [encToDetail(match)] };
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
                matchedEncs: dayData.encs.map(encToDetail),
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
            const subset = findSubsetSum(freeEncs, chqTargetCents);
            if (subset && subset.length > 0) {
              const subsetSum = subset.reduce((s, e) => s + (e.montant || 0), 0);
              subset.forEach(e => usedEncIds.add(e.id));
              const dayLabel = dayKey.split("-").reverse().join("/");
              return {
                ...bl, matched: true, matchType: "Chèques",
                matchDetail: `Sous-ensemble ${subset.length}/${dayData.encs.length} chèque(s) du ${dayLabel} = ${subsetSum.toFixed(2)}€`,
                matchedEncs: subset.map(encToDetail),
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
                  matchedEncs: allEncs.map(encToDetail),
                };
              }
            }
          }

          // d) Total de TOUS les chèques du mois (rare mais possible)
          const totalMois = Math.round(allChqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
          if (totalMois > 0 && Math.abs(totalMois - bl.amount) < 0.02) {
            allChqEncs.forEach(e => usedEncIds.add(e.id));
            return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${allChqEncs.length} chèque(s) du mois = ${totalMois.toFixed(2)}€`, matchedEncs: allChqEncs.map(encToDetail) };
          }
        }

        // ── 5. Espèces ────────────────────────────────────────────────────
        const especesResult = matchEspeces(bl, {
          encs: encaissementsCompta,
          remises,
          remisesSepa,
          payments,
          period,
          usedEncIds,
          usedRemiseIds,
          usedRemiseSepaIds,
          usedPaymentIds,
        });
        if (especesResult) {
          return { ...bl, matched: true, ...especesResult };
        }

        // ── 6. Montant exact toutes modes ─────────────────────────────────
        const montantExactResult = matchMontantExact(bl, {
          encs: encaissementsCompta,
          remises,
          remisesSepa,
          payments,
          period,
          usedEncIds,
          usedRemiseIds,
          usedRemiseSepaIds,
          usedPaymentIds,
        });
        if (montantExactResult) {
          return { ...bl, matched: true, ...montantExactResult };
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
        await saveBankLinesByMonth(finalMatched as any);
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
    const header = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
    const rows: string[] = [];
    let ecritureNum = 1;

    filteredPayments.forEach((p, idx) => {
      const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const pieceRef = `F${d.getFullYear()}-${String(idx + 1).padStart(3, "0")}`;

      // Ligne produit
      (p.items || []).forEach((item) => {
        rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t70611400\tStages équitation\t\t\t${pieceRef}\t${dateStr}\t${item.activityTitle}\t\t${(item.priceHT || 0).toFixed(2)}\t\t\t${dateStr}\t\t`);
        ecritureNum++;
        // TVA
        const tvaAmount = (item.priceTTC || 0) - (item.priceHT || 0);
        if (tvaAmount > 0) {
          rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t44571\tTVA collectée\t\t\t${pieceRef}\t${dateStr}\tTVA ${item.tva || 5.5}%\t\t${tvaAmount.toFixed(2)}\t\t\t${dateStr}\t\t`);
          ecritureNum++;
        }
      });
      // Créance client
      rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t411000\tClients\t${p.familyName}\t${p.familyName}\t${pieceRef}\t${dateStr}\tCréance ${p.familyName}\t${(p.totalTTC || 0).toFixed(2)}\t\t\t\t${dateStr}\t\t`);
      ecritureNum++;
    });

    const content = header + "\n" + rows.join("\n");
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
      {!loading && tab === "remise" && (() => {
        // ──────────────────────────────────────────────────────────────────
        // Travail au niveau ENCAISSEMENT (pas payment) pour gérer les
        // paiements mixtes : un payment mixte a plusieurs encaissements avec
        // des modes différents, chacun doit pouvoir être remis séparément.
        // ──────────────────────────────────────────────────────────────────
        const remisEncaissementIds = new Set(
          (remises || []).flatMap((r: any) => r.encaissementIds || [])
        );

        // ──────────────────────────────────────────────────────────────────
        // Contre-passations neutralisées :
        // Si un encaissement A (positif) a une contre-passation B (négatif,
        // montant opposé), alors A et B s'annulent mutuellement et doivent
        // disparaître de la liste "Encaissements à remettre".
        // ──────────────────────────────────────────────────────────────────
        const neutralizedEncIds = new Set<string>();
        const reversals = (encaissementsCompta || []).filter((e: any) => e.correctionDe && (e.montant || 0) < 0);
        for (const rev of reversals) {
          const original = (encaissementsCompta || []).find((e: any) => e.id === rev.correctionDe);
          if (!original) continue;
          // Vérifier que les montants s'annulent exactement
          if (Math.abs((original.montant || 0) + (rev.montant || 0)) < 0.02) {
            neutralizedEncIds.add(original.id);
            neutralizedEncIds.add(rev.id);
          }
        }

        // Legacy : certaines remises anciennes n'ont que paymentIds (pas
        // encaissementIds). Dans ce cas on considère qu'elles concernent
        // TOUS les encaissements de ces payments DONT LE MODE CORRESPOND
        // à celui de la remise.
        // BUG HISTORIQUE (corrigé ici) : avant, on excluait tous les
        // encaissements d'un paymentId dès qu'une remise le mentionnait,
        // même si la remise était pour un autre mode. Résultat : pour un
        // paiement mixte chèque + espèces, quand on remettait le chèque
        // en banque, l'encaissement espèces du même paiement disparaissait
        // aussi des "à remettre" → écart visible dans le diag-espèces.
        const remisPaymentModeLegacy = new Map<string, Set<string>>();
        (remises || []).forEach((r: any) => {
          // On ne prend en compte le legacy QUE si la remise n'a pas déjà
          // encaissementIds (sinon doublon avec le chemin moderne).
          if ((r.encaissementIds || []).length > 0) return;
          const mode = r.paymentMode || "autre";
          (r.paymentIds || []).forEach((pid: string) => {
            if (!remisPaymentModeLegacy.has(pid)) {
              remisPaymentModeLegacy.set(pid, new Set());
            }
            remisPaymentModeLegacy.get(pid)!.add(mode);
          });
        });

        const nonRemisEnc = (encaissementsCompta || []).filter((e: any) => {
          // Modes exclus des remises physiques
          if (["virement", "prelevement_sepa", "cb_online", "avoir"].includes(e.mode)) return false;
          // Montant positif uniquement (pas de remboursements)
          if ((e.montant || 0) <= 0) return false;
          // Neutralisé par une contre-passation de montant opposé
          if (neutralizedEncIds.has(e.id)) return false;
          // Déjà remis : soit marqué directement, soit via encaissementIds
          if (e.remiseId) return false;
          if (remisEncaissementIds.has(e.id)) return false;
          // Déjà rapproché directement par la banque (CB terminal, etc.)
          // → pas besoin de passer par un bordereau de remise physique
          if (e.reconciledByBank) return false;
          // Legacy : la remise ne mentionne que paymentIds, on compare aussi le mode
          if (e.paymentId && remisPaymentModeLegacy.get(e.paymentId)?.has(e.mode)) return false;
          // Legacy mixte : remise.paymentMode === 'mixte' + paymentId matche → déjà remis
          // (on ne peut pas distinguer les modes, on suppose que toute la
          // commande est remise, comportement historique)
          if (e.paymentId && remisPaymentModeLegacy.get(e.paymentId)?.has("mixte")) return false;
          return true;
        });

        const nonRemisByModeEnc: Record<string, typeof nonRemisEnc> = {};
        nonRemisEnc.forEach((e: any) => {
          const m = e.mode || "autre";
          if (!nonRemisByModeEnc[m]) nonRemisByModeEnc[m] = [];
          nonRemisByModeEnc[m].push(e);
        });
        const totalNonRemisEnc = nonRemisEnc.reduce((s: number, e: any) => s + (e.montant || 0), 0);

        // Alias pour le code plus bas (compat), mais désormais vide car on ne
        // travaille plus au niveau payment ici
        const nonRemis: any[] = [];
        const nonRemisByMode: Record<string, any[]> = {};
        const totalNonRemis = 0;

        // Filtre date sur l'historique des remises
        const remisesFiltrees = (remises || []).filter((r: any) => {
          const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
          if (!d) return true;
          if (remiseDateFrom && d < new Date(remiseDateFrom)) return false;
          if (remiseDateTo && d > new Date(remiseDateTo + "T23:59:59")) return false;
          if (remiseModeFilter && r.paymentMode !== remiseModeFilter) return false;
          return true;
        }).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        const editingRemise = editingRemiseId ? remises.find((r: any) => r.id === editingRemiseId) : null;

        return (
        <div className="flex flex-col gap-5">

          {/* À remettre */}
          <Card padding="md" className={totalNonRemisEnc > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800">Encaissements à remettre</h3>
                <p className="font-body text-xs text-slate-500">{nonRemisEnc.length} encaissement{nonRemisEnc.length > 1 ? "s" : ""} non encore inclus dans une remise <span className="text-slate-400">(virements et CB en ligne exclus — rapprochement direct)</span></p>
              </div>
              {nonRemisEnc.length > 0 && <span className="font-body text-xl font-bold text-orange-500">{totalNonRemisEnc.toFixed(2)}€</span>}
            </div>
            {nonRemisEnc.length === 0 ? (
              <p className="font-body text-sm text-green-600">✓ Tous les encaissements ont été remis en banque.</p>
            ) : (
              <>
                {/* Filtre par date */}
                <div className="flex flex-wrap gap-2 mb-3 items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Du</span>
                  <input
                    type="date"
                    value={aRemettreDateFrom}
                    onChange={e => setARemettreDateFrom(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
                  />
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">au</span>
                  <input
                    type="date"
                    value={aRemettreDateTo}
                    onChange={e => setARemettreDateTo(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
                  />
                  {(aRemettreDateFrom || aRemettreDateTo) && (
                    <button
                      onClick={() => { setARemettreDateFrom(""); setARemettreDateTo(""); }}
                      className="font-body text-[11px] text-slate-500 bg-white border border-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-slate-100">
                      ✕ Réinitialiser
                    </button>
                  )}
                  {/* Boutons raccourcis */}
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => {
                        const t = new Date();
                        const iso = t.toISOString().slice(0, 10);
                        setARemettreDateFrom(iso); setARemettreDateTo(iso);
                      }}
                      className="font-body text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded cursor-pointer hover:bg-blue-100">
                      Aujourd'hui
                    </button>
                    <button
                      onClick={() => {
                        const t = new Date();
                        const weekAgo = new Date(t.getTime() - 7 * 24 * 60 * 60 * 1000);
                        setARemettreDateFrom(weekAgo.toISOString().slice(0, 10));
                        setARemettreDateTo(t.toISOString().slice(0, 10));
                      }}
                      className="font-body text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded cursor-pointer hover:bg-blue-100">
                      7 derniers jours
                    </button>
                  </div>
                </div>

                {/* Filtre d'affichage par mode */}
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Afficher :</span>
                  {[
                    { id: "", label: "Tous" },
                    { id: "cb_terminal", label: "CB" },
                    { id: "cheque", label: "Chèques" },
                    { id: "especes", label: "Espèces" },
                  ].map(m => {
                    const count = m.id ? (nonRemisByModeEnc[m.id]?.length || 0) : nonRemisEnc.length;
                    const total = m.id
                      ? (nonRemisByModeEnc[m.id] || []).reduce((s: number, e: any) => s + (e.montant || 0), 0)
                      : totalNonRemisEnc;
                    if (m.id && count === 0) return null;
                    const isActive = remiseModeView === m.id;
                    return (
                      <button
                        key={m.id || "all"}
                        onClick={() => setRemiseModeView(m.id)}
                        className={`font-body text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          isActive
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50"
                        }`}>
                        {m.label} · {total.toFixed(2)}€ ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Liste des encaissements filtrée par mode ET par date */}
                <div className="flex flex-col gap-1 mb-4 max-h-[300px] overflow-y-auto">
                  {nonRemisEnc
                    .filter((e: any) => !remiseModeView || e.mode === remiseModeView)
                    .filter((e: any) => {
                      // Filtre par date
                      if (!aRemettreDateFrom && !aRemettreDateTo) return true;
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      if (!d) return false;
                      if (aRemettreDateFrom) {
                        const from = new Date(aRemettreDateFrom + "T00:00:00");
                        if (d < from) return false;
                      }
                      if (aRemettreDateTo) {
                        const to = new Date(aRemettreDateTo + "T23:59:59");
                        if (d > to) return false;
                      }
                      return true;
                    })
                    .sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
                    .map((e: any) => {
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      const isChecked = selectedForRemise.has(e.id!);
                      // Infos du payment associé pour contexte
                      const pay = payments.find(p => p.id === e.paymentId);
                      const activityLabel = e.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                      const isFromMixed = pay && pay.paymentMode === "mixte";
                      return (
                        <label key={e.id} className={`flex items-center justify-between font-body text-xs py-1.5 px-3 rounded-lg cursor-pointer ${isChecked ? "bg-blue-50 border border-blue-200" : "bg-white hover:bg-slate-50"}`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedForRemise(prev => {
                                  const next = new Set(prev);
                                  if (next.has(e.id!)) next.delete(e.id!); else next.add(e.id!);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                            />
                            <span className="text-slate-500 min-w-[65px]">{d ? d.toLocaleDateString("fr-FR") : "—"}</span>
                            <Badge color="gray">{modeLabels[e.mode] || e.mode}</Badge>
                            <span className="text-blue-800 font-semibold truncate">{e.familyName || pay?.familyName || "—"}</span>
                            <span className="text-slate-500 truncate">{(activityLabel || "").slice(0, 40)}</span>
                            {isFromMixed && (
                              <span className="font-body text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded flex-shrink-0" title="Partie d'un paiement mixte">mixte</span>
                            )}
                            {e.ref && (
                              <span className="font-body text-[10px] text-slate-400 flex-shrink-0">n°{e.ref}</span>
                            )}
                          </div>
                          <span className="font-semibold text-blue-500 flex-shrink-0 ml-2">{(e.montant || 0).toFixed(2)}€</span>
                        </label>
                      );
                    })}
                </div>

                {/* Barre d'aide à la sélection */}
                {(() => {
                  const selectedEncs = nonRemisEnc.filter((e: any) => selectedForRemise.has(e.id!));
                  const selectedTotal = selectedEncs.reduce((s: number, e: any) => s + (e.montant || 0), 0);
                  const selectedModes = new Set(selectedEncs.map((e: any) => e.mode));
                  const selectedModeLabel = selectedModes.size === 1
                    ? (modeLabels[selectedEncs[0]?.mode] || selectedEncs[0]?.mode)
                    : "mixte";
                  // Dans la vue filtrée uniquement : quels encaissements sont affichés ?
                  // On applique LE MÊME filtre que la liste visible (mode + date)
                  const visibleEncs = nonRemisEnc
                    .filter((e: any) => !remiseModeView || e.mode === remiseModeView)
                    .filter((e: any) => {
                      if (!aRemettreDateFrom && !aRemettreDateTo) return true;
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      if (!d) return false;
                      if (aRemettreDateFrom) {
                        const from = new Date(aRemettreDateFrom + "T00:00:00");
                        if (d < from) return false;
                      }
                      if (aRemettreDateTo) {
                        const to = new Date(aRemettreDateTo + "T23:59:59");
                        if (d > to) return false;
                      }
                      return true;
                    });
                  const allVisibleSelected = visibleEncs.length > 0 && visibleEncs.every((e: any) => selectedForRemise.has(e.id!));
                  return (
                    <>
                      {/* Boutons de cochage rapide sur la vue filtrée */}
                      <div className="flex gap-2 flex-wrap mb-2 items-center">
                        <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Cocher :</span>
                        <button
                          onClick={() => {
                            setSelectedForRemise(prev => {
                              const next = new Set(prev);
                              if (allVisibleSelected) {
                                visibleEncs.forEach((e: any) => next.delete(e.id!));
                              } else {
                                visibleEncs.forEach((e: any) => next.add(e.id!));
                              }
                              return next;
                            });
                          }}
                          className="font-body text-[11px] text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-slate-200">
                          {allVisibleSelected ? "Tout décocher" : "Tout cocher"} ({visibleEncs.length})
                        </button>
                        {selectedForRemise.size > 0 && (
                          <button
                            onClick={() => setSelectedForRemise(new Set())}
                            className="font-body text-[11px] text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100 ml-auto">
                            Vider la sélection ({selectedForRemise.size})
                          </button>
                        )}
                      </div>

                      {/* Bouton créer bordereau avec la sélection */}
                      {selectedForRemise.size > 0 && (
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200">
                          <div className="font-body text-sm">
                            <span className="font-semibold text-blue-800">{selectedForRemise.size} encaissement{selectedForRemise.size > 1 ? "s" : ""} sélectionné{selectedForRemise.size > 1 ? "s" : ""}</span>
                            <span className="text-slate-500"> · {selectedModeLabel}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-body text-lg font-bold text-green-600">{selectedTotal.toFixed(2)}€</span>
                            <button
                              onClick={async () => {
                                if (!confirm(`Créer un bordereau de remise ?\n\n${selectedEncs.length} encaissement(s) — ${selectedTotal.toFixed(2)}€\nMode : ${selectedModeLabel}`)) return;
                                try {
                                  // Regrouper les paymentIds concernés (pour l'historique/affichage)
                                  const affectedPaymentIds = [...new Set(selectedEncs.map((e: any) => e.paymentId).filter(Boolean))];

                                  const remiseRef = await addDoc(collection(db, "remises"), {
                                    date: serverTimestamp(),
                                    encaissementIds: selectedEncs.map((e: any) => e.id), // nouveau : lien fin
                                    paymentIds: affectedPaymentIds, // compat affichage historique
                                    paymentMode: selectedModes.size === 1 ? [...selectedModes][0] : "mixte",
                                    total: selectedTotal,
                                    nbPaiements: selectedEncs.length,
                                    status: "created",
                                    pointee: false,
                                    createdAt: serverTimestamp(),
                                  });

                                  // Marquer chaque encaissement comme remis
                                  for (const e of selectedEncs) {
                                    await updateDoc(doc(db, "encaissements", e.id!), { remiseId: remiseRef.id });
                                  }

                                  // Marquer le payment comme entièrement remis UNIQUEMENT si tous
                                  // ses encaissements éligibles sont dans cette remise (ou déjà remis)
                                  for (const payId of affectedPaymentIds) {
                                    const allEncsOfPayment = (encaissementsCompta || []).filter(
                                      (x: any) => x.paymentId === payId
                                      && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(x.mode)
                                      && (x.montant || 0) > 0
                                    );
                                    const allRemis = allEncsOfPayment.every((x: any) =>
                                      selectedEncs.some((s: any) => s.id === x.id) || x.remiseId || remisEncaissementIds.has(x.id)
                                    );
                                    if (allRemis) {
                                      await updateDoc(doc(db, "payments", payId), { remiseId: remiseRef.id });
                                    }
                                  }

                                  setSelectedForRemise(new Set());
                                  fetchData();
                                } catch (e) { console.error(e); alert("Erreur lors de la création du bordereau."); }
                              }}
                              className="font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg border-none cursor-pointer">
                              Créer le bordereau
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </Card>

          {/* Historique + filtres */}
          {(remises || []).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <h3 className="font-body text-base font-semibold text-blue-800">Historique des remises</h3>
                {/* ── Filtres ── */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="font-body text-xs text-slate-500">Du</span>
                    <input type="date" value={remiseDateFrom} onChange={e => setRemiseDateFrom(e.target.value)}
                      className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-body text-xs text-slate-500">au</span>
                    <input type="date" value={remiseDateTo} onChange={e => setRemiseDateTo(e.target.value)}
                      className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <select value={remiseModeFilter} onChange={e => setRemiseModeFilter(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400">
                    <option value="">Tous modes</option>
                    <option value="cb_terminal">CB</option>
                    <option value="cheque">Chèques</option>
                    <option value="especes">Espèces</option>
                    <option value="virement">Virements</option>
                    <option value="mixte">Mixte</option>
                  </select>
                  {(remiseDateFrom || remiseDateTo || remiseModeFilter) && (
                    <button onClick={() => { setRemiseDateFrom(""); setRemiseDateTo(""); setRemiseModeFilter(""); }}
                      className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-red-500">✕ Effacer</button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {remisesFiltrees.map((r: any) => {
                  const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();

                  // ─── Résolution des encaissements de cette remise ───
                  // Nouveau format : r.encaissementIds (liste précise des flux)
                  // Ancien format : r.paymentIds (on reconstitue tous les encaissements des payments)
                  let rEncaissements: any[] = [];
                  if (Array.isArray(r.encaissementIds) && r.encaissementIds.length > 0) {
                    const idSet = new Set(r.encaissementIds);
                    rEncaissements = (encaissementsCompta || []).filter((e: any) => idSet.has(e.id));
                  } else if (Array.isArray(r.paymentIds) && r.paymentIds.length > 0) {
                    // Compat : pour les anciennes remises, afficher tous les encaissements
                    // des payments inclus (exclusion des modes non-physiques)
                    const payIdSet = new Set(r.paymentIds);
                    rEncaissements = (encaissementsCompta || []).filter((e: any) =>
                      payIdSet.has(e.paymentId)
                      && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(e.mode)
                      && (e.montant || 0) > 0
                    );
                  }
                  // Tri chronologique
                  rEncaissements = [...rEncaissements].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));

                  const isEditing = editingRemiseId === r.id;
                  const isPointing = pointageRemiseId === r.id;

                  // Encaissements éligibles à ajouter (non remis, filtrés par recherche)
                  const addableEncs = nonRemisEnc.filter((e: any) => {
                    if (editingRemiseSearch) {
                      const q = editingRemiseSearch.toLowerCase();
                      const pay = payments.find(p => p.id === e.paymentId);
                      const label = (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                      return (e.familyName || "").toLowerCase().includes(q)
                        || (pay?.familyName || "").toLowerCase().includes(q)
                        || label.toLowerCase().includes(q);
                    }
                    return true;
                  }).slice(0, 20);

                  // Helpers pour retrait / ajout au niveau encaissement
                  const retirerEncaissement = async (enc: any) => {
                    if (!confirm(`Retirer ${enc.familyName || "cet encaissement"} (${(enc.montant || 0).toFixed(2)}€ ${modeLabels[enc.mode] || enc.mode}) de cette remise ?`)) return;
                    // Retirer l'id de r.encaissementIds
                    const oldEncIds = Array.isArray(r.encaissementIds) ? r.encaissementIds : [];
                    const newEncIds = oldEncIds.filter((id: string) => id !== enc.id);
                    // Recalculer le total à partir des encaissements restants
                    const remainingEncs = (encaissementsCompta || []).filter((x: any) => newEncIds.includes(x.id));
                    const newTotal = remainingEncs.reduce((s: number, x: any) => s + (x.montant || 0), 0);

                    // Recalculer les modes et paymentIds affectés
                    const modes = new Set(remainingEncs.map((x: any) => x.mode));
                    const paymentIds = [...new Set(remainingEncs.map((x: any) => x.paymentId).filter(Boolean))];

                    await updateDoc(doc(db, "remises", r.id), {
                      encaissementIds: newEncIds,
                      paymentIds,
                      total: Math.round(newTotal * 100) / 100,
                      nbPaiements: newEncIds.length,
                      paymentMode: modes.size === 1 ? [...modes][0] : (modes.size > 1 ? "mixte" : r.paymentMode),
                      updatedAt: serverTimestamp(),
                    });

                    // Libérer l'encaissement (remiseId: null)
                    await updateDoc(doc(db, "encaissements", enc.id!), { remiseId: null });

                    // Retirer aussi le payment.remiseId SI ce payment n'a plus aucun encaissement dans la remise
                    if (enc.paymentId) {
                      const stillInRemise = remainingEncs.some((x: any) => x.paymentId === enc.paymentId);
                      if (!stillInRemise) {
                        try {
                          await updateDoc(doc(db, "payments", enc.paymentId), { remiseId: null });
                        } catch (err) {
                          console.error("[remises] libération payment échouée:", err);
                        }
                      }
                    }

                    fetchData();
                  };

                  const ajouterEncaissement = async (enc: any) => {
                    const oldEncIds = Array.isArray(r.encaissementIds) ? r.encaissementIds : [];
                    const newEncIds = [...oldEncIds, enc.id];
                    const newEncs = (encaissementsCompta || []).filter((x: any) => newEncIds.includes(x.id));
                    const newTotal = newEncs.reduce((s: number, x: any) => s + (x.montant || 0), 0);
                    const modes = new Set(newEncs.map((x: any) => x.mode));
                    const paymentIds = [...new Set(newEncs.map((x: any) => x.paymentId).filter(Boolean))];

                    await updateDoc(doc(db, "remises", r.id), {
                      encaissementIds: newEncIds,
                      paymentIds,
                      total: Math.round(newTotal * 100) / 100,
                      nbPaiements: newEncIds.length,
                      paymentMode: modes.size === 1 ? [...modes][0] : "mixte",
                      updatedAt: serverTimestamp(),
                    });

                    await updateDoc(doc(db, "encaissements", enc.id!), { remiseId: r.id });

                    // Marquer aussi le payment si tous ses encaissements éligibles sont remis
                    if (enc.paymentId) {
                      const allEncsOfPayment = (encaissementsCompta || []).filter(
                        (x: any) => x.paymentId === enc.paymentId
                        && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(x.mode)
                        && (x.montant || 0) > 0
                      );
                      const allNowRemis = allEncsOfPayment.every((x: any) => x.id === enc.id || x.remiseId);
                      if (allNowRemis) {
                        try {
                          await updateDoc(doc(db, "payments", enc.paymentId), { remiseId: r.id });
                        } catch {}
                      }
                    }

                    fetchData();
                  };

                  return (
                    <Card key={r.id} padding="md" className={r.pointee ? "border-green-200" : ""}>
                      {/* ── En-tête cliquable ── */}
                      <div className="flex justify-between items-center cursor-pointer select-none"
                        onClick={() => setOpenRemiseId(openRemiseId === r.id ? null : r.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-body text-sm font-semibold text-blue-800">
                              Remise du {rDate.toLocaleDateString("fr-FR")}
                            </div>
                            {r.pointee
                              ? <Badge color="green">✓ Pointée</Badge>
                              : <Badge color="orange">Non pointée</Badge>}
                            <span className="font-body text-xs text-slate-500">{rEncaissements.length} encaissement{rEncaissements.length > 1 ? "s" : ""} · {modeLabels[r.paymentMode] || r.paymentMode || "Mixte"}</span>
                          </div>
                          {r.pointeeNote && <div className="font-body text-[10px] text-slate-500 mt-0.5 italic truncate">{r.pointeeNote}</div>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="font-body text-base font-bold text-blue-500">{(r.total || 0).toFixed(2)}€</span>
                          <span className="font-body text-xs text-slate-500 w-4">{openRemiseId === r.id ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* ── Contenu déroulant ── */}
                      {openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          {/* Boutons d'action */}
                          <div className="flex gap-2 flex-wrap mb-3">
                            <button onClick={e => {
                              e.stopPropagation();
                              const opening = !isPointing;
                              setPointageRemiseId(opening ? r.id : null);
                              setPointageNote(r.pointeeNote || "");
                              // Pré-remplir la date avec aujourd'hui à chaque ouverture
                              if (opening) {
                                setPointageDate(new Date().toISOString().slice(0, 10));
                              }
                            }}
                              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer flex items-center gap-1 ${r.pointee ? "bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}>
                              {r.pointee ? "✓ Dépointer" : "◎ Pointer"}
                            </button>
                            <button onClick={e => { e.stopPropagation(); setEditingRemiseId(isEditing ? null : r.id); setEditingRemiseSearch(""); }}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                              ✏️ Modifier
                            </button>
                            <button onClick={e => { e.stopPropagation();
                              const html = `<html><head><meta charset="utf-8"><title>Bordereau de remise</title><style>body{font-family:Arial;max-width:600px;margin:30px auto}h1{font-size:18px;color:#2050A0;border-bottom:2px solid #2050A0;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:left}th{font-size:11px;color:#999;text-transform:uppercase}.total{font-size:16px;font-weight:bold;color:#2050A0;text-align:right;margin-top:12px}.status{font-size:12px;color:${r.pointee?"#16a34a":"#d97706"};margin-top:4px;text-align:right}.footer{font-size:11px;color:#999;margin-top:30px}</style></head><body><h1>Bordereau de remise — ${rDate.toLocaleDateString("fr-FR")}</h1><p style="font-size:12px;color:#666">Centre Equestre d'Agon-Coutainville</p><table><thead><tr><th>Date</th><th>Client</th><th>Prestation</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead><tbody>${rEncaissements.map((enc: any) => { const pay = payments.find(p => p.id === enc.paymentId); const pd = enc.date?.seconds ? new Date(enc.date.seconds * 1000).toLocaleDateString("fr-FR") : "—"; const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ") || "—"; const ref = enc.ref ? ` (n°${enc.ref})` : ""; return `<tr><td>${pd}</td><td>${enc.familyName || pay?.familyName || "—"}</td><td>${label}${ref}</td><td>${modeLabels[enc.mode] || enc.mode}</td><td style="text-align:right">${(enc.montant || 0).toFixed(2)}€</td></tr>`; }).join("")}</tbody></table><div class="total">Total : ${(r.total || 0).toFixed(2)}€</div><div class="status">${r.pointee ? "✓ Remise pointée" : "Non pointée"}</div>${r.pointeeNote?`<div style="font-size:11px;color:#666;text-align:right">${r.pointeeNote}</div>`:""}<div class="footer">Imprimé le ${new Date().toLocaleDateString("fr-FR")} — Signature : _______________</div></body></html>`;
                              const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
                            }} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                              <Printer size={12} /> Imprimer
                            </button>
                          </div>

                      {/* ── Pointage manuel ── */}
                      {isPointing && openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100 bg-sand rounded-xl p-4 flex flex-col gap-3">
                          <div className="font-body text-sm font-semibold text-blue-800">
                            {r.pointee ? "Dépointer la remise" : "Pointer la remise manuellement"}
                          </div>
                          <p className="font-body text-xs text-slate-600">
                            {r.pointee
                              ? "Cette remise sera marquée comme non vérifiée."
                              : "Confirmez que vous avez vérifié cette remise avec votre relevé bancaire."}
                          </p>
                          {!r.pointee && (
                            <div>
                              <label className="font-body text-xs text-slate-600 block mb-1">Date de pointage bancaire</label>
                              <input
                                type="date"
                                value={pointageDate}
                                onChange={e => setPointageDate(e.target.value)}
                                className="font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                              />
                              <p className="font-body text-[11px] text-slate-500 mt-1">
                                Par défaut, aujourd'hui. Tu peux choisir la date effective d'encaissement en banque.
                              </p>
                            </div>
                          )}
                          {/* Montant réellement encaissé (si espèces et écart possible) */}
                          {!r.pointee && r.paymentMode === "especes" && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                              <label className="font-body text-xs font-semibold text-orange-800 block mb-1">
                                🏦 Versement livre de caisse
                              </label>
                              <p className="font-body text-[11px] text-orange-700 mb-2">
                                Montant réellement accepté par la banque (si un billet a été refusé, indique le vrai montant crédité) :
                              </p>
                              <div className="relative inline-block">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={pointageMontantReel || (r.total || 0).toFixed(2).replace(".", ",")}
                                  onChange={e => setPointageMontantReel(e.target.value)}
                                  className="font-body text-sm border border-orange-300 rounded-lg px-3 py-2 pr-8 bg-white focus:outline-none focus:border-orange-500 w-32"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-slate-400">€</span>
                              </div>
                              <p className="font-body text-[10px] text-orange-600 mt-2">
                                Un versement (sortie d'espèces) sera créé automatiquement dans le livre de caisse à hauteur de ce montant.
                              </p>
                            </div>
                          )}
                          <div>
                            <label className="font-body text-xs text-slate-600 block mb-1">Note de rapprochement (optionnel)</label>
                            <input value={pointageNote} onChange={e => setPointageNote(e.target.value)}
                              placeholder="Ex: Vérifiée relevé BNP 15/03/2026, réf. VIR-12345..."
                              className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              // Si l'utilisateur a choisi une date, on l'utilise ; sinon aujourd'hui
                              const pointeeDate = !r.pointee
                                ? (pointageDate
                                    ? new Date(pointageDate + "T12:00:00").toISOString()
                                    : new Date().toISOString())
                                : null;
                              await updateDoc(doc(db, "remises", r.id), {
                                pointee: !r.pointee,
                                pointeeDate,
                                pointeeNote: pointageNote.trim() || null,
                                updatedAt: serverTimestamp(),
                              });

                              // Si pointage d'une remise ESPÈCES → créer la sortie dans le livre de caisse
                              if (!r.pointee && r.paymentMode === "especes") {
                                const montantReel = parseFloat((pointageMontantReel || String(r.total || 0)).replace(",", "."));
                                if (!isNaN(montantReel) && montantReel > 0) {
                                  const dateVers = pointeeDate ? new Date(pointeeDate) : new Date();
                                  await addDoc(collection(db, "encaissements"), {
                                    mode: "especes",
                                    modeLabel: "Versement banque",
                                    montant: -Math.abs(montantReel),
                                    date: dateVers,
                                    familyName: "—",
                                    activityTitle: "Versement en banque",
                                    raison: `Versement auto pour remise du ${new Date(r.date.seconds * 1000).toLocaleDateString("fr-FR")}`
                                      + (Math.abs(montantReel - (r.total || 0)) > 0.01 ? ` (écart ${(montantReel - (r.total || 0)).toFixed(2)}€)` : ""),
                                    ref: `VERS-REM-${r.id}`,
                                    isVersementBanque: true,
                                    remiseId: r.id, // lien vers la remise pour dépointage
                                    createdAt: serverTimestamp(),
                                  });
                                  console.log(`[pointage] Versement livre de caisse créé : -${montantReel.toFixed(2)}€`);
                                }
                              }

                              // Si dépointage d'une remise ESPÈCES → supprimer la sortie créée
                              if (r.pointee && r.paymentMode === "especes") {
                                try {
                                  const versSnap = await getDocs(query(
                                    collection(db, "encaissements"),
                                    where("remiseId", "==", r.id),
                                    where("isVersementBanque", "==", true)
                                  ));
                                  const dels: Promise<any>[] = [];
                                  versSnap.docs.forEach(d => dels.push(deleteDoc(doc(db, "encaissements", d.id))));
                                  await Promise.all(dels);
                                  if (dels.length > 0) console.log(`[dépointage] ${dels.length} versement(s) livre de caisse supprimé(s)`);
                                } catch (e) {
                                  console.error("[dépointage] Erreur suppression versements:", e);
                                }
                              }

                              setPointageRemiseId(null);
                              setPointageDate("");
                              setPointageNote("");
                              setPointageMontantReel("");
                              fetchData();
                            }} className={`font-body text-xs font-semibold px-4 py-2 rounded-lg border-none cursor-pointer text-white ${r.pointee ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}>
                              {r.pointee ? "Confirmer le dépointage" : "✓ Confirmer le pointage"}
                            </button>
                            <button onClick={() => { setPointageRemiseId(null); setPointageDate(""); setPointageNote(""); setPointageMontantReel(""); }}
                              className="font-body text-xs text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                          </div>
                        </div>
                      )}

                      {/* ── Édition remise ── */}
                      {isEditing && openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="font-body text-xs font-semibold text-blue-800 mb-2">Modifier la remise</div>

                          {/* Retirer des encaissements */}
                          {rEncaissements.length > 0 && (
                            <div className="mb-3">
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Encaissements inclus — cliquer pour retirer</div>
                              <div className="flex flex-col gap-1">
                                {rEncaissements.map((enc: any) => {
                                  const pay = payments.find(p => p.id === enc.paymentId);
                                  const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                                  const isFromMixed = pay && pay.paymentMode === "mixte";
                                  return (
                                    <div key={enc.id} className="flex items-center justify-between px-3 py-1.5 bg-sand rounded-lg">
                                      <div className="flex items-center gap-2 font-body text-xs min-w-0 flex-1">
                                        <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                        <span className="text-blue-800 font-semibold truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                        <span className="text-slate-500 truncate">{(label || "").slice(0, 35)}</span>
                                        {isFromMixed && <span className="font-body text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded flex-shrink-0">mixte</span>}
                                        {enc.ref && <span className="font-body text-[10px] text-slate-400 flex-shrink-0">n°{enc.ref}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="font-body text-xs font-semibold text-blue-500">{(enc.montant || 0).toFixed(2)}€</span>
                                        <button onClick={() => retirerEncaissement(enc)}
                                          className="font-body text-[10px] text-red-400 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100">
                                          − Retirer
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Ajouter des encaissements */}
                          {nonRemisEnc.length > 0 && (
                            <div>
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ajouter un encaissement non remis</div>
                              <input value={editingRemiseSearch} onChange={e => setEditingRemiseSearch(e.target.value)}
                                placeholder="Rechercher une famille ou activité..."
                                className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 mb-2 bg-white focus:outline-none focus:border-blue-400" />
                              <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                                {addableEncs.map((enc: any) => {
                                  const pay = payments.find(p => p.id === enc.paymentId);
                                  const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                                  return (
                                    <div key={enc.id} className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-100 rounded-lg">
                                      <div className="flex items-center gap-2 font-body text-xs min-w-0 flex-1">
                                        <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                        <span className="text-blue-800 font-semibold truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                        <span className="text-slate-500 truncate">{(label || "").slice(0, 35)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="font-body text-xs font-semibold text-blue-500">{(enc.montant || 0).toFixed(2)}€</span>
                                        <button onClick={() => ajouterEncaissement(enc)}
                                          className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-green-100">
                                          + Ajouter
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <button onClick={() => setEditingRemiseId(null)}
                            className="mt-3 font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
                            ✓ Terminer la modification
                          </button>
                        </div>
                      )}

                      {/* Détail encaissements (masqué si en édition) */}
                      {!isEditing && openRemiseId === r.id && (
                        <div className="mt-2">
                          {rEncaissements.map((enc: any) => {
                            const pay = payments.find(p => p.id === enc.paymentId);
                            const pd = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                            const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                            return (
                              <div key={enc.id} className="flex justify-between py-1 font-body text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-slate-500">{pd ? pd.toLocaleDateString("fr-FR") : "—"}</span>
                                  <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                  <span className="text-blue-800 truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                  <span className="text-slate-500 truncate hidden sm:inline">{(label || "").slice(0, 30)}</span>
                                  {enc.ref && <span className="text-slate-400 flex-shrink-0">n°{enc.ref}</span>}
                                </div>
                                <span className="text-blue-500 font-semibold flex-shrink-0">{(enc.montant || 0).toFixed(2)}€</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                        </div>
                      )} {/* fin bloc déroulant */}
                    </Card>
                  );
                })}
                {remisesFiltrees.length === 0 && (remiseDateFrom || remiseDateTo || remiseModeFilter) && (
                  <p className="font-body text-sm text-slate-500 text-center py-4">Aucune remise sur cette période.</p>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })()}

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
                .map(({ bl, i }) => (
                <div key={i}>
                <div className={`px-5 py-3 border-b border-blue-500/8 flex items-center ${bl.matched ? "" : "bg-orange-50"}`}>
                  <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                  <div className="flex-1">
                    <div className="font-body text-sm text-blue-800">{bl.label}</div>
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
              ))}
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
        const parseCaText = (text: string): number[] => {
          const amounts: number[] = [];

          // PASSE 1 : ancrage HH:MM:SS (la plus fiable, marche dans tous les cas)
          //   Matches : "17:02:34 95,00 EUR", "09:59:09175,00 EUR", "10:00145,00 EUR", etc.
          const anchored = /\d{2}:\d{2}(?::\d{2})?\s*(\d{1,6})[,.](\d{2})\s*(?:EUR|€)/gi;
          let m;
          while ((m = anchored.exec(text)) !== null) {
            const val = parseFloat(`${m[1]}.${m[2]}`);
            if (!isNaN(val) && val > 0 && val < 50000) amounts.push(val);
          }
          if (amounts.length > 0) return amounts;

          // PASSE 2 (fallback) : ligne par ligne, regex stricte avec bord de ligne
          //   Cas où l'utilisateur copie juste les montants sans les heures
          const lines = text.split(/[\r\n]+/);
          const single = /(?:^|[\s\u00A0\t])(\d{1,3}(?:[\s\u00A0]\d{3})*|\d{1,6})[,.](\d{2})\s*(?:EUR|€)/i;
          for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.includes("total") || lower.includes("somme") || lower.includes("récap") || lower.includes("recap")) continue;
            const mm = line.match(single);
            if (!mm) continue;
            const intPart = mm[1].replace(/[\s\u00A0]/g, "");
            const val = parseFloat(`${intPart}.${mm[2]}`);
            if (!isNaN(val) && val > 0 && val < 50000) amounts.push(val);
          }
          return amounts;
        };

        // Essai de matching : on cherche parmi les CB terminal NON CONSOMMÉS ceux
        // dont le montant correspond aux montants parsés (dans une fenêtre ±3j)
        const tryMatch = (text: string) => {
          const amounts = parseCaText(text);
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
        const parsed = caDetailText ? parseCaText(caDetailText) : [];
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
                    let csv = "";
                    const sep = ";";
                    if (exp.id === "ventes") {
                      csv = "Date;Client;Article;HT;TVA%;TVA;TTC;Mode\n";
                      filteredPayments.forEach(p => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                        (p.items || []).forEach((i: any) => {
                          csv += [d, p.familyName, i.activityTitle, (i.priceHT||0).toFixed(2), (i.tva||5.5), ((i.priceTTC||0)-(i.priceHT||0)).toFixed(2), (i.priceTTC||0).toFixed(2), p.paymentMode].join(sep) + "\n";
                        });
                      });
                    } else if (exp.id === "reglements") {
                      csv = "Date;Client;Montant;Mode;Référence\n";
                      filteredPayments.forEach(p => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                        csv += [d, p.familyName, (p.totalTTC||0).toFixed(2), p.paymentMode, p.paymentRef||""].join(sep) + "\n";
                      });
                    } else {
                      csv = "Client;Total facturé;Total payé;Solde dû\n";
                      const byClient: Record<string, { facture: number; paye: number }> = {};
                      payments.forEach(p => {
                        if (!byClient[p.familyName]) byClient[p.familyName] = { facture: 0, paye: 0 };
                        byClient[p.familyName].facture += p.totalTTC || 0;
                        byClient[p.familyName].paye += p.paidAmount || p.totalTTC || 0;
                      });
                      Object.entries(byClient).forEach(([name, c]) => {
                        csv += [name, c.facture.toFixed(2), c.paye.toFixed(2), (c.facture - c.paye).toFixed(2)].join(sep) + "\n";
                      });
                    }
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

      {/* ═══ PANEL DEBUG : Reset compta ═══
          Accessible UNIQUEMENT en ajoutant ?debug=reset à l'URL.
          Permet de remettre à zéro toute la comptabilité pour refaire des
          tests propres. Ne doit JAMAIS être utilisé en production réelle
          (des familles ont leurs factures envoyées).
          Réservé à la phase de test interne (avant septembre 2026). */}
      {showResetPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-500" size={28} />
              <h2 className="font-display text-xl font-bold text-red-600">Reset compta — Zone dangereuse</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 font-body text-sm text-red-900">
              <p className="font-semibold mb-1">⚠️ Opération IRRÉVERSIBLE</p>
              <p className="text-xs leading-relaxed">
                Efface tous les encaissements, remises, rapprochements, échéances SEPA, chèques différés,
                avoirs et cumuls fidélité. Les <b>paiements</b> (factures) sont conservés mais réinitialisés
                en "à encaisser". Les <b>réservations, familles, mandats SEPA</b> ne sont pas touchés.
              </p>
            </div>

            {/* Étape 1 : secret + dry-run */}
            {!resetDryRun && (
              <>
                <div>
                  <label className="font-body text-xs font-semibold text-slate-700 block mb-1">
                    Mot de passe admin (CRON_SECRET)
                  </label>
                  <input type="password" value={resetSecret} onChange={e => setResetSecret(e.target.value)}
                    placeholder="Saisir le CRON_SECRET"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 font-body text-sm focus:outline-none focus:border-red-400" />
                </div>
                <button
                  disabled={!resetSecret || resetLoading}
                  onClick={async () => {
                    setResetLoading(true);
                    try {
                      const res = await fetch(`/api/admin/reset-compta?secret=${encodeURIComponent(resetSecret)}`);
                      const data = await res.json();
                      if (data.success) {
                        setResetDryRun(data);
                      } else {
                        alert(`Erreur : ${data.error}`);
                      }
                    } catch (e: any) {
                      alert(`Erreur réseau : ${e.message}`);
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer disabled:opacity-50">
                  {resetLoading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : "👁️ "}
                  Afficher le rapport (dry-run)
                </button>
              </>
            )}

            {/* Étape 2 : rapport + confirmation */}
            {resetDryRun && !resetApplied && (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-orange-800 mb-2">📊 Ce qui sera effacé :</p>
                  <div className="flex flex-col gap-1 font-body text-xs text-slate-700">
                    {Object.entries(resetDryRun.report.deleteCollections).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono font-semibold">{n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-orange-200 font-body text-xs text-slate-700 flex flex-col gap-1">
                    <div className="flex justify-between"><span>Total encaissements</span><span className="font-mono font-bold">{resetDryRun.report.totals.encaissementsEuros} €</span></div>
                    <div className="flex justify-between"><span>Total avoirs</span><span className="font-mono font-bold">{resetDryRun.report.totals.avoirsEuros} €</span></div>
                    <div className="flex justify-between"><span>Factures concernées (total TTC)</span><span className="font-mono font-bold">{resetDryRun.report.totals.paymentsTotalEuros} €</span></div>
                    <div className="flex justify-between"><span>dont déjà encaissé</span><span className="font-mono font-bold">{resetDryRun.report.totals.paymentsDejaEncaisseEuros} €</span></div>
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-green-800 mb-1">✅ Préservé :</p>
                  <div className="flex flex-col gap-0.5 font-body text-xs text-slate-700">
                    {Object.entries(resetDryRun.report.preservedCollections).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-red-800 mb-2">
                    Pour confirmer, copier-coller ce token :
                  </p>
                  <code className="block font-mono text-sm bg-white px-3 py-2 rounded border border-red-200 text-red-900">
                    {resetDryRun.confirmTokenExpected}
                  </code>
                </div>
                <input type="text" placeholder={resetDryRun.confirmTokenExpected}
                  id="reset-confirm-input"
                  className="w-full px-3 py-2.5 rounded-xl border border-red-300 font-mono text-sm focus:outline-none focus:border-red-500" />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setResetDryRun(null); setResetSecret(""); }}
                    className="px-5 py-3 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">
                    Annuler
                  </button>
                  <button
                    disabled={resetLoading}
                    onClick={async () => {
                      const input = document.getElementById("reset-confirm-input") as HTMLInputElement;
                      const token = input?.value?.trim();
                      if (token !== resetDryRun.confirmTokenExpected) {
                        alert("Token de confirmation incorrect");
                        return;
                      }
                      if (!confirm("Dernière confirmation : effacer définitivement toute la compta ?")) return;
                      setResetLoading(true);
                      try {
                        const res = await fetch(`/api/admin/reset-compta?secret=${encodeURIComponent(resetSecret)}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirm: token }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setResetApplied(data);
                        } else {
                          alert(`Erreur : ${data.error}`);
                        }
                      } catch (e: any) {
                        alert(`Erreur réseau : ${e.message}`);
                      } finally {
                        setResetLoading(false);
                      }
                    }}
                    className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border-none cursor-pointer disabled:opacity-50">
                    {resetLoading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : "🔥 "}
                    Effacer tout maintenant
                  </button>
                </div>
              </>
            )}

            {/* Étape 3 : résultat */}
            {resetApplied && (
              <>
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-3">
                  <p className="font-body text-sm font-semibold text-green-800 mb-2">✅ Reset effectué en {resetApplied.durationMs} ms</p>
                  <div className="flex flex-col gap-1 font-body text-xs text-slate-700">
                    {Object.entries(resetApplied.deleted).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono">{n === -1 ? "❌ erreur" : n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {resetApplied.errors && resetApplied.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="font-body text-xs font-semibold text-red-800 mb-1">Erreurs :</p>
                    <ul className="font-body text-xs text-red-700 list-disc pl-4">
                      {resetApplied.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => { window.location.href = "/admin/comptabilite"; }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer">
                  Retour à la compta
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PANEL DIAG : Diagnostic remises ═══
          Accessible UNIQUEMENT via ?debug=diag dans l'URL.
          Read-only, affiche l'état réel de la collection 'remises' pour
          comprendre les écarts entre ce qu'on voit et ce qui existe en base. */}
      {showDiagPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <Search className="text-purple-500" size={28} />
              <h2 className="font-display text-xl font-bold text-purple-700">Diagnostic remises</h2>
            </div>
            {!diagReport && (
              <div className="flex items-center gap-3 text-slate-500">
                <Loader2 className="animate-spin" size={20} />
                <span className="font-body text-sm">Chargement des données...</span>
              </div>
            )}
            {diagReport && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">📊 Total</div>
                  <div className="font-body text-2xl font-bold text-blue-700">{diagReport.total} remises</div>
                  <div className="font-body text-xs text-slate-600 mt-1">
                    {diagReport.parEtat.pointees} pointées · {diagReport.parEtat.nonPointees} non pointées
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">📅 Par mois (création)</div>
                  <div className="flex flex-col gap-1 font-body text-xs">
                    {Object.entries(diagReport.parMois)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([mois, stats]: any) => (
                      <div key={mois} className="flex justify-between items-center bg-white px-2 py-1.5 rounded">
                        <span className="font-mono">{mois}</span>
                        <span>
                          <span className="font-bold">{stats.count}</span> remises ·
                          <span className="text-green-700"> {stats.pointees}</span> pointées ·
                          <span className="font-mono"> {stats.totalEur.toFixed(2)}€</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">💳 Par mode</div>
                  <div className="flex flex-wrap gap-2 font-body text-xs">
                    {Object.entries(diagReport.parMode).map(([mode, n]: any) => (
                      <div key={mode} className="bg-white px-2 py-1 rounded border border-slate-200">
                        <span className="text-slate-500">{mode}</span> <span className="font-bold ml-1">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">💰 Encaissements (vue actuelle)</div>
                  <div className="font-body text-xs text-slate-700">
                    Total : <b>{diagReport.encaissements.total}</b> · Rapprochés banque : <b className="text-green-700">{diagReport.encaissements.reconciled}</b> · CB Terminal : <b>{diagReport.encaissements.cbTerminal}</b>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-purple-800 mb-2">🕐 15 plus récentes</div>
                  <div className="flex flex-col gap-1 font-body text-[11px]">
                    {diagReport.recentes.map((r: any) => (
                      <div key={r.id} className="bg-white px-2 py-1.5 rounded border border-purple-100 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                        <span className="font-mono text-slate-600">{r.date}</span>
                        <span className="text-slate-500 text-[10px]">[{r.mode}]</span>
                        <span className="font-bold">{r.total.toFixed(2)}€</span>
                        {r.pointee
                          ? <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded">✓ pointée</span>
                          : <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded">non pointée</span>}
                        <span className="text-slate-400 text-[10px]">{r.nbEncaissements} encs · {r.nbPaymentsLegacy} legacy</span>
                        {r.pointeeNote && (
                          <div className="w-full text-[10px] text-slate-400 italic">{r.pointeeNote}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Recherche d'un paiement par nom (utile en cas de doute) ──
                    Appelle /api/admin/diag-paiement?q=xxx avec le token Firebase
                    Auth de l'utilisateur (read-only, pas de modification possible) */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-amber-800 mb-2">🔍 Rechercher un paiement par nom</div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="ex: gourmelon"
                      value={diagSearch}
                      onChange={(e) => setDiagSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") runDiagSearch(); }}
                      className="flex-1 px-3 py-1.5 rounded-md border border-amber-300 font-body text-xs"
                    />
                    <button
                      onClick={runDiagSearch}
                      disabled={diagSearching || !diagSearch.trim()}
                      className="px-4 py-1.5 rounded-md font-body text-xs font-semibold text-white bg-amber-600 border-none cursor-pointer disabled:opacity-50">
                      {diagSearching ? "..." : "Chercher"}
                    </button>
                  </div>
                  {diagSearchResult && (
                    <div className="bg-white rounded-md border border-amber-200 p-2 max-h-72 overflow-y-auto">
                      {diagSearchResult.error ? (
                        <div className="text-red-600 text-xs">{diagSearchResult.error}</div>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-slate-700 mb-2">
                            💳 {diagSearchResult.payments?.count || 0} paiement(s) — total {(diagSearchResult.payments?.totalTTC || 0).toFixed(2)}€
                          </div>
                          {(diagSearchResult.payments?.list || []).map((p: any) => (
                            <div key={p.id} className="border-l-2 border-blue-300 pl-2 mb-2 text-[10px]">
                              <div className="font-semibold">
                                {p.date} · {p.familyName} · <span className={`${p.status === "paid" ? "text-green-700" : "text-orange-700"}`}>{p.status}</span> · {p.paymentMode}
                              </div>
                              <div className="text-slate-600">Total {p.totalTTC?.toFixed(2)}€ · Payé {p.paidAmount?.toFixed(2)}€ · {p.nbItems} item(s)</div>
                              {p.items.map((it: any, i: number) => (
                                <div key={i} className="ml-2 text-slate-500">
                                  • {it.childName} · {it.activityTitle} · {it.priceTTC?.toFixed(2)}€
                                </div>
                              ))}
                            </div>
                          ))}
                          <div className="text-xs font-semibold text-slate-700 mb-2 mt-3 pt-2 border-t border-slate-200">
                            💰 {diagSearchResult.encaissements?.count || 0} encaissement(s) — total {(diagSearchResult.encaissements?.totalEur || 0).toFixed(2)}€
                          </div>
                          {(diagSearchResult.encaissements?.list || []).map((e: any) => (
                            <div key={e.id} className="border-l-2 border-green-300 pl-2 mb-1 text-[10px]">
                              <div className="font-semibold">
                                {e.date} · {e.familyName} · {e.activityTitle} · <b>{e.montant?.toFixed(2)}€</b> · {e.mode}
                              </div>
                              <div className="text-slate-500">
                                {e.reconciledByBank ? "✓ rapproché banque" : "non rapproché"}
                                {e.paymentId && ` · paymentId ${e.paymentId.slice(0, 8)}...`}
                                {e.remiseId && ` · remiseId ${e.remiseId.slice(0, 8)}...`}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { window.location.href = "/admin/comptabilite"; }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer">
                  Retour à la compta
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PANEL DÉPOINTER CB : remettre tous les encaissements CB en non rapproché ═══
          Accessible UNIQUEMENT via ?debug=reset-cb dans l'URL.
          Workflow : Nicolas a désactivé le matching CB par sous-ensembles
          (suite au bug 495€) et veut repartir d'un état propre pour utiliser
          Détail CA sur chaque remise CARTE. */}
      {showDepointerCbPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" ref={depointerPanelInitRef}>
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <RefreshCw className="text-orange-500" size={28} />
              <h2 className="font-display text-xl font-bold text-orange-700">Dépointer encaissements CB</h2>
            </div>
            <p className="font-body text-sm text-slate-600">
              Action : remet tous les encaissements <b>CB Terminal</b> de <b>{period}</b> en <i>non rapproché</i>.
              Ils réapparaîtront dans "Encaissements à remettre" et pourront être re-rapprochés
              proprement via <b>Détail CA</b> sur chaque remise CARTE.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              <b>⚠️ Effet de l'action :</b> les encaissements CB seront marqués <code className="bg-amber-100 px-1 rounded">reconciledByBank: false</code>.
              Les remises bancaires (bankLines) ne sont pas modifiées. Idempotent : peut être relancé sans danger.
            </div>

            {!depointerCbDryRun && depointerCbLoading && (
              <div className="flex items-center gap-2 text-slate-500 font-body text-sm">
                <Loader2 size={16} className="animate-spin" /> Calcul...
              </div>
            )}

            {depointerCbDryRun && !depointerCbDryRun.error && !depointerCbApplied && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="font-body text-sm font-semibold text-slate-700 mb-2">📊 Aperçu pour {depointerCbDryRun.period}</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-slate-700">{depointerCbDryRun.total}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase tracking-wide">Total CB</div>
                  </div>
                  <div className="bg-green-50 rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-green-700">{depointerCbDryRun.reconciledByBank}</div>
                    <div className="font-body text-[10px] text-green-700 uppercase tracking-wide">Rapprochés</div>
                  </div>
                  <div className="bg-orange-50 rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-orange-700">{depointerCbDryRun.aDepointer}</div>
                    <div className="font-body text-[10px] text-orange-700 uppercase tracking-wide">À dépointer</div>
                  </div>
                </div>
                {depointerCbDryRun.samples?.length > 0 && (
                  <div className="text-[11px] font-body text-slate-600">
                    <b>5 premiers (aperçu) :</b>
                    <ul className="mt-1 space-y-0.5">
                      {depointerCbDryRun.samples.map((s: any) => (
                        <li key={s.id} className="font-mono text-[10px]">
                          {s.date} · {s.familyName} · <b>{s.montant?.toFixed(2)}€</b> · {s.reconciledByBank ? "✓ rapproché" : "non rapproché"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {depointerCbDryRun?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {depointerCbDryRun.error}
              </div>
            )}

            {depointerCbApplied && !depointerCbApplied.error && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-body">
                ✅ <b>{depointerCbApplied.nbEncaissementsDepointes}</b> encaissements dépointés.
                <div className="text-xs mt-1">Rechargement automatique...</div>
              </div>
            )}
            {depointerCbApplied?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {depointerCbApplied.error}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { window.location.href = "/admin/comptabilite"; }}
                className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-slate-600 bg-slate-100 border-none cursor-pointer">
                Annuler
              </button>
              {depointerCbDryRun?.aDepointer > 0 && !depointerCbApplied && (
                <button
                  onClick={applyDepointerCb}
                  disabled={depointerCbLoading}
                  className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer disabled:opacity-50">
                  {depointerCbLoading ? "..." : `Dépointer ${depointerCbDryRun.aDepointer} encaissements`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PANEL MIGRATION BANKLINES (?debug=migrate-banklines) ═══
          Redistribue les bankLines deja stockees dans le mauvais doc
          rapprochements/{period} vers le doc correspondant a leur date
          reelle. A lancer une fois apres deploiement de l'etape 1. */}
      {showMigrateBlsPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" ref={migrateBlsPanelInitRef}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <RefreshCw className="text-purple-500" size={28} />
              <h2 className="font-display text-xl font-bold text-purple-700">Migration des bankLines par mois</h2>
            </div>
            <p className="font-body text-sm text-slate-600">
              Redistribue toutes les bankLines déjà stockées dans le mauvais doc
              <code className="bg-slate-100 px-1 rounded mx-1">rapprochements/&#123;period&#125;</code>
              vers le doc correspondant à leur <b>date réelle</b>.
              Action <b>idempotente</b> : peut être relancée sans danger.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
              <b>ℹ️ Pourquoi cette migration :</b> avant le fix de l'étape 1, à chaque
              import CSV toutes les bankLines étaient sauvegardées dans le doc de la
              période active (mai si tu importes en mai), même si elles concernaient
              avril. Cette migration les redistribue dans le bon mois.
              <br /><br />
              <b>Action :</b> chaque doc <code>rapprochements/YYYY-MM</code> sera réécrit
              avec uniquement les bankLines dont la date tombe dans ce mois. Les pointages
              existants sont préservés (en cas de doublon entre 2 docs, on garde celui
              qui est marqué <i>matched</i>).
            </div>

            {!migrateBlsDryRun && migrateBlsLoading && (
              <div className="flex items-center gap-2 text-slate-500 font-body text-sm">
                <Loader2 size={16} className="animate-spin" /> Analyse en cours...
              </div>
            )}

            {migrateBlsDryRun?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {migrateBlsDryRun.error}
              </div>
            )}

            {migrateBlsDryRun && !migrateBlsDryRun.error && !migrateBlsApplied && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="font-body text-sm font-semibold text-slate-700 mb-2">📊 Analyse</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-slate-700">{migrateBlsDryRun.stats?.nbDocs || 0}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase">Docs actuels</div>
                  </div>
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-slate-700">{migrateBlsDryRun.stats?.nbBls || 0}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase">BankLines</div>
                  </div>
                  <div className="bg-orange-50 rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-orange-700">{migrateBlsDryRun.stats?.nbBlsMalRangees || 0}</div>
                    <div className="font-body text-[10px] text-orange-700 uppercase">Mal rangées</div>
                  </div>
                  <div className="bg-purple-50 rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-purple-700">{migrateBlsDryRun.stats?.nbDocsApresMigration || 0}</div>
                    <div className="font-body text-[10px] text-purple-700 uppercase">Docs après</div>
                  </div>
                </div>

                {migrateBlsDryRun.docsApresMigration && migrateBlsDryRun.docsApresMigration.length > 0 && (
                  <div className="text-[11px] font-body text-slate-600">
                    <b>Répartition cible par mois :</b>
                    <table className="mt-1 w-full">
                      <tbody>
                        {migrateBlsDryRun.docsApresMigration.map((d: any) => (
                          <tr key={d.ym} className="font-mono text-[10px]">
                            <td className="py-0.5">{d.ym}</td>
                            <td className="py-0.5 text-right">{d.nbBls} bankLines</td>
                            <td className="py-0.5 text-right text-green-700">{d.nbMatched} pointées</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {migrateBlsDryRun.stats?.nbOrphelines > 0 && (
                  <div className="mt-2 text-[10px] text-amber-700 italic">
                    ⚠️ {migrateBlsDryRun.stats.nbOrphelines} bankLine(s) avec date invalide laissées dans leur doc d'origine.
                  </div>
                )}
              </div>
            )}

            {migrateBlsApplied && !migrateBlsApplied.error && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-body">
                ✅ <b>{migrateBlsApplied.nbBlsDeplacees}</b> bankLine(s) déplacée(s) dans le bon mois.
                <div className="text-xs mt-1">{migrateBlsApplied.nbDocsModifies} doc(s) modifié(s). Rechargement...</div>
              </div>
            )}
            {migrateBlsApplied?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {migrateBlsApplied.error}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { window.location.href = "/admin/comptabilite"; }}
                className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-slate-600 bg-slate-100 border-none cursor-pointer">
                Annuler
              </button>
              {migrateBlsDryRun && !migrateBlsDryRun.error && !migrateBlsApplied && (
                <button
                  onClick={applyMigrateBls}
                  disabled={migrateBlsLoading || (migrateBlsDryRun.stats?.nbBlsMalRangees || 0) === 0}
                  className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 border-none cursor-pointer disabled:opacity-50">
                  {migrateBlsLoading
                    ? "..."
                    : (migrateBlsDryRun.stats?.nbBlsMalRangees || 0) === 0
                    ? "Rien à migrer"
                    : `Migrer ${migrateBlsDryRun.stats.nbBlsMalRangees} bankLines`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
