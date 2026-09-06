/**
 * src/app/admin/planning/enroll-panel-actions.ts
 *
 * Actions du panneau d'inscription qui parlent à Firestore ou au serveur,
 * sorties de EnrollPanel.tsx sur le modèle de inscription-actions.ts : tout
 * ce dont elles ont besoin arrive par un contexte explicite, ce qu'elles
 * doivent rafraîchir passe par des rappels. Les corps sont ceux du panneau,
 * à l'identique.
 */

import { collection, getDocs, getDoc, updateDoc, deleteField, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { annulerMinuterieConfirmation } from "./minuteries-confirmation";
import { createReservation, removeChildFromCreneau, deleteReservations } from "@/lib/planning-services";
import type { Creneau, EnrolledChild } from "./types";

export interface ContexteActions {
  creneau: Creneau & { id: string };
  families: any[];
  allFamilies: any[];
  enrolled: any[];
  confirmationEnAttente: { familyId: string; familyName: string; nbStages: number; envoiPrevuA: string } | null;
  dateFinSaisonEffective: Date;
  highlightBusy: string;
  holdActif: any | null;
  holdReleasing: boolean;
  petitGroupeEnCours: boolean;
}

export interface RappelsActions {
  panelToast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  onRefresh?: () => Promise<void>;
  onUnenroll: (id: string, childId: string) => Promise<void>;
  setEnvoiConfirmation: (v: "" | "envoi" | "envoye" | "annule") => void;
  setEnrollingSaison: (v: boolean) => void;
  setUnenrollingSaison: (v: string) => void;
  setJustEnrolled: (v: string) => void;
  setInscriptionFaite: (v: boolean) => void;
  setConversion: (v: string | null) => void;
  setSelFam: (v: string) => void;
  setSelChild: (v: string) => void;
  setSelectedChildren: (v: string[]) => void;
  setPreinscription: (v: boolean) => void;
  setShowPay: (v: boolean) => void;
  setSearch: (v: string) => void;
  setInscriptionMode: (v: "ponctuel" | "annuel") => void;
  setHighlightBusy: (v: string) => void;
  setHoldReleasing: (v: boolean) => void;
  setRechargerAttente: (f: (n: number) => number) => void;
  setPetitGroupeEnCours: (v: boolean) => void;
}

/** Confirmation de stage en attente d'envoi groupé : la devancer d'un clic. */
export async function envoyerConfirmationMaintenant(ctx: ContexteActions, rappels: RappelsActions) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!confirmationEnAttente) return;
  setEnvoiConfirmation("envoi");
  annulerMinuterieConfirmation(confirmationEnAttente.familyId);
  try {
    const res = await authFetch("/api/admin/confirmation-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "envoyer", familyId: confirmationEnAttente.familyId, force: true }),
    });
    const json = await res.json().catch(() => null);
    if (json?.sent) {
      setEnvoiConfirmation("envoye");
      panelToast(`Confirmation envoyée — 1 email pour ${confirmationEnAttente.nbStages} stage(s)`, "success");
    } else {
      setEnvoiConfirmation("");
      panelToast(`Envoi impossible : ${json?.reason || "erreur"}`, "error");
    }
  } catch (e: any) {
    setEnvoiConfirmation("");
    panelToast(`Envoi impossible : ${e?.message || e}`, "error");
  }
}

export async function annulerConfirmationEnAttente(ctx: ContexteActions, rappels: RappelsActions) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!confirmationEnAttente) return;
  annulerMinuterieConfirmation(confirmationEnAttente.familyId);
  try {
    await authFetch("/api/admin/confirmation-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "annuler", familyId: confirmationEnAttente.familyId }),
    });
    setEnvoiConfirmation("annule");
    panelToast("Confirmation annulée — aucun email ne partira", "success");
  } catch (e: any) {
    panelToast(`Annulation impossible : ${e?.message || e}`, "error");
  }
}

