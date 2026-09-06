"use client";
/**
 * Ajout d'un cavalier à une famille DÉJÀ existante, sans quitter le panneau
 * d'inscription. Auparavant il fallait sortir du planning, passer par la
 * fiche famille, puis revenir — et souvent reprendre la recherche du créneau.
 *
 * Composant de niveau module (et non déclaré dans le panneau) : un composant
 * recréé à chaque rendu ferait perdre le focus au champ à chaque lettre.
 */
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Check, Loader2 } from "lucide-react";

export interface ChildDraft { firstName: string; lastName: string; birthDate: string; galopLevel: string }

interface Props {
  fam: any;
  childDraft: ChildDraft;
  setChildDraft: (d: ChildDraft) => void;
  addingChild: boolean;
  setAddingChild: (v: boolean) => void;
  /** Le nouveau cavalier apparaît sans recharger le planning. */
  setChildOverrides: (f: (prev: Record<string, any[]>) => Record<string, any[]>) => void;
  inscriptionMode: "ponctuel" | "annuel";
  selectedChildren: string[];
  setSelectedChildren: (ids: string[]) => void;
  selChild: string;
  setSelChild: (id: string) => void;
  setShowAddChild: (v: boolean) => void;
  panelToast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function FormulaireAjoutCavalier({
  fam, childDraft, setChildDraft, addingChild, setAddingChild, setChildOverrides,
  inscriptionMode, selectedChildren, setSelectedChildren, selChild, setSelChild, setShowAddChild, panelToast,
}: Props) {
  return (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <div className="font-body text-xs font-semibold text-blue-800 mb-2">
                      Nouveau cavalier chez {fam.parentName}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={childDraft.firstName} autoFocus
                        onChange={e => setChildDraft({ ...childDraft, firstName: e.target.value })}
                        placeholder="Prénom *"
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <input value={childDraft.lastName}
                        onChange={e => setChildDraft({ ...childDraft, lastName: e.target.value })}
                        placeholder="Nom"
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <input type="date" value={childDraft.birthDate}
                        onChange={e => setChildDraft({ ...childDraft, birthDate: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <select value={childDraft.galopLevel}
                        onChange={e => setChildDraft({ ...childDraft, galopLevel: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm">
                        {["—","Galop 1","Galop 2","Galop 3","Galop 4","Galop 5","Galop 6","Galop 7"].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="button" disabled={addingChild || !childDraft.firstName.trim()}
                        onClick={async () => {
                          setAddingChild(true);
                          try {
                            const nouveau = {
                              id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                              firstName: childDraft.firstName.trim(),
                              lastName: (childDraft.lastName || "").trim(),
                              birthDate: childDraft.birthDate ? new Date(childDraft.birthDate) : null,
                              galopLevel: childDraft.galopLevel || "—",
                              sanitaryForm: null,
                            };
                            const liste = [...(fam.children || []), nouveau];
                            await updateDoc(doc(db, "families", fam.firestoreId), {
                              children: liste, updatedAt: serverTimestamp(),
                            });
                            // Le cavalier apparaît immédiatement dans la liste,
                            // sans recharger tout le planning.
                            setChildOverrides(prev => ({ ...prev, [fam.firestoreId]: liste }));
                            // Et il est présélectionné : c'est bien pour l'inscrire
                            // qu'on vient de le créer.
                            setSelectedChildren(inscriptionMode === "annuel" ? [nouveau.id] : [...selectedChildren, nouveau.id]);
                            if (!selChild) setSelChild(nouveau.id);
                            setShowAddChild(false);
                            panelToast(`${nouveau.firstName} ajouté(e) à la famille`, "success");
                          } catch (e: any) {
                            panelToast(`Échec : ${e?.message || e}`, "error");
                          }
                          setAddingChild(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-body text-xs font-semibold border-none cursor-pointer disabled:opacity-50">
                        {addingChild ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Ajouter
                      </button>
                      <button onClick={() => setShowAddChild(false)}
                        className="px-3 py-2 rounded-lg bg-white border border-gray-200 font-body text-xs cursor-pointer">
                        Annuler
                      </button>
                    </div>
                  </div>
  );
}
