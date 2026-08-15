"use client";
/**
 * src/app/admin/planning/NouvelleFamilleForm.tsx
 *
 * Création d'une famille (parent + cavaliers) sans quitter le panneau
 * d'inscription : le cas « quelqu'un se présente au bureau et veut inscrire
 * son enfant tout de suite ».
 *
 * Le formulaire porte son propre brouillon (parent, cavaliers en cours de
 * saisie) : il n'intéresse personne d'autre, et le laisser dans
 * l'orchestrateur y ajoutait trois états de plus à suivre. En revanche, la
 * SUITE de la création — sélectionner la famille fraîchement créée pour
 * enchaîner sur l'inscription — appartient au panneau, et lui est rendue par
 * `onFamilleCreee`, appelée exactement à l'endroit où elle l'était avant.
 *
 * Deux garde-fous à ne pas retirer :
 *  - une date de naissance aberrante est refusée AVANT l'écriture : Firestore
 *    rejetait ces cas avec un « Timestamp seconds out of range » que personne
 *    ne pouvait comprendre côté bureau ;
 *  - le nom d'un cavalier vaut `null` tant qu'il n'a pas été touché (et non
 *    chaîne vide), pour qu'il puisse hériter du nom du foyer.
 */

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Check, Loader2 } from "lucide-react";
import { emailTemplates } from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";
import { deduireNomFoyer } from "./enroll-helpers";
import { NIVEAUX_GALOP_COMPLET, OPTIONS_FLECHAGE } from "./enroll-constantes";

export default function NouvelleFamilleForm({ onFermer, onFamilleCreee, panelToast }: {
  onFermer: () => void;
  /**
   * Appelé après création : la famille devient la sélection courante. On rend
   * aussi email et téléphone — la suite de l'inscription s'en sert pour
   * envoyer la confirmation, et une famille tout juste créée n'est pas encore
   * dans la liste venue du planning.
   */
  onFamilleCreee: (famId: string, children: any[], parent: { parentName: string; parentEmail: string; parentPhone: string }) => void;
  panelToast: (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;
}) {
  const [newFam, setNewFam] = useState({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "", civilite: "" as "" | "M." | "Mme", tags: [] as string[] });
  const [newChildren, setNewChildren] = useState<any[]>([{ firstName: "", lastName: null as string | null, birthDate: "", galopLevel: "—" }]);
  const [creatingFamily, setCreatingFamily] = useState(false);

  // Nom du foyer déduit du champ unique « Nom du parent » (cf. deduireNomFoyer).
  const nomFoyerDeduit = deduireNomFoyer(newFam.parentName);

  return (
              <div className="border border-green-200 rounded-xl overflow-hidden">
                <div className="bg-green-50 px-4 py-2.5 flex items-center justify-between">
                  <span className="font-body text-xs font-semibold text-green-700">👨‍👩‍👧 Nouvelle famille</span>
                  <button onClick={onFermer} className="text-green-400 hover:text-green-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
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
                      {OPTIONS_FLECHAGE.map((opt) => {
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
                            <button onClick={() => setNewChildren(newChildren.filter((_, i) => i !== idx))}
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
                              {NIVEAUX_GALOP_COMPLET.map(g =>
                                <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setNewChildren([...newChildren, { firstName: "", lastName: null, birthDate: "", galopLevel: "—" }])}
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
                      // Rendre la main au panneau : ajout à la liste locale,
                      // sélection de la famille et du premier cavalier, toast.
                      onFamilleCreee(famRef.id, children, {
                        parentName: newFam.parentName.trim(),
                        parentEmail: newFam.parentEmail.trim(),
                        parentPhone: newFam.parentPhone.trim(),
                      });
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
