"use client";
import { useEffect, useState } from "react";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Check, Loader2, Plus, Save, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { validateChildrenUpdate } from "@/lib/utils";
import { normalizeSearch } from "@/lib/search-normalize";

interface Theme { id: string; label: string; ordre?: number }

interface Props {
  family: any;
  child: any;
  /** Créneaux passés — servent à détecter les thèmes déjà tracés automatiquement. */
  allCreneaux: any[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Permet d'indiquer manuellement les thèmes qu'un cavalier a déjà faits.
 *
 * Pourquoi : les thèmes vus via le planning remontent tout seuls, mais tout
 * ce qui a été fait AVANT la plateforme (ou hors créneau tracé) est invisible.
 * Sans ça, la suggestion IA de thème propose des stages déjà vécus.
 *
 * On stocke uniquement les thèmes SAISIS À LA MAIN dans child.themesVus :
 * les thèmes détectés depuis le planning restent calculés à la volée, pour
 * qu'ils suivent automatiquement si un créneau est corrigé.
 */
export default function ThemesVusModal({ family, child, allCreneaux, onClose, onDone }: Props) {
  const { toast } = useToast();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>(child.themesVus || []);
  const [newTheme, setNewTheme] = useState("");

  // Thèmes déduits du planning : cochés d'office et non décochables ici
  const themesAuto = Array.from(new Set(
    allCreneaux
      .filter((c: any) => c.themeStage && (c.enrolled || []).some((e: any) => e.childId === child.id))
      .map((c: any) => String(c.themeStage).trim())
      .filter(Boolean),
  ));

  const isAuto = (label: string) =>
    themesAuto.some((t) => normalizeSearch(t) === normalizeSearch(label));

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "themes-stage"), orderBy("ordre")));
        setThemes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch (error) {
        console.error(error);
        toast("Impossible de charger la liste des thèmes", "error");
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (label: string) => {
    if (isAuto(label)) return; // déjà tracé par le planning, on n'y touche pas
    setSelected((current) =>
      current.some((t) => normalizeSearch(t) === normalizeSearch(label))
        ? current.filter((t) => normalizeSearch(t) !== normalizeSearch(label))
        : [...current, label],
    );
  };

  const addFreeTheme = () => {
    const label = newTheme.trim();
    if (!label) return;
    if (isAuto(label) || selected.some((t) => normalizeSearch(t) === normalizeSearch(label))) {
      toast("Ce thème est déjà dans la liste", "info");
      setNewTheme("");
      return;
    }
    setSelected((current) => [...current, label]);
    setNewTheme("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const currentChildren = family.children || [];
      const updated = currentChildren.map((c: any) =>
        c.id === child.id ? { ...c, themesVus: selected } : c,
      );

      // Garde-fou partagé : refuse tout écrasement massif du tableau children
      if (!validateChildrenUpdate(family.firestoreId, family.parentName, currentChildren, updated, "ThemesVusModal")) {
        toast("Sauvegarde bloquée par sécurité", "error");
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "families", family.firestoreId), {
        children: updated,
        updatedAt: serverTimestamp(),
      });
      toast("Thèmes enregistrés", "success");
      onDone();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast(`Erreur : ${error.message}`, "error");
      setSaving(false);
    }
  };

  // Thèmes saisis à la main qui ne figurent pas dans le catalogue du club
  const horsCatalogue = selected.filter(
    (t) => !themes.some((theme) => normalizeSearch(theme.label) === normalizeSearch(t)) && !isAuto(t),
  );

  const totalCoches = themesAuto.length + selected.filter((t) => !isAuto(t)).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="font-display text-lg font-bold text-blue-800">🎯 Thèmes déjà vus</div>
            <div className="font-body text-xs text-slate-500">
              {child.firstName} {child.lastName || ""} · {totalCoches} thème{totalCoches > 1 ? "s" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 border-none cursor-pointer flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenu */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <>
              <p className="font-body text-xs text-slate-500 mb-4 leading-relaxed">
                Cochez ce que {child.firstName || "le cavalier"} a déjà fait, y compris avant la plateforme.
                Ces thèmes sont pris en compte par la suggestion IA au montoir pour éviter de reproposer un stage déjà vécu.
              </p>

              {themesAuto.length > 0 && (
                <div className="mb-4 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2.5">
                  <div className="font-body text-[10px] font-semibold text-teal-700 uppercase tracking-wider mb-1.5">
                    Détectés depuis le planning ({themesAuto.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {themesAuto.map((t) => (
                      <span key={t} className="font-body text-[11px] text-teal-700 bg-white border border-teal-200 rounded-full px-2.5 py-1">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="font-body text-[10px] text-teal-600/80 mt-1.5">
                    Issus des séances où il était inscrit — non modifiables ici.
                  </div>
                </div>
              )}

              <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Thèmes du club
              </div>
              {themes.length === 0 ? (
                <p className="font-body text-xs text-slate-400 italic mb-3">
                  Aucun thème enregistré pour l’instant. Ajoutez-en un ci-dessous.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 mb-4">
                  {themes.map((theme) => {
                    const auto = isAuto(theme.label);
                    const checked = auto || selected.some((t) => normalizeSearch(t) === normalizeSearch(theme.label));
                    return (
                      <button
                        type="button"
                        key={theme.id}
                        onClick={() => toggle(theme.label)}
                        disabled={auto}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 font-body text-sm text-left cursor-pointer transition-colors disabled:cursor-default ${
                          checked
                            ? "bg-teal-50 border-teal-200 text-teal-800 font-semibold"
                            : "bg-white border-gray-200 text-slate-600 hover:border-teal-200"
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${checked ? "bg-teal-500" : "bg-gray-100 border border-gray-200"}`}>
                          {checked && <Check size={13} className="text-white" />}
                        </span>
                        <span className="flex-1">{theme.label}</span>
                        {auto && <span className="font-body text-[10px] text-teal-600 font-normal shrink-0">planning</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {horsCatalogue.length > 0 && (
                <>
                  <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Hors catalogue
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {horsCatalogue.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 font-body text-[11px] text-purple-700 bg-purple-50 border border-purple-100 rounded-full pl-2.5 pr-1.5 py-1">
                        {t}
                        <button
                          type="button"
                          onClick={() => toggle(t)}
                          className="w-4 h-4 rounded-full bg-purple-100 text-purple-600 border-none cursor-pointer flex items-center justify-center"
                          title="Retirer"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              )}

              <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Ajouter un thème hors liste
              </div>
              <div className="flex gap-2">
                <input
                  value={newTheme}
                  onChange={(event) => setNewTheme(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFreeTheme(); } }}
                  placeholder="Ex : Chevaliers, Far West…"
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={addFreeTheme}
                  disabled={!newTheme.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  <Plus size={15} /> Ajouter
                </button>
              </div>
              <p className="font-body text-[10px] text-slate-400 mt-1.5">
                Ce thème n’est ajouté qu’à ce cavalier — le catalogue du club se gère au montoir.
              </p>
            </>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-600 font-body text-sm font-semibold border-none cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white font-body text-sm font-bold border-none cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
