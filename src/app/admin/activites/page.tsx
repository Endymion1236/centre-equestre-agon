"use client";

import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, Pencil, Trash2, Copy, X, Check, Loader2 } from "lucide-react";
import type { Activity, ActivityType } from "@/types";

const activityTypes: { id: ActivityType | string; label: string; emoji: string }[] = [
  { id: "stage", label: "Stage semaine", emoji: "🏇" },
  { id: "stage_journee", label: "Stage journée", emoji: "📅" },
  { id: "balade", label: "Balade", emoji: "🌅" },
  { id: "cours", label: "Cours régulier", emoji: "📅" },
  { id: "competition", label: "Compétition", emoji: "🏆" },
  { id: "anniversaire", label: "Anniversaire", emoji: "🎂" },
  { id: "ponyride", label: "Pony ride", emoji: "🐴" },
];

const defaultActivity: Partial<Activity> = {
  type: "stage",
  title: "",
  description: "",
  ageMin: 3,
  ageMax: null,
  galopRequired: null,
  priceHT: 0,
  tvaTaux: 10,
  maxPlaces: 8,
  schedule: "",
  seasonPeriod: "",
  active: true,
  articles: [],
};

function ActivityForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<Activity>;
  onSave: (data: Partial<Activity>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-body text-base font-semibold text-blue-800">
          {initial.title ? "Modifier l'activité" : "Nouvelle activité"}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Type */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Type d&apos;activité</label>
          <div className="flex flex-wrap gap-2">
            {activityTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => update("type", t.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all font-body
                  ${form.type === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"}
                `}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title + Schedule */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Titre *</label>
            <input
              value={form.title || ""}
              onChange={(e) => update("title", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              placeholder="Ex: Galop de Bronze"
            />
          </div>
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Horaires</label>
            <input
              value={form.schedule || ""}
              onChange={(e) => update("schedule", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              placeholder="Ex: Lun–Ven · 10h–12h"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Description</label>
          <textarea
            value={form.description || ""}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none resize-y"
            placeholder="Description de l'activité..."
          />
        </div>

        {/* Age + Galop + Places */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[100px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Âge min</label>
            <input
              type="number"
              value={form.ageMin || 3}
              onChange={(e) => update("ageMin", parseInt(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Âge max</label>
            <input
              type="number"
              value={form.ageMax || ""}
              onChange={(e) => update("ageMax", e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              placeholder="Illimité"
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Galop requis</label>
            <select
              value={form.galopRequired || ""}
              onChange={(e) => update("galopRequired", e.target.value || null)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            >
              <option value="">Aucun</option>
              <option value="Bronze">Bronze</option>
              <option value="Argent">Argent</option>
              <option value="Or">Or</option>
              <option value="G1">Galop 1</option>
              <option value="G2">Galop 2</option>
              <option value="G3">Galop 3</option>
              <option value="G4">Galop 4</option>
            </select>
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places max</label>
            <input
              type="number"
              value={form.maxPlaces || 8}
              onChange={(e) => update("maxPlaces", parseInt(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Price + TVA + Season */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix HT (€)</label>
            <input
              type="number"
              step="0.01"
              value={form.priceHT || 0}
              onChange={(e) => update("priceHT", parseFloat(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">TVA (%)</label>
            <select
              value={form.tvaTaux || 10}
              onChange={(e) => update("tvaTaux", parseFloat(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            >
              <option value={5.5}>5.5%</option>
              <option value={10}>10%</option>
              <option value={20}>20%</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Période</label>
            <input
              value={form.seasonPeriod || ""}
              onChange={(e) => update("seasonPeriod", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              placeholder="Ex: Toutes vacances"
            />
          </div>
        </div>

        {/* Prix TTC calculé */}
        <div className="bg-blue-50 rounded-lg p-3 flex justify-between items-center">
          <span className="font-body text-sm text-blue-800">Prix TTC calculé :</span>
          <span className="font-body text-lg font-bold text-blue-500">
            {((form.priceHT || 0) * (1 + (form.tvaTaux || 10) / 100)).toFixed(2)}€
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!form.title || saving}
            className={`
              flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer transition-all
              ${!form.title || saving ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}
            `}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? "Enregistrement..." : initial.title ? "Mettre à jour" : "Créer l'activité"}
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-lg font-body text-sm font-medium text-gray-500 bg-white border border-gray-200 cursor-pointer hover:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function AdminActivitesPage() {
  const [activities, setActivities] = useState<(Activity & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<(Activity & { firestoreId: string }) | null>(null);

  const fetchActivities = async () => {
    try {
      const snap = await getDocs(query(collection(db, "activities"), orderBy("createdAt", "desc")));
      const data = snap.docs.map((d) => ({
        firestoreId: d.id,
        ...d.data(),
      })) as (Activity & { firestoreId: string })[];
      setActivities(data);
    } catch (e) {
      console.error("Erreur chargement activités:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleCreate = async (data: Partial<Activity>) => {
    await addDoc(collection(db, "activities"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    setShowForm(false);
    fetchActivities();
  };

  const handleUpdate = async (data: Partial<Activity>) => {
    if (!editingActivity) return;
    const ref = doc(db, "activities", editingActivity.firestoreId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    setEditingActivity(null);
    fetchActivities();
  };

  const handleToggleActive = async (activity: Activity & { firestoreId: string }) => {
    const ref = doc(db, "activities", activity.firestoreId);
    await updateDoc(ref, { active: !activity.active });
    fetchActivities();
  };

  const handleDelete = async (activity: Activity & { firestoreId: string }) => {
    if (!confirm(`Supprimer "${activity.title}" ?`)) return;
    await deleteDoc(doc(db, "activities", activity.firestoreId));
    fetchActivities();
  };

  const handleDuplicate = async (activity: Activity & { firestoreId: string }) => {
    const { firestoreId, ...data } = activity;
    await addDoc(collection(db, "activities"), {
      ...data,
      title: `${data.title} (copie)`,
      createdAt: serverTimestamp(),
    });
    fetchActivities();
  };

  const filtered = filter === "all" ? activities : activities.filter((a) => a.type === filter);

  const typeEmoji = (type: string) => activityTypes.find((t) => t.id === type)?.emoji || "📌";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Gestion des activités</h1>
        <button
          onClick={() => { setShowForm(true); setEditingActivity(null); }}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 transition-colors"
        >
          <Plus size={16} />
          Nouvelle activité
        </button>
      </div>

      {/* Create/Edit form */}
      {(showForm || editingActivity) && (
        <ActivityForm
          initial={editingActivity || defaultActivity}
          onSave={editingActivity ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingActivity(null); }}
        />
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[{ id: "all", label: "Toutes" }, ...activityTypes].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id)}
            className={`
              font-body text-xs font-medium px-4 py-2 rounded-full border cursor-pointer transition-all
              ${filter === cat.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"}
            `}
          >
            {"emoji" in cat ? `${cat.emoji} ` : ""}{cat.label}
            <span className="ml-1 opacity-50">
              {cat.id === "all" ? activities.length : activities.filter((a) => a.type === cat.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Activities list */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-4xl block mb-3">📋</span>
          <p className="font-body text-sm text-gray-500 mb-4">
            {filter === "all"
              ? "Aucune activité créée. Commencez par créer votre première activité !"
              : "Aucune activité dans cette catégorie."}
          </p>
          {filter === "all" && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Créer ma première activité
            </Button>
          )}
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* Table header */}
          <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex items-center font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <span className="flex-1 min-w-[180px]">Activité</span>
            <span className="w-20 text-center hidden sm:block">Âge</span>
            <span className="w-20 text-center hidden sm:block">Prix TTC</span>
            <span className="w-16 text-center hidden sm:block">Places</span>
            <span className="w-20 text-center">Statut</span>
            <span className="w-24 text-right">Actions</span>
          </div>

          {/* Rows */}
          {filtered.map((activity) => {
            const priceTTC = (activity.priceHT || 0) * (1 + (activity.tvaTaux || 10) / 100);
            return (
              <div
                key={activity.firestoreId}
                className="px-5 py-3.5 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors"
              >
                <div className="flex-1 min-w-[180px] flex items-center gap-3">
                  <span className="text-lg">{typeEmoji(activity.type)}</span>
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{activity.title}</div>
                    <div className="font-body text-xs text-gray-400">
                      {activity.schedule} · {activity.seasonPeriod}
                    </div>
                  </div>
                </div>
                <span className="w-20 text-center font-body text-xs text-gray-500 hidden sm:block">
                  {activity.ageMin}–{activity.ageMax || "∞"} ans
                </span>
                <span className="w-20 text-center font-body text-sm font-semibold text-blue-500 hidden sm:block">
                  {priceTTC > 0 ? `${priceTTC.toFixed(0)}€` : "—"}
                </span>
                <span className="w-16 text-center font-body text-sm text-gray-500 hidden sm:block">
                  {activity.maxPlaces}
                </span>
                <span className="w-20 text-center">
                  <button
                    onClick={() => handleToggleActive(activity)}
                    className="bg-transparent border-none cursor-pointer"
                    title={activity.active ? "Désactiver" : "Activer"}
                  >
                    <Badge color={activity.active ? "green" : "gray"}>
                      {activity.active ? "Actif" : "Inactif"}
                    </Badge>
                  </button>
                </span>
                <span className="w-24 flex justify-end gap-1">
                  <button
                    onClick={() => { setEditingActivity(activity); setShowForm(false); }}
                    className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer transition-colors"
                    title="Modifier"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDuplicate(activity)}
                    className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer transition-colors"
                    title="Dupliquer"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(activity)}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
