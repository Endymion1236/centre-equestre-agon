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
import { logEmail } from "@/lib/email-log";
import { REPLY_TO } from "@/lib/email-reply-to";
import { genererPdfSyntheseCompta } from "@/lib/compta-synthese-pdf";
import { adressesComptable, construireColisComptable, corpsEmailComptable, encaissementsDuMois, facturesDuMois, fecDuMois, nomMoisLong } from "@/lib/envoi-comptable-utils";
import { archiverPiecesDuMois, chargerLignesMois } from "@/lib/lignes-mois";

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
export function normaliserDoc(snap: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = snap.data() as any;
  return { id: snap.id, ...data, date: normaliserDate(data.date) };
}

/**
 * Le FEC d'un mois, construit côté serveur : c'est le seul endroit qui lit à
 * la fois la caisse et les écritures Céleris (interdites au navigateur).
 * Même fonction que l'envoi mensuel (fecDuMois) : le fichier téléchargé est
 * celui que reçoit le cabinet.
 */
/** Règles de ventilation des ventes posées sur l'écran Ventilation des ventes. */
export async function chargerReglesVentilation(): Promise<Record<string, string>> {
  const snap = await adminDb.collection("settings").doc("ventilationVentes").get().catch(() => null);
  const regles = snap?.exists ? (snap.data() as any)?.regles : null;
  return regles && typeof regles === "object" ? regles : {};
}

