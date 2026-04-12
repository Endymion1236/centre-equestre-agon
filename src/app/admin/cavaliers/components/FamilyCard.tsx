"use client";
import { useState } from "react";
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ChevronDown, ChevronUp, Mail, Edit3, Trash2, GitMerge, UserPlus,
  Save, Loader2, CalendarDays, Users, Phone, Clock, Wallet, Receipt,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { validateChildrenUpdate } from "@/lib/utils";
import FamilyDetailTabs from "../FamilyDetailTabs";
import ProgressionEditor from "@/components/ProgressionEditor";
import EnrollModal from "./EnrollModal";
import MergeFamilyModal from "./MergeFamilyModal";
import LinkChildrenModal from "./LinkChildrenModal";
import EmailModal from "./EmailModal";

const galopLevels = ["—", "Poney Bronze", "Poney Argent", "Poney Or", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];
const inputStyle = "w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400";
const labelStyle = "font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1";

const FAMILY_TAGS = [
  { id: "cavalier_annee", label: "Cavalier année", color: "text-green-700 bg-green-50", emoji: "🏇" },
  { id: "stage", label: "Stage", color: "text-blue-700 bg-blue-50", emoji: "🎯" },
  { id: "passage", label: "Passage", color: "text-orange-700 bg-orange-50", emoji: "👋" },
] as const;

