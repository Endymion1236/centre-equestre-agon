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
import { useRapprochement } from "./useRapprochement";
import OngletRapprochement from "./OngletRapprochement";
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


  // Sélection manuelle pour bordereau de remise : IDs des encaissements cochés
  // Filtre d'affichage par mode dans la liste à remettre ("" = tous)

  // ─────────────────────────────────────────────────────────────────────────
  //  Diagnostic remises (panel ?debug=diag)
  //  Calcule un rapport read-only à partir des données déjà chargées dans
  //  l'UI (remises, encaissementsCompta, payments). Pas de requête supplémentaire.
  // ─────────────────────────────────────────────────────────────────────────

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

  // Le rapprochement bancaire — lecture du relevé, rapprochement automatique
  // et report dans la base — vit dans son propre hook (useRapprochement.ts).
  const {
    bankLines, setBankLines,
    handleCSVImport, updateAndSaveBankLines, syncVersementsEspeces, saveBankLinesByMonth,
  } = useRapprochement({ payments, remises, remisesSepa, encaissementsCompta, period, fetchData });

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
      {/* ─── Rapprochement bancaire, pointage manuel et lignes ignorées ─── */}
      <OngletRapprochement
        tab={tab} loading={loading} bankLines={bankLines}
        payments={payments} remises={remises} encaissementsCompta={encaissementsCompta}
        filteredPayments={filteredPayments}
        handleCSVImport={handleCSVImport} updateAndSaveBankLines={updateAndSaveBankLines}
        setBankLines={setBankLines} saveBankLinesByMonth={saveBankLinesByMonth}
        syncVersementsEspeces={syncVersementsEspeces} fetchData={fetchData}
        analyserRapprochement={analyserRapprochement}
        iaLoading={iaLoading} iaAnalysis={iaAnalysis} iaStats={iaStats} />
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
