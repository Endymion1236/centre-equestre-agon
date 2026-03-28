"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Plus, Trash2, Send, Check, Loader2, X, ChevronDown, ChevronUp, FileText, Users } from "lucide-react";
import type { Family } from "@/types";

const DISCIPLINES: Record<string, { label: string; color: string }> = {
  pony_games: { label: "Pony Games", color: "#F0A010" },
  cso: { label: "CSO", color: "#2050A0" },
  equifun: { label: "Équifun", color: "#16a34a" },
  endurance: { label: "Endurance", color: "#dc2626" },
};

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

  // Form state
  const [form, setForm] = useState({
    creneauId: "", discipline: "pony_games", lieu: "", moniteur: "", sessions: 1 as 1 | 2,
    epreuvesSelectionnees: [] as string[],
  });
  const [equipe, setEquipe] = useState<any[]>([]);
  const [showAddCavalier, setShowAddCavalier] = useState(false);
  const [cavalierForm, setCavalierForm] = useState({ familyId: "", childId: "", childName: "", poney: "", session: "1" as "1" | "2" | "both", epreuves: [] as string[] });
  const [familySearch, setFamilySearch] = useState("");

  const fetchData = async () => {
    const [compSnap, famSnap, crSnap, settSnap] = await Promise.all([
      getDocs(query(collection(db, "competitions"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "families")),
      getDocs(query(collection(db, "creneaux"), where("activityType", "==", "competition"))),
      getDoc(doc(db, "settings", "competitions")),
    ]);
    const comps = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCompetitions(comps);
    setFamilies(famSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setCreneaux(crSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (settSnap.exists()) setEpreuveSettings(settSnap.data() as any);
    setLoading(false);
    setAgentContext({ module_actif: "competitions", nb_competitions: comps.length });
  };
  useEffect(() => { fetchData(); }, []);

  const selectedCreneau = creneaux.find(c => c.id === form.creneauId);
  const epreuvesDiscipline = epreuveSettings[form.discipline] || [];
  const filteredFams = familySearch
    ? families.filter(f => f.parentName?.toLowerCase().includes(familySearch.toLowerCase()))
    : families;

  const handleSave = async () => {
    if (!form.creneauId || !form.discipline) return;
    setSaving(true);
    try {
      const cr = creneaux.find(c => c.id === form.creneauId);
      await addDoc(collection(db, "competitions"), {
        creneauId: form.creneauId,
        activityTitle: cr?.activityTitle || "Compétition",
        date: cr?.date || "",
        startTime: cr?.startTime || "",
        discipline: form.discipline,
        disciplineLabel: DISCIPLINES[form.discipline]?.label || form.discipline,
        lieu: form.lieu,
        moniteur: form.moniteur,
        sessions: form.sessions,
        epreuvesSelectionnees: form.epreuvesSelectionnees,
        equipe,
        status: "draft",
        createdAt: serverTimestamp(),
      });
      await fetchData();
      setShowForm(false);
      setEquipe([]);
      setForm({ creneauId: "", discipline: "pony_games", lieu: "", moniteur: "", sessions: 1, epreuvesSelectionnees: [] });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSendConvocations = async (comp: any) => {
    setSending(comp.id);
    let sent = 0;
    for (const cav of (comp.equipe || [])) {
      const fam = families.find(f => f.id === cav.familyId);
      if (!fam?.parentEmail) continue;
      const epreuvesStr = (cav.epreuves || []).join(", ") || "À définir";
      const sessionStr = cav.session === "both" ? "Sessions 1 & 2" : `Session ${cav.session}`;
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: fam.parentEmail,
            subject: `🏆 Convocation — ${comp.disciplineLabel} du ${new Date(comp.date).toLocaleDateString("fr-FR")}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <div style="background:#0C1A2E;padding:20px;border-radius:12px 12px 0 0;">
                <h1 style="color:#F0A010;margin:0;font-size:20px;">🏆 Convocation officielle</h1>
                <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">${comp.disciplineLabel}</p>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p>Bonjour <strong>${fam.parentName}</strong>,</p>
                <p><strong>${cav.childName}</strong> est sélectionné(e) pour la compétition suivante :</p>
                <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:0;font-weight:600;color:#1e3a5f;">📅 ${new Date(comp.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</p>
                  <p style="margin:6px 0 0;color:#555;">📍 ${comp.lieu || "Lieu à confirmer"}</p>
                  <p style="margin:6px 0 0;color:#555;">🕐 ${comp.startTime || ""}</p>
                  <p style="margin:6px 0 0;color:#555;">🐴 Poney : <strong>${cav.poney || "À affecter"}</strong></p>
                  <p style="margin:6px 0 0;color:#555;">⏱️ ${sessionStr}</p>
                  <p style="margin:6px 0 0;color:#555;">🎯 Épreuves : ${epreuvesStr}</p>
                </div>
                <p style="color:#555;font-size:13px;">Moniteur responsable : <strong>${comp.moniteur || "—"}</strong></p>
                <p style="color:#555;font-size:13px;">En cas d'empêchement, merci de nous contacter rapidement.</p>
                <p>Bonne chance ! 🤞</p>
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
    const lignes = (comp.equipe || []).map((cav: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${cav.childName}</strong></td>
        <td>${cav.poney || "—"}</td>
        <td>${cav.session === "both" ? "1 & 2" : `Session ${cav.session}`}</td>
        <td>${(cav.epreuves || []).join(", ") || "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
      <title>Feuille de route — ${comp.disciplineLabel}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#1e3a5f;}
        h1{font-size:18px;color:#0C1A2E;}h2{font-size:13px;color:#475569;font-weight:normal;margin-top:4px;}
        .meta{display:flex;gap:24px;margin:16px 0;padding:12px;background:#f8fafc;border-radius:8px;}
        .meta span{font-size:12px;color:#555;}
        table{width:100%;border-collapse:collapse;margin-top:16px;}
        th{background:#0C1A2E;color:white;padding:8px 10px;text-align:left;font-size:11px;}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;}
        tr:nth-child(even) td{background:#f8fafc;}
        @media print{body{margin:10px;}}
      </style></head><body>
      <h1>🏆 Feuille de route — ${comp.disciplineLabel}</h1>
      <h2>Centre Équestre d'Agon-Coutainville</h2>
      <div class="meta">
        <span>📅 ${new Date(comp.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</span>
        <span>📍 ${comp.lieu || "—"}</span>
        <span>🕐 ${comp.startTime || "—"}</span>
        <span>👨‍🏫 ${comp.moniteur || "—"}</span>
        <span>⏱️ ${comp.sessions} session${comp.sessions > 1 ? "s" : ""}</span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Cavalier</th><th>Poney</th><th>Session</th><th>Épreuves</th></tr></thead>
        <tbody>${lignes || "<tr><td colspan='5' style='text-align:center;color:#999'>Aucun cavalier</td></tr>"}</tbody>
      </table>
      <p style="margin-top:24px;font-size:11px;color:#94a3b8;">Imprimé le ${new Date().toLocaleDateString("fr-FR")} — ${(comp.equipe || []).length} cavalier${(comp.equipe || []).length > 1 ? "s" : ""}</p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Compétitions</h1>
          <p className="font-body text-sm text-slate-500 mt-1">Gérez vos équipes, épreuves et convocations</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16}/> Nouvelle compétition
        </button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <Card padding="md" className="mb-6 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouvelle compétition</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
          <div className="flex flex-col gap-4">
            {/* Créneau lié */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Créneau planning *</label>
              <select value={form.creneauId} onChange={e => setForm(f => ({ ...f, creneauId: e.target.value }))} className={inp}>
                <option value="">— Sélectionner un créneau compétition —</option>
                {creneaux.map(c => (
                  <option key={c.id} value={c.id}>{c.date} {c.startTime} — {c.activityTitle}</option>
                ))}
              </select>
              {creneaux.length === 0 && <p className="font-body text-xs text-orange-500 mt-1">⚠️ Créez d'abord un créneau de type "Compétition" dans le Planning.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Discipline */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Discipline *</label>
                <select value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value, epreuvesSelectionnees: [] }))} className={inp}>
                  {Object.entries(DISCIPLINES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {/* Sessions */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Nombre de sessions</label>
                <select value={form.sessions} onChange={e => setForm(f => ({ ...f, sessions: parseInt(e.target.value) as 1 | 2 }))} className={inp}>
                  <option value={1}>1 session</option>
                  <option value={2}>2 sessions</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Lieu</label>
                <input value={form.lieu} onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))} placeholder="Ex: Haras de la Potardière" className={inp}/>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Moniteur responsable</label>
                <input value={form.moniteur} onChange={e => setForm(f => ({ ...f, moniteur: e.target.value }))} placeholder="Ex: Emmeline" className={inp}/>
              </div>
            </div>

            {/* Épreuves */}
            {epreuvesDiscipline.length > 0 && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Épreuves de la compétition</label>
                <div className="flex flex-wrap gap-2">
                  {epreuvesDiscipline.map(ep => (
                    <button key={ep} onClick={() => setForm(f => ({
                      ...f,
                      epreuvesSelectionnees: f.epreuvesSelectionnees.includes(ep)
                        ? f.epreuvesSelectionnees.filter(x => x !== ep)
                        : [...f.epreuvesSelectionnees, ep]
                    }))}
                      className={`px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer transition-all ${
                        form.epreuvesSelectionnees.includes(ep)
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                          : "border-gray-200 bg-white text-slate-500"
                      }`}>
                      {ep}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Équipe */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-body text-xs font-semibold text-blue-800">Équipe ({equipe.length} cavalier{equipe.length > 1 ? "s" : ""})</label>
                <button onClick={() => setShowAddCavalier(!showAddCavalier)}
                  className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                  <Plus size={12}/> Ajouter un cavalier
                </button>
              </div>

              {showAddCavalier && (
                <div className="border border-blue-100 rounded-xl p-3 mb-3 bg-blue-50/30 flex flex-col gap-3">
                  <input value={familySearch} onChange={e => { setFamilySearch(e.target.value); setCavalierForm(f => ({ ...f, familyId: "", childId: "", childName: "" })); }}
                    placeholder="Rechercher une famille..." className={inp}/>
                  {familySearch && !cavalierForm.familyId && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                      {filteredFams.slice(0, 5).map((f: any) => (
                        <div key={f.id}>
                          {(f.children || []).map((ch: any) => (
                            <button key={ch.id} onClick={() => {
                              setCavalierForm(prev => ({ ...prev, familyId: f.id, childId: ch.id, childName: `${ch.firstName} ${ch.lastName || ""}`.trim() }));
                              setFamilySearch(`${f.parentName} — ${ch.firstName}`);
                            }} className="w-full text-left px-3 py-2 font-body text-sm hover:bg-blue-50 bg-white border-none cursor-pointer border-b border-gray-100 last:border-0">
                              <span className="font-semibold text-blue-800">{ch.firstName} {ch.lastName || ""}</span>
                              <span className="text-slate-400 text-xs ml-2">— {f.parentName}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Poney</label>
                      <input value={cavalierForm.poney} onChange={e => setCavalierForm(f => ({ ...f, poney: e.target.value }))} placeholder="Ex: El Pepe" className={inp}/>
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Session(s)</label>
                      <select value={cavalierForm.session} onChange={e => setCavalierForm(f => ({ ...f, session: e.target.value as any }))} className={inp}>
                        <option value="1">Session 1</option>
                        {form.sessions === 2 && <option value="2">Session 2</option>}
                        {form.sessions === 2 && <option value="both">Les deux</option>}
                      </select>
                    </div>
                  </div>
                  {form.epreuvesSelectionnees.length > 0 && (
                    <div>
                      <label className="font-body text-[10px] text-slate-500 block mb-1">Épreuves de ce cavalier</label>
                      <div className="flex flex-wrap gap-1.5">
                        {form.epreuvesSelectionnees.map(ep => (
                          <button key={ep} onClick={() => setCavalierForm(f => ({
                            ...f,
                            epreuves: f.epreuves.includes(ep) ? f.epreuves.filter(x => x !== ep) : [...f.epreuves, ep]
                          }))}
                            className={`px-2.5 py-1 rounded-lg border font-body text-xs cursor-pointer ${cavalierForm.epreuves.includes(ep) ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-slate-500"}`}>
                            {ep}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button disabled={!cavalierForm.childId} onClick={() => {
                    if (!cavalierForm.childId) return;
                    setEquipe(prev => [...prev, { ...cavalierForm }]);
                    setCavalierForm({ familyId: "", childId: "", childName: "", poney: "", session: "1", epreuves: [] });
                    setFamilySearch("");
                    setShowAddCavalier(false);
                  }} className="py-2 rounded-lg font-body text-sm font-semibold text-white bg-green-500 border-none cursor-pointer disabled:opacity-50">
                    ✓ Ajouter à l'équipe
                  </button>
                </div>
              )}

              {equipe.length > 0 && (
                <div className="flex flex-col gap-2">
                  {equipe.map((cav, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                      <div>
                        <span className="font-body text-sm font-semibold text-blue-800">{cav.childName}</span>
                        <span className="font-body text-xs text-slate-400 ml-2">🐴 {cav.poney || "—"} · {cav.session === "both" ? "S1+S2" : `S${cav.session}`}</span>
                        {cav.epreuves?.length > 0 && <div className="font-body text-[10px] text-slate-400 mt-0.5">{cav.epreuves.join(", ")}</div>}
                      </div>
                      <button onClick={() => setEquipe(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
              <button onClick={handleSave} disabled={!form.creneauId || saving}
                className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null}
                Créer la compétition
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Liste des compétitions */}
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
      : competitions.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="font-body text-sm text-slate-500">Aucune compétition. Créez-en une depuis un créneau Planning de type "Compétition".</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {competitions.map((comp: any) => (
            <Card key={comp.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: DISCIPLINES[comp.discipline]?.color || "#666" }}>
                      {comp.disciplineLabel}
                    </span>
                    <Badge color={comp.status === "convoque" ? "green" : "gray"}>
                      {comp.status === "convoque" ? "Convoqué" : "Brouillon"}
                    </Badge>
                    <span className="font-body text-xs text-slate-400">{comp.sessions} session{comp.sessions > 1 ? "s" : ""}</span>
                  </div>
                  <div className="font-body text-base font-semibold text-blue-800">{comp.activityTitle}</div>
                  <div className="font-body text-xs text-slate-500 mt-0.5">
                    {comp.date ? new Date(comp.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }) : "—"}
                    {comp.startTime ? ` · ${comp.startTime}` : ""}
                    {comp.lieu ? ` · 📍 ${comp.lieu}` : ""}
                    {comp.moniteur ? ` · 👨‍🏫 ${comp.moniteur}` : ""}
                  </div>
                  <div className="font-body text-xs text-slate-400 mt-1">
                    <Users size={11} className="inline mr-1"/>{(comp.equipe || []).length} cavalier{(comp.equipe || []).length > 1 ? "s" : ""}
                    {comp.epreuvesSelectionnees?.length > 0 && ` · ${comp.epreuvesSelectionnees.length} épreuve${comp.epreuvesSelectionnees.length > 1 ? "s" : ""}`}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => exportPDF(comp)}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-gray-100 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200">
                    <FileText size={12}/> PDF
                  </button>
                  <button onClick={() => handleSendConvocations(comp)} disabled={sending === comp.id || (comp.equipe || []).length === 0}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {sending === comp.id ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>}
                    Convoquer
                  </button>
                </div>
              </div>

              {/* Équipe dépliable */}
              <button onClick={() => setExpanded(expanded === comp.id ? null : comp.id)}
                className="flex items-center gap-1 font-body text-xs text-slate-400 mt-3 bg-transparent border-none cursor-pointer hover:text-blue-500">
                {expanded === comp.id ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                {expanded === comp.id ? "Masquer l'équipe" : "Voir l'équipe"}
              </button>

              {expanded === comp.id && (comp.equipe || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-500/8">
                  <div className="flex flex-col gap-2">
                    {(comp.equipe || []).map((cav: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                        <div>
                          <span className="font-body text-sm font-semibold text-blue-800">{cav.childName}</span>
                          <div className="font-body text-xs text-slate-400 mt-0.5">
                            🐴 {cav.poney || "—"} · {cav.session === "both" ? "Sessions 1+2" : `Session ${cav.session}`}
                            {cav.epreuves?.length > 0 && <> · 🎯 {cav.epreuves.join(", ")}</>}
                          </div>
                        </div>
                        <span className="font-body text-xs text-blue-500 font-bold">#{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
