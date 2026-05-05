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
 * Créneau au sein d'un modèle de stage.
 *
 * dayOffset = position du créneau dans la semaine de stages, J0 étant le
 * premier jour. À l'application, dateRéelle = dateDébut + dayOffset (en
 * sautant les weekends si l'option est cochée).
 *
 * On peut avoir plusieurs créneaux pour le même dayOffset (ex: matin 10h-12h
 * et après-midi 14h-16h le même jour, voire avec des activités/moniteurs
 * différents : Stage 3/4 ans avec Anne le matin, Stage 6/7 ans avec
 * Emmeline l'après-midi).
 */
interface ModeleStageCreneau {
  dayOffset: number; // 0 = J0 (premier jour), 1 = J1, etc.
  startTime: string;
  endTime: string;
  activityId: string;
  activityTitle: string;
  monitor: string;
  maxPlaces: number;
}

/**
 * Modèle de "semaine type de stages" (refonte option C).
 *
 * Permet de définir une organisation complète sur N jours : plusieurs
 * activités, plusieurs horaires, plusieurs moniteurs. À l'application,
 * tous les créneaux sont générés dans le planning aux bonnes dates et
 * fonctionnent comme des créneaux classiques (inscription, encaissement,
 * facturation tout marche).
 *
 * Différence avec les modèles de reprise hebdo :
 * - dayOfWeek (lun/mar/...) remplacé par dayOffset (J0, J1, J2)
 * - Application = date de début + nb jours, pas une période open-ended
 *
 * Ancien format (nbJours + horaires uniques + 1 activité) automatiquement
 * migré vers ce nouveau format à l'ouverture en édition.
 */
interface ModeleStage {
  id: string;
  name: string;
  description: string;
  nbJours: number;
  creneaux: ModeleStageCreneau[];
  status: "active" | "inactive";
  createdAt: any;
  // Anciens champs (pré-refonte) — encore lus pour rétrocompatibilité,
  // migrés vers creneaux à la première édition.
  startTime?: string;
  endTime?: string;
  activityId?: string;
  activityTitle?: string;
  monitor?: string;
  maxPlaces?: number;
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

  // Form state — modèle stage (refonte option C : tableau de créneaux)
  const [stageFormName, setStageFormName] = useState("");
  const [stageFormDesc, setStageFormDesc] = useState("");
  const [stageFormNbJours, setStageFormNbJours] = useState(5);
  const [stageFormCreneaux, setStageFormCreneaux] = useState<ModeleStageCreneau[]>([]);

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
  const openStageForm = (s?: ModeleStage) => {
    if (s) {
      setEditingStageId(s.id);
      setStageFormName(s.name);
      setStageFormDesc(s.description);
      setStageFormNbJours(s.nbJours);
      // Migration ancien format → nouveau (rétrocompat)
      // Si le modèle a déjà un tableau creneaux, on l'utilise tel quel.
      // Sinon, on génère nbJours créneaux à partir des anciens champs
      // (startTime/endTime/activityId/monitor/maxPlaces) pour ne pas perdre
      // les modèles créés avant la refonte.
      if (Array.isArray(s.creneaux) && s.creneaux.length > 0) {
        setStageFormCreneaux(s.creneaux);
      } else if (s.activityId && s.startTime && s.endTime) {
        const migrated: ModeleStageCreneau[] = [];
        for (let d = 0; d < s.nbJours; d++) {
          migrated.push({
            dayOffset: d,
            startTime: s.startTime!,
            endTime: s.endTime!,
            activityId: s.activityId!,
            activityTitle: s.activityTitle || "",
            monitor: s.monitor || "",
            maxPlaces: s.maxPlaces || 8,
          });
        }
        setStageFormCreneaux(migrated);
      } else {
        setStageFormCreneaux([]);
      }
    } else {
      setEditingStageId(null);
      setStageFormName("");
      setStageFormDesc("");
      setStageFormNbJours(5);
      setStageFormCreneaux([]);
    }
    setShowStageForm(true);
  };

  // Helper : ajouter un nouveau créneau au modèle stage (par défaut J0)
  const addStageCreneau = () => {
    setStageFormCreneaux(prev => [...prev, {
      dayOffset: 0,
      startTime: "10:00",
      endTime: "12:00",
      activityId: "",
      activityTitle: "",
      monitor: moniteurs[0] || "",
      maxPlaces: 8,
    }]);
  };

  // Helper : retirer un créneau par index
  const removeStageCreneau = (idx: number) => {
    setStageFormCreneaux(prev => prev.filter((_, i) => i !== idx));
  };

  // Helper : mettre à jour un champ d'un créneau
  const updateStageCreneau = (idx: number, field: keyof ModeleStageCreneau, value: any) => {
    setStageFormCreneaux(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const next: any = { ...c, [field]: value };
      // Si on change activityId, mettre aussi à jour activityTitle
      if (field === "activityId") {
        const act = activities.find((a: any) => a.id === value);
        if (act) {
          next.activityTitle = act.title;
          // Auto-remplir maxPlaces si on a un défaut sur l'activité
          if (act.maxPlaces && c.maxPlaces === 8) next.maxPlaces = act.maxPlaces;
        }
      }
      return next;
    }));
  };

  const handleStageSave = async () => {
    if (!stageFormName || stageFormNbJours < 1 || stageFormCreneaux.length === 0) return;
    // Validation : tous les créneaux doivent avoir une activité
    const invalid = stageFormCreneaux.some(c => !c.activityId);
    if (invalid) { alert("Chaque créneau doit avoir une activité sélectionnée."); return; }
    // Validation : tous les dayOffset doivent être < nbJours
    const outOfRange = stageFormCreneaux.some(c => c.dayOffset < 0 || c.dayOffset >= stageFormNbJours);
    if (outOfRange) { alert(`Tous les créneaux doivent être entre J0 et J${stageFormNbJours - 1}.`); return; }

    setSaving(true);
    const data: any = {
      name: stageFormName,
      description: stageFormDesc,
      nbJours: stageFormNbJours,
      creneaux: stageFormCreneaux,
      status: "active",
      updatedAt: serverTimestamp(),
      // Nettoyage : on supprime les anciens champs (migration définitive)
      // Firestore ne supporte pas FieldValue.delete dans data spread, donc
      // on utilise update si édition pour gérer la suppression des champs.
    };
    if (editingStageId) {
      // Mise à jour : on écrase aussi les anciens champs avec null pour les
      // retirer du document (deleteField serait plus propre mais null suffit
      // pour notre logique de lecture)
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
   * Applique un modèle de semaine de stages à partir d'une date de début.
   * Pour chaque dayOffset (J0, J1, ...), calcule la date réelle = date début + offset
   * (en sautant les week-ends si l'option est cochée), et génère un créneau
   * dans le planning par entrée du tableau creneaux.
   *
   * Un même dayOffset peut avoir plusieurs créneaux (ex: matin + après-midi),
   * tous se génèrent à la même date réelle. Ils apparaissent dans le planning
   * comme des créneaux classiques inscriptibles.
   */
  const handleStageApply = async () => {
    const stage = modelesStages.find(s => s.id === applyingStageId);
    if (!stage || !stageApplyStart) return;
    setSaving(true);

    // Compatibilité ancien format : si pas de tableau creneaux, on génère
    // les créneaux à la volée à partir des anciens champs (1 par jour)
    const creneauxToGen: ModeleStageCreneau[] = (stage.creneaux && stage.creneaux.length > 0)
      ? stage.creneaux
      : (stage.activityId && stage.startTime && stage.endTime)
        ? Array.from({ length: stage.nbJours }, (_, d) => ({
            dayOffset: d,
            startTime: stage.startTime!,
            endTime: stage.endTime!,
            activityId: stage.activityId!,
            activityTitle: stage.activityTitle || "",
            monitor: stage.monitor || "",
            maxPlaces: stage.maxPlaces || 8,
          }))
        : [];

    if (creneauxToGen.length === 0) { alert("Ce modèle ne contient aucun créneau."); setSaving(false); return; }

    // Calcul des dates réelles pour chaque dayOffset (en sautant weekends si
    // demandé). On calcule une fois pour tous les dayOffsets distincts pour
    // garder la cohérence (deux créneaux du même J0 partagent la même date).
    const start = new Date(stageApplyStart);
    const dateForOffset = new Map<number, string>();
    let dayCount = 0;
    const cur = new Date(start);
    const maxOffset = Math.max(...creneauxToGen.map(c => c.dayOffset));
    while (dayCount <= maxOffset) {
      const day = cur.getDay();
      const isWeekend = day === 0 || day === 6;
      if (!stageApplySkipWeekend || !isWeekend) {
        dateForOffset.set(dayCount, cur.toISOString().split("T")[0]);
        dayCount++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    let created = 0;
    for (const c of creneauxToGen) {
      const d = dateForOffset.get(c.dayOffset);
      if (!d) continue; // sécurité : ne devrait pas arriver
      const act = activities.find((a: any) => a.id === c.activityId);
      await addDoc(collection(db, "creneaux"), {
        date: d,
        startTime: c.startTime,
        endTime: c.endTime,
        activityId: c.activityId,
        activityTitle: c.activityTitle,
        activityType: act?.type || "stage",
        monitor: c.monitor,
        maxPlaces: c.maxPlaces,
        enrolled: [],
        status: "open",
        source: `modele_stage:${stage.name}`,
        createdAt: serverTimestamp(),
      });
      created++;
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

          {/* Liste des créneaux du modèle */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-body text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Créneaux ({stageFormCreneaux.length})
              </h4>
              <button onClick={addStageCreneau}
                className="flex items-center gap-1 font-body text-xs font-semibold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100">
                <Plus size={13}/> Ajouter un créneau
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
              if (stageFormCreneaux.length === 0) {
                return (
                  <div className="px-3 py-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 font-body text-xs text-slate-500 text-center italic">
                    Aucun créneau pour le moment. Cliquez sur &laquo;&nbsp;Ajouter un créneau&nbsp;&raquo; pour commencer.
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  {stageFormCreneaux.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-orange-50/30 rounded-lg p-2">
                      {/* Jour relatif J0/J1/J2... */}
                      <select value={c.dayOffset}
                        onChange={e => updateStageCreneau(idx, "dayOffset", parseInt(e.target.value, 10))}
                        className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-orange-500 focus:outline-none">
                        {Array.from({ length: stageFormNbJours }, (_, j) => (
                          <option key={j} value={j}>Jour {j + 1}</option>
                        ))}
                      </select>
                      {/* Heure début */}
                      <input type="time" value={c.startTime}
                        onChange={e => updateStageCreneau(idx, "startTime", e.target.value)}
                        className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs focus:border-orange-500 focus:outline-none" />
                      {/* Flèche → */}
                      <span className="col-span-1 text-center text-slate-400 font-body text-xs">→</span>
                      {/* Heure fin */}
                      <input type="time" value={c.endTime}
                        onChange={e => updateStageCreneau(idx, "endTime", e.target.value)}
                        className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs focus:border-orange-500 focus:outline-none" />
                      {/* Activité */}
                      <select value={c.activityId}
                        onChange={e => updateStageCreneau(idx, "activityId", e.target.value)}
                        className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-orange-500 focus:outline-none">
                        <option value="">— Activité —</option>
                        {stageActivities.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.title}</option>
                        ))}
                      </select>
                      {/* Moniteur */}
                      <select value={c.monitor}
                        onChange={e => updateStageCreneau(idx, "monitor", e.target.value)}
                        className="col-span-2 px-2 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-orange-500 focus:outline-none">
                        {moniteurs.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {/* Places + delete */}
                      <div className="col-span-1 flex items-center gap-1">
                        <input type="number" min={1} value={c.maxPlaces}
                          onChange={e => updateStageCreneau(idx, "maxPlaces", Math.max(1, parseInt(e.target.value, 10) || 8))}
                          title="Places max"
                          className="w-10 px-1 py-2 rounded-lg border border-gray-200 font-body text-xs text-center focus:border-orange-500 focus:outline-none" />
                        <button onClick={() => removeStageCreneau(idx)} title="Supprimer ce créneau"
                          className="text-red-500 hover:text-red-700 bg-transparent border-none cursor-pointer p-1">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <p className="font-body text-[11px] text-slate-500 italic mb-4">
            💡 Tu peux mettre plusieurs créneaux sur le même jour (matin + après-midi) avec des activités/moniteurs différents. À l&apos;application, tu choisiras la date de début et tous les créneaux apparaîtront dans le planning.
          </p>

          <div className="flex gap-2">
            <button onClick={handleStageSave} disabled={saving || !stageFormName || stageFormCreneaux.length === 0}
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
              // Lire les créneaux : nouveau format si présent, sinon migration à la volée
              const creneaux: ModeleStageCreneau[] = (s.creneaux && s.creneaux.length > 0)
                ? s.creneaux
                : (s.activityId && s.startTime && s.endTime)
                  ? Array.from({ length: s.nbJours }, (_, d) => ({
                      dayOffset: d,
                      startTime: s.startTime!,
                      endTime: s.endTime!,
                      activityId: s.activityId!,
                      activityTitle: s.activityTitle || "",
                      monitor: s.monitor || "",
                      maxPlaces: s.maxPlaces || 8,
                    }))
                  : [];
              // Grouper par dayOffset pour affichage compact
              const byDay = new Map<number, ModeleStageCreneau[]>();
              for (const c of creneaux) {
                if (!byDay.has(c.dayOffset)) byDay.set(c.dayOffset, []);
                byDay.get(c.dayOffset)!.push(c);
              }
              const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
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
                        {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} · {creneaux.length} créneau{creneaux.length > 1 ? "x" : ""} au total
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

                  {/* Détail des créneaux par jour */}
                  {creneaux.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sortedDays.map(d => (
                        <div key={d} className="bg-orange-50 border border-orange-100 rounded-lg px-2 py-1">
                          <div className="font-body text-[10px] font-semibold text-orange-700 mb-0.5">Jour {d + 1}</div>
                          {byDay.get(d)!.map((c, i) => (
                            <div key={i} className="font-body text-[11px] text-slate-700 flex items-center gap-1">
                              <span className="font-mono">{c.startTime}–{c.endTime}</span>
                              <span className="text-slate-500">·</span>
                              <span>{c.activityTitle || "?"}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-500">{c.monitor || "?"}</span>
                              <span className="text-slate-400">({c.maxPlaces}pl)</span>
                            </div>
                          ))}
                        </div>
                      ))}
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
        // Lire les créneaux : nouveau format ou migration ancien format
        const creneaux: ModeleStageCreneau[] = (s.creneaux && s.creneaux.length > 0)
          ? s.creneaux
          : (s.activityId && s.startTime && s.endTime)
            ? Array.from({ length: s.nbJours }, (_, d) => ({
                dayOffset: d,
                startTime: s.startTime!,
                endTime: s.endTime!,
                activityId: s.activityId!,
                activityTitle: s.activityTitle || "",
                monitor: s.monitor || "",
                maxPlaces: s.maxPlaces || 8,
              }))
            : [];

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
                {s.nbJours} jour{s.nbJours > 1 ? "s" : ""} · {creneaux.length} créneau{creneaux.length > 1 ? "x" : ""} au total
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
                    {creneaux.length} créneau{creneaux.length > 1 ? "x" : ""} sera{creneaux.length > 1 ? "ont" : ""} créé{creneaux.length > 1 ? "s" : ""} dans le planning. Les familles pourront s&apos;y inscrire normalement.
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
