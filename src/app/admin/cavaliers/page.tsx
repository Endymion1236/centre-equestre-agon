"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Search, ChevronDown, ChevronUp, Loader2, Users, UserCheck, AlertTriangle } from "lucide-react";
import type { Family } from "@/types";

export default function CavaliersPage() {
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [editingGalop, setEditingGalop] = useState<{ familyId: string; childId: string } | null>(null);

  const fetchFamilies = async () => {
    try {
      const snap = await getDocs(collection(db, "families"));
      setFamilies(snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as (Family & { firestoreId: string })[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFamilies(); }, []);

  const handleUpdateGalop = async (familyId: string, childId: string, newLevel: string) => {
    const family = families.find((f) => f.firestoreId === familyId);
    if (!family) return;
    const updated = (family.children || []).map((c: any) => c.id === childId ? { ...c, galopLevel: newLevel } : c);
    await updateDoc(doc(db, "families", familyId), { children: updated });
    setEditingGalop(null);
    fetchFamilies();
  };

  const allChildren = families.flatMap((f) => (f.children || []).map((c: any) => ({ ...c, familyName: f.parentName })));
  const missingForms = allChildren.filter((c) => !c.sanitaryForm).length;

  const filtered = families.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.parentName?.toLowerCase().includes(q) || f.parentEmail?.toLowerCase().includes(q) || (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q));
  });

  const galopLevels = ["—", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Cavaliers & familles</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Users size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{families.length}</div><div className="font-body text-xs text-gray-400">familles</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><UserCheck size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{allChildren.length}</div><div className="font-body text-xs text-gray-400">cavaliers</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={20} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{missingForms}</div><div className="font-body text-xs text-gray-400">fiches manquantes</div></div>
        </Card>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une famille, un enfant, un email..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500">{search ? "Aucun résultat." : "Aucune famille inscrite."}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((family) => {
            const isExp = expandedFamily === family.firestoreId;
            const children = family.children || [];
            return (
              <Card key={family.firestoreId} padding="md">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedFamily(isExp ? null : family.firestoreId)}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center font-body text-sm font-bold text-blue-500">
                      {family.parentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "?"}
                    </div>
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">{family.parentName || "Sans nom"}</div>
                      <div className="font-body text-xs text-gray-400">{family.parentEmail} · {children.length} cavalier{children.length > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge color={family.authProvider === "google" ? "blue" : "purple"}>{family.authProvider === "google" ? "Google" : "Facebook"}</Badge>
                    {isExp ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </div>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-blue-500/8">
                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div><div className="font-body text-[11px] font-semibold text-gray-400">Email</div><div className="font-body text-sm text-blue-800">{family.parentEmail}</div></div>
                      <div><div className="font-body text-[11px] font-semibold text-gray-400">Téléphone</div><div className="font-body text-sm text-blue-800">{family.parentPhone || "Non renseigné"}</div></div>
                      <div><div className="font-body text-[11px] font-semibold text-gray-400">Connexion</div><div className="font-body text-sm text-blue-800">{family.authProvider === "google" ? "Google" : "Facebook"}</div></div>
                    </div>
                    {children.length === 0 ? (
                      <p className="font-body text-sm text-gray-400 italic">Aucun cavalier enregistré</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Cavaliers ({children.length})</div>
                        {children.map((child: any) => (
                          <div key={child.id} className="flex items-center justify-between bg-sand rounded-lg px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-lg">🧒</span>
                              <div>
                                <div className="font-body text-sm font-semibold text-blue-800">{child.firstName}</div>
                                <div className="font-body text-xs text-gray-400">
                                  {child.birthDate ? `Né(e) le ${new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : child.birthDate).toLocaleDateString("fr-FR")}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {editingGalop?.familyId === family.firestoreId && editingGalop?.childId === child.id ? (
                                <select defaultValue={child.galopLevel || "—"} onChange={(e) => handleUpdateGalop(family.firestoreId, child.id, e.target.value)} onBlur={() => setEditingGalop(null)} autoFocus
                                  className="px-2 py-1 rounded border border-blue-500 font-body text-xs bg-white focus:outline-none">
                                  {galopLevels.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setEditingGalop({ familyId: family.firestoreId, childId: child.id }); }}
                                  className="bg-transparent border-none cursor-pointer" title="Modifier le niveau">
                                  <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                                    {child.galopLevel && child.galopLevel !== "—" ? `Galop ${child.galopLevel}` : "Débutant"} ✏️
                                  </Badge>
                                </button>
                              )}
                              {child.sanitaryForm ? <Badge color="green">Fiche OK</Badge> : <Badge color="red">Fiche manquante</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {children.some((c: any) => c.sanitaryForm) && (
                      <div className="mt-4 pt-3 border-t border-blue-500/8">
                        <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiches sanitaires</div>
                        {children.filter((c: any) => c.sanitaryForm).map((child: any) => (
                          <div key={child.id} className="flex gap-6 text-xs font-body text-gray-500 mb-2">
                            <span className="font-semibold text-blue-800 min-w-[60px]">{child.firstName}</span>
                            <span>Allergies : {child.sanitaryForm.allergies || "Aucune"}</span>
                            <span>Urgence : {child.sanitaryForm.emergencyContactName} ({child.sanitaryForm.emergencyContactPhone})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
