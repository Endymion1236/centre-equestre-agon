"use client";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { vitrineDefaults, VitrineData } from "@/lib/vitrine-defaults";

// Merge profond pour appliquer les valeurs Firestore par-dessus les defaults
function deepMerge(defaults: any, overrides: any): any {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] !== null && overrides[key] !== undefined) {
      if (typeof overrides[key] === "object" && !Array.isArray(overrides[key])) {
        result[key] = deepMerge(defaults[key] || {}, overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}

let cachedVitrine: VitrineData | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useVitrine() {
  const [vitrine, setVitrine] = useState<VitrineData>(cachedVitrine || vitrineDefaults);
  const [loading, setLoading] = useState(!cachedVitrine);

  useEffect(() => {
    if (cachedVitrine && Date.now() < cacheExpiry) {
      setVitrine(cachedVitrine);
      setLoading(false);
      return;
    }
    getDoc(doc(db, "settings", "vitrine"))
      .then(snap => {
        const data = snap.exists() ? deepMerge(vitrineDefaults, snap.data()) : vitrineDefaults;
        cachedVitrine = data;
        cacheExpiry = Date.now() + CACHE_TTL;
        setVitrine(data);
      })
      .catch(() => setVitrine(vitrineDefaults))
      .finally(() => setLoading(false));
  }, []);

  return { vitrine, loading };
}

// Pour les Server Components — appel direct sans hook
export async function getVitrine(): Promise<VitrineData> {
  try {
    const snap = await getDoc(doc(db, "settings", "vitrine"));
    if (!snap.exists()) return vitrineDefaults;
    return deepMerge(vitrineDefaults, snap.data()) as VitrineData;
  } catch {
    return vitrineDefaults;
  }
}
