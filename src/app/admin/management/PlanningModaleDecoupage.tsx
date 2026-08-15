"use client";
import type { JourSemaine } from "./types";
import { JOURS_LABELS } from "./types";
import type { ApercuDecoupage } from "./planning-types";
import { heureToMin, minToHeure } from "./planning-utils";

/**
 * Aperçu du découpage automatique, à valider avant écriture.
 *
 * Poser une tâche par-dessus une autre ne refuse pas l'ajout : le planning
 * s'ajuste (raccourcir, couper en deux, supprimer ce qui est entièrement
 * recouvert). Comme ces trois opérations touchent des tâches que l'admin
 * n'a pas cliquées, elles sont listées ici en toutes lettres avant d'être
 * appliquées — c'est le seul garde-fou contre une journée réécrite par
 * inadvertance.
 */

interface Props {
  pendingSplit: ApercuDecoupage;
  setPendingSplit: (v: ApercuDecoupage | null) => void;
  saving: boolean;
  ecrireTaches: (newTasks: any[], decoupes: any[]) => void;
}

export default function PlanningModaleDecoupage({ pendingSplit, setPendingSplit, saving, ecrireTaches }: Props) {
  return (
        <div onClick={() => setPendingSplit(null)}
          style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(2px)", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"white", borderRadius:16, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", width:"100%", maxWidth:560, padding:24, maxHeight:"90vh", overflowY:"auto"}}>
            <h3 style={{fontFamily:"serif", fontSize:18, fontWeight:700, color:"#1e3a5f", marginBottom:4}}>
              Ajuster le planning ?
            </h3>
            <p style={{fontFamily:"sans-serif", fontSize:12, color:"#94a3b8", marginBottom:16}}>
              La nouvelle tâche chevauche des tâches existantes. Voici ce qui sera fait :
            </p>

            {pendingSplit.decoupes.map((d: any, i: number) => (
              <div key={i} style={{border:"1px solid #e2e8f0", borderRadius:12, padding:12, marginBottom:10}}>
                <div style={{fontFamily:"sans-serif", fontSize:12, fontWeight:600, color:"#334155", marginBottom:6}}>
                  {d.salarieName} · {JOURS_LABELS[d.jour as JourSemaine]}
                </div>
                <div style={{fontFamily:"sans-serif", fontSize:13, color:"#0f766e", marginBottom:4}}>
                  ➕ {d.nouvelle} <span style={{color:"#94a3b8"}}>(nouvelle)</span>
                </div>
                {d.updates.map((u: any, j: number) => (
                  <div key={`u${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#b45309"}}>
                    ✂️ {u.label} : <span style={{textDecoration:"line-through", color:"#94a3b8"}}>{u.ancien}</span> → {u.heureDebut}→{minToHeure(heureToMin(u.heureDebut) + u.dureeMinutes)}
                  </div>
                ))}
                {d.creates.map((c: any, j: number) => (
                  <div key={`c${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#0f766e"}}>
                    ➕ {c.label} {c.heureDebut}→{minToHeure(heureToMin(c.heureDebut) + c.dureeMinutes)} <span style={{color:"#94a3b8"}}>(2ᵉ morceau)</span>
                  </div>
                ))}
                {d.deletes.map((del: any, j: number) => (
                  <div key={`d${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#dc2626"}}>
                    🗑️ {del.label} {del.plage} <span style={{color:"#94a3b8"}}>(supprimée, entièrement recouverte)</span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{display:"flex", gap:8, marginTop:14}}>
              <button onClick={() => ecrireTaches(pendingSplit.newTasks, pendingSplit.decoupes)} disabled={saving}
                style={{flex:1, padding:"12px 14px", background:"#16a34a", color:"white", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.6:1}}>
                Appliquer
              </button>
              <button onClick={() => setPendingSplit(null)} disabled={saving}
                style={{padding:"12px 18px", background:"#f1f5f9", color:"#475569", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
  );
}
