/**
 * src/lib/envoi-comptable.ts — envoyer les écritures d'un mois à la comptable.
 *
 * Appelé par le bouton de « Boucler le mois » (route /api/admin/envoi-comptable)
 * et par le cron du 5 du mois quand l'envoi automatique est activé dans les
 * paramètres du centre. Lit tout avec adminDb, assemble le colis
 * (envoi-comptable-utils), rend le PDF de synthèse, envoie par Resend et
 * garde trace dans `envois-comptable/{AAAA-MM}`.
 *
 * L'adresse de la comptable vit dans settings/centre.emailComptable. Le
 * garde-fou email s'applique : en mode restreint, une adresse hors liste
 * blanche est refusée avec un message qui dit quoi faire.
 */

import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import { getClubInfo } from "@/lib/club-info";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { genererPdfSyntheseCompta } from "@/lib/compta-synthese-pdf";
import { construireColisComptable, corpsEmailComptable, nomMoisLong } from "@/lib/envoi-comptable-utils";

export const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface ReglagesEnvoiComptable {
  emailComptable: string;
  envoiComptableAuto: boolean;
}

export async function reglagesEnvoiComptable(): Promise<ReglagesEnvoiComptable> {
  const snap = await adminDb.collection("settings").doc("centre").get();
  const d = snap.exists ? (snap.data() as any) : {};
  return {
    emailComptable: String(d?.emailComptable || "").trim(),
    envoiComptableAuto: d?.envoiComptableAuto === true,
  };
}

export interface EtatEnvoiComptable {
  mois: string;
  envoye: boolean;
  dernierEnvoi?: { at: string; to: string; declenche: string; pieces: string[]; resume: any };
  nbEnvois: number;
}

export async function etatEnvoiComptable(mois: string): Promise<EtatEnvoiComptable> {
  const snap = await adminDb.collection("envois-comptable").doc(mois).get();
  if (!snap.exists) return { mois, envoye: false, nbEnvois: 0 };
  const d = snap.data() as any;
  const at = d.sentAt?.toDate?.() ? d.sentAt.toDate().toISOString() : String(d.sentAtIso || "");
  return {
    mois, envoye: true, nbEnvois: Number(d.nbEnvois || 1),
    dernierEnvoi: { at, to: String(d.to || ""), declenche: String(d.declenche || ""), pieces: d.pieces || [], resume: d.resume || null },
  };
}

/** Timestamp admin → objet { seconds } tel que les utilitaires client le lisent. */
function normaliserDate(d: any) {
  if (!d) return d;
  if (typeof d.seconds === "number") return { seconds: d.seconds };
  if (typeof d.toDate === "function") return { seconds: Math.floor(d.toDate().getTime() / 1000) };
  return null;
}
function normaliserDoc(snap: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = snap.data() as any;
  return { id: snap.id, ...data, date: normaliserDate(data.date) };
}

export async function envoyerEcrituresComptable(params: {
  mois: string;
  declenche: "manuel" | "auto";
  /** Adresse imposée (test) ; sinon celle des paramètres. */
  destinataire?: string;
  message?: string;
}): Promise<{ ok: true; to: string; pieces: string[]; resume: any } | { ok: false; error: string; code: "adresse" | "restreint" | "resend" | "vide" }> {
  const { mois, declenche } = params;
  const reglages = await reglagesEnvoiComptable();
  const to = (params.destinataire || reglages.emailComptable).trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, code: "adresse", error: "Aucune adresse de comptable valide — renseigne-la dans Paramètres → Identité du centre." };
  }

  await refreshEmailMode();
  if (!isRecipientAllowed(to)) {
    return { ok: false, code: "restreint", error: `Les emails sont en mode restreint : « ${to} » n'est pas dans la liste blanche. Ajoute l'adresse à EMAIL_ALLOWLIST (Vercel) ou passe EMAIL_RESTRICTED_MODE à off.` };
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, code: "resend", error: "Clé d'envoi d'email absente (RESEND_API_KEY)." };

  const [paySnap, encSnap, depSnap, club] = await Promise.all([
    adminDb.collection("payments").get(),
    adminDb.collection("encaissements").get(),
    adminDb.collection("depenses").where("mois", "==", mois).get(),
    getClubInfo(),
  ]);
  const payments = paySnap.docs.map(normaliserDoc);
  const encaissements = encSnap.docs.map(normaliserDoc);
  const depenses = depSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const colis = construireColisComptable({ mois, payments, encaissements, depenses });
  if (colis.resume.nbFactures === 0 && colis.resume.nbEncaissements === 0 && colis.resume.nbDepenses === 0) {
    return { ok: false, code: "vide", error: `Rien à envoyer pour ${nomMoisLong(mois)} : aucune facture, aucun encaissement, aucune dépense.` };
  }

  const pdf = await genererPdfSyntheseCompta({ period: mois, payments: colis.factures, encaissements: colis.encaissements });
  const attachments = [
    ...colis.pieces.map((p) => ({ filename: p.filename, content: Buffer.from(p.contenu, "utf-8"), contentType: p.contentType })),
    { filename: `synthese-compta-${mois}.pdf`, content: pdf, contentType: "application/pdf" },
  ];
  const nomsPieces = attachments.map((a) => a.filename);

  const resend = new Resend(resendKey);
  const envoi = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
    replyTo: REPLY_TO,
    to,
    subject: `${club.nom} — écritures comptables ${nomMoisLong(mois)}`,
    html: corpsEmailComptable({ mois, resume: colis.resume, pieces: nomsPieces, nomCentre: club.nom, message: params.message }),
    attachments,
  });
  if (envoi.error) {
    return { ok: false, code: "resend", error: `Envoi refusé par Resend : ${envoi.error.message || String(envoi.error)}` };
  }

  await adminDb.collection("envois-comptable").doc(mois).set({
    mois, to, declenche,
    pieces: nomsPieces,
    resume: colis.resume,
    sentAt: FieldValue.serverTimestamp(),
    sentAtIso: new Date().toISOString(),
    nbEnvois: FieldValue.increment(1),
    resendId: envoi.data?.id || null,
  }, { merge: true });

  return { ok: true, to, pieces: nomsPieces, resume: colis.resume };
}
