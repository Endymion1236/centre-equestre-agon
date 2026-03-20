"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Search, Plus, Loader2, X, GraduationCap, Target, MessageSquare, Save } from "lucide-react";

interface PedagNote {
  id: string;
  childId: string;
  childName: string;
  familyName: string;
  galopLevel: string;
  objectives: string[];
  notes: string;
  lastSession: string;
  history: { date: string; note: string; objectives: string[] }[];
  updatedAt: any;
}

const OBJECTIVE_SUGGESTIONS = [
  "Trot enlevé", "Diriger au pas", "Galop 3 allures", "Obstacle 50cm", "Obstacle 70cm",
  "Équilibre au trot", "Départ au galop", "Enchaînement CSO", "Dressage E2", "Dressage E3",
  "Pansage autonome", "Seller/desseller seul", "Mise en selle", "Voltige de base",
  "Pony Games : slalom", "Pony Games : drapeau", "Pony Games : 5 fanions",
  "Confiance au galop", "Travail en extérieur", "Travail sur le plat",
  "Diagonale de trot", "Changement de main", "Cession à la jambe",
];

export default function PedagogiePage() {
  const [notes, setNotes] = useState<PedagNote[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editObjectives, setEditObjectives] = useState<string[]>([]);
  const [newObjective, setNewObjective] = useState("");
  const [saving, setSaving] = useState(false);

  // Add form
  const [addFamily, setAddFamily] = useState("");
  const [addChild, setAddChild] = useState("");
  const [addObjectives, setAddObjectives] = useState<string[]>([]);
  const [addNote, setAddNote] = useState("");
  const [addNewObj, setAddNewObj] = useState("");

  const fetchData = async () => {
    try {
      const [pedSnap, famSnap] = await Promise.all([
        getDocs(collection(db, "pedagogie")),
        getDocs(collection(db, "families")),
      ]);
      setNotes(pedSnap.docs.map(d => ({ id: d.id, ...d.data() })) as PedagNote[]);
      setFamilies(famSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const allChildren = families.flatMap((f: any) => (f.children || []).map((c: any) => ({
    ...c, familyId: f.id, familyName: f.parentName, galopLevel: c.galopLevel || "—",
  })));

  const startEdit = (n: PedagNote) => {
    setEditingId(n.id);
    setEditNote(n.notes);
    setEditObjectives([...n.objectives]);
  };

  const saveEdit = async (n: PedagNote) => {
    setSaving(true);
    const historyEntry = { date: new Date().toISOString().split("T")[0], note: editNote, objectives: editObjectives };
    await updateDoc(doc(db, "pedagogie", n.id), {
      objectives: editObjectives,
      notes: editNote,
      lastSession: new Date().toISOString().split("T")[0],
      history: [...(n.history || []), historyEntry],
      updatedAt: serverTimestamp(),
    });
    setEditingId(null);
    setSaving(false);
    fetchData();
  };

  const handleAdd = async () => {
    if (!addChild) return;
    setSaving(true);
    const child = allChildren.find((c: any) => c.id === addChild);
    if (!child) return;
    const id = `ped_${Date.now()}`;
    const entry: any = {
      childId: child.id,
      childName: child.firstName,
      familyName: child.familyName,
      galopLevel: child.galopLevel,
      objectives: addObjectives,
      notes: addNote,
      lastSession: new Date().toISOString().split("T")[0],
      history: addNote ? [{ date: new Date().toISOString().split("T")[0], note: addNote, objectives: addObjectives }] : [],
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "pedagogie", id), entry);
    setShowAdd(false);
    setAddFamily("");
    setAddChild("");
    setAddObjectives([]);
    setAddNote("");
    setSaving(false);
    fetchData();
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Supprimer le suivi pédagogique de ce cavalier ?")) return;
    await deleteDoc(doc(db, "pedagogie", id));
    fetchData();
  };

  const filtered = notes.filter(n => {
    if (!search) return true;
    const q = search.toLowerCase();
    return n.childName?.toLowerCase().includes(q) || n.familyName?.toLowerCase().includes(q) || n.objectives.some(o => o.toLowerCase().includes(q));
  });

  const selectedFamilyChildren = addFamily ? (families.find((f: any) => f.id === addFamily)?.children || []) : [];
  const existingChildIds = notes.map(n => n.childId);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Suivi pédagogique</h1>
          <p className="font-body text-xs text-gray-400">Objectifs, notes d&apos;Emmeline, progression de chaque cavalier</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400 transition-colors">
          <Plus size={16} /> Nouveau suivi
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><GraduationCap size={20} className="text-purple-600" /></div>
          <div><div className="font-body text-xl font-bold text-purple-600">{notes.length}</div><div className="font-body text-xs text-gray-400">cavaliers suivis</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Target size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{notes.reduce((s, n) => s + n.objectives.length, 0)}</div><div className="font-body text-xs text-gray-400">objectifs en cours</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><MessageSquare size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{notes.filter(n => n.lastSession >= new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]).length}</div><div className="font-body text-xs text-gray-400">mis à jour cette semaine</div></div>
        </Card>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card padding="md" className="mb-5 !border-blue-500/20">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Ajouter un suivi pédagogique</h3>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Famille</label>
              <select value={addFamily} onChange={e => { setAddFamily(e.target.value); setAddChild(""); }}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none">
                <option value="">Sélectionner...</option>
                {families.map((f: any) => <option key={f.id} value={f.id}>{f.parentName}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Cavalier</label>
              <select value={addChild} onChange={e => setAddChild(e.target.value)} disabled={!addFamily}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none disabled:opacity-40">
                <option value="">Sélectionner...</option>
                {selectedFamilyChildren.filter((c: any) => !existingChildIds.includes(c.id)).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.firstName} ({c.galopLevel || "Débutant"})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Objectifs</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {addObjectives.map((o, i) => (
                <span key={i} className="flex items-center gap-1 font-body text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
                  {o} <button onClick={() => setAddObjectives(addObjectives.filter((_, j) => j !== i))} className="bg-transparent border-none cursor-pointer text-purple-400 text-xs">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={addNewObj} onChange={e => setAddNewObj(e.target.value)} placeholder="Ajouter un objectif..."
                className="flex-1 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none"
                list="obj-suggestions-add" onKeyDown={e => { if (e.key === "Enter" && addNewObj.trim()) { setAddObjectives([...addObjectives, addNewObj.trim()]); setAddNewObj(""); } }} />
              <datalist id="obj-suggestions-add">{OBJECTIVE_SUGGESTIONS.filter(s => !addObjectives.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
              <button onClick={() => { if (addNewObj.trim()) { setAddObjectives([...addObjectives, addNewObj.trim()]); setAddNewObj(""); } }}
                className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Ajouter</button>
            </div>
          </div>
          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Notes / observations</label>
            <textarea value={addNote} onChange={e => setAddNote(e.target.value)} rows={2} placeholder="Ex: Progresse bien, confiance en hausse..."
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none resize-vertical" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!addChild || saving}
              className="font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
              {saving ? "Enregistrement..." : "Créer le suivi"}
            </button>
            <button onClick={() => setShowAdd(false)} className="font-body text-sm text-gray-500 bg-white px-5 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un cavalier, un objectif..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-4xl block mb-3">🎓</span>
          <p className="font-body text-sm text-gray-500">{search ? "Aucun résultat." : "Aucun suivi pédagogique. Ajoutez le premier !"}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(n => {
            const isEditing = editingId === n.id;
            return (
              <Card key={n.id} padding="md">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-lg">🧒</div>
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">{n.childName} <span className="text-gray-400 font-normal text-sm">({n.familyName})</span></div>
                      <div className="flex gap-2 mt-1">
                        <Badge color="blue">{n.galopLevel && n.galopLevel !== "—" ? `Galop ${n.galopLevel}` : "Débutant"}</Badge>
                        <span className="font-body text-xs text-gray-400">Dernière séance : {n.lastSession || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isEditing && (
                      <button onClick={() => startEdit(n)} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">Modifier</button>
                    )}
                    <button onClick={() => deleteNote(n.id)} className="font-body text-xs text-gray-400 bg-transparent border-none cursor-pointer hover:text-red-500">🗑</button>
                  </div>
                </div>

                {/* Objectifs */}
                <div className="mb-3">
                  <div className="font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Objectifs en cours</div>
                  {isEditing ? (
                    <div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {editObjectives.map((o, i) => (
                          <span key={i} className="flex items-center gap-1 font-body text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
                            {o} <button onClick={() => setEditObjectives(editObjectives.filter((_, j) => j !== i))} className="bg-transparent border-none cursor-pointer text-purple-400 text-xs">×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={newObjective} onChange={e => setNewObjective(e.target.value)} placeholder="Nouvel objectif..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white focus:outline-none"
                          list={`obj-sug-${n.id}`} onKeyDown={e => { if (e.key === "Enter" && newObjective.trim()) { setEditObjectives([...editObjectives, newObjective.trim()]); setNewObjective(""); } }} />
                        <datalist id={`obj-sug-${n.id}`}>{OBJECTIVE_SUGGESTIONS.filter(s => !editObjectives.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
                        <button onClick={() => { if (newObjective.trim()) { setEditObjectives([...editObjectives, newObjective.trim()]); setNewObjective(""); } }}
                          className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">+</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {n.objectives.length > 0 ? n.objectives.map((o, i) => (
                        <span key={i} className="font-body text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">{o}</span>
                      )) : <span className="font-body text-xs text-gray-400 italic">Aucun objectif défini</span>}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="mb-3">
                  <div className="font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes d&apos;Emmeline</div>
                  {isEditing ? (
                    <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:outline-none resize-vertical" />
                  ) : (
                    <div className="font-body text-sm text-gray-500 italic bg-sand rounded-lg px-4 py-3">
                      💬 {n.notes || "Aucune note"}
                    </div>
                  )}
                </div>

                {/* Save / Cancel */}
                {isEditing && (
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => saveEdit(n)} disabled={saving}
                      className="flex items-center gap-2 font-body text-xs font-semibold text-white bg-green-600 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
                      <Save size={14} /> {saving ? "..." : "Enregistrer la séance"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="font-body text-xs text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                  </div>
                )}

                {/* History */}
                {n.history && n.history.length > 0 && (
                  <details className="mt-2">
                    <summary className="font-body text-xs text-blue-500 cursor-pointer font-semibold">Historique ({n.history.length} séances)</summary>
                    <div className="mt-2 flex flex-col gap-2 pl-2 border-l-2 border-blue-500/10">
                      {[...n.history].reverse().slice(0, 5).map((h, i) => (
                        <div key={i} className="font-body text-xs text-gray-500">
                          <span className="font-semibold text-blue-800">{h.date}</span> — {h.note || "Pas de note"}
                          {h.objectives && h.objectives.length > 0 && (
                            <span className="text-gray-400"> · Objectifs : {h.objectives.join(", ")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
