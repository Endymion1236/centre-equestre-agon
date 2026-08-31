import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, isEmailRestricted, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { adminDb } from "@/lib/firebase-admin";
import { REPLY_TO } from "@/lib/email-reply-to";
import { estMarketing, estDesabonne, piedDesabonnement } from "@/lib/desabonnement";

// Emails du personnel (moniteurs / salariés) : TOUJOURS autorisés, même en mode
// restreint — plus besoin de les ajouter à la main dans EMAIL_ALLOWLIST.
// Mis en cache 5 min pour éviter une lecture Firestore à chaque envoi.
let staffCache: { set: Set<string>; at: number } | null = null;
async function staffEmails(): Promise<Set<string>> {
  if (staffCache && Date.now() - staffCache.at < 5 * 60 * 1000) return staffCache.set;
  const set = new Set<string>();
  const low = (e: string) => (e || "").trim().toLowerCase();
  try {
    for (const col of ["moniteurs", "salaries-management"]) {
      const snap = await adminDb.collection(col).get();
      snap.forEach(d => { const e = low((d.data() as any).email || ""); if (e) set.add(e); });
    }
  } catch (e) { console.error("staffEmails (email-guard personnel):", e); }
  staffCache = { set, at: Date.now() };
  return set;
}

export const dynamic = "force-dynamic";

// Email expéditeur — en mode test, utiliser EXACTEMENT l'adresse Resend
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// Mode test : si pas de domaine vérifié, tous les emails vont vers l'email du compte Resend
const TEST_MODE = !process.env.RESEND_FROM_EMAIL || process.env.RESEND_TEST_MODE === "true";
const TEST_EMAIL = process.env.RESEND_OWNER_EMAIL || "";

/**
 * Insère un bloc à la FIN du corps du message.
 *
 * Les gabarits renvoient désormais un document HTML complet — c'est ce qui
 * permet de déclarer `color-scheme` et d'éviter que certaines messageries
 * n'inversent l'email en mode sombre. Concaténer après coup placerait donc le
 * bloc après `</html>`, où plus rien n'est rendu de façon fiable.
 */
function inserer(document: string, bloc: string): string {
  const i = document.lastIndexOf("</body>");
  return i === -1 ? document + bloc : document.slice(0, i) + bloc + document.slice(i);
}

/** Même chose, mais au DÉBUT du corps — pour le bandeau du mode test. */
function enTete(document: string, bloc: string): string {
  const i = document.indexOf("<body");
  if (i === -1) return bloc + document;
  const fin = document.indexOf(">", i);
  return fin === -1 ? bloc + document : document.slice(0, fin + 1) + bloc + document.slice(fin + 1);
}

