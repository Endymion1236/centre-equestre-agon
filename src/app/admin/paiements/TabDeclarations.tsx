"use client";
import React, { useState } from "react";
import { Card } from "@/components/ui";
import {
  confirmerDeclarationPaiement,
  libelleModeDeclaration,
  rejeterDeclarationPaiement,
  type DeclarationPaiement,
} from "./declarations-actions";

interface TabDeclarationsProps {
  loading: boolean;
  payments: any[];
  declarations: any[];
  setDeclarations: React.Dispatch<React.SetStateAction<any[]>>;
  families: any[];
  avoirs: any[];
  broadcastSource: any | null;
  setBroadcastSource: React.Dispatch<React.SetStateAction<any | null>>;
  broadcastRows: any[];
  setBroadcastRows: React.Dispatch<React.SetStateAction<any[]>>;
  broadcastSearch: string;
  setBroadcastSearch: React.Dispatch<React.SetStateAction<string>>;
  broadcastSending: boolean;
  setBroadcastSending: React.Dispatch<React.SetStateAction<boolean>>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  refreshAll?: () => Promise<void>;
}

function classeMode(mode: string): string {
  if (mode === "cheque") return "bg-blue-50 text-blue-700";
  if (mode === "virement") return "bg-purple-50 text-purple-700";
  return "bg-green-50 text-green-700";
}

function iconeMode(mode: string): string {
  if (mode === "cheque") return "📝";
  if (mode === "virement") return "🏦";
  return "💵";
}

export function TabDeclarations(props: TabDeclarationsProps) {
  const { declarations, setDeclarations, toast, refreshAll } = props;
  const [confirmingDeclId, setConfirmingDeclId] = useState<string | null>(null);

  const retirerDeLaListe = (id: string) => {
    setDeclarations((previous) => previous.filter((declaration) => declaration.id !== id));
  };

  const rafraichir = async () => {
    if (!refreshAll) return;
    try {
      await refreshAll();
    } catch {
      // Le rafraîchissement visuel est non bloquant pour l'opération comptable.
    }
  };

  const confirmer = async (declaration: DeclarationPaiement) => {
    const mode = libelleModeDeclaration(declaration.mode).toLowerCase();
    if (!confirm(`Confirmer réception de ${declaration.montant.toFixed(2)}€ en ${mode} de ${declaration.familyName} ?`)) return;

    setConfirmingDeclId(declaration.id);
    try {
      const result = await confirmerDeclarationPaiement(declaration);
      if (result.dejaConfirmee) {
        toast("Déjà confirmé", "info");
        retirerDeLaListe(declaration.id);
        return;
      }

      retirerDeLaListe(declaration.id);
      await rafraichir();
      toast(`✅ Paiement de ${declaration.familyName} confirmé`, "success");
    } catch (error) {
      console.error("Erreur confirmation:", error);
      toast("Erreur lors de la confirmation", "error");
    } finally {
      setConfirmingDeclId(null);
    }
  };

  const rejeter = async (declaration: DeclarationPaiement) => {
    if (
      declaration.type === "inscription_annuelle" &&
      !confirm(`Rejeter cette inscription annuelle de ${declaration.familyName} ? La/les place(s) réservée(s) seront libérée(s).`)
    ) return;

    await rejeterDeclarationPaiement(declaration);
    retirerDeLaListe(declaration.id);
    await rafraichir();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-blue-800">Déclarations de paiement</h2>
        <span className="font-body text-xs text-slate-500">{declarations.length} en attente de confirmation</span>
      </div>

      {declarations.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="font-body text-sm text-slate-500">Aucune déclaration en attente.</p>
          <p className="font-body text-xs text-slate-400 mt-1">Les familles peuvent déclarer un paiement chèque ou espèces depuis leur espace.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {declarations.map((rawDeclaration: any) => {
            const declaration = rawDeclaration as DeclarationPaiement;
            const date = declaration.createdAt?.seconds
              ? new Date(declaration.createdAt.seconds * 1000)
              : new Date();
            const enCours = confirmingDeclId === declaration.id;

            return (
              <Card key={declaration.id} padding="md">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-body text-base font-bold text-blue-800">{declaration.familyName}</span>
                      <span className={`font-body text-xs font-semibold px-2 py-0.5 rounded-full ${classeMode(declaration.mode)}`}>
                        {iconeMode(declaration.mode)} {libelleModeDeclaration(declaration.mode)}
                      </span>
                    </div>
                    <div className="font-body text-sm text-slate-600">{declaration.activityTitle}</div>
                    {declaration.note && <div className="font-body text-xs text-slate-400 mt-1 italic">&quot;{declaration.note}&quot;</div>}
                    <div className="font-body text-xs text-slate-400 mt-1">
                      {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="font-body text-xl font-bold text-blue-500 mb-2">{(declaration.montant || 0).toFixed(2)}€</div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => void confirmer(declaration)}
                        className={`font-body text-xs font-semibold text-white px-4 py-2 rounded-lg border-none cursor-pointer ${enCours ? "bg-gray-400 cursor-not-allowed" : "bg-green-500 hover:bg-green-600"}`}
                      >
                        {enCours ? "⏳ Confirmation..." : "✓ Confirmer réception"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void rejeter(declaration)}
                        className="font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"
                      >
                        Rejeter
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
