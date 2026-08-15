"use client";

/**
 * src/app/admin/sepa/OngletRemises.tsx
 *
 * Onglet « Remises » : l'historique des fichiers XML produits pour la banque,
 * avec re-téléchargement et passage à l'état « déposée ».
 *
 * Pourquoi séparé : c'est la trace de ce qui a réellement été envoyé au Crédit
 * Agricole. Le bouton « Déposée » n'est pas un simple changement d'étiquette —
 * c'est lui qui déclenche l'écriture des encaissements et la mise à jour des
 * paiements. Le garder dans un composant court, sans autre logique autour,
 * évite de le déclencher par mégarde en remaniant l'écran.
 */

import { Card, Badge } from "@/components/ui";
import { Download, Check, FileText } from "lucide-react";
import type { RemiseSepa } from "./types";

interface OngletRemisesProps {
  remises: RemiseSepa[];
  downloadRemise: (remise: RemiseSepa) => void;
  markDeposited: (remiseId: string) => void;
}

export function OngletRemises({ remises, downloadRemise, markDeposited }: OngletRemisesProps) {
  return (
    <div>
      <div className="font-body text-sm text-gray-400 mb-4">Historique des fichiers XML générés pour le Crédit Agricole</div>

      {remises.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Download size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-500">Aucune remise générée.</p>
          <p className="font-body text-xs text-gray-400 mt-2">Sélectionnez des échéances dans l&apos;onglet Échéancier pour créer votre première remise.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {remises.sort((a, b) => b.numero - a.numero).map(r => (
            <Card key={r.id} padding="md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                    <FileText size={22} className="text-purple-500" />
                  </div>
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">
                      Remise n°{r.numero} — {r.xmlFileName}
                    </div>
                    <div className="font-body text-xs text-gray-500 mt-0.5">
                      {r.nbTransactions} prélèvement{r.nbTransactions > 1 ? "s" : ""} · <strong>{r.montantTotal.toFixed(2)}€</strong> · Prélèvement le {new Date(r.datePrelevement).toLocaleDateString("fr-FR")}
                    </div>
                    <div className="font-body text-[10px] text-gray-400 mt-0.5">
                      Créée le {r.dateRemise ? new Date(r.dateRemise).toLocaleDateString("fr-FR") : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={r.status === "deposited" ? "green" : r.status === "generated" ? "blue" : "gray"}>
                    {r.status === "deposited" ? "Déposée" : r.status === "generated" ? "Générée" : "Brouillon"}
                  </Badge>
                  <button onClick={() => downloadRemise(r)}
                    className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                    <Download size={12} /> XML
                  </button>
                  {r.status === "generated" && (
                    <button onClick={() => markDeposited(r.id)}
                      className="flex items-center gap-1 font-body text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                      <Check size={12} /> Déposée
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
