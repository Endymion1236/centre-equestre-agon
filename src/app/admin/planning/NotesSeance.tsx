"use client";
/**
 * src/app/admin/planning/NotesSeance.tsx
 *
 * Journal pédagogique d'une séance : note de préparation, notes d'après-cours,
 * historique, et rappel des notes des semaines précédentes du même cours.
 *
 * Notes textuelles libres attachées à la séance. À chaque enregistrement, on
 * capture aussi le plan de séance courant pour conserver l'historique complet
 * (note + plan associé).
 *
 * Pourquoi c'est un composant à part : ce bloc ne touche NI l'argent, NI les
 * inscriptions. Il ne partage avec le panneau d'inscription que le créneau
 * affiché et le plan de séance courant. Le laisser au milieu de la mécanique
 * de facturation obligeait à relire 200 lignes sans rapport avant d'atteindre
 * le code qui crée les paiements — et rendait les deux plus risqués à toucher.
 *
 * Il gère lui-même son chargement et ses écritures Firestore
 * (collection `notes-seance` + champ `notePreparation` du créneau), parce que
 * personne d'autre n'en a besoin.
 */

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { Trash2, Check, Loader2, StickyNote, ChevronDown, ChevronUp, Clock, FileImage } from "lucide-react";
import type { NoteSeance } from "./enroll-types";

