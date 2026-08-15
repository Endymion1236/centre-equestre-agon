"use client";
/**
 * src/app/admin/forfaits/page.tsx
 *
 * Écran « Forfaits annuels » : la liste des inscriptions à l'année, leurs
 * compteurs d'argent, et les actions qu'un admin peut lancer dessus.
 *
 * Ce fichier n'est plus que l'orchestrateur : il charge les données
 * Firestore une fois, tient l'état d'écran (recherche, filtre, carte
 * dépliée, opération en cours) et distribue le tout à ses trois vues —
 * FormulaireCreation, CarteForfait, ModaleChangementCreneau. Les calculs
 * vivent dans calculs.ts, les écritures dans actions.ts.
 */
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, updateDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import {
  Loader2, Search, Users, Calendar, CreditCard, TrendingUp, Plus,
} from "lucide-react";
import type { Family } from "@/types";
import FormulaireCreation from "./FormulaireCreation";
import CarteForfait from "./CarteForfait";
import ModaleChangementCreneau from "./ModaleChangementCreneau";
import { detecteCreneauxReels, filtreEtTrieForfaits, montantPayePourForfait } from "./calculs";
import { changerCreneauForfait, desinscrireDeTousLesCoursAnnuels, retirerCreneauHebdo } from "./actions";
import { NOMS_JOURS_DEPUIS_DIMANCHE } from "./constantes";
import type { Creneau, CreneauReel, EtatChangementCreneau, Forfait, Payment, RegleReductionFamille, WeeklySlot } from "./types";

