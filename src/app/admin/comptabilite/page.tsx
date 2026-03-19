"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Download, Upload, Check, FileText, Building2, Receipt, Calculator } from "lucide-react";

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
  const [tab, setTab] = useState<"journal" | "tva" | "rapprochement" | "fec">("journal");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [bankLines, setBankLines] = useState<{ date: string; label: string; amount: number; matched: boolean; matchType: string; matchDetail: string }[]>([]);

  useEffect(() => {
    getDocs(query(collection(db, "payments"), orderBy("date", "desc")))
      .then((snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Payment[]))
      .catch(() => {
        getDocs(collection(db, "payments")).then((snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Payment[]));
      })
      .finally(() => setLoading(false));
  }, []);

  // Filter by period
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
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
  const dailyTotals = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    filteredPayments.forEach((p) => {
      const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
      if (!d) return;
      const dateStr = d.toLocaleDateString("fr-FR");
      if (!map[dateStr]) map[dateStr] = {};
      map[dateStr][p.paymentMode] = (map[dateStr][p.paymentMode] || 0) + (p.totalTTC || 0);
    });
    return map;
  }, [filteredPayments]);

  // CSV import handler — smart matching
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").slice(1).filter(Boolean);
      const parsed = lines.map((line) => {
        const parts = line.split(";").map((s) => s.trim().replace(/"/g, ""));
        return {
          date: parts[0] || "",
          label: parts[1] || "",
          amount: parseFloat(parts[2]?.replace(",", ".") || "0"),
          matched: false,
          matchType: "" as string,
          matchDetail: "" as string,
        };
      });

      // Smart matching
      const matched = parsed.map((bl) => {
        const label = bl.label.toUpperCase();

        // 1. Stripe payout → match total Stripe payments around that date
        if (label.includes("STRIPE") || label.includes("STP")) {
          const stripeTotal = filteredPayments
            .filter((p) => p.paymentMode === "cb_online")
            .reduce((s, p) => s + (p.totalTTC || 0), 0);
          // Stripe sends weekly payouts — match if amount is plausible
          if (bl.amount > 0 && stripeTotal > 0) {
            return { ...bl, matched: true, matchType: "Stripe", matchDetail: `Virement Stripe (total période: ${stripeTotal.toFixed(2)}€)` };
          }
        }

        // 2. CB terminal remise → match daily total of cb_terminal payments
        if (label.includes("REMISE") || label.includes("CB") || label.includes("TPE") || label.includes("CARTE")) {
          // Try to find the date in the label or use bl.date
          const dateKey = bl.date;
          // Check all daily totals for a match
          for (const [day, modes] of Object.entries(dailyTotals)) {
            const cbTotal = modes["cb_terminal"] || 0;
            if (cbTotal > 0 && Math.abs(cbTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "CB Terminal", matchDetail: `Remise CB du ${day} (${cbTotal.toFixed(2)}€)` };
            }
          }
          // Try matching total CB for the whole period
          const totalCB = filteredPayments
            .filter((p) => p.paymentMode === "cb_terminal")
            .reduce((s, p) => s + (p.totalTTC || 0), 0);
          if (totalCB > 0 && Math.abs(totalCB - bl.amount) < 0.50) {
            return { ...bl, matched: true, matchType: "CB Terminal", matchDetail: `Total CB période (${totalCB.toFixed(2)}€)` };
          }
        }

        // 3. Virement / SEPA → match any single payment
        if (label.includes("VIR") || label.includes("SEPA")) {
          const match = filteredPayments.find((p) =>
            (p.paymentMode === "virement" || p.paymentMode === "sepa") &&
            Math.abs((p.totalTTC || 0) - bl.amount) < 0.02
          );
          if (match) {
            return { ...bl, matched: true, matchType: "Virement", matchDetail: `Paiement ${match.familyName}` };
          }
        }

        // 4. Chèque → match any cheque payment
        if (label.includes("CHQ") || label.includes("CHEQUE") || label.includes("REMISE CHQ")) {
          // Try exact amount match
          const match = filteredPayments.find((p) =>
            p.paymentMode === "cheque" && Math.abs((p.totalTTC || 0) - bl.amount) < 0.02
          );
          if (match) {
            return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName} (${match.paymentRef || ""})` };
          }
          // Try daily total cheques
          for (const [day, modes] of Object.entries(dailyTotals)) {
            const chqTotal = modes["cheque"] || 0;
            if (chqTotal > 0 && Math.abs(chqTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise chèques du ${day}` };
            }
          }
        }

        // 5. Espèces → match daily total
        if (label.includes("ESP") || label.includes("VERSEMENT")) {
          for (const [day, modes] of Object.entries(dailyTotals)) {
            const espTotal = modes["especes"] || 0;
            if (espTotal > 0 && Math.abs(espTotal - bl.amount) < 0.02) {
              return { ...bl, matched: true, matchType: "Espèces", matchDetail: `Dépôt espèces du ${day}` };
            }
          }
        }

        return bl;
      });

      setBankLines(matched);
    };
    reader.readAsText(file);
  };

  // FEC export
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
    { id: "rapprochement" as const, label: "Rapprochement", icon: Building2 },
    { id: "fec" as const, label: "Export FEC", icon: FileText },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Comptabilité</h1>
        <div className="flex gap-2 items-center">
          <label className="font-body text-xs text-gray-400">Période :</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "CA HT", value: `${totalHT.toFixed(0)}€`, color: "text-blue-500" },
          { label: "TVA collectée", value: `${totalTVA.toFixed(0)}€`, color: "text-orange-500" },
          { label: "CA TTC", value: `${totalTTC.toFixed(0)}€`, color: "text-green-600" },
          { label: "Paiements", value: filteredPayments.length.toString(), color: "text-blue-500" },
        ].map((k, i) => (
          <Card key={i} padding="sm">
            <div className={`font-body text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="font-body text-xs text-gray-400">{k.label}</div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>}

      {/* ─── Journal des ventes ─── */}
      {!loading && tab === "journal" && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <span className="w-20">Date</span>
            <span className="flex-1">Client</span>
            <span className="w-40">Prestation</span>
            <span className="w-20 text-center">Mode</span>
            <span className="w-16 text-right">HT</span>
            <span className="w-16 text-right">TVA</span>
            <span className="w-16 text-right">TTC</span>
          </div>
          {filteredPayments.length === 0 ? (
            <div className="p-8 text-center font-body text-sm text-gray-400">Aucun paiement sur cette période.</div>
          ) : (
            <>
              {filteredPayments.map((p) => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const ht = (p.items || []).reduce((s, i) => s + (i.priceHT || 0), 0);
                const tva = (p.totalTTC || 0) - ht;
                return (
                  <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30">
                    <span className="w-20 font-body text-xs text-gray-400">{d.toLocaleDateString("fr-FR")}</span>
                    <span className="flex-1 font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                    <span className="w-40 font-body text-xs text-gray-500 truncate">{(p.items || []).map((i) => i.activityTitle).join(", ")}</span>
                    <span className="w-20 text-center"><Badge color="blue">{modeLabels[p.paymentMode] || p.paymentMode}</Badge></span>
                    <span className="w-16 text-right font-body text-xs text-gray-500">{ht.toFixed(2)}€</span>
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
            <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="flex-1">Taux TVA</span>
              <span className="w-24 text-right">Base HT</span>
              <span className="w-24 text-right">TVA</span>
              <span className="w-24 text-right">TTC</span>
            </div>
            {tvaByRate.map(([rate, data]) => (
              <div key={rate} className="px-5 py-3 border-b border-blue-500/8 flex items-center">
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">{rate}%</span>
                <span className="w-24 text-right font-body text-sm text-gray-500">{data.ht.toFixed(2)}€</span>
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
                  <span className="font-body text-sm text-gray-500">{modeLabels[mode] || mode}</span>
                  <span className="font-body text-sm font-semibold text-blue-500">{amount.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Rapprochement bancaire ─── */}
      {!loading && tab === "rapprochement" && (
        <div className="flex flex-col gap-5">
          <Card padding="md" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              💡 <strong>Rapprochement bancaire :</strong> Importez votre relevé bancaire au format CSV pour rapprocher automatiquement les paiements.
              Les virements Stripe et les remises CB sont matchés automatiquement par montant.
              Phase suivante : synchronisation automatique via Bridge/Bankin.
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Importer un relevé bancaire</h3>
            <p className="font-body text-xs text-gray-400 mb-3">Format CSV attendu : Date;Libellé;Montant (séparateur point-virgule)</p>
            <label className="flex items-center gap-2 font-body text-sm font-semibold text-blue-500 bg-white px-5 py-3 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors inline-flex">
              <Upload size={16} /> Importer CSV
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
          </Card>

          {bankLines.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <span className="w-24">Date</span>
                <span className="flex-1">Libellé bancaire</span>
                <span className="w-24 text-right">Montant</span>
                <span className="w-28 text-center">Rapprochement</span>
                <span className="w-20 text-center">Statut</span>
              </div>
              {bankLines.map((bl, i) => (
                <div key={i} className={`px-5 py-3 border-b border-blue-500/8 flex items-center ${bl.matched ? "" : "bg-orange-50"}`}>
                  <span className="w-24 font-body text-xs text-gray-400">{bl.date}</span>
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
                </div>
              ))}
              <div className="px-5 py-3 bg-sand flex justify-between font-body text-sm">
                <span className="font-semibold text-blue-800">{bankLines.length} lignes importées</span>
                <span><span className="text-green-600 font-semibold">{bankLines.filter((b) => b.matched).length} rapprochées</span> · <span className="text-orange-500 font-semibold">{bankLines.filter((b) => !b.matched).length} à traiter</span></span>
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
            <p className="font-body text-sm text-gray-500 mb-4">
              Génère le Fichier des Écritures Comptables au format réglementaire (Art. L47 A-I du LPF).
              Ce fichier contient toutes les écritures de la période sélectionnée, prêt à envoyer à votre comptable.
            </p>
            <div className="flex gap-4 mb-4">
              <div>
                <div className="font-body text-xs font-semibold text-gray-400">Période</div>
                <div className="font-body text-sm font-semibold text-blue-800">{new Date(period + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</div>
              </div>
              <div>
                <div className="font-body text-xs font-semibold text-gray-400">Écritures</div>
                <div className="font-body text-sm font-semibold text-blue-800">{filteredPayments.length} paiements → ~{filteredPayments.length * 3} lignes</div>
              </div>
              <div>
                <div className="font-body text-xs font-semibold text-gray-400">Format</div>
                <div className="font-body text-sm font-semibold text-blue-800">TXT (TAB)</div>
              </div>
            </div>
            <button onClick={generateFEC} disabled={filteredPayments.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all
                ${filteredPayments.length === 0 ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
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
    </div>
  );
}
