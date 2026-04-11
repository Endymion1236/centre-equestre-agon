"use client";
import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Trash2, Save, Copy, Edit2, ChevronDown, ChevronUp, Clock, User, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type {
  ModelePlanning, TacheModele, TacheType, Salarie,
  JourSemaine, CategorieTache, TachePlanifiee,
} from "./types";
import { JOURS, JOURS_LABELS, CATEGORIES, fmtDuree } from "./types";

interface Props {
  modeles: ModelePlanning[];
  tachesType: TacheType[];
  salaries: Salarie[];
  onRefresh: () => void;
}

const TYPE_OPTIONS = [
  { id: "scolaire", label: "Période scolaire", emoji: "📚", color: "#2050A0" },
  { id: "vacances", label: "Vacances scolaires", emoji: "☀️", color: "#d97706" },
  { id: "autre",    label: "Autre",             emoji: "📌", color: "#6b7280" },
] as const;

const COULEURS = ["#2050A0", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#6b7280"];

const TIME_SLOTS = Array.from({ length: (20 - 7) * 4 + 1 }, (_, i) => {
  const totalMin = 7 * 60 + i * 15;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
});

export default function TabModeles({ modeles, tachesType, salaries, onRefresh }: Props) {
  const { toast } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Formulaire création/édition ─────────────────────────────────────
  const [form, setForm] = useState({
    nom: "",
    description: "",
    type: "scolaire" as "scolaire" | "vacances" | "autre",
    couleur: "#2050A0",
    taches: [] as TacheModele[],
  });
  const [saving, setSaving] = useState(false);

  // Ajout de tâche dans le modèle
  const [addJour, setAddJour] = useState<JourSemaine | null>(null);
  const [addForm, setAddForm] = useState({
    tacheTypeId: "",
    salarieId: "",
    heureDebut: "08:00",
    dureeMinutes: 30,
  });

  const activeSalaries = salaries.filter(s => s.actif);

  // ── Handlers ────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({ nom: "", description: "", type: "scolaire", couleur: "#2050A0", taches: [] });
    setEditId(null);
    setShowCreate(false);
    setAddJour(null);
  };

  const openEdit = (m: ModelePlanning) => {
    setForm({
      nom: m.nom,
      description: m.description || "",
      type: m.type,
      couleur: m.couleur,
      taches: [...m.taches],
    });
    setEditId(m.id);
    setShowCreate(true);
    setAddJour(null);
  };

  const addTacheToForm = () => {
    if (!addJour || !addForm.tacheTypeId || !addForm.salarieId) return;
    const tt = tachesType.find(t => t.id === addForm.tacheTypeId);
    const sal = activeSalaries.find(s => s.id === addForm.salarieId);
    if (!tt || !sal) return;

    const newTache: TacheModele = {
      tacheTypeId: tt.id,
      tacheLabel: tt.label,
      categorie: tt.categorie,
      salarieId: sal.id,
      salarieName: sal.nom,
      jour: addJour,
      heureDebut: addForm.heureDebut,
      dureeMinutes: addForm.dureeMinutes,
    };

    setForm(prev => ({ ...prev, taches: [...prev.taches, newTache] }));
    setAddJour(null);
    setAddForm({ tacheTypeId: "", salarieId: "", heureDebut: "08:00", dureeMinutes: 30 });
  };

  const removeTacheFromForm = (idx: number) => {
    setForm(prev => ({ ...prev, taches: prev.taches.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { toast("Nom du modèle requis", "error"); return; }
    setSaving(true);
    try {
      const data = {
        nom: form.nom.trim(),
        description: form.description.trim(),
        type: form.type,
        couleur: form.couleur,
        taches: form.taches,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "modeles-planning", editId), data);
        toast("Modèle mis à jour", "success");
      } else {
        await addDoc(collection(db, "modeles-planning"), { ...data, createdAt: serverTimestamp() });
        toast("Modèle créé", "success");
      }
      resetForm();
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast("Erreur lors de la sauvegarde", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce modèle ?")) return;
    try {
      await deleteDoc(doc(db, "modeles-planning", id));
      toast("Modèle supprimé", "success");
      onRefresh();
    } catch (e) {
      toast("Erreur suppression", "error");
    }
  };

  const handleDuplicate = async (m: ModelePlanning) => {
    try {
      await addDoc(collection(db, "modeles-planning"), {
        nom: `${m.nom} (copie)`,
        description: m.description || "",
        type: m.type,
        couleur: m.couleur,
        taches: m.taches,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast("Modèle dupliqué", "success");
      onRefresh();
    } catch (e) {
      toast("Erreur duplication", "error");
    }
  };

  // ── Grouper les tâches par jour ─────────────────────────────────────
  const groupByJour = (taches: TacheModele[]) => {
    const grouped: Record<JourSemaine, TacheModele[]> = {} as any;
    JOURS.forEach(j => grouped[j] = []);
    taches.forEach(t => {
      if (grouped[t.jour]) grouped[t.jour].push(t);
    });
    return grouped;
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + bouton créer */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-body text-xs text-slate-500">
            Créez des plannings types (scolaire, vacances…) et appliquez-les en 1 clic.
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg border-none cursor-pointer font-body text-sm font-medium hover:bg-blue-400"
          >
            <Plus size={16} /> Nouveau modèle
          </button>
        )}
      </div>

      {/* ── Formulaire création/édition ────────────────────────────────── */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">
              {editId ? "Modifier le modèle" : "Nouveau modèle"}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">
              <X size={18} />
            </button>
          </div>

          {/* Infos de base */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="font-body text-xs text-gray-500 mb-1 block">Nom du modèle</label>
              <input
                value={form.nom}
                onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex: Semaine scolaire"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-body text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-body text-xs text-gray-500 mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-body text-sm focus:border-blue-400 focus:outline-none"
              >
                {TYPE_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-gray-500 mb-1 block">Couleur</label>
              <div className="flex gap-2 mt-1">
                {COULEURS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(p => ({ ...p, couleur: c }))}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer ${form.couleur === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="font-body text-xs text-gray-500 mb-1 block">Description (optionnel)</label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Ex: Planning standard hors vacances, du lundi au samedi"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg font-body text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* ── Tâches du modèle par jour ──────────────────────────────── */}
          <h4 className="font-body text-sm font-semibold text-blue-800 mb-3 mt-5">
            Tâches du modèle ({form.taches.length})
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {JOURS.map(jour => {
              const jourTaches = form.taches.filter(t => t.jour === jour);
              return (
                <div key={jour} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-body text-xs font-semibold text-blue-800">{JOURS_LABELS[jour]}</span>
                    <button
                      onClick={() => setAddJour(addJour === jour ? null : jour)}
                      className="text-blue-500 bg-transparent border-none cursor-pointer hover:text-blue-400"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {jourTaches.length === 0 && (
                    <p className="font-body text-[10px] text-gray-400 italic">Aucune tâche</p>
                  )}

                  {jourTaches.map((t, idx) => {
                    const realIdx = form.taches.indexOf(t);
                    const cat = CATEGORIES.find(c => c.id === t.categorie);
                    return (
                      <div key={idx} className="flex items-center gap-1 bg-white rounded px-2 py-1.5 mb-1 text-[11px]">
                        <span>{cat?.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body font-medium text-gray-800 truncate">{t.tacheLabel}</div>
                          <div className="font-body text-gray-400">{t.heureDebut} · {fmtDuree(t.dureeMinutes)} · {t.salarieName}</div>
                        </div>
                        <button
                          onClick={() => removeTacheFromForm(realIdx)}
                          className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Formulaire d'ajout inline */}
                  {addJour === jour && (
                    <div className="mt-2 bg-blue-50 rounded-lg p-2 space-y-2">
                      <select
                        value={addForm.tacheTypeId}
                        onChange={e => setAddForm(p => ({ ...p, tacheTypeId: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded font-body text-xs"
                      >
                        <option value="">— Tâche —</option>
                        {tachesType.map(t => (
                          <option key={t.id} value={t.id}>{CATEGORIES.find(c => c.id === t.categorie)?.emoji} {t.label}</option>
                        ))}
                      </select>
                      <select
                        value={addForm.salarieId}
                        onChange={e => setAddForm(p => ({ ...p, salarieId: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded font-body text-xs"
                      >
                        <option value="">— Salarié —</option>
                        {activeSalaries.map(s => (
                          <option key={s.id} value={s.id}>{s.nom}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <select
                          value={addForm.heureDebut}
                          onChange={e => setAddForm(p => ({ ...p, heureDebut: e.target.value }))}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded font-body text-xs"
                        >
                          {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select
                          value={addForm.dureeMinutes}
                          onChange={e => setAddForm(p => ({ ...p, dureeMinutes: Number(e.target.value) }))}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded font-body text-xs"
                        >
                          {[15,30,45,60,90,120,180,240,300,360,420,480].map(d => (
                            <option key={d} value={d}>{fmtDuree(d)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={addTacheToForm}
                          disabled={!addForm.tacheTypeId || !addForm.salarieId}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 text-white rounded font-body text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                        >
                          <Plus size={12} /> Ajouter
                        </button>
                        <button
                          onClick={() => setAddJour(null)}
                          className="px-2 py-1.5 bg-gray-200 text-gray-600 rounded font-body text-xs border-none cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Boutons sauvegarder */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !form.nom.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg font-body text-sm font-medium border-none cursor-pointer hover:bg-blue-400 disabled:opacity-40"
            >
              <Save size={16} /> {saving ? "Enregistrement..." : editId ? "Mettre à jour" : "Créer le modèle"}
            </button>
            <button
              onClick={resetForm}
              className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-body text-sm border-none cursor-pointer hover:bg-gray-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Liste des modèles existants ─────────────────────────────────── */}
      {modeles.length === 0 && !showCreate && (
        <div className="text-center py-16 bg-slate-50 rounded-xl">
          <span className="text-4xl block mb-3">📋</span>
          <p className="font-body text-sm text-gray-500 mb-4">Aucun modèle de planning créé.</p>
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-lg font-body text-sm font-medium border-none cursor-pointer hover:bg-blue-400"
          >
            Créer le premier modèle
          </button>
        </div>
      )}

      <div className="space-y-3">
        {modeles.map(m => {
          const typeInfo = TYPE_OPTIONS.find(t => t.id === m.type) || TYPE_OPTIONS[2];
          const isExpanded = expandedId === m.id;
          const grouped = groupByJour(m.taches);
          const joursAvecTaches = JOURS.filter(j => grouped[j].length > 0);
          const totalMinutes = m.taches.reduce((s, t) => s + t.dureeMinutes, 0);
          const nbSalaries = new Set(m.taches.map(t => t.salarieId)).size;

          return (
            <div key={m.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* En-tête */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
              >
                <div className="w-3 h-10 rounded-full" style={{ backgroundColor: m.couleur }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm font-semibold text-blue-800">{m.nom}</span>
                    <span className="font-body text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: typeInfo.color + "15", color: typeInfo.color }}>
                      {typeInfo.emoji} {typeInfo.label}
                    </span>
                  </div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">
                    {m.taches.length} tâche{m.taches.length > 1 ? "s" : ""} · {joursAvecTaches.length} jour{joursAvecTaches.length > 1 ? "s" : ""} · {fmtDuree(totalMinutes)} total · {nbSalaries} salarié{nbSalaries > 1 ? "s" : ""}
                    {m.description && ` · ${m.description}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(m); }}
                    className="p-2 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer"
                    title="Modifier"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDuplicate(m); }}
                    className="p-2 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer"
                    title="Dupliquer"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                    className="p-2 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Détail des tâches par jour */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {JOURS.map(jour => {
                      const jourTaches = grouped[jour].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                      if (jourTaches.length === 0) return null;
                      return (
                        <div key={jour} className="bg-slate-50 rounded-lg p-3">
                          <div className="font-body text-xs font-semibold text-blue-800 mb-2">{JOURS_LABELS[jour]}</div>
                          {jourTaches.map((t, i) => {
                            const cat = CATEGORIES.find(c => c.id === t.categorie);
                            return (
                              <div key={i} className="flex items-center gap-2 bg-white rounded px-2 py-1.5 mb-1">
                                <span className="text-xs">{cat?.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-body text-[11px] font-medium text-gray-800 truncate">{t.tacheLabel}</div>
                                  <div className="font-body text-[10px] text-gray-400 flex items-center gap-1">
                                    <Clock size={9} /> {t.heureDebut} · {fmtDuree(t.dureeMinutes)}
                                    <User size={9} className="ml-1" /> {t.salarieName}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
