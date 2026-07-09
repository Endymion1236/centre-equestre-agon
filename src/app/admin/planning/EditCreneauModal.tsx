"use client";
import { X, Loader2, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Creneau } from "./types";
import { moniteursUniques } from "./types";
import type { Activity } from "@/types";
import ActivityPicker from "./ActivityPicker";

// Créneaux horaires disponibles de 7h à 23h par tranches de 15min
const TIME_OPTIONS = Array.from({ length: (23 - 7) * 4 + 1 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 15;
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

export interface EditForm {
  activityId?: string;
  activityType?: string;
  tvaTaux?: number;
  activityTitle: string;
  monitor: string;
  startTime: string;
  endTime: string;
  maxPlaces: number | string;
  priceTTC: number | string;
  color: string;
  allowDayBooking?: boolean;
  priceTTCDay?: number | string;
  themeStage?: string;
}

interface Props {
  creneau: Creneau & { id: string };
  form: EditForm;
  activities: Activity[];
  saving: boolean;
  applyAll: boolean;
  applyStage?: boolean;
  onApplyStageChange?: (v: boolean) => void;
  onFormChange: (form: EditForm) => void;
  onApplyAllChange: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onDuplicate?: () => void;
}

const PRESET_COLORS = ["#2050A0","#27ae60","#e67e22","#7c3aed","#D63031","#16a085","#F0A010","#0ea5e9","#db2777","#64748b"];

export default function EditCreneauModal({
  creneau, form, activities, saving, applyAll, applyStage, onFormChange, onApplyAllChange, onApplyStageChange, onClose, onSave, onDuplicate
}: Props) {
  const [moniteurs, setMoniteurs] = useState<string[]>([]);
  const [themes, setThemes] = useState<{ id: string; label: string }[]>([]);
  const [moniteurPortee, setMoniteurPortee] = useState<"single" | "all">("single");
  const initialMoniteurs = (creneau.monitor || "").split(",").map(s => s.trim()).filter(Boolean);

  // Changement d'activité : ré-applique les propriétés de l'activité choisie
  // (titre, type, prix, TVA) pour que la réservation en ligne la retrouve sous
  // le bon intitulé et la bonne catégorie. On NE touche PAS aux places (logistique
  // du créneau) ni au moniteur.
  const onPickActivity = (id: string) => {
    if (!id) return;
    const a = activities.find(x => x.id === id);
    if (!a) return;
    const ttc = (a as any).priceTTC ?? ((a.priceHT || 0) * (1 + (a.tvaTaux || 5.5) / 100));
    onFormChange({
      ...form,
      activityId: a.id,
      activityType: a.type,
      activityTitle: a.title,
      priceTTC: ttc,
      tvaTaux: a.tvaTaux || 5.5,
    });
  };
  const activityChanged = !!form.activityId && form.activityId !== (creneau as any).activityId;

  useEffect(() => {
    getDocs(collection(db, "moniteurs")).then(snap => {
      setMoniteurs(moniteursUniques(snap.docs));
    });
    getDocs(collection(db, "themes-stage")).then(snap => {
      setThemes(snap.docs.map(d => ({ id: d.id, label: (d.data() as any).label }))
        .sort((a, b) => a.label.localeCompare(b.label)));
    });
  }, []);

  const currentMoniteurs = (form.monitor || "").split(",").map(s => s.trim()).filter(Boolean);
  const moniteurChanged = JSON.stringify([...currentMoniteurs].sort()) !== JSON.stringify([...initialMoniteurs].sort());
  const enrolledCount = ((creneau as any).enrolled || []).length;
  const titleChanged = (form.activityTitle || "").trim() !== (creneau.activityTitle || "").trim();
  const isStage = creneau.activityType === "stage" || creneau.activityType === "stage_journee";
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header fixe */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Modifier le créneau</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{creneau.date} · {creneau.activityTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        {/* Contenu scrollable */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {!isStage && (
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Activité</label>
              <ActivityPicker activities={activities} value={form.activityId || ""} onChange={onPickActivity} />
              <p className="font-body text-[10px] text-slate-400 mt-1">Changer l&apos;activité met à jour l&apos;intitulé, le type et le prix — utile pour la réservation en ligne (ex. passer une promenade en « coucher de soleil »).</p>
              {activityChanged && enrolledCount > 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <p className="font-body text-[11px] text-red-800 leading-snug">
                    ⚠️ Ce créneau a déjà <strong>{enrolledCount} inscrit{enrolledCount > 1 ? "s" : ""}</strong>. Changer l&apos;activité modifie l&apos;intitulé, le type et le prix : les inscriptions et paiements déjà enregistrés peuvent se retrouver <strong>désynchronisés</strong>. À réserver de préférence aux créneaux <strong>sans réservation</strong>.
                  </p>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Titre</label>
            <input value={form.activityTitle}
              onChange={e => onFormChange({...form, activityTitle: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            {titleChanged && enrolledCount > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="font-body text-[11px] text-amber-800 leading-snug">
                  ⚠️ Ce créneau a déjà <strong>{enrolledCount} inscrit{enrolledCount > 1 ? "s" : ""}</strong>. Renommer l'intitulé peut <strong>désynchroniser les paiements</strong> : les factures et le suivi payé/impayé des inscriptions existantes garderont l'ancien nom. Pour un nouveau libellé, préférez créer un nouveau créneau.
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Couleur du créneau</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color || "#2050A0"}
                onChange={e => onFormChange({...form, color: e.target.value})}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"/>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(color => (
                  <button key={color} onClick={() => onFormChange({...form, color})}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${form.color === color ? "border-blue-500 scale-125" : "border-white"}`}
                    style={{background: color}}/>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-body text-xs font-semibold text-blue-800 block">Moniteur(s)</label>
            {(() => {
              const selected = (form.monitor || "").split(",").map(s => s.trim()).filter(Boolean);
              const toggleMoniteur = (name: string) => {
                const norm = (s: string) => s.trim().toLowerCase();
                // Retire toute occurrence existante (normalisée) puis ajoute/enlève.
                const sansDoublon = [...new Set(selected.map(s => s.trim()))].filter(s => norm(s) !== norm(name));
                const newList = selected.some(s => norm(s) === norm(name))
                  ? sansDoublon
                  : [...sansDoublon, name];
                onFormChange({ ...form, monitor: newList.join(", ") });
              };
              return (
                <div className="flex flex-wrap gap-1.5">
                  {moniteurs.map(m => {
                    // Comparaison insensible à la casse/espaces : un monitor
                    // stocké "alice" ou " Alice " doit matcher "Alice" de la
                    // liste, sinon Alice apparaissait en double (liste + orange)
                    // et devenait non sélectionnable.
                    const norm = (s: string) => s.trim().toLowerCase();
                    const isSelected = selected.some(s => norm(s) === norm(m));
                    const isNew = isSelected && !initialMoniteurs.some(s => norm(s) === norm(m));
                    return (
                      <button key={m} onClick={() => toggleMoniteur(m)}
                        className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer transition-all
                          ${isNew ? "bg-green-500 text-white ring-2 ring-green-300" : isSelected ? "bg-blue-500 text-white" : "bg-gray-100 text-slate-500 hover:bg-blue-50"}`}>
                        {isSelected ? "✓ " : ""}{m}
                      </button>
                    );
                  })}
                  {/* Moniteurs stockés mais VRAIMENT absents de la liste
                      (ex. ancien moniteur supprimé), comparaison normalisée. */}
                  {selected.filter(s => !moniteurs.some(m => m.trim().toLowerCase() === s.trim().toLowerCase())).map(m => (
                    <button key={m} onClick={() => toggleMoniteur(m)}
                      className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold bg-orange-100 text-orange-600 border-none cursor-pointer">
                      ✓ {m}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Portée du changement de moniteur — apparaît si changement détecté.
                Masqué pour les STAGES : leur portée est gérée par la case verte
                "tous les jours de ce stage" (bornée à la semaine). Le sélecteur
                ambre ci-dessous est la logique des cours récurrents (même jour de
                la semaine sur toutes les dates), inadaptée aux stages multijours. */}
            {moniteurChanged && !isStage && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
                <div className="font-body text-xs font-semibold text-amber-800">
                  📋 Appliquer ce changement de moniteur à…
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMoniteurPortee("single"); onApplyAllChange(false); }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-body text-xs font-semibold border-2 cursor-pointer transition-all text-left
                      ${moniteurPortee === "single"
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-white border-amber-200 text-amber-700 hover:border-amber-400"}`}>
                    <div className="font-semibold">Cette séance</div>
                    <div className={`text-[10px] mt-0.5 ${moniteurPortee === "single" ? "text-white/70" : "text-amber-500"}`}>
                      {creneau.date} · {creneau.startTime}
                    </div>
                  </button>
                  <button
                    onClick={() => { setMoniteurPortee("all"); onApplyAllChange(true); }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-body text-xs font-semibold border-2 cursor-pointer transition-all text-left
                      ${moniteurPortee === "all"
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-white border-blue-200 text-blue-700 hover:border-blue-400"}`}>
                    <div className="font-semibold">Toutes les séances</div>
                    <div className={`text-[10px] mt-0.5 ${moniteurPortee === "all" ? "text-white/70" : "text-blue-400"}`}>
                      Même cours · même jour · même heure
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure début</label>
              <select value={form.startTime}
                onChange={e => onFormChange({...form, startTime: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none cursor-pointer">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure fin</label>
              <select value={form.endTime}
                onChange={e => onFormChange({...form, endTime: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none cursor-pointer">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places max</label>
              <input type="number" min="1" value={form.maxPlaces}
                onChange={e => onFormChange({...form, maxPlaces: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix TTC (€)</label>
              <input type="number" min="0" step="0.5" value={form.priceTTC}
                onChange={e => onFormChange({...form, priceTTC: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
          </div>

          {/* Thème narratif (stages uniquement) */}
          {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") && (
            <div className="bg-purple-50 rounded-xl p-3 flex flex-col gap-2">
              <label className="font-body text-xs font-semibold text-purple-800 block">🎭 Thème narratif</label>
              <select value={form.themeStage || ""}
                onChange={e => onFormChange({ ...form, themeStage: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-purple-200 font-body text-sm bg-white focus:border-purple-500 focus:outline-none cursor-pointer">
                <option value="">— Non défini —</option>
                {themes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
              <div className="font-body text-[10px] text-purple-500">
                Utilisé par l'IA pour recommander les thèmes non encore vus par les cavaliers.
              </div>
            </div>
          )}

          {/* Option inscription à la journée (stages uniquement) */}
          {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") && (
            <div className="bg-green-50 rounded-xl p-3 flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!!form.allowDayBooking} onChange={e => onFormChange({...form, allowDayBooking: e.target.checked})}
                  className="accent-green-600 w-4 h-4"/>
                <div>
                  <div className="font-body text-sm font-semibold text-green-800">Autoriser l'inscription à la journée</div>
                  <div className="font-body text-xs text-slate-500 mt-0.5">Les cavaliers pourront choisir des jours individuels au lieu de la semaine complète</div>
                </div>
              </label>
              {form.allowDayBooking && (
                <div>
                  <label className="font-body text-xs font-semibold text-green-800 block mb-1">Prix TTC par journée (€)</label>
                  <input type="number" min="0" step="0.5" value={form.priceTTCDay || ""}
                    onChange={e => onFormChange({...form, priceTTCDay: e.target.value})}
                    placeholder="Ex: 35"
                    className="w-full px-3 py-2 rounded-lg border border-green-200 font-body text-sm bg-white focus:border-green-500 focus:outline-none"/>
                  <div className="font-body text-[10px] text-slate-500 mt-1">Si vide, le tarif sera calculé au prorata du prix semaine</div>
                </div>
              )}
            </div>
          )}

          {/* Case "appliquer à tous" — masquée si le changement moniteur gère déjà la portée */}
          {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") ? (
            <label className="flex items-start gap-3 bg-green-50 rounded-xl p-3 cursor-pointer">
              <input type="checkbox" checked={!!applyStage} onChange={e => onApplyStageChange?.(e.target.checked)}
                className="accent-green-600 w-4 h-4 mt-0.5"/>
              <div>
                <div className="font-body text-sm font-semibold text-green-800">Appliquer à tous les jours de ce stage</div>
                <div className="font-body text-xs text-slate-500 mt-0.5">
                  Horaires, moniteur, places et prix appliqués à tous les jours du stage cette semaine.
                  Décochez pour ne modifier que le {new Date(creneau.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                </div>
              </div>
            </label>
          ) : !moniteurChanged && (
            <label className="flex items-start gap-3 bg-blue-50 rounded-xl p-3 cursor-pointer">
              <input type="checkbox" checked={applyAll} onChange={e => onApplyAllChange(e.target.checked)}
                className="accent-blue-500 w-4 h-4 mt-0.5"/>
              <div>
                <div className="font-body text-sm font-semibold text-blue-800">Appliquer à tous les créneaux similaires</div>
                <div className="font-body text-xs text-slate-500 mt-0.5">Même titre · même jour de la semaine · même heure de départ</div>
              </div>
            </label>
          )}
        </div>
        {/* Footer fixe avec les boutons */}
        <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="px-5 py-3 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
          {onDuplicate && (
            <button onClick={onDuplicate}
              className="px-4 py-3 rounded-xl font-body text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border-none cursor-pointer flex items-center gap-1.5">
              <Copy size={14}/>Dupliquer
            </button>
          )}
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