export async function chargerFecMois(mois: string) {
  const [paySnap, encSnap, celerisSnap, club, regles] = await Promise.all([
    adminDb.collection("payments").get(),
    adminDb.collection("encaissements").get(),
    adminDb.collection("historiqueComptableCeleris").doc(mois).get().catch(() => null),
    getClubInfo(),
    chargerReglesVentilation(),
  ]);
  const payments = paySnap.docs.map(normaliserDoc);
  const encaissements = encSnap.docs.map(normaliserDoc);
  const celerisDoc = celerisSnap?.exists ? (celerisSnap.data() as any) : null;
  const factures = facturesDuMois(payments, mois).sort((a: any, b: any) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
  return fecDuMois({
    mois, factures, encaissements: encaissementsDuMois(encaissements, mois), payments,
    celeris: celerisDoc && Array.isArray(celerisDoc.lignes) ? { lignes: celerisDoc.lignes } : null,
    siret: club.siret,
    regles,
  });
}

export async function envoyerEcrituresComptable(params: {
  mois: string;
  declenche: "manuel" | "auto";
  /** Adresse imposée (test) ; sinon celle des paramètres. */
  destinataire?: string;
  message?: string;
  /** Qui déclenche (journal des emails) et reçoit une copie : l'admin qui clique. */
  declenchePar?: { uid?: string; email?: string };
}): Promise<{ ok: true; to: string; copie: string[]; pieces: string[]; resume: any } | { ok: false; error: string; code: "adresse" | "restreint" | "resend" | "vide" | "donnees" }> {
  const { mois, declenche } = params;
  const reglages = await reglagesEnvoiComptable();
  // Une ou plusieurs adresses (la collaboratrice du cabinet, l'expert en copie).
  const { valides: destinataires, invalides } = adressesComptable(params.destinataire || reglages.emailComptable);
  if (destinataires.length === 0 || invalides.length > 0) {
    return { ok: false, code: "adresse", error: invalides.length
      ? `Adresse(s) de comptable invalide(s) : ${invalides.join(", ")} — corrige-les dans Paramètres → Identité du centre.`
      : "Aucune adresse de comptable valide — renseigne-la dans Paramètres → Identité du centre." };
  }
  const to = destinataires.join(", ");

  await refreshEmailMode();
  const bloquees = destinataires.filter((a) => !isRecipientAllowed(a));
  if (bloquees.length) {
    return { ok: false, code: "restreint", error: `Les emails sont en mode restreint : « ${bloquees.join(", ")} » n'est pas dans la liste blanche. Ajoute l'adresse à EMAIL_ALLOWLIST (Vercel) ou passe EMAIL_RESTRICTED_MODE à off.` };
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, code: "resend", error: "Clé d'envoi d'email absente (RESEND_API_KEY)." };

  const [paySnap, encSnap, depSnap, club, tableau, celerisSnap] = await Promise.all([
    adminDb.collection("payments").get(),
    adminDb.collection("encaissements").get(),
    adminDb.collection("depenses").where("mois", "==", mois).get(),
    getClubInfo(),
    chargerLignesMois(mois).catch((e) => { console.error("[envoi-comptable] lignes du mois illisibles", e); return null; }),
    // Mois tenu dans Céleris : ses écritures partent avec le colis.
    adminDb.collection("historiqueComptableCeleris").doc(mois).get().catch(() => null),
  ]);
  if (!tableau || tableau.limite) return { ok: false, code: "donnees", error: "Le tableau des opérations ou des justificatifs est incomplet. Actualisez-le et vérifiez les limites avant l’envoi comptable." };
  const payments = paySnap.docs.map(normaliserDoc);
  const encaissements = encSnap.docs.map(normaliserDoc);
  const depenses = depSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const celerisDoc = celerisSnap?.exists ? (celerisSnap.data() as any) : null;
  const celeris = celerisDoc && Array.isArray(celerisDoc.lignes) && celerisDoc.totaux
    ? { lignes: celerisDoc.lignes, totaux: { ht: Number(celerisDoc.totaux.ht) || 0, tva: Number(celerisDoc.totaux.tva) || 0, ttc: Number(celerisDoc.totaux.ttc) || 0 } }
    : null;

  const regles = await chargerReglesVentilation();
  const colis = construireColisComptable({ mois, payments, encaissements, depenses, lignesJustificatifs: tableau?.lignes, celeris, siret: club.siret, regles });
  if (colis.resume.nbFactures === 0 && colis.resume.nbEncaissements === 0 && colis.resume.nbDepenses === 0 && !colis.resume.ventilationAchats?.total && !colis.resume.celeris) {
    return { ok: false, code: "vide", error: `Rien à envoyer pour ${nomMoisLong(mois)} : aucune facture, aucun encaissement, aucune dépense.` };
  }

  const pdf = await genererPdfSyntheseCompta({ period: mois, payments: colis.factures, encaissements: colis.encaissements });
  // Les pièces elles-mêmes, en archive : la comptable n'a plus rien à réclamer.
  const archive = tableau ? await archiverPiecesDuMois(tableau.lignes) : null;
  const attachments = [
    ...colis.pieces.map((p) => ({ filename: p.filename, content: Buffer.from(p.contenu, "utf-8"), contentType: p.contentType })),
    { filename: `synthese-compta-${mois}.pdf`, content: pdf, contentType: "application/pdf" },
    ...(archive?.zip ? [{ filename: `pieces_${mois}.zip`, content: Buffer.from(archive.zip), contentType: "application/zip" }] : []),
  ];
  const nomsPieces = attachments.map((a) => a.filename);

  // Copie au club : l'admin qui clique, et l'adresse de copie générale si
  // elle est réglée. Sans ça, l'envoi ne laissait aucune trace dans la boîte
  // du centre — le gérant ne pouvait ni le relire ni le retrouver.
  const copie = [...new Set([params.declenchePar?.email || "", process.env.RESEND_BCC_EMAIL || ""]
    .map((a) => a.trim().toLowerCase()).filter((a) => a && !destinataires.includes(a)))];
  const subject = `${club.nom} — écritures comptables ${nomMoisLong(mois)}`;
  const sentBy = params.declenchePar?.uid || (declenche === "auto" ? "system" : "admin");

  const resend = new Resend(resendKey);
  const envoi = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
    replyTo: REPLY_TO,
    to: destinataires,
    ...(copie.length ? { bcc: copie } : {}),
    subject,
    html: corpsEmailComptable({ mois, resume: colis.resume, pieces: nomsPieces, nomCentre: club.nom, message: params.message, archive: archive ? { nb: archive.nb, nonJointes: archive.nonJointes } : undefined }),
    attachments,
  });
  if (envoi.error) {
    await logEmail({ to, subject, context: "envoi_comptable", template: "ecrituresComptables", status: "failed", error: String(envoi.error.message || envoi.error).slice(0, 500), sentBy });
    return { ok: false, code: "resend", error: `Envoi refusé par Resend : ${envoi.error.message || String(envoi.error)}` };
  }
  // Journal des emails : le colis y figure comme n'importe quel envoi.
  await logEmail({ to: [...destinataires, ...copie], subject, context: "envoi_comptable", template: "ecrituresComptables", status: "sent", sentBy });

  await adminDb.collection("envois-comptable").doc(mois).set({
    mois, to, copie, declenche,
    pieces: nomsPieces,
    resume: colis.resume,
    sentAt: FieldValue.serverTimestamp(),
    sentAtIso: new Date().toISOString(),
    nbEnvois: FieldValue.increment(1),
    resendId: envoi.data?.id || null,
  }, { merge: true });

  return { ok: true, to, copie, pieces: nomsPieces, resume: colis.resume };
}
