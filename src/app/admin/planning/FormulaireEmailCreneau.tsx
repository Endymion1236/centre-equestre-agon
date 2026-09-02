"use client";

/**
 * src/app/admin/planning/FormulaireEmailCreneau.tsx
 *
 * Écrire aux familles inscrites sur une séance : un sujet, un message, et
 * l'envoi — avec une proposition de texte rédigée par l'assistant.
 *
 * Les destinataires sont dédupliqués par adresse : deux enfants d'une même
 * famille sur le créneau, un seul courriel.
 */

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { emailLayout, emailParagraphe } from "@/lib/email-templates";
import { Loader2, X, Send, Sparkles } from "lucide-react";

export interface FormulaireEmailCreneauProps {
  creneau: any;
  /** Les cavaliers inscrits sur la séance. */
  enrolled: any[];
  families: any[];
  panelToast: (message: string, type?: any) => void;
  /** Ouvert ou fermé — l'en-tête de la séance porte le bouton. */
  ouvert: boolean;
  onFermer: () => void;
}

export default function FormulaireEmailCreneau({
  creneau, enrolled, families, panelToast, ouvert, onFermer,
}: FormulaireEmailCreneauProps) {
  // Le sujet part du nom de la séance et de sa date : c'est ce qu'on écrit
  // neuf fois sur dix, et l'écran d'inscription n'a plus à le préparer.
  const sujetParDefaut = () =>
    `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`;
  const [emailSubject, setEmailSubject] = useState(sujetParDefaut);
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailGenerating, setEmailGenerating] = useState(false);
  const showEmailForm = ouvert;
  const setShowEmailForm = (v: boolean) => { if (!v) onFermer(); };

  const getCreneauRecipients = () => {
    const recipients: { email: string; parentName: string; familyId: string }[] = [];
    const seen = new Set<string>();
    for (const e of enrolled) {
      const fam = families.find(f => f.firestoreId === e.familyId);
      if (fam?.parentEmail && !seen.has(fam.parentEmail)) {
        seen.add(fam.parentEmail);
        recipients.push({ email: fam.parentEmail, parentName: fam.parentName || "", familyId: fam.firestoreId });
      }
    }
    return recipients;
  };

  const handleEmailGenerate = async () => {
    setEmailGenerating(true);
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
        setEmailSubject(data.suggestedSubject || `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`);
        setEmailBody(data.emailBody || "");
      } else { panelToast("Erreur IA : " + (data.error || ""), "error"); }
    } catch (e: any) { panelToast("Erreur IA : " + e.message, "error"); }
    setEmailGenerating(false);
  };

  const handleEmailSend = async () => {
    const recipients = getCreneauRecipients();
    if (recipients.length === 0) { panelToast("Aucune famille avec email", "error"); return; }
    if (!emailSubject || !emailBody) { panelToast("Sujet et message requis", "error"); return; }
    setEmailSending(true);
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
            html: emailLayout(emailParagraphe(emailBody.replace(/\n/g, "<br/>")), emailSubject),
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
    panelToast(`Email envoyé à ${sent} famille${sent > 1 ? "s" : ""}`, "success");
    setShowEmailForm(false);
    // Le sujet repart de la séance pour l'envoi suivant, comme avant l'extraction.
    setEmailSubject(sujetParDefaut()); setEmailBody("");
    setEmailSending(false);
  };

  return (
    <>
    {showEmailForm && (
      <div className="mb-4 border border-blue-200 rounded-xl overflow-hidden">
        <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
          <span className="font-body text-xs font-semibold text-blue-700">📧 Email aux {getCreneauRecipients().length} famille{getCreneauRecipients().length > 1 ? "s" : ""}</span>
          <button type="button" onClick={() => setShowEmailForm(false)} className="text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
            placeholder="Objet de l'email"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
            placeholder="Votre message aux familles..."
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y focus:outline-none focus:border-blue-500" />
          <div className="flex gap-2">
            <button type="button" onClick={handleEmailGenerate} disabled={emailGenerating}
              className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-purple-100 disabled:opacity-50">
              {emailGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Générer avec IA
            </button>
            <button type="button" onClick={handleEmailSend} disabled={emailSending || !emailSubject || !emailBody}
              className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
              {emailSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Envoyer
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
