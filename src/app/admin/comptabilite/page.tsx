"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Download, Upload, Check, FileText, Building2, Receipt, Calculator, Search, Printer, Plus, Sparkles, Bot } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

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
  const [tab, setTab] = useState<"journal" | "tva" | "rapprochement" | "remise" | "fec" | "export">("journal");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [remises, setRemises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtres remise
  const [remiseDateFrom, setRemiseDateFrom] = useState("");
  const [remiseDateTo, setRemiseDateTo] = useState("");
  const [remiseModeFilter, setRemiseModeFilter] = useState("");
  // Édition remise (ajouter/retirer paiements)
  const [editingRemiseId, setEditingRemiseId] = useState<string | null>(null);
  const [editingRemiseSearch, setEditingRemiseSearch] = useState("");
  // Pointage manuel remise
  const [pointageRemiseId, setPointageRemiseId] = useState<string | null>(null);
  const [pointageNote, setPointageNote] = useState("");
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
  const [bankLines, setBankLines] = useState<{ date: string; label: string; amount: number; matched: boolean; matchType: string; matchDetail: string; matchedEncs?: { familyName: string; montant: number; date: string; activityTitle: string; mode: string }[]; manualPaymentId?: string }[]>([]);
  // Pointage manuel
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null); // index de la bankLine
  const [expandedBankLine, setExpandedBankLine] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState("");

  // Sélection manuelle pour bordereau de remise : IDs des encaissements cochés
  const [selectedForRemise, setSelectedForRemise] = useState<Set<string>>(new Set());
  // Filtre d'affichage par mode dans la liste à remettre ("" = tous)
  const [remiseModeView, setRemiseModeView] = useState<string>("");

  // Sauvegarder les bankLines dans Firestore après modification manuelle
  const updateAndSaveBankLines = async (updated: typeof bankLines) => {
    setBankLines(updated);
    try {
      await setDoc(doc(db, "rapprochements", period), {
        period,
        bankLines: updated.map(bl => ({
          date: bl.date, label: bl.label, amount: bl.amount,
          matched: bl.matched, matchType: bl.matchType, matchDetail: bl.matchDetail,
          matchedEncs: bl.matchedEncs || null,
          manualPaymentId: bl.manualPaymentId || null,
        })),
        totalLines: updated.length,
        totalMatched: updated.filter(b => b.matched).length,
        totalAmount: Math.round(updated.reduce((s, b) => s + b.amount, 0) * 100) / 100,
        updatedAt: serverTimestamp(),
      });
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

  // CSV import handler — smart matching
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      
      // ── Parser intelligent pour CSV bancaires (Crédit Agricole, etc.) ──
      // Détecte automatiquement le format :
      // - Format CA : en-tête multi-lignes, libellés multi-lignes entre guillemets,
      //   colonnes Date;Libellé;Débit euros;Crédit euros; séparées par ;
      // - Format simple : Date;Libellé;Montant
      
      // 1. Trouver la ligne d'en-tête (celle qui contient "Date" et "Libellé" ou "Label")
      const allLines = raw.split("\n");
      let headerIdx = allLines.findIndex(l => {
        const lower = l.toLowerCase();
        return (lower.includes("date") && (lower.includes("libellé") || lower.includes("libelle") || lower.includes("label")));
      });
      if (headerIdx < 0) headerIdx = 0; // fallback : première ligne

      const headerLine = allLines[headerIdx].toLowerCase();
      const hasDebitCredit = headerLine.includes("débit") || headerLine.includes("debit") || headerLine.includes("crédit") || headerLine.includes("credit");
      
      // 2. Extraire le contenu après l'en-tête
      const dataText = allLines.slice(headerIdx + 1).join("\n");
      
      // 3. Parser les champs CSV avec guillemets multi-lignes
      const records: { date: string; label: string; debit: number; credit: number }[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < dataText.length; i++) {
        const ch = dataText[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
          current += ch;
        } else if (ch === "\n" && !inQuotes) {
          // Fin de ligne réelle (hors guillemets)
          if (current.trim()) {
            const fields = [];
            let field = "";
            let fInQ = false;
            for (let j = 0; j < current.length; j++) {
              const fc = current[j];
              if (fc === '"') { fInQ = !fInQ; }
              else if (fc === ";" && !fInQ) { fields.push(field.trim()); field = ""; }
              else { field += fc; }
            }
            fields.push(field.trim());
            
            // Nettoyer les champs (supprimer espaces multiples, retours à la ligne dans les libellés)
            const cleanField = (s: string) => s.replace(/\s+/g, " ").trim();
            
            const date = cleanField(fields[0] || "");
            const label = cleanField(fields[1] || "");
            
            // Vérifier que la date ressemble à une date (DD/MM/YYYY ou YYYY-MM-DD)
            const isDate = /^\d{2}\/\d{2}\/\d{4}$/.test(date) || /^\d{4}-\d{2}-\d{2}$/.test(date);
            
            if (isDate && label) {
              if (hasDebitCredit) {
                // Format CA : Date;Libellé;Débit;Crédit
                const debit = parseFloat((fields[2] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
                const credit = parseFloat((fields[3] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
                records.push({ date, label, debit, credit });
              } else {
                // Format simple : Date;Libellé;Montant
                const amount = parseFloat((fields[2] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
                records.push({ date, label, debit: amount < 0 ? Math.abs(amount) : 0, credit: amount > 0 ? amount : 0 });
              }
            }
          }
          current = "";
        } else {
          current += ch;
        }
      }
      
      // 4. Convertir en format attendu (montant = crédit - débit pour avoir + pour les recettes)
      const EXTERNAL_KEYWORDS = [
        "VIR SEPA EMIS", "VIR PERM", "VIREMENT EMIS", "VIRT EMIS",
        "PRLV SEPA", "PRELEVEMENT", "CHEQUE EMIS", "REMISE CHEQUE",
        "FRAIS", "COTISATION", "ABONNEMENT", "ASSURANCE",
      ];
      const parsed = records.map(r => ({
        date: r.date,
        label: r.label,
        amount: Math.round((r.credit - r.debit) * 100) / 100,
        matched: false,
        matchType: "" as string,
        matchDetail: "" as string,
      })).filter(r => {
        if (r.amount <= 0) return false; // exclure les débits
        const labelUp = r.label.toUpperCase();
        // Exclure les virements sortants vers comptes externes
        if (EXTERNAL_KEYWORDS.some(k => labelUp.includes(k))) return false;
        return true;
      });

      // Smart matching amélioré
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

        // Parse la date de la ligne bancaire (formats : DD/MM/YYYY ou YYYY-MM-DD)
        const parseBankDate = (s: string): Date | null => {
          if (!s) return null;
          const p1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (p1) return new Date(`${p1[3]}-${p1[2]}-${p1[1]}`);
          const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (p2) return new Date(s);
          return null;
        };
        const bankDate = parseBankDate(bl.date);

        // Encaissements de la période, avec leur date
        const periodEnc = encaissementsCompta.filter(e => {
          const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
          if (!d) return false;
          const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return pm === period;
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
        // CAWL verse les fonds ~2-7 jours après les paiements, regroupés,
        // net de commissions (~2.9% + 0.25€). On cherche dans une fenêtre large.
        if (label.includes("STRIPE") || label.includes("STP")) {
          const cbEncs = periodEnc.filter(e =>
            e.mode === "cb_online" || e.mode === "cb_cawl"
          );

          // a) Match exact (montant identique, rare mais possible)
          const exactCb = cbEncs.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (exactCb) {
            return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `CB en ligne ${exactCb.familyName} — ${exactCb.montant?.toFixed(2)}€` };
          }

          // b) Total CB en ligne de la période (payout global)
          const cbTotal = cbEncs.reduce((s, e) => s + (e.montant || 0), 0);
          if (cbTotal > 0 && Math.abs(cbTotal - bl.amount) < 0.02) {
            return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbEncs.length} transaction(s) = ${cbTotal.toFixed(2)}€` };
          }

          // c) Total CB en ligne net de commissions
          if (cbTotal > 0) {
            const estimatedFees = cbEncs.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
            const cbNet = Math.round((cbTotal - estimatedFees) * 100) / 100;
            if (Math.abs(cbNet - bl.amount) < 1.00) { // tolérance 1€ sur les commissions
              return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbEncs.length} tx = ${cbTotal.toFixed(2)}€ brut − ~${estimatedFees.toFixed(2)}€ frais ≈ ${cbNet.toFixed(2)}€` };
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
              return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbWindow.length} tx (J-2 à J-14) = ${windowTotal.toFixed(2)}€` };
            }
            // Net de commissions
            if (windowTotal > 0) {
              const wFees = cbWindow.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
              const wNet = Math.round((windowTotal - wFees) * 100) / 100;
              if (Math.abs(wNet - bl.amount) < 1.00) {
                return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbWindow.length} tx = ${windowTotal.toFixed(2)}€ − ~${wFees.toFixed(2)}€ frais` };
              }
            }
          }
        }

        // ── 2. CB terminal — matching agrégat par jour ───────────────────
        // La banque remet en 1 virement le total CB d'une journée (J-1, J-2, etc.)
        if (label.includes("REMISE") || label.includes("CB") || label.includes("TPE") || label.includes("CARTE")) {
          const cbEncs = periodEnc.filter(e => e.mode === "cb_terminal");

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
              return {
                ...bl, matched: true, matchType: "CB Terminal",
                matchDetail: `${dayData.count} transaction(s) CB du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
                matchedEncs: dayData.encs.map(encToDetail),
              };
            }
          }

          // c) Agrégat multi-jours : somme de 2-3 jours consécutifs
          const sortedDays = Object.keys(cbByDay).sort();
          for (let i = 0; i < sortedDays.length; i++) {
            let runningTotal = 0;
            let runningCount = 0;
            const startDay = sortedDays[i];
            for (let j = i; j < Math.min(i + 3, sortedDays.length); j++) {
              runningTotal += cbByDay[sortedDays[j]].total;
              runningCount += cbByDay[sortedDays[j]].count;
              const roundedTotal = Math.round(runningTotal * 100) / 100;
              if (Math.abs(roundedTotal - bl.amount) < 0.02) {
                const days = sortedDays.slice(i, j + 1).map(d => d.split("-")[2] + "/" + d.split("-")[1]).join(", ");
                const allEncs = sortedDays.slice(i, j + 1).flatMap(d => cbByDay[d].encs);
                return {
                  ...bl, matched: true, matchType: "CB Terminal",
                  matchDetail: `Agrégat ${runningCount} CB (${days}) = ${roundedTotal.toFixed(2)}€`,
                  matchedEncs: allEncs.map(encToDetail),
                };
              }
            }
          }

          // d) Dernier recours : match exact montant unitaire
          const exactCB = cbEncs.filter(inWindow).find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
          if (exactCB) {
            return { ...bl, matched: true, matchType: "CB Terminal", matchDetail: `CB ${exactCB.familyName} — ${exactCB.activityTitle || ""}` };
          }
        }

        // ── 3. Virement / SEPA / Prélèvement ──────────────────────────────
        if (label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV")) {
          // a) Match individuel virement/sepa par montant exact
          const match = periodEnc.filter(inWindow).find(e =>
            (e.mode === "virement" || e.mode === "sepa" || e.mode === "prelevement_sepa") && Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (match) return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${match.familyName}` };

          // b) Match virement par nom de famille dans le libellé bancaire
          // Ex: "VIR DUPONT MARIE" → chercher famille "Dupont" dans les paiements virement en attente
          const virPayments = payments.filter(p =>
            p.paymentMode === "virement" && (p.status === "pending" || p.status === "partial")
          );
          const nameMatch = virPayments.find(p => {
            if (!p.familyName) return false;
            // Normaliser : "Dupont Marie" → ["DUPONT", "MARIE"]
            const nameParts = p.familyName.toUpperCase().split(/\s+/).filter((n: string) => n.length > 2);
            return nameParts.some((part: string) => label.includes(part));
          });
          if (nameMatch) {
            const amountClose = Math.abs((nameMatch.totalTTC || 0) - bl.amount) < 0.02;
            return {
              ...bl, matched: true, matchType: "Virement",
              matchDetail: `Virement ${nameMatch.familyName}${amountClose ? "" : ` ⚠️ montant: attendu ${nameMatch.totalTTC?.toFixed(2)}€, reçu ${bl.amount.toFixed(2)}€`}`,
              manualPaymentId: nameMatch.id,
            };
          }

          // c) Match par montant exact sur TOUS les paiements virement (même sans fenêtre)
          const allVirMatch = payments.find(p =>
            p.paymentMode === "virement" && Math.abs((p.totalTTC || 0) - bl.amount) < 0.02
          );
          if (allVirMatch) return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${allVirMatch.familyName}`, manualPaymentId: allVirMatch.id };

          // b) Match remise SEPA (somme des prélèvements groupés)
          if (label.includes("PRLV") || label.includes("SEPA")) {
            const remiseMatch = remisesSepa.find(r =>
              Math.abs(r.montantTotal - bl.amount) < 0.02 &&
              r.datePrelevement?.startsWith(period)
            );
            if (remiseMatch) return { ...bl, matched: true, matchType: "Prélèvement SEPA", matchDetail: `Remise SEPA n°${remiseMatch.numero} — ${remiseMatch.nbTransactions} prélèvements` };
          }
        }

        // ── 4. Chèque ─────────────────────────────────────────────────────
        if (label.includes("CHQ") || label.includes("CHEQUE") || label.includes("REMISE CHQ")) {
          const allChqEncs = periodEnc.filter(e => e.mode === "cheque");

          // a) Chèque unitaire (montant exact)
          const match = allChqEncs.filter(inWindow).find(e =>
            Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (match) return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName}` };

          // b) Remise chèques groupée — total de TOUS les chèques du mois
          const totalMois = Math.round(allChqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
          if (totalMois > 0 && Math.abs(totalMois - bl.amount) < 0.02) {
            return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${allChqEncs.length} chèque(s) du mois = ${totalMois.toFixed(2)}€`, matchedEncs: allChqEncs.map(encToDetail) };
          }

          // c) Remise partielle (sous-ensemble par semaine ou par fenêtre ±3j)
          for (let w = 1; w <= 7; w++) {
            const chqEncs = allChqEncs.filter(e => {
              if (!bankDate) return true;
              const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
              return d && Math.abs(bankDate.getTime() - d.getTime()) / (1000*60*60*24) <= w;
            });
            const chqTotal = Math.round(chqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
            if (chqTotal > 0 && Math.abs(chqTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${chqEncs.length} chèque(s) = ${chqTotal.toFixed(2)}€`, matchedEncs: chqEncs.map(encToDetail) };
            }
          }
        }

        // ── 5. Espèces ────────────────────────────────────────────────────
        if (label.includes("ESP") || label.includes("VERSEMENT")) {
          for (const [day, modes] of Object.entries(dailyTotals)) {
            const espTotal = (modes as any)["especes"] || 0;
            if (espTotal > 0 && Math.abs(espTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "Espèces", matchDetail: `Dépôt espèces du ${day}` };
            }
          }
        }

        // ── 6. Montant exact toutes modes ─────────────────────────────────
        // Dernier recours : trouver un encaissement de même montant dans la fenêtre
        const exactMatch = periodEnc.filter(inWindow).find(e =>
          Math.abs((e.montant || 0) - bl.amount) < 0.02
        );
        if (exactMatch) {
          return { ...bl, matched: true, matchType: "Montant exact", matchDetail: `${exactMatch.familyName} — ${exactMatch.activityTitle || ""}` };
        }

        return bl;
      });

      setBankLines(matched as any);

      // Sauvegarder dans Firestore
      try {
        await setDoc(doc(db, "rapprochements", period), {
          period,
          bankLines: matched.map((bl: any) => ({
            date: bl.date,
            label: bl.label,
            amount: bl.amount,
            matched: bl.matched,
            matchType: bl.matchType,
            matchDetail: bl.matchDetail,
            matchedEncs: bl.matchedEncs || null,
            manualPaymentId: bl.manualPaymentId || null,
          })),
          totalLines: matched.length,
          totalMatched: matched.filter((b: any) => b.matched).length,
          totalAmount: Math.round(matched.reduce((s: number, b: any) => s + b.amount, 0) * 100) / 100,
          updatedAt: serverTimestamp(),
        });
        console.log(`✅ Rapprochement ${period} sauvegardé (${matched.length} lignes)`);
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
            nbImpayés: filteredPayments.filter(p => p.status === "pending" || p.status === "partial").length,
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

  const tabs = [
    { id: "journal" as const, label: "Journal des ventes", icon: Receipt },
    { id: "tva" as const, label: "TVA", icon: Calculator },
    { id: "remise" as const, label: "Bordereaux remise", icon: Printer },
    { id: "rapprochement" as const, label: "Rapprochement", icon: Building2 },
    { id: "fec" as const, label: "Export FEC", icon: FileText },
    { id: "export" as const, label: "Export CSV", icon: Download },
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
      <div className="flex gap-2 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
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
        // Les anciennes remises n'ont que paymentIds : on les utilise pour
        // considérer tous les encaissements de ces payments comme déjà remis.
        const remisPaymentIdsLegacy = new Set(
          (remises || []).flatMap((r: any) => r.paymentIds || [])
        );

        const nonRemisEnc = (encaissementsCompta || []).filter((e: any) => {
          // Modes exclus des remises physiques
          if (["virement", "prelevement_sepa", "cb_online", "avoir"].includes(e.mode)) return false;
          // Montant positif uniquement (pas de remboursements)
          if ((e.montant || 0) <= 0) return false;
          // Déjà remis : soit marqué directement, soit via ancienne remise par payment
          if (e.remiseId) return false;
          if (remisEncaissementIds.has(e.id)) return false;
          if (e.paymentId && remisPaymentIdsLegacy.has(e.paymentId)) return false;
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

                {/* Liste des encaissements filtrée par mode */}
                <div className="flex flex-col gap-1 mb-4 max-h-[300px] overflow-y-auto">
                  {nonRemisEnc
                    .filter((e: any) => !remiseModeView || e.mode === remiseModeView)
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
                  const visibleEncs = nonRemisEnc.filter((e: any) => !remiseModeView || e.mode === remiseModeView);
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
                            <button onClick={e => { e.stopPropagation(); setPointageRemiseId(isPointing ? null : r.id); setPointageNote(r.pointeeNote || ""); }}
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
                          <div>
                            <label className="font-body text-xs text-slate-600 block mb-1">Note de rapprochement (optionnel)</label>
                            <input value={pointageNote} onChange={e => setPointageNote(e.target.value)}
                              placeholder="Ex: Vérifiée relevé BNP 15/03/2026, réf. VIR-12345..."
                              className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              await updateDoc(doc(db, "remises", r.id), {
                                pointee: !r.pointee,
                                pointeeDate: !r.pointee ? new Date().toISOString() : null,
                                pointeeNote: pointageNote.trim() || null,
                                updatedAt: serverTimestamp(),
                              });
                              setPointageRemiseId(null);
                              fetchData();
                            }} className={`font-body text-xs font-semibold px-4 py-2 rounded-lg border-none cursor-pointer text-white ${r.pointee ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}>
                              {r.pointee ? "Confirmer le dépointage" : "✓ Confirmer le pointage"}
                            </button>
                            <button onClick={() => setPointageRemiseId(null)}
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
            <p className="font-body text-xs text-slate-500 mb-3">Compatible Crédit Agricole, LCL, BNP, Société Générale (CSV avec séparateur point-virgule)</p>
            <label className="flex items-center gap-2 font-body text-sm font-semibold text-blue-500 bg-white px-5 py-3 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors inline-flex">
              <Upload size={16} /> Importer CSV
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
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
              {bankLines.map((bl, i) => (
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
                    {bl.matched && bl.matchType && <Badge color={bl.matchType === "Ignoré" ? "gray" : bl.matchType === "Manuel" ? "orange" : "blue"}>{bl.matchType}</Badge>}
                  </span>
                  <span className="w-20 text-center">
                    <Badge color={bl.matched ? "green" : "orange"}>{bl.matched ? "OK" : "À traiter"}</Badge>
                  </span>
                  <span className="w-20 text-center">
                    {!bl.matched && (
                      <div className="flex gap-1">
                        <button onClick={() => { setShowManualMatch(i); setManualSearch(""); }}
                          className="font-body text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-blue-100">
                          Pointer
                        </button>
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
                    {bl.matched && bl.matchType === "Manuel" && (
                      <button onClick={() => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "", manualPaymentId: undefined };
                        updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">
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
                <span className="font-semibold text-blue-800">{bankLines.length} lignes importées</span>
                <span><span className="text-green-600 font-semibold">{bankLines.filter((b) => b.matched).length} rapprochées</span> · <span className="text-orange-500 font-semibold">{bankLines.filter((b) => !b.matched).length} à traiter</span></span>
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
                        onClick={() => {
                          const updated = [...bankLines];
                          updated[showManualMatch!] = {
                            ...updated[showManualMatch!],
                            matched: true,
                            matchType: "Manuel",
                            matchDetail: `${p.familyName} — ${(p.totalTTC || 0).toFixed(2)}€ (${modeLabels[p.paymentMode] || p.paymentMode})`,
                            manualPaymentId: p.id,
                          };
                          updateAndSaveBankLines(updated);
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
    </div>
  );
}