export default function ForfaitsPage() {
  const { setAgentContext } = useAgentContext("forfaits");

  useEffect(() => {
    setAgentContext({ module_actif: "forfaits", description: "forfaits annuels actifs" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unenrolling, setUnenrolling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [slotChange, setSlotChange] = useState<EtatChangementCreneau | null>(null);
  const [slotChanging, setSlotChanging] = useState(false);

  // Réductions famille (chargées depuis settings/degressivite)
  const [familyDiscountRules, setFamilyDiscountRules] = useState<RegleReductionFamille[]>([]);

  const fetchData = async () => {
    try {
      const [fSnap, pSnap, famSnap, cSnap, degSnap] = await Promise.all([
        getDocs(collection(db, "forfaits")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "families")),
        getDocs(query(collection(db, "creneaux"), where("activityType", "==", "cours"))),
        getDoc(doc(db, "settings", "degressivite")),
      ]);
      setForfaits(fSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Forfait[]);
      setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Payment[]);
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      const today = new Date().toISOString().split("T")[0];
      setCreneaux(
        (cSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[])
          .filter(c => c.date >= today)
      );
      if (degSnap.exists() && degSnap.data().familyDiscount) {
        setFamilyDiscountRules(degSnap.data().familyDiscount);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Existing logic ──
  const activeCount = forfaits.filter(f => f.status === "active" || f.status === "actif").length;
  const suspendedCount = forfaits.filter(f => f.status === "suspended").length;
  const getPaidForForfait = (f: Forfait) => montantPayePourForfait(f, payments);

  const totalCA = forfaits.filter(f => f.status !== "cancelled").reduce((s, f) => s + (f.forfaitPriceTTC || 0), 0);
  // totalPaid base sur le vrai paiement (getPaidForForfait), pas sur le champ
  // totalPaidTTC obsolete. Coherent avec la barre de progression de chaque carte.
  const totalPaid = forfaits.filter(f => f.status !== "cancelled").reduce((s, f) => s + getPaidForForfait(f), 0);
  const totalDue = Math.max(0, totalCA - totalPaid);

  const filtered = useMemo(() => filtreEtTrieForfaits(forfaits, filterStatus, search), [forfaits, filterStatus, search]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "forfaits", id), { status: newStatus, updatedAt: serverTimestamp() });
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleUnenrollAll = async (f: Forfait) => {
    if (!confirm(`Désinscrire ${f.childName} de TOUS les cours annuels futurs ?\n\nCela le retirera de toutes les séances à venir et annulera les échéances non réglées.`)) return;
    setUnenrolling(f.id);
    try {
      const succes = await desinscrireDeTousLesCoursAnnuels(f);
      if (succes) fetchData();
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de la désinscription.");
    }
    setUnenrolling(null);
  };

  const handleRemoveSlot = async (f: Forfait, slot: CreneauReel) => {
    if (!confirm(`Retirer ${f.childName} du créneau ${slot.dayLabel} ${slot.startTime} (${slot.activityTitle}) ?\n\nLes autres créneaux du forfait restent inchangés.\nUn avoir pourra être proposé si le forfait est déjà payé.`)) return;
    setSlotChanging(true);
    // Nombre de créneaux distincts AVANT le retrait — mesuré maintenant, avant
    // toute modification, pour un calcul d'avoir fiable (ne pas deduire par +1).
    const slotsAvantRetrait = detecteCreneauxReels(f, creneaux).length;
    try {
      await retirerCreneauHebdo({
        forfait: f,
        slot,
        creneaux,
        slotsAvantRetrait,
        montantDejaPaye: getPaidForForfait(f),
        rafraichir: fetchData,
      });
    } catch (e: any) {
      console.error(e);
      alert(`Erreur: ${e.message || e}`);
    }
    setSlotChanging(false);
  };

  const handleSlotChange = async (forfait: Forfait, newSlot: WeeklySlot, oldSlot?: EtatChangementCreneau["oldSlot"]) => {
    // Si oldSlot est fourni, on ne change QUE ce créneau précis.
    // Sinon (comportement legacy), on remplace TOUS les créneaux du forfait
    // par le nouveau (cas forfait 1x/sem qui change de jour).
    const confirmMsg = oldSlot
      ? `Changer UN créneau du forfait de ${forfait.childName} ?\n\n❌ Ancien : ${NOMS_JOURS_DEPUIS_DIMANCHE[oldSlot.dayOfWeek]} ${oldSlot.startTime} — ${oldSlot.activityTitle}\n✅ Nouveau : ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}\n\nLes autres créneaux du forfait restent inchangés.\nLes paiements ne sont PAS modifiés.`
      : `Changer le créneau de ${forfait.childName} ?\n\n❌ Ancien : ${forfait.slotKey}\n✅ Nouveau : ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}\n\nLes paiements ne sont PAS modifiés.`;
    if (!confirm(confirmMsg)) return;
    setSlotChanging(true);
    try {
      await changerCreneauForfait({ forfait, newSlot, oldSlot });
      setSlotChange(null);
      fetchData();
    } catch (e: any) {
      console.error(e);
      alert("Erreur : " + e.message);
    }
    setSlotChanging(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <>
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Forfaits annuels</h1>
          <p className="font-body text-xs text-slate-500">Inscriptions à l&apos;année avec choix des créneaux</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau forfait
        </button>
      </div>

      {/* ═══ Create Form ═══ */}
      <FormulaireCreation
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchData}
        families={families}
        forfaits={forfaits}
        creneaux={creneaux}
        familyDiscountRules={familyDiscountRules}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Users size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{activeCount}</div><div className="font-body text-xs text-slate-500">forfaits actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><TrendingUp size={18} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{totalCA.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">CA forfaits</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CreditCard size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalPaid.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">encaissé</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${totalDue > 0 ? "bg-red-50" : "bg-gray-50"} flex items-center justify-center`}>
            <CreditCard size={18} className={totalDue > 0 ? "text-red-500" : "text-slate-500"} />
          </div>
          <div><div className={`font-body text-xl font-bold ${totalDue > 0 ? "text-red-500" : "text-slate-500"}`}>{totalDue.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">reste à encaisser</div></div>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1.5">
          {[
            { id: "all", label: `Tous (${forfaits.length})` },
            { id: "active", label: `Actifs (${activeCount})` },
            { id: "suspended", label: `Suspendus (${suspendedCount})` },
            { id: "completed", label: "Terminés" },
            { id: "cancelled", label: "Résiliés" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${
                filterStatus === f.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="forfait-search" placeholder="Rechercher cavalier, famille, activité..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Calendar size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-slate-600">
            {forfaits.length === 0 ? "Aucun forfait. Cliquez sur « Nouveau forfait » pour inscrire un cavalier." : "Aucun forfait correspondant aux filtres."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => (
            <CarteForfait
              key={f.id}
              f={f}
              isExp={expanded === f.id}
              onToggleExpand={() => setExpanded(expanded === f.id ? null : f.id)}
              paid={getPaidForForfait(f)}
              creneaux={creneaux}
              saving={saving}
              slotChanging={slotChanging}
              unenrolling={unenrolling}
              onStatusChange={handleStatusChange}
              onOuvrirChangementCreneau={setSlotChange}
              onRemoveSlot={handleRemoveSlot}
              onUnenrollAll={handleUnenrollAll}
            />
          ))}
        </div>
      )}
    </div>

      {/* ── Modal changement de créneau ── */}
      {slotChange && (
        <ModaleChangementCreneau
          slotChange={slotChange}
          setSlotChange={setSlotChange}
          creneaux={creneaux}
          slotChanging={slotChanging}
          onChoisirCreneau={handleSlotChange}
        />
      )}
    </>
  );
}
