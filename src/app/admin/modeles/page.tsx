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
 * Un STAGE au sein d'un modèle de semaine type.
 *
 * Pensé comme une saisie unique pour un stage entier qui dure plusieurs
 * jours (ex: "Stage 3/4 ans, du J1 au J5, 10h-12h, Anne, 6 places").
 * À l'application, on génère un créneau planning pour chaque jour entre
 * dayStart et dayEnd inclus.
 *
 * Pour avoir des horaires différents le même jour (matin/après-midi avec
 * 2 stages distincts), il suffit de créer plusieurs entrées dans le
 * tableau stages[] du modèle.
 */
interface ModeleStageItem {
  dayStart: number;       // Jour 1 = 0, Jour 2 = 1, etc. (interne, on affiche +1)
  dayEnd: number;         // inclus
  startTime: string;
  endTime: string;
  activityId: string;
  activityTitle: string;
  monitor: string;
  maxPlaces: number;
}

/**
 * Modèle de "semaine type de stages" (refonte v2 — saisie par stage).
 *
 * Un modèle contient un tableau de stages[]. Chaque stage est défini comme
 * une unité (du jour X au jour Y, à telle heure) — pas comme N créneaux
 * séparés. À l'application, on développe : pour chaque stage on génère
 * (dayEnd - dayStart + 1) créneaux dans le planning, tous avec la même
 * activité/moniteur/horaire/places.
 *
 * Rétrocompat :
 * - Format v1 (creneaux: ModeleStageCreneau[]) → regroupé en stages
 *   contigus à l'ouverture (jours consécutifs avec même activité/moniteur/
 *   horaires fusionnés en un stage).
 * - Format v0 (startTime/endTime/activityId/... directement dans le doc)
 *   → 1 stage couvrant tous les jours.
 */
interface ModeleStage {
  id: string;
  name: string;
  description: string;
  nbJours: number;
  stages: ModeleStageItem[]; // nouveau format v2
  status: "active" | "inactive";
  createdAt: any;
  // Anciens champs gardés pour rétrocompat lecture (v0 + v1)
  creneaux?: ModeleStageCreneau[];
  startTime?: string;
  endTime?: string;
  activityId?: string;
  activityTitle?: string;
  monitor?: string;
  maxPlaces?: number;
}

/**
 * Format intermédiaire (v1) — gardé uniquement pour la migration.
 * Représentait 1 créneau = 1 jour, ce qui était trop verbeux à saisir.
 */
interface ModeleStageCreneau {
  dayOffset: number;
  startTime: string;
  endTime: string;
  activityId: string;
  activityTitle: string;
  monitor: string;
  maxPlaces: number;
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

  // Form state — modèle stage (v2 : saisie par stage, pas par créneau)
  const [stageFormName, setStageFormName] = useState("");
  const [stageFormDesc, setStageFormDesc] = useState("");
  const [stageFormNbJours, setStageFormNbJours] = useState(5);
  const [stageFormStages, setStageFormStages] = useState<ModeleStageItem[]>([]);

