"use client";

/**
 * src/app/admin/sepa/page.tsx
 *
 * Écran des prélèvements SEPA : les mandats signés par les familles, les
 * échéances à prélever, et les remises (fichiers XML) envoyées à la banque.
 *
 * Cette page est devenue l'ORCHESTRATEUR : elle charge les cinq collections
 * dont l'écran a besoin, tient l'état (onglet courant, recherche, sélection
 * d'échéances, formulaires) et distribue le tout à trois onglets. Tout ce qui
 * écrit dans Firestore ou fabrique le fichier bancaire vit à côté :
 *
 *   - types.ts              formes des documents `mandats-sepa` / `echeances-sepa` / `remises-sepa`
 *   - bic.ts                déduction du BIC depuis le code banque d'un IBAN
 *   - remise-xml.ts         échéances sélectionnées → transactions pain.008, téléchargement
 *   - mandats-firestore.ts  création / suppression d'un mandat (validation IBAN + BIC)
 *   - echeances-firestore.ts génération d'un échéancier, décalage de série, dates
 *   - remises-firestore.ts  création d'une remise, dépôt en banque et encaissements
 *   - OngletMandats / OngletEcheancier / OngletRemises : le rendu des trois onglets
 *
 * Pourquoi ce découpage : sur cette page, une erreur ne fait pas qu'afficher
 * quelque chose de faux — elle prélève de l'argent sur le compte d'une famille.
 * Les calculs et les écritures qui engagent la banque devaient pouvoir se lire
 * sans être noyés dans 400 lignes de formulaire.
 *
 * Le rechargement se fait toujours par `fetchAll()` après une écriture : les
 * handlers ne modifient pas les listes en mémoire, ils réinterrogent Firestore.
 */

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type { Family } from "@/types";
import {
  Search, Plus, X, Save, Loader2, Download, Check, ChevronDown, ChevronUp,
  Building2, Users, Calendar, CreditCard, FileText, Trash2, CheckSquare, Square,
  AlertTriangle,
} from "lucide-react";
import type { MandatSepa, EcheanceSepa, RemiseSepa, SaisieMandat, SaisieEcheancier } from "./types";
import { creerMandat, supprimerMandat } from "./mandats-firestore";
import { creerEcheancier, decalerSerie, supprimerEcheance } from "./echeances-firestore";
import { creerRemise, telechargerRemise, marquerRemiseDeposee } from "./remises-firestore";
import { OngletMandats } from "./OngletMandats";
import { OngletEcheancier } from "./OngletEcheancier";
import { OngletRemises } from "./OngletRemises";