export async function POST(request: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(request, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // Champs utilisés aussi en cas d'erreur pour le log
  let logTo: string | string[] = "";
  let logSubject = "";
  let logContext = "admin_manual";
  let logTemplate: string | undefined;
  let logMeta: { familyId?: string; paymentId?: string; creneauId?: string } = {};
  const sentBy = (auth as any)?.uid || "admin";

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY non configurée. Ajoutez-la dans les variables d'environnement Vercel." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const body = await request.json();
    const { to, subject, html, replyTo, bcc, context, template, familyId, paymentId, creneauId, attachments } = body;

    // Pièces jointes : tableau [{ filename, content (base64) }]. Garde-fou de taille (~7 Mo de base64 ≈ 5 Mo de fichiers).
    let safeAttachments: { filename: string; content: string }[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      safeAttachments = attachments
        .filter((a: any) => a && a.filename && a.content)
        .map((a: any) => ({ filename: String(a.filename), content: String(a.content) }));
      const totalLen = safeAttachments.reduce((n, a) => n + a.content.length, 0);
      if (totalLen > 7_000_000) {
        return NextResponse.json(
          { error: "Pièces jointes trop volumineuses (max ~5 Mo au total)." },
          { status: 400 }
        );
      }
    }

    logTo = to;
    logSubject = subject || "";
    if (context) logContext = String(context);
    if (template) logTemplate = String(template);
    if (familyId) logMeta.familyId = String(familyId);
    if (paymentId) logMeta.paymentId = String(paymentId);
    if (creneauId) logMeta.creneauId = String(creneauId);

    if (!to || !subject || !html) {
      await logEmail({
        to: to || "", subject: subject || "",
        context: logContext, template: logTemplate,
        status: "failed", error: "Champs manquants",
        sentBy, ...logMeta,
      });
      return NextResponse.json(
        { error: "Champs requis : to, subject, html" },
        { status: 400 }
      );
    }

    // to peut être un string ou un tableau
    const recipients = Array.isArray(to) ? to : [to];
    const validRecipients = recipients.filter(
      (email: string) => email && email.includes("@")
    );

    // 🔒 Garde-fou phase de préparation : en mode restreint, on ne garde que
    //    les destinataires autorisés (admins / compte test / EMAIL_ALLOWLIST)
    //    ET le personnel (moniteurs/salariés), toujours autorisé automatiquement.
    await refreshEmailMode();
    const staffSet = isEmailRestricted() ? await staffEmails() : new Set<string>();
    const low = (e: string) => (e || "").trim().toLowerCase();
    const estAutorise = (e: string) => isRecipientAllowed(e) || staffSet.has(low(e));

    const allowedRecipients = validRecipients.filter((e: string) => estAutorise(e));
    if (isEmailRestricted() && allowedRecipients.length < validRecipients.length) {
      const bloques = validRecipients.filter((e: string) => !estAutorise(e));
      console.warn(blockedLog(bloques.join(", "), logContext));
    }
    if (allowedRecipients.length === 0) {
      await logEmail({
        to: validRecipients, subject,
        context: logContext, template: logTemplate,
        status: "failed", error: "Bloqué par le mode restreint (email-guard)",
        sentBy, ...logMeta,
      });
      return NextResponse.json(
        { skipped: true, reason: "mode_restreint", blocked: validRecipients },
        { status: 200 }
      );
    }

    if (validRecipients.length === 0) {
      await logEmail({
        to, subject,
        context: logContext, template: logTemplate,
        status: "failed", error: "Aucun destinataire valide",
        sentBy, ...logMeta,
      });
      return NextResponse.json(
        { error: "Aucun destinataire valide" },
        { status: 400 }
      );
    }

    // BCC : copie cachée configurable (variable d'env ou paramètre)
    const bccEmail = bcc || process.env.RESEND_BCC_EMAIL || "";
    const bccList = bccEmail ? (Array.isArray(bccEmail) ? bccEmail : [bccEmail]).filter((e: string) => e.includes("@")) : [];

    // En mode test : rediriger vers l'email admin avec le vrai destinataire dans l'objet
    if (TEST_MODE && !TEST_EMAIL) {
      return NextResponse.json(
        { error: "RESEND_OWNER_EMAIL non configurée. Requise en mode test." },
        { status: 500 }
      );
    }
    // Désabonnement : ne s'applique QU'aux emails de communication. Les
    // confirmations, factures et rappels d'échéance restent envoyés — ce sont
    // des messages transactionnels attendus par la famille.
    let htmlFinal = html;
    if (estMarketing(context) && familyId) {
      if (await estDesabonne(familyId)) {
        await logEmail({
          to: Array.isArray(to) ? to.join(", ") : String(to),
          subject, status: "blocked", context: logContext,
          error: "Famille désabonnée des emails de communication",
        } as any).catch(() => {});
        return NextResponse.json({ ok: true, skipped: "desabonne" });
      }
      const base = process.env.NEXT_PUBLIC_SITE_URL || "https://centre-equestre-agon.vercel.app";
      htmlFinal = inserer(html, piedDesabonnement(familyId, base));
    }

    const finalTo = TEST_MODE ? [TEST_EMAIL] : allowedRecipients;
    const finalSubject = TEST_MODE
      ? `[TEST → ${allowedRecipients.join(", ")}] ${subject}`
      : subject;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: finalTo,
      ...(bccList.length > 0 && !TEST_MODE ? { bcc: bccList } : {}),
      subject: finalSubject,
      html: TEST_MODE
        ? enTete(htmlFinal, `<div style="background:#fff3cd;padding:10px;border:1px solid #ffc107;border-radius:6px;margin-bottom:12px;font-family:sans-serif;font-size:12px;color:#856404;">
            <strong>MODE TEST</strong> — Cet email aurait été envoyé à : <strong>${allowedRecipients.join(", ")}</strong>
          </div>`)
        : htmlFinal,
      replyTo: replyTo || REPLY_TO,
      ...(safeAttachments.length > 0 ? { attachments: safeAttachments } : {}),
    });

    if (error) {
      console.error("Resend error:", error);
      const errName = (error as any)?.name || "";
      const errMessage = (error as any)?.message || String(error);
      await logEmail({
        to: validRecipients, subject,
        context: logContext, template: logTemplate,
        status: "failed", error: errMessage,
        sentBy, ...logMeta,
      });
      // Le message et le statut réels de Resend sont renvoyés à l'appelant
      // (route admin) : un 429 rate-limit doit être réessayable côté client,
      // pas noyé dans un « Erreur interne » générique.
      const statusCode = errName === "rate_limit_exceeded" || (error as any)?.statusCode === 429 ? 429 : 502;
      return NextResponse.json({ error: errMessage, name: errName }, { status: statusCode });
    }

    // Succès — log
    await logEmail({
      to: validRecipients, subject,
      context: logContext, template: logTemplate,
      status: "sent",
      sentBy, ...logMeta,
    });

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipients: validRecipients.length,
      testMode: TEST_MODE,
      sentTo: TEST_MODE ? TEST_EMAIL : validRecipients,
    });
  } catch (error: any) {
    console.error("Send email error:", error);
    await logEmail({
      to: logTo || "", subject: logSubject,
      context: logContext, template: logTemplate,
      status: "failed", error: "Erreur interne",
      sentBy, ...logMeta,
    });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
