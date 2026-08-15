"use client";
import type { Salarie, TachePlanifiee, TacheType } from "./types";
import { CATEGORIES, JOURS_LABELS } from "./types";
import type { EditForm } from "./planning-types";
import { DUREES_STANDARD, heureToMin, minToHeure, roundToQuarter } from "./planning-utils";

/**
 * Modale d'édition d'une tâche déjà posée : réaffectation, horaire, durée,
 * note — et surtout les deux propagations qui font la moitié de son intérêt :
 *
 *  - « appliquer aux autres personnes » : une tâche à deux (rentrer les
 *    chevaux) est stockée comme deux documents distincts ; sans cette case,
 *    décaler l'horaire de l'une désynchronise le binôme.
 *  - « appliquer la note à toute la semaine » : une consigne du type
 *    « Caramel boite jusqu'à vendredi » vaut tous les jours, contrairement
 *    à un horaire qui ne concerne que la tâche ouverte.
 *
 * Les cases ne s'affichent que si elles ont une cible (jumelles / autres
 * jours) : c'est le calcul fait ici avant chaque `label`.
 */

interface Props {
  editingTache: TachePlanifiee;
  setEditingTache: (t: TachePlanifiee | null) => void;
  editForm: EditForm;
  setEditForm: (f: EditForm) => void;
  editNoteSemaine: boolean;
  setEditNoteSemaine: (v: boolean) => void;
  editAppliquerTous: boolean;
  setEditAppliquerTous: (v: boolean) => void;
  salaries: Salarie[];
  tachesType: TacheType[];
  taches: TachePlanifiee[];
  saving: boolean;
  saveEditTache: () => void;
}

