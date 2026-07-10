"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { AlertTriangle, Filter, Loader2, Search, UserCheck, UserPlus, Users, X } from "lucide-react";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAgentContext } from "@/hooks/useAgentContext";
import { db } from "@/lib/firebase";
import type { Family } from "@/types";
import CreateFamilyModal from "./components/CreateFamilyModal";
import FamilyCard from "./components/FamilyCard";

type ActionFilter = "" | "attestation" | "impayes" | "sans_seance";

const SEGMENTS = [
  { id: "", label: "Toutes" },
  { id: "cavalier_annee", label: "À l’année" },
  { id: "stage", label: "Stages" },
  { id: "passage", label: "Passage" },
  { id: "etablissement", label: "Établissements" },
];

export default function CavaliersPage() {
  const { setAgentContext } = useAgentContext("cavaliers");
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [allAvoirs, setAllAvoirs] = useState<any[]>([]);
  const [allCartes, setAllCartes] = useState<any[]>([]);
  const [allCreneaux, setAllCreneaux] = useState<any[]>([]);
  const [allMandats, setAllMandats] = useState<any[]>([]);
  const [allFidelite, setAllFidelite] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [filterTag, setFilterTag] = useState("");
  const [filterAction, setFilterAction] = useState<ActionFilter>("");
  const [showCreateFamily, setShowCreateFamily] = useState(false);

  const tabParam = searchParams.get("tab");
  const targetFamilyId = searchParams.get("id") || "";
  const targetChildId = searchParams.get("child") || "";
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    setAgentContext({ module_actif: "cavaliers", description: "familles, cavaliers, inscriptions" });
  }, []);

  const fetchFamilies = async () => {
    try {
      const [famSnap, resSnap, paySnap, avoirsSnap, cartesSnap, creneauxSnap, mandatsSnap, fideliteSnap] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "reservations")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "avoirs")),
        getDocs(collection(db, "cartes")),
        getDocs(query(collection(db, "creneaux"), orderBy("date"))),
        getDocs(collection(db, "mandats-sepa")),
        getDocs(collection(db, "fidelite")),
      ]);

      setFamilies(famSnap.docs.map((item) => ({ firestoreId: item.id, ...item.data() })).filter((family: any) => family.status !== "merged") as any);
      setAllReservations(resSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllPayments(paySnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllAvoirs(avoirsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllCartes(cartesSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllCreneaux(creneauxSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllMandats(mandatsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setAllFidelite(fideliteSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
    } catch (error) {
      console.error(error);
      toast("Erreur de chargement", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFamilies();
  }, []);

  const isEtablissement = (family: any) => (family.tags || []).includes("etablissement");
  const famSansAttestation = (family: any) => !isEtablissement(family) && (family.children || []).some((child: any) => !child.sanitaryForm);
  const famImpayes = (family: any) => {
    const payments = allPayments.filter((payment: any) => payment.familyId === family.firestoreId && payment.status !== "cancelled");
    const total = payments.reduce((sum: number, payment: any) => sum + Number(payment.totalTTC || 0), 0);
    const paid = payments.reduce((sum: number, payment: any) => sum + Number(payment.paidAmount || 0), 0);
    return total - paid;
  };
  const famSansSeance = (family: any) =>
    (family.children || []).length > 0 &&
    !allReservations.some((reservation: any) => reservation.familyId === family.firestoreId && reservation.status !== "cancelled" && reservation.date >= todayStr);

  const allChildren = useMemo(() => families.flatMap((family) => family.children || []), [families]);
  const actionCounts = useMemo(() => ({
    attestation: families.filter(famSansAttestation).length,
    impayes: families.filter((family) => famImpayes(family) > 0.009).length,
    sans_seance: families.filter(famSansSeance).length,
  }), [families, allPayments, allReservations]);

  const filtered = useMemo(() => {
    if (targetFamilyId) {
      const target = families.find((family) => family.firestoreId === targetFamilyId);
      return target ? [target] : [];
    }

    const queryText = search.trim().toLowerCase();
    let list = queryText
      ? families.filter((family) =>
          family.parentName?.toLowerCase().includes(queryText) ||
          (family as any).lastName?.toLowerCase().includes(queryText) ||
          (family as any).firstName?.toLowerCase().includes(queryText) ||
          family.parentEmail?.toLowerCase().includes(queryText) ||
          (family.children || []).some((child: any) => `${child.firstName} ${child.lastName || ""}`.toLowerCase().includes(queryText))
        )
      : families;

    if (filterTag) list = list.filter((family) => (family as any).tags?.includes(filterTag));
    if (filterAction === "attestation") list = list.filter(famSansAttestation);
    if (filterAction === "impayes") list = list.filter((family) => famImpayes(family) > 0.009);
    if (filterAction === "sans_seance") list = list.filter(famSansSeance);

    return [...list].sort((first, second) => {
      const lastA = ((first as any).lastName || first.parentName || "").toLowerCase();
      const lastB = ((second as any).lastName || second.parentName || "").toLowerCase();
      if (lastA !== lastB) return lastA.localeCompare(lastB, "fr");
      return ((first as any).firstName || "").localeCompare((second as any).firstName || "", "fr");
    });
  }, [families, search, filterTag, filterAction, targetFamilyId, allPayments, allReservations]);

  const hasActiveFilters = Boolean(search || filterTag || filterAction);

  const clearFilters = () => {
    setSearch("");
    setFilterTag("");
    setFilterAction("");
  };

  return (
    <div className="pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="font-body text-xs font-bold uppercase tracking-[0.16em] text-blue-500 mb-1">Clients</div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-blue-800">Familles & cavaliers</h1>
          <p className="font-body text-sm text-gray-500 mt-1">Retrouvez un dossier, traitez les alertes et gardez les profils à jour.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateFamily(true)}
          className="inline-flex items-center justify-center gap-2 font-body text-sm font-bold text-white bg-blue-600 px-5 py-3 rounded-xl border-none cursor-pointer hover:bg-blue-700 shadow-sm"
        >
          <UserPlus size={17} /> Nouvelle famille
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-blue-50 items-center justify-center"><Users size={19} className="text-blue-500" /></div>
            <div>
              <div className="font-display text-2xl font-bold text-blue-800">{families.length}</div>
              <div className="font-body text-[11px] sm:text-xs text-gray-500">familles</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-green-50 items-center justify-center"><UserCheck size={19} className="text-green-600" /></div>
            <div>
              <div className="font-display text-2xl font-bold text-blue-800">{allChildren.length}</div>
              <div className="font-body text-[11px] sm:text-xs text-gray-500">cavaliers</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-orange-50 items-center justify-center"><AlertTriangle size={19} className="text-orange-500" /></div>
            <div>
              <div className="font-display text-2xl font-bold text-blue-800">{actionCounts.attestation + actionCounts.impayes}</div>
              <div className="font-body text-[11px] sm:text-xs text-gray-500">à traiter</div>
            </div>
          </div>
        </Card>
      </div>

      <Card padding="md" className="mb-5 !rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={17} className="text-orange-500" />
          <div className="font-display text-lg font-bold text-blue-800">À traiter</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { id: "attestation" as const, label: "Attestations manquantes", count: actionCounts.attestation, tone: "orange" },
            { id: "impayes" as const, label: "Familles avec impayé", count: actionCounts.impayes, tone: "red" },
            { id: "sans_seance" as const, label: "Sans séance à venir", count: actionCounts.sans_seance, tone: "blue" },
          ].map((item) => {
            const active = filterAction === item.id;
            const classes = item.tone === "red"
              ? active ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-100"
              : item.tone === "orange"
                ? active ? "bg-orange-500 text-white border-orange-500" : "bg-orange-50 text-orange-700 border-orange-100"
                : active ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-100";
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setFilterAction(active ? "" : item.id)}
                disabled={item.count === 0}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 font-body text-sm font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-default ${classes}`}
              >
                <span>{item.label}</span>
                <span className={`min-w-7 h-7 px-2 rounded-full flex items-center justify-center font-bold ${active ? "bg-white/20" : "bg-white"}`}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding="md" className="mb-5 !rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-blue-500" />
          <div className="font-body text-sm font-bold text-blue-800">Rechercher et filtrer</div>
        </div>

        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom du parent, cavalier, email…"
            className="w-full pl-11 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 font-body text-sm focus:outline-none focus:border-blue-400 focus:bg-white"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-white text-gray-400 border-none cursor-pointer flex items-center justify-center"><X size={14} /></button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mt-3">
          {SEGMENTS.map((segment) => {
            const count = segment.id ? families.filter((family) => (family as any).tags?.includes(segment.id)).length : families.length;
            const active = filterTag === segment.id;
            return (
              <button
                type="button"
                key={segment.id || "all"}
                onClick={() => setFilterTag(segment.id)}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 font-body text-xs font-bold cursor-pointer ${active ? "bg-blue-800 text-white border-blue-800" : "bg-white text-gray-600 border-gray-200"}`}
              >
                {segment.label} <span className={active ? "text-blue-100" : "text-gray-400"}>({count})</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-blue-800">Dossiers</h2>
          <div className="font-body text-xs text-gray-500">{filtered.length} famille{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}</div>
        </div>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 text-gray-600 px-3 py-2 font-body text-xs font-semibold border-none cursor-pointer"><X size={14} /> Effacer les filtres</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center !rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300" /></div>
          <div className="font-display text-lg font-bold text-blue-800">Aucun dossier trouvé</div>
          <p className="font-body text-sm text-gray-500 mt-1">Modifiez les filtres ou créez une nouvelle famille.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((family) => (
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
              autoOpenProgressionChildName={tabParam === "progression" ? search : undefined}
              initialProgressionChildId={searchParams.get("showProgression") || undefined}
              initialExpandedForChildId={targetFamilyId && family.firestoreId === targetFamilyId ? (targetChildId || "FAMILY") : undefined}
            />
          ))}
        </div>
      )}

      {showCreateFamily && <CreateFamilyModal onClose={() => setShowCreateFamily(false)} onDone={fetchFamilies} />}
    </div>
  );
}
