"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseMeteoConsult } from "@/lib/marees-parser";
import { invalidateMareesCache, type Maree } from "@/lib/marees";
import { Loader2, Save, Trash2, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";

const MOIS_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"
];

export default function MareesSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stored, setStored] = useState<Record<string, Maree[]>>({});

  // Saisie en masse
  const [pasted, setPasted] = useState("");
  const [yearHint, setYearHint] = useState(new Date().getFullYear());
  const [monthHint, setMonthHint] = useState<number | "auto">("auto");
  const [previewMode, setPreviewMode] = useState(false);
  const [parseResult, setParseResult] = useState<ReturnType<typeof parseMeteoConsult> | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Charger les marées stockées
  const fetchStored = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "marees"));
      const out: Record<string, Maree[]> = {};
      snap.forEach(d => {
        const data = d.data() as { marees?: Maree[] };
        if (data.marees) out[d.id] = data.marees;
      });
      setStored(out);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchStored(); }, []);

  // Statistiques par mois pour la visualisation
  const statsByMonth = useMemo(() => {
    const counts: Record<string, number> = {}; // "2026-04" → nbJours
    for (const dateStr of Object.keys(stored)) {
      const ym = dateStr.substring(0, 7);
      counts[ym] = (counts[ym] || 0) + 1;
    }
    return counts;
  }, [stored]);

  // Handlers
  const handlePreview = () => {
    const month = monthHint === "auto" ? undefined : monthHint;
    const result = parseMeteoConsult(pasted, yearHint, month);
    setParseResult(result);
    setPreviewMode(true);
  };

  const handleSave = async () => {
    if (!parseResult || !parseResult.success) return;
    setSaving(true);
    try {
      // Batch d'écriture (Firestore limite : 500 par batch)
      const entries = Object.entries(parseResult.data);
      const batches: typeof entries[] = [];
      for (let i = 0; i < entries.length; i += 400) {
        batches.push(entries.slice(i, i + 400));
      }
      let totalSaved = 0;
      for (const slice of batches) {
        const batch = writeBatch(db);
        for (const [dateStr, marees] of slice) {
          const ref = doc(db, "marees", dateStr);
          batch.set(ref, { marees, updatedAt: new Date().toISOString() });
        }
        await batch.commit();
        totalSaved += slice.length;
      }
      invalidateMareesCache();
      setSavedToast(`✅ ${totalSaved} jour(s) enregistré(s)`);
      setTimeout(() => setSavedToast(null), 4000);
      setPasted("");
      setPreviewMode(false);
      setParseResult(null);
      await fetchStored();
    } catch (e: any) {
      console.error(e);
      setSavedToast(`❌ Erreur : ${e?.message || e}`);
    }
    setSaving(false);
  };

  const handleDeleteMonth = async (ym: string) => {
    if (!confirm(`Supprimer toutes les marées du mois ${ym} ?\nCette action est irréversible.`)) return;
    setDeleting(true);
    try {
      const toDelete = Object.keys(stored).filter(d => d.startsWith(ym));
      for (let i = 0; i < toDelete.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of toDelete.slice(i, i + 400)) {
          batch.delete(doc(db, "marees", d));
        }
        await batch.commit();
      }
      invalidateMareesCache();
      setSavedToast(`🗑️ ${toDelete.length} jour(s) supprimé(s) du mois ${ym}`);
      setTimeout(() => setSavedToast(null), 4000);
      await fetchStored();
    } catch (e: any) {
      console.error(e);
      setSavedToast(`❌ Erreur : ${e?.message || e}`);
    }
    setDeleting(false);
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Supprimer TOUTES les marées (${Object.keys(stored).length} jours) ?\nCette action est irréversible.`)) return;
    setDeleting(true);
    try {
      const allKeys = Object.keys(stored);
      for (let i = 0; i < allKeys.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of allKeys.slice(i, i + 400)) {
          batch.delete(doc(db, "marees", d));
        }
        await batch.commit();
      }
      invalidateMareesCache();
      setSavedToast(`🗑️ Toutes les marées supprimées`);
      setTimeout(() => setSavedToast(null), 4000);
      await fetchStored();
    } catch (e: any) {
      console.error(e);
      setSavedToast(`❌ Erreur : ${e?.message || e}`);
    }
    setDeleting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-blue-800 mb-2">🌊 Marées Pointe d'Agon</h2>
        <p className="font-body text-sm text-gray-600">
          Saisie des horaires de marées affichés dans le bandeau de la Vue Jour du planning.
          Les données sont stockées dans Firestore et visibles par toute l'équipe.
        </p>
      </div>

      {/* Toast feedback */}
      {savedToast && (
        <div className={`px-4 py-3 rounded-xl font-body text-sm ${
          savedToast.startsWith("❌")
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {savedToast}
        </div>
      )}

      {/* État actuel : combien de mois saisis ? */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Calendar size={18} /> État actuel
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 font-body text-sm">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : Object.keys(stored).length === 0 ? (
          <p className="font-body text-sm text-slate-500 italic">
            Aucune marée saisie. Utilise la zone ci-dessous pour ajouter des données.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-body text-sm text-slate-600">
              <b>{Object.keys(stored).length}</b> jours de marées en base, répartis sur <b>{Object.keys(statsByMonth).length}</b> mois.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(statsByMonth)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([ym, count]) => {
                  const [year, month] = ym.split("-");
                  return (
                    <div key={ym} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
                      <span className="font-body text-xs font-semibold text-blue-800">
                        {MOIS_LABELS[parseInt(month) - 1]} {year}
                      </span>
                      <span className="font-body text-xs text-blue-600 bg-white rounded-full px-2 py-0.5">
                        {count}j
                      </span>
                      <button
                        onClick={() => handleDeleteMonth(ym)}
                        disabled={deleting}
                        title="Supprimer ce mois"
                        className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
            </div>
            <div className="mt-3">
              <button
                onClick={handleDeleteAll}
                disabled={deleting}
                className="font-body text-xs text-red-500 bg-transparent border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 cursor-pointer">
                Tout supprimer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions de saisie */}
      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-3">📥 Comment saisir un mois</h3>
        <ol className="font-body text-sm text-slate-700 list-decimal pl-5 flex flex-col gap-1.5">
          <li>
            Va sur{" "}
            <a
              href="https://marine.meteoconsult.fr/meteo-marine/horaires-des-marees/pointe-d-agon-944/avril-2026"
              target="_blank" rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-700">
              Météo Consult Marine — Pointe d'Agon
            </a>
            {" "}et choisis le mois voulu (lien sur avril 2026 par défaut).
          </li>
          <li>Sélectionne tout le contenu du tableau des marées (Ctrl+A ou Cmd+A) puis copie (Ctrl+C).</li>
          <li>Colle dans la zone ci-dessous et choisis le mois et l'année correspondants.</li>
          <li>Clique sur <b>Aperçu</b> pour vérifier que la lecture est correcte.</li>
          <li>Si OK, clique sur <b>Enregistrer</b>.</li>
        </ol>
      </div>

      {/* Zone de saisie */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-3">✏️ Saisie</h3>

        <div className="flex flex-wrap gap-3 mb-3">
          <div>
            <label className="font-body text-xs font-semibold text-slate-700 block mb-1">Année</label>
            <input
              type="number"
              value={yearHint}
              onChange={e => setYearHint(parseInt(e.target.value) || new Date().getFullYear())}
              min="2024" max="2030"
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 font-body text-sm" />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-700 block mb-1">Mois (si non détecté dans le texte)</label>
            <select
              value={monthHint === "auto" ? "auto" : String(monthHint)}
              onChange={e => setMonthHint(e.target.value === "auto" ? "auto" : parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm">
              <option value="auto">Auto-détection</option>
              {MOIS_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={pasted}
          onChange={e => { setPasted(e.target.value); setPreviewMode(false); setParseResult(null); }}
          placeholder={`Colle ici le tableau de marées copié depuis Météo Consult.\n\nExemple :\nmercredi 1\nMarée basse 02h51 1.93m\nMarée haute 07h54 12.39m  89\n…`}
          rows={12}
          className="w-full px-4 py-3 rounded-xl border border-gray-300 font-mono text-xs resize-y focus:outline-none focus:border-blue-400" />

        <div className="flex gap-2 mt-3">
          <button
            onClick={handlePreview}
            disabled={!pasted.trim()}
            className="font-body text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 disabled:opacity-50">
            👁️ Aperçu
          </button>
          {previewMode && parseResult?.success && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-600 border-none rounded-xl px-5 py-2 cursor-pointer hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer ({parseResult.daysParsed} jours)
            </button>
          )}
        </div>

        {/* Aperçu du parsing */}
        {previewMode && parseResult && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
            {parseResult.success ? (
              <div className="flex items-center gap-2 text-green-700 font-body text-sm font-semibold mb-3">
                <CheckCircle2 size={18} />
                {parseResult.daysParsed} jours détectés · {parseResult.totalMarees} marées au total
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-600 font-body text-sm font-semibold mb-3">
                <AlertTriangle size={18} /> Aucune marée n'a pu être lue.
              </div>
            )}

            {parseResult.warnings.length > 0 && (
              <div className="text-xs text-amber-700 mb-2">
                <b>Avertissements :</b>
                <ul className="list-disc pl-5">
                  {parseResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {parseResult.errors.length > 0 && (
              <div className="text-xs text-red-700 mb-2">
                <b>Erreurs :</b>
                <ul className="list-disc pl-5">
                  {parseResult.errors.slice(0, 5).map((er, i) => <li key={i}>{er}</li>)}
                  {parseResult.errors.length > 5 && <li>… et {parseResult.errors.length - 5} autres</li>}
                </ul>
              </div>
            )}

            {parseResult.success && (
              <div className="text-xs text-slate-700 max-h-64 overflow-y-auto">
                <b className="block mb-2">Aperçu (3 premiers jours) :</b>
                <pre className="bg-white rounded p-2 border border-slate-200 font-mono text-[10px]">
{Object.entries(parseResult.data).slice(0, 3).map(([d, ms]) =>
`${d} :\n${ms.map(m => `  ${m.type} ${m.time} · ${m.height}m${m.coef ? ` · coef ${m.coef}` : ""}`).join("\n")}`
).join("\n\n")}
                </pre>
                {Object.keys(parseResult.data).length > 3 && (
                  <p className="text-slate-500 mt-2">… et {Object.keys(parseResult.data).length - 3} autres jours</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
