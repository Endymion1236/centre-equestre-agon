"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Search, Users, UserCheck, AlertTriangle, UserPlus, Loader2 } from "lucide-react";
import type { Family } from "@/types";
import FamilyCard from "./components/FamilyCard";
import CreateFamilyModal from "./components/CreateFamilyModal";

export default function CavaliersPage() {
  const { setAgentContext } = useAgentContext("cavaliers");
  useEffect(() => {
    setAgentContext({ module_actif: "cavaliers", description: "familles, cavaliers, inscriptions" });
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [allAvoirs, setAllAvoirs] = useState<any[]>([]);
  const [allCartes, setAllCartes] = useState<any[]>([]);
  const [allCreneaux, setAllCreneaux] = useState<any[]>([]);
  const [allMandats, setAllMandats] = useState<any[]>([]);
  const [allFidelite, setAllFidelite] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const { toast } = useToast();

  // ── Chargement ────────────────────────────────────────────────────────────
  const fetchFamilies = async () => {
    try {
      const [
        famSnap, resSnap, paySnap, avoirsSnap, cartesSnap,
        creneauxSnap, mandatsSnap, fideliteSnap,
      ] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "reservations")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "avoirs")),
        getDocs(collection(db, "cartes-seances")),
        getDocs(query(collection(db, "creneaux"), orderBy("date"))),
        getDocs(collection(db, "mandats-sepa")),
        getDocs(collection(db, "fidelite")),
      ]);

      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      setAllReservations(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllAvoirs(avoirsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllCartes(cartesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllCreneaux(creneauxSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllMandats(mandatsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllFidelite(fideliteSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast("Erreur de chargement", "error");
    }
    setLoading(false);
  };

  useEffect(() => { fetchFamilies(); }, []);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const list = !search.trim() ? families : families.filter(f =>
      f.parentName?.toLowerCase().includes(search.toLowerCase()) ||
      (f as any).lastName?.toLowerCase().includes(search.toLowerCase()) ||
      (f as any).firstName?.toLowerCase().includes(search.toLowerCase()) ||
      f.parentEmail?.toLowerCase().includes(search.toLowerCase()) ||
      (f.children || []).some((c: any) =>
        `${c.firstName} ${c.lastName || ""}`.toLowerCase().includes(search.toLowerCase())
      )
    );
    // Tri alphabétique par nom de famille, puis prénom
    return [...list].sort((a, b) => {
      const lastA = ((a as any).lastName || a.parentName || "").toLowerCase();
      const lastB = ((b as any).lastName || b.parentName || "").toLowerCase();
      if (lastA !== lastB) return lastA.localeCompare(lastB, "fr");
      const firstA = ((a as any).firstName || "").toLowerCase();
      const firstB = ((b as any).firstName || "").toLowerCase();
      return firstA.localeCompare(firstB, "fr");
    });
  }, [families, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const allChildren = families.flatMap(f => f.children || []);
  const missingForms = allChildren.filter((c: any) => !c.sanitaryForm).length;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Cavaliers & familles</h1>
        <button onClick={() => setShowCreateFamily(true)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 transition-colors">
          <UserPlus size={16}/> Nouvelle famille
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Users size={20} className="text-blue-500"/></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{families.length}</div><div className="font-body text-xs text-slate-600">familles</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><UserCheck size={20} className="text-green-600"/></div>
          <div><div className="font-body text-xl font-bold text-green-600">{allChildren.length}</div><div className="font-body text-xs text-slate-600">cavaliers</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={20} className="text-orange-500"/></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{missingForms}</div><div className="font-body text-xs text-slate-600">fiches manquantes</div></div>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher : prénom + nom enfant, famille, email..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400 bg-white"/>
        {search && <div className="font-body text-[10px] text-slate-600 mt-1 ml-1">{filtered.length} famille{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}</div>}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300"/></div>
          <p className="font-body text-sm text-slate-600">{search ? "Aucun résultat." : "Aucune famille inscrite. Cliquez sur \"Nouvelle famille\" pour commencer."}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(family => (
            <FamilyCard
              key={family.firestoreId}
              family={family}
              families={families}
              allReservations={allReservations}
              allPayments={allPayments}
              allAvoirs={allAvoirs}
              allCartes={allCartes}
              allMandats={allMandats}
              allFidelite={allFidelite}
              allCreneaux={allCreneaux}
              onRefresh={fetchFamilies}
            />
          ))}
        </div>
      )}

      {/* Modal création famille */}
      {showCreateFamily && (
        <CreateFamilyModal onClose={() => setShowCreateFamily(false)} onDone={fetchFamilies}/>
      )}
    </div>
  );
}
