import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailSend, gmailIsConnected } from "@/lib/gmail";

// POST /api/admin/gmail/send — adminOnly. Envoie une réponse depuis la boîte
// connectée. Déclenché par un clic humain (bouton Envoyer), jamais automatique.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { to, subject, body, threadId, inReplyTo } = await req.json();
    if (!to || !body) {
      return NextResponse.json({ error: "Destinataire et message requis" }, { status: 400 });
    }
    if (!(await gmailIsConnected())) {
      return NextResponse.json({ error: "Gmail non connecté" }, { status: 400 });
    }

    const subj = /^re\s*:/i.test(subject || "") ? subject : `Re: ${subject || ""}`.trim();
    await gmailSend({ to, subject: subj, body, threadId, inReplyTo });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[gmail send]", e);
    // 403 = scope send non accordé (l'utilisateur doit reconnecter Gmail)
    const msg = /403|insufficient|scope/i.test(e?.message || "")
      ? "Autorisation d'envoi manquante — reconnecte Gmail pour accorder l'envoi."
      : e?.message || "Échec de l'envoi";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
