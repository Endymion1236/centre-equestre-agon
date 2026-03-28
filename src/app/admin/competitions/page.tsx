"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Plus, Trash2, Send, Loader2, X, ChevronDown, ChevronUp, FileText, Users, Euro } from "lucide-react";

const DISCIPLINES: Record<string, { label: string; color: string }> = {
  pony_games: { label: "Pony Games", color: "#F0A010" },
  cso:        { label: "CSO",        color: "#2050A0" },
  equifun:    { label: "Équifun",    color: "#16a34a" },
  endurance:  { label: "Endurance",  color: "#dc2626" },
};

const FORMATIONS = [
  { key: "paire",   label: "Paire",      size: 2 },
  { key: "trio",    label: "Trio",       size: 3 },
  { key: "equipe4", label: "Équipe (4)", size: 4 },
  { key: "equipe5", label: "Équipe (5)", size: 5 },
];

const inp = "w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

export default function CompetitionsPage() {
  const { setAgentContext } = useAgentContext("competitions");
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [epreuveSettings, setEpreuveSettings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [facturation, setFacturation] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState({ creneauId: "", discipline: "pony_games", lieu: "", moniteur: "", nbSessions: 1, droitInscription: 0, epreuvesSelectionnees: [] as string[] });
  const [equipe, setEquipe] = useState<any[]>([]);
  const [groupes, setGroupes] = useState<{ nom: string; formation: string; membres: string[] }[]>([]);
  const [showAddCav, setShowAddCav] = useState(false);
  const [showAddGroupe, setShowAddGroupe] = useState(false);
  const [cavForm, setCavForm] = useState({ familyId: "", childId: "", childName: "", poney: "", passages: 1, epreuves: [] as string[] });
  const [groupeForm, setGroupeForm] = useState<{ nom: string; formation: string; membres: string[] }>({ nom: "", formation: "paire", membres: [] });
  const [familySearch, setFamilySearch] = useState("");

  const fetchData = async () => {
    const [compSnap, famSnap, crSnap, settSnap] = await Promise.all([
      getDocs(query(collection(db, "competitions"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "families")),
      getDocs(collection(db, "creneaux")),
      getDoc(doc(db, "settings", "competitions")),
    ]);
    const comps = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCompetitions(comps);
    setFamilies(famSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const allCr = crSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    setCreneaux(allCr.filter(c => c.activityType === "competition"));
    if (settSnap.exists()) setEpreuveSettings(settSnap.data() as any);
    setLoading(false);
    setAgentContext({ module_actif: "competitions", nb_competitions: comps.length });
  };
  useEffect(() => { fetchData(); }, []);

  const epreuvesDiscipline = epreuveSettings[form.discipline] || [];
  const isPonyGames = form.discipline === "pony_games";
  const filteredFams = familySearch ? families.filter(f => (f.parentName || "").toLowerCase().includes(familySearch.toLowerCase())) : [];

  const handleSave = async () => {
    if (!form.discipline) return;
    setSaving(true);
    try {
      const cr = creneaux.find(c => c.id === form.creneauId);
      await addDoc(collection(db, "competitions"), {
        creneauId: form.creneauId || null,
        activityTitle: cr?.activityTitle || `${DISCIPLINES[form.discipline].label}${form.lieu ? ` — ${form.lieu}` : ""}`,
        date: cr?.date || "",
        startTime: cr?.startTime || "",
        discipline: form.discipline,
        disciplineLabel: DISCIPLINES[form.discipline].label,
        lieu: form.lieu, moniteur: form.moniteur,
        nbSessions: form.nbSessions,
        droitInscription: form.droitInscription,
        epreuvesSelectionnees: form.epreuvesSelectionnees,
        equipe, groupes: isPonyGames ? groupes : [],
        status: "draft", facture: false,
        createdAt: serverTimestamp(),
      });
      await fetchData();
      setShowForm(false); setEquipe([]); setGroupes([]);
      setForm({ creneauId: "", discipline: "pony_games", lieu: "", moniteur: "", nbSessions: 1, droitInscription: 0, epreuvesSelectionnees: [] });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleFacturer = async (comp: any) => {
    if (!comp.droitInscription || comp.droitInscription <= 0) { alert("Aucun droit d'inscription défini."); return; }
    setFacturation(comp.id);
    try {
      const parFamille: Record<string, { name: string; cavaliers: string[]; total: number }> = {};
      for (const cav of (comp.equipe || [])) {
        if (!cav.familyId) continue;
        if (!parFamille[cav.familyId]) {
          const fam = families.find(f => f.id === cav.familyId);
          parFamille[cav.familyId] = { name: fam?.parentName || "—", cavaliers: [], total: 0 };
        }
        parFamille[cav.familyId].cavaliers.push(cav.childName);
        parFamille[cav.familyId].total += comp.droitInscription;
      }
      let nb = 0;
      for (const [famId, data] of Object.entries(parFamille)) {
        await addDoc(collection(db, "payments"), {
          familyId: famId, familyName: data.name,
          items: data.cavaliers.map(name => ({
            activityTitle: `Droit d'inscription — ${comp.disciplineLabel} (${name})`,
            childName: name, activityType: "competition",
            priceHT: Math.round(comp.droitInscription / 1.055 * 100) / 100,
            tva: 5.5, priceTTC: comp.droitInscription,
          })),
          totalTTC: data.total, paidAmount: 0, status: "pending",
          source: "competition", competitionId: comp.id,
          date: serverTimestamp(),
        });
        nb++;
      }
      await updateDoc(doc(db, "competitions", comp.id), { facture: true, factureLe: new Date().toISOString() });
      await fetchData();
      alert(`✅ ${nb} paiement${nb > 1 ? "s" : ""} créé${nb > 1 ? "s" : ""} dans Paiements → Impayés`);
    } catch (e) { console.error(e); }
    setFacturation(null);
  };

  const handleSendConvocations = async (comp: any) => {
    setSending(comp.id);
    let sent = 0;
    for (const cav of (comp.equipe || [])) {
      const fam = families.find(f => f.id === cav.familyId);
      if (!fam?.parentEmail) continue;
      const groupe = (comp.groupes || []).find((g: any) => g.membres?.includes(cav.childId));
      const passagesStr = `${cav.passages} passage${cav.passages > 1 ? "s" : ""}`;
      const epreuvesStr = (cav.epreuves || []).join(", ") || "À définir";
      try {
        await fetch("/api/send-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: fam.parentEmail,
            subject: `🏆 Convocation — ${comp.disciplineLabel} du ${comp.date ? new Date(comp.date).toLocaleDateString("fr-FR") : "—"}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <div style="background:#0C1A2E;padding:20px;border-radius:12px 12px 0 0;">
                <h1 style="color:#F0A010;margin:0;font-size:20px;">🏆 Convocation officielle</h1>
                <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">${comp.disciplineLabel}</p>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p>Bonjour <strong>${fam.parentName}</strong>,</p>
                <p><strong>${cav.childName}</strong> est sélectionné(e) :</p>
                <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #F0A010;">
                  ${comp.date ? `<p style="margin:0 0 6px;font-weight:600;color:#1e3a5f;">📅 ${new Date(comp.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</p>` : ""}
                  ${comp.startTime ? `<p style="margin:4px 0;color:#555;font-size:13px;">🕐 ${comp.startTime}</p>` : ""}
                  ${comp.lieu ? `<p style="margin:4px 0;color:#555;font-size:13px;">📍 ${comp.lieu}</p>` : ""}
                  <p style="margin:4px 0;color:#555;font-size:13px;">🐴 Poney : <strong>${cav.poney || "À affecter"}</strong></p>
                  <p style="margin:4px 0;color:#555;font-size:13px;">⏱️ ${passagesStr}</p>
                  ${epreuvesStr !== "À définir" ? `<p style="margin:4px 0;color:#555;font-size:13px;">🎯 Épreuves : ${epreuvesStr}</p>` : ""}
                  ${groupe ? `<p style="margin:4px 0;color:#F0A010;font-weight:600;font-size:13px;">👥 ${groupe.nom} (${FORMATIONS.find(f => f.key === groupe.formation)?.label || groupe.formation})</p>` : ""}
                </div>
                ${comp.moniteur ? `<p style="color:#555;font-size:13px;">👨‍🏫 Moniteur : <strong>${comp.moniteur}</strong></p>` : ""}
                ${comp.droitInscription > 0 ? `<div style="background:#fef3c7;border-radius:8px;padding:12px;margin-top:12px;"><p style="margin:0;color:#92400e;font-size:13px;">💶 Droit d'inscription : <strong>${comp.droitInscription}€</strong></p></div>` : ""}
                <p style="margin-top:16px;color:#555;">En cas d'empêchement, contactez-nous rapidement. Bonne chance ! 🤞</p>
              </div>
            </div>`,
          }),
        });
        sent++;
      } catch (e) { console.error(e); }
    }
    await updateDoc(doc(db, "competitions", comp.id), { status: "convoque", convoqueLe: new Date().toISOString() });
    await fetchData();
    setSending(null);
    alert(`✅ ${sent} convocation${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}`);
  };

  const exportPDF = (comp: any) => {
    const lignesCav = (comp.equipe || []).map((cav: any, i: number) => {
      const groupe = (comp.groupes || []).find((g: any) => g.membres?.includes(cav.childId));
      return `<tr><td>${i+1}</td><td><strong>${cav.childName}</strong></td><td>${cav.poney||"—"}</td><td>${cav.passages||1} passage${(cav.passages||1)>1?"s":""}</td><td>${groupe?`${groupe.nom} (${FORMATIONS.find(f=>f.key===groupe.formation)?.label||""})` :"—"}</td><td>${(cav.epreuves||[]).join(", ")||"—"}</td></tr>`;
    }).join("");
    const lignesGroupes = (comp.groupes||[]).map((g: any) => {
      const membres = (g.membres||[]).map((id: string) => (comp.equipe||[]).find((c:any)=>c.childId===id)?.childName||id).join(", ");
      return `<tr><td><strong>${g.nom}</strong></td><td>${FORMATIONS.find(f=>f.key===g.formation)?.label||g.formation}</td><td>${membres}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Feuille de route — ${comp.disciplineLabel}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#1e3a5f;}h1{font-size:18px;color:#0C1A2E;margin-bottom:2px;}h2{font-size:13px;font-weight:600;color:#475569;margin:20px 0 8px;}.meta{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#555;}table{width:100%;border-collapse:collapse;margin-bottom:16px;}th{background:#0C1A2E;color:white;padding:7px 10px;text-align:left;font-size:11px;}td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}tr:nth-child(even) td{background:#f8fafc;}.footer{margin-top:20px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;}@media print{body{margin:8px;}}</style>
    </head><body>
    <h1>🏆 Feuille de route — ${comp.disciplineLabel}</h1>
    <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;">Centre Équestre d'Agon-Coutainville</p>
    <div class="meta">
      ${comp.date?`<span>📅 ${new Date(comp.date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>`:""}
      ${comp.startTime?`<span>🕐 ${comp.startTime}</span>`:""}
      ${comp.lieu?`<span>📍 ${comp.lieu}</span>`:""}
      ${comp.moniteur?`<span>👨‍🏫 ${comp.moniteur}</span>`:""}
      <span>⏱️ ${comp.nbSessions} session${comp.nbSessions>1?"s":""}</span>
      <span>👥 ${(comp.equipe||[]).length} cavalier${(comp.equipe||[]).length>1?"s":""}</span>
    </div>
    <h2>Cavaliers</h2>
    <table><thead><tr><th>#</th><th>Cavalier</th><th>Poney</th><th>Passages</th><th>Groupe</th><th>Épreuves</th></tr></thead>
    <tbody>${lignesCav||"<tr><td colspan='6' style='text-align:center;color:#999'>Aucun cavalier</td></tr>"}</tbody></table>
    ${(comp.groupes||[]).length>0?`<h2>Groupes / Équipes</h2><table><thead><tr><th>Groupe</th><th>Formation</th><th>Membres</th></tr></thead><tbody>${lignesGroupes}</tbody></table>`:""}
    <div class="footer">Imprimé le ${new Date().toLocaleDateString("fr-FR")} — ${comp.disciplineLabel}</div>
    </body></html>`;
    const w = window.open("","_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(()=>w.print(),300); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Compétitions</h1>
          <p className="font-body text-sm text-slate-500 mt-1">Équipes · Passages · Groupes · Convocations · Facturation</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16}/> Nouvelle
        </button>
      </div>

      {showForm && (
        <Card padding="md" className="mb-6 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouvelle compétition</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
          <div className="flex flex-col gap-4">

            {/* Créneau */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Créneau planning (optionnel)</label>
              <select value={form.creneauId} onChange={e => setForm(f => ({...f, creneauId: e.target.value}))} className={inp}>
                <option value="">— Sans créneau lié —</option>
                {creneaux.map(c => <option key={c.id} value={c.id}>{c.date} {c.startTime} — {c.activityTitle}</option>)}
              </select>
              {creneaux.length === 0 && <p className="font-body text-xs text-orange-500 mt-1">⚠️ Créez un créneau type "Compétition" dans le Planning pour le lier.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Discipline *</label>
                <select value={form.discipline} onChange={e => setForm(f => ({...f, discipline: e.target.value, epreuvesSelectionnees: []}))} className={inp}>
                  {Object.entries(DISCIPLINES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Sessions (par cavalier)</label>
                <select value={form.nbSessions} onChange={e => setForm(f => ({...f, nbSessions: parseInt(e.target.value)}))} className={inp}>
                  {[1,2,3,4].map(n => <option key={n} value={n}>{n} session{n>1?"s":""}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Lieu</label>
                <input value={form.lieu} onChange={e => setForm(f => ({...f, lieu: e.target.value}))} placeholder="Ex: Haras de la Potardière" className={inp}/>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Moniteur responsable</label>
                <input value={form.moniteur} onChange={e => setForm(f => ({...f, moniteur: e.target.value}))} placeholder="Ex: Emmeline" className={inp}/>
              </div>
            </div>

            {/* Droit d'inscription */}
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Euro size={16} className="text-amber-600 flex-shrink-0"/>
              <div className="flex items-center gap-3 flex-1">
                <span className="font-body text-sm font-semibold text-amber-800">Droit d'inscription / cavalier</span>
                <input type="number" min="0" step="0.5" value={form.droitInscription}
                  onChange={e => setForm(f => ({...f, droitInscription: parseFloat(e.target.value)||0}))}
                  className="w-20 px-3 py-1.5 rounded-lg border border-amber-200 font-body text-sm bg-white text-right focus:outline-none"/>
                <span className="font-body text-sm text-amber-700">€</span>
                <span className="font-body text-xs text-amber-500">(0 = gratuit)</span>
              </div>
            </div>

            {/* Épreuves */}
            {epreuvesDiscipline.length > 0 && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Épreuves de la compétition</label>
                <div className="flex flex-wrap gap-2">
                  {epreuvesDiscipline.map(ep => (
                    <button key={ep} onClick={() => setForm(f => ({...f, epreuvesSelectionnees: f.epreuvesSelectionnees.includes(ep) ? f.epreuvesSelectionnees.filter(x=>x!==ep) : [...f.epreuvesSelectionnees, ep]}))}
                      className={`px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer transition-all ${form.epreuvesSelectionnees.includes(ep) ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold" : "border-gray-200 bg-white text-slate-500"}`}>
                      {ep}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cavaliers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-body text-xs font-semibold text-blue-800">Équipe ({equipe.length} cavalier{equipe.length>1?"s":""})</label>
                <button onClick={() => setShowAddCav(!showAddCav)} className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                  <Plus size={12}/> Ajouter
                </button>
              </div>
              {showAddCav && (
                <div className="border border-blue-100 rounded-xl p-3 mb-3 bg-blue-50/30 flex flex-col gap-3">
                  <input value={familySearch} onChange={e => { setFamilySearch(e.target.value); setCavForm(f => ({...f, familyId:"", childId:"", childName:""})); }} placeholder="Rechercher une famille..." className={inp}/>
                  {familySearch && !cavForm.childId && filteredFams.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-40 overflow-y-auto">
                      {filteredFams.slice(0,5).map((f:any) => (f.children||[]).map((ch:any) => (
                        <button key={ch.id} onClick={() => { setCavForm(prev => ({...prev, familyId:f.id, childId:ch.id, childName:`${ch.firstName} ${ch.lastName||""}`.trim()})); setFamilySearch(`${f.parentName} — ${ch.firstName}`); }}
                          className="w-full text-left px-3 py-2 font-body text-sm hover:bg-blue-50 bg-white border-none cursor-pointer border-b border-gray-100">
                          <span className="font-semibold text-blue-800">{ch.firstName} {ch.lastName||""}</span>
                          <span className="text-slate-400 text-xs ml-2">— {f.parentName}</span>
                        </button>
                      )))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Poney</label>
                      <input value={cavForm.poney} onChange={e => setCavForm(f => ({...f, poney:e.target.value}))} placeholder="Ex: El Pepe" className={inp}/>
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Nombre de passages</label>
                      <select value={cavForm.passages} onChange={e => setCavForm(f => ({...f, passages:parseInt(e.target.value)}))} className={inp}>
                        {[1,2,3,4].map(n => <option key={n} value={n}>{n} passage{n>1?"s":""}</option>)}
                      </select>
                    </div>
                  </div>
                  {form.epreuvesSelectionnees.length > 0 && (
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Épreuves de ce cavalier</label>
                      <div className="flex flex-wrap gap-1.5">
                        {form.epreuvesSelectionnees.map(ep => (
                          <button key={ep} onClick={() => setCavForm(f => ({...f, epreuves: f.epreuves.includes(ep)?f.epreuves.filter(x=>x!==ep):[...f.epreuves,ep]}))}
                            className={`px-2.5 py-1 rounded-lg border font-body text-xs cursor-pointer ${cavForm.epreuves.includes(ep)?"border-green-500 bg-green-50 text-green-700":"border-gray-200 bg-white text-slate-500"}`}>
                            {ep}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button disabled={!cavForm.childId} onClick={() => { if(!cavForm.childId)return; setEquipe(prev=>[...prev,{...cavForm}]); setCavForm({familyId:"",childId:"",childName:"",poney:"",passages:1,epreuves:[]}); setFamilySearch(""); setShowAddCav(false); }}
                    className="py-2 rounded-lg font-body text-sm font-semibold text-white bg-green-500 border-none cursor-pointer disabled:opacity-50">✓ Ajouter à l'équipe</button>
                </div>
              )}
              {equipe.length > 0 && (
                <div className="flex flex-col gap-2">
                  {equipe.map((cav, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                      <div>
                        <span className="font-body text-sm font-semibold text-blue-800">{cav.childName}</span>
                        <span className="font-body text-xs text-slate-400 ml-2">🐴 {cav.poney||"—"} · {cav.passages} passage{cav.passages>1?"s":""}</span>
                        {cav.epreuves?.length>0 && <div className="font-body text-[10px] text-slate-400 mt-0.5">🎯 {cav.epreuves.join(", ")}</div>}
                      </div>
                      <button onClick={() => setEquipe(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Groupes Pony Games */}
            {isPonyGames && equipe.length >= 2 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-body text-xs font-semibold text-blue-800">Groupes / Équipes ({groupes.length})</label>
                  <button onClick={() => setShowAddGroupe(!showAddGroupe)} className="flex items-center gap-1 font-body text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                    <Plus size={12}/> Créer un groupe
                  </button>
                </div>
                {showAddGroupe && (
                  <div className="border border-orange-200 rounded-xl p-3 mb-3 bg-orange-50/30 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-body text-[10px] text-slate-500 block mb-1">Nom du groupe</label>
                        <input value={groupeForm.nom} onChange={e => setGroupeForm(f => ({...f, nom:e.target.value}))} placeholder="Ex: Équipe A" className={inp}/>
                      </div>
                      <div>
                        <label className="font-body text-[10px] text-slate-500 block mb-1">Formation</label>
                        <select value={groupeForm.formation} onChange={e => setGroupeForm(f => ({...f, formation:e.target.value}))} className={inp}>
                          {FORMATIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Membres</label>
                      <div className="flex flex-col gap-1.5">
                        {equipe.map((cav, i) => {
                          const deja = groupes.some(g => g.membres?.includes(cav.childId));
                          return (
                            <label key={i} className={`flex items-center gap-2 cursor-pointer ${deja?"opacity-40":""}`}>
                              <input type="checkbox" disabled={deja} checked={groupeForm.membres.includes(cav.childId)}
                                onChange={e => setGroupeForm(f => ({...f, membres: e.target.checked ? [...f.membres, cav.childId] : f.membres.filter(id=>id!==cav.childId)}))}
                                className="accent-orange-500 w-4 h-4"/>
                              <span className="font-body text-sm text-blue-800">{cav.childName}</span>
                              <span className="font-body text-xs text-slate-400">🐴 {cav.poney||"—"}</span>
                              {deja && <span className="font-body text-[10px] text-slate-400">déjà dans un groupe</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <button disabled={!groupeForm.nom || groupeForm.membres.length === 0}
                      onClick={() => { setGroupes(prev=>[...prev, {...groupeForm}]); setGroupeForm({nom:"",formation:"paire",membres:[]}); setShowAddGroupe(false); }}
                      className="py-2 rounded-lg font-body text-sm font-semibold text-white bg-orange-500 border-none cursor-pointer disabled:opacity-50">
                      ✓ Créer le groupe
                    </button>
                  </div>
                )}
                {groupes.map((g, i) => (
                  <div key={i} className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5 mb-2">
                    <div>
                      <span className="font-body text-sm font-semibold text-orange-800">{g.nom}</span>
                      <span className="font-body text-xs text-slate-400 ml-2">{FORMATIONS.find(f=>f.key===g.formation)?.label}</span>
                      <div className="font-body text-[10px] text-slate-400 mt-0.5">{g.membres.map(id=>equipe.find(c=>c.childId===id)?.childName||id).join(", ")}</div>
                    </div>
                    <button onClick={() => setGroupes(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
              <button onClick={handleSave} disabled={!form.discipline || saving}
                className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null} Créer la compétition
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Liste */}
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
      : competitions.length === 0 ? (
        <Card padding="lg" className="text-center"><div className="text-4xl mb-3">🏆</div><p className="font-body text-sm text-slate-500">Aucune compétition enregistrée.</p></Card>
      ) : (
        <div className="flex flex-col gap-4">
          {competitions.map((comp: any) => (
            <Card key={comp.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:DISCIPLINES[comp.discipline]?.color||"#666"}}>{comp.disciplineLabel}</span>
                    <Badge color={comp.status==="convoque"?"green":"gray"}>{comp.status==="convoque"?"Convoqué":"Brouillon"}</Badge>
                    {comp.facture && <Badge color="blue">Facturé</Badge>}
                    <span className="font-body text-xs text-slate-400">{comp.nbSessions} session{comp.nbSessions>1?"s":""}/cavalier</span>
                    {comp.droitInscription>0 && <span className="font-body text-xs text-amber-600 font-semibold">{comp.droitInscription}€/cav.</span>}
                  </div>
                  <div className="font-body text-base font-semibold text-blue-800">{comp.activityTitle}</div>
                  <div className="font-body text-xs text-slate-500 mt-0.5">
                    {comp.date?new Date(comp.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}):"—"}
                    {comp.startTime?` ${comp.startTime}`:""}
                    {comp.lieu?` · 📍 ${comp.lieu}`:""}
                    {comp.moniteur?` · 👨‍🏫 ${comp.moniteur}`:""}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-body text-xs text-slate-400"><Users size={11} className="inline mr-1"/>{(comp.equipe||[]).length} cavalier{(comp.equipe||[]).length>1?"s":""}</span>
                    {(comp.groupes||[]).length>0 && <span className="font-body text-xs text-orange-500">{comp.groupes.length} groupe{comp.groupes.length>1?"s":""}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => exportPDF(comp)} className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-gray-100 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200"><FileText size={12}/> PDF</button>
                  {comp.droitInscription>0 && !comp.facture && (
                    <button onClick={() => handleFacturer(comp)} disabled={facturation===comp.id||(comp.equipe||[]).length===0}
                      className="flex items-center gap-1.5 font-body text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {facturation===comp.id?<Loader2 size={12} className="animate-spin"/>:<Euro size={12}/>} Facturer
                    </button>
                  )}
                  <button onClick={() => handleSendConvocations(comp)} disabled={sending===comp.id||(comp.equipe||[]).length===0}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {sending===comp.id?<Loader2 size={12} className="animate-spin"/>:<Send size={12}/>} Convoquer
                  </button>
                </div>
              </div>

              <button onClick={() => setExpanded(expanded===comp.id?null:comp.id)} className="flex items-center gap-1 font-body text-xs text-slate-400 mt-3 bg-transparent border-none cursor-pointer hover:text-blue-500">
                {expanded===comp.id?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                {expanded===comp.id?"Masquer":"Voir équipe & groupes"}
              </button>

              {expanded===comp.id && (
                <div className="mt-3 pt-3 border-t border-blue-500/8 flex flex-col gap-2">
                  {(comp.equipe||[]).map((cav:any, i:number) => {
                    const groupe = (comp.groupes||[]).find((g:any) => g.membres?.includes(cav.childId));
                    return (
                      <div key={i} className="bg-gray-50 rounded-xl px-3 py-2.5">
                        <div className="font-body text-sm font-semibold text-blue-800">{i+1}. {cav.childName}</div>
                        <div className="font-body text-xs text-slate-400 mt-0.5">🐴 {cav.poney||"—"} · {cav.passages} passage{cav.passages>1?"s":""}
                          {cav.epreuves?.length>0&&<> · 🎯 {cav.epreuves.join(", ")}</>}
                        </div>
                        {groupe && <div className="font-body text-[10px] text-orange-600 mt-0.5">👥 {groupe.nom} ({FORMATIONS.find(f=>f.key===groupe.formation)?.label})</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
