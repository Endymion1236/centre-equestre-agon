"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Plus, Search, Loader2, X, Save, Trash2, Edit3, Copy, FileText, Mail, ClipboardList, Eye,
} from "lucide-react";

// ─── Types ───
type DocCategory = "email" | "inscription" | "attestation" | "courrier" | "autre";

interface DocTemplate {
  id: string;
  category: DocCategory;
  name: string;
  subject: string; // Pour les emails
  body: string; // Contenu avec variables {{variable}}
  variables: string[]; // Liste des variables utilisées
  active: boolean;
  createdAt: any;
  updatedAt: any;
}

const categoryLabels: Record<DocCategory, { label: string; color: "blue" | "green" | "orange" | "purple" | "gray" }> = {
  email: { label: "Email", color: "blue" },
  inscription: { label: "Fiche d'inscription", color: "green" },
  attestation: { label: "Attestation", color: "purple" },
  courrier: { label: "Courrier", color: "orange" },
  autre: { label: "Autre", color: "gray" },
};

// Variables disponibles pour les templates
const availableVariables: { name: string; label: string; category: string }[] = [
  { name: "nom_parent", label: "Nom du parent", category: "Famille" },
  { name: "email_parent", label: "Email du parent", category: "Famille" },
  { name: "telephone", label: "Téléphone", category: "Famille" },
  { name: "prenom_enfant", label: "Prénom de l'enfant", category: "Cavalier" },
  { name: "age_enfant", label: "Âge de l'enfant", category: "Cavalier" },
  { name: "niveau_galop", label: "Niveau galop", category: "Cavalier" },
  { name: "activite", label: "Nom de l'activité", category: "Activité" },
  { name: "date_activite", label: "Date de l'activité", category: "Activité" },
  { name: "horaire", label: "Horaires", category: "Activité" },
  { name: "moniteur", label: "Moniteur", category: "Activité" },
  { name: "prix_ttc", label: "Prix TTC", category: "Facturation" },
  { name: "montant_du", label: "Montant dû", category: "Facturation" },
  { name: "num_facture", label: "N° Facture", category: "Facturation" },
  { name: "date_jour", label: "Date du jour", category: "Système" },
  { name: "annee", label: "Année en cours", category: "Système" },
  { name: "nom_centre", label: "Nom du centre", category: "Système" },
];

// Templates par défaut
const defaultTemplates: Omit<DocTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    category: "email",
    name: "Confirmation d'inscription",
    subject: "Confirmation d'inscription — {{activite}}",
    body: `Bonjour {{nom_parent}},

Nous avons le plaisir de vous confirmer l'inscription de {{prenom_enfant}} à {{activite}}.

Détails :
- Date : {{date_activite}}
- Horaires : {{horaire}}
- Moniteur : {{moniteur}}

Merci de votre confiance !

Cordialement,
Centre Équestre d'Agon-Coutainville
02 44 84 99 96`,
    variables: ["nom_parent", "prenom_enfant", "activite", "date_activite", "horaire", "moniteur"],
    active: true,
  },
  {
    category: "email",
    name: "Relance impayé",
    subject: "Rappel de paiement — {{num_facture}}",
    body: `Bonjour {{nom_parent}},

Nous nous permettons de vous rappeler qu'un solde de {{montant_du}}€ reste dû (facture {{num_facture}}).

Merci de régulariser votre situation à votre convenance.

Cordialement,
Centre Équestre d'Agon-Coutainville`,
    variables: ["nom_parent", "montant_du", "num_facture"],
    active: true,
  },
  {
    category: "inscription",
    name: "Fiche d'inscription standard",
    subject: "",
    body: `FICHE D'INSCRIPTION — Saison {{annee}}

{{nom_centre}}
56 Charrière du Commerce — 50230 Agon-Coutainville

RESPONSABLE LÉGAL
Nom : {{nom_parent}}
Téléphone : {{telephone}}
Email : {{email_parent}}

CAVALIER
Prénom : {{prenom_enfant}}
Âge : {{age_enfant}} ans
Niveau : {{niveau_galop}}

ACTIVITÉ CHOISIE
{{activite}} — {{horaire}}

TARIF : {{prix_ttc}}€ TTC

Date : {{date_jour}}
Signature du responsable légal :


_______________________________`,
    variables: ["annee", "nom_centre", "nom_parent", "telephone", "email_parent", "prenom_enfant", "age_enfant", "niveau_galop", "activite", "horaire", "prix_ttc", "date_jour"],
    active: true,
  },
  {
    category: "attestation",
    name: "Attestation de pratique",
    subject: "",
    body: `ATTESTATION DE PRATIQUE ÉQUESTRE

Je soussigné(e), responsable du Centre Équestre d'Agon-Coutainville, atteste que {{prenom_enfant}} a suivi des cours d'équitation au sein de notre établissement.

Niveau atteint : {{niveau_galop}}
Période : Saison {{annee}}

Fait à Agon-Coutainville, le {{date_jour}}

Signature et cachet :`,
    variables: ["prenom_enfant", "niveau_galop", "annee", "date_jour"],
    active: true,
  },
];

