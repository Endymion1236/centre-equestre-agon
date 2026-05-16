"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, Plus, X, Edit2, Pause, Play, XCircle, RotateCw, FileText, CalendarDays, Euro,
} from "lucide-react";
import type { Family } from "@/types";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface Recurrence {
  id: string;
  familyId: string;
  familyName: string;
  label: string;                  // ex: "Pension Caramel"
  montantTTC: number;
  tvaRate: number;                // 5.5 ou 20
  jourFacturation: number;        // 1-28 (on évite 29-31 pour fiabilité)
  dateDebut: string;              // ISO YYYY-MM-DD
  dateFin: string | null;
  statut: "actif" | "suspendu" | "resilie";
  paymentMode: string;            // sepa, virement, cb, especes, cheque
  mandatSepaId?: string;
  facturesGenerees?: { mois: string; paymentId: string; generatedAt?: any }[];
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

const PAYMENT_MODES = [
  { id: "prelevement_sepa", label: "Prélèvement SEPA" },
  { id: "virement", label: "Virement" },
  { id: "cb_terminal", label: "CB (TPE)" },
  { id: "especes", label: "Espèces" },
  { id: "cheque", label: "Chèque" },
];

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

// ─────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────

export default function RecurrencesPage() {
  const { setAgentContext } = useAgentContext("recurrences");

  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"actif" | "suspendu" | "resilie" | "tous">("actif");
  const [search, setSearch] = useState("");

  const [editRec, setEditRec] = useState<Recurrence | null>(null);
  const [creating, setCreating] = useState(false);
  const [facturationOpen, setFacturationOpen] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" | "warning" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Chargement ────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rSnap, fSnap] = await Promise.all([
        getDocs(collection(db, "recurrences")),
        getDocs(collection(db, "families")),
      ]);
      const rs = rSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Recurrence[];
      const fs = fSnap.docs.map(d => ({ firestoreId: d.id, ...(d.data() as any) })) as Family[];
      setRecurrences(rs.sort((a, b) => (a.familyName || "").localeCompare(b.familyName || "")));
      setFamilies(fs.sort((a: any, b: any) => (a.parentName || "").localeCompare(b.parentName || "")));
    } catch (e) {
      console.error("Chargement recurrences:", e);
      showToast("Erreur de chargement", "error");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Contexte agent
  useEffect(() => {
    if (!loading) {
      setAgentContext({
        actives: recurrences.filter(r => r.statut === "actif").length,
        suspendues: recurrences.filter(r => r.statut === "suspendu").length,
        resiliees: recurrences.filter(r => r.statut === "resilie").length,
        ca_mensuel: recurrences
          .filter(r => r.statut === "actif")
          .reduce((s, r) => s + (r.montantTTC || 0), 0),
      });
    }
  }, [recurrences, loading, setAgentContext]);

  // ─── Filtrage ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = recurrences;
    if (filter !== "tous") list = list.filter(r => r.statut === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.familyName || "").toLowerCase().includes(q) ||
        (r.label || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [recurrences, filter, search]);

  const stats = useMemo(() => {
    const actives = recurrences.filter(r => r.statut === "actif");
    return {
      actives: actives.length,
      suspendues: recurrences.filter(r => r.statut === "suspendu").length,
      resiliees: recurrences.filter(r => r.statut === "resilie").length,
      caMensuel: actives.reduce((s, r) => s + (r.montantTTC || 0), 0),
    };
  }, [recurrences]);

  // ─── Actions ───────────────────────────────────────────────────────
  const handleSuspend = async (r: Recurrence) => {
    if (!confirm(`Suspendre la récurrence "${r.label}" (${r.familyName}) ?\n\nElle ne sera plus facturée automatiquement tant qu'elle est suspendue.`)) return;
    try {
      await updateDoc(doc(db, "recurrences", r.id), { statut: "suspendu", updatedAt: serverTimestamp() });
      showToast("Récurrence suspendue");
      fetchData();
    } catch (e: any) { showToast(`Erreur : ${e.message}`, "error"); }
  };

  const handleResume = async (r: Recurrence) => {
    if (!confirm(`Réactiver la récurrence "${r.label}" ?`)) return;
    try {
      await updateDoc(doc(db, "recurrences", r.id), { statut: "actif", updatedAt: serverTimestamp() });
      showToast("Récurrence réactivée");
      fetchData();
    } catch (e: any) { showToast(`Erreur : ${e.message}`, "error"); }
  };

  const handleResilier = async (r: Recurrence) => {
    const dateFin = prompt(`Date de fin pour "${r.label}" ?\n\nFormat : AAAA-MM-JJ`, new Date().toISOString().split("T")[0]);
    if (dateFin === null) return;
    const finalDate = dateFin.trim() || new Date().toISOString().split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) { showToast("Format date invalide", "error"); return; }
    try {
      await updateDoc(doc(db, "recurrences", r.id), {
        statut: "resilie", dateFin: finalDate, updatedAt: serverTimestamp(),
      });
      showToast(`Résiliée au ${finalDate}`);
      fetchData();
    } catch (e: any) { showToast(`Erreur : ${e.message}`, "error"); }
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

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800 flex items-center gap-2">
            <RotateCw size={22} className="text-blue-500"/> Récurrences
          </h1>
          <p className="font-body text-sm text-slate-600">Prestations mensuelles automatiques (pensions, cotisations, abonnements…)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFacturationOpen(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-body text-sm font-semibold px-4 py-2 rounded-lg border-none cursor-pointer">
            <FileText size={14}/> Générer factures du mois
          </button>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-body text-sm font-semibold px-4 py-2 rounded-lg border-none cursor-pointer">
            <Plus size={14}/> Nouvelle récurrence
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Card padding="md"><div className="font-body text-xs text-slate-500">Actives</div><div className="font-display text-xl font-bold text-green-600">{stats.actives}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">Suspendues</div><div className="font-display text-xl font-bold text-orange-500">{stats.suspendues}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">Résiliées</div><div className="font-display text-xl font-bold text-slate-400">{stats.resiliees}</div></Card>
        <Card padding="md"><div className="font-body text-xs text-slate-500">CA mensuel</div><div className="font-display text-xl font-bold text-blue-700">{stats.caMensuel.toFixed(0)}€</div></Card>
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
            type="text" placeholder="Rechercher famille ou libellé…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-blue-500"/></div>
      ) : filtered.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="font-body text-sm text-slate-500">Aucune récurrence {filter !== "tous" ? `(${filter})` : ""}</p>
          <button onClick={() => setCreating(true)} className="mt-3 text-blue-500 underline cursor-pointer font-body text-sm bg-transparent border-none">Créer la première</button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => (
            <RecurrenceRow key={r.id} recurrence={r}
              onEdit={() => setEditRec(r)}
              onSuspend={() => handleSuspend(r)}
              onResume={() => handleResume(r)}
              onResilier={() => handleResilier(r)}
            />
          ))}
        </div>
      )}

      {(creating || editRec) && (
        <RecurrenceModal
          recurrence={editRec} families={families}
          onClose={() => { setCreating(false); setEditRec(null); }}
          onSaved={() => { setCreating(false); setEditRec(null); fetchData(); showToast(editRec ? "Récurrence modifiée" : "Récurrence créée"); }}
        />
      )}

      {facturationOpen && (
        <FacturationModal
          recurrences={recurrences.filter(r => r.statut === "actif")}
          onClose={() => setFacturationOpen(false)}
          onDone={(count) => { setFacturationOpen(false); showToast(`${count} facture(s) générée(s)`); fetchData(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Ligne récurrence
// ─────────────────────────────────────────────────────────────────────
function RecurrenceRow({ recurrence, onEdit, onSuspend, onResume, onResilier }: {
  recurrence: Recurrence;
  onEdit: () => void; onSuspend: () => void; onResume: () => void; onResilier: () => void;
}) {
  const statusColor = recurrence.statut === "actif" ? "green" : recurrence.statut === "suspendu" ? "orange" : "gray";
  const nbFactures = recurrence.facturesGenerees?.length || 0;
  return (
    <Card padding="md">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-body text-sm font-bold text-blue-800">{recurrence.label}</span>
            <Badge color={statusColor}>{recurrence.statut}</Badge>
            <span className="font-body text-[10px] text-slate-400">·</span>
            <span className="font-body text-[11px] text-slate-600">facturé le {recurrence.jourFacturation} du mois</span>
            {nbFactures > 0 && <span className="font-body text-[10px] text-blue-500">· {nbFactures} facture{nbFactures > 1 ? "s" : ""} générée{nbFactures > 1 ? "s" : ""}</span>}
          </div>
          <div className="font-body text-xs text-slate-600">
            {recurrence.familyName} · depuis le {new Date(recurrence.dateDebut).toLocaleDateString("fr-FR")}
            {recurrence.dateFin && <> · jusqu'au {new Date(recurrence.dateFin).toLocaleDateString("fr-FR")}</>}
          </div>
          {recurrence.notes && <div className="font-body text-[11px] text-slate-500 italic mt-1">{recurrence.notes}</div>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="font-display text-base font-bold text-blue-700">{recurrence.montantTTC.toFixed(2)}€</div>
            <div className="font-body text-[10px] text-slate-500">TTC / mois (TVA {recurrence.tvaRate}%)</div>
          </div>
          <div className="flex gap-1">
            {recurrence.statut === "actif" && (
              <button onClick={onSuspend} title="Suspendre" className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 border-none cursor-pointer flex items-center justify-center"><Pause size={14} className="text-orange-600"/></button>
            )}
            {recurrence.statut === "suspendu" && (
              <button onClick={onResume} title="Réactiver" className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 border-none cursor-pointer flex items-center justify-center"><Play size={14} className="text-green-600"/></button>
            )}
            {recurrence.statut !== "resilie" && (
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
// Modale création / édition
// ─────────────────────────────────────────────────────────────────────
function RecurrenceModal({ recurrence, families, onClose, onSaved }: {
  recurrence: Recurrence | null;
  families: Family[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!recurrence;
  const [familyId, setFamilyId] = useState(recurrence?.familyId || "");
  const [label, setLabel] = useState(recurrence?.label || "");
  const [montantTTC, setMontantTTC] = useState(recurrence?.montantTTC || 0);
  const [tvaRate, setTvaRate] = useState(recurrence?.tvaRate || 5.5);
  const [jourFacturation, setJourFacturation] = useState(recurrence?.jourFacturation || 1);
  const [dateDebut, setDateDebut] = useState(recurrence?.dateDebut || new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState(recurrence?.paymentMode || "virement");
  const [notes, setNotes] = useState(recurrence?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const familyName = useMemo(() => {
    const f = families.find((f: any) => f.firestoreId === familyId) as any;
    return f?.parentName || f?.name || "";
  }, [families, familyId]);

  const handleSave = async () => {
    setError("");
    if (!familyId) { setError("Sélectionne une famille"); return; }
    if (!label.trim()) { setError("Saisis un libellé"); return; }
    if (montantTTC <= 0) { setError("Le montant doit être > 0"); return; }
    if (jourFacturation < 1 || jourFacturation > 28) { setError("Jour de facturation entre 1 et 28"); return; }

    setSaving(true);
    try {
      const payload: any = {
        familyId, familyName,
        label: label.trim(),
        montantTTC, tvaRate,
        jourFacturation,
        dateDebut,
        dateFin: recurrence?.dateFin || null,
        statut: recurrence?.statut || "actif",
        paymentMode,
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      };
      if (isEdit) {
        await updateDoc(doc(db, "recurrences", recurrence!.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        payload.facturesGenerees = [];
        await addDoc(collection(db, "recurrences"), payload);
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
              <h2 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2"><RotateCw size={18}/> {isEdit ? "Modifier la récurrence" : "Nouvelle récurrence"}</h2>
              {isEdit && <p className="font-body text-xs text-slate-500 mt-1">{recurrence!.label} · {recurrence!.familyName}</p>}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Famille */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Famille</label>
            <select value={familyId} onChange={e => setFamilyId(e.target.value)}
              disabled={isEdit}
              style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm disabled:bg-gray-50">
              <option value="" style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}>— Choisir —</option>
              {families.map((f: any) => (
                <option key={f.firestoreId} value={f.firestoreId} style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}>{f.parentName || f.name}</option>
              ))}
            </select>
          </div>

          {/* Libellé */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Libellé (apparaîtra sur la facture)</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Ex: Pension Caramel, Cotisation Pony Games…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
          </div>

          {/* Montant + TVA */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Montant TTC (€/mois)</label>
              <input type="number" min={0} step={0.01} value={montantTTC} onChange={e => setMontantTTC(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">TVA</label>
              <select value={tvaRate} onChange={e => setTvaRate(parseFloat(e.target.value))}
                style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm">
                <option value={5.5}>5,5%</option>
                <option value={20}>20%</option>
                <option value={0}>0%</option>
              </select>
            </div>
          </div>

          {/* Jour facturation + Date début */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Jour de facturation</label>
              <input type="number" min={1} max={28} value={jourFacturation} onChange={e => setJourFacturation(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
              <p className="font-body text-[10px] text-slate-500 mt-1">1-28 (évite les 29-31)</p>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Date de début</label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
            </div>
          </div>

          {/* Mode de paiement */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Mode de paiement habituel</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
              style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm">
              {PAYMENT_MODES.map(m => <option key={m.id} value={m.id} style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}>{m.label}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Précisions sur le contrat…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-body text-xs text-red-700">{error}</div>}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-slate-700 font-body text-sm font-semibold border-none cursor-pointer">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin"/>}
            {isEdit ? "Enregistrer" : "Créer la récurrence"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modale facturation manuelle (génère pour le mois en cours)
// ─────────────────────────────────────────────────────────────────────
function FacturationModal({ recurrences, onClose, onDone }: {
  recurrences: Recurrence[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const now = new Date();
  const [moisIdx, setMoisIdx] = useState(now.getMonth());
  const [annee, setAnnee] = useState(now.getFullYear());
  const moisKey = `${annee}-${String(moisIdx + 1).padStart(2, "0")}`;

  // Pré-cocher uniquement les récurrences qui n'ont pas DEJA une facture
  // pour le mois choisi (idempotence : on ne facture pas 2 fois le même mois).
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of recurrences) {
      const dejaFact = (r.facturesGenerees || []).some(f => f.mois === moisKey);
      if (!dejaFact) s.add(r.id);
    }
    return s;
  });

  // Recalcul quand on change de mois
  useEffect(() => {
    const s = new Set<string>();
    for (const r of recurrences) {
      const dejaFact = (r.facturesGenerees || []).some(f => f.mois === moisKey);
      if (!dejaFact) s.add(r.id);
    }
    setSelected(s);
  }, [moisIdx, annee, moisKey, recurrences]);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const total = useMemo(() => {
    let sum = 0;
    for (const r of recurrences) if (selected.has(r.id)) sum += r.montantTTC;
    return sum;
  }, [recurrences, selected]);

  const handleGenerate = async () => {
    setError("");
    if (selected.size === 0) { setError("Sélectionne au moins une récurrence"); return; }

    setGenerating(true);
    let count = 0;
    try {
      for (const r of recurrences) {
        if (!selected.has(r.id)) continue;
        const dejaFact = (r.facturesGenerees || []).some(f => f.mois === moisKey);
        if (dejaFact) continue; // garde-fou : ne jamais re-facturer

        const moisLabel = `${MOIS[moisIdx]} ${annee}`;
        const priceHT = Math.round((r.montantTTC / (1 + (r.tvaRate || 5.5) / 100)) * 100) / 100;

        const paymentDoc = await addDoc(collection(db, "payments"), {
          orderId: `REC-${Date.now().toString(36).toUpperCase()}-${count}`,
          familyId: r.familyId,
          familyName: r.familyName,
          items: [{
            activityTitle: `${r.label} — ${moisLabel}`,
            childId: null,
            childName: null,
            priceHT,
            tva: r.tvaRate,
            priceTTC: r.montantTTC,
            type: "recurrence",
            recurrenceId: r.id,
            moisFacture: moisKey,
          }],
          totalTTC: r.montantTTC,
          paymentMode: r.paymentMode,
          paymentRef: "",
          status: "pending",
          paidAmount: 0,
          recurrenceId: r.id,
          date: serverTimestamp(),
        });

        // Mettre à jour la récurrence : tracer la facture générée
        const newHistorique = [...(r.facturesGenerees || []), { mois: moisKey, paymentId: paymentDoc.id, generatedAt: new Date().toISOString() }];
        // Garder uniquement les 12 dernières pour limiter la taille du doc
        if (newHistorique.length > 12) newHistorique.shift();
        await updateDoc(doc(db, "recurrences", r.id), {
          facturesGenerees: newHistorique,
          updatedAt: serverTimestamp(),
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
              <h2 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2"><FileText size={18}/> Générer les factures du mois</h2>
              <p className="font-body text-xs text-slate-500 mt-1">Crée un paiement <strong>pending</strong> par récurrence sélectionnée. Les récurrences déjà facturées pour ce mois sont décochées par défaut.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
        </div>

        <div className="p-5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <CalendarDays size={16} className="text-blue-500"/>
          <label className="font-body text-sm font-semibold text-slate-700">Mois facturé :</label>
          <select value={moisIdx} onChange={e => setMoisIdx(parseInt(e.target.value))}
            style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 font-body text-sm">
            {MOIS.map((m, i) => <option key={i} value={i} style={{ color: "#1C2A3E", backgroundColor: "#ffffff" }}>{m}</option>)}
          </select>
          <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value) || now.getFullYear())}
            className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 font-body text-sm bg-white"/>
        </div>

        <div className="p-5 space-y-2">
          {recurrences.length === 0 && (
            <p className="font-body text-sm text-slate-500 italic text-center py-6">Aucune récurrence active</p>
          )}
          {recurrences.map(r => {
            const dejaFact = (r.facturesGenerees || []).some(f => f.mois === moisKey);
            return (
              <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border ${selected.has(r.id) ? "bg-blue-50 border-blue-200" : dejaFact ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200"}`}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"/>
                <div className="flex-1">
                  <div className="font-body text-sm font-semibold text-blue-800">{r.label}</div>
                  <div className="font-body text-xs text-slate-600">{r.familyName}</div>
                  {dejaFact && <div className="font-body text-[10px] text-orange-600 mt-0.5">⚠ Déjà facturée pour ce mois</div>}
                </div>
                <div className="font-display text-base font-bold text-blue-700">{r.montantTTC.toFixed(2)}€</div>
              </div>
            );
          })}
        </div>

        {error && <div className="mx-5 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-body text-xs text-red-700">{error}</div>}

        <div className="p-5 border-t border-gray-100 flex justify-between items-center gap-3 flex-wrap">
          <div className="font-body text-sm">
            <span className="text-slate-500">Total :</span>
            <span className="ml-2 font-display text-lg font-bold text-blue-700">{total.toFixed(2)}€</span>
            <span className="ml-2 text-slate-400 text-xs">({selected.size} récurrence{selected.size > 1 ? "s" : ""})</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={generating} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-slate-700 font-body text-sm font-semibold border-none cursor-pointer">Annuler</button>
            <button onClick={handleGenerate} disabled={generating || selected.size === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
              {generating && <Loader2 size={14} className="animate-spin"/>}
              <Euro size={14}/> Générer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
