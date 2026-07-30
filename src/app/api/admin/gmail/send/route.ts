import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailSend, gmailIsConnected, gmailAccountEmail } from "@/lib/gmail";
import { logEmail } from "@/lib/email-log";

// POST /api/admin/gmail/send — adminOnly. Envoie une réponse depuis la boîte
// connectée. Déclenché par un clic humain (bouton Envoyer), jamais automatique.
//
// ⚠️ Ces envois partent par l'API Gmail du compte connecté (settings/gmail_oauth),
// PAS par Resend. Ils se rangent donc dans les « Envoyés » de ce compte-là, et
// n'apparaissaient nulle part dans le journal des emails : impossible de
// vérifier après coup qu'une réponse était bien partie. On les journalise
// désormais comme les autres, succès ET échec.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  let to = "";
  let subj = "";
  try {
    const payload = await req.json();
    const { body, threadId, inReplyTo, subject } = payload;
    to = payload.to;

    if (!to || !body) {
      return NextResponse.json({ error: "Destinataire et message requis" }, { status: 400 });
    }
    if (!(await gmailIsConnected())) {
      return NextResponse.json({ error: "Gmail non connecté" }, { status: 400 });
    }

    subj = /^re\s*:/i.test(subject || "") ? subject : `Re: ${subject || ""}`.trim();
    const sent = await gmailSend({ to, subject: subj, body, threadId, inReplyTo });
    const compte = await gmailAccountEmail();

    await logEmail({
      to,
      subject: subj,
      context: "boite_ia",
      status: "sent",
      sentBy: (auth as any)?.uid || "admin",
      // Indique DEPUIS QUEL compte le message est parti : c'est dans les
      // « Envoyés » de celui-ci, et nulle part ailleurs, qu'on le retrouve.
      template: compte ? `gmail:${compte}` : "gmail",
    });

    return NextResponse.json({ ok: true, messageId: sent?.id, account: compte });
  } catch (e: any) {
    console.error("[gmail send]", e);
    // 403 = scope send non accordé (l'utilisateur doit reconnecter Gmail)
    const msg = /403|insufficient|scope/i.test(e?.message || "")
      ? "Autorisation d'envoi manquante — reconnecte Gmail pour accorder l'envoi."
      : e?.message || "Échec de l'envoi";

    // Un échec doit laisser une trace : sans elle, un message jamais parti est
    // indiscernable d'un message parti puis ignoré par le destinataire.
    await logEmail({
      to: to || "(inconnu)",
      subject: subj || "(sans objet)",
      context: "boite_ia",
      status: "failed",
      error: msg,
      sentBy: (auth as any)?.uid || "admin",
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
