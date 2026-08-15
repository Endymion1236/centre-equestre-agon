"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EcranDeclarationEnregistree.tsx
 *
 * Écran de fin affiché après une déclaration de règlement par chèque ou en
 * espèces — le seul cas où la famille ne repart pas vers un paiement en ligne.
 *
 * Sorti de `page.tsx` parce qu'il remplace toute la page (retour anticipé avant
 * le parcours d'étapes) et qu'il porte un message qu'il ne faut pas édulcorer :
 * la place n'est PAS acquise, elle est tenue provisoirement jusqu'à ce que le
 * centre encaisse le règlement. Une famille qui croit son inscription
 * confirmée et découvre le contraire à la rentrée, c'est le pire scénario de
 * cet écran.
 */

import { Card } from "@/components/ui";

export default function EcranDeclarationEnregistree({ declaredSuccess }: {
  declaredSuccess: { mode: "cheque" | "especes"; total: number; names: string };
}) {
  const modeLabel = declaredSuccess.mode === "cheque" ? "chèque" : "espèces";
  return (
    <div className="max-w-lg mx-auto">
      <Card padding="lg" className="text-center">
        <div className="text-5xl mb-3">📨</div>
        <h2 className="font-display text-xl font-bold text-blue-800 mb-2">Inscription enregistrée</h2>
        <p className="font-body text-sm text-gray-600 mb-1">
          {declaredSuccess.names} — <strong>{declaredSuccess.total.toFixed(2)}€</strong> par {modeLabel}.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 my-4 text-left">
          <p className="font-body text-sm text-amber-800 font-semibold mb-1">⏳ En attente de validation</p>
          <p className="font-body text-xs text-amber-700">
            La/les place(s) sont réservées provisoirement. Le centre équestre confirmera l&apos;inscription
            dès réception de votre règlement en {modeLabel}. Vous recevrez un email de confirmation.
          </p>
        </div>
        <a href="/espace-cavalier/reservations" className="no-underline">
          <button className="w-full py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
            Voir mes inscriptions
          </button>
        </a>
      </Card>
    </div>
  );
}
