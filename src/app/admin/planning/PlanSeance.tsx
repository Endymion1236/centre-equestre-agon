"use client";
/**
 * src/app/admin/planning/PlanSeance.tsx
 *
 * Plan de séance : la photo (ou le PDF) de ce que le moniteur a préparé pour
 * le cours, uploadée depuis le téléphone au bord de la carrière.
 *
 * Regroupe ici les trois morceaux qui n'ont de sens qu'ensemble : le hook qui
 * porte l'état et les écritures (upload Storage + référence sur le créneau),
 * l'encart d'aperçu, et la visionneuse plein écran.
 *
 * Garde-fou à ne pas défaire : on ne supprime JAMAIS le fichier du Storage.
 * Un plan peut être référencé par une note pédagogique de l'historique ;
 * l'effacer viderait des notes déjà écrites. Voir les commentaires en place.
 */

import { useState, useRef } from "react";
import { updateDoc, doc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Loader2, Camera, FileImage } from "lucide-react";

/**
 * État et actions du plan de séance. Le composant qui l'appelle garde la main
 * sur `planUrl`/`planType` : les notes pédagogiques en font un snapshot au
 * moment où elles sont écrites.
 */
export function usePlanSeance(creneau: any) {
  const [planUploading, setPlanUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxBlobUrl, setLightboxBlobUrl] = useState<string | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>((creneau as any).planSeanceUrl || null);
  const [planType, setPlanType] = useState<string | null>((creneau as any).planSeanceType || null);
  const planInputRef = useRef<HTMLInputElement>(null);

  const openLightbox = async () => {
    setLightbox(true);
    if (!planUrl) return;
    try {
      const resp = await fetch(planUrl, { mode: "cors" });
      if (!resp.ok) throw new Error("fetch failed");
      const blob = await resp.blob();
      // Convertir HEIC en affichable si besoin
      setLightboxBlobUrl(URL.createObjectURL(blob));
    } catch {
      // CORS bloqué → fallback sur URL directe dans un nouvel onglet
      setLightboxBlobUrl("cors_error:" + planUrl);
    }
  };

  const closeLightbox = () => {
    setLightbox(false);
    if (lightboxBlobUrl && lightboxBlobUrl.startsWith("blob:")) {
      URL.revokeObjectURL(lightboxBlobUrl);
    }
    setLightboxBlobUrl(null);
  };

  const uploadPlan = async (file: File) => {
    if (!creneau.id) return;
    setPlanUploading(true);
    try {
      // Accepter tous les formats image (HEIC iPhone inclus)
      const allowed = ["image/jpeg","image/png","image/webp","image/heic","image/heif","image/gif","application/pdf"];
      const isImage = file.type.startsWith("image/") || file.type === "";
      if (!isImage && !allowed.includes(file.type)) throw new Error("Format non supporté (JPG, PNG, HEIC, PDF)");
      if (file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 10 Mo)");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `plans-seance/${creneau.id}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);

      // Upload direct depuis le navigateur
      const snapshot = await uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });
      const url = await getDownloadURL(snapshot.ref);

      // ⚠️ NE PAS supprimer l'ancien fichier : il peut être référencé par une
      // note pédagogique dans l'historique. Le Storage garde donc tous les
      // plans (~quelques Mo par séance, négligeable). Pour la suppression
      // groupée, il faudra un script de nettoyage qui vérifie qu'aucune note
      // ne pointe vers un fichier avant de l'effacer.

      await updateDoc(doc(db, "creneaux", creneau.id), {
        planSeanceUrl: url,
        planSeancePath: path,
        planSeanceType: file.type,
        planSeanceUpdatedAt: new Date().toISOString(),
      });
      setPlanUrl(url);
      setPlanType(file.type);
    } catch (e: any) {
      alert(`Erreur upload : ${e.message}`);
    }
    setPlanUploading(false);
  };

  const deletePlan = async () => {
    if (!creneau.id || !confirm("Retirer le plan de séance courant ?\n\nLe fichier reste accessible dans l'historique des notes pédagogiques (si une note y fait référence).")) return;
    // ⚠️ On NE supprime PAS le fichier du Storage : il peut être référencé
    // par une note dans l'historique. Seule la référence courante est retirée.
    await updateDoc(doc(db, "creneaux", creneau.id), {
      planSeanceUrl: null,
      planSeancePath: null,
      planSeanceType: null,
    });
    setPlanUrl(null);
    setPlanType(null);
  };

  return {
    planUrl, planType, planUploading, planInputRef,
    uploadPlan, deletePlan,
    lightbox, lightboxBlobUrl, openLightbox, closeLightbox,
  };
}

