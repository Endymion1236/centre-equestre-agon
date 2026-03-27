"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, Pencil, Trash2, Copy, X, Check, Loader2 } from "lucide-react";
import type { Activity, ActivityType } from "@/types";

// ── Définition catégories + sous-catégories ─────────────────────────────────

const NIVEAUX_EQUITATION = [
  "Baby 3/4 ans", "Baby 4,5/5,5 ans",
  "Galop Bronze", "Galop Argent", "Galop Or",
  "Galop 3", "Galop 4", "Galop 5", "Galop 6", "Galop 7",
];

const SUBCATEGORIES: Record<string, string[]> = {
  cours:         NIVEAUX_EQUITATION,
  stage:         NIVEAUX_EQUITATION,
  stage_journee: NIVEAUX_EQUITATION,
  balade: [
    "Promenade journée — Débutant",
    "Promenade journée — Débrouillé",
    "Promenade journée — Confirmé",
    "Coucher de soleil — Débutant",
    "Coucher de soleil — Débrouillé",
    "Coucher de soleil — Confirmé",
  ],
  competition: ["Pony Games", "CSO", "Équifun", "Endurance", "Hunter"],
  anniversaire: [],
};

const activityTypes = [
  { id: "cours",         label: "Cours régulier" },
  { id: "stage",         label: "Stage semaine" },
  { id: "stage_journee", label: "Stage journée" },
  { id: "balade",        label: "Promenade" },
  { id: "competition",   label: "Compétition" },
  { id: "anniversaire",  label: "Anniversaire" },
];

const defaultActivity: Partial<Activity> & { priceTTC?: number } = {
  type: "cours", title: "", description: "",
  ageMin: 3, ageMax: null, galopRequired: null,
  priceHT: 0, tvaTaux: 5.5, maxPlaces: 8,
  schedule: "", seasonPeriod: "", active: true, articles: [], priceTTC: 0,
};

const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

// ── Formulaire ───────────────────────────────────────────────────────────────

