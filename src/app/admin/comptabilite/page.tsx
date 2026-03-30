"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Download, Upload, Check, FileText, Building2, Receipt, Calculator, Search, Printer, Plus, Sparkles, Bot } from "lucide-react";

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
  cb_terminal: "CB Terminal", cb_online: "Stripe", cheque: "Chèque", especes: "Espèces",
  cheque_vacances: "Chèques Vacances", pass_sport: "Pass'Sport", ancv: "ANCV",
  virement: "Virement", avoir: "Avoir",
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
  const [bankLines, setBankLines] = useState<{ date: string; label: string; amount: number; matched: boolean; matchType: string; matchDetail: string; manualPaymentId?: string }[]>([]);
  // Pointage manuel
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null); // index de la bankLine
  const [manualSearch, setManualSearch] = useState("");

  const [encaissementsCompta, setEncaissementsCompta] = useState<any[]>([]);

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
  };

  useEffect(() => { fetchData(); }, []);

  // Filter by period
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if ((p as any).status === "cancelled") return false;
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
    reader.onload = (ev) => {
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
      const parsed = records.map(r => ({
        date: r.date,
        label: r.label,
        amount: Math.round((r.credit - r.debit) * 100) / 100,
        matched: false,
        matchType: "" as string,
        matchDetail: "" as string,
      })).filter(r => r.amount > 0); // Ne garder que les recettes (encaissements reçus)

      // Smart matching amélioré
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

        // ── 1. Stripe payout ──────────────────────────────────────────────
        if (label.includes("STRIPE") || label.includes("STP")) {
          const stripeTotal = filteredPayments
            .filter(p => p.paymentMode === "cb_online")
            .reduce((s, p) => s + (p.totalTTC || 0), 0);
          if (bl.amount > 0 && stripeTotal > 0) {
            return { ...bl, matched: true, matchType: "Stripe", matchDetail: `Virement Stripe (${stripeTotal.toFixed(2)}€)` };
          }
        }

        // ── 2. CB terminal — matching agrégat ─────────────────────────────
        // Ta banque remet en 1 virement le total CB de la journée (J, J+1 ou J+2)
        if (label.includes("REMISE") || label.includes("CB") || label.includes("TPE") || label.includes("CARTE") || label.includes("PAIEMENT")) {
          const cbEncs = periodEnc.filter(e => e.mode === "cb_terminal");

          // a) Essai fenêtre ±3 jours
          for (let window = 0; window <= 3; window++) {
            const encsInWindow = cbEncs.filter(e => {
              if (!bankDate) return true;
              const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
              if (!d) return false;
              const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
              return diff <= window;
            });
            const windowTotal = encsInWindow.reduce((s, e) => s + (e.montant || 0), 0);
            if (windowTotal > 0 && Math.abs(windowTotal - bl.amount) < 0.02) {
              const dayLabel = window === 0 ? "même jour" : `J+${window}`;
              return {
                ...bl, matched: true, matchType: "CB Terminal",
                matchDetail: `${encsInWindow.length} transaction(s) CB sur ${dayLabel} = ${windowTotal.toFixed(2)}€`,
              };
            }
          }

          // b) Matching agrégat sur toute la période — trouver un sous-ensemble dont la somme = bl.amount
          // (on ne teste que jusqu'à 15 encaissements pour les perfs)
          const cbSlice = cbEncs.slice(0, 15);
          const target = Math.round(bl.amount * 100);
          // Recherche gloutonne par date proche
          const sorted = [...cbSlice].sort((a, b) => {
            if (!bankDate) return 0;
            const da = a.date?.seconds ? Math.abs(new Date(a.date.seconds*1000).getTime() - bankDate.getTime()) : Infinity;
            const db2 = b.date?.seconds ? Math.abs(new Date(b.date.seconds*1000).getTime() - bankDate.getTime()) : Infinity;
            return da - db2;
          });
          let running = 0;
          const matched2: any[] = [];
          for (const e of sorted) {
            running += Math.round((e.montant || 0) * 100);
            matched2.push(e);
            if (running === target) {
              return {
                ...bl, matched: true, matchType: "CB Terminal",
                matchDetail: `Agrégat ${matched2.length} transaction(s) CB = ${bl.amount.toFixed(2)}€ (${matched2.map(e=>e.familyName).join(", ")})`,
              };
            }
            if (running > target) break;
          }
        }

        // ── 3. Virement / SEPA ────────────────────────────────────────────
        if (label.includes("VIR") || label.includes("SEPA")) {
          const match = periodEnc.filter(inWindow).find(e =>
            (e.mode === "virement" || e.mode === "sepa") && Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (match) return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${match.familyName}` };
        }

        // ── 4. Chèque ─────────────────────────────────────────────────────
        if (label.includes("CHQ") || label.includes("CHEQUE") || label.includes("REMISE CHQ")) {
          // Chèque unitaire
          const match = periodEnc.filter(inWindow).find(e =>
            e.mode === "cheque" && Math.abs((e.montant || 0) - bl.amount) < 0.02
          );
          if (match) return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName}` };
          // Remise chèques groupée ±3 jours
          for (let w = 0; w <= 3; w++) {
            const chqEncs = periodEnc.filter(e => {
              if (!bankDate) return e.mode === "cheque";
              const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
              return e.mode === "cheque" && d && Math.abs(bankDate.getTime() - d.getTime()) / (1000*60*60*24) <= w;
            });
            const chqTotal = chqEncs.reduce((s, e) => s + (e.montant || 0), 0);
            if (chqTotal > 0 && Math.abs(chqTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${chqEncs.length} chèque(s) J+${w} = ${chqTotal.toFixed(2)}€` };
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

      setBankLines(matched);
    };
    reader.readAsText(file, "ISO-8859-1"); // Encodage Crédit Agricole = Latin1
  };

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
      const res = await fetch("/api/ia", {
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
      const res = await fetch("/api/ia", {
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Comptabilité</h1>
        <div className="flex gap-2 items-center">
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
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: "CA HT", value: `${totalHT.toFixed(0)}€`, color: "text-blue-500" },
              { label: "TVA collectée", value: `${totalTVA.toFixed(0)}€`, color: "text-orange-500" },
              { label: "CA TTC (facturé)", value: `${totalTTC.toFixed(0)}€`, color: "text-blue-800" },
              { label: "Total encaissé", value: `${totalEncaisse.toFixed(0)}€`, color: "text-green-600" },
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
              <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
                <span className="flex-1">TOTAL</span>
                <span className="w-40"></span><span className="w-20"></span>
                <span className="w-16 text-right text-blue-800">{totalHT.toFixed(2)}€</span>
                <span className="w-16 text-right text-orange-500">{totalTVA.toFixed(2)}€</span>
                <span className="w-16 text-right text-blue-500">{totalTTC.toFixed(2)}€</span>
              </div>
            </>
          )}
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
        const paidPayments = payments.filter(p => p.status === "paid" && p.paidAmount > 0);
        const remisPaymentIds = (remises || []).flatMap((r: any) => r.paymentIds || []);
        const nonRemis = paidPayments.filter(p => !remisPaymentIds.includes(p.id) && !(p as any).remiseId);
        const nonRemisByMode: Record<string, typeof nonRemis> = {};
        nonRemis.forEach(p => {
          const m = p.paymentMode || "autre";
          if (!nonRemisByMode[m]) nonRemisByMode[m] = [];
          nonRemisByMode[m].push(p);
        });
        const totalNonRemis = nonRemis.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);

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
          <Card padding="md" className={totalNonRemis > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800">Encaissements à remettre</h3>
                <p className="font-body text-xs text-slate-500">{nonRemis.length} paiement{nonRemis.length > 1 ? "s" : ""} non encore inclus dans une remise</p>
              </div>
              {nonRemis.length > 0 && <span className="font-body text-xl font-bold text-orange-500">{totalNonRemis.toFixed(2)}€</span>}
            </div>
            {nonRemis.length === 0 ? (
              <p className="font-body text-sm text-green-600">✓ Tous les encaissements ont été remis en banque.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(nonRemisByMode).map(([mode, ps]) => {
                    const mTotal = ps.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
                    return (
                      <div key={mode} className="font-body text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                        <span className="text-slate-600">{modeLabels[mode] || mode} :</span>{" "}
                        <span className="font-semibold text-blue-800">{mTotal.toFixed(2)}€ ({ps.length})</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-1 mb-4 max-h-[300px] overflow-y-auto">
                  {nonRemis.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)).map(p => {
                    const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                    return (
                      <div key={p.id} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-white rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 min-w-[65px]">{d ? d.toLocaleDateString("fr-FR") : "—"}</span>
                          <Badge color="gray">{modeLabels[p.paymentMode] || p.paymentMode}</Badge>
                          <span className="text-blue-800 font-semibold">{p.familyName}</span>
                          <span className="text-slate-500">{(p.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 40)}</span>
                        </div>
                        <span className="font-semibold text-blue-500">{(p.paidAmount || p.totalTTC || 0).toFixed(2)}€</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "", label: "Tout remettre", color: "bg-blue-500 text-white" },
                    { id: "cb_terminal", label: "CB", color: "bg-blue-100 text-blue-800" },
                    { id: "cheque", label: "Chèques", color: "bg-orange-100 text-orange-800" },
                    { id: "especes", label: "Espèces", color: "bg-green-100 text-green-800" },
                    { id: "virement", label: "Virements", color: "bg-purple-100 text-purple-800" },
                  ].map(m => {
                    const toRemise = m.id ? nonRemis.filter(p => p.paymentMode === m.id) : nonRemis;
                    if (m.id && toRemise.length === 0) return null;
                    const remiseTotal = toRemise.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
                    return (
                      <button key={m.id || "all"} onClick={async () => {
                        if (!confirm(`Créer un bordereau de remise ?\n\n${toRemise.length} paiement(s) — ${remiseTotal.toFixed(2)}€${m.id ? ` (${m.label})` : ""}`)) return;
                        try {
                          const remiseRef = await addDoc(collection(db, "remises"), {
                            date: serverTimestamp(), paymentIds: toRemise.map(p => p.id),
                            paymentMode: m.id || "mixte", total: remiseTotal,
                            nbPaiements: toRemise.length, status: "created",
                            pointee: false, createdAt: serverTimestamp(),
                          });
                          for (const p of toRemise) await updateDoc(doc(db, "payments", p.id!), { remiseId: remiseRef.id });
                          fetchData();
                        } catch (e) { console.error(e); }
                      }} className={`font-body text-[11px] font-semibold ${m.color} px-3 py-2 rounded-lg border-none cursor-pointer`}>
                        {m.label} ({remiseTotal.toFixed(0)}€)
                      </button>
                    );
                  })}
                </div>
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
                  const rPayments = payments.filter(p => (r.paymentIds || []).includes(p.id));
                  const isEditing = editingRemiseId === r.id;
                  const isPointing = pointageRemiseId === r.id;

                  // Paiements éligibles à ajouter (pas encore dans une remise)
                  const addablePays = nonRemis.filter(p => {
                    if (editingRemiseSearch) {
                      const q = editingRemiseSearch.toLowerCase();
                      return p.familyName?.toLowerCase().includes(q) || (p.items||[]).some((i:any)=>i.activityTitle?.toLowerCase().includes(q));
                    }
                    return true;
                  }).slice(0, 20);

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
                            <span className="font-body text-xs text-slate-500">{rPayments.length} paiement{rPayments.length > 1 ? "s" : ""} · {modeLabels[r.paymentMode] || r.paymentMode || "Mixte"}</span>
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
                              const html = `<html><head><meta charset="utf-8"><title>Bordereau de remise</title><style>body{font-family:Arial;max-width:600px;margin:30px auto}h1{font-size:18px;color:#2050A0;border-bottom:2px solid #2050A0;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:left}th{font-size:11px;color:#999;text-transform:uppercase}.total{font-size:16px;font-weight:bold;color:#2050A0;text-align:right;margin-top:12px}.status{font-size:12px;color:${r.pointee?"#16a34a":"#d97706"};margin-top:4px;text-align:right}.footer{font-size:11px;color:#999;margin-top:30px}</style></head><body><h1>Bordereau de remise — ${rDate.toLocaleDateString("fr-FR")}</h1><p style="font-size:12px;color:#666">Centre Equestre d'Agon-Coutainville</p><table><thead><tr><th>Date</th><th>Client</th><th>Prestation</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead><tbody>${rPayments.map(p => { const pd = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR") : "—"; return `<tr><td>${pd}</td><td>${p.familyName||"—"}</td><td>${(p.items||[]).map((i: any)=>i.activityTitle).join(", ")||"—"}</td><td>${modeLabels[p.paymentMode]||p.paymentMode}</td><td style="text-align:right">${(p.paidAmount||p.totalTTC||0).toFixed(2)}€</td></tr>`; }).join("")}</tbody></table><div class="total">Total : ${(r.total || 0).toFixed(2)}€</div><div class="status">${r.pointee ? "✓ Remise pointée" : "Non pointée"}</div>${r.pointeeNote?`<div style="font-size:11px;color:#666;text-align:right">${r.pointeeNote}</div>`:""}<div class="footer">Imprimé le ${new Date().toLocaleDateString("fr-FR")} — Signature : _______________</div></body></html>`;
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

                          {/* Retirer des paiements */}
                          {rPayments.length > 0 && (
                            <div className="mb-3">
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Paiements inclus — cliquer pour retirer</div>
                              <div className="flex flex-col gap-1">
                                {rPayments.map(p => (
                                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 bg-sand rounded-lg">
                                    <div className="flex items-center gap-2 font-body text-xs">
                                      <Badge color="gray">{modeLabels[p.paymentMode] || p.paymentMode}</Badge>
                                      <span className="text-blue-800 font-semibold">{p.familyName}</span>
                                      <span className="text-slate-500">{(p.items||[]).map((i:any)=>i.activityTitle).join(", ").slice(0,35)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-body text-xs font-semibold text-blue-500">{(p.paidAmount||p.totalTTC||0).toFixed(2)}€</span>
                                      <button onClick={async () => {
                                        if (!confirm(`Retirer ${p.familyName} de cette remise ?`)) return;
                                        const newIds = (r.paymentIds||[]).filter((id:string)=>id!==p.id);
                                        const newTotal = newIds.reduce((s:number,id:string)=>{const pp=payments.find(x=>x.id===id);return s+(pp?.paidAmount||pp?.totalTTC||0);},0);
                                        await updateDoc(doc(db,"remises",r.id),{paymentIds:newIds,total:newTotal,nbPaiements:newIds.length,updatedAt:serverTimestamp()});
                                        await updateDoc(doc(db,"payments",p.id!),{remiseId:null});
                                        fetchData();
                                      }} className="font-body text-[10px] text-red-400 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100">
                                        − Retirer
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ajouter des paiements */}
                          {nonRemis.length > 0 && (
                            <div>
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ajouter un encaissement non remis</div>
                              <input value={editingRemiseSearch} onChange={e => setEditingRemiseSearch(e.target.value)}
                                placeholder="Rechercher une famille ou activité..."
                                className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 mb-2 bg-white focus:outline-none focus:border-blue-400" />
                              <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                                {addablePays.map(p => (
                                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-100 rounded-lg">
                                    <div className="flex items-center gap-2 font-body text-xs">
                                      <Badge color="gray">{modeLabels[p.paymentMode] || p.paymentMode}</Badge>
                                      <span className="text-blue-800 font-semibold">{p.familyName}</span>
                                      <span className="text-slate-500">{(p.items||[]).map((i:any)=>i.activityTitle).join(", ").slice(0,35)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-body text-xs font-semibold text-blue-500">{(p.paidAmount||p.totalTTC||0).toFixed(2)}€</span>
                                      <button onClick={async () => {
                                        const newIds = [...(r.paymentIds||[]), p.id];
                                        const newTotal = newIds.reduce((s:number,id:string)=>{const pp=payments.find(x=>x.id===id);return s+(pp?.paidAmount||pp?.totalTTC||0);},0);
                                        await updateDoc(doc(db,"remises",r.id),{paymentIds:newIds,total:newTotal,nbPaiements:newIds.length,updatedAt:serverTimestamp()});
                                        await updateDoc(doc(db,"payments",p.id!),{remiseId:r.id});
                                        fetchData();
                                      }} className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-green-100">
                                        + Ajouter
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <button onClick={() => setEditingRemiseId(null)}
                            className="mt-3 font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
                            ✓ Terminer la modification
                          </button>
                        </div>
                      )}

                      {/* Détail paiements (masqué si en édition) */}
                      {/* Détail paiements */}
                      {!isEditing && openRemiseId === r.id && (
                        <div className="mt-2">
                          {rPayments.map(p => {
                            const pd = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                            return (
                              <div key={p.id} className="flex justify-between py-1 font-body text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">{pd ? pd.toLocaleDateString("fr-FR") : "—"}</span>
                                  <Badge color="gray">{modeLabels[p.paymentMode] || p.paymentMode}</Badge>
                                  <span className="text-blue-800">{p.familyName}</span>
                                </div>
                                <span className="text-blue-500 font-semibold">{(p.paidAmount || p.totalTTC || 0).toFixed(2)}€</span>
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
          <Card padding="md" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              Importez votre relevé bancaire au format CSV pour rapprocher les mouvements avec vos encaissements. Les CB, Stripe, chèques et virements sont matchés automatiquement par montant. Cliquez sur "Pointer" pour les lignes non rapprochées.
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Importer un relevé bancaire</h3>
            <p className="font-body text-xs text-slate-500 mb-3">Format CSV attendu : Date;Libellé;Montant (séparateur point-virgule)</p>
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
                <div key={i} className={`px-5 py-3 border-b border-blue-500/8 flex items-center ${bl.matched ? "" : "bg-orange-50"}`}>
                  <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                  <div className="flex-1">
                    <div className="font-body text-sm text-blue-800">{bl.label}</div>
                    {bl.matched && bl.matchDetail && <div className="font-body text-xs text-green-600 mt-0.5">↳ {bl.matchDetail}</div>}
                  </div>
                  <span className="w-24 text-right font-body text-sm font-semibold text-green-600">{bl.amount.toFixed(2)}€</span>
                  <span className="w-28 text-center">
                    {bl.matched && bl.matchType && <Badge color="blue">{bl.matchType}</Badge>}
                  </span>
                  <span className="w-20 text-center">
                    <Badge color={bl.matched ? "green" : "orange"}>{bl.matched ? "OK" : "À traiter"}</Badge>
                  </span>
                  <span className="w-20 text-center">
                    {!bl.matched && (
                      <button onClick={() => { setShowManualMatch(i); setManualSearch(""); }}
                        className="font-body text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-blue-100">
                        Pointer
                      </button>
                    )}
                  </span>
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
                          setBankLines(updated);
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
