"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Une photo de galerie stockée dans Firestore.
 *
 * - `category` : identifiant court de la catégorie (balades, stages, etc.)
 * - `url` : URL publique Firebase Storage (lien direct affichable dans <img>)
 * - `storagePath` : chemin interne Storage, sert à la suppression du fichier
 * - `caption` : légende optionnelle saisie par l'admin (vide string si non défini)
 * - `order` : entier pour le tri d'affichage. Plus petit = en premier.
 *   Convention : on alloue 1000, 2000, 3000... à l'upload pour pouvoir
 *   intercaler. La 1ère photo de chaque catégorie sert de couverture publique.
 * - `createdAt` / `uploadedBy` : traçabilité
 */
export interface GaleriePhoto {
  id: string;
  category: string;
  url: string;
  storagePath: string;
  caption: string;
  order: number;
  createdAt?: any;
  uploadedBy?: string;
}

/**
 * Souscrit en temps réel aux photos d'une catégorie, triées par `order` croissant.
 * Renvoie aussi un état de chargement et d'erreur. Si `category` est null/undefined,
 * le hook ne souscrit pas (utile pour conditionner côté admin).
 */
export function useGaleriePhotos(category: string | null | undefined) {
  const [photos, setPhotos] = useState<GaleriePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!category) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "galerie_photos"),
      where("category", "==", category),
      orderBy("order", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GaleriePhoto));
        setPhotos(list);
        setLoading(false);
      },
      (err) => {
        console.error("[useGaleriePhotos] erreur:", err);
        setError(err.message || "Erreur de chargement");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [category]);

  return { photos, loading, error };
}
