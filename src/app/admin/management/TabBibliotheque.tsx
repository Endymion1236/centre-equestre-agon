"use client";
import { useState, useCallback } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, CategorieTache, JourSemaine } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS } from "./types";

interface Props { taches: TacheType[]; onRefresh: () => void; }

const DUREES = [15,30,45,60,90,120,180,240];

const emptyForm = (): Partial<TacheType> => ({
  label: "", categorie: "ecuries", dureeMinutes: 30,
  recurrente: true, joursDefaut: ["lundi","mardi","mercredi","jeudi","vendredi"], horairesDefaut: [], obligatoire: false, joursObligatoires: [], notes: "",
});

// ── Formulaire extrait en composant stable (hors du render parent) ────────────
interface FormProps {
  form: Partial<TacheType>;
  editId: string | null;
  saving: boolean;
  onChange: (form: Partial<TacheType>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function TacheForm({ form, editId, saving, onChange, onSave, onCancel }: FormProps) {
  const toggleJour = (j: JourSemaine) => {
    const jours = form.joursDefaut || [];
    onChange({ ...form, joursDefaut: jours.includes(j) ? jours.filter(x => x !== j) : [...jours, j] });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Nom de la tâche</label>
          <input
            value={form.label || ""}
            onChange={e => onChange({ ...form, label: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSave(); } }}
            placeholder="Ex: Écuries matin, Check list poney..."
            className="w-full px-3 py-2 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Catégorie</label>
          <select value={form.categorie} onChange={e => onChange({ ...form, categorie: e.target.value as CategorieTache })}
            className="w-full px-3 py-2 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none">
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Durée estimée</label>
          <select value={form.dureeMinutes} onChange={e => onChange({ ...form, dureeMinutes: parseInt(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none">
            {DUREES.map(d => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d/60}h${d%60 > 0 ? d%60 : ""}`}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">Jours par défaut</label>
        <div className="flex flex-wrap gap-1.5">
          {JOURS.map(j => (
            <button key={j} onClick={() => toggleJour(j)}
              className={`px-2.5 py-1 rounded-lg font-body text-xs font-semibold border-none cursor-pointer transition-all
                ${(form.joursDefaut || []).includes(j) ? "bg-blue-500 text-white" : "bg-white text-slate-500 border border-gray-200"}`}>
              {JOURS_LABELS[j].slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">Horaires de début standards</label>
        <p className="font-body text-[10px] text-slate-400 mb-2">Créneaux habituels — proposés en priorité lors de l'ajout au planning.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(form.horairesDefaut || []).sort().map(h => (
            <span key={h} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 font-body text-xs font-semibold text-amber-700">
              {h}
              <button onClick={() => onChange({ ...form, horairesDefaut: (form.horairesDefaut || []).filter(x => x !== h) })}
                className="bg-transparent border-none cursor-pointer text-amber-400 hover:text-red-500 p-0 text-xs leading-none">✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="time"
            id="_horaire_input"
            className="px-2 py-1.5 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 w-28"
          />
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById("_horaire_input") as HTMLInputElement;
              const val = input?.value;
              if (!val) return;
              const existing = form.horairesDefaut || [];
              if (existing.includes(val)) return;
              onChange({ ...form, horairesDefaut: [...existing, val] });
              input.value = "";
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white font-body text-xs font-semibold border-none cursor-pointer hover:bg-amber-400">
            <Plus size={12} /> Ajouter
          </button>
          <div className="flex gap-1 ml-1">
            {["08:00","08:45","09:00","10:00","14:00","16:30"].filter(h => !(form.horairesDefaut || []).includes(h)).slice(0, 4).map(h => (
              <button key={h} onClick={() => onChange({ ...form, horairesDefaut: [...(form.horairesDefaut || []), h] })}
                className="px-2 py-1 rounded-md bg-gray-100 text-gray-500 font-body text-[10px] border-none cursor-pointer hover:bg-amber-100 hover:text-amber-700">
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Notes (optionnel)</label>
        <input
          value={form.notes || ""}
          onChange={e => onChange({ ...form, notes: e.target.value })}
          placeholder="Instructions, précisions..."
          className="w-full px-3 py-2 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.recurrente} onChange={e => onChange({ ...form, recurrente: e.target.checked })} className="accent-blue-500 w-4 h-4" />
          <span className="font-body text-xs text-slate-600">Récurrente (chaque semaine)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.obligatoire} onChange={e => onChange({ ...form, obligatoire: e.target.checked, joursObligatoires: e.target.checked ? (form.joursObligatoires || form.joursDefaut || []) : [] })} className="accent-red-500 w-4 h-4" />
          <span className="font-body text-xs text-slate-600">Obligatoire <span className="text-red-400">(vérifiée par l'IA)</span></span>
        </label>
      </div>
      {form.obligatoire && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="font-body text-xs font-semibold text-red-600 block mb-1.5">Nombre minimum par jour</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => onChange({ ...form, nbObligatoire: n })}
                    className={`w-8 h-8 rounded-lg font-body text-sm font-bold border-none cursor-pointer transition-all
                      ${(form.nbObligatoire || 1) === n ? "bg-red-500 text-white" : "bg-white text-slate-400 border border-gray-200"}`}>
                    {n}
                  </button>
                ))}
                <span className="font-body text-[10px] text-slate-400 ml-1">
                  {(form.nbObligatoire || 1) === 1 ? "personne" : "personnes"} minimum
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-red-600 block mb-1.5">Jours obligatoires</label>
            <div className="flex flex-wrap gap-1.5">
            {JOURS.map(j => {
              const selected = (form.joursObligatoires || []).includes(j);
              return (
                <button key={j} onClick={() => {
                  const curr = form.joursObligatoires || [];
                  onChange({ ...form, joursObligatoires: selected ? curr.filter(x => x !== j) : [...curr, j] });
                }}
                  className={`px-2.5 py-1 rounded-lg font-body text-xs font-semibold border-none cursor-pointer transition-all
                    ${selected ? "bg-red-500 text-white" : "bg-white text-slate-400 border border-gray-200"}`}>
                  {JOURS_LABELS[j].slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!form.label?.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
          <Check size={14} /> {editId ? "Modifier" : "Créer"}
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">
          <X size={14} /> Annuler
        </button>
      </div>
    </div>
  );
}

export default function TabBibliotheque({ taches, onRefresh }: Props) {
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TacheType>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const startEdit = (t: TacheType) => { setEditId(t.id); setForm({ ...t }); setShowNew(false); };
  const cancelEdit = () => { setEditId(null); setShowNew(false); setForm(emptyForm()); };

  const save = useCallback(async () => {
    if (!form.label?.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "taches-type", editId), { ...form, updatedAt: serverTimestamp() });
        toast("✅ Tâche modifiée", "success");
        setEditId(null);
      } else {
        await addDoc(collection(db, "taches-type"), { ...form, createdAt: serverTimestamp() });
        toast("✅ Tâche créée", "success");
        setShowNew(false);
      }
      setForm(emptyForm());
      onRefresh();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  }, [form, editId, onRefresh, toast]);

  const del = async (t: TacheType) => {
    if (!confirm(`Supprimer "${t.label}" ?`)) return;
    await deleteDoc(doc(db, "taches-type", t.id));
    onRefresh();
  };

  const byCategorie = CATEGORIES.map(cat => ({
    cat,
    items: taches.filter(t => t.categorie === cat.id),
  })).filter(g => g.items.length > 0 || (showNew && form.categorie === g.cat.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-slate-500">{taches.length} tâche{taches.length > 1 ? "s" : ""} dans la bibliothèque</p>
        <button onClick={() => { setShowNew(true); setEditId(null); setForm(emptyForm()); }}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <Plus size={15} /> Nouvelle tâche
        </button>
      </div>

      {showNew && !editId && (
        <TacheForm form={form} editId={null} saving={saving} onChange={setForm} onSave={save} onCancel={cancelEdit} />
      )}

      {byCategorie.map(({ cat, items }) => (
        <div key={cat.id}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{cat.emoji}</span>
            <span className="font-body text-xs font-bold uppercase tracking-wider" style={{ color: cat.color }}>{cat.label}</span>
            <span className="font-body text-xs text-slate-400">({items.length})</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map(t => (
              <div key={t.id}>
                {editId === t.id ? (
                  <TacheForm form={form} editId={editId} saving={saving} onChange={setForm} onSave={save} onCancel={cancelEdit} />
                ) : (
                  <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-2.5 hover:border-blue-200 transition-all">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                    <div className="flex-1 min-w-0">
                      <span className="font-body text-sm font-semibold text-blue-800">{t.label}</span>
                      {t.notes && <span className="ml-2 font-body text-xs text-slate-400">{t.notes}</span>}
                    </div>
                    <span className="font-body text-xs text-slate-400">
                      {t.dureeMinutes < 60 ? `${t.dureeMinutes}min` : `${t.dureeMinutes / 60}h`}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {(t.joursDefaut || []).map(j => (
                        <span key={j} className="font-body text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{JOURS_LABELS[j].slice(0, 3)}</span>
                      ))}
                    </div>
                    {t.recurrente && <span className="font-body text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">récurrente</span>}
                    {t.obligatoire && <span className="font-body text-[9px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-semibold">
                      obligatoire ×{t.nbObligatoire || 1}/j {(t.joursObligatoires || []).length > 0 && (t.joursObligatoires || []).length < 6 ? `(${(t.joursObligatoires || []).map(j => JOURS_LABELS[j].slice(0,2)).join(" ")})` : ""}
                    </span>}
                    {(t.horairesDefaut && t.horairesDefaut.length > 0) && (
                      <div className="flex flex-wrap gap-0.5">
                        {t.horairesDefaut.sort().map(h => (
                          <span key={h} className="font-body text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{h}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(t)} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => del(t)} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {taches.length === 0 && !showNew && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-body text-sm text-slate-500 mb-4">Aucune tâche dans la bibliothèque.</p>
          <button onClick={() => setShowNew(true)}
            className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-100">
            Créer ma première tâche
          </button>
        </div>
      )}
    </div>
  );
}
