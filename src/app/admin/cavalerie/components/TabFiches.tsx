"use client";
import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Heart, Search, ChevronDown, ChevronUp, Edit3, Trash2,
  X, Save, Loader2, ClipboardList, Pill, Syringe, Wrench, Bone, Scissors, Stethoscope,
} from "lucide-react";
import type { Equide, SoinRecord, DocumentEquide, MouvementRegistre, EquideType, EquideSex, EquideStatus } from "../types";
import LastUpdated from "@/components/admin/LastUpdated";

// ── Constantes ────────────────────────────────────────────────────────────────
const typeOptions = [
  { value: "poney" as EquideType, label: "Poney" },
  { value: "shetland" as EquideType, label: "Shetland" },
  { value: "cheval" as EquideType, label: "Cheval" },
  { value: "ane" as EquideType, label: "Âne" },
];
const sexOptions = [
  { value: "hongre" as EquideSex, label: "Hongre" },
  { value: "male" as EquideSex, label: "Entier" },
  { value: "femelle" as EquideSex, label: "Jument" },
];
const statusOptions = [
  { value: "actif" as EquideStatus, label: "Actif", color: "green" as const },
  { value: "en_formation" as EquideStatus, label: "En formation", color: "blue" as const },
  { value: "indisponible" as EquideStatus, label: "Indisponible", color: "orange" as const },
  { value: "retraite" as EquideStatus, label: "Retraite", color: "gray" as const },
  { value: "sorti" as EquideStatus, label: "Sorti", color: "red" as const },
  { value: "deces" as EquideStatus, label: "Décédé", color: "red" as const },
];
const niveauOptions = ["Débutant", "Intermédiaire", "Confirmé", "Tous niveaux"];
const disciplinesList = ["Baby Poney", "Pony Games", "CSO", "Dressage", "Balade", "Cross", "Voltige", "Attelage", "Randonnée", "Compétition"];
const robesList = ["Bai", "Alezan", "Gris", "Noir", "Pie", "Isabelle", "Palomino", "Crème", "Rouan", "Appaloosa", "Autre"];
const soinTypeOptions = [
  { value: "vermifuge", label: "Vermifuge", icon: Pill },
  { value: "vaccin", label: "Vaccin", icon: Syringe },
  { value: "marechal", label: "Maréchal-ferrant", icon: Wrench },
  { value: "dentiste", label: "Dentiste", icon: Bone },
  { value: "osteopathe", label: "Ostéopathe", icon: Heart },
  { value: "veterinaire", label: "Vétérinaire", icon: Stethoscope },
  { value: "tonte", label: "Tonte", icon: Scissors },
  { value: "autre", label: "Autre", icon: ClipboardList },
];

const toDateStr = (d: any) => {
  if (!d) return "";
  if (d.toDate) return d.toDate().toISOString().split("T")[0];
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
};
const formatDate = (d: any) => {
  if (!d) return "—";
  const dt = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};
const calcAge = (birthDate: any) => {
  if (!birthDate) return "—";
  const birth = birthDate?.toDate ? birthDate.toDate() : new Date(birthDate);
  return `${new Date().getFullYear() - birth.getFullYear()} ans`;
};
const daysUntil = (d: any) => {
  if (!d) return 9999;
  const target = d?.toDate ? d.toDate() : new Date(d);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
};

const inputStyle = "w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";
const labelStyle = "font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1";

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  equides: Equide[];
  soins: SoinRecord[];
  documents: DocumentEquide[];
  mouvements: MouvementRegistre[];
  showForm: boolean;
  editingEquide: Equide | null;
  onCloseForm: () => void;
  onRefresh: () => void;
  onOpenSoinForm: (equideId: string) => void;
  onEdit: (equide: Equide) => void;
}