/**
 * Inscription établissement sur TOUTE la saison : tous les créneaux récurrents
 * à venir (même titre, même heure, même jour), SANS forfait ni paiement parent.
 */
export async function inscrireSaisonEtablissement(ctx: ContexteActions, rappels: RappelsActions, childId: string, childName: string, familyId: string, familyName: string) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!childId) { panelToast("Sélectionne d'abord un cavalier", "error"); return; }
  setEnrollingSaison(true);
  try {
    const creneauDate = new Date(creneau.date); creneauDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = creneauDate > today ? creneauDate : today;
    const startStr = start.toISOString().split("T")[0];
    const endStr = dateFinSaisonEffective.toISOString().split("T")[0];
    const jourRef = new Date(creneau.date + "T12:00:00").getDay();

    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", startStr),
      where("date", "<=", endStr),
    ));
    // Créneaux récurrents : même cours, même heure, même jour de semaine, à venir
    const cibles = snap.docs.filter(d => {
      const c = d.data() as any;
      if (c.activityTitle !== creneau.activityTitle) return false;
      if (c.startTime !== creneau.startTime) return false;
      if (new Date(c.date + "T12:00:00").getDay() !== jourRef) return false;
      // Pas déjà inscrit
      return !(c.enrolled || []).some((e: any) => e.childId === childId);
    });

    let count = 0;
    for (const d of cibles) {
      const c = d.data() as any;
      const inscrit = {
        childId, childName, familyId, familyName,
        enrolledAt: new Date().toISOString(), presence: null,
        institutional: true, // marqueur : séance facturée à l'établissement
      };
      const newEnrolled = [...(c.enrolled || []), inscrit];
      await updateDoc(doc(db, "creneaux", d.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
      // La fiche du cavalier et l'espace famille listent les « prochaines
      // séances » depuis les réservations, pas depuis les créneaux : sans
      // cette écriture, un enfant inscrit pour la saison n'avait aucune
      // séance à venir sur sa fiche.
      await createReservation(inscrit as EnrolledChild, { id: d.id, ...c });
      count++;
    }
    panelToast(`🏫 ${childName} inscrit(e) sur ${count} séance(s) de la saison (établissement, sans facturation)`, "success");
    setJustEnrolled(`🏫 ${childName} — ${count} séances de la saison (établissement)`);
    // L'inscription est faite : le panneau peut se fermer sans demander
    // « quitter sans enregistrer ? ».
    setInscriptionFaite(true);
    await onRefresh?.();
  } catch (e) {
    console.error("Inscription saison établissement:", e);
    panelToast("Erreur lors de l'inscription saison", "error");
  }
  setEnrollingSaison(false);
}

/** Miroir exact de l'inscription saison : mêmes créneaux, marqueur établissement. */
export async function desinscrireSaisonEtablissement(ctx: ContexteActions, rappels: RappelsActions, childId: string, childName: string) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!confirm(`Retirer ${childName} de toutes les séances de la saison de ce cours (inscription établissement) ?`)) return;
  setUnenrollingSaison(childId);
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startStr = today.toISOString().split("T")[0];
    const endStr = dateFinSaisonEffective.toISOString().split("T")[0];
    const jourRef = new Date(creneau.date + "T12:00:00").getDay();
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", startStr),
      where("date", "<=", endStr),
    ));
    const cibles = snap.docs.filter(d => {
      const c = d.data() as any;
      if (c.activityTitle !== creneau.activityTitle) return false;
      if (c.startTime !== creneau.startTime) return false;
      if (new Date(c.date + "T12:00:00").getDay() !== jourRef) return false;
      return (c.enrolled || []).some((e: any) => e.childId === childId && e.institutional);
    });
    let count = 0;
    for (const d of cibles) {
      await removeChildFromCreneau(d.id, childId);
      await deleteReservations(d.id, childId);
      count++;
    }
    panelToast(`🏫 ${childName} retiré(e) de ${count} séance(s) de la saison`, "success");
    await onRefresh?.();
  } catch (e) {
    console.error("Désinscription saison établissement:", e);
    panelToast("Erreur lors de la désinscription saison", "error");
  }
  setUnenrollingSaison("");
}

