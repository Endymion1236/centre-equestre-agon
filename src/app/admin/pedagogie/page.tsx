"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Search, Loader2, ChevronDown, ChevronUp, Plus, X, Save, Target, MessageSquare, TrendingUp, GraduationCap,
} from "lucide-react";
import type { Family } from "@/types";

interface PedaNote {
  date: string;
  text: string;
  author: string;
}
interface PedaObjectif {
  id: string;
  label: string;
  status: "en_cours" | "valide" | "a_revoir";
  addedAt: string;
}
interface PedaData {
  objectifs: PedaObjectif[];
  notes: PedaNote[];
  updatedAt?: any;
}

const galopLevels = ["—", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];
const defaultObjectifs: Record<string, string[]> = {
  "Bronze": ["Monter et descendre seul", "Diriger au pas", "Trot enlevé", "Pansage complet", "Connaître les parties du poney"],
  "Argent": ["Galop à 3 allures", "Trotter sans étriers", "Transition pas-trot-galop", "Aborder un obstacle isolé", "Brider et seller seul"],
  "Or": ["Enchaînement d'obstacles (60cm)", "Galop assis", "Départ au galop à juste", "Travail sur le plat", "Longe et travail en liberté"],
  "G3": ["Incurvation", "Épaule en dedans", "Enchaînement CSO 70cm", "Dressage E2", "Travail aux 3 allures sans étriers"],
  "G4": ["Appuyers", "Changement de pied", "Enchaînement CSO 80cm", "Dressage E3", "Cross obstacles naturels"],
};

