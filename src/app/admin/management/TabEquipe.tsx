"use client";
import { useState } from "react";
import { updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Pencil, Trash2, Check, X, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { Salarie } from "./types";
import Link from "next/link";

interface Props { salaries: Salarie[]; onRefresh: () => void; }

const COULEURS = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151","#065f46","#92400e"];

export default function TabEquipe({ salaries, onRefresh }: Props) {
  const { toast } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [couleur, setCouleur] = useState(COULEURS[0]);

  const startEdit = (s: Salarie) => { setEditId(s.id); setCouleur(s.couleur); };
  const cancel = () => { setEditId(null); };

  const saveCouleur = async (id: string) => {
    await updateDoc(doc(db, "salaries-management", id), { couleur, updatedAt: serverTimestamp() });
    toast("Couleur modifiée", "success");
    setEditId(null);
    onRefresh();
  };

  const toggleActif = async (s: Salarie) => {
    await updateDoc(doc(db, "salaries-management", s.id), { actif: !s.actif, updatedAt: serverTimestamp() });
    onRefresh();
  };

  const del = async (s: Salarie) => {
    if (!confirm(`Supprimer ${s.nom} du planning management ?\n\nCela ne supprime pas le moniteur dans les paramètres.`)) return;
    await deleteDoc(doc(db, "salaries-management", s.id));
    onRefresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-body text-sm text-slate-500">{salaries.filter(s => s.actif).length} salarié(s) actif(s)</p>
          <p className="font-body text-[10px] text-slate-400">
            Synchronisés depuis Paramètres → Moniteurs. Ajoutez vos moniteurs dans les paramètres.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
            <RefreshCw size={13} /> Synchroniser
          </button>
          <Link href="/admin/parametres"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg no-underline hover:bg-blue-400">
            <ExternalLink size={13} /> Gérer les moniteurs
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {salaries.map(s => (
          <div key={s.id}>
            {editId === s.id ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-body text-sm font-semibold text-blue-800">{s.nom} — changer la couleur</div>
                <div className="flex flex-wrap gap-2">
                  {COULEURS.map(c => (
                    <button key={c} onClick={() => setCouleur(c)}
                      className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${couleur === c ? "border-blue-500 scale-125" : "border-white"}`}
                      style={{ background: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveCouleur(s.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
                    <Check size={14} /> Valider
                  </button>
                  <button onClick={cancel}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">
                    <X size={14} /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${s.actif ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-body text-sm font-bold flex-shrink-0" style={{ background: s.couleur }}>
                  {s.nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-body text-sm font-semibold text-blue-800">{s.nom}</span>
                  {(s as any).role && <span className="font-body text-xs text-slate-400 ml-2">{(s as any).role}</span>}
                </div>
                {!s.actif && <span className="font-body text-xs text-slate-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactif</span>}
                <div className="flex gap-1">
                  <button onClick={() => toggleActif(s)}
                    className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${s.actif ? "bg-green-50 text-green-600 hover:bg-orange-50 hover:text-orange-600" : "bg-orange-50 text-orange-600 hover:bg-green-50 hover:text-green-600"}`}>
                    {s.actif ? "Actif" : "Inactif"}
                  </button>
                  <button onClick={() => startEdit(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500" title="Changer la couleur">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => del(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Retirer du planning">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {salaries.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-body text-sm text-slate-500 mb-2">Aucun salarié dans le planning.</p>
          <p className="font-body text-xs text-slate-400 mb-4">
            Ajoutez des moniteurs dans Paramètres → Moniteurs, ils apparaîtront automatiquement ici.
          </p>
          <Link href="/admin/parametres"
            className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-5 py-2.5 rounded-xl no-underline hover:bg-blue-100">
            Aller dans les paramètres →
          </Link>
        </div>
      )}
    </div>
  );
}
