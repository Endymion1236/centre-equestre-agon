"use client";
/**
 * Services d'un établissement (écoles, centres de loisirs) proposés à
 * l'inscription au planning. Au premier clic, le service devient un
 * « cavalier » de la fiche à son nom, présélectionné ; ensuite il apparaît
 * avec les autres cavaliers (lib/services-etablissement, 25/11/2026).
 *
 * Composant de niveau module (perte du focus sinon).
 */
import { useState } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { School, Loader2 } from "lucide-react";
import { cavalierPourService, servicesSansCavalier } from "@/lib/services-etablissement";

interface Props {
  fam: any;
  setChildOverrides: (f: (prev: Record<string, any[]>) => Record<string, any[]>) => void;
  multiple: boolean;
  selectedChildren: string[];
  setSelectedChildren: (ids: string[]) => void;
  selChild: string;
  setSelChild: (id: string) => void;
  panelToast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function ServicesAInscrire({ fam, setChildOverrides, multiple, selectedChildren, setSelectedChildren, selChild, setSelChild, panelToast }: Props) {
  const [enCours, setEnCours] = useState("");
  const services = servicesSansCavalier(fam);
  if (!services.length) return null;

  const ajouter = async (nom: string) => {
    setEnCours(nom);
    try {
      const nouveau = cavalierPourService(nom, `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      const liste = [...(fam.children || []), nouveau];
      await updateDoc(doc(db, "families", fam.firestoreId), { children: liste, updatedAt: serverTimestamp() });
      setChildOverrides((prev) => ({ ...prev, [fam.firestoreId]: liste }));
      setSelectedChildren(multiple ? [...selectedChildren, nouveau.id] : [nouveau.id]);
      if (!selChild || !multiple) setSelChild(nouveau.id);
      panelToast(`${nom} ajouté à l'inscription`, "success");
    } catch (e: any) {
      panelToast(`Échec : ${e?.message || e}`, "error");
    }
    setEnCours("");
  };

  return (
    <div className="mb-2">
      <div className="font-body text-xs font-semibold text-purple-700 mb-1.5">Services de l&apos;établissement</div>
      <div className="flex flex-wrap gap-2">
        {services.map((s) => (
          <button key={s.nom} type="button" disabled={!!enCours} onClick={() => ajouter(s.nom)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 font-body text-sm cursor-pointer hover:bg-purple-100 disabled:opacity-50">
            {enCours === s.nom ? <Loader2 size={12} className="animate-spin" /> : <School size={12} />} {s.nom}
          </button>
        ))}
      </div>
    </div>
  );
}