export type EtatPlanSeance = ReturnType<typeof usePlanSeance>;

/** Encart « Plan de séance » de l'en-tête du panneau. */
export default function PlanSeance({ plan }: { plan: EtatPlanSeance }) {
  const { planUrl, planType, planUploading, planInputRef, uploadPlan, deletePlan, openLightbox } = plan;
  return (
          <div className="mt-3 pt-3 border-t border-blue-500/8">
            <div className="flex items-center justify-between mb-2">
              <span className="font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan de séance</span>
              {!planUploading && (
                <div className="flex gap-1.5">
                  {/* Bouton appareil photo */}
                  <label className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100">
                    <Camera size={12} /> Photo
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
                  </label>
                  {/* Bouton galerie / fichier */}
                  <label className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100">
                    <FileImage size={12} /> Galerie / PDF
                    <input ref={planInputRef} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
                  </label>
                </div>
              )}
              {planUploading && <div className="flex items-center gap-1.5 font-body text-xs text-blue-500"><Loader2 size={12} className="animate-spin" /> Upload...</div>}
            </div>

            {planUrl ? (
              <div className="relative group">
                {planType === "application/pdf" ? (
                  <a href={planUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl no-underline hover:bg-red-100">
                    <FileImage size={20} className="text-red-500 flex-shrink-0" />
                    <div>
                      <div className="font-body text-sm font-semibold text-red-700">Plan de séance PDF</div>
                      <div className="font-body text-xs text-red-400">Cliquer pour ouvrir</div>
                    </div>
                  </a>
                ) : (
                  <button onClick={() => openLightbox()} className="w-full border-none p-0 bg-transparent cursor-zoom-in block">
                    <img src={planUrl} alt="Plan de séance" className="w-full rounded-xl object-cover max-h-48 hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                      <span className="font-body text-xs text-white bg-black/50 px-2 py-1 rounded-lg">🔍 Agrandir</span>
                    </div>
                  </button>
                )}
                <button onClick={deletePlan}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                  ✕
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                onClick={() => planInputRef.current?.click()}>
                <Camera size={20} className="text-slate-400 mx-auto mb-1" />
                <p className="font-body text-xs text-slate-500">Photo ou PDF du plan de séance</p>
                <p className="font-body text-[10px] text-slate-400 mt-0.5">Tous formats image · PDF · max 10 Mo</p>
              </div>
            )}
          </div>
  );
}

/** Visionneuse plein écran du plan (image seule ; le PDF s'ouvre en onglet). */
export function LightboxPlan({ plan }: { plan: EtatPlanSeance }) {
  const { lightbox, lightboxBlobUrl, closeLightbox } = plan;
  if (!lightbox) return null;
  return (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
          onClick={closeLightbox}>
          <div className="relative max-w-4xl max-h-full w-full" onClick={e => e.stopPropagation()}>
            {!lightboxBlobUrl ? (
              <div className="flex items-center justify-center h-64 text-white">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              </div>
            ) : lightboxBlobUrl.startsWith("cors_error:") ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-white text-center p-6">
                <div className="text-4xl">🔒</div>
                <p className="font-body text-sm">Aperçu bloqué par la politique CORS de Firebase Storage.</p>
                <a href={lightboxBlobUrl.replace("cors_error:", "")} target="_blank" rel="noopener noreferrer"
                  className="font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 px-4 py-2.5 rounded-xl no-underline">
                  Ouvrir dans un nouvel onglet →
                </a>
                <p className="font-body text-[10px] text-white/50">Solution définitive : configurer les règles CORS dans Firebase Storage</p>
              </div>
            ) : (
              <img src={lightboxBlobUrl} alt="Plan de séance"
                className="w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            )}
            <button onClick={closeLightbox}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center border-none cursor-pointer hover:bg-black/80 text-lg">
              ✕
            </button>
            {lightboxBlobUrl && (
              <a href={lightboxBlobUrl} download="plan-seance" target="_blank" rel="noopener noreferrer"
                className="absolute bottom-3 right-3 flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-black/60 hover:bg-black/80 px-3 py-2 rounded-lg no-underline">
                ⬇ Télécharger
              </a>
            )}
          </div>
        </div>
  );
}
