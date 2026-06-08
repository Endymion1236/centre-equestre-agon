"use client";
import { useState, useRef } from "react";
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Sparkles, Loader2, Check, RefreshCw, Mic, MicOff, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, Salarie, TachePlanifiee, JourSemaine } from "./types";
import { JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte, calcTempsTravailJour } from "./types";
import { authFetch } from "@/lib/auth-fetch";

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

  // ── Agent par commande (voix/texte) → actions ajout/suppression ──────────
  const [command, setCommand] = useState("");
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdActions, setCmdActions] = useState<any[] | null>(null);
  const [cmdMessage, setCmdMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const file = new File([new Blob(chunks, { type: mime || "audio/webm" })], "cmd.webm", { type: mime || "audio/webm" });
        setTranscribing(true);
        try {
          const fd = new FormData(); fd.append("audio", file);
          const res = await authFetch("/api/whisper", { method: "POST", body: fd });
          const data = await res.json();
          if (data.success) setCommand(prev => (prev ? prev.trim() + " " : "") + data.text);
          else toast(`Erreur transcription : ${data.error}`, "error");
        } catch (e: any) { toast(`Erreur transcription : ${e.message}`, "error"); }
        setTranscribing(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) { toast(`Micro indisponible : ${e.message}`, "error"); }
  };
  const stopRec = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
  };

  const interpreter = async () => {
    if (!command.trim()) return;
    setCmdLoading(true); setCmdActions(null); setCmdMessage("");

    const toMin = (h: string) => { const [a, b] = (h || "08:00").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
    const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

    // Heure de fin de la dernière tâche déjà prévue, par salarié et par jour
    const finDeJournee: Record<string, Record<string, string>> = {};
    salaries.filter(s => s.actif).forEach(s => {
      finDeJournee[s.nom] = {};
      JOURS.forEach(j => {
        const dayT = tachesExistantes.filter(t => t.salarieId === s.id && t.jour === j);
        if (!dayT.length) return;
        const lastEnd = Math.max(...dayT.map((t: any) => toMin(t.heureDebut || "08:00") + (t.dureeMinutes || 0)));
        finDeJournee[s.nom][j] = toHHMM(lastEnd);
      });
    });

    try {
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "management_command",
          command,
          semaineLabel: `${formatDateCourte(lundi)} au ${formatDateCourte(new Date(lundi.getTime() + 4 * 86400000))}`,
          salaries: salaries.filter(s => s.actif).map(s => ({ id: s.id, nom: s.nom })),
          tachesType: tachesType.map(t => ({ id: t.id, label: t.label, categorie: t.categorie, dureeMinutes: t.dureeMinutes })),
          tachesExistantes: tachesExistantes.map(t => ({ id: t.id, tacheLabel: t.tacheLabel, salarieName: (t as any).salarieName || "", salarieId: t.salarieId, jour: t.jour, heureDebut: (t as any).heureDebut || "" })),
          finDeJournee,
        }),
      });
      const data = await res.json();
      if (data.success) {
        let actions = (data.actions || []) as any[];
        // Enchaînement déterministe : les ajouts d'un même salarié/jour sont
        // placés bout-à-bout (pas de trou), ancrés sur l'heure proposée la plus
        // tôt du lot (l'IA a reçu l'heure de fin de journée pour bien ancrer).
        const groups: Record<string, any[]> = {};
        actions.filter(a => a.type === "add").forEach(a => {
          const k = `${a.salarieId || a.salarie}|${a.jour}`;
          (groups[k] = groups[k] || []).push(a);
        });
        Object.values(groups).forEach(g => {
          g.sort((x, y) => toMin(x.heureDebut) - toMin(y.heureDebut));
          let cursor = toMin(g[0].heureDebut || "08:00");
          g.forEach(a => {
            a.heureDebut = toHHMM(cursor);
            const tt = tachesType.find(x => x.id === a.tacheTypeId || x.label === a.tacheLabel);
            cursor += (tt?.dureeMinutes || 15);
          });
        });
        setCmdActions(actions); setCmdMessage(data.message || "");
      } else toast(`Erreur IA : ${data.error}`, "error");
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setCmdLoading(false);
  };

  const appliquerActions = async () => {
    if (!cmdActions || cmdActions.length === 0) return;
    setApplying(true);
    try {
      let nbAdd = 0, nbDel = 0;
      for (const a of cmdActions) {
        if (a.type === "add") {
          const sal = salaries.find(s => s.id === a.salarieId || s.nom === a.salarie);
          const tt = tachesType.find(x => x.id === a.tacheTypeId || x.label === a.tacheLabel);
          if (!sal || !tt) continue;
          const exists = tachesExistantes.some(e => e.salarieId === sal.id && e.jour === a.jour && e.tacheTypeId === tt.id);
          if (exists) continue;
          await addDoc(collection(db, "taches-planifiees"), {
            tacheTypeId: tt.id, tacheLabel: tt.label, categorie: tt.categorie,
            salarieId: sal.id, salarieName: sal.nom, jour: a.jour,
            heureDebut: a.heureDebut || "08:00", dureeMinutes: tt.dureeMinutes,
            semaine, done: false, createdAt: serverTimestamp(),
          });
          nbAdd++;
        } else if (a.type === "remove" && a.tacheId) {
          // sécurité : ne supprimer que si l'id existe bien dans la semaine courante
          if (!tachesExistantes.some(e => e.id === a.tacheId)) continue;
          await deleteDoc(doc(db, "taches-planifiees", a.tacheId));
          nbDel++;
        }
      }
      toast(`✅ ${nbAdd} ajout${nbAdd > 1 ? "s" : ""}, ${nbDel} suppression${nbDel > 1 ? "s" : ""}`, "success");
      setCmdActions(null); setCommand(""); setCmdMessage("");
      onRefresh();
    } catch (e: any) { toast(`Erreur application : ${e.message}`, "error"); }
    setApplying(false);
  };

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

  // Charge actuelle par salarié (somme par jour de amplitude - pauses)
  const chargeActuelle = salaries.reduce((acc, sal) => {
    let mins = 0;
    for (const jour of JOURS) {
      const dayT = tachesExistantes.filter(t => t.salarieId === sal.id && t.jour === jour);
      mins += calcTempsTravailJour(dayT);
    }
    acc[sal.nom] = Math.round(mins/60*10)/10;
    return acc;
  }, {} as Record<string, number>);

  const genererPlanning = async () => {
    setLoading(true);
    setProposition(null);
    try {
      const res = await authFetch("/api/ia", {
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
      const res = await authFetch("/api/ia", {
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

      {/* Agent par la voix / commande → actions à valider */}
      <div className="border-t border-gray-100 pt-4">
        <div className="font-body text-xs font-semibold text-blue-800 mb-2">🎙️ Piloter par la voix (ajouter / supprimer des tâches)</div>
        <div className="flex gap-2 items-start">
          <textarea value={command} onChange={e => setCommand(e.target.value)} rows={2}
            placeholder='Ex : "Ajoute la check-list du soir à Emmeline mardi et jeudi", "Supprime les écuries du matin de samedi"'
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-purple-400 resize-y" />
          <button onClick={() => recording ? stopRec() : startRec()} disabled={transcribing}
            title="Dicter"
            className={`px-3 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-50 flex items-center justify-center ${recording ? "bg-red-500 text-white" : "bg-purple-100 text-purple-700 hover:bg-purple-200"}`}>
            {transcribing ? <Loader2 size={16} className="animate-spin" /> : recording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>
        <button onClick={interpreter} disabled={cmdLoading || !command.trim()}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 border-none cursor-pointer disabled:opacity-50">
          {cmdLoading ? <><Loader2 size={15} className="animate-spin" /> Interprétation…</> : <><Sparkles size={15} /> Interpréter la commande</>}
        </button>

        {cmdActions && (
          <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
            {cmdMessage && <p className="font-body text-xs text-purple-700 mb-2">{cmdMessage}</p>}
            {cmdActions.length === 0 ? (
              <p className="font-body text-sm text-slate-500 italic">Aucune action proposée. Reformule ta demande.</p>
            ) : (
              <>
                <div className="font-body text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1">Actions proposées — à valider</div>
                <div className="flex flex-col gap-1.5 mb-3">
                  {cmdActions.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs">
                      {a.type === "add"
                        ? <span className="flex items-center gap-1 font-semibold text-green-600"><Plus size={13} /> Ajouter</span>
                        : <span className="flex items-center gap-1 font-semibold text-red-500"><Trash2 size={13} /> Supprimer</span>}
                      <span className="font-semibold text-blue-800 flex-1">{a.tacheLabel}</span>
                      <span className="text-slate-500">{JOURS_LABELS[a.jour as JourSemaine]?.slice(0, 3) || a.jour}</span>
                      {a.heureDebut && a.type === "add" && <span className="text-slate-400">{a.heureDebut}</span>}
                      <span className="font-semibold text-purple-600">{a.salarie}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={appliquerActions} disabled={applying}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-green-500 hover:bg-green-600 border-none cursor-pointer disabled:opacity-50">
                    {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Appliquer
                  </button>
                  <button onClick={() => { setCmdActions(null); setCmdMessage(""); }} disabled={applying}
                    className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-slate-500 bg-white border border-gray-200 cursor-pointer">Annuler</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
