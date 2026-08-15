"use client";
/**
 * src/app/admin/paiements/SelecteurFamille.tsx
 *
 * Étape 1 de l'encaissement : choisir la famille qui paie, puis le cavalier
 * concerné.
 *
 * Séparé du reste parce que ce choix commande tout l'écran — les impayés
 * affichés, les avoirs disponibles, le nom porté par la commande. Changer
 * de famille remet le cavalier à zéro : garder l'enfant de la famille
 * précédente ferait payer une prestation au nom d'un cavalier qui n'a rien
 * demandé.
 */

import React from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui";
import type { Family } from "@/types";
import { filtrerFamilles } from "./calculs-encaisser";
import { inputCls } from "./constantes-encaisser";

interface SelecteurFamilleProps {
  families: (Family & { firestoreId: string })[];
  familySearch: string;
  setFamilySearch: (v: string) => void;
  selectedFamily: string;
  setSelectedFamily: (v: string) => void;
  selectedFam: (Family & { firestoreId: string }) | undefined;
  selectedChild: string;
  setSelectedChild: (v: string) => void;
}

export function SelecteurFamille({
  families, familySearch, setFamilySearch, selectedFamily, setSelectedFamily,
  selectedFam, selectedChild, setSelectedChild,
}: SelecteurFamilleProps) {
  const children = selectedFam?.children || [];
  const filteredFamilies = filtrerFamilles(families, familySearch);

  return (
    <Card padding="md" className="mb-4">
      <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">1. Sélectionner la famille</h3>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="selectedFam-search-input" value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} placeholder="Rechercher..." className={`${inputCls} !pl-9`} />
      </div>
      <select value={selectedFamily} onChange={(e) => { setSelectedFamily(e.target.value); setSelectedChild(""); }} className={inputCls}>
        <option value="">Choisir une famille...</option>
        {filteredFamilies.map((f) => (
          <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} ({f.parentEmail})</option>
        ))}
      </select>
      {selectedFam && children.length > 0 && (
        <div className="mt-3">
          <div className="font-body text-xs font-semibold text-slate-600 mb-1">Cavalier</div>
          <div className="flex flex-wrap gap-2">
            {children.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedChild(c.id)}
                className={`px-3 py-1.5 rounded-lg border font-body text-xs font-medium cursor-pointer transition-all
                    ${selectedChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                🧒 {c.firstName}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
