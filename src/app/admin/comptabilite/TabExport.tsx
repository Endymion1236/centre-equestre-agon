"use client";

// Onglet "export" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { Download } from "lucide-react";
import { Card } from "@/components/ui";

export default function TabExport(props: any) {
  const { filteredPayments, payments, period } = props;
  return (
(
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
                      filteredPayments.forEach((p: any) => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                        (p.items || []).forEach((i: any) => {
                          csv += [d, p.familyName, i.activityTitle, (i.priceHT||0).toFixed(2), (i.tva||5.5), ((i.priceTTC||0)-(i.priceHT||0)).toFixed(2), (i.priceTTC||0).toFixed(2), p.paymentMode].join(sep) + "\n";
                        });
                      });
                    } else if (exp.id === "reglements") {
                      csv = "Date;Client;Montant;Mode;Référence\n";
                      filteredPayments.forEach((p: any) => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                        csv += [d, p.familyName, (p.totalTTC||0).toFixed(2), p.paymentMode, p.paymentRef||""].join(sep) + "\n";
                      });
                    } else {
                      csv = "Client;Total facturé;Total payé;Solde dû\n";
                      const byClient: Record<string, { facture: number; paye: number }> = {};
                      payments.forEach((p: any) => {
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
      )
  );
}
