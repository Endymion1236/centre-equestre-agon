"use client";

/**
 * Boîte de dialogue de confirmation applicative.
 *
 * Remplace `window.confirm()` là où une action est IRRÉVERSIBLE — conversion
 * d'une proforma en facture définitive, annulation de facture, dépôt d'un
 * chèque en banque, création ou défaite d'un bordereau de remise (audit
 * 29/08/2026, W2).
 *
 * Pourquoi ça compte ici plutôt qu'ailleurs : `window.confirm` bloque
 * l'onglet, ne se style pas, s'affiche avec l'URL du site en en-tête, et sur
 * mobile certains navigateurs proposent « empêcher cette page d'ouvrir
 * d'autres dialogues ». Une fois cette case cochée, `confirm()` renvoie
 * `false` SANS RIEN AFFICHER : le bouton ne fait plus rien, et personne ne
 * comprend pourquoi. Sur une opération comptable, c'est le pire des échecs —
 * silencieux et indistinguable d'un bug.
 *
 * Usage (l'appelante doit être `async`) :
 *
 *   const confirmer = useConfirm();
 *   if (!(await confirmer({
 *     titre: "Convertir en facture définitive ?",
 *     details: ["Numéro séquentiel attribué", "Suppression impossible ensuite"],
 *     libelleConfirmer: "Convertir",
 *     danger: true,
 *   }))) return;
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface DemandeConfirmation {
  titre: string;
  /** Corps du message. Une ligne par élément. */
  details?: string[];
  libelleConfirmer?: string;
  libelleAnnuler?: string;
  /** Action destructrice ou irréversible → bouton rouge. */
  danger?: boolean;
}

type Resolveur = (accepte: boolean) => void;

const ConfirmContext = createContext<(d: DemandeConfirmation) => Promise<boolean>>(
  async () => false
);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [demande, setDemande] = useState<DemandeConfirmation | null>(null);
  const [resoudre, setResoudre] = useState<{ fn: Resolveur } | null>(null);

  const confirmer = useCallback((d: DemandeConfirmation) => {
    setDemande(d);
    return new Promise<boolean>((resolve) => setResoudre({ fn: resolve }));
  }, []);

  const repondre = (accepte: boolean) => {
    resoudre?.fn(accepte);
    setDemande(null);
    setResoudre(null);
  };

  return (
    <ConfirmContext.Provider value={confirmer}>
      {children}
      {demande && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-titre"
          onKeyDown={(e) => { if (e.key === "Escape") repondre(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-blue-500/10 p-5">
              {demande.danger && (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
              )}
              <h2 id="confirm-titre" className="font-body flex-1 text-base font-bold text-blue-900">
                {demande.titre}
              </h2>
              <button
                type="button"
                onClick={() => repondre(false)}
                aria-label="Fermer"
                className="cursor-pointer rounded border-none bg-transparent p-1 text-blue-900/40 hover:text-blue-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {demande.details && demande.details.length > 0 && (
              <div className="font-body space-y-1.5 p-5 text-sm text-blue-900/70">
                {demande.details.map((l, i) => (
                  <p key={i} className="m-0 whitespace-pre-line">{l}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-blue-500/10 p-4">
              <button
                type="button"
                onClick={() => repondre(false)}
                className="font-body cursor-pointer rounded-lg border border-blue-500/15 bg-white px-4 py-2 text-sm text-blue-900/70 hover:bg-cream"
              >
                {demande.libelleAnnuler || "Annuler"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => repondre(true)}
                className={`font-body cursor-pointer rounded-lg border-none px-4 py-2 text-sm font-bold text-white ${
                  demande.danger ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {demande.libelleConfirmer || "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
