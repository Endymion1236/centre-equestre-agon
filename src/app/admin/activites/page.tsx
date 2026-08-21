"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AssistantRedaction from "@/components/admin/AssistantRedaction";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, Pencil, Trash2, Copy, X, Check, Loader2, Settings2 } from "lucide-react";
import type { Activity, ActivityType } from "@/types";
import { typeColors } from "@/app/admin/planning/types";

// ── Types d'activités ─────────────────────────────────────────────────────────

const activityTypes = [
  { id: "cours",         label: "Cours régulier" },
  { id: "stage",         label: "Stage semaine" },
  { id: "stage_journee", label: "Stage journée" },
  { id: "cycle",         label: "Cycle" },
  { id: "balade",        label: "Promenade" },
  { id: "competition",   label: "Compétition" },
  { id: "anniversaire",  label: "Anniversaire" },
  { id: "animation",     label: "Animation" },
];

// Valeurs par défaut initiales (si Firestore vide)
const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  cours:         ["Baby 3/4 ans", "Baby 4,5/5,5 ans", "Galop Bronze", "Galop Argent", "Galop Or", "Galop 3", "Galop 4", "Galop 5", "Galop 6", "Galop 7"],
  stage:         ["Baby 3/4 ans", "Baby 4,5/5,5 ans", "Galop Bronze", "Galop Argent", "Galop Or", "Galop 3", "Galop 4", "Galop 5", "Galop 6", "Galop 7"],
  stage_journee: ["Baby 3/4 ans", "Baby 4,5/5,5 ans", "Galop Bronze", "Galop Argent", "Galop Or", "Galop 3", "Galop 4", "Galop 5", "Galop 6", "Galop 7"],
  balade:        ["Débutant", "Débrouillé", "Confirmé"],
  competition:   ["Pony Games", "CSO", "Équifun", "Endurance", "Hunter"],
  anniversaire:  [],
};

const defaultActivity: Partial<Activity> & { priceTTC?: number } = {
  type: "cours", title: "", description: "",
  ageMin: 3, ageMax: null, galopRequired: null, conditionsAcces: "",
  priceHT: 0, tvaTaux: 5.5, maxPlaces: 8,
  schedule: "", seasonPeriod: "", active: true, articles: [], priceTTC: 0,
};

const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

// ── Panneau gestion des sous-catégories ──────────────────────────────────────

