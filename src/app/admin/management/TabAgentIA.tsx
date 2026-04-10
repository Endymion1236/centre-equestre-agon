"use client";
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Sparkles, Loader2, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, Salarie, TachePlanifiee, JourSemaine } from "./types";
import { JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte } from "./types";

interface Props {
  semaine: string;
  tachesType: TacheType[];
  salaries: Salarie[];
  tachesExistantes: TachePlanifiee[];
  creneaux: any[];
  onRefresh: () => void;
}

export default function TabAgentIA({ semaine, tachesType, salaries, tachesExistantes, creneaux, onRefresh }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [proposition, setProposition] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [question, setQuestion] = useState("");
  const [reponse, setReponse] = useState<string|null>(null);
  const [qLoading, setQLoading] = useState(false);

  const lundi = getLundideSemaine(semaine);
  const jourDates = JOURS.map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate()+i);
    return { jour: j, date: d, dateStr: d.toISOString().split("T")[0] };
  });

  // Contexte activités de la semaine par jour
  const activitesParJour = jourDates.reduce((acc, {jour, dateStr}) => {
    acc[jour] = creneaux
      .filter(c => c.date === dateStr)
      .map(c => `${c.activityTitle} (${c.startTime}-${c.endTime}, ${c.enrolled?.length||0} inscrits, moniteur: ${c.monitor||"?"})`);
    return acc;
  }, {} as Record<string, string[]>);

  // Charge actuelle par salarié
  const chargeActuelle = salaries.reduce((acc, sal) => {
    const mins = tachesExistantes.filter(t=>t.salarieId===sal.id).reduce((s,t)=>s+t.dureeMinutes,0);
    acc[sal.nom] = Math.round(mins/60*10)/10;
    return acc;
  }, {} as Record<string, number>);

  const genererPlanning = async () => {
    setLoading(true);
    setProposition(null);
    try {
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "planning_management",
          semaine,
          semaineLabel: `${formatDateCourte(lundi)} au ${formatDateCourte(new Date(lundi.getTime()+4*86400000))}`,
          salaries: salaries.filter(s=>s.actif).map(s=>({id:s.id,nom:s.nom})),
          tachesType: tachesType.map(t=>({
            id: t.id, label: t.label, categorie: t.categorie,
            dureeMinutes: t.dureeMinutes, recurrente: t.recurrente,
            joursDefaut: t.joursDefaut,
          })),
          activitesParJour,
          chargeActuelle,
          tachesDejaAssignees: tachesExistantes.length,
        }),
      });
      const data = await res.json();
      if (data.success) setProposition(data.planning);
      else toast(`Erreur IA : ${data.error}`, "error");
    } catch(e:any) { toast(`Erreur : ${e.message}`, "error"); }
    setLoading(false);
  };

  const importerPlanning = async () => {
    if (!proposition?.taches) return;
    setImporting(true);
    try {
      let count = 0;
      for (const t of proposition.taches) {
        const sal = salaries.find(s=>s.nom===t.salarie||s.id===t.salarieId);
        const tt = tachesType.find(x=>x.label===t.tacheLabel||x.id===t.tacheTypeId);
        if (!sal || !tt) continue;
        // Éviter doublons
        const exists = tachesExistantes.some(e=>e.salarieId===sal.id&&e.jour===t.jour&&e.tacheTypeId===tt.id);
        if (exists) continue;
        await addDoc(collection(db,"taches-planifiees"),{
          tacheTypeId: tt.id,
          tacheLabel: tt.label,
          categorie: tt.categorie,
          salarieId: sal.id,
          salarieName: sal.nom,
          jour: t.jour,
          heureDebut: t.heureDebut || "08:00",
          dureeMinutes: tt.dureeMinutes,
          semaine,
          done: false,
          createdAt: serverTimestamp(),
        });
        count++;
      }
      toast(`✅ ${count} tâches importées dans le planning`, "success");
      setProposition(null);
      onRefresh();
    } catch(e:any) { toast(`Erreur import : ${e.message}`, "error"); }
    setImporting(false);
  };

  const poserQuestion = async () => {
    if (!question.trim()) return;
    setQLoading(true);
    setReponse(null);
    try {
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question,
          context: {
            semaine,
            salaries: salaries.filter(s=>s.actif).map(s=>s.nom).join(", "),
            activitesParJour,
            chargeActuelle,
            nbTaches: tachesExistantes.length,
          },
        }),
      });
      const data = await res.json();
      setReponse(data.success ? data.answer : `Erreur : ${data.error}`);
    } catch(e:any) { setReponse(`Erreur : ${e.message}`); }
    setQLoading(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Contexte semaine */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="font-body text-xs font-semibold text-blue-800 mb-2">
          📅 Semaine {semaine.split("-W")[1]} — {formatDateCourte(lundi)} au {formatDateCourte(new Date(lundi.getTime()+4*86400000))}
        </div>
        <div className="flex flex-col gap-1">
          {jourDates.slice(0,5).map(({jour})=>{
            const acts = activitesParJour[jour]||[];
            return acts.length > 0 ? (
              <div key={jour} className="font-body text-xs text-blue-700">
                <span className="font-semibold">{JOURS_LABELS[jour].slice(0,3)} :</span> {acts.join(" · ")}
              </div>
            ) : null;
          })}
          {!Object.values(activitesParJour).some(a=>a.length>0) && (
            <div className="font-body text-xs text-slate-400">Aucune activité planifiée cette semaine.</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-blue-100">
          {salaries.filter(s=>s.actif).map(sal=>(
            <div key={sal.id} className="font-body text-[10px] bg-white rounded-lg px-2 py-1 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{background:sal.couleur}}/>
              <span className="font-semibold text-blue-800">{sal.nom}</span>
              <span className="text-slate-400">{chargeActuelle[sal.nom]||0}h assignées</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bouton générer */}
      <button onClick={genererPlanning} disabled={loading||salaries.filter(s=>s.actif).length===0||tachesType.length===0}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-50"
        style={{background:"linear-gradient(135deg,#7c3aed,#2050A0)"}}>
        {loading ? <><Loader2 size={16} className="animate-spin"/> Génération en cours...</> : <><Sparkles size={16}/> Générer le planning de la semaine</>}
      </button>

      {salaries.filter(s=>s.actif).length===0 && (
        <div className="font-body text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2">⚠️ Ajoutez des salariés dans l'onglet Équipe avant de générer.</div>
      )}
      {tachesType.length===0 && (
        <div className="font-body text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2">⚠️ Créez des tâches dans la Bibliothèque avant de générer.</div>
      )}

      {/* Proposition IA */}
      {proposition && (
        <div className="flex flex-col gap-3">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-purple-600"/>
              <span className="font-body text-sm font-semibold text-purple-800">Proposition de l'IA</span>
            </div>
            {proposition.explication && (
              <p className="font-body text-xs text-purple-700 mb-3 leading-relaxed">{proposition.explication}</p>
            )}
            {/* Résumé par salarié */}
            {proposition.resume && (
              <div className="flex flex-col gap-1 mb-3">
                {Object.entries(proposition.resume).map(([sal, heures]:any)=>(
                  <div key={sal} className="flex items-center justify-between font-body text-xs">
                    <span className="font-semibold text-blue-800">{sal}</span>
                    <span className="text-slate-500">{heures}h assignées</span>
                  </div>
                ))}
              </div>
            )}
            {/* Liste tâches */}
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {(proposition.taches||[]).map((t:any,i:number)=>(
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 text-xs">
                  <span className="font-semibold text-slate-500 w-12 flex-shrink-0">{JOURS_LABELS[t.jour as JourSemaine]?.slice(0,3)}</span>
                  <span className="font-semibold text-blue-800 flex-1">{t.tacheLabel}</span>
                  <span className="text-slate-400">{t.heureDebut}</span>
                  <span className="font-semibold text-purple-600">{t.salarie}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={importerPlanning} disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-500 hover:bg-green-600 border-none cursor-pointer disabled:opacity-50">
              {importing?<Loader2 size={15} className="animate-spin"/>:<Check size={15}/>}
              Importer dans le planning
            </button>
            <button onClick={genererPlanning} disabled={loading}
              className="px-4 py-3 rounded-xl font-body text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 border-none cursor-pointer flex items-center gap-2">
              <RefreshCw size={14}/> Régénérer
            </button>
          </div>
        </div>
      )}

      {/* Question libre */}
      <div className="border-t border-gray-100 pt-4">
        <div className="font-body text-xs font-semibold text-blue-800 mb-2">💬 Poser une question à l'agent</div>
        <div className="flex gap-2">
          <input value={question} onChange={e=>setQuestion(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&poserQuestion()}
            placeholder="Ex: Qui est disponible mercredi après-midi ? Quelle est la charge d'Emmeline ?"
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-purple-400"/>
          <button onClick={poserQuestion} disabled={qLoading||!question.trim()}
            className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 border-none cursor-pointer disabled:opacity-50 flex items-center gap-2">
            {qLoading?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>}
          </button>
        </div>
        {reponse && (
          <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
            <p className="font-body text-sm text-purple-800 whitespace-pre-wrap leading-relaxed">{reponse}</p>
          </div>
        )}
      </div>
    </div>
  );
}
