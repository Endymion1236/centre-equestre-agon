"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GaleriePhoto } from "@/hooks/useGaleriePhotos";

interface Props {
  photos: GaleriePhoto[];
  initialIndex: number;
  onClose: () => void;
  categoryLabel: string;
}

/**
 * Lightbox plein écran avec navigation flèches et miniatures en bas.
 *
 * Usage typique : la page galerie publique passe les photos d'une catégorie
 * et l'index sur lequel l'utilisateur a cliqué. La lightbox s'ouvre dessus
 * et permet de naviguer.
 *
 * Raccourcis clavier : ← → flèches, Esc pour fermer.
 */
export default function GalerieLightbox({ photos, initialIndex, onClose, categoryLabel }: Props) {
  const [index, setIndex] = useState(initialIndex);

  const next = () => setIndex((i) => (i + 1) % photos.length);
  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  // Bloquer le scroll du body pendant l'ouverture
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (photos.length === 0) return null;
  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Header : titre catégorie + compteur + close */}
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="font-body text-sm">
          <span className="font-semibold">{categoryLabel}</span>
          <span className="text-white/60 ml-2">{index + 1} / {photos.length}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center bg-transparent border-none cursor-pointer text-white">
          <X size={24} />
        </button>
      </div>

      {/* Image principale + flèches */}
      <div className="flex-1 flex items-center justify-center relative px-2 sm:px-12 min-h-0">
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Précédent"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border-none cursor-pointer z-10">
            <ChevronLeft size={28} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.caption || "Photo galerie"}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Suivant"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border-none cursor-pointer z-10">
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Légende */}
      {current.caption && (
        <div className="px-6 py-3 text-center font-body text-sm text-white/90" onClick={(e) => e.stopPropagation()}>
          {current.caption}
        </div>
      )}

      {/* Miniatures */}
      {photos.length > 1 && (
        <div className="px-4 pb-4 pt-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2 overflow-x-auto justify-center">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all bg-transparent cursor-pointer p-0
                  ${i === index ? "border-white scale-105" : "border-transparent opacity-50 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