function SubcategoryManager({ subcatOptions, onUpdate }: {
  subcatOptions: Record<string, string[]>;
  onUpdate: (type: string, list: string[]) => Promise<void>;
}) {
  const [activeType, setActiveType] = useState("cours");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const current = subcatOptions[activeType] || [];

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label || current.includes(label)) return;
    setSaving(true);
    await onUpdate(activeType, [...current, label]);
    setNewLabel("");
    setSaving(false);
  };

  const handleDelete = async (s: string) => {
    setSaving(true);
    await onUpdate(activeType, current.filter(x => x !== s));
    setSaving(false);
  };

  const handleMoveUp = async (idx: number) => {
    if (idx === 0) return;
    const next = [...current];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    await onUpdate(activeType, next);
  };

  const handleMoveDown = async (idx: number) => {
    if (idx === current.length - 1) return;
    const next = [...current];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    await onUpdate(activeType, next);
  };

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={16} className="text-blue-500" />
        <h3 className="font-body text-base font-semibold text-blue-800">Gérer les sous-catégories</h3>
      </div>

      {/* Sélecteur de type */}
      <div className="flex flex-wrap gap-2 mb-4">
        {activityTypes.filter(t => t.id !== "anniversaire").map(t => (
          <button key={t.id} onClick={() => setActiveType(t.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all font-body
              ${activeType === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-500 border-gray-200 hover:border-blue-200"}`}>
            {t.label}
            <span className="ml-1.5 opacity-60">({(subcatOptions[t.id] || []).length})</span>
          </button>
        ))}
      </div>

      {/* Liste des sous-catégories */}
      <div className="flex flex-col gap-1 mb-3 max-h-56 overflow-y-auto">
        {current.length === 0 && (
          <p className="font-body text-xs text-slate-400 italic py-2">Aucune sous-catégorie pour ce type.</p>
        )}
        {current.map((s, idx) => (
          <div key={s} className="flex items-center gap-2 bg-sand rounded-lg px-3 py-2 group">
            <span className="font-body text-sm text-blue-800 flex-1">{s}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleMoveUp(idx)} disabled={idx === 0}
                className="w-6 h-6 text-slate-400 hover:text-blue-500 bg-transparent border-none cursor-pointer disabled:opacity-20 text-xs">↑</button>
              <button onClick={() => handleMoveDown(idx)} disabled={idx === current.length - 1}
                className="w-6 h-6 text-slate-400 hover:text-blue-500 bg-transparent border-none cursor-pointer disabled:opacity-20 text-xs">↓</button>
              <button onClick={() => handleDelete(s)}
                className="w-6 h-6 text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer">
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Ajouter */}
      <div className="flex gap-2">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="Nouvelle sous-catégorie…"
          className={`${inp} flex-1`} />
        <button onClick={handleAdd} disabled={!newLabel.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Ajouter
        </button>
      </div>
    </Card>
  );
}

// ── Formulaire activité ───────────────────────────────────────────────────────

function ActivityForm({ initial, subcatOptions, onSave, onCancel }: {
  initial: Partial<Activity> & { priceTTC?: number; subcategories?: string[] };
  subcatOptions: Record<string, string[]>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<any>({ subcategories: [], ...initial });
  const [saving, setSaving] = useState(false);
  const update = (f: string, v: any) => setForm((p: any) => ({ ...p, [f]: v }));


  const subcats = subcatOptions[form.type] || [];

  const toggleSubcat = (s: string) => {
    const curr: string[] = form.subcategories || [];
    update("subcategories", curr.includes(s) ? curr.filter((x: string) => x !== s) : [...curr, s]);
  };

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

        {/* Titre + Horaires + Couleur */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Titre *</label>
            <input value={form.title || ""} onChange={e => update("title", e.target.value)} className={inp} placeholder="Ex: Galop Argent mercredi" />
          </div>
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Horaires</label>
            <input value={form.schedule || ""} onChange={e => update("schedule", e.target.value)} className={inp} placeholder="Ex: Mer · 14h–16h" />
          </div>
          <div style={{width: 90}}>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Couleur</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color || "#27ae60"} onChange={e => update("color", e.target.value)}
                style={{width:32, height:32, border:"none", borderRadius:6, cursor:"pointer", padding:0}} />
              <span className="font-body text-[10px] text-slate-400">{form.color || "auto"}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Description</label>
          <textarea value={form.description || ""} onChange={e => update("description", e.target.value)} rows={3}
            className={`${inp} resize-y`} placeholder="Description de l'activité..." />
          <p className="font-body text-[10px] text-slate-400 mt-1">
            Affichée aux familles sous « Voir le détail du stage » au moment de réserver.
          </p>
          <AssistantRedaction
            champ="description"
            valeur={form.description || ""}
            onApply={(t) => update("description", t)}
            contexte={{
              titre: form.title,
              typeActivite: form.type,
              ageMin: form.ageMin,
              ageMax: form.ageMax,
              dureeMinutes: form.dureeMinutes,
            }}
          />
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

        {/* Conditions d'accès — lues par l'assistant email */}
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">
            Conditions d'accès <span className="font-normal text-slate-400">(niveau, âge, prérequis — utilisé par l'assistant email)</span>
          </label>
          <textarea value={form.conditionsAcces || ""} onChange={e => update("conditionsAcces", e.target.value)} rows={2}
            className={`${inp} resize-y`}
            placeholder="Ex : Galop 2 mini et 10 ans si maîtrise du trot enlevé, ou sans galop mais trot enlevé maîtrisé. Non remboursable si niveau insuffisant." />
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

        {/* Seuil de rentabilité pour les balades collectives */}
        {form.type === "balade" && (
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Seuil de rentabilité (balades collectives)</label>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="font-body text-[10px] text-slate-500 block mb-1">Participants minimum</label>
                <input type="number" min={2} value={form.minParticipants || ""} onChange={e => update("minParticipants", e.target.value ? parseInt(e.target.value) : null)} className={inp} placeholder="Aucun" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="font-body text-[10px] text-slate-500 block mb-1">Supplément petit comité (€/cavalier)</label>
                <input type="number" step="0.01" min={0} value={form.supplementPetitGroupe || ""} onChange={e => update("supplementPetitGroupe", e.target.value ? parseFloat(e.target.value) : null)} className={inp} placeholder="Aucun" />
              </div>
            </div>
            <p className="font-body text-[10px] text-slate-400 mt-1">
              Si la balade compte moins d'inscrits que le minimum 2 jours avant le départ, les familles reçoivent
              automatiquement un email leur proposant : maintien avec ce supplément, report à une autre date, ou avoir.
            </p>
          </div>
        )}

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
  const { setAgentContext } = useAgentContext("activites");

  useEffect(() => {
    setAgentContext({ module_actif: "activites", description: "activités créées, types, tarifs" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activities, setActivities] = useState<(Activity & { firestoreId: string; priceTTC?: number; subcategories?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editActivity, setEditActivity] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [showSubcatManager, setShowSubcatManager] = useState(false);
  const [subcatOptions, setSubcatOptions] = useState<Record<string, string[]>>(DEFAULT_SUBCATEGORIES);

  // Charger sous-catégories depuis Firestore
  const fetchSubcatOptions = async () => {
    const snap = await getDoc(doc(db, "settings", "subcategoryOptions"));
    if (snap.exists()) {
      setSubcatOptions({ ...DEFAULT_SUBCATEGORIES, ...snap.data() });
    } else {
      // Initialiser avec les valeurs par défaut
      await setDoc(doc(db, "settings", "subcategoryOptions"), DEFAULT_SUBCATEGORIES);
    }
  };

  const handleSubcatUpdate = async (type: string, list: string[]) => {
    const updated = { ...subcatOptions, [type]: list };
    await setDoc(doc(db, "settings", "subcategoryOptions"), updated);
    setSubcatOptions(updated);
  };

  const fetchActivities = async () => {
    const snap = await getDocs(query(collection(db, "activities"), orderBy("title")));
    setActivities(snap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubcatOptions();
    fetchActivities();
  }, []);

  const handleSave = async (data: any) => {
    const { firestoreId, ...rest } = data;
    const payload = { ...rest, updatedAt: serverTimestamp() };
    if (firestoreId) {
      const avant = activities.find(a => a.firestoreId === firestoreId);
      await updateDoc(doc(db, "activities", firestoreId), payload);
      // Les créneaux du planning sont des COPIES de l'activité, figées à leur
      // génération : modifier le catalogue ne les touchait pas, et les
      // créneaux futurs gardaient l'ancien titre, l'ancien prix, l'ancienne
      // couleur. On propose donc de reporter les changements sur les créneaux
      // à venir. (La description, elle, n'est pas copiée : le site public la
      // lit en direct, rien à propager.)
      if (avant) await propagerAuxCreneauxFuturs(firestoreId, avant, rest);
    } else {
      await addDoc(collection(db, "activities"), { ...payload, createdAt: serverTimestamp() });
    }
    await fetchActivities();
    setShowForm(false);
    setEditActivity(null);
  };

  /**
   * Reporte les changements d'une activité sur ses créneaux FUTURS.
   *
   * Règles :
   *  - jamais les créneaux passés — l'historique doit rester ce qui a été vendu ;
   *  - prix et places ne sont réécrits que si le créneau portait encore
   *    l'ANCIENNE valeur du catalogue : un tarif ou une capacité réglés à la
   *    main sur un jour précis sont des choix délibérés, on ne les écrase pas ;
   *  - les places ne descendent jamais sous le nombre d'inscrits ;
   *  - un renommage suit aussi les forfaits actifs : leur slotKey commence par
   *    le titre, et un forfait dont le titre ne correspond plus ne couvre plus
   *    le créneau — l'enfant serait facturé une seconde fois.
   */
  const propagerAuxCreneauxFuturs = async (activityId: string, avant: any, apres: any) => {
    const champsChanges: string[] = [];
    const titreChange = apres.title !== undefined && apres.title !== avant.title;
    const typeChange = apres.type !== undefined && apres.type !== avant.type;
    const prixChange = apres.priceTTC !== undefined && apres.priceTTC !== avant.priceTTC;
    const tvaChange = apres.tvaTaux !== undefined && apres.tvaTaux !== avant.tvaTaux;
    const couleurChange = apres.color !== undefined && apres.color !== avant.color;
    const placesChange = apres.maxPlaces !== undefined && apres.maxPlaces !== avant.maxPlaces;
    if (titreChange) champsChanges.push("titre");
    if (typeChange) champsChanges.push("type");
    if (prixChange || tvaChange) champsChanges.push("prix");
    if (couleurChange) champsChanges.push("couleur");
    if (placesChange) champsChanges.push("places");
    if (champsChanges.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", todayStr)));
    // Rattachés par identifiant, ou par l'ancien titre pour les créneaux
    // d'avant le champ activityId.
    const cibles = snap.docs.filter(d => {
      const c = d.data() as any;
      return c.activityId === activityId || (!c.activityId && c.activityTitle === avant.title);
    });
    if (cibles.length === 0) return;

    if (!confirm(
      `Reporter les changements (${champsChanges.join(", ")}) sur ${cibles.length} créneau(x) à venir ?\n\n` +
      `Les créneaux passés ne bougent pas. Un prix ou un nombre de places réglé à la main sur un jour précis est conservé.`
    )) return;

    let maj = 0;
    for (const d of cibles) {
      const c = d.data() as any;
      const upd: any = {};
      if (titreChange) upd.activityTitle = apres.title;
      if (typeChange) upd.activityType = apres.type;
      // Prix : uniquement si le créneau suivait encore le catalogue.
      if ((prixChange || tvaChange) && (c.priceTTC === undefined || c.priceTTC === avant.priceTTC)) {
        const tva = apres.tvaTaux ?? avant.tvaTaux ?? 5.5;
        upd.priceTTC = apres.priceTTC;
        upd.priceHT = Math.round((apres.priceTTC / (1 + tva / 100)) * 100) / 100;
        upd.tvaTaux = tva;
      }
      if (couleurChange && (!c.color || c.color === avant.color)) upd.color = apres.color || null;
      if (placesChange && (c.maxPlaces === undefined || c.maxPlaces === avant.maxPlaces)) {
        upd.maxPlaces = Math.max(apres.maxPlaces, (c.enrolled || []).length);
      }
      if (Object.keys(upd).length === 0) continue;
      await updateDoc(doc(db, "creneaux", d.id), { ...upd, updatedAt: serverTimestamp() });
      maj++;
    }

    // Renommage : suivre les forfaits actifs, sinon leur slotKey (qui commence
    // par le titre) ne matche plus les créneaux renommés et l'enfant repart
    // facturé malgré son forfait.
    let forfaitsMaj = 0;
    if (titreChange) {
      const fSnap = await getDocs(query(collection(db, "forfaits")));
      for (const fd of fSnap.docs) {
        const f = fd.data() as any;
        if (f.activityTitle !== avant.title) continue;
        if (f.status && f.status !== "actif" && f.status !== "active") continue;
        const updF: any = { activityTitle: apres.title, updatedAt: serverTimestamp() };
        if (typeof f.slotKey === "string" && f.slotKey.startsWith(`${avant.title} — `)) {
          updF.slotKey = `${apres.title}${f.slotKey.slice(avant.title.length)}`;
        }
        await updateDoc(doc(db, "forfaits", fd.id), updF);
        forfaitsMaj++;
      }
    }
    alert(`✅ ${maj} créneau(x) mis à jour${forfaitsMaj > 0 ? ` · ${forfaitsMaj} forfait(s) suivis` : ""}.`);
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
        <div className="flex gap-2">
          <button onClick={() => setShowSubcatManager(v => !v)}
            className="flex items-center gap-2 bg-sand text-blue-800 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border border-gray-200 cursor-pointer hover:bg-blue-50">
            <Settings2 size={15} /> Sous-catégories
          </button>
          <button onClick={() => { setEditActivity(null); setShowForm(true); setShowSubcatManager(false); }}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400">
            <Plus size={16} /> Nouvelle activité
          </button>
        </div>
      </div>

      {/* Gestionnaire de sous-catégories */}
      {showSubcatManager && (
        <SubcategoryManager
          subcatOptions={subcatOptions}
          onUpdate={handleSubcatUpdate}
        />
      )}

      {/* Formulaire */}
      {(showForm || editActivity) && (
        <ActivityForm
          initial={editActivity || defaultActivity}
          subcatOptions={subcatOptions}
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
                <div className="flex items-center gap-2">
                  <div style={{width:10, height:10, borderRadius:"50%", background: (act as any).color || typeColors[act.type] || "#666", flexShrink:0}} />
                  <span className="font-body text-sm font-semibold text-blue-800">{act.title}</span>
                </div>
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
                <button onClick={() => { setEditActivity(act); setShowForm(false); setShowSubcatManager(false); }} title="Modifier"
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