export default function DocumentsPage() {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<DocCategory | "all">("all");
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState({
    category: "email" as DocCategory,
    name: "",
    subject: "",
    body: "",
    active: true,
  });

  const fetchData = async () => {
    try {
      const snap = await getDocs(collection(db, "doc_templates"));
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate));

      // Si aucun template, initialiser avec les défauts
      if (docs.length === 0) {
        for (const t of defaultTemplates) {
          await addDoc(collection(db, "doc_templates"), { ...t, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        const snap2 = await getDocs(collection(db, "doc_templates"));
        docs = snap2.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate));
      }

      setTemplates(docs);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = templates.filter(t => {
    if (filterCat !== "all" && t.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
    }
    return true;
  });

  // Extract variables from body
  const extractVars = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, "")))];
  };

  const saveTemplate = async () => {
    setSaving(true);
    const variables = extractVars(form.body + " " + form.subject);
    try {
      if (editingId) {
        await updateDoc(doc(db, "doc_templates", editingId), { ...form, variables, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "doc_templates"), { ...form, variables, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ category: "email", name: "", subject: "", body: "", active: true });
      fetchData();
    } catch (e) { console.error(e); alert("Erreur"); }
    setSaving(false);
  };

  const deleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Supprimer le modèle "${name}" ?`)) return;
    await deleteDoc(doc(db, "doc_templates", id));
    fetchData();
  };

  const duplicateTemplate = async (t: DocTemplate) => {
    await addDoc(collection(db, "doc_templates"), {
      category: t.category, name: t.name + " (copie)", subject: t.subject,
      body: t.body, variables: t.variables, active: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    fetchData();
  };

  const editTemplate = (t: DocTemplate) => {
    setForm({ category: t.category, name: t.name, subject: t.subject, body: t.body, active: t.active });
    setEditingId(t.id);
    setShowForm(true);
  };

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Documents personnalisables</h1>
          <p className="font-body text-xs text-gray-400">Modèles de mails, fiches d&apos;inscription, attestations, courriers</p>
        </div>
        <button onClick={() => { setForm({ category: "email", name: "", subject: "", body: "", active: true }); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <Plus size={16} /> Nouveau modèle
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(Object.entries(categoryLabels) as [DocCategory, { label: string; color: string }][]).map(([cat, { label, color }]) => {
          const count = templates.filter(t => t.category === cat).length;
          return (
            <Card key={cat} padding="sm" className="cursor-pointer hover:shadow-sm transition-all" onClick={() => setFilterCat(filterCat === cat ? "all" : cat)}>
              <div className={`font-body text-xl font-bold ${filterCat === cat ? "text-blue-500" : "text-gray-600"}`}>{count}</div>
              <div className="font-body text-xs text-gray-400">{label}{count > 1 ? "s" : ""}</div>
            </Card>
          );
        })}
      </div>

      {/* Search & filter */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input type="text" placeholder="Rechercher un modèle…" value={search} onChange={e => setSearch(e.target.value)}
            className={`${inputStyle} !pl-9`} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} className={`${inputStyle} !w-auto`}>
          <option value="all">Toutes catégories</option>
          {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Templates list */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
            <FileText size={28} className="text-blue-300" />
          </div>
          <p className="font-body text-sm text-gray-500">Aucun modèle trouvé.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(t => {
            const cat = categoryLabels[t.category];
            const isPreview = previewId === t.id;
            return (
              <Card key={t.id} padding="md">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    t.category === "email" ? "bg-blue-50" : t.category === "inscription" ? "bg-green-50" : t.category === "attestation" ? "bg-purple-50" : "bg-orange-50"
                  }`}>
                    {t.category === "email" ? <Mail size={18} className="text-blue-500" /> :
                     t.category === "inscription" ? <ClipboardList size={18} className="text-green-600" /> :
                     <FileText size={18} className="text-purple-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-sm font-semibold text-blue-800">{t.name}</span>
                      <Badge color={cat.color}>{cat.label}</Badge>
                      {!t.active && <Badge color="gray">Inactif</Badge>}
                    </div>
                    {t.subject && <div className="font-body text-xs text-gray-400 mt-0.5">Objet : {t.subject}</div>}
                    <div className="font-body text-xs text-gray-300 mt-0.5">
                      {(t.variables || []).length} variable{(t.variables || []).length > 1 ? "s" : ""} : {(t.variables || []).map(v => `{{${v}}}`).join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPreviewId(isPreview ? null : t.id)}
                      className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none" title="Aperçu">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => duplicateTemplate(t)}
                      className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none" title="Dupliquer">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => editTemplate(t)}
                      className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none" title="Modifier">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => deleteTemplate(t.id, t.name)}
                      className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer border-none" title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* Preview */}
                {isPreview && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <pre className="font-body text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">{t.body}</pre>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Modal : Créer/Modifier ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">{editingId ? "Modifier le modèle" : "Nouveau modèle"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Catégorie</label>
                  <select className={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value as DocCategory })}>
                    {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Nom du modèle *</label>
                  <input className={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Confirmation stage" />
                </div>
              </div>

              {form.category === "email" && (
                <div>
                  <label className={labelStyle}>Objet de l&apos;email</label>
                  <input className={inputStyle} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                    placeholder="Ex: Confirmation d'inscription — {{activite}}" />
                </div>
              )}

              <div>
                <label className={labelStyle}>Contenu du document</label>
                <textarea className={`${inputStyle} !h-64 resize-none font-mono text-xs`} value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  placeholder="Utilisez {{variable}} pour insérer des données dynamiques..." />
              </div>

              {/* Variables disponibles */}
              <div>
                <label className={labelStyle}>Variables disponibles (cliquez pour insérer)</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map(v => (
                    <button key={v.name} type="button"
                      onClick={() => setForm({ ...form, body: form.body + `{{${v.name}}}` })}
                      className="font-body text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-600 border-none cursor-pointer hover:bg-blue-100 transition-colors"
                      title={v.label}>
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detected variables */}
              {form.body && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="font-body text-[10px] text-gray-400 uppercase tracking-wider mb-1">Variables détectées</div>
                  <div className="flex flex-wrap gap-1">
                    {extractVars(form.body + " " + form.subject).map(v => (
                      <Badge key={v} color="blue">{`{{${v}}}`}</Badge>
                    ))}
                    {extractVars(form.body + " " + form.subject).length === 0 && (
                      <span className="font-body text-xs text-gray-400">Aucune variable</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowForm(false)}
                className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={saveTemplate} disabled={saving || !form.name.trim() || !form.body.trim()}
                className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer
                  ${(saving || !form.name.trim()) ? "opacity-50" : "hover:bg-blue-600"}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingId ? "Enregistrer" : "Créer le modèle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
