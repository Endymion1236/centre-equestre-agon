/**
 * src/app/admin/montoir/montoir-chutes.ts
 *
 * Ecriture et suppression d'une chute dans le registre.
 *
 * Pourquoi a part : le registre des chutes est un document de securite, tenu
 * a l'echelle de la saison et consulte hors du montoir (/admin/registre-chutes).
 * L'id du document est DETERMINISTE (`${creneauId}_${childId}`) : une chute par
 * cavalier et par seance, jamais de doublon meme si on enregistre deux fois.
 * On y fige le nom du cavalier et du poney AU MOMENT DES FAITS — c'est
 * volontaire, un renommage ulterieur ne doit pas reecrire l'histoire.
 *
 * Code DEPLACE tel quel depuis page.tsx : formulaire, libelles et toasts
 * inchanges.
 */

"use client";

import { doc, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { chuteKey } from "./montoir-helpers";
import type { ChuteForm, ChuteModal, Toast } from "./types";

/** Tout ce que le registre emprunte a la page, passe explicitement. */
export type DepsChute = {
  chuteModal: ChuteModal | null;
  chuteForm: ChuteForm;
  chutes: Record<string, any>;
  /** Date affichee au montoir (jour de la reprise), au format YYYY-MM-DD. */
  dateStr: string;
  displayFromHorseName: (horseName: string) => string;
  toast: Toast;
  setChutes: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  setChuteModal: (v: ChuteModal | null) => void;
  setChuteSaving: (v: boolean) => void;
};

  export const enregistrerChute = async (deps: DepsChute) => {
    const { chuteModal, chuteForm, chutes, dateStr, displayFromHorseName, toast, setChutes, setChuteModal, setChuteSaving } = deps;
    if (!chuteModal) return;
    const { c, e } = chuteModal;
    if (!chuteForm.circonstances.trim()) { toast("Merci d'indiquer les circonstances de la chute.", "error"); return; }
    setChuteSaving(true);
    const id = chuteKey(c.id, e.childId);
    const isNew = !chutes[id];
    const data: any = {
      date: dateStr,
      creneauId: c.id, activityTitle: c.activityTitle || "",
      startTime: c.startTime || "", endTime: c.endTime || "",
      childId: e.childId, childName: e.childName || "", familyName: e.familyName || "",
      horseName: e.horseName || "", horseDisplay: displayFromHorseName(e.horseName) || "",
      monitor: c.monitor || "",
      circonstances: chuteForm.circonstances.trim(), gravite: chuteForm.gravite || "", consequence: chuteForm.consequence || "", suites: chuteForm.suites.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "chutes", id), isNew ? { ...data, createdAt: serverTimestamp() } : data, { merge: true });
      setChutes(prev => ({ ...prev, [id]: { id, ...data } }));
      toast(isNew ? "Chute enregistrée dans le registre." : "Chute mise à jour.", "success");
      setChuteModal(null);
    } catch (err) { console.error(err); toast("Erreur lors de l'enregistrement de la chute.", "error"); }
    setChuteSaving(false);
  };

  export const supprimerChute = async (deps: DepsChute) => {
    const { chuteModal, toast, setChutes, setChuteModal, setChuteSaving } = deps;
    if (!chuteModal) return;
    const { c, e } = chuteModal;
    const id = chuteKey(c.id, e.childId);
    setChuteSaving(true);
    try {
      await deleteDoc(doc(db, "chutes", id));
      setChutes(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast("Chute retirée du registre.", "success");
      setChuteModal(null);
    } catch (err) { console.error(err); toast("Erreur lors de la suppression.", "error"); }
    setChuteSaving(false);
  };