export default function PlanningModaleEdition({
  editingTache, setEditingTache, editForm, setEditForm,
  editNoteSemaine, setEditNoteSemaine, editAppliquerTous, setEditAppliquerTous,
  salaries, tachesType, taches, saving, saveEditTache,
}: Props) {
  return (
        <div onClick={() => setEditingTache(null)}
          style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(2px)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"white", borderRadius:16, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", width:"100%", maxWidth:500, padding:24, maxHeight:"90vh", overflowY:"auto"}}>
            <h3 style={{fontFamily:"serif", fontSize:18, fontWeight:700, color:"#1e3a5f", marginBottom:4}}>
              Modifier une tâche
            </h3>
            <p style={{fontFamily:"sans-serif", fontSize:12, color:"#94a3b8", marginBottom:16}}>
              {editingTache.salarieName} · {JOURS_LABELS[editingTache.jour]}
            </p>

            {/* Réaffectation : évite de supprimer/recréer la tâche */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Assignée à
            </label>
            <select value={editForm.salarieId}
              onChange={e => setEditForm({ ...editForm, salarieId: e.target.value })}
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white", marginBottom:12}}>
              {salaries.map(sal => (
                <option key={sal.id} value={sal.id}>{sal.nom}</option>
              ))}
            </select>

            {/* Sélecteur tâche type */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Tâche
            </label>
            <select value={editForm.tacheTypeId}
              onChange={e => {
                const tt = tachesType.find(t => t.id === e.target.value);
                setEditForm({ ...editForm, tacheTypeId: e.target.value, dureeMinutes: tt?.dureeMinutes ? roundToQuarter(tt.dureeMinutes) : editForm.dureeMinutes });
              }}
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white", marginBottom:12}}>
              {CATEGORIES.map(cat => {
                const items = tachesType.filter(t => t.categorie === cat.id);
                if (!items.length) return null;
                return (
                  <optgroup key={cat.id} label={`${cat.emoji} ${cat.label}`}>
                    {items.map(t => (
                      <option key={t.id} value={t.id}>
                        {cat.emoji} {t.label} ({t.dureeMinutes < 60 ? `${t.dureeMinutes}min` : `${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            {/* Heure début + durée côte à côte */}
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
              <div>
                <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
                  Heure de début
                </label>
                <input type="time" value={editForm.heureDebut}
                  onChange={e => setEditForm({ ...editForm, heureDebut: e.target.value })}
                  style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13}} />
              </div>
              <div>
                <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
                  Durée
                </label>
                <select value={editForm.dureeMinutes}
                  onChange={e => setEditForm({ ...editForm, dureeMinutes: parseInt(e.target.value, 10) })}
                  style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white"}}>
                  {/* Pas de 15 min de 15min a 4h. Si la duree actuelle de la tache n'est
                      pas un multiple de 15 (ex: ancienne tache a 20min), on l'ajoute en tete
                      pour ne pas la perdre lors de l'edition. */}
                  {(() => {
                    const standard = DUREES_STANDARD;
                    const current = editForm.dureeMinutes;
                    const all = standard.includes(current) ? standard : [current, ...standard].sort((a,b)=>a-b);
                    return all.map(d => {
                      const h = Math.floor(d/60);
                      const m = d%60;
                      const label = h === 0 ? `${m} min` : (m === 0 ? `${h}h` : `${h}h${String(m).padStart(2,"0")}`);
                      return <option key={d} value={d}>{label}</option>;
                    });
                  })()}
                </select>
              </div>
            </div>

            {/* Récap horaire calculé */}
            <div style={{background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px", marginBottom:12, fontFamily:"sans-serif", fontSize:12, color:"#64748b"}}>
              ⏱️ De <strong>{editForm.heureDebut}</strong> à <strong>{minToHeure(heureToMin(editForm.heureDebut) + editForm.dureeMinutes)}</strong>
              {" "}({editForm.dureeMinutes < 60 ? `${editForm.dureeMinutes} min` : `${Math.floor(editForm.dureeMinutes/60)}h${editForm.dureeMinutes%60>0?editForm.dureeMinutes%60:""}`})
            </div>

            {/* Notes */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Notes (optionnel)
            </label>
            <textarea value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              rows={2}
              placeholder="Précisions, rappels…"
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, marginBottom:8, resize:"vertical"}} />

            {(() => {
              // Mêmes tâches, même personne, ailleurs dans la semaine.
              const nbJours = taches.filter((t: any) =>
                t.id !== editingTache.id
                && t.semaine === editingTache.semaine
                && t.tacheTypeId === editingTache.tacheTypeId
                && t.salarieId === (editForm.salarieId || editingTache.salarieId)
              ).length;
              if (nbJours === 0) return null;
              return (
                <label style={{display:"flex", alignItems:"flex-start", gap:8, marginBottom:16, padding:"8px 10px", background:"#fefce8", border:"1px solid #fde68a", borderRadius:8, cursor:"pointer"}}>
                  <input type="checkbox" checked={editNoteSemaine}
                    onChange={e => setEditNoteSemaine(e.target.checked)}
                    style={{marginTop:2, cursor:"pointer"}} />
                  <span style={{fontFamily:"sans-serif", fontSize:11, color:"#92400e", lineHeight:1.5}}>
                    Appliquer cette note aux <strong>{nbJours} autre(s) jour(s)</strong> de la semaine
                    sur cette tâche. Les horaires de chaque jour ne sont pas modifiés.
                  </span>
                </label>
              );
            })()}

            {/* Boutons */}
            <div style={{display:"flex", gap:8}}>
              {(() => {
                // Nombre de personnes sur la MÊME tâche, même jour, même horaire.
                const nbJumelles = taches.filter((t: any) =>
                  t.id !== editingTache.id
                  && t.jour === editingTache.jour
                  && t.semaine === editingTache.semaine
                  && t.tacheTypeId === editingTache.tacheTypeId
                  && t.heureDebut === editingTache.heureDebut
                ).length;
                if (nbJumelles === 0) return null;
                return (
                  <label style={{display:"flex", alignItems:"flex-start", gap:8, marginBottom:12, padding:"8px 10px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, cursor:"pointer"}}>
                    <input type="checkbox" checked={editAppliquerTous}
                      onChange={e => setEditAppliquerTous(e.target.checked)}
                      style={{marginTop:2, cursor:"pointer"}} />
                    <span style={{fontFamily:"sans-serif", fontSize:11, color:"#1e40af", lineHeight:1.5}}>
                      Appliquer le nouvel horaire aux <strong>{nbJumelles} autre(s) personne(s)</strong> sur cette même tâche.
                    </span>
                  </label>
                );
              })()}
              <button onClick={saveEditTache} disabled={saving || !editForm.tacheTypeId}
                style={{flex:1, padding:"10px 16px", background:"#3b82f6", color:"white", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:600, cursor:"pointer", opacity: (saving || !editForm.tacheTypeId) ? 0.5 : 1}}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button onClick={() => setEditingTache(null)}
                style={{padding:"10px 16px", background:"#f1f5f9", color:"#475569", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
  );
}
