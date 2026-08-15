/**
 * src/app/admin/montoir/montoir-notes.ts
 *
 * Les ecritures de notes pedagogiques declenchees depuis le montoir : la
 * trace automatique posee a la cloture d'une reprise, et les notes rapides
 * saisies juste apres dans le panneau de bilan.
 *
 * Pourquoi ce fichier : ces deux ecritures touchent le tableau `children`
 * d'une famille, c'est-a-dire la fiche des cavaliers. Le garde-fou qui les
 * protege (la transaction expliquee plus bas) doit rester lisible d'un seul
 * coup d'oeil, et non noye entre deux `useState`.
 *
 * Code DEPLACE tel quel depuis page.tsx. Ce qui etait lu dans l'etat React
 * (`families`, les notes en cours de saisie) arrive maintenant en parametre.
 */

"use client";

import { doc, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validateChildrenUpdate } from "@/lib/utils";
import type { QuickNoteChild } from "./types";

  /**
   * Ecrit une note pedagogique sur un enfant.
   *
   * ⚠️ Cette fonction reecrit le tableau `children` ENTIER de la famille.
   * Tant qu'elle partait de `families` (un instantane React fige au dernier
   * fetchData), toute note ecrite entre-temps etait effacee : deux reprises
   * cloturees coup sur coup, une monitrice qui saisit depuis son espace, un
   * second appareil ouvert sur le montoir... et l'historique des poneys
   * revenait a trous, apparemment au hasard.
   *
   * On passe donc par une TRANSACTION : Firestore relit le document juste
   * avant d'ecrire et rejoue l'operation si quelqu'un l'a modifie entre les
   * deux. Le cache manuel devient inutile — la transaction voit forcement
   * l'ecriture precedente de la meme boucle.
   */
  export const ecrireNotePeda = async (
    childId: string,
    note: any,
    contexte: string,
    families: any[],
  ): Promise<boolean> => {
    // On ne se sert du state que pour retrouver QUELLE famille ouvrir ;
    // le contenu, lui, sera relu dans la transaction.
    const famRef = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === childId)) as any;
    if (!famRef) return false;

    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(doc(db, "families", famRef.id));
        if (!snap.exists()) return false;

        const data = snap.data() as any;
        const enfantsFrais = data.children || [];
        const matchChild = enfantsFrais.find((ch: any) => ch.id === childId);
        if (!matchChild) return false;

        const peda = matchChild.peda || { objectifs: [], notes: [] };
        const notes = peda.notes || [];

        // Une note existe deja pour ce creneau ?
        const dejaIndex = note.creneauId
          ? notes.findIndex((n: any) => n.creneauId === note.creneauId)
          : -1;

        let nouvellesNotes: any[];
        if (dejaIndex >= 0) {
          const existante = notes[dejaIndex];
          // Cas frequent : la reprise a ete cloturee AVANT que le poney soit
          // affecte (ou rouverte puis recloturee). L'ancien anti-doublon
          // refusait tout net, et le poney restait introuvable a jamais.
          // On complete plutot que d'ignorer.
          if (!existante.horseName && note.horseName) {
            nouvellesNotes = [...notes];
            nouvellesNotes[dejaIndex] = { ...existante, horseName: note.horseName, text: note.text };
          } else {
            return false; // rien de nouveau a apporter
          }
        } else {
          nouvellesNotes = [note, ...notes];
        }

        const updatedChildren = enfantsFrais.map((ch: any) =>
          ch.id === childId
            ? { ...ch, peda: { ...peda, notes: nouvellesNotes, updatedAt: new Date().toISOString() } }
            : ch
        );
        if (!validateChildrenUpdate(famRef.id, data.parentName || "", enfantsFrais, updatedChildren, contexte)) return false;

        tx.update(doc(db, "families", famRef.id), { children: updatedChildren, updatedAt: serverTimestamp() });
        return true;
      });
    } catch (e) {
      console.error(`ecrireNotePeda (${contexte}) :`, e);
      return false;
    }
  };

/** Ce que les notes rapides empruntent a la page, passe explicitement. */
export type DepsNotesRapides = {
  quickNoteChild: QuickNoteChild | null;
  quickNotes: Record<string, string>;
  families: any[];
  setQuickNoteChild: (v: QuickNoteChild | null) => void;
  setQuickNotes: (v: Record<string, string>) => void;
};

  export const enregistrerNotesRapides = async (deps: DepsNotesRapides) => {
    const { quickNoteChild, quickNotes, families, setQuickNoteChild, setQuickNotes } = deps;
    if (!quickNoteChild) return;
    const authorName = "Moniteur"; // On pourrait passer le user ici
    // Meme cache que la cloture : plusieurs notes rapides sur des freres et
    // soeurs s'ecrasaient mutuellement.


    for (const child of quickNoteChild.children) {
      const noteText = quickNotes[child.childId];
      if (!noteText?.trim()) continue;
      const note = {
        date: new Date().toISOString(),
        text: noteText.trim(),
        author: authorName,
        type: "manual",
        // Le poney du jour, pour que la note alimente aussi l'historique.
        horseName: child.horseName || "",
      };
      await ecrireNotePeda(child.childId, note, "montoir-note-rapide", families);
    }
    setQuickNoteChild(null);
    setQuickNotes({});
  };
