"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, BookOpen, Calendar, Users, Sparkles, LayoutTemplate } from "lucide-react";
import type { TacheType, Salarie, TachePlanifiee, ModelePlanning } from "./types";
import { getISOWeek } from "./types";
import TabBibliotheque from "./TabBibliotheque";
import TabPlanning from "./TabPlanning";
import TabEquipe from "./TabEquipe";
import TabAgentIA from "./TabAgentIA";
import TabModeles from "./TabModeles";

type TabId = "planning" | "bibliotheque" | "equipe" | "ia" | "modeles";

export default function ManagementPage() {
  const [tab, setTab] = useState<TabId>("planning");
  const [loading, setLoading] = useState(true);
  const [tachesType, setTachesType] = useState<TacheType[]>([]);
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [tachesPlanifiees, setTachesPlanifiees] = useState<TachePlanifiee[]>([]);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [modeles, setModeles] = useState<ModelePlanning[]>([]);
  const [semaine, setSemaine] = useState(() => getISOWeek(new Date()));

  const fetchData = async () => {
    try {
      const [ttSnap, salSnap, crSnap, modSnap] = await Promise.all([
        getDocs(query(collection(db,"taches-type"), orderBy("categorie"))),
        getDocs(collection(db,"salaries-management")),
        getDocs(collection(db,"creneaux")),
        getDocs(collection(db,"modeles-planning")),
      ]);
      setTachesType(ttSnap.docs.map(d=>({id:d.id,...d.data()} as TacheType)));
      setSalaries(salSnap.docs.map(d=>({id:d.id,...d.data()} as Salarie)).sort((a,b)=>a.nom.localeCompare(b.nom)));
      setCreneaux(crSnap.docs.map(d=>({id:d.id,...d.data()})));
      setModeles(modSnap.docs.map(d=>({id:d.id,...d.data()} as ModelePlanning)));
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const fetchTachesPlanifiees = async () => {
    try {
      const snap = await getDocs(query(collection(db,"taches-planifiees"), where("semaine","==",semaine)));
      setTachesPlanifiees(snap.docs.map(d=>({id:d.id,...d.data()} as TachePlanifiee)));
    } catch(e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchTachesPlanifiees(); }, [semaine]);

  const refresh = () => { fetchData(); fetchTachesPlanifiees(); };

  const TABS = [
    { id: "planning" as TabId, label: "Planning", icon: Calendar },
    { id: "modeles" as TabId, label: "Modèles", icon: LayoutTemplate },
    { id: "bibliotheque" as TabId, label: "Bibliothèque", icon: BookOpen },
    { id: "equipe" as TabId, label: "Équipe", icon: Users },
    { id: "ia" as TabId, label: "Agent IA", icon: Sparkles },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Management</h1>
          <p className="font-body text-xs text-slate-500">Planning équipe · Répartition des tâches · Agent IA</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(({id, label, icon: Icon}) => (
          <button key={id} onClick={()=>setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border font-body text-sm font-medium cursor-pointer transition-all
              ${tab===id
                ? id==="ia" ? "text-white border-transparent" : "bg-blue-500 text-white border-blue-500"
                : "bg-white text-slate-600 border-gray-200 hover:border-gray-300"}`}
            style={tab===id&&id==="ia"?{background:"linear-gradient(135deg,#7c3aed,#2050A0)"}:{}}>
            <Icon size={15}/>
            {label}
            {id==="bibliotheque"&&<span className={`text-xs px-2 py-0.5 rounded-full ${tab===id?"bg-white/20 text-white":"bg-gray-100 text-gray-500"}`}>{tachesType.length}</span>}
            {id==="equipe"&&<span className={`text-xs px-2 py-0.5 rounded-full ${tab===id?"bg-white/20 text-white":"bg-gray-100 text-gray-500"}`}>{salaries.filter(s=>s.actif).length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
      ) : (
        <>
          {tab==="planning" && (
            <TabPlanning
              semaine={semaine} setSemaine={s=>{setSemaine(s);}}
              taches={tachesPlanifiees} tachesType={tachesType}
              salaries={salaries} creneaux={creneaux}
              modeles={modeles}
              onRefresh={refresh}/>
          )}
          {tab==="modeles" && (
            <TabModeles
              modeles={modeles} tachesType={tachesType}
              salaries={salaries} onRefresh={refresh}/>
          )}
          {tab==="bibliotheque" && <TabBibliotheque taches={tachesType} onRefresh={refresh}/>}
          {tab==="equipe" && <TabEquipe salaries={salaries} onRefresh={refresh}/>}
          {tab==="ia" && (
            <TabAgentIA
              semaine={semaine} tachesType={tachesType}
              salaries={salaries} tachesExistantes={tachesPlanifiees}
              creneaux={creneaux} onRefresh={refresh}/>
          )}
        </>
      )}
    </div>
  );
}