/**
 * Transforme une pré-inscription en inscription définitive : on retire la
 * pré-inscription puis on REPASSE PAR LE FORMULAIRE, pré-rempli, pour que le
 * mode de règlement (dont le SEPA) soit choisi explicitement.
 */
export async function convertirPreinscription(ctx: ContexteActions, rappels: RappelsActions, e: any) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!confirm(
    `Transformer la pré-inscription de ${e.childName} en inscription définitive ?\n\n` +
    `Elle sera retirée de la liste et le formulaire s'ouvrira pré-rempli : ` +
    `vous choisirez le mode de règlement (dont le prélèvement SEPA) avant de valider.`
  )) return;
  setConversion(e.childId);
  try {
    await onUnenroll(creneau.id!, e.childId);
    setSelFam(e.familyId);
    setSelChild(e.childId);
    setSelectedChildren([e.childId]);
    setPreinscription(false);
    setShowPay(false);
    setSearch(e.familyName || "");
    if ((e as any).preinscriptionMode === "annuel") setInscriptionMode("annuel");
    // Sur un stage, le cavalier se coche dans le selecteur multi-enfants.
    if ((e as any).preinscriptionMode === "stage") setSelectedChildren([e.childId]);
    panelToast(`${e.childName} — choisissez le règlement puis validez l'inscription`, "success");
    await onRefresh?.();
  } catch (err: any) {
    panelToast(`Échec : ${err?.message || err}`, "error");
  }
  setConversion(null);
}

/** Surlignage manuel d'une inscription (marqueur libre, porté par l'inscription à ce créneau). */
export async function toggleHighlight(ctx: ContexteActions, rappels: RappelsActions, e: any) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (!creneau.id || highlightBusy) return;
  setHighlightBusy(e.childId);
  try {
    const snap = await getDoc(doc(db, "creneaux", creneau.id));
    if (!snap.exists()) return;
    const list = (snap.data() as any).enrolled || [];
    const maj = list.map((x: any) =>
      x.childId === e.childId ? { ...x, highlight: !x.highlight } : x
    );
    await updateDoc(doc(db, "creneaux", creneau.id), { enrolled: maj });
    await onRefresh?.();
  } catch (err) {
    console.error("Surlignage :", err);
  }
  setHighlightBusy("");
}

/** Libère explicitement une place tenue pour une famille notifiée depuis la liste d'attente. */
export async function libererHold(ctx: ContexteActions, rappels: RappelsActions) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  const h = holdActif;
  if (!h || holdReleasing) return;
  if (!confirm(`Libérer la place réservée à ${h.childName} ? Sa demande repassera en liste d'attente.`)) return;
  setHoldReleasing(true);
  try {
    await updateDoc(doc(db, "creneaux", creneau.id!), { waitlistHold: deleteField() });
    if (h.waitlistEntryId) {
      // La famille garde sa place dans la file : on ne supprime pas
      // l'entrée, on la remet simplement en attente.
      await updateDoc(doc(db, "waitlist", h.waitlistEntryId), {
        status: "waiting",
        holdUntil: deleteField(),
        releasedByAdminAt: new Date().toISOString(),
      }).catch(() => {});
    }
    setRechargerAttente(n => n + 1);   // l'entree repasse en « waiting » : la reafficher
    await onRefresh?.();
  } catch (e) {
    console.error("Libération hold :", e);
    alert("Libération impossible. Réessayez.");
  }
  setHoldReleasing(false);
}

