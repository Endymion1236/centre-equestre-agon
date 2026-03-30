"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validateChildrenUpdate } from "@/lib/utils";
import { emailTemplates } from "@/lib/email-templates";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Search, ChevronDown, ChevronUp, Loader2, Users, UserCheck, AlertTriangle,
  Plus, X, Save, UserPlus, Phone, Mail, Calendar, Edit3, Trash2, CalendarDays, GitMerge, Receipt, Clock, Wallet,
} from "lucide-react";
import type { Family } from "@/types";

const galopLevels = ["—", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const bd = new Date(
    typeof birthDate === "string" ? birthDate :
    birthDate?.seconds ? birthDate.seconds * 1000 : birthDate
  );
  if (isNaN(bd.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return `${age} ans`;
};

export default function CavaliersPage() {
    const { setAgentContext } = useAgentContext("cavaliers");

  useEffect(() => {
    setAgentContext({ module_actif: "cavaliers", description: "familles, cavaliers, inscriptions" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { toast } = useToast();
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [editingGalop, setEditingGalop] = useState<{ familyId: string; childId: string } | null>(null);

  // ─── Réservations & paiements par famille ───
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [allAvoirs, setAllAvoirs] = useState<any[]>([]);
  const [allCartes, setAllCartes] = useState<any[]>([]);

  // ─── Édition infos famille ───
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "" });

  // ─── Création famille ───
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({
    parentName: "", parentEmail: "", parentPhone: "",
    address: "", zipCode: "", city: "",
    accountType: "particulier" as "particulier" | "asso" | "collectivite",
    raisonSociale: "", structureParente: "", siret: "", referent: "",
  });
  const [newChildren, setNewChildren] = useState<{ firstName: string; birthDate: string; galopLevel: string }[]>([
    { firstName: "", birthDate: "", galopLevel: "—" },
  ]);
  const [saving, setSaving] = useState(false);

  // ─── Ajout enfant à famille existante ───
  const [addChildTo, setAddChildTo] = useState<string | null>(null);
  const [newChildForm, setNewChildForm] = useState({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });

  // ─── Édition d'un enfant existant ───
  const [editingChild, setEditingChild] = useState<{ familyId: string; childId: string } | null>(null);
  const [editChildForm, setEditChildForm] = useState({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });

  // ─── Fiche sanitaire ───
  const [editingSanitary, setEditingSanitary] = useState<{ familyId: string; childId: string } | null>(null);
  const [sanitaryForm, setSanitaryForm] = useState({ allergies: "", medicalNotes: "", emergencyContactName: "", emergencyContactPhone: "", authorization: true });

  // ─── Inscription dans un créneau ───
  const [showEnroll, setShowEnroll] = useState<{ familyId: string; childId: string; childName: string } | null>(null);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [enrollSearch, setEnrollSearch] = useState("");

  // ─── Modifier infos parent ───
  const [editingParent, setEditingParent] = useState<string | null>(null);
  const [editParentForm, setEditParentForm] = useState({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "" });

  // ─── Fusionner familles ───
  const [showMerge, setShowMerge] = useState<string | null>(null); // ID de la famille source
  const [mergeTarget, setMergeTarget] = useState(""); // ID de la famille cible

  const fetchFamilies = async () => {
    try {
      const [famSnap, resSnap, paySnap, avoirsSnap, cartesSnap] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "reservations")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "avoirs")),
        getDocs(collection(db, "cartes")),
      ]);
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as (Family & { firestoreId: string })[]);
      setAllReservations(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllAvoirs(avoirsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllCartes(cartesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFamilies(); }, []);

  // ─── Helpers : données par famille ───
  const getReservationsForFamily = (familyId: string) => {
    return allReservations
      .filter(r => r.familyId === familyId)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  };

  const getPaymentsForFamily = (familyId: string) => {
    return allPayments
      .filter(p => p.familyId === familyId)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  };

  const getAvoirsForFamily = (familyId: string) => {
    return allAvoirs
      .filter(a => a.familyId === familyId)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  };

  // ─── Créer une nouvelle famille ───
  const handleCreateFamily = async () => {
    // Validation selon le type
    const isValid = newFamily.accountType === "particulier"
      ? newFamily.parentName.trim()
      : newFamily.raisonSociale.trim();
    if (!isValid) return;
    setSaving(true);
    try {
      // Pour asso/collectivité, les cavaliers sont optionnels
      const children = newChildren
        .filter(c => c.firstName.trim())
        .map(c => ({
          id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          firstName: c.firstName.trim(),
          birthDate: c.birthDate ? new Date(c.birthDate) : null,
          galopLevel: c.galopLevel || "—",
          sanitaryForm: null,
        }));

      // Calculer le parentName automatiquement selon le type
      const computedName = newFamily.accountType === "particulier"
        ? newFamily.parentName.trim()
        : newFamily.accountType === "collectivite" && newFamily.structureParente && newFamily.raisonSociale
          ? `${newFamily.structureParente.trim()} — ${newFamily.raisonSociale.trim()}`
          : newFamily.raisonSociale.trim() || newFamily.parentName.trim();

      await addDoc(collection(db, "families"), {
        parentName: computedName,
        parentEmail: newFamily.parentEmail.trim(),
        parentPhone: newFamily.parentPhone.trim(),
        address: newFamily.address.trim(),
        zipCode: newFamily.zipCode.trim(),
        city: newFamily.city.trim(),
        accountType: newFamily.accountType,
        ...(newFamily.accountType !== "particulier" && {
          raisonSociale: newFamily.raisonSociale.trim(),
          structureParente: newFamily.structureParente.trim(),
          siret: newFamily.siret.trim(),
          referent: newFamily.referent.trim(),
        }),
        authProvider: "admin",
        authUid: "",
        children,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowCreateFamily(false);
      setNewFamily({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "", accountType: "particulier", raisonSociale: "", structureParente: "", siret: "", referent: "" });
      setNewChildren([{ firstName: "", birthDate: "", galopLevel: "—" }]);
      // Email bienvenue
      if (newFamily.parentEmail.trim()) {
        try {
          const emailData = emailTemplates.bienvenueNouvelleFamille({ parentName: computedName });
          fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: newFamily.parentEmail.trim(), ...emailData }) }).catch(e => console.warn("Email:", e));
        } catch (e) { console.error("Email bienvenue:", e); }
      }
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
      lastName: newChildForm.lastName.trim() || family.parentName?.split(" ").pop() || "",
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
      setNewChildForm({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });
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
      address: family.address || "",
      zipCode: family.zipCode || "",
      city: family.city || "",
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
        address: editForm.address.trim(),
        zipCode: editForm.zipCode.trim(),
        city: editForm.city.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingFamily(null);
      fetchFamilies();
    } catch (e) { console.error(e); alert("Erreur de sauvegarde."); }
    setSaving(false);
  };

  // ─── Modifier un enfant ───
  const startEditChild = (familyId: string, child: any) => {
    setEditingChild({ familyId, childId: child.id });
    const bd = child.birthDate;
    const dateStr = bd ? (typeof bd === "string" ? bd.split("T")[0] : bd?.seconds ? new Date(bd.seconds * 1000).toISOString().split("T")[0] : bd instanceof Date ? bd.toISOString().split("T")[0] : "") : "";
    setEditChildForm({ firstName: child.firstName || "", lastName: child.lastName || "", birthDate: dateStr, galopLevel: child.galopLevel || "—" });
  };

  const handleSaveChild = async () => {
    if (!editingChild) return;
    setSaving(true);
    const family = families.find(f => f.firestoreId === editingChild.familyId);
    if (!family) return;
    const updated = (family.children || []).map((c: any) =>
      c.id === editingChild.childId ? {
        ...c,
        firstName: editChildForm.firstName.trim(),
        lastName: editChildForm.lastName?.trim() || c.lastName || "",
        birthDate: editChildForm.birthDate ? new Date(editChildForm.birthDate) : c.birthDate,
        galopLevel: editChildForm.galopLevel,
      } : c
    );
    try {
      await updateDoc(doc(db, "families", editingChild.familyId), { children: updated, updatedAt: serverTimestamp() });
      setEditingChild(null);
      fetchFamilies();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ─── Supprimer un enfant ───
  const handleDeleteChild = async (familyId: string, childId: string, childName: string) => {
    const family = families.find(f => f.firestoreId === familyId);
    if (!family) return;
    const nbChildren = (family.children || []).length;
    if (nbChildren <= 1) {
      if (!confirm(`⚠️ ${childName} est le DERNIER cavalier de cette famille.\n\nLa supprimer laissera la famille sans aucun cavalier.\n\nConfirmer la suppression ?`)) return;
    } else {
      if (!confirm(`Supprimer ${childName} de cette famille ? (${nbChildren - 1} cavalier(s) restant(s))`)) return;
    }
    const updated = (family.children || []).filter((c: any) => c.id !== childId);
    if (!validateChildrenUpdate(familyId, family.parentName, family.children || [], updated, "handleDeleteChild")) {
      alert("Opération bloquée : impossible de supprimer tous les enfants d'une famille.");
      return;
    }
    await updateDoc(doc(db, "families", familyId), { children: updated, updatedAt: serverTimestamp() });
    fetchFamilies();
  };

  // ─── Fiche sanitaire ───
  const startEditSanitary = (familyId: string, child: any) => {
    setEditingSanitary({ familyId, childId: child.id });
    const sf = child.sanitaryForm || {};
    setSanitaryForm({
      allergies: sf.allergies || "",
      medicalNotes: sf.medicalNotes || "",
      emergencyContactName: sf.emergencyContactName || "",
      emergencyContactPhone: sf.emergencyContactPhone || "",
      authorization: sf.authorization !== false,
    });
  };

  const handleSaveSanitary = async () => {
    if (!editingSanitary) return;
    setSaving(true);
    const family = families.find(f => f.firestoreId === editingSanitary.familyId);
    if (!family) return;
    const updated = (family.children || []).map((c: any) =>
      c.id === editingSanitary.childId ? { ...c, sanitaryForm: { ...sanitaryForm } } : c
    );
    try {
      await updateDoc(doc(db, "families", editingSanitary.familyId), { children: updated, updatedAt: serverTimestamp() });
      setEditingSanitary(null);
      fetchFamilies();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ─── Charger les créneaux pour l'inscription ───
  const loadCreneaux = async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const nowHHMM = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      const snap = await getDocs(collection(db, "creneaux"));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setCreneaux(all.filter(c => {
        if (c.status === "closed") return false;
        if (c.date < today) return false;
        if (c.date === today && c.startTime <= nowHHMM) return false;
        return true;
      }).sort((a, b) => a.date.localeCompare(b.date)));
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

      // Créer un paiement en attente (à facturer) si le prix > 0
      if (priceTTC > 0) {
        const priceHT = priceTTC / (1 + (creneau.tvaTaux || 5.5) / 100);
        await addDoc(collection(db, "payments"), {
          familyId: showEnroll.familyId,
          familyName: family?.parentName || "",
          items: [{
            activityTitle: creneau.activityTitle,
            priceHT: Math.round(priceHT * 100) / 100,
            tva: creneau.tvaTaux || 5.5,
            priceTTC: Math.round(priceTTC * 100) / 100,
          }],
          totalTTC: Math.round(priceTTC * 100) / 100,
          paymentMode: "",
          paymentRef: "",
          status: "pending",
          paidAmount: 0,
          date: serverTimestamp(),
        });
      }

      alert(`${showEnroll.childName} inscrit(e) dans ${creneau.activityTitle} le ${new Date(creneau.date).toLocaleDateString("fr-FR")}${priceTTC > 0 ? `\n${priceTTC.toFixed(2)}€ ajouté aux impayés.` : ""}`);
      setShowEnroll(null);
      loadCreneaux();
      fetchFamilies(); // Rafraîchir les données (balance, paiements)
    } catch (e) { console.error(e); alert("Erreur."); }
    setSaving(false);
  };

  // ─── Supprimer une famille ───
  const handleDeleteFamily = async (familyId: string, familyName: string) => {
    const children = families.find(f => f.firestoreId === familyId)?.children || [];
    const msg = children.length > 0
      ? `Supprimer la famille "${familyName}" et ses ${children.length} cavalier(s) ?\n\nCette action est irréversible. Les réservations et paiements associés ne seront PAS supprimés.`
      : `Supprimer la famille "${familyName}" ?\n\nCette action est irréversible.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "families", familyId));
      fetchFamilies();
    } catch (e) { console.error(e); alert("Erreur lors de la suppression."); }
    setSaving(false);
  };

  // ─── Modifier infos parent ───
  const handleUpdateParent = async (familyId: string) => {
    if (!editParentForm.parentName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "families", familyId), {
        parentName: editParentForm.parentName.trim(),
        parentEmail: editParentForm.parentEmail.trim(),
        parentPhone: editParentForm.parentPhone.trim(),
        address: editParentForm.address.trim(),
        zipCode: editParentForm.zipCode.trim(),
        city: editParentForm.city.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingParent(null);
      fetchFamilies();
    } catch (e) { console.error(e); alert("Erreur."); }
    setSaving(false);
  };

  // ─── Fusionner deux familles ───
  const handleMerge = async () => {
    if (!showMerge || !mergeTarget || showMerge === mergeTarget) return;
    const source = families.find(f => f.firestoreId === showMerge);
    const target = families.find(f => f.firestoreId === mergeTarget);
    if (!source || !target) return;

    const msg = `Fusionner "${source.parentName}" → "${target.parentName}" ?\n\n` +
      `Les ${(source.children || []).length} cavalier(s) de "${source.parentName}" seront ajoutés à "${target.parentName}".\n` +
      `La fiche "${source.parentName}" sera ensuite supprimée.\n\n` +
      `Les réservations et paiements liés à l'ancienne fiche ne seront PAS transférés automatiquement.`;
    if (!confirm(msg)) return;

    setSaving(true);
    try {
      // Fusionner les enfants (éviter les doublons par prénom)
      const existingNames = (target.children || []).map((c: any) => c.firstName?.toLowerCase());
      const newChildren = (source.children || []).filter((c: any) =>
        !existingNames.includes(c.firstName?.toLowerCase())
      );
      const mergedChildren = [...(target.children || []), ...newChildren];

      // Mettre à jour la cible avec les enfants fusionnés
      await updateDoc(doc(db, "families", mergeTarget), {
        children: mergedChildren,
        parentPhone: target.parentPhone || source.parentPhone || "",
        updatedAt: serverTimestamp(),
      });

      // Supprimer la source
      await deleteDoc(doc(db, "families", showMerge));

      setShowMerge(null);
      setMergeTarget("");
      fetchFamilies();
      alert(`Fusion terminée. ${newChildren.length} cavalier(s) ajouté(s) à "${target.parentName}".`);
    } catch (e) { console.error(e); alert("Erreur lors de la fusion."); }
    setSaving(false);
  };

  const allChildren = families.flatMap((f) => (f.children || []).map((c: any) => ({ ...c, familyName: f.parentName })));
  const missingForms = allChildren.filter((c) => !c.sanitaryForm).length;

  const filtered = families.filter((f) => {
    if (!search) return true;
    // Construire un texte searchable avec tout : nom parent, email, prénoms enfants
    const childNames = (f.children || []).map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`).join(" ");
    const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childNames}`.toLowerCase();
    // Chaque mot de la recherche doit matcher quelque part
    const terms = search.toLowerCase().trim().split(/\s+/);
    return terms.every(term => searchable.includes(term));
  });

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5 block";

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
          <div><div className="font-body text-xl font-bold text-blue-500">{families.length}</div><div className="font-body text-xs text-slate-600">familles</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><UserCheck size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{allChildren.length}</div><div className="font-body text-xs text-slate-600">cavaliers</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={20} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{missingForms}</div><div className="font-body text-xs text-slate-600">fiches manquantes</div></div>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher : prénom + nom enfant, famille, email..."
          className={`${inputStyle} !pl-10`} />
        {search && <div className="font-body text-[10px] text-slate-600 mt-1 ml-1">{filtered.length} famille{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}</div>}
      </div>

      {/* Liste des familles */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-slate-600">{search ? "Aucun résultat." : "Aucune famille inscrite. Cliquez sur \"Nouvelle famille\" pour commencer."}</p>
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
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-body text-sm font-bold text-white ${(family as any).accountType === "asso" ? "bg-purple-500" : (family as any).accountType === "collectivite" ? "bg-teal-500" : "bg-blue-500"}`}>
                      {family.parentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-body text-base font-semibold text-blue-800">{family.parentName || "Sans nom"}</div>
                        {(family as any).accountType === "asso" && <span className="font-body text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">ASSO</span>}
                        {(family as any).accountType === "collectivite" && <span className="font-body text-[10px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">COLLECTIVITÉ</span>}
                      </div>
                      <div className="font-body text-xs text-slate-600">
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
                    {isExp ? <ChevronUp size={18} className="text-slate-600" /> : <ChevronDown size={18} className="text-slate-600" />}
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
                            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Nom</label>
                            <input value={editForm.parentName} onChange={e => setEditForm({ ...editForm, parentName: e.target.value })} className={inputStyle} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Email</label>
                            <input type="email" value={editForm.parentEmail} onChange={e => setEditForm({ ...editForm, parentEmail: e.target.value })} className={inputStyle} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Téléphone</label>
                            <input type="tel" value={editForm.parentPhone} onChange={e => setEditForm({ ...editForm, parentPhone: e.target.value })} className={inputStyle} />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Adresse</label>
                          <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="12 rue des Écuries" className={inputStyle} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Code postal</label>
                            <input value={editForm.zipCode} onChange={e => setEditForm({ ...editForm, zipCode: e.target.value })} placeholder="50230" className={inputStyle} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Ville</label>
                            <input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} placeholder="Agon-Coutainville" className={inputStyle} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveFamily} disabled={saving}
                            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
                          </button>
                          <button onClick={() => setEditingFamily(null)}
                            className="font-body text-xs text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-5">
                        <div className="flex justify-end mb-2 gap-2">
                          <button onClick={() => { setShowMerge(family.firestoreId); setMergeTarget(""); }}
                            className="font-body text-xs text-purple-500 bg-purple-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-purple-100 flex items-center gap-1">
                            <GitMerge size={12} /> Fusionner
                          </button>
                          <button onClick={() => startEditFamily(family)}
                            className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                            <Edit3 size={12} /> Modifier
                          </button>
                          <button onClick={() => handleDeleteFamily(family.firestoreId, family.parentName)}
                            className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                            <Trash2 size={12} /> Supprimer
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><div className="font-body text-[11px] font-semibold text-slate-600">Email</div><div className="font-body text-sm text-blue-800 break-all">{family.parentEmail || "—"}</div></div>
                          <div><div className="font-body text-[11px] font-semibold text-slate-600">Téléphone</div><div className="font-body text-sm text-blue-800">{family.parentPhone || "Non renseigné"}</div></div>
                          <div><div className="font-body text-[11px] font-semibold text-slate-600">Inscription</div><div className="font-body text-sm text-blue-800">{(family as any).authProvider === "admin" ? "Créé par l'admin" : `Via ${(family as any).authProvider}`}</div></div>
                        </div>
                        {((family as any).address || (family as any).city) && (
                          <div className="mt-2">
                            <div className="font-body text-[11px] font-semibold text-slate-600">Adresse</div>
                            <div className="font-body text-sm text-blue-800">
                              {(family as any).address}{(family as any).address && ((family as any).zipCode || (family as any).city) ? ", " : ""}
                              {(family as any).zipCode} {(family as any).city}
                            </div>
                          </div>
                        )}
                        {/* Compte client */}
                        {(() => {
                          const fp = getPaymentsForFamily(family.firestoreId).filter(p => (p as any).status !== "cancelled");
                          const totalFacture = fp.reduce((s, p) => s + (p.totalTTC || 0), 0);
                          const totalPaye = fp.reduce((s, p) => s + (p.paidAmount || 0), 0);
                          const resteDu = totalFacture - totalPaye;
                          const famAvoirs = allAvoirs.filter((a: any) => a.familyId === family.firestoreId && a.status === "actif");
                          const totalAvoir = famAvoirs.reduce((s: number, a: any) => s + (a.remainingAmount || 0), 0);
                          const soldeReel = resteDu - totalAvoir;
                          return (
                            <div className="mt-3 space-y-2">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-sand rounded-xl p-3 text-center">
                                  <div className="font-body text-[10px] text-slate-600 uppercase">Facturé</div>
                                  <div className="font-body text-lg font-bold text-blue-500">{totalFacture.toFixed(2)}€</div>
                                </div>
                                <div className="bg-green-50 rounded-xl p-3 text-center">
                                  <div className="font-body text-[10px] text-slate-600 uppercase">Payé</div>
                                  <div className="font-body text-lg font-bold text-green-600">{totalPaye.toFixed(2)}€</div>
                                </div>
                                <div className={`rounded-xl p-3 text-center ${resteDu > 0 ? "bg-red-50" : "bg-green-50"}`}>
                                  <div className="font-body text-[10px] text-slate-600 uppercase">Reste dû</div>
                                  <div className={`font-body text-lg font-bold ${resteDu > 0 ? "text-red-500" : "text-green-600"}`}>{resteDu.toFixed(2)}€</div>
                                </div>
                                {totalAvoir > 0 && (
                                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                                    <div className="font-body text-[10px] text-purple-600 uppercase">Avoir</div>
                                    <div className="font-body text-lg font-bold text-purple-600">{totalAvoir.toFixed(2)}€</div>
                                  </div>
                                )}
                              </div>
                              {soldeReel > 0 && totalAvoir > 0 && (
                                <div className="font-body text-xs text-center text-slate-600">Solde réel après avoir : <span className="font-semibold text-red-500">{soldeReel.toFixed(2)}€</span></div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Cavaliers */}
                    <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Cavaliers ({children.length})</div>
                    {children.length === 0 ? (
                      <p className="font-body text-sm text-slate-600 italic mb-3">Aucun cavalier. Ajoutez un enfant ci-dessous.</p>
                    ) : (
                      <div className="flex flex-col gap-2 mb-3">
                        {children.map((child: any) => (
                          <div key={child.id} className="bg-sand rounded-lg px-4 py-3">
                            {/* Mode édition enfant */}
                            {editingChild?.familyId === family.firestoreId && editingChild?.childId === child.id ? (
                              <div className="flex flex-col gap-2">
                                <div className="font-body text-xs font-semibold text-blue-500 uppercase">Modifier le cavalier</div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <input value={editChildForm.firstName} onChange={e => setEditChildForm({ ...editChildForm, firstName: e.target.value })}
                                    className={inputStyle} placeholder="Prénom" />
                                  <input value={editChildForm.lastName} onChange={e => setEditChildForm({ ...editChildForm, lastName: e.target.value })}
                                    className={inputStyle} placeholder="Nom" />
                                  <input type="date" value={editChildForm.birthDate} onChange={e => setEditChildForm({ ...editChildForm, birthDate: e.target.value })}
                                    className={inputStyle} />
                                  <select value={editChildForm.galopLevel} onChange={e => setEditChildForm({ ...editChildForm, galopLevel: e.target.value })}
                                    className={inputStyle}>
                                    {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : `Galop ${g}`}</option>)}
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handleSaveChild} disabled={saving}
                                    className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
                                  </button>
                                  <button onClick={() => setEditingChild(null)}
                                    className="font-body text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                                </div>
                              </div>
                            ) : editingSanitary?.familyId === family.firestoreId && editingSanitary?.childId === child.id ? (
                              /* Mode édition fiche sanitaire */
                              <div className="flex flex-col gap-2">
                                <div className="font-body text-xs font-semibold text-green-600 uppercase">Fiche sanitaire — {child.firstName}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="font-body text-[10px] text-slate-600 block mb-0.5">Allergies / Régime</label>
                                    <input value={sanitaryForm.allergies} onChange={e => setSanitaryForm({ ...sanitaryForm, allergies: e.target.value })}
                                      className={inputStyle} placeholder="Aucune" />
                                  </div>
                                  <div>
                                    <label className="font-body text-[10px] text-slate-600 block mb-0.5">Notes médicales</label>
                                    <input value={sanitaryForm.medicalNotes} onChange={e => setSanitaryForm({ ...sanitaryForm, medicalNotes: e.target.value })}
                                      className={inputStyle} placeholder="Asthme, lunettes..." />
                                  </div>
                                  <div>
                                    <label className="font-body text-[10px] text-slate-600 block mb-0.5">Contact urgence (nom)</label>
                                    <input value={sanitaryForm.emergencyContactName} onChange={e => setSanitaryForm({ ...sanitaryForm, emergencyContactName: e.target.value })}
                                      className={inputStyle} placeholder="Maman, Papa, Grand-mère..." />
                                  </div>
                                  <div>
                                    <label className="font-body text-[10px] text-slate-600 block mb-0.5">Téléphone urgence</label>
                                    <input type="tel" value={sanitaryForm.emergencyContactPhone} onChange={e => setSanitaryForm({ ...sanitaryForm, emergencyContactPhone: e.target.value })}
                                      className={inputStyle} placeholder="06 00 00 00 00" />
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={sanitaryForm.authorization} onChange={e => setSanitaryForm({ ...sanitaryForm, authorization: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500" />
                                  <span className="font-body text-xs text-gray-600">Autorisation parentale de transport en cas d&apos;urgence</span>
                                </label>
                                <div className="flex gap-2">
                                  <button onClick={handleSaveSanitary} disabled={saving}
                                    className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-green-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer la fiche
                                  </button>
                                  <button onClick={() => setEditingSanitary(null)}
                                    className="font-body text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                                </div>
                              </div>
                            ) : (
                              /* Mode lecture */
                              <>
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <Users size={14} className="text-blue-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-body text-sm font-semibold text-blue-800">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</div>
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
                                  {child.sanitaryForm ? (
                                    <button onClick={() => startEditSanitary(family.firestoreId, child)} className="bg-transparent border-none cursor-pointer">
                                      <Badge color="green">Fiche OK</Badge>
                                    </button>
                                  ) : (
                                    <button onClick={() => startEditSanitary(family.firestoreId, child)} className="bg-transparent border-none cursor-pointer">
                                      <Badge color="red">Fiche manquante</Badge>
                                    </button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); setShowEnroll({ familyId: family.firestoreId, childId: child.id, childName: child.firstName }); loadCreneaux(); }}
                                    className="font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                                    <CalendarDays size={12} /> Inscrire
                                  </button>
                                  <button onClick={() => startEditChild(family.firestoreId, child)}
                                    className="font-body text-xs text-slate-600 bg-gray-100 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-gray-200 flex items-center gap-1">
                                    <Edit3 size={10} /> Modifier
                                  </button>
                                  <button onClick={() => handleDeleteChild(family.firestoreId, child.id, child.firstName)}
                                    className="font-body text-xs text-red-400 bg-red-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                                    <Trash2 size={10} /> Suppr.
                                  </button>
                                </div>
                                {/* Inscriptions actives */}
                                {(() => {
                                  const childReservations = allReservations.filter((r: any) => r.childId === child.id && r.date >= new Date().toISOString().split("T")[0]);
                                  const peda = child.peda || { notes: [], objectifs: [] };
                                  const lastNotes = (peda.notes || []).slice(0, 3);
                                  return (
                                    <div className="pl-11 mt-2 flex flex-col gap-1.5">
                                      {childReservations.length > 0 && (
                                        <div className="bg-blue-50/50 rounded-lg px-3 py-2">
                                          <div className="font-body text-[10px] font-semibold text-blue-500 uppercase mb-1">Prochaines séances</div>
                                          {childReservations.slice(0, 3).map((r: any, ri: number) => (
                                            <div key={ri} className="font-body text-xs text-gray-600">
                                              {new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} — {r.activityTitle || "Séance"}
                                            </div>
                                          ))}
                                          {childReservations.length > 3 && <div className="font-body text-[10px] text-slate-600">+{childReservations.length - 3} autres</div>}
                                        </div>
                                      )}
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

                    {/* Ajouter un enfant */}
                    {addChildTo === family.firestoreId ? (
                      <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
                        <div className="font-body text-xs font-semibold text-blue-800">Ajouter un cavalier</div>
                        <div className="flex gap-2">
                          <input placeholder="Prénom *" value={newChildForm.firstName} onChange={e => setNewChildForm({ ...newChildForm, firstName: e.target.value })}
                            className={`${inputStyle} flex-1`} />
                          <input placeholder="Nom" value={newChildForm.lastName} onChange={e => setNewChildForm({ ...newChildForm, lastName: e.target.value })}
                            className={`${inputStyle} flex-1`} />
                        </div>
                        <div className="flex gap-2">
                          <input type="date" placeholder="Date de naissance" value={newChildForm.birthDate} onChange={e => setNewChildForm({ ...newChildForm, birthDate: e.target.value })}
                            className={`${inputStyle} flex-1`} />
                          <select value={newChildForm.galopLevel} onChange={e => setNewChildForm({ ...newChildForm, galopLevel: e.target.value })}
                            className={`${inputStyle} flex-1`}>
                            {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : `Galop ${g}`}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAddChild(family.firestoreId)} disabled={!newChildForm.firstName.trim() || saving}
                            className="flex items-center gap-2 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Ajouter
                          </button>
                          <button onClick={() => setAddChildTo(null)} className="font-body text-xs text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddChildTo(family.firestoreId); setNewChildForm({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" }); }}
                        className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-1">
                        <Plus size={14} /> Ajouter un cavalier
                      </button>
                    )}

                    {/* Fiches sanitaires */}
                    {children.some((c: any) => c.sanitaryForm) && (
                      <div className="mt-4 pt-3 border-t border-blue-500/8">
                        <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Fiches sanitaires</div>
                        {children.filter((c: any) => c.sanitaryForm).map((child: any) => (
                          <div key={child.id} className="flex gap-6 text-xs font-body text-slate-600 mb-2">
                            <span className="font-semibold text-blue-800 min-w-[60px]">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</span>
                            <span>Allergies : {child.sanitaryForm.allergies || "Aucune"}</span>
                            <span>Urgence : {child.sanitaryForm.emergencyContactName} ({child.sanitaryForm.emergencyContactPhone})</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ─── Réservations ─── */}
                    {(() => {
                      const reservations = getReservationsForFamily(family.firestoreId);
                      const today = new Date().toISOString().split("T")[0];
                      const upcoming = reservations.filter(r => r.date >= today);
                      const past = reservations.filter(r => r.date < today).slice(0, 5);
                      return (reservations.length > 0 || true) ? (
                        <div className="mt-4 pt-3 border-t border-blue-500/8">
                          <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <CalendarDays size={12} /> Réservations ({reservations.length})
                          </div>
                          {reservations.length === 0 ? (
                            <p className="font-body text-xs text-slate-600 italic">Aucune réservation.</p>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {upcoming.length > 0 && (
                                <>
                                  <div className="font-body text-[10px] text-green-600 font-semibold mt-1 mb-0.5">A venir ({upcoming.length})</div>
                                  {upcoming.slice(0, 8).map((r: any) => (
                                    <div key={r.id} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-green-50 rounded-lg">
                                      <div className="flex items-center gap-2">
                                        <span className="text-green-700 font-semibold">{new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
                                        <span className="text-slate-600">{r.startTime}–{r.endTime}</span>
                                        <span className="text-blue-800 font-semibold">{r.activityTitle}</span>
                                        <span className="text-slate-600">({r.childName})</span>
                                      </div>
                                      <Badge color={r.status === "confirmed" ? "green" : r.status === "cancelled" ? "red" : "gray"}>
                                        {r.status === "confirmed" ? "Confirmée" : r.status === "cancelled" ? "Annulée" : r.status}
                                      </Badge>
                                    </div>
                                  ))}
                                </>
                              )}
                              {past.length > 0 && (
                                <>
                                  <div className="font-body text-[10px] text-slate-600 font-semibold mt-2 mb-0.5">Passées (dernières {past.length})</div>
                                  {past.map((r: any) => (
                                    <div key={r.id} className="flex items-center justify-between font-body text-xs py-1 px-3 text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <span>{new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                                        <span>{r.activityTitle}</span>
                                        <span>({r.childName})</span>
                                      </div>
                                      <span>{r.priceTTC ? `${r.priceTTC.toFixed(2)}€` : ""}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {/* ─── Paiements ─── */}
                    {(() => {
                      const payments = getPaymentsForFamily(family.firestoreId);
                      const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
                      const totalDue = payments.filter(p => (p.status === "partial" || p.status === "pending") && p.status !== "cancelled").reduce((s, p) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0);
                      const modeLabels: Record<string,string> = { cb_terminal: "CB", cb_online: "Stripe", cheque: "Chèque", especes: "Espèces", cheque_vacances: "Chq. Vac.", pass_sport: "Pass'Sport", ancv: "ANCV", virement: "Virement", avoir: "Avoir", carte: "Carte" };
                      return (
                        <div className="mt-4 pt-3 border-t border-blue-500/8">
                          <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Receipt size={12} /> Paiements ({payments.length})
                            {totalDue > 0 && <Badge color="red">{totalDue.toFixed(2)}€ dû</Badge>}
                          </div>
                          {payments.length === 0 ? (
                            <p className="font-body text-xs text-slate-600 italic">Aucun paiement enregistré.</p>
                          ) : (
                            <>
                              <div className="flex gap-4 mb-2">
                                <div className="font-body text-xs"><span className="text-slate-600">Total payé :</span> <span className="font-semibold text-green-600">{totalPaid.toFixed(2)}€</span></div>
                                {totalDue > 0 && <div className="font-body text-xs"><span className="text-slate-600">Reste dû :</span> <span className="font-semibold text-red-500">{totalDue.toFixed(2)}€</span></div>}
                              </div>
                              <div className="flex flex-col gap-1">
                                {payments.slice(0, 8).map((p: any) => {
                                  const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                                  return (
                                    <div key={p.id} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-sand rounded-lg">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-600 min-w-[65px]">{d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</span>
                                        <span className="text-blue-800 font-semibold">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement"}</span>
                                        <Badge color="gray">{modeLabels[p.paymentMode] || p.paymentMode}</Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                                        <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "red"}>
                                          {p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : "À régler"}
                                        </Badge>
                                        <button onClick={async (e) => {
                                          e.stopPropagation();
                                          const invDate = d || new Date();
                                          const invoiceNumber = (p as any).orderId || `F-${invDate.getFullYear()}${String(invDate.getMonth()+1).padStart(2,"0")}-${(p.id || "").slice(-4).toUpperCase()}`;
                                          const items = (p.items || []).map((i: any) => ({ label: i.activityTitle || i.label || "Prestation", priceHT: i.priceHT || Math.round((i.priceTTC || 0) / 1.055 * 100) / 100, tva: i.tva || 5.5, priceTTC: i.priceTTC || 0, quantity: 1 }));
                                          const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                                          const res = await fetch("/api/invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: family.parentName || p.familyName, items, totalHT, totalTVA: (p.totalTTC || 0) - totalHT, totalTTC: p.totalTTC || 0, paidAmount: p.paidAmount || p.totalTTC || 0, paymentMode: modeLabels[p.paymentMode] || p.paymentMode || "", paymentDate: p.status === "paid" ? invDate.toLocaleDateString("fr-FR") : "" }) });
                                          if (res.ok) {
                                            const blob = await res.blob();
                                            const url = URL.createObjectURL(blob);
                                            window.open(url, "_blank");
                                          }
                                        }} className="font-body text-xs text-blue-500 bg-blue-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-blue-100" title="Facture PDF">
                                          📄
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                {payments.length > 8 && <p className="font-body text-[10px] text-slate-600 text-center mt-1">+ {payments.length - 8} paiement(s) antérieur(s)</p>}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* ═══ NOTES INTERNES ═══ */}

                    {/* ─── Avoirs & avances ─── */}
                    {(() => {
                      const avoirs = getAvoirsForFamily(family.firestoreId);
                      const activeAvoirs = avoirs.filter(a => a.status === "actif");
                      const totalRemaining = activeAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                      return (
                        <div className="mt-4 pt-3 border-t border-blue-500/8">
                          <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Wallet size={12} /> Avoirs & avances ({avoirs.length})
                            {totalRemaining > 0 && <Badge color="blue">{totalRemaining.toFixed(2)}€ dispo</Badge>}
                          </div>
                          {avoirs.length === 0 ? (
                            <p className="font-body text-xs text-slate-600 italic">Aucun avoir ni avance.</p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {avoirs.map((a: any) => {
                                const pctUsed = a.amount > 0 ? Math.round((a.usedAmount / a.amount) * 100) : 0;
                                return (
                                  <div key={a.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg">
                                    <div className="flex items-center gap-2 flex-1">
                                      <Badge color={a.type === "avoir" ? "orange" : "green"}>{a.type === "avoir" ? "Avoir" : "Avance"}</Badge>
                                      <span className="text-blue-800 font-semibold">{a.reference}</span>
                                      <span className="text-slate-600">{a.reason || "—"}</span>
                                      <div className="flex-1 max-w-[100px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${pctUsed > 80 ? "bg-gray-300" : "bg-blue-300"}`} style={{ width: `${pctUsed}%` }} />
                                      </div>
                                      <span className="text-slate-600">{a.usedAmount?.toFixed(2) || "0"}€/{a.amount?.toFixed(2)}€</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold ${a.remainingAmount > 0 ? "text-blue-500" : "text-slate-400"}`}>{a.remainingAmount?.toFixed(2)}€</span>
                                      <Badge color={a.status === "actif" ? "green" : a.status === "utilise" ? "gray" : a.status === "rembourse" ? "blue" : "orange"}>{a.status === "rembourse" ? "remboursé" : a.status}</Badge>
                                      {a.status === "actif" && a.remainingAmount > 0 && (
                                        <button onClick={async () => {
                                          const modes = ["Espèces", "Virement", "CB terminal", "Chèque"];
                                          const modeChoice = prompt(`Rembourser ${a.remainingAmount.toFixed(2)}€ à ${family.parentName}\n\nMode de remboursement ?\n1 = Espèces\n2 = Virement\n3 = CB terminal\n4 = Chèque\n\nTapez 1, 2, 3 ou 4 :`);
                                          if (!modeChoice || !["1","2","3","4"].includes(modeChoice.trim())) return;
                                          const mode = modes[parseInt(modeChoice.trim()) - 1];
                                          const montantStr = prompt(`Montant à rembourser (max ${a.remainingAmount.toFixed(2)}€) :`, a.remainingAmount.toFixed(2));
                                          if (!montantStr) return;
                                          const montant = Math.min(parseFloat(montantStr), a.remainingAmount);
                                          if (isNaN(montant) || montant <= 0) return;
                                          if (!confirm(`Confirmer le remboursement de ${montant.toFixed(2)}€ par ${mode} à ${family.parentName} ?`)) return;
                                          try {
                                            const newRemaining = Math.round((a.remainingAmount - montant) * 100) / 100;
                                            await updateDoc(doc(db, "avoirs", a.id), {
                                              remainingAmount: newRemaining,
                                              usedAmount: (a.usedAmount || 0) + montant,
                                              status: newRemaining <= 0 ? "rembourse" : "actif",
                                              usageHistory: [...(a.usageHistory || []), {
                                                date: new Date().toISOString(),
                                                type: "remboursement",
                                                montant,
                                                mode,
                                                label: `Remboursement ${mode}`,
                                              }],
                                              updatedAt: serverTimestamp(),
                                            });
                                            await addDoc(collection(db, "encaissements"), {
                                              familyId: family.firestoreId,
                                              familyName: family.parentName,
                                              montant: -montant,
                                              mode: "remboursement",
                                              modeLabel: `Remboursement ${mode}`,
                                              ref: a.reference,
                                              activityTitle: `Remboursement avoir ${a.reference}`,
                                              date: serverTimestamp(),
                                            });
                                            alert(`✅ Remboursement de ${montant.toFixed(2)}€ par ${mode} enregistré.`);
                                            fetchFamilies();
                                          } catch (e) { console.error(e); alert("Erreur lors du remboursement"); }
                                        }} className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">
                                          Rembourser
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ─── Cartes de séances ─── */}
                    {(() => {
                      const famCartes = allCartes.filter((c: any) => c.familyId === family.firestoreId);
                      const activeCartes = famCartes.filter((c: any) => c.status === "active" && (c.remainingSessions || 0) > 0);
                      if (famCartes.length === 0) return null;
                      return (
                        <div className="mt-4 pt-3 border-t border-blue-500/8">
                          <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            🎟️ Cartes de séances ({famCartes.length})
                            {activeCartes.length > 0 && <Badge color="green">{activeCartes.length} active{activeCartes.length > 1 ? "s" : ""}</Badge>}
                          </div>
                          <div className="flex flex-col gap-2">
                            {famCartes.map((carte: any) => {
                              const pct = carte.totalSessions > 0 ? (carte.remainingSessions / carte.totalSessions) * 100 : 0;
                              const expired = carte.dateFin && new Date(carte.dateFin) < new Date();
                              const used = carte.status === "used" || carte.remainingSessions <= 0;
                              return (
                                <div key={carte.id} className={`font-body text-xs px-3 py-2.5 rounded-lg border ${used || expired ? "bg-gray-50 border-gray-200 opacity-60" : "bg-sand border-gold-200"}`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div>
                                      <span className="font-semibold text-blue-800">{carte.childName}</span>
                                      <span className="text-slate-600 ml-1">· {carte.activityType === "balade" ? "Balades" : "Cours"}</span>
                                    </div>
                                    <Badge color={used || expired ? "gray" : carte.remainingSessions > 2 ? "green" : "orange"}>
                                      {carte.remainingSessions}/{carte.totalSessions}
                                    </Badge>
                                  </div>
                                  {/* Barre de progression */}
                                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-1.5">
                                    <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-slate-600">
                                    <span>
                                      {carte.dateDebut && carte.dateFin
                                        ? `${new Date(carte.dateDebut).toLocaleDateString("fr-FR", { day:"numeric", month:"short" })} → ${new Date(carte.dateFin).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}`
                                        : ""}
                                      {expired && <span className="text-red-400 ml-1">· Expirée</span>}
                                    </span>
                                    <span>{carte.usedSessions} utilisée{carte.usedSessions > 1 ? "s" : ""}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ═══ NOTES INTERNES (suite) ═══ */}
                    <div className="mt-4 pt-3 border-t border-blue-500/8">
                      <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Notes internes</div>
                      <textarea
                        defaultValue={(family as any).notes || ""}
                        onBlur={async (e) => {
                          if (e.target.value !== ((family as any).notes || "")) {
                            await updateDoc(doc(db, "families", family.firestoreId), { notes: e.target.value, updatedAt: serverTimestamp() });
                            fetchFamilies();
                          }
                        }}
                        placeholder="Notes visibles uniquement par l'admin (allergies, remarques, historique...)"
                        className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[60px] resize-y"
                      />
                      <p className="font-body text-[10px] text-slate-600 mt-1">Sauvegarde automatique quand vous cliquez en dehors.</p>
                    </div>
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
              {/* Type de compte */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Type de compte</div>
                <div className="flex gap-2">
                  {([["particulier","👤 Particulier"],["asso","🤝 Association"],["collectivite","🏛️ Collectivité"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setNewFamily(f => ({ ...f, accountType: val }))}
                      className={`flex-1 py-2 px-3 rounded-lg border font-body text-xs font-semibold cursor-pointer transition-all ${newFamily.accountType === val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-slate-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parent / responsable */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">
                  {newFamily.accountType === "particulier" ? "Parent / responsable" : "Structure"}
                </div>
                <div className="grid grid-cols-1 gap-3">

                  {newFamily.accountType === "particulier" ? (
                    <div>
                      <label className={labelStyle}>Nom complet *</label>
                      <input className={inputStyle} value={newFamily.parentName} onChange={e => setNewFamily({ ...newFamily, parentName: e.target.value })} placeholder="Ex: Dupont Marie" />
                    </div>
                  ) : (
                    <>
                      {newFamily.accountType === "collectivite" && (
                        <div>
                          <label className={labelStyle}>Communauté / Structure parente *</label>
                          <input className={inputStyle} value={newFamily.structureParente}
                            onChange={e => setNewFamily({ ...newFamily, structureParente: e.target.value })}
                            placeholder="Ex: Coutances Mer et Bocage" />
                          <div className="font-body text-[10px] text-slate-400 mt-1">Sera préfixé automatiquement dans le nom</div>
                        </div>
                      )}
                      <div>
                        <label className={labelStyle}>
                          {newFamily.accountType === "collectivite" ? "Nom du centre / service *" : "Nom de l'association *"}
                        </label>
                        <input className={inputStyle} value={newFamily.raisonSociale}
                          onChange={e => setNewFamily({ ...newFamily, raisonSociale: e.target.value })}
                          placeholder={newFamily.accountType === "collectivite" ? "Ex: Centre de loisirs de Coutances" : "Ex: Club équestre..."} />
                        {newFamily.accountType === "collectivite" && newFamily.structureParente && newFamily.raisonSociale && (
                          <div className="font-body text-[10px] text-green-600 mt-1">
                            → Intitulé : <strong>{newFamily.structureParente} — {newFamily.raisonSociale}</strong>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={labelStyle}>SIRET (optionnel)</label>
                        <input className={inputStyle} value={newFamily.siret}
                          onChange={e => setNewFamily({ ...newFamily, siret: e.target.value })}
                          placeholder="Ex: 123 456 789 00012" />
                      </div>
                      <div>
                        <label className={labelStyle}>Référent (nom du contact)</label>
                        <input className={inputStyle} value={newFamily.referent}
                          onChange={e => setNewFamily({ ...newFamily, referent: e.target.value })}
                          placeholder="Ex: Marie Dupont" />
                      </div>
                    </>
                  )}
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
                  <div>
                    <label className={labelStyle}>Adresse</label>
                    <input className={inputStyle} value={newFamily.address} onChange={e => setNewFamily({ ...newFamily, address: e.target.value })} placeholder="12 rue des Écuries" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelStyle}>Code postal</label>
                      <input className={inputStyle} value={newFamily.zipCode} onChange={e => setNewFamily({ ...newFamily, zipCode: e.target.value })} placeholder="50230" />
                    </div>
                    <div>
                      <label className={labelStyle}>Ville</label>
                      <input className={inputStyle} value={newFamily.city} onChange={e => setNewFamily({ ...newFamily, city: e.target.value })} placeholder="Agon-Coutainville" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cavaliers — optionnels pour asso/collectivité */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">
                  Cavaliers {newFamily.accountType !== "particulier" && <span className="text-slate-400 font-normal normal-case">(optionnel)</span>}
                </div>
                {newFamily.accountType !== "particulier" && newChildren.every(c => !c.firstName.trim()) && (
                  <p className="font-body text-[10px] text-slate-400 mb-2">Laissez vide si les cavaliers sont à ajouter ultérieurement.</p>
                )}
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
              <button onClick={() => setShowCreateFamily(false)} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleCreateFamily} disabled={saving || !(newFamily.accountType === "particulier" ? newFamily.parentName.trim() : newFamily.raisonSociale.trim())}
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
                <p className="font-body text-xs text-slate-600">Sélectionnez un créneau à venir</p>
              </div>
              <button onClick={() => setShowEnroll(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16} /></button>
            </div>
            <div className="p-5">
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Filtrer par activité..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)}
                  className={`${inputStyle} !pl-9 !text-xs`} />
              </div>
              {creneaux.length === 0 ? (
                <p className="font-body text-sm text-slate-600 text-center py-6">Aucun créneau à venir.</p>
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
                            <div className="font-body text-xs text-slate-600">
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

      {/* ═══ MODAL : Fusionner des familles ═══ */}
      {showMerge && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowMerge(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Fusionner des familles</h2>
                <p className="font-body text-xs text-slate-600">Les cavaliers seront regroupés dans la famille cible</p>
              </div>
              <button onClick={() => setShowMerge(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelStyle}>Famille à supprimer (source)</label>
                <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 font-body text-sm text-red-700">
                  {families.find(f => f.firestoreId === showMerge)?.parentName || "?"} — {(families.find(f => f.firestoreId === showMerge)?.children || []).length} cavalier(s)
                </div>
              </div>
              <div className="text-center font-body text-xs text-slate-600">↓ ses cavaliers seront ajoutés à ↓</div>
              <div>
                <label className={labelStyle}>Famille à conserver (cible)</label>
                <select className={inputStyle} value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}>
                  <option value="">— Sélectionner la famille cible —</option>
                  {families.filter(f => f.firestoreId !== showMerge).map(f => (
                    <option key={f.firestoreId} value={f.firestoreId}>
                      {f.parentName} ({(f.children || []).length} cavalier{(f.children || []).length > 1 ? "s" : ""}) — {f.parentEmail || "pas d'email"}
                    </option>
                  ))}
                </select>
              </div>
              {mergeTarget && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="font-body text-xs font-semibold text-blue-800 mb-1">Résultat après fusion :</div>
                  <div className="font-body text-xs text-gray-600">
                    {(() => {
                      const source = families.find(f => f.firestoreId === showMerge);
                      const target = families.find(f => f.firestoreId === mergeTarget);
                      if (!source || !target) return "";
                      const existingNames = (target.children || []).map((c: any) => c.firstName?.toLowerCase());
                      const newOnes = (source.children || []).filter((c: any) => !existingNames.includes(c.firstName?.toLowerCase()));
                      const dupes = (source.children || []).length - newOnes.length;
                      return `${target.parentName} aura ${(target.children || []).length + newOnes.length} cavalier(s) (${newOnes.length} ajouté(s)${dupes > 0 ? `, ${dupes} doublon(s) ignoré(s)` : ""})`;
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowMerge(null)} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleMerge} disabled={saving || !mergeTarget}
                className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-purple-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-purple-600 ${saving || !mergeTarget ? "opacity-50 cursor-not-allowed" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />} Fusionner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
