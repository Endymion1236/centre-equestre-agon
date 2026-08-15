/**
 * src/app/admin/planning/planning-emails.ts
 *
 * Prévenir les familles inscrites qu'un créneau change (activité et/ou
 * horaire). Envoie un email récapitulatif (ancien → nouveau) via l'API
 * send-email.
 *
 * Pourquoi ce fichier : l'email part au moment où l'admin modifie un créneau,
 * mais il n'a rien à voir avec l'enregistrement lui-même — il ne doit ni le
 * retarder ni le faire échouer. Séparé, on voit aussi d'un coup d'œil les deux
 * règles qui comptent ici : un seul email par FAMILLE (même si deux enfants
 * sont inscrits au même créneau), et la possibilité de RENOTIFIER après coup
 * en ressaisissant l'ancien horaire à la main — cas des familles à prévenir
 * alors que le créneau est déjà enregistré avec ses nouvelles valeurs.
 *
 * La fonction ne connaît pas l'état React : le créneau, le formulaire, les
 * familles, le toast et le drapeau « envoi en cours » lui sont passés. Son
 * corps est recopié tel quel depuis page.tsx, indentation d'origine comprise :
 * le message est écrit dans un gabarit multiligne qu'un ré-indentation aurait
 * modifié.
 */

"use client";

import type { Family } from "@/types";
import { Creneau } from "./types";
import { authFetch } from "@/lib/auth-fetch";

type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;

export async function notifierFamillesInscrites(params: {
  editCreneau: (Creneau & { id: string }) | null;
  editForm: any;
  editSelectedDayIds: string[];
  families: (Family & { firestoreId: string })[];
  toast: Toast;
  setNotifyingEnrolled: (v: boolean) => void;
}): Promise<void> {
  const { editCreneau, editForm, editSelectedDayIds, families, toast, setNotifyingEnrolled } = params;
    if (!editCreneau) return;
    const enrolled = ((editCreneau as any).enrolled || []) as any[];
    if (enrolled.length === 0) return;
    const oldTitle = (editCreneau.activityTitle || "").trim();
    const newTitle = (editForm.activityTitle || "").trim();
    const oldHoraire = `${editCreneau.startTime}–${editCreneau.endTime}`;
    const newHoraire = `${editForm.startTime}–${editForm.endTime}`;
    let titleChanged = newTitle !== oldTitle;
    let timeChanged = editForm.startTime !== editCreneau.startTime || editForm.endTime !== editCreneau.endTime;
    let oldHoraireAffiche = oldHoraire;
    // RENOTIFICATION : si le creneau est deja enregistre avec ses nouvelles
    // valeurs, la difference a disparu — cas typique : familles prevenues
    // pendant le mode restreint (emails bloques), a reprevenir apres coup.
    // On demande alors l'ancien horaire a la main plutot que de refuser.
    if (!titleChanged && !timeChanged) {
      const saisie = window.prompt(
        "Aucun changement détecté (créneau déjà enregistré).\n\n" +
        "Pour RENVOYER une notification de changement d'horaire, indiquez " +
        "l'ANCIEN horaire tel que les familles doivent le voir barré " +
        "(ex : 10:00–12:00) — ou Annuler.",
        ""
      );
      if (!saisie || !saisie.trim()) return;
      oldHoraireAffiche = saisie.trim();
      timeChanged = true;
    }
    setNotifyingEnrolled(true);
    try {
      const dateFR = new Date(editCreneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const dateCourt = new Date(editCreneau.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      const estStage = editCreneau.activityType === "stage" || editCreneau.activityType === "stage_journee";
      // Regroupe par email de famille (un seul email même si plusieurs enfants inscrits)
      const byEmail = new Map<string, { parentName: string; children: string[] }>();
      for (const e of enrolled) {
        const fam = families.find(f => f.firestoreId === e.familyId);
        if (!fam?.parentEmail) continue;
        const entry = byEmail.get(fam.parentEmail) || { parentName: fam.parentName || "", children: [] };
        entry.children.push(e.childName);
        byEmail.set(fam.parentEmail, entry);
      }
      if (byEmail.size === 0) { toast("Aucun email de famille trouvé pour les inscrits", "error"); setNotifyingEnrolled(false); return; }
      const changesHtml = [
        titleChanged ? `<li>Activité : <span style="text-decoration:line-through;color:#94a3b8">${oldTitle}</span> → <strong>${newTitle}</strong></li>` : "",
        timeChanged ? `<li>Horaire : <span style="text-decoration:line-through;color:#94a3b8">${oldHoraireAffiche}</span> → <strong>${newHoraire}</strong></li>` : "",
      ].join("");
      let sent = 0;
      for (const [email, info] of byEmail) {
        const quiEst = info.children.length > 1 ? `sont inscrit·e·s ${info.children.join(", ")}` : `est inscrit·e ${info.children[0]}`;
        const nbJours = editSelectedDayIds.length || 1;
        const joursTxt = estStage ? ` (${nbJours} jour${nbJours > 1 ? "s" : ""} concerné${nbJours > 1 ? "s" : ""})` : "";
        const intro = estStage
          ? `Le stage <strong>${newTitle || oldTitle}</strong> (${dateFR}) a été modifié${joursTxt}, pour ${quiEst} :`
          : `La séance du <strong>${dateFR}</strong> à laquelle ${quiEst} a été modifiée :`;
        const html = `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
          <p>Bonjour${info.parentName ? " " + info.parentName : ""},</p>
          <p>${intro}</p>
          <ul>${changesHtml}</ul>
          <p>Votre réservation reste valable, elle est simplement décalée : rien n'est à refaire de votre côté. Si ce nouvel horaire ne vous convient pas, contactez-nous et nous chercherons ensemble une autre date.</p>
          <p>À bientôt,<br/>Le Centre Équestre d'Agon-Coutainville</p>
        </div>`;
        try {
          await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: estStage ? `Modification de votre stage — ${dateCourt}` : `Modification de votre séance du ${dateCourt}`,
              html,
              context: "admin_creneau_modifie",
              template: "creneauModifie",
              creneauId: editCreneau.id,
            }),
          });
          sent++;
        } catch (e) { console.warn("Email inscrit:", e); }
      }
      toast(`✉️ ${sent} famille${sent > 1 ? "s" : ""} prévenue${sent > 1 ? "s" : ""}`, "success");
    } catch (e) {
      console.error("Notify inscrits:", e);
      toast("Erreur lors de l'envoi", "error");
    }
    setNotifyingEnrolled(false);
}