function ActivityForm({ initial, onSave, onCancel }: {
  initial: Partial<Activity> & { priceTTC?: number; subcategories?: string[] };
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<any>({ subcategories: [], ...initial });
  const [saving, setSaving] = useState(false);
  const update = (f: string, v: any) => setForm((p: any) => ({ ...p, [f]: v }));

  const subcats = SUBCATEGORIES[form.type] || [];

  const toggleSubcat = (s: string) => {
    const curr: string[] = form.subcategories || [];
    update("subcategories", curr.includes(s) ? curr.filter((x: string) => x !== s) : [...curr, s]);
  };

  // Réinitialiser les sous-catégories si le type change
  const changeType = (t: string) => {
    setForm((p: any) => ({ ...p, type: t, subcategories: [] }));
  };

  const handleSubmit = async () => {
    if (!form.title) return;
    setSaving(true);
    const priceTTC = form.priceTTC || 0;
    const tvaTaux = form.tvaTaux || 5.5;
    const priceHT = priceTTC / (1 + tvaTaux / 100);
    await onSave({ ...form, priceHT: Math.round(priceHT * 100) / 100, priceTTC });
    setSaving(false);
  };

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-body text-base font-semibold text-blue-800">
          {initial.title ? "Modifier l'activité" : "Nouvelle activité"}
        </h3>
        <button onClick={onCancel} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20} /></button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Catégorie */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Catégorie</label>
          <div className="flex flex-wrap gap-2">
            {activityTypes.map(t => (
              <button key={t.id} onClick={() => changeType(t.id)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all font-body
                  ${form.type === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-500 border-gray-200 hover:border-blue-200"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sous-catégories */}
        {subcats.length > 0 && (
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-2">
              Niveaux / Sous-catégories <span className="text-slate-400 font-normal">(plusieurs possibles)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {subcats.map(s => {
                const sel = (form.subcategories || []).includes(s);
                return (
                  <button key={s} onClick={() => toggleSubcat(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all font-body
                      ${sel ? "bg-gold-400 text-blue-800 border-gold-400" : "bg-white text-slate-500 border-gray-200 hover:border-gold-300"}`}>
                    {sel && <Check size={11} />}{s}
                  </button>
                );
              })}
            </div>
            {(form.subcategories || []).length === 0 && (
              <p className="font-body text-xs text-orange-500 mt-1.5">⚠️ Sélectionnez au moins une sous-catégorie</p>
            )}
          </div>
        )}

        {/* Titre + Horaires */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Titre *</label>
            <input value={form.title || ""} onChange={e => update("title", e.target.value)} className={inp} placeholder="Ex: Galop Argent mercredi" />
          </div>
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Horaires</label>
            <input value={form.schedule || ""} onChange={e => update("schedule", e.target.value)} className={inp} placeholder="Ex: Mer · 14h–16h" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Description</label>
          <textarea value={form.description || ""} onChange={e => update("description", e.target.value)} rows={2}
            className={`${inp} resize-y`} placeholder="Description de l'activité..." />
        </div>

        {/* Âge + Galop + Places */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[90px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Âge min</label>
            <input type="number" value={form.ageMin || 3} onChange={e => update("ageMin", parseInt(e.target.value))} className={inp} />
          </div>
          <div className="flex-1 min-w-[90px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Âge max</label>
            <input type="number" value={form.ageMax || ""} onChange={e => update("ageMax", e.target.value ? parseInt(e.target.value) : null)} className={inp} placeholder="Illimité" />
          </div>
          <div className="flex-1 min-w-[90px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places max</label>
            <input type="number" value={form.maxPlaces || 8} onChange={e => update("maxPlaces", parseInt(e.target.value))} className={inp} />
          </div>
        </div>

        {/* Prix + TVA */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix TTC (€)</label>
            <input type="number" step="0.01" value={form.priceTTC || 0} onChange={e => update("priceTTC", parseFloat(e.target.value))} className={inp} />
          </div>
          <div className="flex-1 min-w-[90px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">TVA (%)</label>
            <select value={form.tvaTaux || 5.5} onChange={e => update("tvaTaux", parseFloat(e.target.value))} className={inp}>
              <option value={5.5}>5,5%</option>
              <option value={10}>10%</option>
              <option value={20}>20%</option>
              <option value={0}>0%</option>
            </select>
          </div>
          <div className="flex-1 min-w-[90px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Période</label>
            <input value={form.seasonPeriod || ""} onChange={e => update("seasonPeriod", e.target.value)} className={inp} placeholder="Ex: Juil–Août" />
          </div>
        </div>

        {/* Tarifs multi-jours pour stages */}
        {(form.type === "stage" || form.type === "stage_journee") && (
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Tarifs dégressifs (stages multi-jours)</label>
            <div className="flex gap-2 flex-wrap">
              {[["price1day","1 jour"],["price2days","2 jours"],["price3days","3 jours"],["price4days","4 jours"]].map(([field, label]) => (
                <div key={field} className="flex-1 min-w-[90px]">
                  <label className="font-body text-[10px] text-slate-500 block mb-1">{label} (€)</label>
                  <input type="number" step="0.01" value={(form as any)[field] || ""} onChange={e => update(field, parseFloat(e.target.value) || null)} className={inp} placeholder="—" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actif */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.active !== false} onChange={e => update("active", e.target.checked)} className="w-4 h-4 accent-blue-500" />
          <span className="font-body text-sm text-slate-600">Activité active (visible dans le planning)</span>
        </label>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={handleSubmit} disabled={!form.title || saving}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
              ${!form.title || saving ? "bg-gray-200 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {initial.title ? "Enregistrer" : "Créer l'activité"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function ActivitesPage() {
  const [activities, setActivities] = useState<(Activity & { firestoreId: string; priceTTC?: number; subcategories?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editActivity, setEditActivity] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const fetchActivities = async () => {
    const snap = await getDocs(query(collection(db, "activities"), orderBy("title")));
    setActivities(snap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    setLoading(false);
  };

  useEffect(() => { fetchActivities(); }, []);

  const handleSave = async (data: any) => {
    const { firestoreId, ...rest } = data;
    const payload = { ...rest, updatedAt: serverTimestamp() };
    if (firestoreId) {
      await updateDoc(doc(db, "activities", firestoreId), payload);
    } else {
      await addDoc(collection(db, "activities"), { ...payload, createdAt: serverTimestamp() });
    }
    await fetchActivities();
    setShowForm(false);
    setEditActivity(null);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Supprimer "${title}" ?\n\nLes créneaux existants ne seront pas affectés.`)) return;
    await deleteDoc(doc(db, "activities", id));
    await fetchActivities();
  };

  const handleDuplicate = async (act: any) => {
    const { firestoreId, ...rest } = act;
    await addDoc(collection(db, "activities"), { ...rest, title: `${act.title} (copie)`, createdAt: serverTimestamp() });
    await fetchActivities();
  };

  const filtered = filterType === "all" ? activities : activities.filter(a => a.type === filterType);

  const typeLabel = (type: string) => activityTypes.find(t => t.id === type)?.label || type;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Gestion des activités</h1>
          <p className="font-body text-sm text-slate-500 mt-1">Définissez vos activités, catégories et sous-catégories</p>
        </div>
        <button onClick={() => { setEditActivity(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouvelle activité
        </button>
      </div>

      {/* Formulaire */}
      {(showForm || editActivity) && (
        <ActivityForm
          initial={editActivity || defaultActivity}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditActivity(null); }}
        />
      )}

      {/* Filtres par catégorie */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[{ id: "all", label: `Toutes ${activities.length}` }, ...activityTypes.map(t => ({ id: t.id, label: `${t.label} ${activities.filter(a => a.type === t.id).length}` }))].map(f => (
          <button key={f.id} onClick={() => setFilterType(f.id)}
            className={`px-4 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all
              ${filterType === f.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200 hover:border-blue-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="font-body text-sm text-slate-500">Aucune activité dans cette catégorie.</p>
        </Card>
      ) : (
        <Card padding="sm">
          <div className="px-5 py-3 border-b border-blue-500/8 grid grid-cols-12 gap-4">
            <div className="col-span-5 font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Activité</div>
            <div className="col-span-3 font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Sous-catégories</div>
            <div className="col-span-2 font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Prix</div>
            <div className="col-span-2 font-body text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</div>
          </div>
          {filtered.map(act => (
            <div key={act.firestoreId} className="px-5 py-3.5 border-b border-blue-500/8 last:border-0 grid grid-cols-12 gap-4 items-center hover:bg-blue-50/30">
              <div className="col-span-5">
                <div className="font-body text-sm font-semibold text-blue-800">{act.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-body text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{typeLabel(act.type)}</span>
                  <Badge color={act.active !== false ? "green" : "gray"}>{act.active !== false ? "Actif" : "Inactif"}</Badge>
                </div>
              </div>
              <div className="col-span-3">
                {(act.subcategories || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {(act.subcategories || []).slice(0, 3).map((s: string) => (
                      <span key={s} className="font-body text-[10px] bg-gold-50 text-gold-700 border border-gold-200 px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                    {(act.subcategories || []).length > 3 && (
                      <span className="font-body text-[10px] text-slate-400">+{(act.subcategories || []).length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="font-body text-xs text-slate-300 italic">—</span>
                )}
              </div>
              <div className="col-span-2">
                <div className="font-body text-sm font-semibold text-blue-500">{(act.priceTTC || 0).toFixed(0)}€</div>
                {act.ageMin && <div className="font-body text-[10px] text-slate-400">dès {act.ageMin} ans</div>}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1">
                <button onClick={() => { setEditActivity(act); setShowForm(false); }} title="Modifier"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 bg-transparent border-none cursor-pointer">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDuplicate(act)} title="Dupliquer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 bg-transparent border-none cursor-pointer">
                  <Copy size={14} />
                </button>
                <button onClick={() => handleDelete(act.firestoreId, act.title)} title="Supprimer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
