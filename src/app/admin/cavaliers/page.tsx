"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, Timestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Search, ChevronDown, ChevronUp, Loader2, Users, UserCheck, AlertTriangle,
  Plus, X, Save, UserPlus, Phone, Mail, Calendar, Edit3, Trash2, CalendarDays,
} from "lucide-react";
import type { Family } from "@/types";

const galopLevels = ["—", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

export default function CavaliersPage() {
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [editingGalop, setEditingGalop] = useState<{ familyId: string; childId: string } | null>(null);

  // ─── Édition infos famille ───
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ parentName: "", parentEmail: "", parentPhone: "" });

  // ─── Création famille ───
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ parentName: "", parentEmail: "", parentPhone: "" });
  const [newChildren, setNewChildren] = useState<{ firstName: string; birthDate: string; galopLevel: string }[]>([
    { firstName: "", birthDate: "", galopLevel: "—" },
  ]);
  const [saving, setSaving] = useState(false);

  // ─── Ajout enfant à famille existante ───
  const [addChildTo, setAddChildTo] = useState<string | null>(null);
  const [newChildForm, setNewChildForm] = useState({ firstName: "", birthDate: "", galopLevel: "—" });

  // ─── Inscription dans un créneau ───
  const [showEnroll, setShowEnroll] = useState<{ familyId: string; childId: string; childName: string } | null>(null);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [enrollSearch, setEnrollSearch] = useState("");

  const fetchFamilies = async () => {
    try {
      const snap = await getDocs(collection(db, "families"));
      setFamilies(snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as (Family & { firestoreId: string })[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFamilies(); }, []);

  // ─── Créer une nouvelle famille ───
  const handleCreateFamily = async () => {
    if (!newFamily.parentName.trim()) return;
    setSaving(true);
    try {
      const children = newChildren
        .filter(c => c.firstName.trim())
        .map(c => ({
          id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          firstName: c.firstName.trim(),
          birthDate: c.birthDate ? new Date(c.birthDate) : null,
          galopLevel: c.galopLevel || "—",
          sanitaryForm: null,
        }));

      await addDoc(collection(db, "families"), {
        parentName: newFamily.parentName.trim(),
        parentEmail: newFamily.parentEmail.trim(),
        parentPhone: newFamily.parentPhone.trim(),
        authProvider: "admin", // Créé par l'admin, pas via Google/Facebook
        authUid: "", // Pas de compte auth associé
        children,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowCreateFamily(false);
      setNewFamily({ parentName: "", parentEmail: "", parentPhone: "" });
      setNewChildren([{ firstName: "", birthDate: "", galopLevel: "—" }]);
      fetchFamilies();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la création.");
    }
    setSaving(false);
  };

  // ─── Ajouter un enfant à une famille existante ───
  const handleAddChild = async (familyId: string) => {
    if (!newChildForm.firstName.trim()) return;
    setSaving(true);
    const family = families.find(f => f.firestoreId === familyId);
    if (!family) return;
    const child = {
      id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: newChildForm.firstName.trim(),
      birthDate: newChildForm.birthDate ? new Date(newChildForm.birthDate) : null,
      galopLevel: newChildForm.galopLevel || "—",
      sanitaryForm: null,
    };
    try {
      await updateDoc(doc(db, "families", familyId), {
        children: [...(family.children || []), child],
        updatedAt: serverTimestamp(),
      });
      setAddChildTo(null);
      setNewChildForm({ firstName: "", birthDate: "", galopLevel: "—" });
      fetchFamilies();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ─── Modifier galop ───
  const handleUpdateGalop = async (familyId: string, childId: string, newLevel: string) => {
    const family = families.find((f) => f.firestoreId === familyId);
    if (!family) return;
    const updated = (family.children || []).map((c: any) => c.id === childId ? { ...c, galopLevel: newLevel } : c);
    await updateDoc(doc(db, "families", familyId), { children: updated });
    setEditingGalop(null);
    fetchFamilies();
  };

  // ─── Modifier les infos famille ───
  const startEditFamily = (family: any) => {
    setEditingFamily(family.firestoreId);
    setEditForm({
      parentName: family.parentName || "",
      parentEmail: family.parentEmail || "",
      parentPhone: family.parentPhone || "",
    });
  };

  const handleSaveFamily = async () => {
    if (!editingFamily) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "families", editingFamily), {
        parentName: editForm.parentName.trim(),
        parentEmail: editForm.parentEmail.trim(),
        parentPhone: editForm.parentPhone.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingFamily(null);
      fetchFamilies();
    } catch (e) { console.error(e); alert("Erreur de sauvegarde."); }
    setSaving(false);
  };

  // ─── Charger les créneaux pour l'inscription ───
  const loadCreneaux = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const snap = await getDocs(collection(db, "creneaux"));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setCreneaux(all.filter(c => c.date >= today && c.status !== "closed").sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) { console.error(e); }
  };

  // ─── Inscrire un enfant dans un créneau ───
  const handleEnroll = async (creneauId: string) => {
    if (!showEnroll) return;
    setSaving(true);
    try {
      const creneau = creneaux.find(c => c.id === creneauId);
      if (!creneau) return;
      const family = families.find(f => f.firestoreId === showEnroll.familyId);
      const enrolled = creneau.enrolled || [];
      const alreadyIn = enrolled.some((e: any) => e.childId === showEnroll.childId);
      if (alreadyIn) { alert("Déjà inscrit dans ce créneau."); setSaving(false); return; }

      await updateDoc(doc(db, "creneaux", creneauId), {
        enrolled: [...enrolled, {
          childId: showEnroll.childId,
          familyId: showEnroll.familyId,
          childName: showEnroll.childName,
          familyName: family?.parentName || "",
          horseName: null,
          presence: "unknown",
          cardDeducted: false,
        }],
        enrolledCount: enrolled.length + 1,
      });

      // Créer la réservation
      const priceTTC = creneau.priceTTC || 0;
      await addDoc(collection(db, "reservations"), {
        familyId: showEnroll.familyId,
        familyName: family?.parentName || "",
        childId: showEnroll.childId,
        childName: showEnroll.childName,
        activityTitle: creneau.activityTitle,
        activityType: creneau.activityType,
        creneauId,
        date: creneau.date,
        startTime: creneau.startTime,
        endTime: creneau.endTime,
        priceTTC: Math.round(priceTTC * 100) / 100,
        status: "confirmed",
        source: "admin",
        createdAt: serverTimestamp(),
      });

      alert(`${showEnroll.childName} inscrit(e) dans ${creneau.activityTitle} le ${new Date(creneau.date).toLocaleDateString("fr-FR")}`);
      setShowEnroll(null);
      loadCreneaux();
    } catch (e) { console.error(e); alert("Erreur."); }
    setSaving(false);
  };

  const allChildren = families.flatMap((f) => (f.children || []).map((c: any) => ({ ...c, familyName: f.parentName })));
  const missingForms = allChildren.filter((c) => !c.sanitaryForm).length;

  const filtered = families.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.parentName?.toLowerCase().includes(q) || f.parentEmail?.toLowerCase().includes(q) || (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q));
  });

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Cavaliers & familles</h1>
        <button onClick={() => setShowCreateFamily(true)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 transition-colors">
          <UserPlus size={16} /> Nouvelle famille
        </button>
      </div>

      {/* KPIs */}
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

      {/* Recherche */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une famille, un enfant, un email..."
          className={`${inputStyle} !pl-10`} />
      </div>

      {/* Liste des familles */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500">{search ? "Aucun résultat." : "Aucune famille inscrite. Cliquez sur \"Nouvelle famille\" pour commencer."}</p>
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
                    <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center font-body text-sm font-bold text-white">
                      {family.parentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "?"}
                    </div>
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">{family.parentName || "Sans nom"}</div>
                      <div className="font-body text-xs text-gray-400">
                        {family.parentEmail && <><Mail size={10} className="inline mr-1" />{family.parentEmail} · </>}
                        {family.parentPhone && <><Phone size={10} className="inline mr-1" />{family.parentPhone} · </>}
                        {children.length} cavalier{children.length > 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge color={(family as any).authProvider === "admin" ? "gray" : (family as any).authProvider === "google" ? "blue" : "purple"}>
                      {(family as any).authProvider === "admin" ? "Créé admin" : (family as any).authProvider === "google" ? "Google" : "Facebook"}
                    </Badge>
                    {isExp ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </div>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-blue-500/8">
                    {/* Infos parent */}
                    {editingFamily === family.firestoreId ? (
                      <div className="bg-blue-50 rounded-lg p-4 mb-5">
                        <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Modifier les informations</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Nom</label>
                            <input value={editForm.parentName} onChange={e => setEditForm({ ...editForm, parentName: e.target.value })} className={inputStyle} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Email</label>
                            <input type="email" value={editForm.parentEmail} onChange={e => setEditForm({ ...editForm, parentEmail: e.target.value })} className={inputStyle} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Téléphone</label>
                            <input type="tel" value={editForm.parentPhone} onChange={e => setEditForm({ ...editForm, parentPhone: e.target.value })} className={inputStyle} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveFamily} disabled={saving}
                            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
                          </button>
                          <button onClick={() => setEditingFamily(null)}
                            className="font-body text-xs text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between mb-5">
                        <div className="grid grid-cols-3 gap-4 flex-1">
                          <div><div className="font-body text-[11px] font-semibold text-gray-400">Email</div><div className="font-body text-sm text-blue-800">{family.parentEmail || "—"}</div></div>
                          <div><div className="font-body text-[11px] font-semibold text-gray-400">Téléphone</div><div className="font-body text-sm text-blue-800">{family.parentPhone || "Non renseigné"}</div></div>
                          <div><div className="font-body text-[11px] font-semibold text-gray-400">Inscription</div><div className="font-body text-sm text-blue-800">{(family as any).authProvider === "admin" ? "Créé par l'admin" : `Via ${(family as any).authProvider}`}</div></div>
                        </div>
                        <button onClick={() => startEditFamily(family)}
                          className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1 flex-shrink-0">
                          <Edit3 size={12} /> Modifier
                        </button>
                      </div>
                    )}

                    {/* Cavaliers */}
                    <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cavaliers ({children.length})</div>
                    {children.length === 0 ? (
                      <p className="font-body text-sm text-gray-400 italic mb-3">Aucun cavalier. Ajoutez un enfant ci-dessous.</p>
                    ) : (
                      <div className="flex flex-col gap-2 mb-3">
                        {children.map((child: any) => (
                          <div key={child.id} className="flex items-center justify-between bg-sand rounded-lg px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Users size={14} className="text-blue-500" />
                              </div>
                              <div>
                                <div className="font-body text-sm font-semibold text-blue-800">{child.firstName}</div>
                                <div className="font-body text-xs text-gray-400">
                                  {child.birthDate ? `Né(e) le ${new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : child.birthDate).toLocaleDateString("fr-FR")}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Galop */}
                              {editingGalop?.familyId === family.firestoreId && editingGalop?.childId === child.id ? (
                                <select defaultValue={child.galopLevel || "—"} onChange={(e) => handleUpdateGalop(family.firestoreId, child.id, e.target.value)} onBlur={() => setEditingGalop(null)} autoFocus
                                  className="px-2 py-1 rounded border border-blue-500 font-body text-xs bg-white focus:outline-none">
                                  {galopLevels.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setEditingGalop({ familyId: family.firestoreId, childId: child.id }); }}
                                  className="bg-transparent border-none cursor-pointer" title="Modifier le niveau">
                                  <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                                    {child.galopLevel && child.galopLevel !== "—" ? `Galop ${child.galopLevel}` : "Débutant"}
                                  </Badge>
                                </button>
                              )}
                              {child.sanitaryForm ? <Badge color="green">Fiche OK</Badge> : <Badge color="red">Fiche manquante</Badge>}
                              {/* Bouton inscrire */}
                              <button onClick={(e) => { e.stopPropagation(); setShowEnroll({ familyId: family.firestoreId, childId: child.id, childName: child.firstName }); loadCreneaux(); }}
                                className="font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                                <CalendarDays size={12} /> Inscrire
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ajouter un enfant */}
                    {addChildTo === family.firestoreId ? (
                      <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
                        <div className="font-body text-xs font-semibold text-blue-800">Ajouter un cavalier</div>
                        <div className="flex gap-2">
                          <input placeholder="Prénom *" value={newChildForm.firstName} onChange={e => setNewChildForm({ ...newChildForm, firstName: e.target.value })}
                            className={`${inputStyle} flex-1`} />
                          <input type="date" value={newChildForm.birthDate} onChange={e => setNewChildForm({ ...newChildForm, birthDate: e.target.value })}
                            className={`${inputStyle} w-40`} />
                          <select value={newChildForm.galopLevel} onChange={e => setNewChildForm({ ...newChildForm, galopLevel: e.target.value })}
                            className={`${inputStyle} w-32`}>
                            {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : `Galop ${g}`}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAddChild(family.firestoreId)} disabled={!newChildForm.firstName.trim() || saving}
                            className="flex items-center gap-2 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Ajouter
                          </button>
                          <button onClick={() => setAddChildTo(null)} className="font-body text-xs text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddChildTo(family.firestoreId); setNewChildForm({ firstName: "", birthDate: "", galopLevel: "—" }); }}
                        className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-1">
                        <Plus size={14} /> Ajouter un cavalier
                      </button>
                    )}

                    {/* Fiches sanitaires */}
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

      {/* ═══ MODAL : Créer une famille ═══ */}
      {showCreateFamily && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={() => setShowCreateFamily(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Nouvelle famille</h2>
              <button onClick={() => setShowCreateFamily(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Parent */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Parent / responsable</div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={labelStyle}>Nom complet *</label>
                    <input className={inputStyle} value={newFamily.parentName} onChange={e => setNewFamily({ ...newFamily, parentName: e.target.value })} placeholder="Ex: Dupont Marie" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelStyle}>Email</label>
                      <input type="email" className={inputStyle} value={newFamily.parentEmail} onChange={e => setNewFamily({ ...newFamily, parentEmail: e.target.value })} placeholder="exemple@email.com" />
                    </div>
                    <div>
                      <label className={labelStyle}>Téléphone</label>
                      <input type="tel" className={inputStyle} value={newFamily.parentPhone} onChange={e => setNewFamily({ ...newFamily, parentPhone: e.target.value })} placeholder="06 00 00 00 00" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Enfants */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Cavaliers</div>
                {newChildren.map((child, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <div className="flex-1">
                      {i === 0 && <label className={labelStyle}>Prénom *</label>}
                      <input className={inputStyle} value={child.firstName} onChange={e => {
                        const up = [...newChildren]; up[i].firstName = e.target.value; setNewChildren(up);
                      }} placeholder="Prénom" />
                    </div>
                    <div className="w-36">
                      {i === 0 && <label className={labelStyle}>Date de naissance</label>}
                      <input type="date" className={inputStyle} value={child.birthDate} onChange={e => {
                        const up = [...newChildren]; up[i].birthDate = e.target.value; setNewChildren(up);
                      }} />
                    </div>
                    <div className="w-28">
                      {i === 0 && <label className={labelStyle}>Niveau</label>}
                      <select className={inputStyle} value={child.galopLevel} onChange={e => {
                        const up = [...newChildren]; up[i].galopLevel = e.target.value; setNewChildren(up);
                      }}>
                        {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>)}
                      </select>
                    </div>
                    {newChildren.length > 1 && (
                      <button onClick={() => setNewChildren(newChildren.filter((_, j) => j !== i))}
                        className="w-8 h-10 rounded-lg bg-red-50 text-red-400 flex items-center justify-center border-none cursor-pointer hover:bg-red-100">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setNewChildren([...newChildren, { firstName: "", birthDate: "", galopLevel: "—" }])}
                  className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-2">
                  <Plus size={14} /> Ajouter un cavalier
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowCreateFamily(false)} className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleCreateFamily} disabled={saving || !newFamily.parentName.trim()}
                className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 ${saving || !newFamily.parentName.trim() ? "opacity-50 cursor-not-allowed" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Créer la famille
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL : Inscrire dans un créneau ═══ */}
      {showEnroll && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={() => setShowEnroll(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Inscrire {showEnroll.childName}</h2>
                <p className="font-body text-xs text-gray-400">Sélectionnez un créneau à venir</p>
              </div>
              <button onClick={() => setShowEnroll(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16} /></button>
            </div>
            <div className="p-5">
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input placeholder="Filtrer par activité..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)}
                  className={`${inputStyle} !pl-9 !text-xs`} />
              </div>
              {creneaux.length === 0 ? (
                <p className="font-body text-sm text-gray-400 text-center py-6">Aucun créneau à venir.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
                  {creneaux
                    .filter(c => !enrollSearch || c.activityTitle?.toLowerCase().includes(enrollSearch.toLowerCase()))
                    .slice(0, 30)
                    .map(c => {
                      const alreadyIn = (c.enrolled || []).some((e: any) => e.childId === showEnroll.childId);
                      const spots = (c.maxPlaces || 8) - (c.enrolled?.length || 0);
                      const d = new Date(c.date);
                      return (
                        <div key={c.id} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${alreadyIn ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                            <div className="font-body text-xs text-gray-400">
                              {d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {c.startTime}–{c.endTime} · {c.monitor} · {spots} place{spots > 1 ? "s" : ""}
                            </div>
                          </div>
                          {alreadyIn ? (
                            <Badge color="green">Inscrit</Badge>
                          ) : spots <= 0 ? (
                            <Badge color="red">Complet</Badge>
                          ) : (
                            <button onClick={() => handleEnroll(c.id)} disabled={saving}
                              className="font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                              {saving ? <Loader2 size={12} className="animate-spin" /> : "Inscrire"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