/** Rejoue à la demande la vérification « balade sous le minimum » du cron J-2, simulation puis envoi réel. */
export async function testerPetitGroupe(ctx: ContexteActions, rappels: RappelsActions) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (petitGroupeEnCours) return;
  setPetitGroupeEnCours(true);
  try {
    const appel = async (dry: boolean) => {
      const r = await authFetch("/api/admin/tester-petit-groupe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: creneau.date, dry }),
      });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error(d?.error || "Erreur");
      return d;
    };
    const sim = await appel(true);
    if (sim.desactive) {
      alert("L'option « balades petit comité » est désactivée dans Paramètres → Annulation. Active-la pour tester.");
      return;
    }
    if (sim.horsPeriode) {
      alert(`Hors période : l'option « petit comité » ne s'applique que du 1er septembre au 10 juillet. Aucune vérification pour le ${creneau.date}.`);
      return;
    }
    if (!sim.baladesSousSeuil) {
      alert(
        sim.baladesExaminees === 0
          ? `Aucune balade à examiner le ${creneau.date} — déjà traitée (un seul envoi par balade), clôturée, ou sans minimum de participants configuré sur l'activité.`
          : `Balade au-dessus du minimum : les inscrits confirmés atteignent le seuil, aucun email à envoyer. (Rappel : une inscription « place tenue » non réglée ne compte pas.)`
      );
      return;
    }
    if (!confirm(
      `⚠️ ${sim.baladesSousSeuil} balade(s) sous le minimum le ${creneau.date} — ` +
      `${sim.famillesNotifiees} famille(s) recevront l'email de choix (supplément / report / avoir).\n\n` +
      `ENVOYER POUR DE VRAI ? Chaque balade ne peut être traitée qu'une seule fois.`
    )) return;
    const reel = await appel(false);
    panelToast(
      `🌙 ${reel.famillesNotifiees} famille(s) notifiée(s)` +
      (reel.bloques ? ` · ${reel.bloques} bloquée(s) par le mode restreint (voir Journal des emails)` : "") +
      (reel.sansEmail ? ` · ${reel.sansEmail} sans adresse email` : ""),
      "success",
    );
    await onRefresh?.();
  } catch (e: any) {
    console.error("Test petit groupe:", e);
    panelToast(e?.message || "Erreur lors du test", "error");
  } finally {
    setPetitGroupeEnCours(false);
  }
}

/** Après une inscription : relit les créneaux et prévient si l'un est devenu complet. */
export async function checkAndAlertIfFull(ctx: ContexteActions, rappels: RappelsActions, creneauIds: string[]) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (creneauIds.length === 0) return;
  try {
    const checks = await Promise.all(creneauIds.map(async (cid) => {
      try {
        const snap = await getDoc(doc(db, "creneaux", cid));
        if (!snap.exists()) return null;
        const data = snap.data() as any;
        const enrolledCount = (data.enrolled || []).length;
        const maxPlaces = data.maxPlaces || 0;
        if (maxPlaces > 0 && enrolledCount >= maxPlaces) {
          return {
            title: data.activityTitle || "Créneau",
            date: data.date as string,
            isStage: data.activityType === "stage" || data.activityType === "stage_journee",
          };
        }
        return null;
      } catch { return null; }
    }));
    const fulls = checks.filter(Boolean) as Array<{ title: string; date: string; isStage: boolean }>;
    if (fulls.length === 0) return;

    // Regrouper par titre pour ne pas spammer si un stage occupe plusieurs jours
    const byTitle = new Map<string, { count: number; isStage: boolean }>();
    for (const f of fulls) {
      const cur = byTitle.get(f.title) || { count: 0, isStage: f.isStage };
      cur.count += 1;
      byTitle.set(f.title, cur);
    }
    byTitle.forEach(({ count, isStage }, title) => {
      const label = isStage ? "Stage" : "Créneau";
      const suffix = count > 1 ? ` (${count} jours)` : "";
      panelToast(
        `⚠️ ${label} "${title}"${suffix} COMPLET — pense à ouvrir un nouveau créneau`,
        "warning",
        10000, // 10s pour avoir le temps de lire
      );
    });
  } catch (e) {
    console.warn("checkAndAlertIfFull:", e);
  }
}

