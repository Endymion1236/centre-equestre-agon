"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Plus, Search, FileText, Mail, Edit3, Trash2, X, Save, Copy, Eye } from "lucide-react";

interface DocTemplate { id: string; name: string; category: string; subject: string; body: string; variables: string[]; active: boolean; createdAt: any; updatedAt: any; }

const categories = [
  { id: "email", label: "Email", color: "blue" as const },
  { id: "inscription", label: "Fiche inscription", color: "green" as const },
  { id: "certificat", label: "Certificat", color: "purple" as const },
  { id: "relance", label: "Relance", color: "orange" as const },
  { id: "info", label: "Information", color: "gray" as const },
];

const availableVariables = [
  { key: "{{nom_parent}}", label: "Nom du parent", example: "Dupont Marie" },
  { key: "{{prenom_enfant}}", label: "Prenom enfant", example: "Lucas" },
  { key: "{{email}}", label: "Email", example: "parent@email.fr" },
  { key: "{{telephone}}", label: "Telephone", example: "06 12 34 56 78" },
  { key: "{{activite}}", label: "Activite", example: "Stage Galop Bronze" },
  { key: "{{date_activite}}", label: "Date activite", example: "14 avril 2026" },
  { key: "{{horaire}}", label: "Horaire", example: "10h - 12h" },
  { key: "{{prix}}", label: "Prix TTC", example: "175.00 EUR" },
  { key: "{{moniteur}}", label: "Moniteur", example: "Emmeline" },
  { key: "{{galop}}", label: "Niveau galop", example: "Galop Bronze" },
  { key: "{{date_jour}}", label: "Date du jour", example: new Date().toLocaleDateString("fr-FR") },
];

const defaultTemplates = [
  { name: "Confirmation de reservation", category: "email", subject: "Confirmation - {{activite}}", body: "Bonjour {{nom_parent}},\n\nNous confirmons la reservation de {{prenom_enfant}} pour :\n\nActivite : {{activite}}\nDate : {{date_activite}}\nHoraire : {{horaire}}\nMoniteur : {{moniteur}}\nPrix : {{prix}}\n\nMerci de vous presenter 15 minutes avant avec des bottes ou chaussures fermees, un pantalon long et une bombe.\n\nA bientot !\nCentre Equestre d'Agon-Coutainville\n02 44 84 99 96", active: true },
  { name: "Fiche inscription annuelle", category: "inscription", subject: "Inscription {{prenom_enfant}}", body: "FICHE D'INSCRIPTION\nCentre Equestre d'Agon-Coutainville\n\nCAVALIER\nNom : {{prenom_enfant}}\nNiveau : {{galop}}\n\nRESPONSABLE LEGAL\nNom : {{nom_parent}}\nEmail : {{email}}\nTel : {{telephone}}\n\nACTIVITE\n{{activite}} - {{horaire}}\n\nDOCUMENTS A JOINDRE\n[ ] Certificat medical\n[ ] Attestation responsabilite civile\n[ ] Reglement interieur signe\n\nREGLEMENT\nMontant : {{prix}}\nMode : [ ] CB [ ] Cheque [ ] Especes [ ] 3x [ ] 10x\n\nDate : {{date_jour}}\nSignature :", active: true },
  { name: "Relance impaye", category: "relance", subject: "Rappel de paiement - {{prix}}", body: "Bonjour {{nom_parent}},\n\nNous vous rappelons qu'un solde de {{prix}} reste en attente pour {{prenom_enfant}}.\n\nPrestation : {{activite}}\n\nMerci de regulariser votre situation :\n- Sur place (CB, cheque, especes)\n- Par virement\n\nCordialement,\nCentre Equestre d'Agon-Coutainville\n02 44 84 99 96", active: true },
];

