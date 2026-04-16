"use client";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import { Plus, ExternalLink, Loader2, Trophy, Calendar, Users, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";

const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

interface Challenge { id: string; title: string; date: string; status: string; updatedAt: string; riderCount: number; }

export default function CompetitionsPage() {
  const { toast } = useToast();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newDisciplines, setNewDisciplines] = useState<string[]>(["cso50", "cso70", "equifun"]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchChallenges = async () => {
    setLoading(true);
    try { const res = await authFetch("/api/challenges"); if (res.ok) setChallenges(await res.json()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchChallenges(); }, []);

  const importJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.riders || !json.results) { toast("Fichier JSON invalide (riders/results manquants)", "error"); setImporting(false); return; }
      // Titre par défaut depuis le nom du fichier
      const titleFromFile = file.name.replace(/challenge-equestre-?/, "").replace(/\s*\(\d+\)\s*/, "").replace(/\.json$/, "").replace(/-/g, " ").trim();
      const dateMatch = file.name.match(/\d{4}-\d{2}-\d{2}/);
      const date = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
      const title = titleFromFile || `Challenge ${date}`;
      // Créer le challenge dans Firebase
      const res = await authFetch("/api/challenges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, disciplines: ["cso50", "cso70", "equifun"] }),
      });
      const created = await res.json();
      let challengeId = created.id;
      if (!res.ok) {
        if (res.status === 409) {
          // Challenge existe déjà → écraser les données
          const expectedId = `challenge-${date}-${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 20)}`;
          challengeId = expectedId;
        } else {
          toast(created.error || "Erreur création", "error"); setImporting(false); return;
        }
      }
      // Uploader les données
      const putRes = await authFetch("/api/challenges", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: challengeId, riders: json.riders, results: json.results, nextId: json.nextId || 1 }),
      });
      if (!putRes.ok) {
        const putErr = await putRes.json().catch(() => ({}));
        toast(putErr.error || "Erreur sauvegarde des données", "error"); setImporting(false); return;
      }
      toast(`✅ Challenge "${title}" importé — ${json.riders.length} cavaliers`, "success");
      fetchChallenges();
    } catch (err: any) {
      toast(err.message || "Erreur import", "error");
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const createChallenge = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), date: newDate, disciplines: newDisciplines }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error || "Erreur création", "error"); setCreating(false); return; }
      toast(`✅ Challenge "${newTitle}" créé !`, "success");
      setShowCreate(false); setNewTitle(""); fetchChallenges();
    } catch (e: any) { toast(e.message, "error"); }
    setCreating(false);
  };

  const archiveChallenge = async (id: string) => {
    if (!confirm("Archiver ce challenge ?")) return;
    try {
      await authFetch("/api/challenges", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "archived" }) });
      toast("Challenge archivé", "success"); fetchChallenges();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const openChallenge = (id: string) => window.open(`/challenge?id=${encodeURIComponent(id)}`, "_blank");

  const activeChallenges = challenges.filter(c => c.status !== "archived");
  const archivedChallenges = challenges.filter(c => c.status === "archived");

  const DISCS = [
    { id: "cso50", label: "CSO 50cm" }, { id: "cso70", label: "CSO 70cm" }, { id: "cso90", label: "CSO 90cm" },
    { id: "equifun", label: "Équifun" }, { id: "pony_games", label: "Pony Games" }, { id: "dressage", label: "Dressage" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Compétitions & Challenges</h1>
          <p className="font-body text-xs text-slate-500 mt-1">Challenges internes du centre · Gestion des épreuves</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchChallenges} className="flex items-center gap-1.5 font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50"><RefreshCw size={13} /> Actualiser</button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            {importing ? <><Loader2 size={13} className="animate-spin" /> Import...</> : <>📥 Importer JSON</>}
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-green-500"><Plus size={16} /> Nouveau challenge</button>
        </div>
      </div>

      {showCreate && (
        <Card padding="md" className="mb-6 border-green-200">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">🏇 Nouveau challenge interne</h3>
          <div className="flex flex-col gap-3">
            <div><label className="font-body text-xs font-semibold text-slate-600 block mb-1">Nom du challenge *</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Challenge Printemps 2026" className={inp} /></div>
            <div><label className="font-body text-xs font-semibold text-slate-600 block mb-1">Date</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={inp} /></div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Disciplines</label>
              <div className="flex flex-wrap gap-2">
                {DISCS.map(d => (
                  <button key={d.id} onClick={() => setNewDisciplines(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                    className={`font-body text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${newDisciplines.includes(d.id) ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-gray-200"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={createChallenge} disabled={!newTitle.trim() || creating}
                className="flex-1 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <><Loader2 size={14} className="animate-spin" /> Création...</> : "✓ Créer"}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-lg font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
            </div>
          </div>
        </Card>
      )}

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : <>
        <div className="mb-6">
          <h2 className="font-body text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">🟢 Challenges actifs ({activeChallenges.length})</h2>
          {activeChallenges.length === 0 ? (
            <Card padding="lg" className="text-center">
              <Trophy size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="font-body text-sm text-slate-500">Aucun challenge actif. Créez-en un pour commencer.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {activeChallenges.map(c => (
                <Card key={c.id} padding="md">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0"><Trophy size={20} className="text-green-600" /></div>
                      <div className="min-w-0">
                        <div className="font-body text-base font-semibold text-blue-800">{c.title}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 font-body text-xs text-slate-500"><Calendar size={11} /> {c.date ? new Date(c.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span>
                          <span className="flex items-center gap-1 font-body text-xs text-slate-500"><Users size={11} /> {c.riderCount} cavalier{c.riderCount !== 1 ? "s" : ""}</span>
                          {c.updatedAt && <span className="font-body text-[10px] text-slate-400">Modifié {new Date(c.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                        <div className="font-body text-[10px] text-slate-400 font-mono mt-0.5">{c.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openChallenge(c.id)} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-green-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-green-500"><ExternalLink size={14} /> Ouvrir</button>
                      <button onClick={() => archiveChallenge(c.id)} className="font-body text-xs text-slate-500 bg-gray-100 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200">Archiver</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {archivedChallenges.length > 0 && (
          <div className="mb-6">
            <h2 className="font-body text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">📦 Archives ({archivedChallenges.length})</h2>
            <div className="flex flex-col gap-2">
              {archivedChallenges.map(c => (
                <Card key={c.id} padding="sm" className="opacity-60">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-body text-sm font-semibold text-slate-700">{c.title}</div>
                      <div className="font-body text-xs text-slate-400">{c.date} · {c.riderCount} cavaliers</div>
                    </div>
                    <button onClick={() => openChallenge(c.id)} className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer"><ExternalLink size={12} /> Consulter</button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
          <div className="flex items-start gap-3">
            <span className="text-xl">ℹ️</span>
            <div>
              <div className="font-body text-sm font-semibold text-blue-800 mb-1">Compétitions externes FFE</div>
              <p className="font-body text-xs text-blue-600 leading-relaxed">
                Les compétitions externes se gèrent dans le <a href="/admin/planning" className="underline font-semibold">Planning</a> comme une activité normale.
                Choisissez le type <strong>Compétition</strong> lors de la création du créneau.
                À l&apos;inscription, saisissez librement les montants <strong>engagement</strong> et <strong>coaching</strong> par cavalier.
              </p>
            </div>
          </div>
        </div>
      </>}
    </div>
  );
}