export default function TabFiches({
  equides, soins, documents, mouvements,
  showForm, editingEquide, onCloseForm, onRefresh, onOpenSoinForm, onEdit,
}: Props) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<EquideStatus | "all">("all");
  const [filterType, setFilterType] = useState<EquideType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    name: "", surnom: "", sire: "", puce: "", type: "poney" as EquideType, sex: "hongre" as EquideSex,
    robe: "Bai", race: "", birthDate: "", toise: "", photo: null as string | null,
    provenance: "Achat", proprietaire: "Centre",
    dateArrivee: new Date().toISOString().split("T")[0],
    dateSortie: "", motifSortie: "",
    status: "actif" as EquideStatus, available: true, niveauCavalier: "Débutant",
    disciplines: [] as string[], temperament: "", cavaliersFavoris: [] as string[],
    maxReprisesPerDay: 3, maxHeuresHebdo: 15, notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Pré-remplir le form quand editingEquide change
  useEffect(() => {
    if (editingEquide) {
      setForm({
        name: editingEquide.name, surnom: (editingEquide as any).surnom || "", sire: editingEquide.sire || "", puce: editingEquide.puce || "",
        type: editingEquide.type, sex: editingEquide.sex, robe: editingEquide.robe || "Bai",
        race: editingEquide.race || "", birthDate: toDateStr(editingEquide.birthDate),
        toise: editingEquide.toise ? String(editingEquide.toise) : "", photo: editingEquide.photo,
        provenance: editingEquide.provenance || "Achat", proprietaire: editingEquide.proprietaire || "Centre",
        dateArrivee: toDateStr(editingEquide.dateArrivee), dateSortie: toDateStr(editingEquide.dateSortie),
        motifSortie: editingEquide.motifSortie || "",
        status: editingEquide.status, available: editingEquide.available,
        niveauCavalier: editingEquide.niveauCavalier || "Débutant",
        disciplines: editingEquide.disciplines || [], temperament: editingEquide.temperament || "",
        cavaliersFavoris: editingEquide.cavaliersFavoris || [],
        maxReprisesPerDay: editingEquide.maxReprisesPerDay || 3,
        maxHeuresHebdo: editingEquide.maxHeuresHebdo || 15, notes: editingEquide.notes || "",
      });
      setEditingId(editingEquide.id);
    } else {
      setForm(emptyForm);
      setEditingId(null);
    }
  }, [editingEquide]);

  // Filtrage
  const filtered = equides.filter(e => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterType !== "all" && e.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.name.toLowerCase().includes(q) || (e.sire || "").toLowerCase().includes(q) || (e.race || "").toLowerCase().includes(q);
    }
    return true;
  });

  const saveEquide = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data: any = {
        name: form.name.trim(), surnom: form.surnom.trim(), sire: form.sire.trim(), puce: form.puce.trim(),
        type: form.type, sex: form.sex, robe: form.robe, race: form.race.trim(),
        birthDate: form.birthDate ? Timestamp.fromDate(new Date(form.birthDate)) : null,
        toise: form.toise ? Number(form.toise) : null, photo: form.photo,
        provenance: form.provenance, proprietaire: form.proprietaire.trim(),
        dateArrivee: form.dateArrivee ? Timestamp.fromDate(new Date(form.dateArrivee)) : Timestamp.now(),
        dateSortie: form.dateSortie ? Timestamp.fromDate(new Date(form.dateSortie)) : null,
        motifSortie: form.motifSortie || null,
        status: form.status, available: form.status === "actif" || form.status === "en_formation",
        niveauCavalier: form.niveauCavalier, disciplines: form.disciplines,
        temperament: form.temperament, cavaliersFavoris: form.cavaliersFavoris,
        maxReprisesPerDay: form.maxReprisesPerDay, maxHeuresHebdo: form.maxHeuresHebdo,
        notes: form.notes, updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "equides", editingId), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "equides"), data);
      }
      onCloseForm();
      setEditingId(null);
      setForm(emptyForm);
      onRefresh();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const deleteEquide = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
    await deleteDoc(doc(db, "equides", id));
    onRefresh();
  };

  return (
    <>
      {/* Modal équidé */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={onCloseForm}>
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">
                {editingId ? `Modifier ${form.name}` : "Nouvel équidé"}
              </h2>
              <button onClick={onCloseForm} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16}/></button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
              {/* Identité */}
              <section>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Identité</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelStyle}>Nom officiel *</label>
                    <input className={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Galadriel du Moulin"/>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelStyle}>Surnom <span className="text-slate-400 font-normal">(usuel, affiché au montoir)</span></label>
                    <input className={inputStyle} value={form.surnom} onChange={e => setForm(f => ({ ...f, surnom: e.target.value }))} placeholder="Ex: Gala"/>
                  </div>
                  <div>
                    <label className={labelStyle}>Type</label>
                    <select className={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as EquideType }))}>
                      {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Sexe</label>
                    <select className={inputStyle} value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value as EquideSex }))}>
                      {sexOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Robe</label>
                    <select className={inputStyle} value={form.robe} onChange={e => setForm(f => ({ ...f, robe: e.target.value }))}>
                      {robesList.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Race</label>
                    <input className={inputStyle} value={form.race} onChange={e => setForm(f => ({ ...f, race: e.target.value }))} placeholder="Ex: Connemara"/>
                  </div>
                  <div>
                    <label className={labelStyle}>Date de naissance</label>
                    <input type="date" className={inputStyle} value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Toise (cm)</label>
                    <input type="number" className={inputStyle} value={form.toise} onChange={e => setForm(f => ({ ...f, toise: e.target.value }))} placeholder="148"/>
                  </div>
                  <div>
                    <label className={labelStyle}>N° SIRE</label>
                    <input className={inputStyle} value={form.sire} onChange={e => setForm(f => ({ ...f, sire: e.target.value }))} placeholder="12345678A"/>
                  </div>
                  <div>
                    <label className={labelStyle}>N° Puce</label>
                    <input className={inputStyle} value={form.puce} onChange={e => setForm(f => ({ ...f, puce: e.target.value }))} placeholder="N° transpondeur"/>
                  </div>
                </div>
              </section>
              {/* Provenance */}
              <section>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Provenance & propriété</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Provenance</label>
                    <select className={inputStyle} value={form.provenance} onChange={e => setForm(f => ({ ...f, provenance: e.target.value }))}>
                      {["Achat", "Naissance", "Prêt", "Don", "Demi-pension", "Autre"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Propriétaire</label>
                    <input className={inputStyle} value={form.proprietaire} onChange={e => setForm(f => ({ ...f, proprietaire: e.target.value }))}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Date d&apos;arrivée</label>
                    <input type="date" className={inputStyle} value={form.dateArrivee} onChange={e => setForm(f => ({ ...f, dateArrivee: e.target.value }))}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Statut</label>
                    <select className={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as EquideStatus }))}>
                      {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              </section>
              {/* Travail */}
              <section>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Travail & aptitudes</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelStyle}>Niveau cavalier</label>
                    <select className={inputStyle} value={form.niveauCavalier} onChange={e => setForm(f => ({ ...f, niveauCavalier: e.target.value }))}>
                      {niveauOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Max reprises / jour</label>
                    <input type="number" min={1} max={6} className={inputStyle} value={form.maxReprisesPerDay}
                      onChange={e => setForm(f => ({ ...f, maxReprisesPerDay: Number(e.target.value) }))}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Max heures / semaine</label>
                    <input type="number" min={1} max={40} className={inputStyle} value={form.maxHeuresHebdo}
                      onChange={e => setForm(f => ({ ...f, maxHeuresHebdo: Number(e.target.value) }))}/>
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelStyle}>Disciplines</label>
                  <div className="flex flex-wrap gap-2">
                    {disciplinesList.map(d => (
                      <button key={d} type="button"
                        onClick={() => setForm(f => ({ ...f, disciplines: f.disciplines.includes(d) ? f.disciplines.filter(x => x !== d) : [...f.disciplines, d] }))}
                        className={`font-body text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${form.disciplines.includes(d) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Tempérament / Notes</label>
                  <textarea className={`${inputStyle} !h-20 resize-none`} value={form.temperament}
                    onChange={e => setForm(f => ({ ...f, temperament: e.target.value }))}
                    placeholder="Ex: Calme, patient avec les débutants."/>
                </div>
                <div className="mt-3">
                  <label className={labelStyle}>Notes libres</label>
                  <textarea className={`${inputStyle} !h-16 resize-none`} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Informations complémentaires…"/>
                </div>
              </section>
              {/* Mouvements (édition uniquement) */}
              {editingId && (() => {
                const eqMouvs = mouvements.filter(m => m.equideId === editingId)
                  .sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
                return eqMouvs.length > 0 ? (
                  <section>
                    <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Mouvements</div>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {eqMouvs.map((m: any) => (
                        <div key={m.id} className={`flex items-center gap-2 font-body text-xs py-2 px-3 rounded-lg ${m.type === "entree" ? "bg-green-50" : m.temporaire ? "bg-orange-50" : "bg-red-50"}`}>
                          <span className={`font-semibold ${m.type === "entree" ? "text-green-600" : m.temporaire ? "text-orange-500" : "text-red-500"}`}>
                            {m.type === "entree" ? "Entrée" : m.temporaire ? "Temp." : "Sortie"}
                          </span>
                          <span className="text-gray-400">{formatDate(m.date)}</span>
                          <span className="text-blue-800 font-semibold">{m.motif}</span>
                          {m.destination && <span className="text-gray-400">→ {m.destination}</span>}
                        </div>
                      ))}
                    </div>
                    <p className="font-body text-[10px] text-gray-400 mt-2">Pour ajouter un mouvement, utilisez l&apos;onglet &quot;Registre&quot;.</p>
                  </section>
                ) : null;
              })()}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={onCloseForm} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={saveEquide} disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                {editingId ? "Enregistrer" : "Créer l'équidé"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"/>
          <input placeholder="Rechercher par nom, SIRE, race…" value={search} onChange={e => setSearch(e.target.value)}
            className={`${inputStyle} !pl-9`}/>
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className={`${inputStyle} !w-auto`}>
          <option value="all">Tous statuts</option>
          {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className={`${inputStyle} !w-auto`}>
          <option value="all">Tous types</option>
          {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Heart size={28} className="text-blue-300"/></div>
          <p className="font-body text-sm text-gray-500">
            {equides.length === 0 ? "Aucun équidé enregistré." : "Aucun résultat pour ces filtres."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(e => {
            const equideSoins = soins.filter(s => (s as any).equideId === e.id);
            const equideDocs = documents.filter(d => d.equideId === e.id);
            const isExpanded = expandedId === e.id;
            const statusOpt = statusOptions.find(s => s.value === e.status);
            const prochainSoin = equideSoins.filter(s => s.prochainRdv).sort((a, b) => daysUntil(a.prochainRdv) - daysUntil(b.prochainRdv))[0];
            const prochainDays = prochainSoin ? daysUntil(prochainSoin.prochainRdv) : null;

            return (
              <Card key={e.id} padding="md" className={`transition-all ${isExpanded ? "ring-2 ring-blue-200" : ""}`}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : e.id)}>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Heart size={22} className="text-blue-400"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-base font-bold text-blue-800">{e.name}</span>
                      <Badge color={statusOpt?.color || "gray"}>{statusOpt?.label || e.status}</Badge>
                      {e.niveauCavalier && <Badge color="blue">{e.niveauCavalier}</Badge>}
                      {prochainDays !== null && prochainDays <= 14 && (
                        <Badge color={prochainDays < 0 ? "red" : "orange"}>
                          {prochainDays < 0 ? `Soin en retard (${Math.abs(prochainDays)}j)` : `Soin dans ${prochainDays}j`}
                        </Badge>
                      )}
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-0.5">
                      {e.race || e.type} · {e.robe} · {e.sex === "hongre" ? "Hongre" : e.sex === "femelle" ? "Jument" : "Entier"} · {calcAge(e.birthDate)}
                      {e.sire && <> · SIRE {e.sire}</>}
                    </div>
                    {(e as any).updatedAt && (
                      <div className="mt-0.5">
                        <LastUpdated timestamp={(e as any).updatedAt} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={ev => { ev.stopPropagation(); onEdit(e); }}
                      className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none transition-colors">
                      <Edit3 size={14}/>
                    </button>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-300"/> : <ChevronDown size={16} className="text-gray-300"/>}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Identité</div>
                        <div className="space-y-1.5 text-xs font-body text-gray-600">
                          {[["SIRE", e.sire], ["Puce", e.puce], ["Race", e.race], ["Toise", e.toise ? `${e.toise} cm` : null], ["Propriétaire", e.proprietaire], ["Provenance", e.provenance], ["Arrivée", formatDate(e.dateArrivee)]].map(([k, v]) => v ? (
                            <div key={k as string}><span className="text-gray-400">{k} :</span> {v as string}</div>
                          ) : null)}
                        </div>
                      </div>
                      <div>
                        <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Travail</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(e.disciplines || []).map(d => <span key={d} className="font-body text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{d}</span>)}
                          {(!e.disciplines || e.disciplines.length === 0) && <span className="text-xs text-gray-300">Aucune discipline</span>}
                        </div>
                        <div className="space-y-1 text-xs font-body text-gray-600">
                          <div><span className="text-gray-400">Max reprises/j :</span> <strong>{e.maxReprisesPerDay}</strong></div>
                          <div><span className="text-gray-400">Max h/sem :</span> <strong>{e.maxHeuresHebdo}h</strong></div>
                          {e.temperament && <div><span className="text-gray-400">Tempérament :</span> {e.temperament}</div>}
                        </div>
                      </div>
                      <div>
                        <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Soins récents</div>
                        {equideSoins.length === 0 ? <p className="text-xs text-gray-300">Aucun soin</p> : (
                          <div className="space-y-2">
                            {equideSoins.slice(0, 4).map(s => {
                              const stOpt = soinTypeOptions.find(o => o.value === s.type);
                              const SI = stOpt?.icon || ClipboardList;
                              return (
                                <div key={s.id} className="flex items-center gap-2 text-xs font-body">
                                  <SI size={14} className="text-blue-400"/>
                                  <span className="text-gray-600">{s.label || stOpt?.label}</span>
                                  <span className="text-gray-300 ml-auto">{formatDate((s as any).date)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {equideDocs.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                            {equideDocs.length} document{equideDocs.length > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    {e.notes && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="font-body text-xs text-gray-400">Notes : <span className="text-gray-600">{e.notes}</span></div>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                      <button onClick={() => onOpenSoinForm(e.id)}
                        className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                        💊 Ajouter un soin
                      </button>
                      <button onClick={() => deleteEquide(e.id, e.name)}
                        className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100 ml-auto">
                        <Trash2 size={12} className="inline mr-1"/> Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
