"use client";
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { emailTemplates } from "@/lib/email-templates";
import { useToast } from "@/components/ui/Toast";

const galopLevels = ["—", "Poney Bronze", "Poney Argent", "Poney Or", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

const inputStyle = "w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400";
const labelStyle = "font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1";

type AccountType = "particulier" | "asso" | "collectivite";

interface Props {
  onClose: () => void;
  onDone: () => void;
}

export default function CreateFamilyModal({ onClose, onDone }: Props) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [newFamily, setNewFamily] = useState({
    parentName: "", parentEmail: "", parentPhone: "",
    lastName: "", firstName: "",
    address: "", zipCode: "", city: "",
    accountType: "particulier" as AccountType,
    raisonSociale: "", structureParente: "", siret: "", referent: "",
  });
  const [newChildren, setNewChildren] = useState([{ firstName: "", birthDate: "", galopLevel: "—" }]);

  const handleCreate = async () => {
    const isValid = newFamily.accountType === "particulier"
      ? (newFamily.lastName.trim() || newFamily.parentName.trim())
      : newFamily.raisonSociale.trim();
    if (!isValid) return;
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

      // Nom affiché : "DUPONT Marie" si séparé, sinon parentName brut
      const lastName = newFamily.lastName.trim().toUpperCase();
      const firstName = newFamily.firstName.trim();
      const computedName = newFamily.accountType === "particulier"
        ? (lastName && firstName ? `${lastName} ${firstName}` : lastName || firstName || newFamily.parentName.trim())
        : newFamily.accountType === "collectivite" && newFamily.structureParente && newFamily.raisonSociale
          ? `${newFamily.structureParente.trim()} — ${newFamily.raisonSociale.trim()}`
          : newFamily.raisonSociale.trim() || newFamily.parentName.trim();

      await addDoc(collection(db, "families"), {
        parentName: computedName,
        lastName: lastName || undefined,
        firstName: firstName || undefined,
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
        authProvider: "admin", authUid: "",
        children, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      if (newFamily.parentEmail.trim()) {
        const emailData = emailTemplates.bienvenueNouvelleFamille({ parentName: computedName });
        fetch("/api/send-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: newFamily.parentEmail.trim(), ...emailData }),
        }).catch(() => {});
      }

      toast("✅ Famille créée", "success");
      onDone();
      onClose();
    } catch (e) {
      console.error(e);
      toast("Erreur lors de la création", "error");
    }
    setSaving(false);
  };

  const canCreate = newFamily.accountType === "particulier"
    ? (newFamily.lastName.trim() || newFamily.parentName.trim())
    : newFamily.raisonSociale.trim();

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="font-display text-lg font-bold text-blue-800">Nouvelle famille</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16}/></button>
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

          {/* Infos parent/structure */}
          <div>
            <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">
              {newFamily.accountType === "particulier" ? "Parent / responsable" : "Structure"}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {newFamily.accountType === "particulier" ? (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelStyle}>Nom de famille *</label>
                      <input className={inputStyle} value={newFamily.lastName}
                        onChange={e => setNewFamily({ ...newFamily, lastName: e.target.value.toUpperCase() })} placeholder="Ex: DUPONT"/>
                    </div>
                    <div>
                      <label className={labelStyle}>Prénom</label>
                      <input className={inputStyle} value={newFamily.firstName}
                        onChange={e => setNewFamily({ ...newFamily, firstName: e.target.value })} placeholder="Ex: Marie"/>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {newFamily.accountType === "collectivite" && (
                    <div>
                      <label className={labelStyle}>Structure parente *</label>
                      <input className={inputStyle} value={newFamily.structureParente}
                        onChange={e => setNewFamily({ ...newFamily, structureParente: e.target.value })}
                        placeholder="Ex: Coutances Mer et Bocage"/>
                    </div>
                  )}
                  <div>
                    <label className={labelStyle}>
                      {newFamily.accountType === "collectivite" ? "Nom du centre / service *" : "Nom de l'association *"}
                    </label>
                    <input className={inputStyle} value={newFamily.raisonSociale}
                      onChange={e => setNewFamily({ ...newFamily, raisonSociale: e.target.value })}
                      placeholder={newFamily.accountType === "collectivite" ? "Ex: Centre de loisirs" : "Ex: Club équestre..."}/>
                    {newFamily.accountType === "collectivite" && newFamily.structureParente && newFamily.raisonSociale && (
                      <div className="font-body text-[10px] text-green-600 mt-1">
                        → <strong>{newFamily.structureParente} — {newFamily.raisonSociale}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelStyle}>SIRET (optionnel)</label>
                    <input className={inputStyle} value={newFamily.siret}
                      onChange={e => setNewFamily({ ...newFamily, siret: e.target.value })} placeholder="123 456 789 00012"/>
                  </div>
                  <div>
                    <label className={labelStyle}>Référent</label>
                    <input className={inputStyle} value={newFamily.referent}
                      onChange={e => setNewFamily({ ...newFamily, referent: e.target.value })} placeholder="Marie Dupont"/>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Email</label>
                  <input type="email" className={inputStyle} value={newFamily.parentEmail}
                    onChange={e => setNewFamily({ ...newFamily, parentEmail: e.target.value })} placeholder="exemple@email.com"/>
                </div>
                <div>
                  <label className={labelStyle}>Téléphone</label>
                  <input type="tel" className={inputStyle} value={newFamily.parentPhone}
                    onChange={e => setNewFamily({ ...newFamily, parentPhone: e.target.value })} placeholder="06 00 00 00 00"/>
                </div>
              </div>
              <div>
                <label className={labelStyle}>Adresse</label>
                <input className={inputStyle} value={newFamily.address}
                  onChange={e => setNewFamily({ ...newFamily, address: e.target.value })} placeholder="12 rue des Écuries"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Code postal</label>
                  <input className={inputStyle} value={newFamily.zipCode}
                    onChange={e => setNewFamily({ ...newFamily, zipCode: e.target.value })} placeholder="50230"/>
                </div>
                <div>
                  <label className={labelStyle}>Ville</label>
                  <input className={inputStyle} value={newFamily.city}
                    onChange={e => setNewFamily({ ...newFamily, city: e.target.value })} placeholder="Agon-Coutainville"/>
                </div>
              </div>
            </div>
          </div>

          {/* Cavaliers */}
          <div>
            <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">
              Cavaliers {newFamily.accountType !== "particulier" && <span className="text-slate-400 font-normal normal-case">(optionnel)</span>}
            </div>
            {newChildren.map((child, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  {i === 0 && <label className={labelStyle}>Prénom</label>}
                  <input className={inputStyle} value={child.firstName}
                    onChange={e => { const up = [...newChildren]; up[i].firstName = e.target.value; setNewChildren(up); }}
                    placeholder="Prénom"/>
                </div>
                <div className="w-36">
                  {i === 0 && <label className={labelStyle}>Date de naissance</label>}
                  <input type="date" className={inputStyle} value={child.birthDate}
                    onChange={e => { const up = [...newChildren]; up[i].birthDate = e.target.value; setNewChildren(up); }}/>
                </div>
                <div className="w-28">
                  {i === 0 && <label className={labelStyle}>Niveau</label>}
                  <select className={inputStyle} value={child.galopLevel}
                    onChange={e => { const up = [...newChildren]; up[i].galopLevel = e.target.value; setNewChildren(up); }}>
                    {galopLevels.map(g => <option key={g} value={g}>{g === "—" ? "Débutant" : g}</option>)}
                  </select>
                </div>
                {newChildren.length > 1 && (
                  <button onClick={() => setNewChildren(newChildren.filter((_, j) => j !== i))}
                    className="w-8 h-10 rounded-lg bg-red-50 text-red-400 flex items-center justify-center border-none cursor-pointer hover:bg-red-100">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setNewChildren([...newChildren, { firstName: "", birthDate: "", galopLevel: "—" }])}
              className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-2">
              <Plus size={14}/> Ajouter un cavalier
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={handleCreate} disabled={saving || !canCreate}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Créer la famille
          </button>
        </div>
      </div>
    </div>
  );
}
