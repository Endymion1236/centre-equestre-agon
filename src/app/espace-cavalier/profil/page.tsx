"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Edit3,
  Landmark,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Badge, Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { toLocalDateString, todayLocalString } from "@/lib/date-local";
import type { Child } from "@/types";

type ProfileTab = "famille" | "cavaliers" | "paiement";

type FamilyForm = {
  firstName: string;
  lastName: string;
  parentPhone: string;
  address: string;
  zipCode: string;
  city: string;
};

type ChildForm = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

type SanitaryFormState = {
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  parentalAuthorization: boolean;
};

const EMPTY_FAMILY_FORM: FamilyForm = {
  firstName: "",
  lastName: "",
  parentPhone: "",
  address: "",
  zipCode: "",
  city: "",
};

const EMPTY_CHILD_FORM: ChildForm = {
  firstName: "",
  lastName: "",
  birthDate: "",
};

const EMPTY_SANITARY_FORM: SanitaryFormState = {
  allergies: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  parentalAuthorization: false,
};

function dateInputValue(value: any) {
  if (!value) return "";
  try {
    const date = value?.toDate
      ? value.toDate()
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : toLocalDateString(date);
  } catch {
    return "";
  }
}

function formatBirthDate(value: any) {
  const inputValue = dateInputValue(value);
  if (!inputValue) return "Non renseignée";
  return new Date(`${inputValue}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function AddChildForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<ChildForm>(EMPTY_CHILD_FORM);
  const [sanitary, setSanitary] = useState<SanitaryFormState>(EMPTY_SANITARY_FORM);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user || !form.firstName.trim() || !form.birthDate) return;
    setSaving(true);
    try {
      const newChild: any = {
        id: Date.now().toString(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: new Date(`${form.birthDate}T00:00:00`),
        galopLevel: "—",
        sanitaryForm: sanitary.parentalAuthorization
          ? { ...sanitary, updatedAt: new Date().toISOString() }
          : null,
      };

      await updateDoc(doc(db, "families", user.uid), {
        children: arrayUnion(newChild),
        updatedAt: serverTimestamp(),
      });
      toast("Cavalier ajouté.", "success");
      onDone();
    } catch (error) {
      console.error("Erreur ajout enfant:", error);
      toast("Impossible d’ajouter le cavalier.", "error");
    }
    setSaving(false);
  };

  return (
    <Card padding="md" className="mb-5 !border-blue-200 !bg-blue-50/40">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-blue-800">Ajouter un cavalier</h3>
          <p className="font-body text-xs text-gray-600 mt-0.5">Les informations essentielles d’abord, la fiche sanitaire juste dessous.</p>
        </div>
        <button type="button" onClick={onCancel} className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center cursor-pointer">
          <X size={17} className="text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Prénom *</label>
          <input
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Nom</label>
          <input
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Date de naissance *</label>
          <input
            type="date"
            max={todayLocalString()}
            value={form.birthDate}
            onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={17} className="text-blue-500" />
          <span className="font-body text-sm font-bold text-blue-800">Fiche sanitaire</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Allergies</label>
            <input
              value={sanitary.allergies}
              onChange={(event) => setSanitary({ ...sanitary, allergies: event.target.value })}
              placeholder="Aucune ou précisez"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Contact d’urgence</label>
            <input
              value={sanitary.emergencyContactName}
              onChange={(event) => setSanitary({ ...sanitary, emergencyContactName: event.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Téléphone d’urgence</label>
            <input
              value={sanitary.emergencyContactPhone}
              onChange={(event) => setSanitary({ ...sanitary, emergencyContactPhone: event.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <label className="mt-4 flex items-start gap-2 font-body text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={sanitary.parentalAuthorization}
            onChange={(event) => setSanitary({ ...sanitary, parentalAuthorization: event.target.checked })}
            className="accent-blue-500 w-4 h-4 mt-0.5"
          />
          J’autorise ce cavalier à participer aux activités équestres du centre.
        </label>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.firstName.trim() || !form.birthDate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Ajouter ce cavalier
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl font-body text-sm text-gray-600 bg-white border border-gray-200 cursor-pointer">
          Annuler
        </button>
      </div>
    </Card>
  );
}

export default function ProfilPage() {
  const { user, family } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<ProfileTab>("famille");
  const [editingProfile, setEditingProfile] = useState(false);
  const [familyForm, setFamilyForm] = useState<FamilyForm>(EMPTY_FAMILY_FORM);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [editingChild, setEditingChild] = useState<string | null>(null);
  const [childForm, setChildForm] = useState<ChildForm>(EMPTY_CHILD_FORM);
  const [editingSanitary, setEditingSanitary] = useState<string | null>(null);
  const [sanitaryForm, setSanitaryForm] = useState<SanitaryFormState>(EMPTY_SANITARY_FORM);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [savingChild, setSavingChild] = useState(false);
  const [mandate, setMandate] = useState<any>(null);
  const [revokingMandate, setRevokingMandate] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "mandats-sepa"), where("familyId", "==", user.uid)))
      .then((snapshot) => {
        const active = snapshot.docs.find((item) => item.data().status === "active");
        setMandate(active ? { id: active.id, ...active.data() } : null);
      })
      .catch(() => setMandate(null));
  }, [user]);

  const missingBillingFields = useMemo(() => {
    const current: any = family || {};
    const missing: string[] = [];
    if (!((current.firstName && current.lastName) || current.parentName)) missing.push("nom et prénom");
    if (!current.address) missing.push("adresse");
    if (!current.zipCode) missing.push("code postal");
    if (!current.city) missing.push("ville");
    return missing;
  }, [family]);

  const children = (family?.children || []) as Child[];
  const incompleteChildren = children.filter((child) => {
    const childAny: any = child;
    return !child.firstName?.trim() || !childAny.lastName?.trim() || !childAny.birthDate || !child.sanitaryForm;
  }).length;

  const startProfileEdit = () => {
    const current: any = family || {};
    const fallbackName = !current.firstName && !current.lastName ? current.parentName || "" : "";
    setFamilyForm({
      firstName: current.firstName || fallbackName,
      lastName: current.lastName || "",
      parentPhone: current.parentPhone || "",
      address: current.address || "",
      zipCode: current.zipCode || "",
      city: current.city || "",
    });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const firstName = familyForm.firstName.trim();
      const lastName = familyForm.lastName.trim().toUpperCase();
      const parentName = lastName && firstName
        ? `${lastName} ${firstName}`
        : lastName || firstName || family?.parentName || "";

      await updateDoc(doc(db, "families", user.uid), {
        firstName: firstName || null,
        lastName: lastName || null,
        parentName,
        parentPhone: familyForm.parentPhone.trim(),
        address: familyForm.address.trim(),
        zipCode: familyForm.zipCode.trim(),
        city: familyForm.city.trim(),
        updatedAt: serverTimestamp(),
      });
      toast("Informations enregistrées.", "success");
      setEditingProfile(false);
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast("Erreur de sauvegarde.", "error");
    }
    setSavingProfile(false);
  };

  const startChildEdit = (child: Child) => {
    const childAny: any = child;
    setChildForm({
      firstName: child.firstName || "",
      lastName: childAny.lastName || "",
      birthDate: dateInputValue(childAny.birthDate),
    });
    setEditingChild(child.id);
    setEditingSanitary(null);
  };

  const saveChild = async (childId: string) => {
    if (!user || !family) return;
    setSavingChild(true);
    try {
      const updatedChildren = children.map((child) =>
        child.id === childId
          ? {
              ...child,
              firstName: childForm.firstName.trim(),
              lastName: childForm.lastName.trim(),
              birthDate: childForm.birthDate ? new Date(`${childForm.birthDate}T00:00:00`) : (child as any).birthDate,
            }
          : child,
      );
      await updateDoc(doc(db, "families", user.uid), {
        children: updatedChildren,
        updatedAt: serverTimestamp(),
      });
      toast("Cavalier mis à jour.", "success");
      setEditingChild(null);
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast("Impossible d’enregistrer les informations.", "error");
    }
    setSavingChild(false);
  };

  const startSanitaryEdit = (child: Child) => {
    setSanitaryForm({
      allergies: child.sanitaryForm?.allergies || "",
      emergencyContactName: child.sanitaryForm?.emergencyContactName || "",
      emergencyContactPhone: child.sanitaryForm?.emergencyContactPhone || "",
      parentalAuthorization: Boolean(child.sanitaryForm?.parentalAuthorization),
    });
    setEditingSanitary(child.id);
    setEditingChild(null);
  };

  const saveSanitary = async (childId: string) => {
    if (!user || !family) return;
    setSavingChild(true);
    try {
      const updatedChildren = children.map((child) =>
        child.id === childId
          ? { ...child, sanitaryForm: { ...sanitaryForm, updatedAt: new Date().toISOString() } }
          : child,
      );
      await updateDoc(doc(db, "families", user.uid), {
        children: updatedChildren,
        updatedAt: serverTimestamp(),
      });
      toast("Fiche sanitaire enregistrée.", "success");
      setEditingSanitary(null);
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast("Impossible d’enregistrer la fiche sanitaire.", "error");
    }
    setSavingChild(false);
  };

  const revokeMandate = async () => {
    if (!mandate || !confirm("Révoquer ce mandat de prélèvement SEPA ? Les prélèvements déjà transmis à la banque peuvent encore être exécutés.")) return;
    setRevokingMandate(true);
    try {
      await updateDoc(doc(db, "mandats-sepa", mandate.id), {
        status: "revoked",
        revokedAt: serverTimestamp(),
      });
      setMandate(null);
      toast("Mandat révoqué.", "success");
    } catch (error) {
      console.error(error);
      toast("Impossible de révoquer le mandat.", "error");
    }
    setRevokingMandate(false);
  };

  const tabs: { id: ProfileTab; label: string; icon: any; note?: string }[] = [
    { id: "famille", label: "Ma famille", icon: Users },
    { id: "cavaliers", label: "Mes cavaliers", icon: UserRound, note: incompleteChildren > 0 ? String(incompleteChildren) : undefined },
    { id: "paiement", label: "Paiement", icon: CreditCard },
  ];

  const familyAny: any = family || {};
  const address = [familyAny.address, [familyAny.zipCode, familyAny.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");

  return (
    <div className="pb-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Ma famille</h1>
        <p className="font-body text-sm text-gray-600">Coordonnées, cavaliers, fiches sanitaires et moyens de paiement.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {tabs.map(({ id, label, icon: Icon, note }) => (
          <button
            type="button"
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-2 py-3 rounded-xl border font-body text-xs sm:text-sm font-bold cursor-pointer transition-all ${
              tab === id
                ? "bg-blue-800 text-white border-blue-800 shadow-sm"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            <Icon size={17} />
            <span>{label}</span>
            {note && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center">{note}</span>}
          </button>
        ))}
      </div>

      {tab === "famille" && (
        <>
          {missingBillingFields.length > 0 && !editingProfile && (
            <Card padding="sm" className="mb-5 !bg-orange-50 !border-orange-200">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-body text-sm font-bold text-orange-800">Informations à compléter</div>
                  <p className="font-body text-xs text-orange-700 mt-1 mb-3">Il manque : {missingBillingFields.join(", ")}.</p>
                  <button type="button" onClick={startProfileEdit} className="font-body text-sm font-bold text-white bg-orange-500 px-4 py-2 rounded-lg border-none cursor-pointer">
                    Compléter mes informations
                  </button>
                </div>
              </div>
            </Card>
          )}

          <Card padding="md" className="mb-5">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><Users size={20} className="text-blue-500" /></div>
                <div>
                  <div className="font-display text-lg font-bold text-blue-800">Coordonnées du titulaire</div>
                  <div className="font-body text-xs text-gray-600">Utilisées pour les factures et les informations du club.</div>
                </div>
              </div>
              {!editingProfile && (
                <button type="button" onClick={startProfileEdit} className="inline-flex items-center gap-1.5 font-body text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer">
                  <Edit3 size={13} /> Modifier
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Prénom *</label>
                    <input value={familyForm.firstName} onChange={(event) => setFamilyForm({ ...familyForm, firstName: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Nom *</label>
                    <input value={familyForm.lastName} onChange={(event) => setFamilyForm({ ...familyForm, lastName: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm uppercase focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Téléphone</label>
                  <input type="tel" value={familyForm.parentPhone} onChange={(event) => setFamilyForm({ ...familyForm, parentPhone: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Adresse *</label>
                  <input value={familyForm.address} onChange={(event) => setFamilyForm({ ...familyForm, address: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Code postal *</label>
                    <input inputMode="numeric" maxLength={5} value={familyForm.zipCode} onChange={(event) => setFamilyForm({ ...familyForm, zipCode: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Ville *</label>
                    <input value={familyForm.city} onChange={(event) => setFamilyForm({ ...familyForm, city: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveProfile} disabled={savingProfile} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
                    {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingProfile(false)} className="px-4 py-2.5 rounded-xl font-body text-sm text-gray-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="font-body text-xs font-semibold text-gray-500 mb-1">Nom et prénom</div>
                  <div className="font-body text-sm font-bold text-blue-800">{family?.parentName || "Non renseigné"}</div>
                </div>
                <div>
                  <div className="font-body text-xs font-semibold text-gray-500 mb-1">Téléphone</div>
                  <div className="font-body text-sm text-blue-800">{family?.parentPhone || "Non renseigné"}</div>
                </div>
                <div>
                  <div className="font-body text-xs font-semibold text-gray-500 mb-1">Email</div>
                  <div className="font-body text-sm text-blue-800 break-all">{family?.parentEmail || user?.email || "Non renseigné"}</div>
                </div>
                <div>
                  <div className="font-body text-xs font-semibold text-gray-500 mb-1">Adresse</div>
                  <div className="font-body text-sm text-blue-800 whitespace-pre-line">{address || "Non renseignée"}</div>
                </div>
              </div>
            )}
          </Card>

          <Card padding="sm" className="mb-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Compte de connexion</div>
                <div className="font-body text-xs text-gray-600 mt-0.5">{family?.parentEmail || user?.email || "—"}</div>
              </div>
              <Badge color="blue">{family?.authProvider === "google" ? "Google" : family?.authProvider === "facebook" ? "Facebook" : "Email"}</Badge>
            </div>
          </Card>

          <div className="pt-7 border-t border-gray-100">
            <div className="font-body text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Données personnelles</div>
            <p className="font-body text-xs text-gray-500 leading-relaxed mb-3">Vous pouvez demander la suppression de votre compte. Les données de facturation soumises à une obligation légale restent conservées pendant la durée prévue par la réglementation.</p>
            <a
              href={`mailto:ceagon@orange.fr?subject=Demande de suppression de compte RGPD&body=Bonjour,%0A%0AJe souhaite demander la suppression de mon compte.%0A%0ACompte : ${user?.email || ""}`}
              className="inline-flex items-center gap-2 font-body text-sm text-red-500 no-underline border border-red-200 px-4 py-2 rounded-lg"
            >
              Demander la suppression de mon compte
            </a>
          </div>
        </>
      )}

      {tab === "cavaliers" && (
        <>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800">Mes cavaliers</h2>
              <p className="font-body text-xs text-gray-600">Identité, niveau et fiche sanitaire de chaque cavalier.</p>
            </div>
            <button type="button" onClick={() => setShowAddChild(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer">
              <Plus size={15} /> Ajouter
            </button>
          </div>

          {showAddChild && (
            <AddChildForm
              onCancel={() => setShowAddChild(false)}
              onDone={() => {
                setShowAddChild(false);
                window.location.reload();
              }}
            />
          )}

          {children.length === 0 && !showAddChild ? (
            <Card padding="lg" className="text-center">
              <div className="text-5xl mb-3">🐴</div>
              <div className="font-display text-lg font-bold text-blue-800">Aucun cavalier enregistré</div>
              <p className="font-body text-sm text-gray-600 mt-1 mb-4">Ajoutez un cavalier pour réserver des cours, stages et balades.</p>
              <button type="button" onClick={() => setShowAddChild(true)} className="px-5 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer">Ajouter mon premier cavalier</button>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {children.map((child) => {
                const childAny: any = child;
                const identityComplete = Boolean(child.firstName?.trim() && childAny.lastName?.trim() && childAny.birthDate);
                const sanitaryComplete = Boolean(child.sanitaryForm);
                const expanded = expandedChild === child.id;

                return (
                  <Card key={child.id} padding="md">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">🐴</div>
                        <div className="min-w-0">
                          <div className="font-display text-lg font-bold text-blue-800 truncate">{child.firstName} {childAny.lastName || ""}</div>
                          <div className="font-body text-xs text-gray-600 mt-0.5">Niveau : {child.galopLevel || "—"}</div>
                          {childAny.licencePayee && childAny.licenceNumber && <div className="font-body text-xs text-green-700 mt-0.5">Licence FFE : {childAny.licenceNumber}</div>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge color={identityComplete ? "green" : "red"}>{identityComplete ? "Profil complet" : "Profil incomplet"}</Badge>
                        <Badge color={sanitaryComplete ? "green" : "red"}>{sanitaryComplete ? "Attestation OK" : "Attestation manquante"}</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button type="button" onClick={() => startChildEdit(child)} className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-600 bg-blue-50 border-none cursor-pointer">
                        <Edit3 size={14} /> Informations
                      </button>
                      <button type="button" onClick={() => startSanitaryEdit(child)} className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${sanitaryComplete ? "text-green-700 bg-green-50" : "text-orange-700 bg-orange-50"}`}>
                        <ShieldCheck size={14} /> Fiche sanitaire
                      </button>
                    </div>

                    {editingChild === child.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="font-body text-sm font-bold text-blue-800 mb-3">Modifier les informations</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Prénom</label>
                            <input value={childForm.firstName} onChange={(event) => setChildForm({ ...childForm, firstName: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Nom</label>
                            <input value={childForm.lastName} onChange={(event) => setChildForm({ ...childForm, lastName: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Date de naissance</label>
                            <input type="date" max={todayLocalString()} value={childForm.birthDate} onChange={(event) => setChildForm({ ...childForm, birthDate: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button type="button" onClick={() => saveChild(child.id)} disabled={savingChild} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
                            {savingChild ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
                          </button>
                          <button type="button" onClick={() => setEditingChild(null)} className="px-4 py-2.5 rounded-xl font-body text-sm text-gray-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    )}

                    {editingSanitary === child.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="font-body text-sm font-bold text-blue-800 mb-3">Fiche sanitaire</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Allergies</label>
                            <input value={sanitaryForm.allergies} onChange={(event) => setSanitaryForm({ ...sanitaryForm, allergies: event.target.value })} placeholder="Aucune ou précisez" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Contact d’urgence</label>
                            <input value={sanitaryForm.emergencyContactName} onChange={(event) => setSanitaryForm({ ...sanitaryForm, emergencyContactName: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="font-body text-xs font-semibold text-gray-600 block mb-1">Téléphone d’urgence</label>
                            <input value={sanitaryForm.emergencyContactPhone} onChange={(event) => setSanitaryForm({ ...sanitaryForm, emergencyContactPhone: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
                          </div>
                        </div>
                        <label className="mt-4 flex items-start gap-2 font-body text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={sanitaryForm.parentalAuthorization} onChange={(event) => setSanitaryForm({ ...sanitaryForm, parentalAuthorization: event.target.checked })} className="accent-blue-500 w-4 h-4 mt-0.5" />
                          J’autorise ce cavalier à participer aux activités équestres du centre.
                        </label>
                        <div className="flex gap-2 mt-4">
                          <button type="button" onClick={() => saveSanitary(child.id)} disabled={savingChild} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-green-600 border-none cursor-pointer disabled:opacity-50">
                            {savingChild ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
                          </button>
                          <button type="button" onClick={() => setEditingSanitary(null)} className="px-4 py-2.5 rounded-xl font-body text-sm text-gray-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    )}

                    {sanitaryComplete && editingSanitary !== child.id && editingChild !== child.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <button type="button" onClick={() => setExpandedChild(expanded ? null : child.id)} className="w-full flex items-center justify-between gap-2 font-body text-xs font-semibold text-gray-600 bg-transparent border-none cursor-pointer px-0 py-1">
                          <span>Voir les informations complémentaires</span>
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                        {expanded && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 bg-gray-50 rounded-xl p-3">
                            <div>
                              <div className="font-body text-xs font-semibold text-gray-500">Date de naissance</div>
                              <div className="font-body text-sm text-blue-800 mt-0.5">{formatBirthDate(childAny.birthDate)}</div>
                            </div>
                            <div>
                              <div className="font-body text-xs font-semibold text-gray-500">Allergies</div>
                              <div className="font-body text-sm text-blue-800 mt-0.5">{child.sanitaryForm?.allergies || "Aucune"}</div>
                            </div>
                            <div>
                              <div className="font-body text-xs font-semibold text-gray-500">Contact d’urgence</div>
                              <div className="font-body text-sm text-blue-800 mt-0.5">{child.sanitaryForm?.emergencyContactName || "—"}{child.sanitaryForm?.emergencyContactPhone ? ` · ${child.sanitaryForm.emergencyContactPhone}` : ""}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "paiement" && (
        <>
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold text-blue-800">Paiement et prélèvements</h2>
            <p className="font-body text-xs text-gray-600 mt-0.5">Votre mandat SEPA et l’accès à vos paiements.</p>
          </div>

          <Card padding="md" className="mb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0"><CreditCard size={20} className="text-blue-500" /></div>
              <div className="flex-1">
                <div className="font-body text-sm font-bold text-blue-800">Mes paiements et factures</div>
                <p className="font-body text-xs text-gray-600 mt-1 mb-3">Consultez le reste à régler, vos avoirs, cartes de séances et factures.</p>
                <Link href="/espace-cavalier/factures" className="inline-flex items-center gap-2 font-body text-sm font-bold text-white bg-blue-500 px-4 py-2.5 rounded-xl no-underline">
                  Ouvrir Mes paiements
                </Link>
              </div>
            </div>
          </Card>

          {mandate ? (
            <Card padding="md">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0"><Landmark size={20} className="text-green-600" /></div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-body text-sm font-bold text-blue-800">Mandat SEPA actif</div>
                      <Badge color="green">Actif</Badge>
                    </div>
                    <div className="font-body text-xs text-gray-600 mt-2">Titulaire : <span className="font-semibold">{mandate.titulaire || "—"}</span></div>
                    <div className="font-body text-xs text-gray-600 mt-0.5 font-mono">
                      IBAN : {(() => {
                        const iban = String(mandate.iban || "").replace(/\s/g, "");
                        return iban.length > 8 ? `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}` : "••••";
                      })()}
                    </div>
                    {mandate.dateSignature && <div className="font-body text-xs text-gray-400 mt-0.5">Signé le {new Date(mandate.dateSignature).toLocaleDateString("fr-FR")}</div>}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={revokeMandate} disabled={revokingMandate} className="inline-flex items-center gap-2 font-body text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50">
                  {revokingMandate ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                  Révoquer le mandat
                </button>
                <p className="font-body text-xs text-gray-400 mt-2">Les prélèvements déjà transmis à la banque peuvent encore être exécutés.</p>
              </div>
            </Card>
          ) : (
            <Card padding="md" className="!bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center"><Landmark size={20} className="text-gray-400" /></div>
                <div>
                  <div className="font-body text-sm font-bold text-blue-800">Aucun mandat SEPA actif</div>
                  <div className="font-body text-xs text-gray-600 mt-0.5">Les prélèvements n’apparaîtront ici que lorsqu’un mandat aura été créé.</div>
                </div>
              </div>
            </Card>
          )}

          <Card padding="sm" className="mt-4 !bg-blue-50 !border-blue-100">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="font-body text-xs text-blue-800 leading-relaxed">Les informations bancaires sont affichées de manière masquée. Les échéances de prélèvement se consultent dans la page Mes paiements lorsqu’elles existent.</div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