export default function DocumentsPage() {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [form, setForm] = useState({ name: "", category: "email", subject: "", body: "", active: true });

  const fetchData = async () => { try { const snap = await getDocs(collection(db, "doc_templates")); setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate))); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { fetchData(); }, []);

  const filtered = templates.filter(t => { if (filterCat !== "all" && t.category !== filterCat) return false; if (search) return t.name.toLowerCase().includes(search.toLowerCase()); return true; });

  const saveTemplate = async () => { setSaving(true); try { const vars = (form.body.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/\{|\}/g, "")); const data = { ...form, variables: vars, updatedAt: serverTimestamp() }; if (editingId) { await updateDoc(doc(db, "doc_templates", editingId), data); } else { await addDoc(collection(db, "doc_templates"), { ...data, createdAt: serverTimestamp() }); } setShowForm(false); setEditingId(null); setForm({ name: "", category: "email", subject: "", body: "", active: true }); fetchData(); } catch (e) { console.error(e); } setSaving(false); };
  const deleteTemplate = async (id: string, name: string) => { if (!confirm("Supprimer \"" + name + "\" ?")) return; await deleteDoc(doc(db, "doc_templates", id)); fetchData(); };
  const editTemplate = (t: DocTemplate) => { setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body, active: t.active }); setEditingId(t.id); setShowForm(true); };
  const duplicateTemplate = (t: DocTemplate) => { setForm({ name: t.name + " (copie)", category: t.category, subject: t.subject, body: t.body, active: true }); setEditingId(null); setShowForm(true); };
  const previewTemplate = (t: DocTemplate) => { let c = t.body; availableVariables.forEach(v => { c = c.replaceAll(v.key, v.example); }); setPreviewContent(c); setShowPreview(true); };
  const initDefaults = async () => { if (!confirm("Creer les modeles par defaut ?")) return; setSaving(true); for (const tpl of defaultTemplates) { await addDoc(collection(db, "doc_templates"), { ...tpl, variables: (tpl.body.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/\{|\}/g, "")), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); } setSaving(false); fetchData(); };

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (<div>
    <div className="flex justify-between items-center mb-6">
      <div><h1 className="font-display text-2xl font-bold text-blue-800">Documents personnalisables</h1><p className="font-body text-xs text-gray-400">Modeles de mails, fiches d&apos;inscription, certificats avec variables dynamiques</p></div>
      <div className="flex gap-2">
        {templates.length === 0 && <button onClick={initDefaults} disabled={saving} className="flex items-center gap-2 font-body text-sm text-blue-500 bg-blue-50 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">{saving ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Modeles par defaut</button>}
        <button onClick={() => { setForm({ name: "", category: "email", subject: "", body: "", active: true }); setEditingId(null); setShowForm(true); }} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600"><Plus size={16} /> Nouveau</button>
      </div>
    </div>

    <div className="flex flex-wrap gap-3 mb-5">
      <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" /><input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className={`${inputStyle} !pl-9`} /></div>
      <div className="flex gap-1.5">
        <button onClick={() => setFilterCat("all")} className={`font-body text-sm px-3 py-2 rounded-lg border cursor-pointer ${filterCat === "all" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>Tous</button>
        {categories.map(c => <button key={c.id} onClick={() => setFilterCat(c.id)} className={`font-body text-sm px-3 py-2 rounded-lg border cursor-pointer ${filterCat === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{c.label}</button>)}
      </div>
    </div>

    {filtered.length === 0 ? (
      <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><FileText size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucun modele. Cliquez sur &quot;Modeles par defaut&quot; pour commencer.</p></Card>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => { const cat = categories.find(c => c.id === t.category); return (
          <Card key={t.id} padding="md" className="flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.category === "email" ? "bg-blue-50" : t.category === "inscription" ? "bg-green-50" : t.category === "relance" ? "bg-orange-50" : "bg-purple-50"}`}>
                  {t.category === "email" ? <Mail size={16} className="text-blue-500" /> : <FileText size={16} className="text-gray-500" />}
                </div>
                <Badge color={cat?.color || "gray"}>{cat?.label || t.category}</Badge>
              </div>
            </div>
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-1">{t.name}</h3>
            {t.subject && <p className="font-body text-xs text-gray-400 mb-2">Objet : {t.subject}</p>}
            <p className="font-body text-xs text-gray-400 mb-3 flex-1">{t.body.slice(0, 100)}...</p>
            <div className="flex flex-wrap gap-1 mb-3">{(t.variables || []).slice(0, 5).map(v => <span key={v} className="font-body text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{`{{${v}}}`}</span>)}</div>
            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <button onClick={() => previewTemplate(t)} className="flex items-center gap-1 font-body text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-100"><Eye size={12} /> Apercu</button>
              <button onClick={() => editTemplate(t)} className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100"><Edit3 size={12} /> Modifier</button>
              <button onClick={() => duplicateTemplate(t)} className="flex items-center gap-1 font-body text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-100"><Copy size={12} /> Copier</button>
              <button onClick={() => deleteTemplate(t.id, t.name)} className="flex items-center gap-1 font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100 ml-auto"><Trash2 size={12} /></button>
            </div>
          </Card>
        ); })}
      </div>
    )}

    {showForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={() => setShowForm(false)}>
        <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center p-5 border-b border-gray-100">
            <h2 className="font-display text-lg font-bold text-blue-800">{editingId ? "Modifier" : "Nouveau modele"}</h2>
            <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelStyle}>Nom *</label><input className={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Confirmation stage" /></div>
              <div><label className={labelStyle}>Categorie</label><select className={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            </div>
            <div><label className={labelStyle}>Objet (emails)</label><input className={inputStyle} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ex: Confirmation - {{activite}}" /></div>
            <div>
              <label className={labelStyle}>Variables — cliquez pour inserer</label>
              <div className="flex flex-wrap gap-1.5 mb-2">{availableVariables.map(v => <button key={v.key} onClick={() => setForm({ ...form, body: form.body + v.key })} type="button" className="font-body text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded-md border-none cursor-pointer hover:bg-blue-100" title={v.label}>{v.key}</button>)}</div>
            </div>
            <div><label className={labelStyle}>Contenu *</label><textarea className={`${inputStyle} !h-64 resize-y font-mono text-xs`} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Redigez votre modele ici..." /></div>
          </div>
          <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
            <button onClick={() => setShowForm(false)} className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
            <button onClick={saveTemplate} disabled={saving || !form.name || !form.body} className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 ${(saving || !form.name || !form.body) ? "opacity-50" : ""}`}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer</button>
          </div>
        </div>
      </div>
    )}

    {showPreview && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12" onClick={() => setShowPreview(false)}>
        <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center p-5 border-b border-gray-100">
            <h2 className="font-display text-lg font-bold text-blue-800">Apercu</h2>
            <button onClick={() => setShowPreview(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
          </div>
          <div className="p-5"><pre className="font-body text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">{previewContent}</pre></div>
        </div>
      </div>
    )}
  </div>);
}
