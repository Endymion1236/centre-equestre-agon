"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, Loader2, Copy, Trash2, Play, Pause, Edit2 } from "lucide-react";
import { compareCreneauxByDow } from "@/lib/creneau-sort";

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

/**
 * Modèle de stage multi-jours.
 *
 * Différent du modèle de reprise hebdo : ici on ne stocke pas un dayOfWeek
 * (lun/mar/mer...) mais un nombre de jours et des horaires uniques pour
 * tout le stage. À l'application, l'admin choisit la date de début et
 * l'option "skip week-end" — chaque jour génère 1 créneau.
 *
 * Les horaires sont identiques pour tous les jours (par décision UX :
 * on simplifie). Si besoin de personnaliser un jour précis, l'admin le
 * fait dans le planning après application (déjà supporté).
 */
interface ModeleStage {
  id: string;
  name: string;
  description: string;
  nbJours: number;
  startTime: string;
  endTime: string;
  activityId: string;
  activityTitle: string;
  monitor: string;
  maxPlaces: number;
  status: "active" | "inactive";
  createdAt: any;
}

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
// Moniteurs chargés depuis Firestore dans useEffect

export default function ModelesPage() {
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [modelesStages, setModelesStages] = useState<ModeleStage[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showStageForm, setShowStageForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moniteurs, setMoniteurs] = useState<string[]>([]);

  useEffect(() => {
    getDocs(collection(db, "moniteurs")).then(snap => {
      const noms = snap.docs.map(d => (d.data() as any).name).filter(Boolean).sort();
      setMoniteurs(noms);
    });
  }, []);

  // Form state — modèle reprise hebdo
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCreneaux, setFormCreneaux] = useState<ModeleCreneau[]>([]);

  // Form state — modèle stage multi-jours
  const [stageFormName, setStageFormName] = useState("");
  const [stageFormDesc, setStageFormDesc] = useState("");
  const [stageFormNbJours, setStageFormNbJours] = useState(5);
  const [stageFormStartTime, setStageFormStartTime] = useState("10:00");
  const [stageFormEndTime, setStageFormEndTime] = useState("17:00");
  const [stageFormActivityId, setStageFormActivityId] = useState("");
  const [stageFormMonitor, setStageFormMonitor] = useState("");
  const [stageFormMaxPlaces, setStageFormMaxPlaces] = useState(8);

  // Apply modal — reprise hebdo
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyStart, setApplyStart] = useState("");
  const [applyEnd, setApplyEnd] = useState("");
  const [applyPreview, setApplyPreview] = useState(0);

  // Apply modal — stage multi-jours
  const [applyingStageId, setApplyingStageId] = useState<string | null>(null);
  const [stageApplyStart, setStageApplyStart] = useState("");
  const [stageApplySkipWeekend, setStageApplySkipWeekend] = useState(true);

  const fetchData = async () => {
    try {
      const [modSnap, stageSnap, actSnap] = await Promise.all([
        getDocs(collection(db, "modeles")),
        getDocs(collection(db, "modeles_stages")),
        getDocs(collection(db, "activities")),
      ]);
      setModeles(modSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Modele[]);
      setModelesStages(stageSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ModeleStage[]);
      setActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addCreneau = () => {
    setFormCreneaux([...formCreneaux, { dayOfWeek: 2, startTime: "10:00", endTime: "11:00", activityId: "", activityTitle: "", monitor: moniteurs[0] || "", maxPlaces: 8 }]);
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

  // ─── HANDLERS pour les modèles de stages multi-jours ────────────────────
  const openStageForm = (s?: ModeleStage) => {
    if (s) {
      setEditingStageId(s.id);
      setStageFormName(s.name);
      setStageFormDesc(s.description);
      setStageFormNbJours(s.nbJours);
      setStageFormStartTime(s.startTime);
      setStageFormEndTime(s.endTime);
      setStageFormActivityId(s.activityId);
      setStageFormMonitor(s.monitor);
      setStageFormMaxPlaces(s.maxPlaces);
    } else {
      setEditingStageId(null);
      setStageFormName("");
      setStageFormDesc("");
      setStageFormNbJours(5);
      setStageFormStartTime("10:00");
      setStageFormEndTime("17:00");
      setStageFormActivityId("");
      setStageFormMonitor(moniteurs[0] || "");
      setStageFormMaxPlaces(8);
    }
    setShowStageForm(true);
  };

  const handleStageSave = async () => {
    if (!stageFormName || !stageFormActivityId || stageFormNbJours < 1) return;
    const act = activities.find(a => a.id === stageFormActivityId);
    if (!act) return;
    setSaving(true);
    const data: any = {
      name: stageFormName,
      description: stageFormDesc,
      nbJours: stageFormNbJours,
      startTime: stageFormStartTime,
      endTime: stageFormEndTime,
      activityId: stageFormActivityId,
      activityTitle: act.title,
      monitor: stageFormMonitor,
      maxPlaces: stageFormMaxPlaces,
      status: "active",
      updatedAt: serverTimestamp(),
    };
    if (editingStageId) {
      await updateDoc(doc(db, "modeles_stages", editingStageId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "modeles_stages"), data);
    }
    setShowStageForm(false);
    setSaving(false);
    fetchData();
  };

  const toggleStageStatus = async (s: ModeleStage) => {
    await updateDoc(doc(db, "modeles_stages", s.id), { status: s.status === "active" ? "inactive" : "active" });
    fetchData();
  };

  const handleStageDelete = async (id: string) => {
    if (!confirm("Supprimer ce modèle de stage ?")) return;
    await deleteDoc(doc(db, "modeles_stages", id));
    fetchData();
  };

  /**
   * Applique un modèle de stage à partir d'une date de début. Génère nbJours
   * créneaux consécutifs (en sautant les week-ends si l'option est cochée).
   * Si on saute, on continue jusqu'à atteindre nbJours jours valides.
   * Tous les créneaux générés partagent le même activityType (=stage), ce qui
   * permet à EnrollPanel de les détecter comme un stage multi-jours via
   * activityType + dates consécutives + même activityId.
   */
  const handleStageApply = async () => {
    const stage = modelesStages.find(s => s.id === applyingStageId);
    if (!stage || !stageApplyStart) return;
    const act = activities.find(a => a.id === stage.activityId);
    if (!act) { alert("L'activité associée au modèle est introuvable. Le stage ne peut pas être créé."); return; }
    setSaving(true);
    const start = new Date(stageApplyStart);
    const dates: string[] = [];
    const cur = new Date(start);
    while (dates.length < stage.nbJours) {
      const day = cur.getDay(); // 0=dim, 6=sam
      const isWeekend = day === 0 || day === 6;
      if (!stageApplySkipWeekend || !isWeekend) {
        dates.push(cur.toISOString().split("T")[0]);
      }
      cur.setDate(cur.getDate() + 1);
    }
    let created = 0;
    for (const d of dates) {
      await addDoc(collection(db, "creneaux"), {
        date: d,
        startTime: stage.startTime,
        endTime: stage.endTime,
        activityId: stage.activityId,
        activityTitle: stage.activityTitle,
        activityType: act.type, // stage / stage_journee — préserve le type pour EnrollPanel
        monitor: stage.monitor,
        maxPlaces: stage.maxPlaces,
        enrolled: [],
        status: "open",
        source: `modele_stage:${stage.name}`,
        createdAt: serverTimestamp(),
      });
      created++;
    }
    alert(`✅ Stage de ${created} jour${created > 1 ? "s" : ""} créé !\nDu ${new Date(dates[0]).toLocaleDateString("fr-FR")} au ${new Date(dates[dates.length - 1]).toLocaleDateString("fr-FR")}`);
    setApplyingStageId(null);
    setStageApplyStart("");
    setSaving(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Modèles de reprises & stages</h1>
          <p className="font-body text-xs text-gray-400">Créez des semaines types ou des stages multi-jours réutilisables</p>
        </div>
        <div className="flex gap-2">
          <button onClick={startNew} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400">
            <Plus size={16} /> Nouvelle reprise
          </button>
          <button onClick={() => openStageForm()} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-orange-400">
            <Plus size={16} /> Nouveau stage
          </button>
        </div>
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
                  {moniteurs.map(m => <option key={m} value={m}>{m}</option>)}
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
                  {m.creneaux.sort(compareCreneauxByDow).map((c, i) => (
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

      {/* ═══ Formulaire de création/édition d'un modèle de stage ═══ */}
      {showStageForm && (
        <Card padding="md" className="mb-6 !border-orange-500/20">
          <h3 className="font-body text-base font-semibold text-orange-700 mb-4">
            {editingStageId ? "Modifier le stage" : "Nouveau modèle de stage"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Nom du modèle *</label>
              <input value={stageFormName} onChange={e => setStageFormName(e.target.value)}
                placeholder="Ex: Stage Galop 1 vacances été"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Description</label>
              <input value={stageFormDesc} onChange={e => setStageFormDesc(e.target.value)}
                placeholder="Ex: 5 jours pour débutants 8-12 ans"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Nombre de jours</label>
              <input type="number" min={1} max={14} value={stageFormNbJours}
                onChange={e => setStageFormNbJours(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Heure début</label>
              <input type="time" value={stageFormStartTime} onChange={e => setStageFormStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Heure fin</label>
              <input type="time" value={stageFormEndTime} onChange={e => setStageFormEndTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Places max</label>
              <input type="number" min={1} value={stageFormMaxPlaces}
                onChange={e => setStageFormMaxPlaces(Math.max(1, parseInt(e.target.value, 10) || 8))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Activité (de type stage)</label>
              {(() => {
                const stageActivities = activities.filter((a: any) => a.type === "stage" || a.type === "stage_journee");
                if (stageActivities.length === 0) {
                  return (
                    <div className="px-3 py-2.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-800">
                      ⚠️ Aucune activité de type stage trouvée.
                      <a href="/admin/activites" className="underline font-semibold ml-1">Créer une activité de type &laquo;&nbsp;Stage&nbsp;&raquo;</a>
                    </div>
                  );
                }
                return (
                  <select value={stageFormActivityId} onChange={e => setStageFormActivityId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none bg-white">
                    <option value="">— Sélectionner —</option>
                    {stageActivities.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.title}{a.type === "stage_journee" ? " (journée)" : ""}</option>
                    ))}
                  </select>
                );
              })()}
              <p className="font-body text-[10px] text-slate-400 mt-1">Seuls les types &quot;stage&quot; et &quot;stage journée&quot; sont listés. Modifiable dans /admin/activites.</p>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Moniteur</label>
              <select value={stageFormMonitor} onChange={e => setStageFormMonitor(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none bg-white">
                {moniteurs.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <p className="font-body text-[11px] text-slate-500 italic mb-4">
            💡 Les horaires sont identiques pour tous les jours du stage.
            Tu pourras les ajuster individuellement après application dans le planning si besoin.
          </p>

          <div className="flex gap-2">
            <button onClick={handleStageSave} disabled={saving || !stageFormName || !stageFormActivityId}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-orange-400 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}
              {editingStageId ? "Enregistrer" : "Créer le modèle"}
            </button>
            <button onClick={() => setShowStageForm(false)}
              className="font-body text-sm text-slate-600 bg-slate-100 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-slate-200">
              Annuler
            </button>
          </div>
        </Card>
      )}

      {/* ═══ Liste des modèles de stages ═══ */}
      {!loading && modelesStages.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-orange-700 mb-3 flex items-center gap-2">
            🎯 Modèles de stages multi-jours
            <span className="font-body text-xs font-normal text-slate-400">({modelesStages.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {modelesStages.map(s => (
              <Card key={s.id} padding="md" className={s.status === "inactive" ? "opacity-50" : ""}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-body text-base font-semibold text-blue-800">{s.name}</h3>
                      <Badge color={s.status === "active" ? "green" : "gray"}>
                        {s.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                    <p className="font-body text-xs text-slate-500">
                      {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} · {s.startTime}–{s.endTime} · {s.activityTitle} · {s.monitor} · {s.maxPlaces} places
                    </p>
                    {s.description && <p className="font-body text-xs text-slate-400 italic mt-1">{s.description}</p>}
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => toggleStageStatus(s)} title={s.status === "active" ? "Désactiver" : "Activer"}
                      className="font-body text-sm bg-slate-100 text-slate-600 p-2 rounded-lg border-none cursor-pointer hover:bg-slate-200">
                      {s.status === "active" ? <Pause size={14}/> : <Play size={14}/>}
                    </button>
                    <button onClick={() => openStageForm(s)} title="Modifier"
                      className="font-body text-sm bg-blue-50 text-blue-600 p-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                      <Edit2 size={14}/>
                    </button>
                    <button onClick={() => setApplyingStageId(s.id)}
                      className="font-body text-sm font-semibold text-white bg-orange-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-400">
                      Appliquer
                    </button>
                    <button onClick={() => handleStageDelete(s.id)} title="Supprimer"
                      className="font-body text-sm bg-red-50 text-red-600 p-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Modale d'application d'un stage ═══ */}
      {applyingStageId && (() => {
        const s = modelesStages.find(x => x.id === applyingStageId);
        if (!s) return null;
        // Calcul preview de la date de fin pour l'utilisateur
        let endDateLabel = "—";
        if (stageApplyStart) {
          const start = new Date(stageApplyStart);
          const cur = new Date(start);
          const dates: Date[] = [];
          while (dates.length < s.nbJours) {
            const day = cur.getDay();
            const isWeekend = day === 0 || day === 6;
            if (!stageApplySkipWeekend || !isWeekend) dates.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
          }
          endDateLabel = dates[dates.length - 1].toLocaleDateString("fr-FR");
        }
        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setApplyingStageId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold text-orange-700 mb-1">Appliquer &laquo;&nbsp;{s.name}&nbsp;&raquo;</h3>
              <p className="font-body text-xs text-slate-500 mb-4">
                {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} de {s.startTime} à {s.endTime} · {s.activityTitle}
              </p>
              <div className="mb-3">
                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Date de début *</label>
                <input type="date" value={stageApplyStart} onChange={e => setStageApplyStart(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
              </div>
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input type="checkbox" checked={stageApplySkipWeekend} onChange={e => setStageApplySkipWeekend(e.target.checked)} />
                <span className="font-body text-sm text-slate-700">Sauter les week-ends</span>
              </label>
              {stageApplyStart && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="font-body text-xs text-slate-700">
                    📅 Le stage ira du <strong>{new Date(stageApplyStart).toLocaleDateString("fr-FR")}</strong> au <strong>{endDateLabel}</strong>
                  </p>
                  <p className="font-body text-xs text-slate-500 mt-1">
                    {s.nbJours} créneau{s.nbJours > 1 ? "x" : ""} sera créé{s.nbJours > 1 ? "s" : ""} ({s.maxPlaces} places chacun).
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleStageApply} disabled={saving || !stageApplyStart}
                  className="flex-1 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-orange-400 disabled:opacity-50">
                  {saving ? "Création..." : "Créer le stage"}
                </button>
                <button onClick={() => { setApplyingStageId(null); setStageApplyStart(""); }}
                  className="font-body text-sm text-slate-600 bg-slate-100 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-slate-200">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
