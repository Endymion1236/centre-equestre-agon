"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { doc, updateDoc, arrayUnion, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, ChevronDown, ChevronUp, Edit3, Save, Loader2, Users, Building2, AlertTriangle, AlertCircle } from "lucide-react";
import type { Child, SanitaryForm } from "@/types";

function AddChildForm({ onAdd }: { onAdd: () => void }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [authorization, setAuthorization] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!firstName || !birthDate || !user) return;
    setSaving(true);

    const newChild: Child = {
      id: Date.now().toString(),
      firstName,
      birthDate: new Date(birthDate),
      galopLevel: "—",
      sanitaryForm: authorization
        ? {
            allergies,
            emergencyContactName: emergencyName,
            emergencyContactPhone: emergencyPhone,
            parentalAuthorization: true,
            updatedAt: new Date(),
          }
        : null,
    };

    try {
      const familyRef = doc(db, "families", user.uid);
      await updateDoc(familyRef, {
        children: arrayUnion(newChild),
        updatedAt: serverTimestamp(),
      });
      onAdd();
      // Reset form
      setFirstName("");
      setBirthDate("");
      setAllergies("");
      setEmergencyName("");
      setEmergencyPhone("");
      setAuthorization(false);
    } catch (error) {
      console.error("Erreur ajout enfant:", error);
    }
    setSaving(false);
  };

  return (
    <Card className="mt-4" padding="md">
      <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">
        Ajouter un cavalier
      </h3>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">
              Prénom *
            </label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              placeholder="Prénom de l'enfant"
            />
          </div>
          <div className="flex-1">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">
              Date de naissance *
            </label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-blue-500/8 pt-4">
          <div className="font-body text-xs font-semibold text-blue-800 mb-3">
            📋 Fiche sanitaire
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 block mb-1">
                Allergies connues
              </label>
              <input
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                placeholder="Ex: arachides, pollen..."
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-gray-600 block mb-1">
                  Contact urgence — Nom
                </label>
                <input
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                  placeholder="Nom"
                />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-gray-600 block mb-1">
                  Téléphone urgence
                </label>
                <input
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                  placeholder="06..."
                />
              </div>
            </div>
            <label className="flex items-center gap-2 font-body text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={authorization}
                onChange={(e) => setAuthorization(e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
              J&apos;autorise mon enfant à participer aux activités équestres du centre
            </label>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={handleSubmit}
          disabled={!firstName || !birthDate || saving}
        >
          {saving ? "Enregistrement..." : "Ajouter ce cavalier"}
        </Button>
      </div>
    </Card>
  );
}

export default function ProfilPage() {
  const { user, family } = useAuth();
  const [showAddChild, setShowAddChild] = useState(false);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    parentPhone: "",
    address: "",
    zipCode: "",
    city: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingChild, setEditingChild] = useState<string | null>(null);
  const [editingChildForm, setEditingChildForm] = useState({ firstName: "", lastName: "", birthDate: "" });
  const [editingSanitary, setEditingSanitary] = useState<string | null>(null);
  const [sanitaryForm, setSanitaryForm] = useState({ allergies: "", emergencyContactName: "", emergencyContactPhone: "", parentalAuthorization: false });
  const [savingChild, setSavingChild] = useState(false);
  const [mandat, setMandat] = useState<any>(null);
  const [revokingMandat, setRevokingMandat] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "mandats-sepa"), where("familyId", "==", user.uid)))
      .then(snap => {
        const active = snap.docs.find(d => d.data().status === "active");
        if (active) setMandat({ id: active.id, ...active.data() });
      })
      .catch(() => {});
  }, [user]);

  const handleRevokeMandat = async () => {
    if (!mandat || !confirm("Êtes-vous sûr de vouloir révoquer votre mandat de prélèvement SEPA ? Les prélèvements en cours seront annulés.")) return;
    setRevokingMandat(true);
    try {
      await updateDoc(doc(db, "mandats-sepa", mandat.id), { status: "revoked", revokedAt: serverTimestamp() });
      setMandat(null);
    } catch (e) { console.error(e); }
    setRevokingMandat(false);
  };

  const startEdit = () => {
    // Préremplir : priorité aux nouveaux champs firstName/lastName, fallback
    // sur parentName pour les anciens comptes qui n'ont que ce champ (format
    // libre ex: "Richard Nicolas"). On le met entièrement dans firstName pour
    // que le cavalier puisse le redispatcher manuellement.
    const existingFirst = (family as any)?.firstName || "";
    const existingLast = (family as any)?.lastName || "";
    const fallbackToFirstName = !existingFirst && !existingLast && family?.parentName
      ? family.parentName
      : "";

    setEditForm({
      firstName: existingFirst || fallbackToFirstName,
      lastName: existingLast,
      parentPhone: family?.parentPhone || "",
      address: (family as any)?.address || "",
      zipCode: (family as any)?.zipCode || "",
      city: (family as any)?.city || "",
    });
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      // Normalisation (comme en admin) : nom en UPPERCASE, prénom en Title-ish
      // (on garde la casse saisie). parentName est recalculé automatiquement
      // pour maintenir la compatibilité avec le reste du code qui le lit.
      const lastName = editForm.lastName.trim().toUpperCase();
      const firstName = editForm.firstName.trim();
      const computedName = lastName && firstName
        ? `${lastName} ${firstName}`
        : lastName || firstName || family?.parentName || "";

      await updateDoc(doc(db, "families", user.uid), {
        firstName: firstName || null,
        lastName: lastName || null,
        parentName: computedName,
        parentPhone: editForm.parentPhone.trim(),
        address: editForm.address.trim(),
        zipCode: editForm.zipCode.trim(),
        city: editForm.city.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingProfile(false);
      window.location.reload();
    } catch (e) { console.error(e); alert("Erreur de sauvegarde."); }
    setSavingProfile(false);
  };

  // Détection des champs manquants pour la facturation
  const missingBillingFields = (() => {
    const fam: any = family || {};
    const missing: string[] = [];
    // Nom + prénom requis (soit les deux séparés, soit parentName en fallback)
    const hasName = (fam.firstName && fam.lastName) || fam.parentName;
    if (!hasName) missing.push("Nom et prénom");
    if (!fam.address) missing.push("Adresse");
    if (!fam.zipCode) missing.push("Code postal");
    if (!fam.city) missing.push("Ville");
    return missing;
  })();

  const handleChildAdded = () => {
    setShowAddChild(false);
    window.location.reload();
  };

  const startEditChild = (child: Child) => {
    setEditingChild(child.id);
    setEditingChildForm({
      firstName: child.firstName,
      lastName: (child as any).lastName || "",
      birthDate: child.birthDate ? new Date(child.birthDate).toISOString().slice(0, 10) : "",
    });
  };

  const saveChild = async (childId: string) => {
    if (!user || !family) return;
    setSavingChild(true);
    try {
      const updatedChildren = family.children.map((c: Child) =>
        c.id === childId ? { ...c, firstName: editingChildForm.firstName.trim(), lastName: editingChildForm.lastName.trim(), birthDate: editingChildForm.birthDate ? new Date(editingChildForm.birthDate) : c.birthDate } : c
      );
      await updateDoc(doc(db, "families", user.uid), { children: updatedChildren, updatedAt: serverTimestamp() });
      setEditingChild(null);
      window.location.reload();
    } catch (e) { console.error(e); }
    setSavingChild(false);
  };

  const startEditSanitary = (child: Child) => {
    setEditingSanitary(child.id);
    setSanitaryForm({
      allergies: child.sanitaryForm?.allergies || "",
      emergencyContactName: child.sanitaryForm?.emergencyContactName || "",
      emergencyContactPhone: child.sanitaryForm?.emergencyContactPhone || "",
      parentalAuthorization: child.sanitaryForm?.parentalAuthorization || false,
    });
  };

  const saveSanitary = async (childId: string) => {
    if (!user || !family) return;
    setSavingChild(true);
    try {
      const updatedChildren = family.children.map((c: Child) =>
        c.id === childId ? { ...c, sanitaryForm: { ...sanitaryForm, updatedAt: new Date().toISOString() } } : c
      );
      await updateDoc(doc(db, "families", user.uid), { children: updatedChildren, updatedAt: serverTimestamp() });
      setEditingSanitary(null);
      window.location.reload();
    } catch (e) { console.error(e); }
    setSavingChild(false);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">
        Profil famille
      </h1>

      {/* Bandeau alerte si champs de facturation manquants */}
      {missingBillingFields.length > 0 && !editingProfile && (
        <Card className="!bg-orange-50 !border-orange-300 mb-5" padding="sm">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-body text-sm font-bold text-orange-800">
                Informations incomplètes pour la facturation
              </p>
              <p className="font-body text-xs text-orange-600 mt-0.5">
                Il manque {missingBillingFields.length === 1 ? "un champ obligatoire" : "des champs obligatoires"} pour émettre vos factures :{" "}
                <span className="font-semibold">{missingBillingFields.join(", ")}</span>.
                Merci de compléter votre profil.
              </p>
              <button onClick={startEdit}
                className="mt-2 font-body text-xs font-semibold text-white bg-orange-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-400">
                Compléter mes informations →
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Parent info */}
      <Card padding="md" className="mb-5">
        <div className="flex justify-between items-start mb-4">
          <span className="font-body text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Users size={16} className="text-blue-500" /> Parent titulaire
          </span>
          {!editingProfile && (
            <button onClick={startEdit}
              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
              <Edit3 size={12} /> Modifier
            </button>
          )}
        </div>

        {editingProfile ? (
          <div className="flex flex-col gap-3">
            {/* Prénom + Nom */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">
                  Prénom <span className="text-orange-500">*</span>
                </label>
                <input value={editForm.firstName} onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                  placeholder="Nicolas" />
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">
                  Nom <span className="text-orange-500">*</span>
                </label>
                <input value={editForm.lastName} onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 uppercase"
                  placeholder="RICHARD" />
              </div>
            </div>

            {/* Téléphone */}
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Téléphone</label>
              <input type="tel" value={editForm.parentPhone} onChange={e => setEditForm({ ...editForm, parentPhone: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                placeholder="06 00 00 00 00" />
            </div>

            {/* Adresse */}
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">
                Adresse <span className="text-orange-500">*</span>
              </label>
              <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                placeholder="12 rue de la Mer" />
            </div>

            {/* Code postal + Ville */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">
                  Code postal <span className="text-orange-500">*</span>
                </label>
                <input value={editForm.zipCode} onChange={e => setEditForm({ ...editForm, zipCode: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                  placeholder="50230" inputMode="numeric" maxLength={5} />
              </div>
              <div className="sm:col-span-2">
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">
                  Ville <span className="text-orange-500">*</span>
                </label>
                <input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
                  placeholder="Agon-Coutainville" />
              </div>
            </div>

            {/* Email + Connexion (non modifiables) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Email</label>
                <div className="font-body text-sm text-gray-600 py-2.5">{family?.parentEmail || "—"} <span className="text-xs text-gray-400">(non modifiable)</span></div>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Connexion</label>
                <div className="font-body text-sm text-gray-600 py-2.5">{family?.authProvider === "google" ? "Google" : "Facebook"}</div>
              </div>
            </div>

            <p className="font-body text-xs text-gray-500">
              <span className="text-orange-500">*</span> Champs obligatoires pour la facturation
            </p>

            <div className="flex gap-2">
              <button onClick={handleSaveProfile} disabled={savingProfile}
                className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
              </button>
              <button onClick={() => setEditingProfile(false)}
                className="font-body text-xs text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Nom et prénom", value: family?.parentName || "—" },
              { label: "Email", value: family?.parentEmail || "—" },
              { label: "Téléphone", value: family?.parentPhone || "Non renseigné" },
              {
                label: "Adresse",
                value: (() => {
                  const fam: any = family || {};
                  const street = fam.address || "";
                  const cp = fam.zipCode || "";
                  const city = fam.city || "";
                  const line2 = [cp, city].filter(Boolean).join(" ");
                  if (!street && !line2) return "Non renseignée";
                  return (
                    <>
                      {street && <div>{street}</div>}
                      {line2 && <div>{line2}</div>}
                    </>
                  );
                })(),
              },
              { label: "Connexion", value: `${family?.authProvider === "google" ? "Google" : "Facebook"}` },
            ].map((field, i) => (
              <div key={i}>
                <div className="font-body text-xs font-semibold text-gray-600 mb-0.5">
                  {field.label}
                </div>
                <div className="font-body text-sm text-blue-800">{field.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Children */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-lg font-bold text-blue-800">
          Cavaliers
        </h2>
        <button
          onClick={() => setShowAddChild(!showAddChild)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-400 transition-colors"
        >
          <Plus size={16} />
          Ajouter un enfant
        </button>
      </div>

      {showAddChild && <AddChildForm onAdd={handleChildAdded} />}

      {family?.children && family.children.length > 0 ? (
        <div className="flex flex-col gap-3 mt-4">
          {family.children.map((child) => (
            <Card key={child.id} padding="md">
              {/* En-tête enfant */}
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">🧒</div>
                  <div>
                    <div className="font-body text-base font-semibold text-blue-800">
                      {child.firstName} {(child as any).lastName || ""}
                    </div>
                    <div className="font-body text-xs text-gray-600">Niveau : {child.galopLevel || "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {child.sanitaryForm ? (
                    <Badge color="green">✓ Fiche sanitaire OK</Badge>
                  ) : (
                    <Badge color="red">⚠ Fiche manquante</Badge>
                  )}
                  <button onClick={() => startEditChild(child)}
                    className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                    <Edit3 size={11} /> Modifier
                  </button>
                </div>
              </div>

              {/* Formulaire modification enfant */}
              {editingChild === child.id && (
                <div className="mt-4 pt-4 border-t border-blue-500/8 flex flex-col gap-3">
                  <div className="font-body text-xs font-semibold text-blue-800 mb-1">Modifier le cavalier</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-xs text-gray-600 block mb-1">Prénom</label>
                      <input value={editingChildForm.firstName} onChange={e => setEditingChildForm({ ...editingChildForm, firstName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="font-body text-xs text-gray-600 block mb-1">Nom</label>
                      <input value={editingChildForm.lastName} onChange={e => setEditingChildForm({ ...editingChildForm, lastName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="font-body text-xs text-gray-600 block mb-1">Date de naissance</label>
                      <input type="date" value={editingChildForm.birthDate} onChange={e => setEditingChildForm({ ...editingChildForm, birthDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveChild(child.id)} disabled={savingChild}
                      className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                      {savingChild ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
                    </button>
                    <button onClick={() => setEditingChild(null)}
                      className="font-body text-xs text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                  </div>
                </div>
              )}

              {/* Fiche sanitaire */}
              {!editingChild && (
                <div className="mt-3 pt-3 border-t border-blue-500/8">
                  {editingSanitary === child.id ? (
                    <div className="flex flex-col gap-3">
                      <div className="font-body text-xs font-semibold text-blue-800">📋 Fiche sanitaire</div>
                      <div>
                        <label className="font-body text-xs text-gray-600 block mb-1">Allergies connues</label>
                        <input value={sanitaryForm.allergies} onChange={e => setSanitaryForm({ ...sanitaryForm, allergies: e.target.value })}
                          placeholder="Ex: arachides, pollen... (ou Aucune)"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-body text-xs text-gray-600 block mb-1">Contact urgence — Nom</label>
                          <input value={sanitaryForm.emergencyContactName} onChange={e => setSanitaryForm({ ...sanitaryForm, emergencyContactName: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="font-body text-xs text-gray-600 block mb-1">Téléphone urgence</label>
                          <input value={sanitaryForm.emergencyContactPhone} onChange={e => setSanitaryForm({ ...sanitaryForm, emergencyContactPhone: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" placeholder="06..." />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer font-body text-xs text-gray-600">
                        <input type="checkbox" checked={sanitaryForm.parentalAuthorization} onChange={e => setSanitaryForm({ ...sanitaryForm, parentalAuthorization: e.target.checked })}
                          className="accent-blue-500 w-4 h-4" />
                        J&apos;autorise mon enfant à participer aux activités équestres
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => saveSanitary(child.id)} disabled={savingChild}
                          className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-green-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-green-600 disabled:opacity-50">
                          {savingChild ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer la fiche
                        </button>
                        <button onClick={() => setEditingSanitary(null)}
                          className="font-body text-xs text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {child.sanitaryForm ? (
                        <>
                          <button onClick={() => setExpandedChild(expandedChild === child.id ? null : child.id)}
                            className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1">
                            {expandedChild === child.id ? <>Masquer la fiche <ChevronUp size={14} /></> : <>Voir la fiche sanitaire <ChevronDown size={14} /></>}
                          </button>
                          {expandedChild === child.id && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <div>
                                <div className="font-body text-xs font-semibold text-gray-600">Allergies</div>
                                <div className="font-body text-sm text-blue-800">{child.sanitaryForm.allergies || "Aucune"}</div>
                              </div>
                              <div>
                                <div className="font-body text-xs font-semibold text-gray-600">Contact urgence</div>
                                <div className="font-body text-sm text-blue-800">{child.sanitaryForm.emergencyContactName} — {child.sanitaryForm.emergencyContactPhone}</div>
                              </div>
                              <div>
                                <div className="font-body text-xs font-semibold text-gray-600">Autorisation parentale</div>
                                <div className="font-body text-sm text-green-600">✓ Accordée</div>
                              </div>
                            </div>
                          )}
                          <button onClick={() => startEditSanitary(child)}
                            className="mt-2 font-body text-xs text-gray-600 bg-transparent border-none cursor-pointer hover:text-blue-500 flex items-center gap-1">
                            <Edit3 size={11} /> Modifier la fiche sanitaire
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEditSanitary(child)}
                          className="font-body text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-100 flex items-center gap-1.5 w-full justify-center">
                          📋 Compléter la fiche sanitaire
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        !showAddChild && (
          <Card padding="lg" className="text-center mt-4">
            <span className="text-4xl block mb-3">👶</span>
            <p className="font-body text-sm text-gray-600 mb-4">
              Aucun cavalier enregistré. Ajoutez vos enfants pour pouvoir
              réserver des activités.
            </p>
            <Button variant="primary" onClick={() => setShowAddChild(true)}>
              Ajouter mon premier cavalier
            </Button>
          </Card>
        )
      )}

      {/* ── Mandat SEPA ── */}
      {mandat && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4">Prélèvement SEPA</h2>
          <Card padding="md">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Building2 size={24} className="text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-body text-sm font-semibold text-blue-800">{mandat.titulaire}</span>
                  <Badge color="green">Actif</Badge>
                </div>
                <div className="font-body text-xs text-gray-500 font-mono mb-1">
                  IBAN : {mandat.iban?.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()}
                </div>
                <div className="font-body text-[10px] text-gray-400">
                  Mandat {mandat.mandatId} · Signé le {new Date(mandat.dateSignature).toLocaleDateString("fr-FR")}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button onClick={handleRevokeMandat} disabled={revokingMandat}
                className="flex items-center gap-2 font-body text-xs text-red-500 hover:text-red-700 bg-transparent border border-red-200 hover:border-red-400 px-3 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                {revokingMandat ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                Révoquer mon mandat de prélèvement
              </button>
              <p className="font-body text-[10px] text-gray-400 mt-2">
                La révocation prend effet immédiatement. Les prélèvements déjà soumis à la banque ne pourront pas être annulés par cette action.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── RGPD — Supprimer mon compte ── */}
      <div className="mt-10 pt-8 border-t border-gray-100">
        <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Données personnelles
        </p>
        <p className="font-body text-sm text-gray-500 mb-4 leading-relaxed">
          Conformément au RGPD, vous pouvez demander la suppression de votre compte et de vos données personnelles.
          Cette action est irréversible. Vos données de facturation sont conservées 10 ans (obligation légale).
        </p>
        <a
          href={`mailto:ceagon@orange.fr?subject=Demande de suppression de compte RGPD&body=Bonjour,%0A%0AJe souhaite exercer mon droit à l'effacement conformément au RGPD.%0A%0ACompte associé à l'adresse : ${user?.email || ""}%0A%0AMerci.`}
          className="inline-flex items-center gap-2 font-body text-sm text-red-500 hover:text-red-700 no-underline border border-red-200 hover:border-red-400 px-4 py-2 rounded-lg transition-colors"
        >
          🗑️ Demander la suppression de mon compte
        </a>
        <p className="font-body text-xs text-gray-400 mt-3">
          Délai de traitement : 30 jours —{" "}
          <a href="/confidentialite" className="text-blue-500 no-underline hover:underline">
            Politique de confidentialité
          </a>
        </p>
      </div>
    </div>
  );
}
