/**
 * src/app/admin/planning/enroll-communications.ts
 *
 * Ce que le panneau d'inscription ENVOIE aux familles : l'email collectif du
 * créneau (rédigé à la main ou proposé par l'IA) et les fiches de progression,
 * imprimées ou envoyées par mail.
 *
 * Séparé du panneau parce que ce sont des allers-retours réseau, pas de
 * l'orchestration d'inscription : ils ne touchent ni les places, ni l'argent.
 * Les fonctions ne connaissent pas l'état React — elles reçoivent ce qu'elles
 * doivent envoyer et rendent un résultat que l'appelant transforme en toast.
 *
 * Un point à ne pas « nettoyer » : l'envoi d'une fiche de progression renvoie
 * une RAISON d'échec en clair (progression absente, email parent manquant,
 * famille introuvable). Avant, l'échec était silencieux et l'admin croyait la
 * fiche partie.
 */

import { collection, addDoc, getDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { emailTemplates } from "@/lib/email-templates";
import { renderDerouleStage } from "@/lib/stage-deroule";

/** Destinataire d'un email de créneau. */
export type DestinataireCreneau = { email: string; parentName: string; familyId: string };

/**
 * Demande à l'IA une proposition d'email de reprise pour ce créneau.
 * Rend le sujet et le corps proposés, ou une erreur à afficher telle quelle.
 */
export async function genererEmailCreneauIA(creneau: any, enrolled: any[], families: any[]): Promise<
  { ok: true; sujet: string; corps: string } | { ok: false; erreur: string }
> {
  try {
    const cavaliers = enrolled.map((e: any) => {
      const fam = families.find(f => f.firestoreId === e.familyId);
      const child = (fam?.children || []).find((c: any) => c.id === e.childId);
      return { firstName: e.childName, galopLevel: child?.galopLevel || "—", parentName: e.familyName };
    });
    const res = await authFetch("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email_reprise", creneau, cavaliers }),
    });
    const data = await res.json();
    if (data.success) {
      return {
        ok: true,
        sujet: data.suggestedSubject || `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`,
        corps: data.emailBody || "",
      };
    }
    return { ok: false, erreur: "Erreur IA : " + (data.error || "") };
  } catch (e: any) {
    return { ok: false, erreur: "Erreur IA : " + e.message };
  }
}

/**
 * Envoie l'email du créneau à chaque famille, puis journalise l'envoi dans
 * `emailsReprise`. Rend le nombre d'envois réussis : un destinataire en échec
 * ne doit pas empêcher les autres de recevoir le message.
 */
export async function envoyerEmailCreneau(params: {
  creneau: any;
  recipients: DestinataireCreneau[];
  emailSubject: string;
  emailBody: string;
}): Promise<number> {
  const { creneau, recipients, emailSubject, emailBody } = params;
  let sent = 0;
  for (const r of recipients) {
    try {
      await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: r.email,
          subject: emailSubject,
          context: "admin_email_reprise",
          familyId: r.familyId,
          creneauId: creneau.id,
          html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;">
            <div style="background:#1e3a5f;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="color:white;margin:0;font-size:18px;font-weight:700;">Centre Équestre d'Agon-Coutainville</h1>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e8e0d0;border-top:none;">
              ${emailBody.replace(/\n/g, "<br/>")}
            </div>
            <div style="background:#f8f5f0;padding:16px 24px;border-radius:0 0 12px 12px;border:1px solid #e8e0d0;border-top:none;">
              <p style="margin:0;color:#999;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville · 02 44 84 99 96</p>
            </div>
          </div>`,
        }),
      });
      sent++;
    } catch {}
  }
  // Log dans Firestore
  await addDoc(collection(db, "emailsReprise"), {
    creneauId: creneau.id,
    creneauTitle: creneau.activityTitle,
    date: creneau.date,
    subject: emailSubject,
    message: emailBody,
    recipients: recipients.map(r => r.email),
    recipientCount: recipients.length,
    status: "sent",
    createdAt: serverTimestamp(),
  });
  return sent;
}

/**
 * Imprime les bilans de progression de tous les inscrits dans un seul
 * document. La fenêtre est ouverte AVANT les appels réseau : Safari/iOS
 * bloque un window.open qui ne suit pas immédiatement le clic.
 * Rend false si le navigateur a bloqué la fenêtre.
 */
export async function imprimerFichesProgression(enrolled: any[]): Promise<boolean> {
  if (enrolled.length === 0) return true;
  // Ouvrir la fenêtre immédiatement (geste utilisateur) pour Safari/iOS
  const w = window.open("", "_blank");
if (!w) return false;
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
  if (allHtml.length === 0) { w.document.write('<p>Aucun bilan disponible.</p>'); w.document.close(); return true; }
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
  return true;
}

/**
 * Envoie la fiche de progression (bilan + commentaire ⭐) d'UN enfant à SA
 * famille. Réutilisé par l'envoi groupé et par le bouton individuel.
 */
export async function envoyerFicheProgression(e: any, allFamilies: any[], creneau: any): Promise<{ ok: boolean; reason?: string }> {
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

/**
 * Confirmation d'inscription à un stage : email détaillé à la famille + push.
 *
 * Le « déroulé des 2 séquences » est lu dans les réglages et injecté dans le
 * mail ; s'il n'est pas saisi, la chaîne est vide et l'email part comme avant.
 */
export async function envoyerConfirmationStage(params: {
  creneau: any;
  fam: any;
  stageLines: any[];
  creneauxAInscrire: any[];
  stageMode: "semaine" | "jour";
  stageTotalTTC: number;
  stageAcompte: number;
  stageSolde: number;
  noms: string;
}): Promise<void> {
  const { creneau, fam, stageLines, creneauxAInscrire, stageMode, stageTotalTTC, stageAcompte, stageSolde, noms } = params;
  // Envoyer email de confirmation stage automatiquement
  if (fam.parentEmail) {
    try {
      const dates = creneauxAInscrire.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })).join(", ");
      // Deroule des 2 sequences : chaine vide si le reglage n'est pas
      // saisi, auquel cas l'email part comme avant.
      const derouleSnap = await getDoc(doc(db, "settings", "stageDeroule"));
      const derouleHtml = renderDerouleStage(derouleSnap.exists() ? (derouleSnap.data() as any) : null);
      const confirmEmail = emailTemplates.confirmationStage({
        parentName: fam.parentName || "",
        enfants: stageLines.map(l => ({ name: l.childName, prix: l.prixReduit, remise: l.remiseEuros })),
        stageTitle: creneau.activityTitle,
        dates: stageMode === "jour" ? new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : dates,
        totalTTC: stageTotalTTC,
        acompte: stageAcompte,
        solde: stageSolde,
        derouleHtml,
      });
      authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: fam.parentEmail,
          ...confirmEmail,
          context: "admin_confirmation_stage",
          template: "confirmationStage",
          familyId: fam.firestoreId,
          creneauId: creneau.id,
        }),
      }).catch(e => console.warn("Email stage:", e));

      // Notification push
      authFetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: fam.firestoreId,
          title: `✅ Inscription confirmée`,
          body: `${noms} inscrit(s) au stage ${creneau.activityTitle}`,
          url: "/espace-cavalier/reservations",
        }),
      }).catch(() => {});
    } catch (e) { console.error("Email confirmation stage:", e); }
  }
}
