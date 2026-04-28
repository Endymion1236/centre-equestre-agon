"use client";

import { useState, useMemo, useRef } from "react";
import { db, storage } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useAuth } from "@/lib/auth-context";
import { useGaleriePhotos, type GaleriePhoto } from "@/hooks/useGaleriePhotos";
import { Loader2, Upload, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, Pencil, Check, X } from "lucide-react";

// Catégories miroir de /galerie/page.tsx — l'ordre ici détermine l'ordre des onglets.
const CATEGORIES = [
  { id: "balades",      label: "Balades plage",  emoji: "🏖️" },
  { id: "stages",       label: "Stages",         emoji: "🐎" },
  { id: "competitions", label: "Compétitions",   emoji: "🏆" },
  { id: "miniferme",    label: "Mini-ferme",     emoji: "🐐" },
  { id: "club",         label: "Vie du club",    emoji: "🎉" },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

export default function AdminGaleriePage() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<CategoryId>("balades");
  const { photos, loading } = useGaleriePhotos(activeCategory);

  // Map: filename -> 0-100 (%) ou "done" / message d'erreur
  const [uploads, setUploads] = useState<Record<string, number | "done" | string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Édition de légende inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState("");

  const activeMeta = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCategory)!,
    [activeCategory]
  );

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;

    // Calculer un order de départ supérieur au max actuel pour que les nouvelles
    // photos arrivent en fin de liste. On laisse 1000 d'écart pour intercaler.
    const maxOrder = photos.reduce((m, p) => Math.max(m, p.order || 0), 0);
    let nextOrder = maxOrder + 1000;

    // Upload séquentiel pour éviter de saturer la connexion / faire flipper
    // le rate limit Storage. Pour 5-10 photos c'est très rapide quand même.
    for (const file of Array.from(files)) {
      // Validation : taille max 10 Mo, type image
      if (!file.type.startsWith("image/")) {
        setUploads((u) => ({ ...u, [file.name]: "Format non image" }));
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploads((u) => ({ ...u, [file.name]: "Trop gros (>10 Mo)" }));
        continue;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `galerie/${activeCategory}/${photoId}.${ext}`;
      const storageRef = ref(storage, storagePath);

      try {
        setUploads((u) => ({ ...u, [file.name]: 0 }));
        const task = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setUploads((u) => ({ ...u, [file.name]: pct }));
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const url = await getDownloadURL(task.snapshot.ref);

        await addDoc(collection(db, "galerie_photos"), {
          category: activeCategory,
          url,
          storagePath,
          caption: "",
          order: nextOrder,
          createdAt: serverTimestamp(),
          uploadedBy: user.uid,
        });
        nextOrder += 1000;
        setUploads((u) => ({ ...u, [file.name]: "done" }));
      } catch (e: any) {
        console.error("Upload échoué:", e);
        setUploads((u) => ({ ...u, [file.name]: `Erreur: ${e?.message || e}` }));
      }
    }

    // Vider le file input pour permettre de réuploader le même fichier après suppression
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Faire disparaître les uploads "done" après 3s
    setTimeout(() => {
      setUploads((u) => {
        const cleaned: typeof u = {};
        for (const [k, v] of Object.entries(u)) {
          if (v !== "done") cleaned[k] = v;
        }
        return cleaned;
      });
    }, 3000);
  };

  const handleDelete = async (photo: GaleriePhoto) => {
    if (!confirm(`Supprimer cette photo${photo.caption ? ` (« ${photo.caption} »)` : ""} ?`)) return;
    try {
      // Supprimer d'abord Firestore (visible immédiatement), puis Storage en best effort
      await deleteDoc(doc(db, "galerie_photos", photo.id));
      try {
        await deleteObject(ref(storage, photo.storagePath));
      } catch (storageErr) {
        // Le doc Firestore est déjà supprimé, c'est l'essentiel. On log juste.
        console.warn("Suppression Storage échouée (le fichier reste mais n'est plus listé):", storageErr);
      }
    } catch (e: any) {
      alert("Erreur de suppression : " + (e?.message || e));
    }
  };

  // Réorganisation : on échange les `order` des deux photos voisines
  const handleMove = async (photo: GaleriePhoto, direction: "up" | "down") => {
    const idx = photos.findIndex((p) => p.id === photo.id);
    const swapWith = direction === "up" ? photos[idx - 1] : photos[idx + 1];
    if (!swapWith) return;
    try {
      await Promise.all([
        updateDoc(doc(db, "galerie_photos", photo.id), { order: swapWith.order }),
        updateDoc(doc(db, "galerie_photos", swapWith.id), { order: photo.order }),
      ]);
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e));
    }
  };

  const startEditCaption = (photo: GaleriePhoto) => {
    setEditingId(photo.id);
    setEditingCaption(photo.caption || "");
  };

  const saveCaption = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, "galerie_photos", editingId), { caption: editingCaption.trim() });
      setEditingId(null);
      setEditingCaption("");
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e));
    }
  };

  const uploadEntries = Object.entries(uploads);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Galerie photos</h1>
      <p className="font-body text-sm text-gray-600 mb-6">
        Gérez les photos affichées sur la page <a href="/galerie" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">galerie publique</a>.
        La 1ère photo de chaque catégorie sert de couverture.
      </p>

      {/* Onglets de catégories */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
                ${isActive
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}`}>
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Zone d'upload */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-body text-base font-semibold text-blue-800">
            {activeMeta.emoji} {activeMeta.label} — {photos.length} photo{photos.length > 1 ? "s" : ""}
          </h2>
          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold cursor-pointer hover:bg-blue-600">
            <Upload size={16} />
            Ajouter des photos
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
            />
          </label>
        </div>

        {uploadEntries.length > 0 && (
          <div className="flex flex-col gap-1 mt-3 max-h-48 overflow-y-auto">
            {uploadEntries.map(([name, status]) => (
              <div key={name} className="flex items-center gap-3 text-xs font-body">
                <span className="flex-1 truncate text-slate-600">{name}</span>
                {typeof status === "number" ? (
                  <>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${status}%` }} />
                    </div>
                    <span className="text-slate-500 w-10 text-right">{status}%</span>
                  </>
                ) : status === "done" ? (
                  <span className="text-green-600">✓ envoyée</span>
                ) : (
                  <span className="text-red-600">{status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid des photos */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={32} className="animate-spin text-blue-500 mx-auto" />
        </div>
      ) : photos.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <ImageIcon size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="font-body text-sm text-slate-500">
            Aucune photo dans cette catégorie. Cliquez sur « Ajouter des photos » pour commencer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo, i) => {
            const isFirst = i === 0;
            const isLast = i === photos.length - 1;
            const isEditing = editingId === photo.id;
            return (
              <div key={photo.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                {/* Photo */}
                <div className="relative aspect-[4/3] bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.caption || "Photo galerie"} className="w-full h-full object-cover" />
                  {isFirst && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-semibold uppercase tracking-wide">
                      Couverture
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="p-3 flex flex-col gap-2">
                  {/* Légende */}
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCaption}
                        onChange={(e) => setEditingCaption(e.target.value)}
                        placeholder="Légende (optionnelle)"
                        className="flex-1 px-2 py-1 rounded-md border border-gray-300 font-body text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveCaption();
                          if (e.key === "Escape") { setEditingId(null); setEditingCaption(""); }
                        }}
                      />
                      <button onClick={saveCaption} className="text-green-600 hover:text-green-700 bg-transparent border-none cursor-pointer p-1"><Check size={16} /></button>
                      <button onClick={() => { setEditingId(null); setEditingCaption(""); }} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-1"><X size={16} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditCaption(photo)}
                      className="flex items-center gap-1.5 text-left bg-transparent border-none cursor-pointer p-0">
                      <span className={`flex-1 font-body text-xs ${photo.caption ? "text-slate-700" : "text-slate-400 italic"}`}>
                        {photo.caption || "+ Ajouter une légende"}
                      </span>
                      <Pencil size={12} className="text-slate-400" />
                    </button>
                  )}

                  {/* Boutons d'ordre + suppression */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleMove(photo, "up")}
                      disabled={isFirst}
                      title="Déplacer vers le haut"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 bg-transparent border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMove(photo, "down")}
                      disabled={isLast}
                      title="Déplacer vers le bas"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 bg-transparent border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                      <ArrowDown size={14} />
                    </button>
                    <span className="flex-1 text-center text-[10px] text-slate-400 font-body">
                      Position {i + 1} / {photos.length}
                    </span>
                    <button
                      onClick={() => handleDelete(photo)}
                      title="Supprimer cette photo"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 bg-transparent border-none cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
