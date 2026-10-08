"use client";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { produitsAnnexes, type ProduitAnnexe, type TarifsAnnexes } from "@/lib/produits-annexes";

/**
 * Licence FFE et adhésion en un clic, au prix des réglages de l'inscription,
 * avec leur TVA et leur compte (lib/produits-annexes). Sert au panier
 * « Encaisser » et à la modification d'une commande.
 */
export function BoutonsProduitsAnnexes({ onAjouter, disabled }: { onAjouter: (p: ProduitAnnexe) => void; disabled?: boolean }) {
  const [tarifs, setTarifs] = useState<TarifsAnnexes | null>(null);
  useEffect(() => {
    let actif = true;
    getDoc(doc(db, "settings", "inscription"))
      .then(s => { if (actif) setTarifs(s.exists() ? (s.data() as TarifsAnnexes) : {}); })
      .catch(() => { if (actif) setTarifs({}); });
    return () => { actif = false; };
  }, []);
  if (!tarifs) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-body text-[10px] text-slate-400 uppercase tracking-wider mr-1">Produits</span>
      {produitsAnnexes(tarifs).map(p => (
        <button key={p.id} type="button" disabled={disabled} onClick={() => onAjouter(p)}
          title={`TVA ${String(p.tva).replace(".", ",")} % · compte ${p.compteComptable}`}
          className="font-body text-xs px-2.5 py-1 rounded-lg border border-blue-200 bg-white text-blue-800 cursor-pointer hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">
          + {p.label} · {p.priceTTC.toFixed(2).replace(".", ",")} €
        </button>
      ))}
    </div>
  );
}
