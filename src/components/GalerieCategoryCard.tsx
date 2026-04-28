"use client";

import { useState } from "react";
import { useGaleriePhotos } from "@/hooks/useGaleriePhotos";
import { EditableImage } from "@/components/ui/EditableImage";
import GalerieLightbox from "@/components/GalerieLightbox";
import type { VitrineImageKey } from "@/hooks/useVitrineImages";
import { Camera } from "lucide-react";

interface Props {
  category: string;
  label: string;
  fallbackKey: VitrineImageKey;  // image vitrine de secours si aucune photo
}

/**
 * Carte d'une catégorie de galerie.
 *
 * - Si la catégorie contient des photos : la 1ère photo sert de couverture,
 *   un badge "N photos" s'affiche, et le clic ouvre une lightbox avec toutes
 *   les photos.
 * - Si la catégorie est vide : fallback sur l'EditableImage existant
 *   (la couverture configurée par l'admin via le système vitrine), sans
 *   action au clic. C'est la rétrocompatibilité avec l'ancienne galerie.
 */
export default function GalerieCategoryCard({ category, label, fallbackKey }: Props) {
  const { photos, loading } = useGaleriePhotos(category);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const cover = photos[0];
  const hasPhotos = photos.length > 0;

  return (
    <>
      <div
        className={`card !p-0 overflow-hidden transition-all ${hasPhotos ? "hover:shadow-lg hover:-translate-y-1 cursor-pointer" : ""}`}
        onClick={hasPhotos ? () => setLightboxIndex(0) : undefined}
      >
        <div className="relative h-44">
          {hasPhotos ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.url}
              alt={cover.caption || label}
              className="w-full h-full object-cover"
            />
          ) : (
            <EditableImage imageKey={fallbackKey} mode="img" label={`Photo ${label}`} className="h-44" alt={label} />
          )}
          {hasPhotos && (
            <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-body font-semibold flex items-center gap-1.5 backdrop-blur-sm">
              <Camera size={12} />
              {photos.length}
            </div>
          )}
        </div>
        <div className="p-5 text-center">
          <h3 className="font-display text-lg font-bold text-blue-800 mb-1">{label}</h3>
          <p className="font-body text-sm text-gray-400">
            {loading ? "..." : hasPhotos ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Photos à venir"}
          </p>
        </div>
      </div>

      {lightboxIndex !== null && (
        <GalerieLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          categoryLabel={label}
        />
      )}
    </>
  );
}
