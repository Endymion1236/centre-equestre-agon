"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ANNONCES_ACCUEIL, annoncesActives, type AnnonceAccueil } from "@/lib/annonces-accueil";

/**
 * Annonce ponctuelle en tête de l'accueil (lib/annonces-accueil). Calculée
 * dans le navigateur : la page peut être servie en cache, l'heure, elle,
 * est celle du visiteur au moment où il la lit.
 */
export default function AnnonceAccueilBandeau() {
  const [annonces, setAnnonces] = useState<AnnonceAccueil[]>([]);
  useEffect(() => { setAnnonces(annoncesActives(ANNONCES_ACCUEIL, new Date())); }, []);
  if (annonces.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-2">
      {annonces.map((a) => (
        <div key={a.debut + a.titre} role="status"
          className="flex max-w-2xl items-start gap-3 rounded-2xl border border-orange-300 bg-orange-50/95 px-4 py-3 text-left shadow-lg">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-orange-600" />
          <div>
            <div className="font-body text-sm font-bold text-orange-900">{a.titre}</div>
            <div className="font-body text-sm text-orange-900/90">{a.texte}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