// ═══ Composant principal ═══
export default function SepaPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"mandats" | "echeancier" | "remises">("mandats");
  const [loading, setLoading] = useState(true);

  // Data
  const [mandats, setMandats] = useState<MandatSepa[]>([]);
  const [echeances, setEcheances] = useState<EcheanceSepa[]>([]);
  const [remises, setRemises] = useState<RemiseSepa[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Search
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Forms
  const [showNewMandat, setShowNewMandat] = useState(false);
  const [newMandat, setNewMandat] = useState<SaisieMandat>({ familyId: "", iban: "", bic: "", titulaire: "", libelle: "", dateSignature: new Date().toISOString().split("T")[0] });
  const [showNewEcheancier, setShowNewEcheancier] = useState(false);
  const [newEcheancier, setNewEcheancier] = useState<SaisieEcheancier>({ mandatId: "", mandatId2: "", montantTotal: "", montant2: "", nbEcheances: "10", dateDebut: "", description: "" });
  const [repartir, setRepartir] = useState(false);
  const [saving, setSaving] = useState(false);

  // Remise creation
  const [selectedEcheances, setSelectedEcheances] = useState<Set<string>>(new Set());

  // ─── Chargement ───
  const fetchAll = async () => {
    try {
      const [mandatsSnap, echSnap, remSnap, famSnap, paySnap] = await Promise.all([
        getDocs(collection(db, "mandats-sepa")),
        getDocs(collection(db, "echeances-sepa")),
        getDocs(collection(db, "remises-sepa")),
        getDocs(collection(db, "families")),
        getDocs(collection(db, "payments")),
      ]);
      setMandats(mandatsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as MandatSepa[]);
      setEcheances(echSnap.docs.map(d => ({ id: d.id, ...d.data() })) as EcheanceSepa[]);
      setRemises(remSnap.docs.map(d => ({ id: d.id, ...d.data() })) as RemiseSepa[]);
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as (Family & { firestoreId: string })[]);
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── Créer un mandat ───
  const handleCreateMandat = async () => {
    if (!newMandat.familyId || !newMandat.iban || !newMandat.titulaire) return;
    const cree = await creerMandat({ saisie: newMandat, families, mandats, toast, setSaving });
    if (!cree) return;
    setShowNewMandat(false);
    setNewMandat({ familyId: "", iban: "", bic: "", titulaire: "", libelle: "", dateSignature: new Date().toISOString().split("T")[0] });
    fetchAll();
  };

  // ─── Créer un échéancier (1 mandat, ou réparti sur 2) ───
  const handleCreateEcheancier = async () => {
    const cree = await creerEcheancier({ saisie: newEcheancier, mandats, repartir, toast, setSaving });
    if (!cree) return;
    setShowNewEcheancier(false); setRepartir(false);
    setNewEcheancier({ mandatId: "", mandatId2: "", montantTotal: "", montant2: "", nbEcheances: "10", dateDebut: "", description: "" });
    fetchAll();
  };

  // ─── Créer une remise SEPA ───
  const handleCreateRemise = async () => {
    if (selectedEcheances.size === 0) return;
    const creee = await creerRemise({ echeances, selectedEcheances, mandats, remises, toast, setSaving });
    if (!creee) return;
    setSelectedEcheances(new Set());
    fetchAll();
  };

  // ─── Re-télécharger un XML de remise ───
  const downloadRemise = async (remise: RemiseSepa) => {
    await telechargerRemise(remise, toast);
  };

  // ─── Marquer une remise comme déposée ───
  const markDeposited = async (remiseId: string) => {
    await marquerRemiseDeposee({ remiseId, echeances, remises, payments, toast });
    fetchAll();
  };

  // ─── Supprimer un mandat ───
  const handleDeleteMandat = async (id: string) => {
    if (await supprimerMandat(id, toast)) fetchAll();
  };

  // ─── Supprimer une échéance ───
  const handleDeleteEcheance = async (id: string) => {
    if (await supprimerEcheance(id, toast)) fetchAll();
  };

  // ─── Decaler toutes les echeances d'une serie a partir d'une nouvelle date ───
  const handleShiftSeries = async (firstEcheance: EcheanceSepa) => {
    if (await decalerSerie({ firstEcheance, echeances, toast })) fetchAll();
  };

  // ─── Ouvrir le formulaire d'échéancier pré-rempli depuis un mandat ───
  const ouvrirEcheancierPourMandat = (mandatDocId: string) => {
    setShowNewEcheancier(true);
    setNewEcheancier({ ...newEcheancier, mandatId: mandatDocId });
    setTab("echeancier");
  };

  // ─── Filtres ───
  const filteredMandats = mandats.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.familyName?.toLowerCase().includes(q) || m.titulaire?.toLowerCase().includes(q) || m.mandatId?.toLowerCase().includes(q);
  });

  const pendingEcheances = echeances
    .filter(e => e.status === "pending")
    .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance));

  const filteredEcheances = pendingEcheances.filter(e => {
    if (dateFilter && !e.dateEcheance.startsWith(dateFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.familyName?.toLowerCase().includes(q) || e.mandatId?.toLowerCase().includes(q);
  });

  // Sélection auto des échéances du mois en cours
  const selectCurrentMonth = () => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ids = pendingEcheances.filter(e => e.dateEcheance.startsWith(monthStr)).map(e => e.id);
    setSelectedEcheances(new Set(ids));
  };

  const toggleEcheance = (id: string) => {
    const s = new Set(selectedEcheances);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedEcheances(s);
  };

  const selectAll = () => {
    if (selectedEcheances.size === filteredEcheances.length) {
      setSelectedEcheances(new Set());
    } else {
      setSelectedEcheances(new Set(filteredEcheances.map(e => e.id)));
    }
  };

  const selectedTotal = echeances
    .filter(e => selectedEcheances.has(e.id))
    .reduce((s, e) => s + e.montant, 0);

  // ─── Stats ───
  const totalMandatsActifs = mandats.filter(m => m.status === "active").length;
  const totalEcheancesPending = pendingEcheances.length;
  const totalMontantPending = pendingEcheances.reduce((s, e) => s + e.montant, 0);
  const totalRemises = remises.length;

  // ─── Auto-fill famille ───
  const selectedFamily = families.find(f => f.firestoreId === newMandat.familyId);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Prélèvements SEPA</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Building2 size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{totalMandatsActifs}</div><div className="font-body text-xs text-gray-400">mandats actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Calendar size={20} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{totalEcheancesPending}</div><div className="font-body text-xs text-gray-400">échéances à venir</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CreditCard size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalMontantPending.toFixed(0)}€</div><div className="font-body text-xs text-gray-400">à prélever</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><FileText size={20} className="text-purple-500" /></div>
          <div><div className="font-body text-xl font-bold text-purple-500">{totalRemises}</div><div className="font-body text-xs text-gray-400">remises générées</div></div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { id: "mandats" as const, label: `Mandats (${mandats.length})`, icon: Building2 },
          { id: "echeancier" as const, label: `Échéancier (${totalEcheancesPending})`, icon: Calendar },
          { id: "remises" as const, label: `Remises (${remises.length})`, icon: Download },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${
              tab === t.id ? "text-white bg-blue-500" : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Search + filtre date */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une famille, un mandat..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="relative">
          <input
            type="month"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="h-full pl-3 pr-3 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none cursor-pointer text-slate-600"
            title="Filtrer par mois"
          />
        </div>
        {(search || dateFilter) && (
          <button
            onClick={() => { setSearch(""); setDateFilter(""); }}
            className="flex items-center gap-1.5 font-body text-xs text-slate-500 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl border-none cursor-pointer flex-shrink-0"
          >
            <X size={13}/> Effacer
          </button>
        )}
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <>
          {/* ═══ ONGLET MANDATS ═══ */}
          {tab === "mandats" && (
            <OngletMandats
              search={search}
              filteredMandats={filteredMandats}
              echeances={echeances}
              families={families}
              showNewMandat={showNewMandat}
              setShowNewMandat={setShowNewMandat}
              newMandat={newMandat}
              setNewMandat={setNewMandat}
              saving={saving}
              handleCreateMandat={handleCreateMandat}
              handleDeleteMandat={handleDeleteMandat}
              ouvrirEcheancierPourMandat={ouvrirEcheancierPourMandat}
            />
          )}

          {/* ═══ ONGLET ÉCHÉANCIER ═══ */}
          {tab === "echeancier" && (
            <OngletEcheancier
              echeances={echeances}
              setEcheances={setEcheances}
              filteredEcheances={filteredEcheances}
              mandats={mandats}
              showNewEcheancier={showNewEcheancier}
              setShowNewEcheancier={setShowNewEcheancier}
              newEcheancier={newEcheancier}
              setNewEcheancier={setNewEcheancier}
              repartir={repartir}
              setRepartir={setRepartir}
              saving={saving}
              selectedEcheances={selectedEcheances}
              selectedTotal={selectedTotal}
              selectCurrentMonth={selectCurrentMonth}
              selectAll={selectAll}
              toggleEcheance={toggleEcheance}
              handleCreateEcheancier={handleCreateEcheancier}
              handleCreateRemise={handleCreateRemise}
              handleShiftSeries={handleShiftSeries}
              handleDeleteEcheance={handleDeleteEcheance}
              toast={toast}
            />
          )}

          {/* ═══ ONGLET REMISES ═══ */}
          {tab === "remises" && (
            <OngletRemises
              remises={remises}
              downloadRemise={downloadRemise}
              markDeposited={markDeposited}
            />
          )}
        </>
      )}
    </div>
  );
}
