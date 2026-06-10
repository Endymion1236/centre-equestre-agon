"use client";

// Onglet "fec" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { Download } from "lucide-react";
import { Card } from "@/components/ui";

export default function TabFEC(props: any) {
  const { filteredPayments, generateFEC, period } = props;
  return (
(
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
      )
  );
}
