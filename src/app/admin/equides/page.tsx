"use client";
import { useState, useEffect, useRef } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, GripVertical, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Equide {
  id: string;
  name: string;
  type: "cheval" | "poney";
  status: "actif" | "sorti" | "deces" | "indisponible";
  ordre: number;
}

const TYPE_LABELS: Record<string, string> = { cheval: "Cheval", poney: "Poney" };
const STATUS_COLORS: Record<string, "green" | "gray" | "red" | "orange"> = {
  actif: "green", sorti: "gray", deces: "red", indisponible: "orange",
};
const STATUS_LABELS: Record<string, string> = {
  actif: "Actif", sorti: "Sorti", deces: "Décédé", indisponible: "Indisponible",
};

const INITIAL_EQUIDES = [
  { name: "Sircee", type: "poney" as const },
  { name: "Batz",   type: "poney" as const },
  { name: "Ultim",  type: "poney" as const },
  { name: "Rose",   type: "poney" as const },
  { name: "Gucci",  type: "poney" as const },
  { name: "Galaxy", type: "poney" as const },
  { name: "Caramel",type: "poney" as const },
  { name: "Java",   type: "poney" as const },
  { name: "Joy",    type: "poney" as const },
  { name: "Joey",   type: "poney" as const },
  { name: "Joystar",type: "poney" as const },
  { name: "LPP",    type: "poney" as const },
];