/** Fiches de progression de tous les inscrits, en une seule fenêtre d'impression. */
export async function imprimerProgressions(ctx: ContexteActions, rappels: RappelsActions) {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  if (enrolled.length === 0) return;
  // Ouvrir la fenêtre immédiatement (geste utilisateur) pour Safari/iOS
  const w = window.open("", "_blank");
  if (!w) { panelToast("Le navigateur a bloqué l'ouverture. Autorisez les popups.", "error"); return; }
  w.document.write('<html><body style="font-family:sans-serif;padding:20px;"><p>Chargement des bilans...</p></body></html>');
  // Collecter tous les bilans HTML
  const allHtml: string[] = [];
  for (const e of enrolled) {
    try {
      const res = await authFetch(`/api/progression-pdf?childId=${e.childId}&familyId=${e.familyId}&childName=${encodeURIComponent(e.childName)}`);
      if (res.ok) {
        let html = await res.text();
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) allHtml.push(bodyMatch[1]);
        else allHtml.push(html);
      }
    } catch {}
  }
  if (allHtml.length === 0) { w.document.write('<p>Aucun bilan disponible.</p>'); w.document.close(); return; }
  const combined = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bilans de progression</title>
    <style>
      @media print { .page-break { page-break-before: always; } }
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    </style>
  </head><body>
    ${allHtml.map((h, i) => i === 0 ? h : `<div class="page-break"></div>${h}`).join("\n")}
  </body></html>`;
  w.document.open();
  w.document.write(combined);
  w.document.close();
}

/** Envoie la fiche de progression d'UN enfant à SA famille. */
export async function envoyerProgressionA(ctx: ContexteActions, rappels: RappelsActions, e: any): Promise<{ ok: boolean; reason?: string }> {
  const { creneau, families, allFamilies, enrolled, confirmationEnAttente, dateFinSaisonEffective, highlightBusy, holdActif, holdReleasing, petitGroupeEnCours } = ctx;
  const { panelToast, onRefresh, onUnenroll, setEnvoiConfirmation, setEnrollingSaison, setUnenrollingSaison, setJustEnrolled, setInscriptionFaite, setConversion, setSelFam, setSelChild, setSelectedChildren, setPreinscription, setShowPay, setSearch, setInscriptionMode, setHighlightBusy, setHoldReleasing, setRechargerAttente, setPetitGroupeEnCours } = rappels;
  const fam = allFamilies.find((f: any) => f.firestoreId === e.familyId);
  if (!fam) return { ok: false, reason: "famille introuvable (inscription orpheline ?)" };
  const email = fam?.parentEmail;
  if (!email) return { ok: false, reason: "email parent manquant sur la fiche famille" };
  try {
    // Récupérer le HTML de la fiche progression
    const pdfRes = await authFetch(`/api/progression-pdf?childId=${e.childId}&familyId=${e.familyId}&childName=${encodeURIComponent(e.childName)}`);
    if (pdfRes.status === 404) return { ok: false, reason: "aucune progression enregistrée — ouvre 📊 et crée le bilan d'abord" };
    if (!pdfRes.ok) return { ok: false, reason: `fiche indisponible (HTTP ${pdfRes.status})` };
    const progressionHtml = await pdfRes.text();
    // Retirer les éléments no-print (barre d'impression)
    const cleanHtml = progressionHtml.replace(/<div class="no-print"[\s\S]*?<\/div>\s*<div class="no-print"[\s\S]*?<\/div>/g, "");
    const r = await authFetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `Bilan de progression — ${e.childName} — ${creneau.activityTitle}`,
        html: cleanHtml,
        context: "admin_bilan_progression",
        template: "bilanProgression",
        familyId: e.familyId,
        creneauId: creneau.id,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, reason: d?.error || `envoi refusé (HTTP ${r.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "erreur réseau" };
  }
}
