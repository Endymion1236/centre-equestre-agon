"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, Loader2, Copy, Trash2, Play, Pause, Edit2 } from "lucide-react";

interface ModeleCreneau {
  dayOfWeek: number; // 0=lun, 1=mar, 2=mer, 3=jeu, 4=ven, 5=sam
  startTime: string;
  endTime: string;
  activityId: string;
  activityTitle: string;
  monitor: string;
  maxPlaces: number;
}

interface Modele {
  id: string;
  name: string;
  description: string;
  creneaux: ModeleCreneau[];
  status: "active" | "inactive";
  createdAt: any;
}

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONITORS = ["Emmeline", "Nicolas"];

export default function ModelesPage() {
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCreneaux, setFormCreneaux] = useState<ModeleCreneau[]>([]);

  // Apply modal
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyStart, setApplyStart] = useState("");
  const [applyEnd, setApplyEnd] = useState("");
  const [applyPreview, setApplyPreview] = useState(0);

  const fetchData = async () => {
    try {
      const [modSnap, actSnap] = await Promise.all([
        getDocs(collection(db, "modeles")),
        getDocs(collection(db, "activities")),
      ]);
      setModeles(modSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Modele[]);
      setActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addCreneau = () => {
    setFormCreneaux([...formCreneaux, { dayOfWeek: 2, startTime: "10:00", endTime: "11:00", activityId: "", activityTitle: "", monitor: "Emmeline", maxPlaces: 8 }]);
  };

  const updateCreneau = (idx: number, field: string, value: any) => {
    const updated = [...formCreneaux];
    (updated[idx] as any)[field] = value;
    if (field === "activityId") {
      const act = activities.find(a => a.id === value);
      updated[idx].activityTitle = act?.title || "";
    }
    setFormCreneaux(updated);
  };

  const removeCreneau = (idx: number) => setFormCreneaux(formCreneaux.filter((_, i) => i !== idx));

  const startEdit = (m: Modele) => {
    setEditingId(m.id);
    setFormName(m.name);
    setFormDesc(m.description || "");
    setFormCreneaux([...m.creneaux]);
    setShowForm(true);
  };

  const startNew = () => {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormCreneaux([]);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName) return;
    setSaving(true);
    const data: any = { name: formName, description: formDesc, creneaux: formCreneaux, status: "active", updatedAt: serverTimestamp() };
    if (editingId) {
      await updateDoc(doc(db, "modeles", editingId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "modeles"), data);
    }
    setShowForm(false);
    setSaving(false);
    fetchData();
  };

  const toggleStatus = async (m: Modele) => {
    await updateDoc(doc(db, "modeles", m.id), { status: m.status === "active" ? "inactive" : "active" });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce modèle ?")) return;
    await deleteDoc(doc(db, "modeles", id));
    fetchData();
  };

  // Calculate preview when dates change
  useEffect(() => {
    if (!applyStart || !applyEnd || !applyingId) { setApplyPreview(0); return; }
    const modele = modeles.find(m => m.id === applyingId);
    if (!modele) return;
    let count = 0;
    const start = new Date(applyStart);
    const end = new Date(applyEnd);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDay = d.getDay(); // 0=dim, 1=lun
      const ourDay = jsDay === 0 ? 6 : jsDay - 1; // 0=lun
      count += modele.creneaux.filter(c => c.dayOfWeek === ourDay).length;
    }
    setApplyPreview(count);
  }, [applyStart, applyEnd, applyingId]);

  const handleApply = async () => {
    const modele = modeles.find(m => m.id === applyingId);
    if (!modele || !applyStart || !applyEnd) return;
    setSaving(true);
    const start = new Date(applyStart);
    const end = new Date(applyEnd);
    let created = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDay = d.getDay();
      const ourDay = jsDay === 0 ? 6 : jsDay - 1;
      const matchingCreneaux = modele.creneaux.filter(c => c.dayOfWeek === ourDay);
      for (const c of matchingCreneaux) {
        await addDoc(collection(db, "creneaux"), {
          date: d.toISOString().split("T")[0],
          startTime: c.startTime,
          endTime: c.endTime,
          activityId: c.activityId,
          activityTitle: c.activityTitle,
          activityType: activities.find(a => a.id === c.activityId)?.type || "cours",
          monitor: c.monitor,
          maxPlaces: c.maxPlaces,
          enrolled: [],
          status: "open",
          source: `modele:${modele.name}`,
          createdAt: serverTimestamp(),
        });
        created++;
      }
    }
    alert(`✅ ${created} créneaux générés avec succès !`);
    setApplyingId(null);
    setApplyStart("");
    setApplyEnd("");
    setSaving(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Modèles de reprises</h1>
          <p className="font-body text-xs text-gray-400">Créez des semaines types pour générer votre planning en quelques clics</p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau modèle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <Card padding="md" className="mb-6 !border-blue-500/20">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">{editingId ? "Modifier le modèle" : "Nouveau modèle"}</h3>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Nom du modèle *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Semaine type — Période scolaire"
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Description</label>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Ex: Mer + Sam, hors vacances"
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Créneaux ({formCreneaux.length})</div>
          <div className="flex flex-col gap-2 mb-4">
            {formCreneaux.map((c, i) => (
              <div key={i} className="flex items-center gap-2 bg-sand rounded-lg px-3 py-2">
                <select value={c.dayOfWeek} onChange={e => updateCreneau(i, "dayOfWeek", Number(e.target.value))}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white w-24">
                  {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
                </select>
                <input type="time" value={c.startTime} onChange={e => updateCreneau(i, "startTime", e.target.value)}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white w-24" />
                <span className="text-gray-400 text-xs">→</span>
                <input type="time" value={c.endTime} onChange={e => updateCreneau(i, "endTime", e.target.value)}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white w-24" />
                <select value={c.activityId} onChange={e => updateCreneau(i, "activityId", e.target.value)}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white flex-1">
                  <option value="">Activité...</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                <select value={c.monitor} onChange={e => updateCreneau(i, "monitor", e.target.value)}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white w-28">
                  {MONITORS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <input type="number" value={c.maxPlaces} onChange={e => updateCreneau(i, "maxPlaces", Number(e.target.value))}
                  className="px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-white w-16 text-center" min={1} max={20} />
                <span className="font-body text-[10px] text-gray-400">pl.</span>
                <button onClick={() => removeCreneau(i)} className="text-red-400 bg-transparent border-none cursor-pointer hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={addCreneau} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer mb-4">+ Ajouter un créneau</button>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!formName || saving}
              className="font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-40">
              {saving ? "..." : editingId ? "Mettre à jour" : "Créer le modèle"}
            </button>
            <button onClick={() => setShowForm(false)} className="font-body text-sm text-gray-500 bg-white px-6 py-2.5 rounded-xl border border-gray-200 cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {/* Apply modal */}
      {applyingId && (
        <Card padding="md" className="mb-6 !border-gold-400/30 !bg-gold-50/30">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-3">📅 Appliquer le modèle : {modeles.find(m => m.id === applyingId)?.name}</h3>
          <p className="font-body text-xs text-gray-500 mb-4">Choisissez la période sur laquelle générer les créneaux.</p>
          <div className="flex gap-4 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Du</label>
              <input type="date" value={applyStart} onChange={e => setApplyStart(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Au</label>
              <input type="date" value={applyEnd} onChange={e => setApplyEnd(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:outline-none" />
            </div>
          </div>
          {applyPreview > 0 && (
            <div className="font-body text-sm text-blue-800 bg-blue-50 rounded-lg px-4 py-3 mb-4">
              ⚡ Cela va créer <strong>{applyPreview} créneaux</strong> sur la période sélectionnée.
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleApply} disabled={!applyStart || !applyEnd || saving}
              className="font-body text-sm font-semibold text-white bg-gold-500 px-6 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-40">
              {saving ? "Génération..." : `Générer ${applyPreview} créneaux`}
            </button>
            <button onClick={() => setApplyingId(null)} className="font-body text-sm text-gray-500 bg-white px-6 py-2.5 rounded-xl border border-gray-200 cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {/* List */}
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      modeles.length === 0 && !showForm ? (
        <Card padding="lg" className="text-center">
          <span className="text-4xl block mb-3">📋</span>
          <p className="font-body text-sm text-gray-500 mb-3">Aucun modèle de reprise. Créez votre premier modèle de semaine type !</p>
          <button onClick={startNew} className="font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-xl border-none cursor-pointer">Créer un modèle</button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {modeles.map(m => (
            <Card key={m.id} padding="md">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-body text-base font-semibold text-blue-800">{m.name}</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">
                    {m.description || "Pas de description"} · {m.creneaux.length} créneaux/semaine
                    {m.creneaux.length > 0 && ` · ${[...new Set(m.creneaux.map(c => DAYS[c.dayOfWeek]))].join(", ")}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={m.status === "active" ? "green" : "gray"}>{m.status === "active" ? "Actif" : "Inactif"}</Badge>
                  <button onClick={() => toggleStatus(m)} className="text-gray-400 bg-transparent border-none cursor-pointer hover:text-blue-500" title={m.status === "active" ? "Désactiver" : "Activer"}>
                    {m.status === "active" ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => startEdit(m)} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => setApplyingId(m.id)} className="font-body text-xs font-semibold text-gold-600 bg-gold-50 px-4 py-1.5 rounded-lg border-none cursor-pointer">
                    Appliquer
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="text-gray-300 bg-transparent border-none cursor-pointer hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              {/* Preview creneaux */}
              {m.creneaux.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.creneaux.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)).map((c, i) => (
                    <span key={i} className="font-body text-[11px] text-gray-500 bg-sand px-2.5 py-1 rounded-md">
                      {DAYS[c.dayOfWeek].slice(0, 3)} {c.startTime}–{c.endTime} · {c.activityTitle || "?"} · {c.monitor} · {c.maxPlaces}pl.
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
