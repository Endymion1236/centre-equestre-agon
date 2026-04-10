"use client";
import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { Salarie } from "./types";

interface Props { salaries: Salarie[]; onRefresh: () => void; }

const COULEURS = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151","#065f46","#92400e"];

export default function TabEquipe({ salaries, onRefresh }: Props) {
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [saving, setSaving] = useState(false);

  const startEdit = (s: Salarie) => { setEditId(s.id); setNom(s.nom); setCouleur(s.couleur); setShowNew(false); };
  const cancel = () => { setEditId(null); setNom(""); setCouleur(COULEURS[0]); setShowNew(false); };

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db,"salaries-management",editId),{nom:nom.trim(),couleur,updatedAt:serverTimestamp()});
        toast("✅ Modifié","success"); setEditId(null);
      } else {
        await addDoc(collection(db,"salaries-management"),{nom:nom.trim(),couleur,actif:true,createdAt:serverTimestamp()});
        toast("✅ Ajouté","success"); setShowNew(false);
      }
      setNom(""); setCouleur(COULEURS[0]); onRefresh();
    } catch(e:any) { toast(`Erreur : ${e.message}`,"error"); }
    setSaving(false);
  };

  const toggleActif = async (s: Salarie) => {
    await updateDoc(doc(db,"salaries-management",s.id),{actif:!s.actif,updatedAt:serverTimestamp()});
    onRefresh();
  };

  const del = async (s: Salarie) => {
    if (!confirm(`Supprimer ${s.nom} ?`)) return;
    await deleteDoc(doc(db,"salaries-management",s.id));
    onRefresh();
  };

  const FormBlock = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prénom / Nom</label>
        <input autoFocus value={nom} onChange={e=>setNom(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&save()}
          placeholder="Ex: Emmeline, Lilou, Nicolas..."
          className="w-full px-3 py-2 rounded-lg border border-blue-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"/>
      </div>
      <div>
        <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">Couleur</label>
        <div className="flex flex-wrap gap-2">
          {COULEURS.map(c => (
            <button key={c} onClick={()=>setCouleur(c)}
              className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${couleur===c?"border-blue-500 scale-125":"border-white"}`}
              style={{background:c}}/>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!nom.trim()||saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
          <Check size={14}/> {editId?"Modifier":"Ajouter"}
        </button>
        <button onClick={cancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">
          <X size={14}/> Annuler
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-slate-500">{salaries.filter(s=>s.actif).length} salarié(s) actif(s)</p>
        <button onClick={()=>{setShowNew(true);setEditId(null);setNom("");setCouleur(COULEURS[0]);}}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <Plus size={15}/> Ajouter
        </button>
      </div>

      {showNew && !editId && <FormBlock/>}

      <div className="flex flex-col gap-2">
        {salaries.map(s => (
          <div key={s.id}>
            {editId===s.id ? <FormBlock/> : (
              <div className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${s.actif?"border-gray-100":"border-gray-100 opacity-50"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-body text-sm font-bold flex-shrink-0" style={{background:s.couleur}}>
                  {s.nom.slice(0,2).toUpperCase()}
                </div>
                <span className="font-body text-sm font-semibold text-blue-800 flex-1">{s.nom}</span>
                {!s.actif && <span className="font-body text-xs text-slate-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactif</span>}
                <div className="flex gap-1">
                  <button onClick={()=>toggleActif(s)}
                    className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${s.actif?"bg-green-50 text-green-600 hover:bg-orange-50 hover:text-orange-600":"bg-orange-50 text-orange-600 hover:bg-green-50 hover:text-green-600"}`}>
                    {s.actif?"Actif":"Inactif"}
                  </button>
                  <button onClick={()=>startEdit(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500">
                    <Pencil size={13}/>
                  </button>
                  <button onClick={()=>del(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {salaries.length===0&&!showNew&&(
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-body text-sm text-slate-500 mb-4">Aucun salarié encore.</p>
          <button onClick={()=>setShowNew(true)} className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-100">
            Ajouter le premier salarié
          </button>
        </div>
      )}
    </div>
  );
}
