"use client";
import { JOURS_LABELS } from "./types";
import type { TachePlanifiee, TacheType, JourSemaine } from "./types";
import type { Conflit } from "./planning-types";
import { heureToMin, minToHeure } from "./planning-utils";

/**
 * Les bandeaux d'alerte au-dessus du planning : chevauchements d'horaires,
 * tâches obligatoires non assignées, et la réponse de la vérification IA.
 *
 * Ils ne s'affichent que pour l'admin — une monitrice n'a pas à arbitrer un
 * conflit d'équipe. Le bandeau des conflits est repliable parce qu'un
 * chevauchement assumé (deux personnes qui se relaient) ne doit pas masquer
 * le planning en permanence.
 *
 * Extraits car ce sont trois blocs conditionnels purement informatifs, qui
 * s'intercalaient entre la barre d'actions et la grille.
 */

interface Props {
  isAdmin: boolean;
  conflits: Conflit[];
  showConflits: boolean;
  setShowConflits: (v: boolean) => void;
  taches: TachePlanifiee[];
  tachesObligatoires: TacheType[];
  tachesManquantes: { tache: TacheType; jour: JourSemaine }[];
  iaChecking: boolean;
  iaResult: string | null;
  setIaResult: (v: string | null) => void;
  handleIACheck: () => void;
}

export default function PlanningAlertes({
  isAdmin, conflits, showConflits, setShowConflits, taches,
  tachesObligatoires, tachesManquantes, iaChecking, iaResult, setIaResult, handleIACheck,
}: Props) {
  return (
    <>
        {conflits.length > 0 && isAdmin && (
          <div style={{background: showConflits ? "#fffbeb" : "#f8fafc", border: showConflits ? "1px solid #fde68a" : "1px solid #e2e8f0", borderRadius:12, padding: showConflits ? "12px 16px" : "8px 16px", display:"flex", alignItems:"center", gap:10}}>
            <span style={{fontSize: showConflits ? 18 : 14, flexShrink:0}}>{showConflits ? "🔴" : "⚪"}</span>
            {showConflits ? (
              <div style={{flex:1}}>
                <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#92400e",marginBottom:6}}>
                  {conflits.length} conflit{conflits.length > 1 ? "s" : ""} horaire{conflits.length > 1 ? "s" : ""} détecté{conflits.length > 1 ? "s" : ""}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {conflits.map((c, i) => (
                    <div key={i} style={{fontFamily:"sans-serif",fontSize:11,color:"#78350f",display:"flex",alignItems:"center",gap:6,background:"#fef3c7",padding:"4px 10px",borderRadius:6,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700}}>{c.salarieName}</span>
                      <span style={{color:"#a16207"}}>·</span>
                      <span>{JOURS_LABELS[c.jour].slice(0, 3)}</span>
                      <span style={{color:"#a16207"}}>·</span>
                      <span style={{fontWeight:600,color:"#dc2626"}}>
                        {c.tache1.tacheLabel} ({c.tache1.heureDebut}→{minToHeure(heureToMin(c.tache1.heureDebut) + c.tache1.dureeMinutes)})
                      </span>
                      <span style={{color:"#a16207"}}>↔</span>
                      <span style={{fontWeight:600,color:"#dc2626"}}>
                        {c.tache2.tacheLabel} ({c.tache2.heureDebut}→{minToHeure(heureToMin(c.tache2.heureDebut) + c.tache2.dureeMinutes)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span style={{fontFamily:"sans-serif",fontSize:11,color:"#94a3b8",flex:1}}>
                {conflits.length} conflit{conflits.length > 1 ? "s" : ""} masqué{conflits.length > 1 ? "s" : ""}
              </span>
            )}
            <button onClick={() => setShowConflits(!showConflits)}
              style={{flexShrink:0,padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"white",fontFamily:"sans-serif",fontSize:10,color:"#64748b",cursor:"pointer",fontWeight:600}}>
              {showConflits ? "Masquer" : "Afficher"}
            </button>
          </div>
        )}

        {tachesManquantes.length > 0 && isAdmin && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
            <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#991b1b",marginBottom:4}}>
                {tachesManquantes.length} tâche{tachesManquantes.length > 1 ? "s" : ""} obligatoire{tachesManquantes.length > 1 ? "s" : ""} manquante{tachesManquantes.length > 1 ? "s" : ""}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {tachesManquantes.slice(0, 12).map((m, i) => (
                  <span key={i} style={{fontFamily:"sans-serif",fontSize:10,background:"#fee2e2",color:"#dc2626",padding:"2px 8px",borderRadius:6,fontWeight:600}}>
                    {m.tache.label} · {JOURS_LABELS[m.jour].slice(0, 3)}
                  </span>
                ))}
                {tachesManquantes.length > 12 && (
                  <span style={{fontFamily:"sans-serif",fontSize:10,color:"#991b1b"}}>+{tachesManquantes.length - 12} autres</span>
                )}
              </div>
            </div>
            <button onClick={handleIACheck} disabled={iaChecking}
              style={{flexShrink:0,padding:"6px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              {iaChecking ? <div style={{width:12,height:12,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /> : <span>🤖</span>}
              {iaChecking ? "Analyse…" : "Vérifier avec l'IA"}
            </button>
          </div>
        )}

        {tachesManquantes.length === 0 && tachesObligatoires.length > 0 && taches.length > 0 && isAdmin && (
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>✅</span>
            <span style={{fontFamily:"sans-serif",fontSize:12,color:"#166534",fontWeight:600}}>
              Toutes les tâches obligatoires sont assignées cette semaine
            </span>
            <div style={{flex:1}} />
            <button onClick={handleIACheck} disabled={iaChecking}
              style={{padding:"5px 12px",borderRadius:8,border:"1px solid #d4d4d8",background:"white",color:"#7c3aed",fontFamily:"sans-serif",fontSize:10,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {iaChecking ? "Analyse…" : "🤖 Check complet IA"}
            </button>
          </div>
        )}

        {iaResult && isAdmin && (
          <div style={{background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:12,padding:"14px 18px",position:"relative"}}>
            <button onClick={() => setIaResult(null)}
              style={{position:"absolute",top:8,right:10,background:"transparent",border:"none",cursor:"pointer",color:"#a78bfa",fontSize:16}}>✕</button>
            <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              🤖 Analyse IA du planning
            </div>
            <div style={{fontFamily:"sans-serif",fontSize:12,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
              {iaResult}
            </div>
          </div>
        )}
    </>
  );
}
