"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, updateDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Printer, ClipboardList,
} from "lucide-react";

interface Creneau { id: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; status: string; }
const typeColors: Record<string,string> = {stage:"#27ae60",balade:"#e67e22",cours:"#2050A0",competition:"#7c3aed"};

export default function MontoirPage() {
  const [dayOffset, setDayOffset] = useState(0);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [equides, setEquides] = useState<any[]>([]);
  const [indisponibilites, setIndisponibilites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return d; }, [dayOffset]);
  const dateStr = currentDay.toISOString().split("T")[0];

  const fetchData = async () => {
    try {
      const [cSnap, eSnap, iSnap] = await Promise.all([
        getDocs(query(collection(db,"creneaux"),where("date","==",dateStr))),
        getDocs(collection(db,"equides")),
        getDocs(collection(db,"indisponibilites")),
      ]);
      setCreneaux(cSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>a.startTime.localeCompare(b.startTime)) as Creneau[]);
      setEquides(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      setIndisponibilites(iSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [dayOffset]);

  // Liste des équidés disponibles (pas sortis, pas indisponibles)
  const availableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    }).map((i: any) => i.equideId);

    return equides
      .filter(e => e.status !== "sorti" && !activeIndispos.includes(e.id))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [equides, indisponibilites, dateStr]);

  const unavailableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    });
    return activeIndispos.map((i: any) => {
      const eq = equides.find(e => e.id === i.equideId);
      return { name: eq?.name || "?", reason: i.motif || "Indisponible" };
    });
  }, [equides, indisponibilites, dateStr]);

  const updateEnrolled = async (cid: string, enrolled: any[]) => { await updateDoc(doc(db,"creneaux",cid),{enrolled}); fetchData(); };
  const togglePresence = (c: Creneau, childId: string, val: string) => { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, presence: val} : e)); };
  const assignHorse = (c: Creneau, childId: string, h: string) => { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, horseName: h} : e)); };
  const closeCreneau = async (cid: string) => { if(!confirm("Clôturer cette reprise ?")) return; await updateDoc(doc(db,"creneaux",cid),{status:"closed"}); fetchData(); };

  const totalE = creneaux.reduce((s,c)=>s+(c.enrolled?.length||0),0);
  const totalP = creneaux.reduce((s,c)=>s+(c.enrolled||[]).filter((e:any)=>e.presence==="present").length,0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="font-display text-2xl font-bold text-blue-800">Montoir</h1><p className="font-body text-xs text-gray-400">Présences · Affectation poneys · Clôture reprises</p></div>
        <button onClick={()=>window.print()} className="flex items-center gap-2 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><Printer size={16} /> Imprimer</button>
      </div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Veille</button>
        <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{creneaux.length} reprise{creneaux.length>1?"s":""} · {totalE} inscrits · {totalP} présents</div></div>
        <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain <ChevronRight size={16} /></button></div>
      </div>
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      <>
      {/* Équidés disponibles / indisponibles */}
      {equides.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="font-body text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
            {availableHorses.length} équidé{availableHorses.length > 1 ? "s" : ""} disponible{availableHorses.length > 1 ? "s" : ""}
          </div>
          {unavailableHorses.map((h, i) => (
            <div key={i} className="font-body text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg">
              {h.name} — {h.reason}
            </div>
          ))}
        </div>
      )}
      {creneaux.length === 0 ? <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucune reprise ce jour.</p></Card> :
      <div className="flex flex-col gap-6">{creneaux.map(c => { const en = c.enrolled||[]; const col = typeColors[c.activityType]||"#666"; const closed = c.status==="closed"; const pres = en.filter((e:any)=>e.presence==="present").length; return (
        <Card key={c.id} padding="md" className={closed?"opacity-60":""}>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-blue-500/8">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-gray-400">{c.endTime}</div></div>
              <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-gray-400">{c.monitor} · {en.length}/{c.maxPlaces}</div></div>
            </div>
            <div className="flex items-center gap-3">
              <Badge color={closed?"gray":pres===en.length&&en.length>0?"green":"orange"}>{closed?"Clôturée":`${pres}/${en.length} présents`}</Badge>
              {!closed && en.length>0 && <button onClick={()=>closeCreneau(c.id)} className="font-body text-xs font-semibold text-gray-500 bg-sand px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">Clôturer</button>}
            </div>
          </div>
          {en.length===0 ? <p className="font-body text-sm text-gray-400 italic">Aucun inscrit</p> :
          <div>
            <div className="flex items-center px-3 py-2 font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="w-8">#</span><span className="flex-1">Cavalier</span><span className="w-32">Famille</span><span className="w-36">Poney</span><span className="w-24 text-center">Présence</span>
            </div>
            {en.map((e:any, i:number) => (
              <div key={e.childId} className={`flex items-center px-3 py-2.5 rounded-lg ${i%2===0?"bg-sand":""} ${e.presence==="absent"?"opacity-40":""}`}>
                <span className="w-8 font-body text-xs text-gray-400">{i+1}</span>
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">{e.childName}</span>
                <span className="w-32 font-body text-xs text-gray-500">{e.familyName}</span>
                <span className="w-36">{!closed ? <select value={e.horseName||""} onChange={ev=>assignHorse(c,e.childId,ev.target.value)} className="px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white w-full"><option value="">Affecter...</option>{availableHorses.map(h=><option key={h.id} value={h.name}>{h.name}</option>)}</select> : <span className="font-body text-xs font-semibold text-blue-800">{e.horseName||"—"}</span>}</span>
                <span className="w-24 flex justify-center gap-2">{!closed ? <>
                  <button onClick={()=>togglePresence(c,e.childId,"present")} className={`w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="present"?"bg-green-500 text-white":"bg-gray-100 text-gray-400 hover:bg-green-100"}`}><CheckCircle2 size={16}/></button>
                  <button onClick={()=>togglePresence(c,e.childId,"absent")} className={`w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent"?"bg-red-500 text-white":"bg-gray-100 text-gray-400 hover:bg-red-100"}`}><XCircle size={16}/></button>
                </> : <Badge color={e.presence==="present"?"green":e.presence==="absent"?"red":"gray"}>{e.presence==="present"?"Présent":e.presence==="absent"?"Absent":"—"}</Badge>}</span>
              </div>
            ))}
          </div>}
        </Card>); })}</div>}
      </>}
    </div>
  );
}