  // Apply modal — reprise hebdo
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyStart, setApplyStart] = useState("");
  const [applyEnd, setApplyEnd] = useState("");
  const [applyPreview, setApplyPreview] = useState(0);

  // Apply modal — semaine de stages
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

  /**
   * Lit les stages depuis un modèle quel que soit son format de stockage.
   * - v2 (stages[]) : retourné tel quel
   * - v1 (creneaux[]) : regroupe les créneaux contigus avec mêmes
   *   activité/moniteur/horaires en un seul stage (ex: 5 créneaux J0-J4
   *   identiques → 1 stage J0→J4)
   * - v0 (startTime/endTime directement) : 1 stage couvrant tous les jours
   */
  const readStagesFromModele = (s: ModeleStage): ModeleStageItem[] => {
    // v2 : déjà au bon format
    if (Array.isArray(s.stages) && s.stages.length > 0) return s.stages;

    // v1 : regrouper les créneaux contigus
    if (Array.isArray(s.creneaux) && s.creneaux.length > 0) {
      // Tri par dayOffset puis startTime
      const sorted = [...s.creneaux].sort((a, b) => {
        if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
        return a.startTime.localeCompare(b.startTime);
      });
      const stages: ModeleStageItem[] = [];
      // Clé de regroupement : activityId|monitor|startTime|endTime|maxPlaces
      const keyOf = (c: ModeleStageCreneau) =>
        `${c.activityId}|${c.monitor}|${c.startTime}|${c.endTime}|${c.maxPlaces}`;
      // On parcourt et on regroupe les jours consécutifs ayant la même clé
      const byKey = new Map<string, ModeleStageCreneau[]>();
      for (const c of sorted) {
        if (!byKey.has(keyOf(c))) byKey.set(keyOf(c), []);
        byKey.get(keyOf(c))!.push(c);
      }
      for (const [, group] of byKey) {
        // Pour chaque groupe, détecter les plages contiguës de jours
        const sortedDays = group.map(c => c.dayOffset).sort((a, b) => a - b);
        let rangeStart = sortedDays[0];
        let rangeEnd = sortedDays[0];
        const first = group[0];
        for (let i = 1; i < sortedDays.length; i++) {
          if (sortedDays[i] === rangeEnd + 1) {
            rangeEnd = sortedDays[i];
          } else {
            stages.push({
              dayStart: rangeStart, dayEnd: rangeEnd,
              startTime: first.startTime, endTime: first.endTime,
              activityId: first.activityId, activityTitle: first.activityTitle,
              monitor: first.monitor, maxPlaces: first.maxPlaces,
            });
            rangeStart = sortedDays[i];
            rangeEnd = sortedDays[i];
          }
        }
        stages.push({
          dayStart: rangeStart, dayEnd: rangeEnd,
          startTime: first.startTime, endTime: first.endTime,
          activityId: first.activityId, activityTitle: first.activityTitle,
          monitor: first.monitor, maxPlaces: first.maxPlaces,
        });
      }
      return stages.sort((a, b) => a.dayStart - b.dayStart || a.startTime.localeCompare(b.startTime));
    }

    // v0 : un seul stage couvrant tous les jours
    if (s.activityId && s.startTime && s.endTime) {
      return [{
        dayStart: 0,
        dayEnd: s.nbJours - 1,
        startTime: s.startTime,
        endTime: s.endTime,
        activityId: s.activityId,
        activityTitle: s.activityTitle || "",
        monitor: s.monitor || "",
        maxPlaces: s.maxPlaces || 8,
      }];
    }

    return [];
  };

  const openStageForm = (s?: ModeleStage) => {
    if (s) {
      setEditingStageId(s.id);
      setStageFormName(s.name);
      setStageFormDesc(s.description);
      setStageFormNbJours(s.nbJours);
      setStageFormStages(readStagesFromModele(s));
    } else {
      setEditingStageId(null);
      setStageFormName("");
      setStageFormDesc("");
      setStageFormNbJours(5);
      setStageFormStages([]);
    }
    setShowStageForm(true);
  };

  // Helper : ajouter un nouveau stage (par défaut couvre tous les jours)
  const addStageItem = () => {
    setStageFormStages(prev => [...prev, {
      dayStart: 0,
      dayEnd: stageFormNbJours - 1,
      startTime: "10:00",
      endTime: "12:00",
      activityId: "",
      activityTitle: "",
      monitor: moniteurs[0] || "",
      maxPlaces: 8,
    }]);
  };

  const removeStageItem = (idx: number) => {
    setStageFormStages(prev => prev.filter((_, i) => i !== idx));
  };

  const updateStageItem = (idx: number, field: keyof ModeleStageItem, value: any) => {
    setStageFormStages(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const next: any = { ...c, [field]: value };
      if (field === "activityId") {
        const act = activities.find((a: any) => a.id === value);
        if (act) {
          next.activityTitle = act.title;
          if (act.maxPlaces && c.maxPlaces === 8) next.maxPlaces = act.maxPlaces;
        }
      }
      // Garde-fou : dayEnd ne peut pas être < dayStart
      if (field === "dayStart" && next.dayEnd < value) next.dayEnd = value;
      if (field === "dayEnd" && next.dayStart > value) next.dayStart = value;
      return next;
    }));
  };

  const handleStageSave = async () => {
    if (!stageFormName || stageFormNbJours < 1 || stageFormStages.length === 0) return;
    const invalid = stageFormStages.some(s => !s.activityId);
    if (invalid) { alert("Chaque stage doit avoir une activité sélectionnée."); return; }
    const outOfRange = stageFormStages.some(s =>
      s.dayStart < 0 || s.dayEnd >= stageFormNbJours || s.dayStart > s.dayEnd
    );
    if (outOfRange) { alert(`Les jours de chaque stage doivent être valides (entre Jour 1 et Jour ${stageFormNbJours}).`); return; }

    setSaving(true);
    const data: any = {
      name: stageFormName,
      description: stageFormDesc,
      nbJours: stageFormNbJours,
      stages: stageFormStages,
      status: "active",
      updatedAt: serverTimestamp(),
    };
    if (editingStageId) {
      // Nettoyage des anciens champs v0/v1 (migration définitive)
      data.creneaux = null;
      data.startTime = null;
      data.endTime = null;
      data.activityId = null;
      data.activityTitle = null;
      data.monitor = null;
      data.maxPlaces = null;
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
   * Applique un modèle de semaine type. Pour chaque stage de stages[], on
   * développe en (dayEnd - dayStart + 1) créneaux planning aux dates réelles
   * calculées à partir de la date de début (en sautant les weekends si demandé).
   *
   * Tous les jours d'un même stage partagent le même activityId, ce qui permet
   * à EnrollPanel de les détecter comme un stage multi-jours et proposer
   * l'inscription au stage entier.
   */
  const handleStageApply = async () => {
    const modele = modelesStages.find(s => s.id === applyingStageId);
    if (!modele || !stageApplyStart) return;
    const stages = readStagesFromModele(modele);
    if (stages.length === 0) { alert("Ce modèle ne contient aucun stage."); return; }

    setSaving(true);

    // Calcul des dates réelles pour chaque dayOffset (en sautant weekends si
    // demandé). Une seule passe pour tous les jours nécessaires.
    const start = new Date(stageApplyStart);
    const dateForOffset = new Map<number, string>();
    const maxOffset = Math.max(...stages.map(s => s.dayEnd));
    let dayCount = 0;
    const cur = new Date(start);
    while (dayCount <= maxOffset) {
      const day = cur.getDay();
      const isWeekend = day === 0 || day === 6;
      if (!stageApplySkipWeekend || !isWeekend) {
        dateForOffset.set(dayCount, cur.toISOString().split("T")[0]);
        dayCount++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    // Pour chaque stage, générer 1 créneau planning par jour entre dayStart et dayEnd
    let created = 0;
    for (const stg of stages) {
      const act = activities.find((a: any) => a.id === stg.activityId);
      for (let d = stg.dayStart; d <= stg.dayEnd; d++) {
        const dateStr = dateForOffset.get(d);
        if (!dateStr) continue;
        await addDoc(collection(db, "creneaux"), {
          date: dateStr,
          startTime: stg.startTime,
          endTime: stg.endTime,
          activityId: stg.activityId,
          activityTitle: stg.activityTitle,
          activityType: act?.type || "stage",
          monitor: stg.monitor,
          maxPlaces: stg.maxPlaces,
          enrolled: [],
          status: "open",
          source: `modele_stage:${modele.name}`,
          createdAt: serverTimestamp(),
        });
        created++;
      }
    }
    const dates = Array.from(dateForOffset.values()).sort();
    alert(`✅ ${created} créneau${created > 1 ? "x" : ""} créé${created > 1 ? "s" : ""} dans le planning !\nDu ${new Date(dates[0]).toLocaleDateString("fr-FR")} au ${new Date(dates[dates.length - 1]).toLocaleDateString("fr-FR")}\n\nLes créneaux apparaissent maintenant dans /admin/planning et les familles peuvent s'inscrire.`);
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

      {/* ═══ Formulaire de création/édition d'un modèle de semaine de stages ═══ */}
      {showStageForm && (
        <Card padding="md" className="mb-6 !border-orange-500/20">
          <h3 className="font-body text-base font-semibold text-orange-700 mb-4">
            {editingStageId ? "Modifier la semaine de stages" : "Nouvelle semaine type de stages"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Nom du modèle *</label>
              <input value={stageFormName} onChange={e => setStageFormName(e.target.value)}
                placeholder="Ex: Vacances été petits + grands"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Description</label>
              <input value={stageFormDesc} onChange={e => setStageFormDesc(e.target.value)}
                placeholder="Ex: 5 jours, baby matin + galops après-midi"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Nombre de jours total</label>
            <input type="number" min={1} max={14} value={stageFormNbJours}
              onChange={e => setStageFormNbJours(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-32 px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:border-orange-500 focus:outline-none" />
            <p className="font-body text-[10px] text-slate-400 mt-1">Tu pourras ajouter plusieurs créneaux sur le même jour (matin/après-midi, ou activités différentes).</p>
          </div>

          {/* Liste des stages du modèle */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-body text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Stages ({stageFormStages.length})
              </h4>
              <button onClick={addStageItem}
                className="flex items-center gap-1 font-body text-xs font-semibold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100">
                <Plus size={13}/> Ajouter un stage
              </button>
            </div>

            {(() => {
              const stageActivities = activities.filter((a: any) => a.type === "stage" || a.type === "stage_journee");
              if (stageActivities.length === 0) {
                return (
                  <div className="px-3 py-3 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-800">
                    ⚠️ Aucune activité de type stage trouvée.
                    <a href="/admin/activites" className="underline font-semibold ml-1">Créer une activité de type &laquo;&nbsp;Stage&nbsp;&raquo;</a>
                  </div>
                );
              }
              if (stageFormStages.length === 0) {
                return (
                  <div className="px-3 py-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 font-body text-xs text-slate-500 text-center italic">
                    Aucun stage pour le moment. Cliquez sur &laquo;&nbsp;Ajouter un stage&nbsp;&raquo; pour commencer.
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  {stageFormStages.map((stg, idx) => {
                    const totalCreneaux = stg.dayEnd - stg.dayStart + 1;
                    return (
                      <div key={idx} className="bg-orange-50/40 rounded-lg p-3 border border-orange-100">
                        {/* Ligne 1 : activité + moniteur + places + delete */}
                        <div className="grid grid-cols-12 gap-2 items-center mb-2">
                          <select value={stg.activityId}
                            onChange={e => updateStageItem(idx, "activityId", e.target.value)}
                            className="col-span-5 px-2 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-orange-500 focus:outline-none">
                            <option value="">— Activité —</option>
                            {stageActivities.map((a: any) => (
                              <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                          </select>
                          <select value={stg.monitor}
                            onChange={e => updateStageItem(idx, "monitor", e.target.value)}
                            className="col-span-4 px-2 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-orange-500 focus:outline-none">
                            {moniteurs.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input type="number" min={1} value={stg.maxPlaces}
                            onChange={e => updateStageItem(idx, "maxPlaces", Math.max(1, parseInt(e.target.value, 10) || 8))}
                            title="Places max"
                            className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-sm text-center focus:border-orange-500 focus:outline-none" />
                          <button onClick={() => removeStageItem(idx)} title="Supprimer ce stage"
                            className="col-span-1 text-red-500 hover:text-red-700 bg-transparent border-none cursor-pointer p-1 flex justify-center">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                        {/* Ligne 2 : dayStart → dayEnd + horaires */}
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <span className="col-span-1 font-body text-[11px] text-slate-500 text-right">Du</span>
                          <select value={stg.dayStart}
                            onChange={e => updateStageItem(idx, "dayStart", parseInt(e.target.value, 10))}
                            className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-orange-500 focus:outline-none">
                            {Array.from({ length: stageFormNbJours }, (_, j) => (
                              <option key={j} value={j}>Jour {j + 1}</option>
                            ))}
                          </select>
                          <span className="col-span-1 font-body text-[11px] text-slate-500 text-center">au</span>
                          <select value={stg.dayEnd}
                            onChange={e => updateStageItem(idx, "dayEnd", parseInt(e.target.value, 10))}
                            className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-orange-500 focus:outline-none">
                            {Array.from({ length: stageFormNbJours }, (_, j) => (
                              <option key={j} value={j}>Jour {j + 1}</option>
                            ))}
                          </select>
                          <input type="time" value={stg.startTime}
                            onChange={e => updateStageItem(idx, "startTime", e.target.value)}
                            className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs focus:border-orange-500 focus:outline-none" />
                          <span className="col-span-1 text-center text-slate-400 font-body text-xs">→</span>
                          <input type="time" value={stg.endTime}
                            onChange={e => updateStageItem(idx, "endTime", e.target.value)}
                            className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs focus:border-orange-500 focus:outline-none" />
                          <span className="col-span-1 font-body text-[10px] text-orange-700 italic font-semibold text-right">
                            ={totalCreneaux}j
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Récap total créneaux générés */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
                    <span className="font-body text-xs text-blue-800">
                      📊 À l&apos;application : <strong>{stageFormStages.reduce((s, st) => s + (st.dayEnd - st.dayStart + 1), 0)} créneaux</strong> seront générés dans le planning ({stageFormStages.length} stage{stageFormStages.length > 1 ? "s" : ""} × jours).
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <p className="font-body text-[11px] text-slate-500 italic mb-4">
            💡 Un stage = une saisie. Si tu as 7 stages dans la semaine (3 le matin + 3 l&apos;après-midi + 1 mercredi seul), tu fais 7 lignes. Pas besoin de remplir jour par jour.
          </p>

          <div className="flex gap-2">
            <button onClick={handleStageSave} disabled={saving || !stageFormName || stageFormStages.length === 0}
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
            🎯 Semaines types de stages
            <span className="font-body text-xs font-normal text-slate-400">({modelesStages.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {modelesStages.map(s => {
              // Lire les stages au format unifié v2 (helper gère v0/v1/v2)
              const stages: ModeleStageItem[] = readStagesFromModele(s);
              // Total créneaux qui seront générés à l'application
              const totalCreneaux = stages.reduce((sum, st) => sum + (st.dayEnd - st.dayStart + 1), 0);
              return (
                <Card key={s.id} padding="md" className={s.status === "inactive" ? "opacity-50" : ""}>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-body text-base font-semibold text-blue-800">{s.name}</h3>
                        <Badge color={s.status === "active" ? "green" : "gray"}>
                          {s.status === "active" ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                      <p className="font-body text-xs text-slate-500">
                        {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} · {stages.length} stage{stages.length > 1 ? "s" : ""} · {totalCreneaux} créneau{totalCreneaux > 1 ? "x" : ""} au total
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

                  {/* Détail : un bloc par stage */}
                  {stages.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {stages.map((stg, i) => {
                        const isOneDay = stg.dayStart === stg.dayEnd;
                        const dayLabel = isOneDay
                          ? `Jour ${stg.dayStart + 1}`
                          : `Jour ${stg.dayStart + 1} → ${stg.dayEnd + 1}`;
                        const nbDays = stg.dayEnd - stg.dayStart + 1;
                        return (
                          <div key={i} className="bg-orange-50/60 border border-orange-100 rounded-lg px-3 py-1.5 flex items-center gap-2 flex-wrap">
                            <span className="font-body text-[11px] font-semibold text-orange-700">{dayLabel}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-[11px] text-slate-700">{stg.startTime}–{stg.endTime}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-body text-[12px] text-slate-700 font-medium">{stg.activityTitle || "?"}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-body text-[11px] text-slate-500">{stg.monitor || "?"}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-body text-[11px] text-slate-500">{stg.maxPlaces}pl</span>
                            <span className="ml-auto font-body text-[10px] text-orange-700 italic">
                              ={nbDays} créneau{nbDays > 1 ? "x" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Modale d'application d'un stage ═══ */}
      {applyingStageId && (() => {
        const s = modelesStages.find(x => x.id === applyingStageId);
        if (!s) return null;
        // Lire les stages au format unifié v2
        const stages: ModeleStageItem[] = readStagesFromModele(s);
        const totalCreneaux = stages.reduce((sum, st) => sum + (st.dayEnd - st.dayStart + 1), 0);

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
          if (dates.length > 0) endDateLabel = dates[dates.length - 1].toLocaleDateString("fr-FR");
        }
        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setApplyingStageId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold text-orange-700 mb-1">Appliquer &laquo;&nbsp;{s.name}&nbsp;&raquo;</h3>
              <p className="font-body text-xs text-slate-500 mb-4">
                {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} · {stages.length} stage{stages.length > 1 ? "s" : ""} · {totalCreneaux} créneau{totalCreneaux > 1 ? "x" : ""} au total
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
                    {totalCreneaux} créneau{totalCreneaux > 1 ? "x" : ""} sera{totalCreneaux > 1 ? "ont" : ""} créé{totalCreneaux > 1 ? "s" : ""} dans le planning. Les familles pourront s&apos;y inscrire normalement.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleStageApply} disabled={saving || !stageApplyStart}
                  className="flex-1 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-orange-400 disabled:opacity-50">
                  {saving ? "Création..." : "Appliquer"}
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