export default function EquidesPage() {
  const { toast } = useToast();
  const [equides, setEquides] = useState<Equide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Drag & drop state
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Equide>>({});

  // New equide form
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<{ name: string; type: "cheval" | "poney"; status: "actif" | "sorti" | "deces" | "indisponible" }>({ name: "", type: "poney", status: "actif" });

  const fetchData = async () => {
    try {
      const snap = await getDocs(collection(db, "equides"));
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Equide))
        .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
      setEquides(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Seed initial data si collection vide ──────────────────────────────────
  const seedEquides = async () => {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      INITIAL_EQUIDES.forEach((eq, i) => {
        const ref = doc(collection(db, "equides"));
        batch.set(ref, { name: eq.name, type: eq.type, status: "actif", ordre: i, createdAt: serverTimestamp() });
      });
      await batch.commit();
      toast("✅ Équidés initialisés depuis la liste par défaut", "success");
      fetchData();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSeeding(false);
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
    // Réorganiser visuellement pendant le drag
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const updated = [...equides];
    const [moved] = updated.splice(dragIdx.current, 1);
    updated.splice(idx, 0, moved);
    dragIdx.current = idx;
    setEquides(updated);
  };
  const handleDrop = async () => {
    // Persist new order
    setSaving(true);
    try {
      const batch = writeBatch(db);
      equides.forEach((eq, i) => {
        batch.update(doc(db, "equides", eq.id), { ordre: i });
      });
      await batch.commit();
      toast("Ordre sauvegardé", "success");
    } catch (e: any) { toast(`Erreur sauvegarde : ${e.message}`, "error"); }
    dragIdx.current = null;
    dragOverIdx.current = null;
    setSaving(false);
  };

  // ── Inline edit ───────────────────────────────────────────────────────────
  const startEdit = (eq: Equide) => { setEditId(eq.id); setEditForm({ name: eq.name, type: eq.type, status: eq.status }); };
  const cancelEdit = () => { setEditId(null); setEditForm({}); };
  const saveEdit = async (eq: Equide) => {
    if (!editForm.name?.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "equides", eq.id), { name: editForm.name!.trim(), type: editForm.type, status: editForm.status, updatedAt: serverTimestamp() });
      toast("Équidé modifié", "success");
      setEditId(null);
      fetchData();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  // ── Create ────────────────────────────────────────────────────────────────
  const createEquide = async () => {
    if (!newForm.name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "equides"), {
        name: newForm.name.trim(), type: newForm.type, status: newForm.status,
        ordre: equides.length, createdAt: serverTimestamp(),
      });
      toast(`${newForm.name} ajouté`, "success");
      setShowNew(false);
      setNewForm({ name: "", type: "poney", status: "actif" });
      fetchData();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteEquide = async (eq: Equide) => {
    if (!confirm(`Supprimer ${eq.name} ? Cette action est irréversible.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "equides", eq.id));
      toast(`${eq.name} supprimé`, "success");
      fetchData();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  const chevaux = equides.filter(e => e.type === "cheval");
  const poneys  = equides.filter(e => e.type !== "cheval");

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Équidés</h1>
          <p className="font-body text-xs text-slate-500">
            Gérez la cavalerie · glissez-déposez pour réordonner l'affichage du montoir TV
          </p>
        </div>
        <div className="flex gap-2">
          {saving && <Loader2 size={18} className="animate-spin text-blue-400 self-center" />}
          <button
            onClick={() => { setShowNew(true); setEditId(null); }}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-500"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      {/* Seed si vide */}
      {!loading && equides.length === 0 && (
        <Card padding="lg" className="text-center mb-6">
          <span className="text-4xl block mb-3">🐴</span>
          <p className="font-body text-sm text-slate-500 mb-4">
            La collection <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">equides</code> est vide.
            <br />Initialisez-la avec la liste par défaut (Sircee, Batz, Ultim…)
          </p>
          <button
            onClick={seedEquides}
            disabled={seeding}
            className="font-body text-sm font-semibold text-white bg-green-500 px-6 py-2.5 rounded-xl border-none cursor-pointer hover:bg-green-600 disabled:opacity-50"
          >
            {seeding ? <><Loader2 size={14} className="inline animate-spin mr-2" />Initialisation...</> : "🚀 Initialiser les équidés par défaut"}
          </button>
        </Card>
      )}

      {/* Formulaire ajout */}
      {showNew && (
        <Card padding="md" className="mb-4 border-blue-200 bg-blue-50/30">
          <div className="font-body text-sm font-semibold text-blue-800 mb-3">Nouvel équidé</div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="font-body text-xs text-slate-500">Nom</label>
              <input
                autoFocus
                value={newForm.name}
                onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                onKeyDown={e => e.key === "Enter" && createEquide()}
                placeholder="Ex: Sultan"
                className="px-3 py-2 rounded-lg border border-blue-200 font-body text-sm focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-body text-xs text-slate-500">Type</label>
              <select
                value={newForm.type}
                onChange={e => setNewForm({ ...newForm, type: e.target.value as "cheval" | "poney" })}
                className="px-3 py-2 rounded-lg border border-blue-200 font-body text-sm focus:outline-none bg-white"
              >
                <option value="poney">Poney</option>
                <option value="cheval">Cheval</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-body text-xs text-slate-500">Statut</label>
              <select
                value={newForm.status}
                onChange={e => setNewForm({ ...newForm, status: e.target.value as any })}
                className="px-3 py-2 rounded-lg border border-blue-200 font-body text-sm focus:outline-none bg-white"
              >
                <option value="actif">Actif</option>
                <option value="indisponible">Indisponible</option>
                <option value="sorti">Sorti</option>
                <option value="deces">Décédé</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createEquide}
                disabled={!newForm.name.trim() || saving}
                className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-blue-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-500 disabled:opacity-50"
              >
                <Check size={16} /> Créer
              </button>
              <button
                onClick={() => { setShowNew(false); setNewForm({ name: "", type: "poney", status: "actif" }); }}
                className="flex items-center gap-1.5 font-body text-sm text-slate-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"
              >
                <X size={16} /> Annuler
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : equides.length > 0 ? (
        <>
          {/* Stats */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="font-body text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">
              🐎 {chevaux.length} cheval{chevaux.length > 1 ? "x" : ""}
            </div>
            <div className="font-body text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-semibold">
              🐴 {poneys.length} poney{poneys.length > 1 ? "s" : ""}
            </div>
            <div className="font-body text-xs bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg">
              {equides.filter(e => e.status === "actif").length} actif{equides.filter(e => e.status === "actif").length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Instruction drag */}
          <div className="font-body text-xs text-slate-400 mb-3 flex items-center gap-1.5">
            <GripVertical size={14} />
            Glissez les lignes pour modifier l'ordre d'affichage sur l'écran TV du montoir
          </div>

          {/* Liste drag & drop */}
          <div className="flex flex-col gap-1.5">
            {equides.map((eq, idx) => (
              <div
                key={eq.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={handleDrop}
                className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none hover:border-blue-200 hover:shadow-sm transition-all"
                style={{ opacity: dragIdx.current === idx ? 0.5 : 1 }}
              >
                {/* Handle */}
                <GripVertical size={18} className="text-slate-300 flex-shrink-0" />

                {/* Numéro */}
                <span className="font-body text-xs text-slate-300 w-5 text-right flex-shrink-0">{idx + 1}</span>

                {editId === eq.id ? (
                  /* ── Mode édition ── */
                  <div className="flex flex-wrap gap-2 items-center flex-1">
                    <input
                      autoFocus
                      value={editForm.name || ""}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(eq); if (e.key === "Escape") cancelEdit(); }}
                      className="px-2 py-1.5 rounded-lg border border-blue-300 font-body text-sm focus:outline-none w-32"
                    />
                    <select
                      value={editForm.type || "poney"}
                      onChange={e => setEditForm({ ...editForm, type: e.target.value as "cheval" | "poney" })}
                      className="px-2 py-1.5 rounded-lg border border-blue-300 font-body text-sm focus:outline-none"
                    >
                      <option value="poney">Poney</option>
                      <option value="cheval">Cheval</option>
                    </select>
                    <select
                      value={editForm.status || "actif"}
                      onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                      className="px-2 py-1.5 rounded-lg border border-blue-300 font-body text-sm focus:outline-none"
                    >
                      <option value="actif">Actif</option>
                      <option value="indisponible">Indisponible</option>
                      <option value="sorti">Sorti</option>
                      <option value="deces">Décédé</option>
                    </select>
                    <button
                      onClick={() => saveEdit(eq)}
                      disabled={saving}
                      className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-green-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-600"
                    >
                      <Check size={14} /> OK
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 font-body text-xs text-slate-500 bg-gray-100 px-3 py-1.5 rounded-lg border-none cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  /* ── Mode affichage ── */
                  <>
                    <span className="font-body text-sm font-semibold text-blue-800 flex-1">{eq.name}</span>
                    <Badge color={eq.type === "cheval" ? "blue" : "green"}>
                      {eq.type === "cheval" ? "🐎" : "🐴"} {TYPE_LABELS[eq.type]}
                    </Badge>
                    <Badge color={STATUS_COLORS[eq.status] || "gray"}>
                      {STATUS_LABELS[eq.status] || eq.status}
                    </Badge>
                    <div className="flex gap-1 ml-1">
                      <button
                        onClick={() => startEdit(eq)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteEquide(eq)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <p className="font-body text-xs text-slate-400 mt-4 text-center">
            L'ordre ici définit l'ordre des lignes sur l'écran TV du montoir
          </p>
        </>
      ) : null}
    </div>
  );
}
