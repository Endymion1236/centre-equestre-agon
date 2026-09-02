"use client";

/**
 * src/app/admin/planning/FormulaireNouvelleFamille.tsx
 *
 * Créer une famille et ses cavaliers sans quitter l'inscription : le cas
 * courant du client qui se présente le jour même.
 *
 * La famille créée est aussitôt sélectionnée pour l'inscription en cours —
 * c'est pour cela qu'on la saisit. Elle est aussi rendue au parent, qui
 * l'ajoute à sa liste locale : elle apparaît sans recharger le planning.
 */

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { nomDeduitDuParent } from "@/lib/nom-foyer";
import { Loader2, X, Check } from "lucide-react";
import { emailValide } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";
import { emailTemplates } from "@/lib/email-templates";

export interface FormulaireNouvelleFamilleProps {
  panelToast: (message: string, type?: any) => void;
  /** Sélectionne la famille et le cavalier tout juste créés. */
  onCreee: (famille: any, premierCavalierId: string) => void;
  onFermer: () => void;
}

export default function FormulaireNouvelleFamille({
  panelToast, onCreee, onFermer,
}: FormulaireNouvelleFamilleProps) {
  const [newFam, setNewFam] = useState({
    parentName: "", parentEmail: "", parentPhone: "", address: "",
    zipCode: "", city: "", civilite: "" as "" | "M." | "Mme", tags: [] as string[],
  });
  const [newChildren, setNewChildren] = useState<any[]>([
    { firstName: "", lastName: null as string | null, birthDate: "", galopLevel: "—" },
  ]);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const nomFoyerDeduit = nomDeduitDuParent(newFam.parentName);
  const setShowNewFamily = (v: boolean) => { if (!v) onFermer(); };

  return (
      <div className="border border-green-200 rounded-xl overflow-hidden">
        <div className="bg-green-50 px-4 py-2.5 flex items-center justify-between">
          <span className="font-body text-xs font-semibold text-green-700">👨‍👩‍👧 Nouvelle famille</span>
          <button type="button" onClick={() => setShowNewFamily(false)} className="text-green-400 hover:text-green-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex gap-2">
            {(["M.", "Mme"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setNewFam({ ...newFam, civilite: newFam.civilite === c ? "" : c })}
                className={`font-body text-xs px-4 py-2 rounded-lg border cursor-pointer ${newFam.civilite === c ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-green-300"}`}>
                {c}
              </button>
            ))}
          </div>
          <input value={newFam.parentName} onChange={e => setNewFam({...newFam, parentName: e.target.value})}
            placeholder="Nom du parent *" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
          <div className="flex gap-2">
            <input value={newFam.parentEmail} onChange={e => setNewFam({...newFam, parentEmail: e.target.value})}
              placeholder="Email" type="email" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
            <input value={newFam.parentPhone} onChange={e => setNewFam({...newFam, parentPhone: e.target.value})}
              placeholder="Téléphone" type="tel" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
          </div>
          <input value={newFam.address} onChange={e => setNewFam({...newFam, address: e.target.value})}
            placeholder="Adresse" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
          <div className="flex gap-2">
            <input value={newFam.zipCode} onChange={e => setNewFam({...newFam, zipCode: e.target.value})}
              placeholder="Code postal" className="w-28 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
            <input value={newFam.city} onChange={e => setNewFam({...newFam, city: e.target.value})}
              placeholder="Ville" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
          </div>
          <div>
            <div className="font-body text-[10px] text-slate-400 uppercase mb-1.5">Fléchage</div>
            <div className="flex gap-1.5">
              {[
                { id: "cavalier_annee", label: "🏇 À l'année" },
                { id: "stage", label: "🎯 Stages" },
                { id: "passage", label: "👋 Passage" },
              ].map((opt) => {
                const on = newFam.tags.includes(opt.id);
                return (
                  <button key={opt.id} type="button"
                    onClick={() => setNewFam({ ...newFam, tags: on ? newFam.tags.filter((t) => t !== opt.id) : [...newFam.tags, opt.id] })}
                    className={`font-body text-xs px-3 py-1.5 rounded-full border cursor-pointer ${on ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-green-300"}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-2.5">
            <div className="font-body text-[10px] text-slate-400 uppercase mb-1.5">Cavaliers</div>
            {newChildren.map((child, idx) => (
              <div key={idx} className="mb-3 border border-gray-100 rounded-lg p-2.5 bg-white">
                <div className="flex gap-2 mb-2 items-center">
                  <input value={child.firstName} onChange={e => { const u = [...newChildren]; u[idx].firstName = e.target.value; setNewChildren(u); }}
                    placeholder="Prénom *" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  <input value={child.lastName ?? nomFoyerDeduit} onChange={e => { const u = [...newChildren]; u[idx].lastName = e.target.value; setNewChildren(u); }}
                    placeholder="Nom" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  {newChildren.length > 1 && (
                    <button type="button" onClick={() => setNewChildren(newChildren.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><X size={14} /></button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-body text-[10px] text-slate-400 block mb-1">Date de naissance</label>
                    <input value={child.birthDate} onChange={e => { const u = [...newChildren]; u[idx].birthDate = e.target.value; setNewChildren(u); }}
                      type="date" min="1920-01-01" max={new Date().toISOString().slice(0, 10)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                    {(() => {
                      // Une date future (ex. 2050 saisi pour 1950) faisait
                      // echouer la creation sur un « Timestamp seconds out
                      // of range » incomprehensible cote utilisateur.
                      if (!child.birthDate) return null;
                      const d = new Date(child.birthDate);
                      if (isNaN(d.getTime())) return null;
                      const an = d.getFullYear();
                      if (an > new Date().getFullYear() || an < 1920) {
                        return <p className="mt-1 font-body text-[10px] font-semibold text-orange-600">⚠️ Année {an} — vérifiez la saisie.</p>;
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex-1">
                    <label className="font-body text-[10px] text-slate-400 block mb-1">Niveau Galop</label>
                    <select value={child.galopLevel} onChange={e => { const u = [...newChildren]; u[idx].galopLevel = e.target.value; setNewChildren(u); }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-green-500">
                      {["—", "Poney Bronze", "Poney Argent", "Poney Or", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"].map(g =>
                        <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setNewChildren([...newChildren, { firstName: "", lastName: null, birthDate: "", galopLevel: "—" }])}
              className="font-body text-xs text-green-600 bg-transparent border-none cursor-pointer hover:underline p-0">
              + Ajouter un cavalier
            </button>
          </div>
          <button onClick={async () => {
            const validChildren = newChildren.filter(c => c.firstName.trim());
            // Date aberrante : Firestore rejette les timestamps hors
            // plage avec un message technique. On arrete avant.
            const dateInvalide = validChildren.find(c => {
              if (!c.birthDate) return false;
              const d = new Date(c.birthDate);
              if (isNaN(d.getTime())) return true;
              const an = d.getFullYear();
              return an > new Date().getFullYear() || an < 1920;
            });
            if (dateInvalide) {
              panelToast(`Date de naissance invalide pour ${dateInvalide.firstName || "un cavalier"} — vérifiez l'année`, "error");
              return;
            }
            if (!newFam.parentName.trim() || validChildren.length === 0) {
              panelToast("Nom du parent et prénom d'au moins un cavalier requis", "error");
              return;
            }
            // Adresse obligatoire, comme dans « Nouvelle famille » :
            // une fiche sans adresse se dédouble en compte orphelin le
            // jour où le parent se connecte.
            if (!emailValide(newFam.parentEmail)) {
              panelToast(
                newFam.parentEmail.trim()
                  ? "Cette adresse email ne semble pas valide — vérifiez-la"
                  : "L'adresse email est obligatoire : sans elle, la connexion du parent créera une fiche vide en double",
                "error",
              );
              return;
            }
            setCreatingFamily(true);
            try {
              const children = validChildren.map(c => ({
                id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                firstName: c.firstName.trim(),
                lastName: (c.lastName ?? nomFoyerDeduit).trim(),
                birthDate: c.birthDate ? new Date(c.birthDate) : null,
                galopLevel: c.galopLevel || "—",
                sanitaryForm: null,
              }));
              const famRef = await addDoc(collection(db, "families"), {
                civilite: newFam.civilite || null,
                parentName: newFam.parentName.trim(),
                parentEmail: newFam.parentEmail.trim(),
                parentPhone: newFam.parentPhone.trim(),
                address: newFam.address.trim(),
                zipCode: newFam.zipCode.trim(),
                city: newFam.city.trim(),
                accountType: "particulier",
                tags: newFam.tags,
                authProvider: "admin",
                authUid: "",
                children,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              // Email bienvenue
              if (newFam.parentEmail.trim()) {
                const emailData = emailTemplates.bienvenueNouvelleFamille({ parentName: newFam.parentName.trim() });
                authFetch("/api/send-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: newFam.parentEmail.trim(),
                    ...emailData,
                    context: "admin_bienvenue_famille",
                    template: "bienvenueNouvelleFamille",
                    familyId: famRef.id,
                  }),
                }).catch(() => {});
              }
              // La famille remonte au parent, qui l'ajoute à sa liste locale et
              // la sélectionne : elle apparaît sans recharger le planning.
              onCreee({
                firestoreId: famRef.id,
                parentName: newFam.parentName.trim(),
                parentEmail: newFam.parentEmail.trim(),
                parentPhone: newFam.parentPhone.trim(),
                children,
              }, children[0].id);
              const noms = children.map(c => c.firstName).join(", ");
              panelToast(`✅ Famille ${newFam.parentName} créée (${noms}) — sélectionnez le mode d'inscription`, "success");
              setNewFam({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "", civilite: "", tags: [] });
              // null = « jamais touche » : le nom du foyer sera herite.
              // Une chaine vide signifierait « efface volontairement »
              // et couperait l'heritage pour toutes les familles
              // creees ensuite sans rechargement de la page.
              setNewChildren([{ firstName: "", lastName: null, birthDate: "", galopLevel: "—" }]);
            } catch (e: any) {
              panelToast("Erreur : " + e.message, "error");
            }
            setCreatingFamily(false);
          }} disabled={creatingFamily || !newFam.parentName.trim() || !newChildren.some(c => c.firstName.trim())}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 disabled:opacity-50">
            {creatingFamily ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Créer la famille
          </button>
        </div>
      </div>
  );
}