export default function PedagogiePage() {
  const { user } = useAuth();
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingNote, setAddingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [addingObj, setAddingObj] = useState<string | null>(null);
  const [newObjLabel, setNewObjLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const snap = await getDocs(collection(db, "families"));
      setFamilies(snap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const allChildren = families.flatMap(f => (f.children || []).map((c: any) => ({
    ...c, familyId: f.firestoreId, familyName: f.parentName,
    peda: c.peda || { objectifs: [], notes: [] },
  })));

  const filtered = search
    ? allChildren.filter(c => {
        const q = search.toLowerCase().trim();
        const firstName = (c.firstName || "").toLowerCase();
        const lastName = (c.lastName || "").toLowerCase();
        const familyName = (c.familyName || "").toLowerCase();
        const full = `${firstName} ${lastName}`.trim();
        const fullRev = `${lastName} ${firstName}`.trim();
        return firstName.includes(q) || lastName.includes(q) || familyName.includes(q) || full.includes(q) || fullRev.includes(q);
      })
    : allChildren;

  const updatePeda = async (familyId: string, childId: string, peda: PedaData) => {
    setSaving(true);
    const family = families.find(f => f.firestoreId === familyId);
    if (!family) return;
    const updated = (family.children || []).map((c: any) =>
      c.id === childId ? { ...c, peda: { ...peda, updatedAt: new Date().toISOString() } } : c
    );
    await updateDoc(doc(db, "families", familyId), { children: updated, updatedAt: serverTimestamp() });
    await fetchData();
    setSaving(false);
  };

  const addNote = async (child: any) => {
    if (!noteText.trim()) return;
    const peda = child.peda || { objectifs: [], notes: [] };
    const authorName = user?.displayName || user?.email?.split("@")[0] || "Admin";
    const newNote: PedaNote = { date: new Date().toISOString(), text: noteText.trim(), author: authorName };
    await updatePeda(child.familyId, child.id, { ...peda, notes: [newNote, ...peda.notes] });
    setNoteText("");
    setAddingNote(null);
  };

  const addObjectif = async (child: any) => {
    if (!newObjLabel.trim()) return;
    const peda = child.peda || { objectifs: [], notes: [] };
    const newObj: PedaObjectif = { id: Date.now().toString(), label: newObjLabel.trim(), status: "en_cours", addedAt: new Date().toISOString() };
    await updatePeda(child.familyId, child.id, { ...peda, objectifs: [...peda.objectifs, newObj] });
    setNewObjLabel("");
    setAddingObj(null);
  };

  const toggleObjStatus = async (child: any, objId: string) => {
    const peda = child.peda || { objectifs: [], notes: [] };
    const updated = peda.objectifs.map((o: PedaObjectif) => {
      if (o.id !== objId) return o;
      const next = o.status === "en_cours" ? "valide" : o.status === "valide" ? "a_revoir" : "en_cours";
      return { ...o, status: next };
    });
    await updatePeda(child.familyId, child.id, { ...peda, objectifs: updated });
  };

  const addDefaultObjectifs = async (child: any) => {
    const level = child.galopLevel || "Bronze";
    const defaults = defaultObjectifs[level] || defaultObjectifs["Bronze"];
    const peda = child.peda || { objectifs: [], notes: [] };
    const existing = peda.objectifs.map((o: PedaObjectif) => o.label);
    const newObjs = defaults.filter(d => !existing.includes(d)).map(label => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
      label, status: "en_cours" as const, addedAt: new Date().toISOString(),
    }));
    if (newObjs.length === 0) return;
    await updatePeda(child.familyId, child.id, { ...peda, objectifs: [...peda.objectifs, ...newObjs] });
  };

  const deleteNote = async (child: any, noteIndex: number) => {
    if (!confirm("Supprimer cette note ?")) return;
    const peda = child.peda || { objectifs: [], notes: [] };
    const newNotes = peda.notes.filter((_: any, i: number) => i !== noteIndex);
    await updatePeda(child.familyId, child.id, { ...peda, notes: newNotes });
  };

  const deleteObjectif = async (child: any, objId: string) => {
    if (!confirm("Supprimer cet objectif ?")) return;
    const peda = child.peda || { objectifs: [], notes: [] };
    await updatePeda(child.familyId, child.id, { ...peda, objectifs: peda.objectifs.filter((o: PedaObjectif) => o.id !== objId) });
  };

  const [editingNote, setEditingNote] = useState<{ childId: string; noteIndex: number; text: string } | null>(null);
  const saveEditNote = async (child: any) => {
    if (!editingNote || !editingNote.text.trim()) return;
    const peda = child.peda || { objectifs: [], notes: [] };
    const newNotes = peda.notes.map((n: PedaNote, i: number) =>
      i === editingNote.noteIndex ? { ...n, text: editingNote.text.trim() } : n
    );
    await updatePeda(child.familyId, child.id, { ...peda, notes: newNotes });
    setEditingNote(null);
  };

  const [showAllNotes, setShowAllNotes] = useState<string | null>(null);

  const objStatusColors = { en_cours: "blue", valide: "green", a_revoir: "orange" };
  const objStatusLabels = { en_cours: "En cours", valide: "Validé", a_revoir: "À revoir" };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Suivi pédagogique</h1>
      <p className="font-body text-xs text-gray-400 mb-6">Objectifs, progression et notes d&apos;instructrice par cavalier</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Target size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{allChildren.reduce((s, c) => s + (c.peda?.objectifs?.length || 0), 0)}</div><div className="font-body text-xs text-gray-400">objectifs suivis</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><TrendingUp size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{allChildren.reduce((s, c) => s + (c.peda?.objectifs?.filter((o: PedaObjectif) => o.status === "valide").length || 0), 0)}</div><div className="font-body text-xs text-gray-400">validés</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center"><MessageSquare size={20} className="text-gold-400" /></div>
          <div><div className="font-body text-xl font-bold text-gold-400">{allChildren.reduce((s, c) => s + (c.peda?.notes?.length || 0), 0)}</div><div className="font-body text-xs text-gray-400">notes</div></div>
        </Card>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par prénom, nom ou famille..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      filtered.length === 0 ? <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><GraduationCap size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucun cavalier trouvé.</p></Card> :
      <div className="flex flex-col gap-3">
        {filtered.map(child => {
          const uniqueKey = `${child.familyId}_${child.id}`;
          const isExp = expanded === uniqueKey;
          const peda = child.peda || { objectifs: [], notes: [] };
          const objDone = peda.objectifs.filter((o: PedaObjectif) => o.status === "valide").length;
          const objTotal = peda.objectifs.length;

          return (
            <Card key={uniqueKey} padding="md">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExp ? null : uniqueKey)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <GraduationCap size={18} className="text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-body text-sm font-semibold text-blue-800">
                      {child.firstName}{child.lastName ? ` ${child.lastName}` : ""} <span className="text-xs text-gray-400 font-normal">({child.familyName})</span>
                    </div>
                    <div className="font-body text-xs text-gray-400">Niveau : {child.galopLevel || "Débutant"} · {objDone}/{objTotal} objectifs validés</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                    {child.galopLevel && child.galopLevel !== "—" ? `${child.galopLevel}` : "Débutant"}
                  </Badge>
                  {isExp ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </div>

              {isExp && (
                <div className="mt-4 pt-4 border-t border-blue-500/8">
                  {/* Objectifs */}
                  <div className="mb-5">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-body text-sm font-semibold text-blue-800 flex items-center gap-2"><Target size={14} /> Objectifs</h3>
                      <div className="flex gap-2">
                        <button onClick={() => addDefaultObjectifs(child)} className="font-body text-[11px] text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer">+ Objectifs type {child.galopLevel || "Bronze"}</button>
                        <button onClick={() => setAddingObj(addingObj === uniqueKey ? null : child.id)} className="font-body text-[11px] text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer"><Plus size={12} className="inline" /> Perso</button>
                      </div>
                    </div>

                    {addingObj === uniqueKey && (
                      <div className="flex gap-2 mb-3">
                        <input value={newObjLabel} onChange={e => setNewObjLabel(e.target.value)} placeholder="Nouvel objectif..." autoFocus
                          className="flex-1 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                        <button onClick={() => addObjectif(child)} disabled={!newObjLabel.trim() || saving}
                          className="px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-xs font-semibold border-none cursor-pointer"><Save size={12} className="inline mr-1" />OK</button>
                      </div>
                    )}

                    {peda.objectifs.length === 0 ? (
                      <p className="font-body text-xs text-gray-400 italic">Aucun objectif. Cliquez sur &quot;+ Objectifs type&quot; pour pré-remplir.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {peda.objectifs.map((obj: PedaObjectif) => (
                          <div key={obj.id} className="flex items-center justify-between bg-sand rounded-lg px-4 py-2.5">
                            <span className={`font-body text-sm ${obj.status === "valide" ? "text-green-600 line-through" : "text-blue-800"}`}>
                              {obj.status === "valide" ? "● " : obj.status === "a_revoir" ? "▲ " : "○ "} {obj.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => toggleObjStatus(child, obj.id)}
                                className={`px-2.5 py-1 rounded-lg border-none cursor-pointer font-body text-[10px] font-semibold ${
                                  obj.status === "valide" ? "bg-green-100 text-green-600" : obj.status === "a_revoir" ? "bg-orange-100 text-orange-600" : "bg-blue-50 text-blue-500"
                                }`}>
                                {obj.status === "en_cours" ? "Valider" : obj.status === "valide" ? "À revoir" : "Reprendre"}
                              </button>
                              <button onClick={() => deleteObjectif(child, obj.id)} className="text-red-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"><X size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes instructrice */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-body text-sm font-semibold text-blue-800 flex items-center gap-2"><MessageSquare size={14} /> Notes d&apos;instructrice</h3>
                      <button onClick={() => setAddingNote(addingNote === uniqueKey ? null : child.id)}
                        className="font-body text-[11px] text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer"><Plus size={12} className="inline" /> Ajouter</button>
                    </div>

                    {addingNote === uniqueKey && (
                      <div className="mb-3">
                        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="Observations, progrès, points à travailler..." autoFocus
                          className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none resize-vertical" />
                        <button onClick={() => addNote(child)} disabled={!noteText.trim() || saving}
                          className="mt-2 px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-xs font-semibold border-none cursor-pointer"><Save size={12} className="inline mr-1" />Enregistrer</button>
                      </div>
                    )}

                    {peda.notes.length === 0 ? (
                      <p className="font-body text-xs text-gray-400 italic">Aucune note pour l&apos;instant.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {(showAllNotes === uniqueKey ? peda.notes : peda.notes.slice(0, 5)).map((note: PedaNote, i: number) => (
                          <div key={i} className={`rounded-lg px-4 py-3 group ${(note as any).type === "seance" ? "bg-green-50 border border-green-100" : "bg-sand"}`}>
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                {(note as any).type === "seance" && <span className="font-body text-[9px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded">Séance</span>}
                                <span className="font-body text-[11px] font-semibold text-blue-500">{note.author}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-body text-[11px] text-gray-400">{new Date(note.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                                <button onClick={() => setEditingNote({ childId: child.id, noteIndex: i, text: note.text })} className="text-gray-300 hover:text-blue-500 bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100"><MessageSquare size={11} /></button>
                                <button onClick={() => deleteNote(child, i)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100"><X size={11} /></button>
                              </div>
                            </div>
                            {editingNote && editingNote.childId === child.id && editingNote.noteIndex === i ? (
                              <div>
                                <textarea value={editingNote.text} onChange={e => setEditingNote({ ...editingNote, text: e.target.value })} rows={2}
                                  className="w-full px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none resize-vertical" />
                                <div className="flex gap-2 mt-1">
                                  <button onClick={() => saveEditNote(child)} className="font-body text-[10px] text-white bg-blue-500 px-2 py-1 rounded border-none cursor-pointer">Enregistrer</button>
                                  <button onClick={() => setEditingNote(null)} className="font-body text-[10px] text-gray-500 bg-gray-100 px-2 py-1 rounded border-none cursor-pointer">Annuler</button>
                                </div>
                              </div>
                            ) : (
                              <p className="font-body text-sm text-gray-600 leading-relaxed">{note.text}</p>
                            )}
                          </div>
                        ))}
                        {peda.notes.length > 5 && showAllNotes !== uniqueKey && (
                          <button onClick={() => setShowAllNotes(uniqueKey)} className="font-body text-xs text-blue-500 bg-blue-50 py-1.5 rounded-lg border-none cursor-pointer text-center">
                            Voir les {peda.notes.length - 5} notes antérieures
                          </button>
                        )}
                        {showAllNotes === uniqueKey && peda.notes.length > 5 && (
                          <button onClick={() => setShowAllNotes(null)} className="font-body text-xs text-gray-400 bg-sand py-1.5 rounded-lg border-none cursor-pointer text-center">
                            Réduire
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>}
    </div>
  );
}
