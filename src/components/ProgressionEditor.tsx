"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Save } from "lucide-react";

interface Props {
  childId: string;
  familyId: string;
  childName: string;
  galopLevel?: string; // niveau actuel du cavalier
}

export default function ProgressionEditor({ childId, familyId, childName, galopLevel }: Props) {
  const [acquis, setAcquis] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedNiveau, setSelectedNiveau] = useState<string>("");
  const [expandedDomaines, setExpandedDomaines] = useState<Set<string>>(new Set(["pratique_cheval", "pratique_pied", "soins", "connaissances"]));

  const docId = `${familyId}_${childId}`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "progressions", docId));
        if (snap.exists()) {
          const data = snap.data();
          setAcquis(data.acquis || {});
          setSelectedNiveau(data.niveauEnCours || GALOPS_PROGRAMME[0].id);
        } else {
          // Initialiser avec le niveau actuel du cavalier
          const defaultNiveau = galopLevel && GALOPS_PROGRAMME.find(n => n.id === galopLevel)
            ? galopLevel
            : GALOPS_PROGRAMME[0].id;
          setSelectedNiveau(defaultNiveau);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [docId, galopLevel]);

  const toggle = (competenceId: string) => {
    setAcquis(prev => ({ ...prev, [competenceId]: !prev[competenceId] }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Auto-valider tous les niveaux précédents à 100%
      const currentIdx = GALOPS_PROGRAMME.findIndex(n => n.id === selectedNiveau);
      const enrichedAcquis = { ...acquis };
      if (currentIdx > 0) {
        GALOPS_PROGRAMME.slice(0, currentIdx).forEach(niveau => {
          niveau.competences.forEach(c => {
            enrichedAcquis[c.id] = true;
          });
        });
      }

      await setDoc(doc(db, "progressions", docId), {
        childId, familyId, childName,
        niveauEnCours: selectedNiveau,
        acquis: enrichedAcquis,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setAcquis(enrichedAcquis);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const niveau = getNiveauById(selectedNiveau);
  if (!niveau) return null;

  // Grouper les compétences par domaine
  const parDomaine = niveau.competences.reduce((acc, c) => {
    if (!acc[c.domaine]) acc[c.domaine] = [];
    acc[c.domaine].push(c);
    return acc;
  }, {} as Record<string, typeof niveau.competences>);

  const totalAcquis = niveau.competences.filter(c => acquis[c.id]).length;
  const pct = Math.round((totalAcquis / niveau.competences.length) * 100);

  if (loading) return <div className="text-center py-4 text-sm text-slate-400">Chargement...</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Sélecteur de niveau */}
      <div>
        <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Niveau en cours</label>
        <select
          value={selectedNiveau}
          onChange={e => { setSelectedNiveau(e.target.value); setSaved(false); }}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-500 focus:outline-none bg-white"
        >
          <optgroup label="Galops Poneys — Cycle 1">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "poneys_1").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
          <optgroup label="Galops Poneys — Cycle 2">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "poneys_2").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
          <optgroup label="Galops Cavaliers">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "cavaliers").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Barre de progression */}
      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-body text-xs text-slate-600">{niveau.description}</span>
          <span className="font-body text-xs font-bold text-blue-600">{totalAcquis}/{niveau.competences.length} — {pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-green-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Compétences par domaine */}
      {Object.entries(parDomaine).map(([domaine, comps]) => {
        const isOpen = expandedDomaines.has(domaine);
        const acquisDomaine = comps.filter(c => acquis[c.id]).length;
        return (
          <div key={domaine} className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => {
                const next = new Set(expandedDomaines);
                isOpen ? next.delete(domaine) : next.add(domaine);
                setExpandedDomaines(next);
              }}
              className="w-full flex items-center justify-between p-3 bg-gray-50 cursor-pointer border-none text-left"
            >
              <span className="font-body text-sm font-semibold text-slate-700">
                {DOMAINE_LABELS[domaine as Domaine] ?? domaine}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-body text-xs text-slate-500">{acquisDomaine}/{comps.length}</span>
                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-50">
                {comps.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`w-full flex items-start gap-3 p-3 cursor-pointer border-none text-left transition-colors ${acquis[c.id] ? "bg-green-50" : "bg-white hover:bg-gray-50"}`}
                  >
                    {acquis[c.id]
                      ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                      : <Circle size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                    }
                    <span className={`font-body text-sm ${acquis[c.id] ? "text-green-700 line-through" : "text-slate-700"}`}>
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Bouton sauvegarder */}
      <button
        onClick={save}
        disabled={saving}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all ${
          saved ? "bg-green-500 text-white" :
          saving ? "bg-gray-200 text-slate-500" :
          "bg-blue-500 text-white hover:bg-blue-600"
        }`}
      >
        <Save size={15} />
        {saved ? "✅ Sauvegardé !" : saving ? "Sauvegarde..." : "Enregistrer la progression"}
      </button>
    </div>
  );
}
