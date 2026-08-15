"use client";
/**
 * src/app/admin/paiements/SaisieChequesDiffres.tsx
 *
 * La grille de saisie des chèques différés du panier : N chèques, chacun
 * avec son numéro, sa banque, son montant et sa date de dépôt prévue.
 *
 * L'écart entre le total saisi et le total du panier est affiché en
 * permanence, en rouge dès un centime de différence : un chèque oublié ou
 * un montant mal recopié, et la famille repart avec une commande qui ne
 * sera jamais soldée.
 *
 * Le bouton « Répartir » s'appuie sur `repartirEnParts` : le reliquat de
 * centimes est ajouté aux premières parts, de sorte que la somme des
 * chèques fasse EXACTEMENT le total du panier. Trois chèques de 33,33€
 * pour 100€ laisseraient un centime dû à vie.
 *
 * Sorti de TabEncaisser : c'est une grille de formulaire autonome, elle ne
 * touche qu'à sa propre liste de lignes.
 */

import React from "react";
import { X } from "lucide-react";
import { safeNumber } from "@/lib/utils";
import { repartirEnParts } from "./calculs-paiement";
import type { ChequeDiffereSaisi } from "./types-etat";

interface SaisieChequesDiffresProps {
  chequesDiffres: ChequeDiffereSaisi[];
  setChequesDiffres: (v: ChequeDiffereSaisi[]) => void;
  basketTotal: number;
}

export function SaisieChequesDiffres({ chequesDiffres, setChequesDiffres, basketTotal }: SaisieChequesDiffresProps) {
  const totalChq = chequesDiffres.reduce((s, c) => s + safeNumber(c.montant), 0);
  const ecart = Math.round((totalChq - basketTotal) * 100) / 100;
  const ecartAbs = Math.abs(ecart);
  return (
    <div className="mb-4 border border-orange-200 rounded-xl p-3 bg-orange-50">
      <div className="flex items-center justify-between mb-3">
        <div className="font-body text-xs font-semibold text-orange-800">
          📅 Saisie des chèques différés ({chequesDiffres.length})
        </div>
        <div className="font-body text-xs text-orange-700">
          Total saisi : <span className="font-bold">{totalChq.toFixed(2)}€</span> / {basketTotal.toFixed(2)}€
          {ecartAbs > 0.01 && (
            <span className="ml-2 text-red-600">
              (écart : {ecart > 0 ? "+" : ""}{ecart.toFixed(2)}€)
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {chequesDiffres.map((chq, idx) => (
          <div key={idx} className="flex gap-2 items-center bg-white rounded-lg p-2">
            <input
              value={chq.numero}
              onChange={e => {
                const u = [...chequesDiffres]; u[idx].numero = e.target.value; setChequesDiffres(u);
              }}
              placeholder="N° chèque"
              className="w-28 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
            />
            <input
              value={chq.banque}
              onChange={e => {
                const u = [...chequesDiffres]; u[idx].banque = e.target.value; setChequesDiffres(u);
              }}
              placeholder="Banque"
              className="flex-1 min-w-0 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
            />
            <input
              value={chq.montant}
              onChange={e => {
                const u = [...chequesDiffres]; u[idx].montant = e.target.value; setChequesDiffres(u);
              }}
              type="number" step="0.01" placeholder="Montant"
              className="w-24 px-2 py-1.5 rounded border border-gray-200 font-body text-xs text-right focus:outline-none focus:border-orange-400"
            />
            <input
              value={chq.dateEncaissementPrevue}
              onChange={e => {
                const u = [...chequesDiffres]; u[idx].dateEncaissementPrevue = e.target.value; setChequesDiffres(u);
              }}
              type="date"
              className="w-36 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
            />
            {chequesDiffres.length > 1 && (
              <button
                onClick={() => setChequesDiffres(chequesDiffres.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            // Ajouter un chèque en pré-remplissant le montant avec le solde restant
            const reste = Math.max(0, Math.round((basketTotal - totalChq) * 100) / 100);
            // Prochaine date = +1 mois par rapport au dernier chèque saisi
            const lastDate = chequesDiffres[chequesDiffres.length - 1]?.dateEncaissementPrevue;
            let nextDate = new Date().toISOString().split("T")[0];
            if (lastDate) {
              const d = new Date(lastDate);
              d.setMonth(d.getMonth() + 1);
              nextDate = d.toISOString().split("T")[0];
            }
            setChequesDiffres([...chequesDiffres, { numero: "", banque: "", montant: reste > 0 ? reste.toFixed(2) : "", dateEncaissementPrevue: nextDate }]);
          }}
          className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-orange-100">
          + Ajouter un chèque
        </button>
        <button
          onClick={() => {
            // Répartir le total en N chèques égaux (prochain mois par mois)
            const n = chequesDiffres.length;
            if (n === 0) return;
            const baseDate = chequesDiffres[0]?.dateEncaissementPrevue || new Date().toISOString().split("T")[0];
            const parts = repartirEnParts(basketTotal, n);
            const updated = chequesDiffres.map((c, i) => {
              const d = new Date(baseDate);
              d.setMonth(d.getMonth() + i);
              return {
                ...c,
                montant: parts[i].toFixed(2),
                dateEncaissementPrevue: d.toISOString().split("T")[0],
              };
            });
            setChequesDiffres(updated);
          }}
          className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-orange-100">
          ⚖️ Répartir {basketTotal.toFixed(2)}€ en {chequesDiffres.length} chèque{chequesDiffres.length > 1 ? "s" : ""} égaux
        </button>
      </div>
    </div>
  );
}
