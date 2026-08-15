"use client";

/**
 * src/app/admin/comptabilite/OngletFec.tsx
 *
 * Onglet « Export FEC » : l'écran qui explique ce qu'on s'apprête à envoyer
 * au comptable et déclenche le téléchargement.
 *
 * L'écran est volontairement bavard (période, nombre d'écritures attendu,
 * liste des colonnes) : le FEC est une pièce réglementaire, et c'est le seul
 * endroit où l'on peut vérifier AVANT envoi qu'on exporte bien le bon mois.
 * La génération elle-même vit dans fec.ts.
 */

import { Card } from "@/components/ui";
import { Download } from "lucide-react";
import { accounts } from "./constants";
import type { Payment } from "./types";

export function OngletFec({
  period, filteredPayments, generateFEC,
}: {
  period: string;
  filteredPayments: Payment[];
  generateFEC: () => void;
}) {
  return (
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
  );
}