const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate?.seconds ? new Date(birthDate.seconds * 1000) : birthDate instanceof Date ? birthDate : null;
  if (!d || isNaN(d.getTime())) return "";
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${age} ans`;
};

interface Props {
  family: any;
  families: any[];
  allReservations: any[];
  allPayments: any[];
  allAvoirs: any[];
  allCartes: any[];
  allMandats: any[];
  allFidelite: any[];
  allCreneaux: any[];
  onRefresh: () => void;
}

export default function FamilyCard({
  family, families, allReservations, allPayments, allAvoirs,
  allCartes, allMandats, allFidelite, allCreneaux, onRefresh,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // ── Modals locaux ──────────────────────────────────────────────────────────
  const [showMerge, setShowMerge] = useState(false);
  const [showLinkChildren, setShowLinkChildren] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [showEnroll, setShowEnroll] = useState<{ childId: string; childName: string } | null>(null);
  const [showProgression, setShowProgression] = useState<string | null>(null); // childId
  // ── Édition famille ────────────────────────────────────────────────────────
  const [editingFamily, setEditingFamily] = useState(false);
  const [editForm, setEditForm] = useState({ parentName: "", lastName: "", firstName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "" });
  const [editTags, setEditTags] = useState<string[]>([]);

  const startEditFamily = () => {
    setEditingFamily(true);
    setEditForm({
      parentName: family.parentName || "",
      lastName: (family as any).lastName || "",
      firstName: (family as any).firstName || "",
      parentEmail: family.parentEmail || "",
      parentPhone: family.parentPhone || "", address: family.address || "",
      zipCode: family.zipCode || "", city: family.city || "",
    });
    setEditTags(family.tags || []);
  };

  const handleSaveFamily = async () => {
    setSaving(true);
    try {
      const lastName = editForm.lastName.trim().toUpperCase();
      const firstName = editForm.firstName.trim();
      const computedName = lastName && firstName
        ? `${lastName} ${firstName}`
        : lastName || firstName || editForm.parentName.trim();
      await updateDoc(doc(db, "families", family.firestoreId), {
        parentName: computedName,
        lastName: lastName || null,
        firstName: firstName || null,
        parentEmail: editForm.parentEmail.trim(),
        parentPhone: editForm.parentPhone.trim(), address: editForm.address.trim(),
        zipCode: editForm.zipCode.trim(), city: editForm.city.trim(),
        tags: editTags,
        updatedAt: serverTimestamp(),
      });
      setEditingFamily(false);
      onRefresh();
    } catch { toast("Erreur de sauvegarde", "error"); }
    setSaving(false);
  };

  const handleDeleteFamily = async () => {
    if (!confirm(`Supprimer définitivement la famille "${family.parentName}" et tous ses données ?`)) return;
    try {
      await deleteDoc(doc(db, "families", family.firestoreId));
      onRefresh();
      toast("Famille supprimée", "success");
    } catch { toast("Erreur lors de la suppression", "error"); }
  };

  // ── Édition enfant ─────────────────────────────────────────────────────────
  const [editingChild, setEditingChild] = useState<string | null>(null); // childId
  const [editChildForm, setEditChildForm] = useState({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });
  const [editingSanitary, setEditingSanitary] = useState<string | null>(null); // childId
  const [sanitaryForm, setSanitaryForm] = useState({ allergies: "", medicalNotes: "", emergencyContactName: "", emergencyContactPhone: "", authorization: true });
  const [editingGalop, setEditingGalop] = useState<string | null>(null); // childId
  const [addingChild, setAddingChild] = useState(false);
  const [newChildForm, setNewChildForm] = useState({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });

  const startEditChild = (child: any) => {
    setEditingChild(child.id);
    const bd = child.birthDate;
    const dateStr = bd ? (typeof bd === "string" ? bd.split("T")[0] : bd?.seconds ? new Date(bd.seconds * 1000).toISOString().split("T")[0] : bd instanceof Date ? bd.toISOString().split("T")[0] : "") : "";
    setEditChildForm({ firstName: child.firstName || "", lastName: child.lastName || "", birthDate: dateStr, galopLevel: child.galopLevel || "—" });
  };

  const handleSaveChild = async (childId: string) => {
    setSaving(true);
    const updated = (family.children || []).map((c: any) =>
      c.id === childId ? {
        ...c, firstName: editChildForm.firstName.trim(),
        lastName: editChildForm.lastName?.trim() || c.lastName || "",
        birthDate: editChildForm.birthDate ? new Date(editChildForm.birthDate) : c.birthDate,
        galopLevel: editChildForm.galopLevel,
      } : c
    );
    try {
      await updateDoc(doc(db, "families", family.firestoreId), { children: updated, updatedAt: serverTimestamp() });
      setEditingChild(null);
      onRefresh();
    } catch { toast("Erreur", "error"); }
    setSaving(false);
  };

  const handleUpdateGalop = async (childId: string, newLevel: string) => {
    const updated = (family.children || []).map((c: any) => c.id === childId ? { ...c, galopLevel: newLevel } : c);
    try {
      await updateDoc(doc(db, "families", family.firestoreId), { children: updated, updatedAt: serverTimestamp() });
      setEditingGalop(null);
      onRefresh();
    } catch { toast("Erreur", "error"); }
  };

  const handleDeleteChild = async (childId: string, childName: string) => {
    const children = family.children || [];
    if (children.length <= 1) {
      if (!confirm(`⚠️ ${childName} est le DERNIER cavalier. Confirmer la suppression ?`)) return;
    } else {
      if (!confirm(`Supprimer ${childName} ? (${children.length - 1} cavalier(s) restant(s))`)) return;
    }
    const updated = children.filter((c: any) => c.id !== childId);
    if (!validateChildrenUpdate(family.firestoreId, family.parentName, children, updated, "handleDeleteChild")) {
      alert("Opération bloquée.");
      return;
    }
    await updateDoc(doc(db, "families", family.firestoreId), { children: updated, updatedAt: serverTimestamp() });
    onRefresh();
  };

  const startEditSanitary = (child: any) => {
    setEditingSanitary(child.id);
    const sf = child.sanitaryForm || {};
    setSanitaryForm({ allergies: sf.allergies || "", medicalNotes: sf.medicalNotes || "", emergencyContactName: sf.emergencyContactName || "", emergencyContactPhone: sf.emergencyContactPhone || "", authorization: sf.authorization !== false });
  };

  const handleSaveSanitary = async (childId: string) => {
    setSaving(true);
    const updated = (family.children || []).map((c: any) => c.id === childId ? { ...c, sanitaryForm: { ...sanitaryForm } } : c);
    try {
      await updateDoc(doc(db, "families", family.firestoreId), { children: updated, updatedAt: serverTimestamp() });
      setEditingSanitary(null);
      onRefresh();
    } catch { toast("Erreur", "error"); }
    setSaving(false);
  };

  const handleAddChild = async () => {
    if (!newChildForm.firstName.trim()) return;
    setSaving(true);
    const newChild = {
      id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: newChildForm.firstName.trim(),
      lastName: newChildForm.lastName.trim(),
      birthDate: newChildForm.birthDate ? new Date(newChildForm.birthDate) : null,
      galopLevel: newChildForm.galopLevel || "—",
      sanitaryForm: null,
    };
    try {
      await updateDoc(doc(db, "families", family.firestoreId), {
        children: [...(family.children || []), newChild], updatedAt: serverTimestamp(),
      });
      setAddingChild(false);
      setNewChildForm({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });
      onRefresh();
    } catch { toast("Erreur", "error"); }
    setSaving(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const fid = family.firestoreId;
  const children = family.children || [];

  const getEnrollmentStatus = (childId: string) => {
    const futureSlots = allCreneaux.filter((c: any) =>
      (c.enrolled || []).some((e: any) => e.childId === childId)
    );
    if (futureSlots.length === 0) return { color: "gray" as const, label: "Non inscrit", count: 0 };
    const hasCard = allCartes.some((c: any) => (c.familyId === fid || c.childId === childId) && c.status === "active" && (c.remainingSessions || 0) > 0);
    const hasPaid = hasCard || allPayments.some((p: any) => p.familyId === fid && p.status === "paid" && (p.items || []).some((i: any) => i.childId === childId));
    const hasPending = !hasPaid && allPayments.some((p: any) => p.familyId === fid && (p.status === "pending" || p.status === "partial") && (p.items || []).some((i: any) => i.childId === childId));
    if (hasPaid) return { color: "green" as const, label: `Inscrit · ${futureSlots.length} séance${futureSlots.length > 1 ? "s" : ""}`, count: futureSlots.length };
    if (hasPending) return { color: "orange" as const, label: "Inscrit · paiement en attente", count: futureSlots.length };
    return { color: "orange" as const, label: `Inscrit · ${futureSlots.length} séance${futureSlots.length > 1 ? "s" : ""}`, count: futureSlots.length };
  };

  const fp = allPayments.filter((p: any) => p.familyId === fid && (p as any).status !== "cancelled");
  const totalFacture = fp.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0);
  const totalPaye = fp.reduce((s: number, p: any) => s + (p.paidAmount || 0), 0);
  const resteDu = totalFacture - totalPaye;
  const famAvoirs = allAvoirs.filter((a: any) => a.familyId === fid && a.status === "actif");
  const totalAvoir = famAvoirs.reduce((s: number, a: any) => s + (a.remainingAmount || 0), 0);

  // ── Creneaux pour l'enroll ─────────────────────────────────────────────
  const [creneauxLoaded, setCreneauxLoaded] = useState<any[]>([]);
  const [expandedReservations, setExpandedReservations] = useState<Record<string, boolean>>({});
  const loadCreneaux = async () => {
    if (creneauxLoaded.length > 0) return;
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", today)));
    setCreneauxLoaded(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.date || "").localeCompare(b.date || "")));
  };

  const accountColor = family.accountType === "asso" ? "bg-purple-500" : family.accountType === "collectivite" ? "bg-teal-500" : "bg-blue-500";

  return (
    <>
      <Card padding="md">
        {/* ── Header famille ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(e => !e)}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-body text-sm font-bold text-white ${accountColor}`}>
              {((family as any).lastName?.[0] || family.parentName?.[0] || "?").toUpperCase()}
              {((family as any).firstName?.[0] || family.parentName?.split(" ")?.[1]?.[0] || "").toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="font-body text-base font-semibold text-blue-800">
                  {(family as any).lastName
                    ? <><span className="uppercase">{(family as any).lastName}</span>{(family as any).firstName ? ` ${(family as any).firstName}` : ""}</>
                    : family.parentName || "Sans nom"
                  }
                </div>
                {!(family as any).lastName && family.accountType !== "asso" && family.accountType !== "collectivite" && (
                  <span title="Nom/prénom séparés manquants" className="font-body text-[10px] font-semibold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded cursor-default">⚠️ à compléter</span>
                )}
                {family.accountType === "asso" && <span className="font-body text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">ASSO</span>}
                {family.accountType === "collectivite" && <span className="font-body text-[10px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">COLLECTIVITÉ</span>}
                {(family.tags || []).map((tag: string) => {
                  const t = FAMILY_TAGS.find(ft => ft.id === tag);
                  return t ? <span key={tag} className={`font-body text-[10px] font-semibold ${t.color} px-1.5 py-0.5 rounded`}>{t.emoji} {t.label}</span> : null;
                })}
              </div>
              <div className="font-body text-xs text-slate-600">
                {family.parentEmail && <><Mail size={10} className="inline mr-1"/>{family.parentEmail} · </>}
                {family.parentPhone && <><Phone size={10} className="inline mr-1"/>{family.parentPhone} · </>}
                {children.length} cavalier{children.length > 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge color={family.authProvider === "admin" ? "gray" : family.authProvider === "google" ? "blue" : "purple"}>
              {family.authProvider === "admin" ? "Créé admin" : family.authProvider === "google" ? "Google" : "Facebook"}
            </Badge>
            {isExpanded ? <ChevronUp size={18} className="text-slate-600"/> : <ChevronDown size={18} className="text-slate-600"/>}
          </div>
        </div>

        {/* ── Détail famille ────────────────────────────────────────────── */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-blue-500/8">
            {/* Infos parent — mode édition */}
            {editingFamily ? (
              <div className="bg-blue-50 rounded-lg p-4 mb-5">
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Modifier les informations</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelStyle}>Nom de famille</label>
                    <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value.toUpperCase() }))} placeholder="DUPONT" className={inputStyle}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Prénom</label>
                    <input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Marie" className={inputStyle}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[["Email", "parentEmail", "email"], ["Téléphone", "parentPhone", "tel"]].map(([label, key, type]) => (
                    <div key={key}>
                      <label className={labelStyle}>{label}</label>
                      <input type={type} value={(editForm as any)[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} className={inputStyle}/>
                    </div>
                  ))}
                </div>
                <div className="mb-3">
                  <label className={labelStyle}>Adresse</label>
                  <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="12 rue des Écuries" className={inputStyle}/>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelStyle}>Code postal</label>
                    <input value={editForm.zipCode} onChange={e => setEditForm(f => ({ ...f, zipCode: e.target.value }))} className={inputStyle}/>
                  </div>
                  <div>
                    <label className={labelStyle}>Ville</label>
                    <input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className={inputStyle}/>
                  </div>
                </div>
                {/* Tags client */}
                <div className="mb-3">
                  <label className={labelStyle}>Type de client</label>
                  <div className="flex flex-wrap gap-2">
                    {FAMILY_TAGS.map(tag => {
                      const active = editTags.includes(tag.id);
                      return (
                        <button key={tag.id} type="button"
                          onClick={() => setEditTags(prev => active ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold border cursor-pointer transition-all
                            ${active ? `${tag.color} border-current` : "text-slate-400 bg-white border-gray-200 hover:border-gray-300"}`}>
                          {tag.emoji} {tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveFamily} disabled={saving}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Enregistrer
                  </button>
                  <button onClick={() => setEditingFamily(false)} className="font-body text-xs text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="mb-5">
                {/* Actions famille */}
                <div className="flex justify-end mb-2 gap-2 flex-wrap">
                  <button onClick={() => setShowMerge(true)} className="font-body text-xs text-purple-500 bg-purple-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-purple-100 flex items-center gap-1">
                    <GitMerge size={12}/> Fusionner
                  </button>
                  <button onClick={() => setShowLinkChildren(true)} className="font-body text-xs text-teal-600 bg-teal-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-teal-100 flex items-center gap-1">
                    <UserPlus size={12}/> Lier cavaliers
                  </button>
                  {family.parentEmail && (
                    <button onClick={() => setEmailModal(true)} className="font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100 flex items-center gap-1">
                      <Mail size={12}/> Email
                    </button>
                  )}
                  <button onClick={startEditFamily} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                    <Edit3 size={12}/> Modifier
                  </button>
                  <button onClick={handleDeleteFamily} className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                    <Trash2 size={12}/> Supprimer
                  </button>
                </div>
                {/* Infos contact */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><div className={labelStyle}>Email</div><div className="font-body text-sm text-blue-800 break-all">{family.parentEmail || "—"}</div></div>
                  <div><div className={labelStyle}>Téléphone</div><div className="font-body text-sm text-blue-800">{family.parentPhone || "Non renseigné"}</div></div>
                  <div><div className={labelStyle}>Inscription</div><div className="font-body text-sm text-blue-800">{family.authProvider === "admin" ? "Créé par l'admin" : `Via ${family.authProvider}`}</div></div>
                </div>
                {(family.address || family.city) && (
                  <div className="mt-2">
                    <div className={labelStyle}>Adresse</div>
                    <div className="font-body text-sm text-blue-800">{family.address}{family.address && (family.zipCode || family.city) ? ", " : ""}{family.zipCode} {family.city}</div>
                  </div>
                )}
                {/* Solde client */}
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Facturé", val: totalFacture, cls: "bg-gray-50 text-blue-500" },
                      { label: "Payé", val: totalPaye, cls: "bg-green-50 text-green-600" },
                      { label: "Reste dû", val: resteDu, cls: resteDu > 0 ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600" },
                    ].map(({ label, val, cls }) => (
                      <div key={label} className={`rounded-xl p-3 text-center ${cls.split(" ")[0]}`}>
                        <div className="font-body text-[10px] text-slate-600 uppercase">{label}</div>
                        <div className={`font-body text-lg font-bold ${cls.split(" ")[1]}`}>{val.toFixed(2)}€</div>
                      </div>
                    ))}
                    {totalAvoir > 0 && (
                      <div className="bg-purple-50 rounded-xl p-3 text-center">
                        <div className="font-body text-[10px] text-purple-600 uppercase">Avoir</div>
                        <div className="font-body text-lg font-bold text-purple-600">{totalAvoir.toFixed(2)}€</div>
                      </div>
                    )}
                  </div>
                  {resteDu > 0 && (
                    <a href={`/admin/paiements?family=${fid}`} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg font-body text-xs font-semibold text-white bg-red-500 hover:bg-red-400 no-underline mt-1">
                      💳 Encaisser l'impayé ({resteDu.toFixed(2)}€) →
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Tabs (réservations, paiements, SEPA, notes...) */}
            <FamilyDetailTabs
              family={family} children={children}
              allReservations={allReservations} allPayments={allPayments}
              allAvoirs={allAvoirs} allCartes={allCartes}
              allMandats={allMandats} allFidelite={allFidelite}
              fetchFamilies={onRefresh}
            />

            {/* ── Cavaliers ─────────────────────────────────────────────── */}
            <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 mt-4">
              Cavaliers ({children.length})
            </div>
            {children.length === 0 ? (
              <p className="font-body text-sm text-slate-600 italic mb-3">Aucun cavalier.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {children.map((child: any) => (
                  <div key={child.id} className="bg-gray-50 rounded-lg px-4 py-3">
                    {/* Mode édition */}
                    {editingChild === child.id ? (
                      <div className="flex flex-col gap-2">
                        <div className="font-body text-xs font-semibold text-blue-500 uppercase">Modifier le cavalier</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input value={editChildForm.firstName} onChange={e => setEditChildForm(f => ({ ...f, firstName: e.target.value }))} className={inputStyle} placeholder="Prénom"/>
                          <input value={editChildForm.lastName} onChange={e => setEditChildForm(f => ({ ...f, lastName: e.target.value }))} className={inputStyle} placeholder="Nom"/>
                          <input type="date" value={editChildForm.birthDate} onChange={e => setEditChildForm(f => ({ ...f, birthDate: e.target.value }))} className={inputStyle}/>
                          <select value={editChildForm.galopLevel} onChange={e => setEditChildForm(f => ({ ...f, galopLevel: e.target.value }))} className={inputStyle}>
                            {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveChild(child.id)} disabled={saving}
                            className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Enregistrer
                          </button>
                          <button onClick={() => setEditingChild(null)} className="font-body text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : editingSanitary === child.id ? (
                      /* Fiche sanitaire */
                      <div className="flex flex-col gap-2">
                        <div className="font-body text-xs font-semibold text-green-600 uppercase">Fiche sanitaire — {child.firstName}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[["Allergies / Régime", "allergies", "Aucune"], ["Notes médicales", "medicalNotes", "Asthme, lunettes..."], ["Contact urgence (nom)", "emergencyContactName", "Maman, Papa..."], ["Téléphone urgence", "emergencyContactPhone", "06 00 00 00 00"]].map(([label, key, placeholder]) => (
                            <div key={key}>
                              <label className="font-body text-[10px] text-slate-600 block mb-0.5">{label}</label>
                              <input value={(sanitaryForm as any)[key]} onChange={e => setSanitaryForm(f => ({ ...f, [key]: e.target.value }))} className={inputStyle} placeholder={placeholder}/>
                            </div>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={sanitaryForm.authorization} onChange={e => setSanitaryForm(f => ({ ...f, authorization: e.target.checked }))} className="w-4 h-4 accent-blue-500"/>
                          <span className="font-body text-xs text-gray-600">Autorisation parentale de transport en cas d'urgence</span>
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveSanitary(child.id)} disabled={saving}
                            className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-green-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Enregistrer
                          </button>
                          <button onClick={() => setEditingSanitary(null)} className="font-body text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      /* Mode lecture */
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Users size={14} className="text-blue-500"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-body text-sm font-semibold text-blue-800">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</div>
                              {!child.lastName && (
                                <span title="Nom de famille manquant" className="font-body text-[10px] font-semibold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded cursor-default">⚠️ nom manquant</span>
                              )}
                            </div>
                            <div className="font-body text-xs text-slate-600">
                              {child.birthDate ? (
                                <>
                                  {`Né(e) le ${new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : child.birthDate).toLocaleDateString("fr-FR")}`}
                                  <span className="ml-2 font-semibold text-blue-500">{calcAge(child.birthDate)}</span>
                                </>
                              ) : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pl-11">
                          {/* Badge galop */}
                          {editingGalop === child.id ? (
                            <select defaultValue={child.galopLevel || "—"} autoFocus
                              onChange={e => handleUpdateGalop(child.id, e.target.value)}
                              onBlur={() => setEditingGalop(null)}
                              className="px-2 py-1 rounded border border-blue-500 font-body text-xs bg-white focus:outline-none">
                              {galopLevels.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => setEditingGalop(child.id)} className="bg-transparent border-none cursor-pointer" title="Modifier le niveau">
                              <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                                {child.galopLevel && child.galopLevel !== "—" ? `Galop ${child.galopLevel}` : "Débutant"}
                              </Badge>
                            </button>
                          )}
                          {/* Badge sanitaire */}
                          <button onClick={() => startEditSanitary(child)} className="bg-transparent border-none cursor-pointer">
                            <Badge color={child.sanitaryForm ? "green" : "red"}>{child.sanitaryForm ? "Fiche OK" : "Fiche manquante"}</Badge>
                          </button>
                          {/* Badge inscription */}
                          {(() => {
                            const status = getEnrollmentStatus(child.id);
                            return (
                              <span className={`inline-flex items-center gap-1 font-body text-[11px] px-2 py-0.5 rounded-full border ${
                                status.color === "green" ? "bg-green-50 border-green-200 text-green-700" :
                                status.color === "orange" ? "bg-orange-50 border-orange-200 text-orange-700" :
                                "bg-gray-50 border-gray-200 text-gray-500"
                              }`}>
                                <span className={`w-2 h-2 rounded-full ${status.color === "green" ? "bg-green-500" : status.color === "orange" ? "bg-orange-400" : "bg-gray-300"}`}/>
                                {status.label}
                              </span>
                            );
                          })()}
                          {/* Actions */}
                          <button onClick={() => { setShowEnroll({ childId: child.id, childName: child.firstName }); loadCreneaux(); }}
                            className="font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                            <CalendarDays size={12}/> Inscrire
                          </button>
                          <button onClick={() => setShowProgression(showProgression === child.id ? null : child.id)}
                            className="font-body text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-purple-100 flex items-center gap-1">
                            📈 Progression
                          </button>
                          <button onClick={() => window.open(`/api/progression-pdf?childId=${child.id}&familyId=${fid}&childName=${encodeURIComponent(child.firstName)}`, "_blank")}
                            className="font-body text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-indigo-100 flex items-center gap-1">
                            🖨 Bilan PDF
                          </button>
                          <button onClick={() => startEditChild(child)}
                            className="font-body text-xs text-slate-600 bg-gray-100 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-gray-200 flex items-center gap-1">
                            <Edit3 size={10}/> Modifier
                          </button>
                          <button onClick={() => handleDeleteChild(child.id, child.firstName)}
                            className="font-body text-xs text-red-400 bg-red-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                            <Trash2 size={10}/> Suppr.
                          </button>
                        </div>

                        {/* Progression editor inline */}
                        {showProgression === child.id && (
                          <div className="mt-3 bg-white rounded-xl border border-purple-100 p-4">
                            <div className="font-body text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3">📈 Progression — {child.firstName}</div>
                            <ProgressionEditor childId={child.id} familyId={fid} childName={child.firstName} galopLevel={child.galopLevel}/>
                          </div>
                        )}

                        {/* Réservations + notes péda */}
                        {(() => {
                          const childReservations = allReservations.filter((r: any) => r.childId === child.id && r.date >= new Date().toISOString().split("T")[0]).sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
                          const peda = child.peda || { notes: [], objectifs: [] };
                          const lastNotes = (peda.notes || []).slice(0, 3);
                          return (
                            <div className="pl-11 mt-2 flex flex-col gap-1.5">
                              {childReservations.length > 0 && (() => {
                                const [expanded, setExpanded] = [expandedReservations[child.id] || false, (v: boolean) => setExpandedReservations(prev => ({ ...prev, [child.id]: v }))];
                                const shown = expanded ? childReservations : childReservations.slice(0, 3);
                                return (
                                <div className="bg-blue-50/50 rounded-lg px-3 py-2">
                                  <div className="font-body text-[10px] font-semibold text-blue-500 uppercase mb-1">Prochaines séances ({childReservations.length})</div>
                                  {shown.map((r: any, ri: number) => (
                                    <div key={ri} className="font-body text-xs text-gray-600">
                                      {new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} — {r.activityTitle || "Séance"}
                                    </div>
                                  ))}
                                  {childReservations.length > 3 && (
                                    <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                                      className="font-body text-[10px] text-blue-500 bg-transparent border-none cursor-pointer hover:underline mt-0.5 p-0">
                                      {expanded ? "▲ Réduire" : `▼ Voir les ${childReservations.length - 3} autres`}
                                    </button>
                                  )}
                                </div>
                                );
                              })()}
                              {lastNotes.length > 0 && (
                                <div className="bg-green-50/50 rounded-lg px-3 py-2">
                                  <div className="font-body text-[10px] font-semibold text-green-600 uppercase mb-1">Dernières notes péda</div>
                                  {lastNotes.map((n: any, ni: number) => (
                                    <div key={ni} className="font-body text-xs text-gray-600 flex gap-2">
                                      <span className="text-slate-600 flex-shrink-0">{new Date(n.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                                      <span className="truncate">{n.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Ajouter un enfant ────────────────────────────────────── */}
            {addingChild ? (
              <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
                <div className="font-body text-xs font-semibold text-blue-800">Ajouter un cavalier</div>
                <div className="flex gap-2">
                  <input placeholder="Prénom *" value={newChildForm.firstName} onChange={e => setNewChildForm(f => ({ ...f, firstName: e.target.value }))} className={`${inputStyle} flex-1`}/>
                  <input placeholder="Nom" value={newChildForm.lastName} onChange={e => setNewChildForm(f => ({ ...f, lastName: e.target.value }))} className={`${inputStyle} flex-1`}/>
                </div>
                <div className="flex gap-2">
                  <input type="date" value={newChildForm.birthDate} onChange={e => setNewChildForm(f => ({ ...f, birthDate: e.target.value }))} className={`${inputStyle} flex-1`}/>
                  <select value={newChildForm.galopLevel} onChange={e => setNewChildForm(f => ({ ...f, galopLevel: e.target.value }))} className={`${inputStyle} w-32`}>
                    {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddChild} disabled={saving || !newChildForm.firstName.trim()}
                    className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Ajouter
                  </button>
                  <button onClick={() => setAddingChild(false)} className="font-body text-xs text-slate-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingChild(true)} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                <UserPlus size={14}/> Ajouter un cavalier
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showMerge && (
        <MergeFamilyModal sourceFamilyId={fid} families={families} onClose={() => setShowMerge(false)} onDone={onRefresh}/>
      )}
      {showLinkChildren && (
        <LinkChildrenModal targetFamilyId={fid} families={families} onClose={() => setShowLinkChildren(false)} onDone={onRefresh}/>
      )}
      {emailModal && family.parentEmail && (
        <EmailModal emailModal={{ familyId: fid, familyName: family.parentName, email: family.parentEmail }} allPayments={allPayments} onClose={() => setEmailModal(false)}/>
      )}
      {showEnroll && (
        <EnrollModal childId={showEnroll.childId} childName={showEnroll.childName} familyId={fid} familyName={family.parentName} creneaux={creneauxLoaded} onClose={() => setShowEnroll(null)} onDone={onRefresh}/>
      )}
    </>
  );
}