export default function NotesSeance({ creneau, planUrl, planType }: {
  creneau: any;
  planUrl: string | null;
  planType: string | null;
}) {
  const { toast: panelToast } = useToast();
  const { user } = useAuth();

  const [notes, setNotes] = useState<NoteSeance[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteTexte, setNoteTexte] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showHistorique, setShowHistorique] = useState(false);

  // Notes des seances PRECEDENTES du meme cours (meme activite + meme
  // moniteur, autres dates). Permet de relire le fil pedagogique du groupe
  // semaine apres semaine. Chargees separement des notes de la seance
  // courante (qui restent dans `notes`).
  const [notesPrecedentes, setNotesPrecedentes] = useState<NoteSeance[]>([]);
  const [notesPrecLoading, setNotesPrecLoading] = useState(false);
  const [showPrecedentes, setShowPrecedentes] = useState(false);

  // Note de PREPARATION : attachee au creneau (pas a l'historique), reste
  // affichee et modifiable en permanence. Permet au moniteur de noter a
  // l'avance ce qu'il a prevu pour la seance. Distincte des notes-seance
  // (qui sont un journal horodate d'observations post-seance).
  const [notePrepa, setNotePrepa] = useState<string>((creneau as any).notePreparation || "");
  const [notePrepaSaving, setNotePrepaSaving] = useState(false);
  const [notePrepaSaved, setNotePrepaSaved] = useState(false);

  // ── Chargement de l'historique des notes pour ce créneau ─────────────
  useEffect(() => {
    if (!creneau.id) return;
    setNotesLoading(true);
    // Tri serveur : du plus récent au plus ancien
    getDocs(query(
      collection(db, "notes-seance"),
      where("creneauId", "==", creneau.id),
      orderBy("createdAt", "desc")
    ))
      .then(snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as NoteSeance))))
      .catch(e => {
        console.warn("Notes load:", e);
        // Index composite manquant → fallback sans orderBy
        getDocs(query(collection(db, "notes-seance"), where("creneauId", "==", creneau.id)))
          .then(snap => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as NoteSeance));
            // Tri client par createdAt desc
            items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setNotes(items);
          })
          .catch(() => setNotes([]));
      })
      .finally(() => setNotesLoading(false));
  }, [creneau.id]);

  // Charge les notes des seances PRECEDENTES du meme cours (meme titre
  // d'activite + meme moniteur, dates differentes de la seance courante).
  useEffect(() => {
    if (!creneau.id || !creneau.activityTitle) { setNotesPrecedentes([]); return; }
    setNotesPrecLoading(true);
    // On filtre par titre d'activite (champ stocke dans chaque note). On
    // recupere large puis on affine cote client (exclure la seance courante,
    // garder le meme moniteur, trier par date desc, limiter a 10).
    getDocs(query(
      collection(db, "notes-seance"),
      where("creneauActivityTitle", "==", creneau.activityTitle),
    ))
      .then(snap => {
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as NoteSeance))
          // Exclure les notes de la seance courante (deja affichees au-dessus)
          .filter(n => n.creneauId !== creneau.id)
          // Garder le meme moniteur si renseigne (un meme creneau horaire peut
          // etre tenu par des moniteurs differents selon les semaines ; on
          // privilegie la continuite pedagogique du meme encadrant, mais on
          // garde quand meme si le moniteur n'est pas renseigne)
          .filter(n => !creneau.monitor || !n.creneauMonitor || n.creneauMonitor === creneau.monitor)
          // Tri par date de seance desc (la plus recente d'abord)
          .sort((a, b) => {
            const da = a.creneauDate || "";
            const db_ = b.creneauDate || "";
            if (da !== db_) return db_.localeCompare(da);
            // meme date : tri par createdAt desc
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          })
          .slice(0, 10); // max 10 dernieres notes
        setNotesPrecedentes(items);
      })
      .catch(e => {
        console.warn("Notes precedentes load:", e);
        setNotesPrecedentes([]);
      })
      .finally(() => setNotesPrecLoading(false));
  }, [creneau.id, creneau.activityTitle, creneau.monitor]);

  // Resync de la note de preparation quand on ouvre un autre creneau
  // (le composant EnrollPanel est reutilise d'un creneau a l'autre).
  useEffect(() => {
    setNotePrepa((creneau as any).notePreparation || "");
    setNotePrepaSaved(false);
  }, [creneau.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enregistrer une note pédagogique ────────────────────────────────
  // Snapshot du plan courant (URL/path/type) pour construire l'historique.
  // Si aucun plan n'est uploadé, les champs plan* sont à null sur la note.
  // Sauvegarde de la note de preparation (sur le doc creneau lui-meme).
  // Appelee soit au clic du bouton, soit en auto-save au blur du textarea.
  const saveNotePrepa = async () => {
    if (!creneau.id) return;
    setNotePrepaSaving(true);
    try {
      await updateDoc(doc(db, "creneaux", creneau.id), {
        notePreparation: notePrepa.trim() || null,
        notePreparationUpdatedAt: new Date().toISOString(),
      });
      setNotePrepaSaved(true);
      // Le petit "✓ Enregistre" disparait apres 2s
      setTimeout(() => setNotePrepaSaved(false), 2000);
    } catch (e) {
      console.error("saveNotePrepa:", e);
      panelToast("Erreur enregistrement note de preparation", "error");
    }
    setNotePrepaSaving(false);
  };

  const saveNote = async () => {
    if (!creneau.id) return;
    const texte = noteTexte.trim();
    if (!texte) { panelToast("Note vide", "info"); return; }
    setNoteSaving(true);
    try {
      const docData: any = {
        creneauId: creneau.id,
        texte,
        // Snapshot du plan courant au moment de la note
        planSeanceUrl: planUrl || null,
        planSeancePath: (creneau as any).planSeancePath || null,
        planSeanceType: planType || null,
        // Métadonnées de traçabilité
        createdAt: serverTimestamp(),
        createdByEmail: user?.email || null,
        createdByName: user?.displayName || null,
        // Contexte du créneau (utile pour requêtes transversales futures)
        creneauDate: creneau.date,
        creneauActivityTitle: creneau.activityTitle,
        creneauMonitor: creneau.monitor,
      };
      const ref = await addDoc(collection(db, "notes-seance"), docData);
      // Mise à jour optimiste de l'historique avec un createdAt approximatif
      // (le serverTimestamp réel sera celui du serveur, mais on n'attend pas
      // un refetch pour montrer la note dans la liste).
      setNotes(prev => [{
        id: ref.id,
        ...docData,
        // Approximation : Firestore Timestamp { seconds, nanoseconds } pour
        // le tri client en attendant le serverTimestamp réel.
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      }, ...prev]);
      setNoteTexte("");
      setShowHistorique(true);
      panelToast("✅ Note enregistrée", "success");
    } catch (e: any) {
      console.error(e);
      panelToast("Erreur lors de l'enregistrement", "error");
    }
    setNoteSaving(false);
  };

  // ── Supprimer une note de l'historique ──────────────────────────────
  const deleteNote = async (noteId: string) => {
    if (!confirm("Supprimer cette note de l'historique ?\n\nCette action est irréversible.")) return;
    try {
      await deleteDoc(doc(db, "notes-seance", noteId));
      setNotes(prev => prev.filter(n => n.id !== noteId));
      panelToast("Note supprimée", "success");
    } catch (e) {
      console.error(e);
      panelToast("Erreur suppression", "error");
    }
  };

  return (
          <div className="mt-3 pt-3 border-t border-blue-500/8">
            <div className="flex items-center justify-between mb-2">
              <span className="font-body text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <StickyNote size={12} /> Notes de séance
                {notes.length > 0 && (
                  <span className="font-body text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full normal-case tracking-normal">
                    {notes.length}
                  </span>
                )}
              </span>
              {notes.length > 0 && (
                <button
                  onClick={() => setShowHistorique(v => !v)}
                  className="flex items-center gap-1 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline"
                >
                  {showHistorique ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Historique
                </button>
              )}
              {notesPrecedentes.length > 0 && (
                <button
                  onClick={() => setShowPrecedentes(v => !v)}
                  className="flex items-center gap-1 font-body text-xs text-violet-600 bg-transparent border-none cursor-pointer hover:underline"
                >
                  {showPrecedentes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Séances précédentes ({notesPrecedentes.length})
                </button>
              )}
            </div>

            {/* Note de PREPARATION (persistante, attachee au creneau) */}
            <div className="mb-3 p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/60">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-body text-[10px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  📋 Note de préparation
                </span>
                {notePrepaSaved && (
                  <span className="font-body text-[10px] text-green-600 flex items-center gap-0.5">
                    <Check size={10} /> Enregistré
                  </span>
                )}
              </div>
              <textarea
                value={notePrepa}
                onChange={e => { setNotePrepa(e.target.value); setNotePrepaSaved(false); }}
                onBlur={saveNotePrepa}
                placeholder="Ce que tu as prévu pour cette séance (exercices, objectifs, matériel…). Reste affichée et modifiable à chaque fois."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white font-body text-xs resize-none focus:outline-none focus:ring-2 focus:ring-amber-300/40 focus:border-amber-300"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="font-body text-[10px] text-amber-600/70">
                  Sauvegarde automatique
                </span>
                <button
                  onClick={saveNotePrepa}
                  disabled={notePrepaSaving}
                  className="flex items-center gap-1 font-body text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500 text-white border-none cursor-pointer hover:bg-amber-400 disabled:opacity-40"
                >
                  {notePrepaSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  Enregistrer
                </button>
              </div>
            </div>

            {/* Champ d'ajout de note */}
            <textarea
              value={noteTexte}
              onChange={e => setNoteTexte(e.target.value)}
              placeholder="Ajouter une note pédagogique sur cette séance (ressenti, comportement de groupe, exercices à refaire…)"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 font-body text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-300"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="font-body text-[10px] text-slate-400">
                {planUrl
                  ? "✓ Le plan de séance courant sera associé à la note"
                  : "Aucun plan associé"}
              </span>
              <button
                onClick={saveNote}
                disabled={noteSaving || !noteTexte.trim()}
                className="flex items-center gap-1 font-body text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 text-white border-none cursor-pointer hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {noteSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Enregistrer
              </button>
            </div>

            {/* Historique des notes */}
            {showHistorique && (
              <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                {notesLoading && (
                  <div className="flex items-center justify-center py-4 text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                  </div>
                )}
                {!notesLoading && notes.length === 0 && (
                  <div className="text-center py-4 font-body text-xs text-slate-400">
                    Aucune note encore enregistrée
                  </div>
                )}
                {notes.map(n => {
                  const date = n.createdAt?.toDate
                    ? n.createdAt.toDate()
                    : n.createdAt?.seconds
                    ? new Date(n.createdAt.seconds * 1000)
                    : null;
                  return (
                    <div key={n.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="font-body text-[10px] text-slate-500 flex items-center gap-1.5">
                          <Clock size={10} />
                          {date
                            ? date.toLocaleString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                          {n.createdByName && (
                            <span className="text-slate-400">· {n.createdByName}</span>
                          )}
                        </div>
                        <button
                          onClick={() => deleteNote(n.id)}
                          className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                          title="Supprimer cette note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="font-body text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {n.texte}
                      </p>
                      {/* Miniature du plan associé à cette note (snapshot historique) */}
                      {n.planSeanceUrl && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <div className="font-body text-[10px] text-slate-400 mb-1">Plan associé :</div>
                          {n.planSeanceType === "application/pdf" ? (
                            <a
                              href={n.planSeanceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-lg no-underline hover:bg-red-100"
                            >
                              <FileImage size={12} className="text-red-500" />
                              <span className="font-body text-[11px] text-red-700">Plan PDF</span>
                            </a>
                          ) : (
                            <a
                              href={n.planSeanceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block"
                            >
                              <img
                                src={n.planSeanceUrl}
                                alt="Plan associé"
                                className="h-20 rounded-lg border border-slate-200 hover:opacity-80 cursor-zoom-in object-cover"
                              />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes des seances PRECEDENTES du meme cours */}
            {showPrecedentes && (
              <div className="mt-3 space-y-2 max-h-96 overflow-y-auto border-t border-violet-100 pt-3">
                <div className="font-body text-[10px] text-violet-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  🕘 Notes des semaines précédentes — {creneau.activityTitle}
                </div>
                {notesPrecLoading && (
                  <div className="flex items-center justify-center py-4 text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                  </div>
                )}
                {!notesPrecLoading && notesPrecedentes.length === 0 && (
                  <div className="text-center py-4 font-body text-xs text-slate-400">
                    Aucune note sur les séances précédentes
                  </div>
                )}
                {notesPrecedentes.map(n => {
                  // Date de la SEANCE (creneauDate), pas de la saisie de la note
                  const seanceDate = n.creneauDate ? new Date(n.creneauDate) : null;
                  return (
                    <div key={n.id} className="bg-violet-50/50 border border-violet-100 rounded-xl p-3">
                      <div className="font-body text-[10px] text-violet-500 flex items-center gap-1.5 mb-1.5">
                        <Clock size={10} />
                        {seanceDate
                          ? seanceDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                          : "Date inconnue"}
                        {n.createdByName && <span className="text-violet-400">· {n.createdByName}</span>}
                      </div>
                      <p className="font-body text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {n.texte}
                      </p>
                      {n.planSeanceUrl && (
                        <div className="mt-2 pt-2 border-t border-violet-100">
                          <a
                            href={n.planSeanceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-violet-200 rounded-lg no-underline hover:bg-violet-50"
                          >
                            <FileImage size={12} className="text-violet-500" />
                            <span className="font-body text-[11px] text-violet-700">Plan de cette séance</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
  );
}
