"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, Plus, X, Edit2, Pause, Play, XCircle, Home, FileText, CalendarDays, Euro,
} from "lucide-react";
import type { Family } from "@/types";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface Pension {
  id: string;
  familyId: string;
  familyName: string;
  equideId: string;
  equideName: string;
  formule: "mensuel" | "jour";
  tarif: number;                  // €/mois ou €/jour
  dateDebut: string;              // ISO YYYY-MM-DD
  dateFin: string | null;
  statut: "actif" | "suspendu" | "resilie";
  paymentMode: string;            // "sepa" | "cb" | "especes" | "cheque" | "virement"
  mandatSepaId?: string;
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

interface Equide {
  id: string;
  nom: string;
  familyId?: string;
  familyName?: string;
  proprietaire?: string;
  statut?: string;
}

const PAYMENT_MODES = [
  { id: "cb_terminal", label: "CB (TPE)" },
  { id: "especes", label: "Espèces" },
  { id: "cheque", label: "Chèque" },
  { id: "virement", label: "Virement" },
  { id: "prelevement_sepa", label: "Prélèvement SEPA" },
];

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

// ─────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────

export default function PensionsPage() {
  const { setAgentContext } = useAgentContext("pensions");

  // État principal
  const [pensions, setPensions] = useState<Pension[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [equides, setEquides] = useState<Equide[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"actif" | "suspendu" | "resilie" | "tous">("actif");
  const [search, setSearch] = useState("");

  // Modales
  const [editPension, setEditPension] = useState<Pension | null>(null);
  const [creating, setCreating] = useState(false);
  const [facturationModalOpen, setFacturationModalOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" | "warning" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Chargement ────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [pSnap, fSnap, eSnap] = await Promise.all([
        getDocs(collection(db, "pensions")),
        getDocs(collection(db, "families")),
        getDocs(collection(db, "equides")),
      ]);
      const ps = pSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Pension[];
      const fs = fSnap.docs.map(d => ({ firestoreId: d.id, ...(d.data() as any) })) as Family[];
      const es = eSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Equide[];
      setPensions(ps.sort((a, b) => (a.familyName || "").localeCompare(b.familyName || "")));
      setFamilies(fs.sort((a: any, b: any) => (a.parentName || "").localeCompare(b.parentName || "")));
      setEquides(es.filter(e => e.statut !== "sortie").sort((a, b) => (a.nom || "").localeCompare(b.nom || "")));
    } catch (e) {
      console.error("Chargement pensions:", e);
      showToast("Erreur de chargement", "error");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Contexte agent
  useEffect(() => {
    if (!loading) {
      setAgentContext({
        actives: pensions.filter(p => p.statut === "actif").length,
        suspendues: pensions.filter(p => p.statut === "suspendu").length,
        resiliees: pensions.filter(p => p.statut === "resilie").length,
        ca_mensuel_estime: pensions
          .filter(p => p.statut === "actif" && p.formule === "mensuel")
          .reduce((s, p) => s + (p.tarif || 0), 0),
      });
    }
  }, [pensions, loading, setAgentContext]);

  // ─── Filtrage ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = pensions;
    if (filter !== "tous") list = list.filter(p => p.statut === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.familyName || "").toLowerCase().includes(q) ||
        (p.equideName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [pensions, filter, search]);

  // ─── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const actives = pensions.filter(p => p.statut === "actif");
    const caMensuel = actives.filter(p => p.formule === "mensuel").reduce((s, p) => s + (p.tarif || 0), 0);
    return {
      total: pensions.length,
      actives: actives.length,
      suspendues: pensions.filter(p => p.statut === "suspendu").length,
      resiliees: pensions.filter(p => p.statut === "resilie").length,
      caMensuel,
    };
  }, [pensions]);

  // ─── Actions ───────────────────────────────────────────────────────
  const handleSuspend = async (p: Pension) => {
    if (!confirm(`Suspendre la pension de ${p.equideName} (${p.familyName}) ?`)) return;
    try {
      await updateDoc(doc(db, "pensions", p.id), { statut: "suspendu", updatedAt: serverTimestamp() });
      showToast("Pension suspendue");
      fetchData();
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, "error");
    }
  };

  const handleResume = async (p: Pension) => {
    if (!confirm(`Réactiver la pension de ${p.equideName} ?`)) return;
    try {
      await updateDoc(doc(db, "pensions", p.id), { statut: "actif", updatedAt: serverTimestamp() });
      showToast("Pension réactivée");
      fetchData();
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, "error");
    }
  };

  const handleResilier = async (p: Pension) => {
    const dateFin = prompt(`Date de fin pour la pension de ${p.equideName} ?\n\nFormat : AAAA-MM-JJ (laisser vide = aujourd'hui)`, new Date().toISOString().split("T")[0]);
    if (dateFin === null) return; // annulé
    const finalDate = dateFin.trim() || new Date().toISOString().split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) { showToast("Format date invalide (AAAA-MM-JJ)", "error"); return; }
    try {
      await updateDoc(doc(db, "pensions", p.id), {
        statut: "resilie",
        dateFin: finalDate,
        updatedAt: serverTimestamp(),
      });
      showToast(`Pension résiliée au ${finalDate}`);
      fetchData();
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, "error");
    }
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg font-body text-sm ${
          toast.type === "error" ? "bg-red-500 text-white" :
          toast.type === "warning" ? "bg-orange-500 text-white" :
          "bg-green-500 text-white"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800 flex items-center gap-2">
            <Home size={22} className="text-blue-500"/> Pensions
          </h1>
          <p className="font-body text-sm text-slate-600">Gestion des chevaux en pension dans le centre</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFacturationModalOpen(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-body text-sm font-semibold px-4 py-2 rounded-lg border-none cursor-pointer"
          >
            <FileText size={14}/> Générer factures du mois
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-body text-sm font-semibold px-4 py-2 rounded-lg border-none cursor-pointer"
          >
            <Plus size={14}/> Nouvelle pension
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Card padding="md"><div className="font-body text-xs text-slate-500">Actives</div><div className="font-display text-xl font-bold text-green-600">{stats.actives}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">Suspendues</div><div className="font-display text-xl font-bold text-orange-500">{stats.suspendues}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">Résiliées</div><div className="font-display text-xl font-bold text-slate-400">{stats.resiliees}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">CA mensuel estimé</div><div className="font-display text-xl font-bold text-blue-700">{stats.caMensuel.toFixed(0)}€</div></Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg border border-gray-200">
          {(["actif", "suspendu", "resilie", "tous"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md font-body text-xs font-semibold cursor-pointer border-none ${filter === f ? "bg-blue-500 text-white" : "bg-transparent text-slate-600"}`}>
              {f === "actif" ? "Actives" : f === "suspendu" ? "Suspendues" : f === "resilie" ? "Résiliées" : "Toutes"}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            type="text"
            placeholder="Rechercher famille ou poney…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-blue-500"/></div>
      ) : filtered.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="font-body text-sm text-slate-500">Aucune pension {filter !== "tous" ? `(${filter})` : ""}</p>
          <button onClick={() => setCreating(true)} className="mt-3 text-blue-500 underline cursor-pointer font-body text-sm bg-transparent border-none">Créer la première</button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(p => (
            <PensionRow
              key={p.id}
              pension={p}
              onEdit={() => setEditPension(p)}
              onSuspend={() => handleSuspend(p)}
              onResume={() => handleResume(p)}
              onResilier={() => handleResilier(p)}
            />
          ))}
        </div>
      )}

      {/* Modale création / édition */}
      {(creating || editPension) && (
        <PensionModal
          pension={editPension}
          families={families}
          equides={equides}
          onClose={() => { setCreating(false); setEditPension(null); }}
          onSaved={() => { setCreating(false); setEditPension(null); fetchData(); showToast(editPension ? "Pension modifiée" : "Pension créée"); }}
        />
      )}

      {/* Modale facturation mensuelle */}
      {facturationModalOpen && (
        <FacturationModal
          pensions={pensions.filter(p => p.statut === "actif")}
          onClose={() => setFacturationModalOpen(false)}
          onDone={(count) => { setFacturationModalOpen(false); showToast(`${count} facture(s) générée(s)`); fetchData(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Composant ligne pension
// ─────────────────────────────────────────────────────────────────────
function PensionRow({ pension, onEdit, onSuspend, onResume, onResilier }: {
  pension: Pension;
  onEdit: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onResilier: () => void;
}) {
  const statusColor = pension.statut === "actif" ? "green" : pension.statut === "suspendu" ? "orange" : "gray";
  return (
    <Card padding="md">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-body text-sm font-bold text-blue-800">{pension.equideName}</span>
            <Badge color={statusColor}>{pension.statut}</Badge>
            <span className="font-body text-[10px] text-slate-400">·</span>
            <span className="font-body text-[11px] text-slate-600">{pension.formule === "mensuel" ? "Mensuel" : "Au jour"}</span>
          </div>
          <div className="font-body text-xs text-slate-600">
            {pension.familyName} · depuis le {new Date(pension.dateDebut).toLocaleDateString("fr-FR")}
            {pension.dateFin && <> · jusqu'au {new Date(pension.dateFin).toLocaleDateString("fr-FR")}</>}
          </div>
          {pension.notes && <div className="font-body text-[11px] text-slate-500 italic mt-1">{pension.notes}</div>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="font-display text-base font-bold text-blue-700">{pension.tarif.toFixed(2)}€</div>
            <div className="font-body text-[10px] text-slate-500">/{pension.formule === "mensuel" ? "mois" : "jour"}</div>
          </div>
          <div className="flex gap-1">
            {pension.statut === "actif" && (
              <button onClick={onSuspend} title="Suspendre" className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 border-none cursor-pointer flex items-center justify-center"><Pause size={14} className="text-orange-600"/></button>
            )}
            {pension.statut === "suspendu" && (
              <button onClick={onResume} title="Réactiver" className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 border-none cursor-pointer flex items-center justify-center"><Play size={14} className="text-green-600"/></button>
            )}
            {pension.statut !== "resilie" && (
              <button onClick={onResilier} title="Résilier" className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 border-none cursor-pointer flex items-center justify-center"><XCircle size={14} className="text-red-500"/></button>
            )}
            <button onClick={onEdit} title="Modifier" className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border-none cursor-pointer flex items-center justify-center"><Edit2 size={14} className="text-blue-500"/></button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modale création / édition de pension
// ─────────────────────────────────────────────────────────────────────
function PensionModal({ pension, families, equides, onClose, onSaved }: {
  pension: Pension | null;
  families: Family[];
  equides: Equide[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!pension;
  const [familyId, setFamilyId] = useState(pension?.familyId || "");
  const [equideId, setEquideId] = useState(pension?.equideId || "");
  const [formule, setFormule] = useState<"mensuel" | "jour">(pension?.formule || "mensuel");
  const [tarif, setTarif] = useState(pension?.tarif || 0);
  const [dateDebut, setDateDebut] = useState(pension?.dateDebut || new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState(pension?.paymentMode || "virement");
  const [notes, setNotes] = useState(pension?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Quand on choisit une famille, on filtre les équidés à ceux qui lui appartiennent
  // (ou ceux sans famille assignée pour permettre de les rattacher)
  const equidesDisponibles = useMemo(() => {
    if (!familyId) return equides;
    return equides.filter(e =>
      e.familyId === familyId || !e.familyId
    );
  }, [equides, familyId]);

  const familyName = useMemo(() => {
    const f = families.find((f: any) => f.firestoreId === familyId) as any;
    return f?.parentName || f?.name || "";
  }, [families, familyId]);

  const equideName = useMemo(() => equides.find(e => e.id === equideId)?.nom || "", [equides, equideId]);

  const handleSave = async () => {
    setError("");
    if (!familyId) { setError("Sélectionne une famille"); return; }
    if (!equideId) { setError("Sélectionne un équidé"); return; }
    if (tarif <= 0) { setError("Le tarif doit être > 0"); return; }
    if (!dateDebut) { setError("Date de début requise"); return; }

    setSaving(true);
    try {
      const payload: any = {
        familyId, familyName,
        equideId, equideName,
        formule, tarif,
        dateDebut,
        dateFin: pension?.dateFin || null,
        statut: pension?.statut || "actif",
        paymentMode,
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      };
      if (isEdit) {
        await updateDoc(doc(db, "pensions", pension!.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "pensions"), payload);
      }

      // Lier l'équidé à la famille (cohérence : un équidé en pension EST forcément
      // d'une famille). Sans ça, le poney garderait sa string `proprietaire` libre
      // mais pas de `familyId` exploitable par d'autres modules (Feature 3 à venir).
      const eq = equides.find(e => e.id === equideId);
      if (eq && (!eq.familyId || eq.familyId !== familyId)) {
        await updateDoc(doc(db, "equides", equideId), {
          familyId,
          familyName,
          proprietaire: familyName,
        });
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2"><Home size={18}/> {isEdit ? "Modifier la pension" : "Nouvelle pension"}</h2>
              {isEdit && <p className="font-body text-xs text-slate-500 mt-1">{pension!.equideName} · {pension!.familyName}</p>}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Famille */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Famille propriétaire</label>
            <select value={familyId} onChange={e => { setFamilyId(e.target.value); setEquideId(""); }}
              disabled={isEdit}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white disabled:bg-gray-50">
              <option value="">— Choisir —</option>
              {families.map((f: any) => (
                <option key={f.firestoreId} value={f.firestoreId}>{f.parentName || f.name}</option>
              ))}
            </select>
          </div>

          {/* Équidé */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Équidé en pension</label>
            <select value={equideId} onChange={e => setEquideId(e.target.value)}
              disabled={isEdit || !familyId}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white disabled:bg-gray-50">
              <option value="">— Choisir —</option>
              {equidesDisponibles.map(e => (
                <option key={e.id} value={e.id}>{e.nom}{e.familyId && e.familyId !== familyId ? " (autre famille)" : ""}</option>
              ))}
            </select>
            <p className="font-body text-[10px] text-slate-500 mt-1">L'équidé sera lié à cette famille dans la cavalerie.</p>
          </div>

          {/* Formule et tarif */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Formule</label>
              <div className="flex gap-1">
                <button onClick={() => setFormule("mensuel")} className={`flex-1 px-3 py-2 rounded-lg border font-body text-xs font-semibold cursor-pointer ${formule === "mensuel" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>Mensuel</button>
                <button onClick={() => setFormule("jour")} className={`flex-1 px-3 py-2 rounded-lg border font-body text-xs font-semibold cursor-pointer ${formule === "jour" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>Au jour</button>
              </div>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Tarif (€{formule === "mensuel" ? "/mois" : "/jour"})</label>
              <input type="number" min={0} step={0.01} value={tarif} onChange={e => setTarif(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
            </div>
          </div>

          {/* Date début */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Date de début</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
          </div>

          {/* Mode de paiement */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Mode de paiement habituel</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white">
              {PAYMENT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Précisions sur le contrat, soins particuliers, etc."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-body text-xs text-red-700">{error}</div>}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-slate-700 font-body text-sm font-semibold border-none cursor-pointer">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin"/>}
            {isEdit ? "Enregistrer" : "Créer la pension"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modale facturation mensuelle
// ─────────────────────────────────────────────────────────────────────
function FacturationModal({ pensions, onClose, onDone }: {
  pensions: Pension[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  // Mois par défaut : mois en cours (factures pour ce mois-ci, payables le 1er)
  const now = new Date();
  const [moisIdx, setMoisIdx] = useState(now.getMonth());
  const [annee, setAnnee] = useState(now.getFullYear());

  // Pour les pensions "jour", l'admin saisit les jours réels du mois écoulé
  // (donc on suggère par défaut le mois PRÉCÉDENT pour cette catégorie).
  const [joursParPension, setJoursParPension] = useState<Record<string, number>>({});

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Sélection : par défaut toutes les pensions mensuelles. Les "jour" sont
  // cochables individuellement (faut saisir des jours).
  const [selected, setSelected] = useState<Set<string>>(
    new Set(pensions.filter(p => p.formule === "mensuel").map(p => p.id))
  );

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const total = useMemo(() => {
    let sum = 0;
    for (const p of pensions) {
      if (!selected.has(p.id)) continue;
      if (p.formule === "mensuel") sum += p.tarif;
      else sum += (joursParPension[p.id] || 0) * p.tarif;
    }
    return sum;
  }, [pensions, selected, joursParPension]);

  const handleGenerate = async () => {
    setError("");
    if (selected.size === 0) { setError("Sélectionne au moins une pension"); return; }

    // Pour les pensions "jour" sélectionnées, vérifier qu'on a saisi un nb de jours
    for (const p of pensions) {
      if (!selected.has(p.id)) continue;
      if (p.formule === "jour" && (!joursParPension[p.id] || joursParPension[p.id] <= 0)) {
        setError(`Saisir le nombre de jours pour ${p.equideName}`);
        return;
      }
    }

    setGenerating(true);
    let count = 0;
    try {
      for (const p of pensions) {
        if (!selected.has(p.id)) continue;
        const jours = p.formule === "jour" ? (joursParPension[p.id] || 0) : 0;
        const montant = p.formule === "mensuel" ? p.tarif : jours * p.tarif;
        const moisLabel = `${MOIS[moisIdx]} ${annee}`;
        const itemLabel = p.formule === "mensuel"
          ? `Pension ${p.equideName} — ${moisLabel}`
          : `Pension ${p.equideName} — ${jours} j en ${moisLabel}`;

        // ── Création du paiement pension ────────────────────────────
        // Catégorie spécifique pour distinguer du reste : item avec
        // `type:'pension'` et `pensionId` pour audit + filtrage des
        // rapports compta. Compte 70630110 TVA 5.5% (validé /admin/parametres).
        const tvaRate = 0.055;
        const priceHT = Math.round((montant / (1 + tvaRate)) * 100) / 100;

        await addDoc(collection(db, "payments"), {
          orderId: `PEN-${Date.now().toString(36).toUpperCase()}-${count}`,
          familyId: p.familyId,
          familyName: p.familyName,
          items: [{
            activityTitle: itemLabel,
            childId: null,
            childName: p.equideName,   // on met l'équidé en "child" pour cohérence avec l'UI
            priceHT,
            tva: 5.5,
            priceTTC: montant,
            type: "pension",
            pensionId: p.id,
            equideId: p.equideId,
            moisFacture: `${annee}-${String(moisIdx + 1).padStart(2, "0")}`,
            jours: p.formule === "jour" ? jours : null,
          }],
          totalTTC: montant,
          paymentMode: p.paymentMode,
          paymentRef: "",
          status: "pending",
          paidAmount: 0,
          pensionId: p.id,
          date: serverTimestamp(),
        });
        count++;
      }
      onDone(count);
    } catch (e: any) {
      setError(e.message || "Erreur");
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2"><FileText size={18}/> Générer les factures de pension</h2>
              <p className="font-body text-xs text-slate-500 mt-1">Crée un paiement <strong>pending</strong> par pension sélectionnée. L'encaissement se fait ensuite depuis Paiements.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
        </div>

        {/* Sélecteur mois */}
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <CalendarDays size={16} className="text-blue-500"/>
          <label className="font-body text-sm font-semibold text-slate-700">Mois facturé :</label>
          <select value={moisIdx} onChange={e => setMoisIdx(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
            {MOIS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value) || now.getFullYear())}
            className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
        </div>

        {/* Liste */}
        <div className="p-5 space-y-2">
          {pensions.length === 0 && (
            <p className="font-body text-sm text-slate-500 italic text-center py-6">Aucune pension active</p>
          )}
          {pensions.map(p => (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${selected.has(p.id) ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)}
                className="w-4 h-4 accent-blue-500 cursor-pointer"/>
              <div className="flex-1">
                <div className="font-body text-sm font-semibold text-blue-800">{p.equideName}</div>
                <div className="font-body text-xs text-slate-600">{p.familyName}</div>
              </div>
              {p.formule === "mensuel" ? (
                <div className="text-right">
                  <div className="font-body text-xs text-slate-500">Forfait mensuel</div>
                  <div className="font-display text-base font-bold text-blue-700">{p.tarif.toFixed(2)}€</div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={31} placeholder="Jours"
                    value={joursParPension[p.id] || ""}
                    onChange={e => setJoursParPension({ ...joursParPension, [p.id]: parseInt(e.target.value) || 0 })}
                    disabled={!selected.has(p.id)}
                    className="w-16 px-2 py-1 rounded border border-gray-200 font-body text-sm bg-white disabled:bg-gray-50 text-center"/>
                  <span className="font-body text-xs text-slate-500">j × {p.tarif}€</span>
                  <div className="font-display text-sm font-bold text-blue-700 w-20 text-right">
                    {((joursParPension[p.id] || 0) * p.tarif).toFixed(2)}€
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <div className="mx-5 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-body text-xs text-red-700">{error}</div>}

        <div className="p-5 border-t border-gray-100 flex justify-between items-center gap-3 flex-wrap">
          <div className="font-body text-sm">
            <span className="text-slate-500">Total à facturer :</span>
            <span className="ml-2 font-display text-lg font-bold text-blue-700">{total.toFixed(2)}€</span>
            <span className="ml-2 text-slate-400 text-xs">({selected.size} pension{selected.size > 1 ? "s" : ""})</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={generating} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-slate-700 font-body text-sm font-semibold border-none cursor-pointer">Annuler</button>
            <button onClick={handleGenerate} disabled={generating || selected.size === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
              {generating && <Loader2 size={14} className="animate-spin"/>}
              <Euro size={14}/> Générer les factures
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
