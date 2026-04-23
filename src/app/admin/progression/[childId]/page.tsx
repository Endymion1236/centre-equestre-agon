"use client";
import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Loader2 } from "lucide-react";
import ProgressionEditor from "@/components/ProgressionEditor";

// Page dédiée progression d'un cavalier.
// Accessible aux admins ET aux moniteurs (layout admin accepte les deux rôles).
// Utilisée comme cible de navigation depuis le Planning → bouton 📊 sur un inscrit.
//
// Pourquoi pas /admin/cavaliers ? Cette page charge trop de collections
// (families, payments, mandats-sepa, fidelite, avoirs, cartes...) dont certaines
// sont réservées aux admins par les règles Firestore. Un moniteur qui tombait
// dessus voyait une erreur de chargement. Ici on ne charge que ce qui est
// nécessaire à la fiche progression.
export default function ProgressionCavalierPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const childId = params?.childId as string;
  const familyIdParam = searchParams.get("familyId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedFamilyId, setResolvedFamilyId] = useState<string | null>(null);
  const [child, setChild] = useState<{ firstName: string; lastName?: string; galopLevel?: string } | null>(null);
  const [familyName, setFamilyName] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Résoudre familyId : soit passé en query string (cas nominal depuis EnrollPanel),
        // soit on parcourt les familles pour trouver celle qui contient ce childId (fallback).
        let familyId = familyIdParam;
        let family: any = null;
        if (familyId) {
          const snap = await getDoc(doc(db, "families", familyId));
          if (snap.exists()) family = { id: snap.id, ...snap.data() };
        }
        if (!family) {
          // Fallback : chercher dans toutes les familles (coûteux mais sécuritaire)
          const all = await getDocs(collection(db, "families"));
          for (const d of all.docs) {
            const fam = d.data() as any;
            const found = (fam.children || []).find((c: any) => c.id === childId);
            if (found) {
              family = { id: d.id, ...fam };
              familyId = d.id;
              break;
            }
          }
        }
        if (!family || !familyId) {
          setError("Cavalier introuvable");
          setLoading(false);
          return;
        }
        const c = (family.children || []).find((x: any) => x.id === childId);
        if (!c) {
          setError("Ce cavalier n'appartient pas à la famille indiquée");
          setLoading(false);
          return;
        }
        setResolvedFamilyId(familyId);
        setChild({ firstName: c.firstName, lastName: c.lastName, galopLevel: c.galopLevel });
        setFamilyName(family.parentName || "");
      } catch (e) {
        console.error("[progression/[childId]] chargement échoué:", e);
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [childId, familyIdParam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !resolvedFamilyId || !child) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-500 bg-transparent border-none cursor-pointer mb-4 font-body text-sm">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="bg-white rounded-2xl border border-orange-200 p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-body text-sm text-slate-500">{error || "Données introuvables"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 flex flex-col gap-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-blue-500 bg-transparent border-none cursor-pointer font-body text-sm hover:text-blue-700 self-start">
        <ArrowLeft size={16} /> Retour
      </button>
      <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 flex flex-col gap-2">
        <h1 className="font-display text-xl font-bold text-blue-800">
          📊 Progression — {child.firstName}{child.lastName ? ` ${child.lastName}` : ""}
        </h1>
        {familyName && (
          <p className="font-body text-xs text-slate-500">Famille {familyName}</p>
        )}
      </div>
      <ProgressionEditor
        childId={childId}
        familyId={resolvedFamilyId}
        childName={child.firstName}
        galopLevel={child.galopLevel}
      />
    </div>
  );
}
