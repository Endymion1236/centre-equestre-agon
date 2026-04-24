"use client";
import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
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
  const { user, loading: authLoading } = useAuth();
  const childId = params?.childId as string;
  const familyIdParam = searchParams.get("familyId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedFamilyId, setResolvedFamilyId] = useState<string | null>(null);
  const [child, setChild] = useState<{ firstName: string; lastName?: string; galopLevel?: string } | null>(null);
  const [familyName, setFamilyName] = useState<string>("");

  useEffect(() => {
    // ⚠️ Attendre que Firebase Auth ait fini de restaurer la session avant
    // de faire des requêtes Firestore. Sans cette attente, sur iPhone (Safari,
    // IndexedDB lente / évincée par iOS), la requête part avec user=null et
    // Firestore refuse avec une permission denied → erreur de chargement
    // intermittente.
    if (authLoading) return;

    // Si après chargement, toujours pas d'utilisateur → rediriger vers login
    if (!user) {
      setError("Vous devez être connecté pour voir cette page");
      setLoading(false);
      return;
    }

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
      } catch (e: any) {
        // Log détaillé pour diagnostic (visible dans la console Safari via USB debug)
        console.error("[progression/[childId]] chargement échoué:", {
          code: e?.code,
          message: e?.message,
          userPresent: !!user,
          userUid: user?.uid,
          authLoading,
          childId,
          familyIdParam,
        });
        // Message adapté selon le type d'erreur Firestore
        if (e?.code === "permission-denied") {
          setError("Permissions insuffisantes. Reconnectez-vous et réessayez.");
        } else if (e?.code === "unavailable" || e?.message?.includes("offline")) {
          setError("Connexion internet instable. Réessayez.");
        } else {
          setError("Erreur de chargement");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [childId, familyIdParam, user, authLoading]);

  // Retour au planning : on tente de fermer l'onglet (cas target="_blank"
  // depuis EnrollPanel) mais plein de navigateurs bloquent window.close() par
  // sécurité. On redirige systématiquement vers /admin/planning en fallback —
  // ça marche partout, même en webview mobile.
  const goBack = () => {
    if (typeof window !== "undefined") {
      try {
        window.close();
      } catch {/* ignoré */}
    }
    // Si on est encore là après 200ms, redirection
    setTimeout(() => {
      router.push("/admin/planning");
    }, 200);
  };

  // Feedback post-enregistrement : petite notification + fermeture différée
  const [savedToast, setSavedToast] = useState(false);
  const handleSaved = () => {
    setSavedToast(true);
    // Laisser le temps au moniteur de voir le ✅ avant de fermer
    setTimeout(() => {
      goBack();
    }, 1200);
  };

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
          onClick={goBack}
          className="flex items-center gap-2 text-blue-500 bg-transparent border-none cursor-pointer mb-4 font-body text-sm">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="bg-white rounded-2xl border border-orange-200 p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-body text-sm text-slate-500 mb-4">{error || "Données introuvables"}</p>
          <button
            onClick={() => {
              // Forcer un reload complet de la page (utile si auth pas prête au premier essai)
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer px-5 py-2.5 rounded-xl">
            🔄 Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 flex flex-col gap-4">
      <button
        onClick={goBack}
        className="flex items-center gap-2 text-blue-500 bg-transparent border-none cursor-pointer font-body text-sm hover:text-blue-700 self-start">
        <ArrowLeft size={16} /> Retour au planning
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
        onSaved={handleSaved}
      />
      {/* Toast d'enregistrement avec retour automatique */}
      {savedToast && (
        <div className="fixed inset-x-4 bottom-6 md:inset-x-auto md:right-6 md:bottom-6 z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg font-body text-sm flex items-center gap-2">
          <span>✅ Progression enregistrée — retour au planning…</span>
        </div>
      )}
    </div>
  );
}
