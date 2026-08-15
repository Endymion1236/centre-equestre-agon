/**
 * src/app/admin/montoir/useDicteeBilan.ts
 *
 * Le bilan pedagogique dicte, propose juste apres la cloture d'une reprise :
 * la monitrice parle, Whisper transcrit, l'IA structure la note, et
 * l'enregistrement met a jour la fiche du cavalier (note, galop, objectifs).
 *
 * Pourquoi un hook et pas un composant : cet etat (enregistrement en cours,
 * transcriptions, bilans analyses) doit vivre AUSSI LONGTEMPS QUE LA PAGE.
 * S'il descendait dans le panneau, qui n'est monte que le temps du bilan,
 * une transcription encore en vol serait perdue a la fermeture. Le hook est
 * appele au niveau de la page, exactement la ou l'etat se trouvait avant.
 *
 * Code DEPLACE tel quel depuis page.tsx : appels API, messages d'alerte et
 * format de la note structurée inchangés.
 */

"use client";

import { useState, useRef } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import type { Toast } from "./types";

/** Ce que le bilan emprunte a la page, relu a chaque rendu. */
export type DepsBilan = {
  families: any[];
  /** Creneau qui vient d'etre cloture (vide si le panneau est ferme). */
  quickNoteCid: string;
  toast: Toast;
};

export function useDicteeBilan({ families, quickNoteCid, toast }: DepsBilan) {
  const [recording, setRecording] = useState<string | null>(null); // childId en cours d'enregistrement
  const [transcripts, setTranscripts] = useState<Record<string, string>>({}); // childId → texte dicté
  const [iaLoading, setIaLoading] = useState<Record<string, boolean>>({}); // childId → loading
  const [iaBilans, setIaBilans] = useState<Record<string, any>>({}); // childId → bilan structuré
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Dictée vocale ──────────────────────────────────────────────────────────
  const startRecording = async (childId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Choisir le format supporté
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // Arrêter toutes les pistes micro
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const audioFile = new File([audioBlob], `bilan_${childId}.${ext}`, { type: mimeType });
        // Envoyer à Whisper
        await transcribeWithWhisper(childId, audioFile);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500); // chunks toutes les 500ms
      setRecording(childId);
    } catch (e: any) {
      alert(`Impossible d'accéder au microphone : ${e.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(null);
  };

  const transcribeWithWhisper = async (childId: string, audioFile: File) => {
    setIaLoading(prev => ({ ...prev, [childId]: true }));
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      const res = await authFetch("/api/whisper", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setTranscripts(prev => ({ ...prev, [childId]: data.text }));
      } else {
        alert(`Erreur Whisper : ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erreur transcription : ${e.message}`);
    }
    setIaLoading(prev => ({ ...prev, [childId]: false }));
  };

  const analyserBilanIA = async (child: any, creneauInfo: any) => {
    const transcript = transcripts[child.childId];
    if (!transcript?.trim()) return;
    setIaLoading(prev => ({ ...prev, [child.childId]: true }));

    // Récupérer les infos pédagogiques de l'enfant
    const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
    const matchChild = famDoc?.children.find((ch: any) => ch.id === child.childId);
    const peda = matchChild?.peda || { objectifs: [], notes: [] };
    const recentNotes = (peda.notes || []).slice(0, 3).map((n: any) => n.text);

    try {
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bilan_peda",
          transcript,
          child: {
            firstName: matchChild?.firstName || child.childName,
            lastName: matchChild?.lastName || "",
            galopLevel: matchChild?.galopLevel || "—",
            objectifs: peda.objectifs || [],
            recentNotes,
          },
          seance: {
            activityTitle: creneauInfo.activityTitle,
            date: new Date(creneauInfo.date).toLocaleDateString("fr-FR"),
            horseName: child.horseName || "",
          },
        }),
      });
      const data = await res.json();
      if (data.success) setIaBilans(prev => ({ ...prev, [child.childId]: { ...data.bilan, creneauId: creneauInfo.id } }));
      else alert(`Erreur IA : ${data.error}`);
    } catch (e: any) { alert(`Erreur : ${e.message}`); }
    setIaLoading(prev => ({ ...prev, [child.childId]: false }));
  };

  const saveBilanIA = async (child: any, bilan: any) => {
    const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
    if (!famDoc) return;
    const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
    if (!matchChild) return;
    const peda = matchChild.peda || { objectifs: [], notes: [] };

    // 1. Créer la note structurée
    const noteTexte = [
      bilan.note.pointsForts ? `✅ Points forts : ${bilan.note.pointsForts}` : "",
      bilan.note.aTravailler ? `🔧 À travailler : ${bilan.note.aTravailler}` : "",
      bilan.note.objectifSuivant ? `🎯 Prochain objectif : ${bilan.note.objectifSuivant}` : "",
    ].filter(Boolean).join("\n");

    const newNote = {
      date: new Date().toISOString(),
      text: noteTexte,
      rawTranscript: transcripts[child.childId] || "",
      author: "Bilan IA — Moniteur",
      type: "bilan_ia",
      creneauId: bilan.creneauId || "",
      activityTitle: quickNoteCid,
    };

    let updatedPeda = { ...peda, notes: [newNote, ...peda.notes], updatedAt: new Date().toISOString() };

    // 2. Mettre à jour le galop si mentionné
    let galopUpdate = matchChild.galopLevel;
    if (bilan.galopUpdate && bilan.galopUpdate !== matchChild.galopLevel) {
      galopUpdate = bilan.galopUpdate;
    }

    // 3. Valider des objectifs existants
    if (bilan.objectifsAValider?.length > 0) {
      updatedPeda.objectifs = (updatedPeda.objectifs || []).map((o: any) =>
        bilan.objectifsAValider.includes(o.id) ? { ...o, status: "valide", validatedAt: new Date().toISOString() } : o
      );
    }

    // 4. Créer un nouvel objectif si suggéré
    if (bilan.nouvelObjectif?.label) {
      const newObj = {
        id: `obj_${Date.now()}`,
        label: bilan.nouvelObjectif.label,
        category: bilan.nouvelObjectif.category || "technique",
        status: "en_cours",
        createdAt: new Date().toISOString(),
      };
      updatedPeda.objectifs = [newObj, ...(updatedPeda.objectifs || [])];
    }

    const updatedChildren = famDoc.children.map((ch: any) =>
      ch.id === child.childId
        ? { ...ch, peda: updatedPeda, galopLevel: galopUpdate }
        : ch
    );

    await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });

    // Supprimer le bilan de l'état local
    setIaBilans(prev => { const n = { ...prev }; delete n[child.childId]; return n; });
    setTranscripts(prev => { const n = { ...prev }; delete n[child.childId]; return n; });
    toast(`✅ Bilan IA enregistré pour ${child.childName}`, "success");
  };

  return {
    recording,
    transcripts, setTranscripts,
    iaLoading,
    iaBilans, setIaBilans,
    startRecording, stopRecording,
    analyserBilanIA, saveBilanIA,
  };
}
