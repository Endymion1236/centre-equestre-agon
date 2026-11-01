/**
 * POST /api/admin/sepa-rejet-email — prévenir une famille d'un prélèvement
 * rejeté et lui demander quand le représenter.
 *
 * Corps : { echeanceId, mode?: "apercu" }. En mode aperçu, renvoie
 * destinataire, objet et HTML sans rien envoyer ; sinon envoie via Resend,
 * journalise (emailsSent) et date la prévenance sur l'échéance
 * (`famillePrevenueLe`). Texte : gabarit `rejetPrelevement`, modifiable
 * dans Emails ; variables calculées par lib/sepa-rejet-email (testé).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { loadTemplate } from "@/lib/email-template-loader";
import { controleEnvoiRejet, variablesEmailRejet } from "@/lib/sepa-rejet-email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({} as any));
    const echeanceId = String(body?.echeanceId || "").trim();
    if (!echeanceId) return NextResponse.json({ error: "echeanceId requis" }, { status: 400 });
    const apercu = body?.mode === "apercu";

    const snap = await adminDb.collection("echeances-sepa").doc(echeanceId).get();
    if (!snap.exists) return NextResponse.json({ error: "Échéance introuvable" }, { status: 404 });
    const ech = { id: snap.id, ...(snap.data() as any) };

    let email = "";
    if (ech.familyId) {
      const fam = await adminDb.collection("families").doc(ech.familyId).get();
      email = String((fam.data() as any)?.parentEmail || "").trim();
    }
    const controle = controleEnvoiRejet(ech, email);
    if (!controle.ok) return NextResponse.json({ error: controle.raison }, { status: 400 });

    // La représentation créée au moment du rejet, s'il y en a une.
    const repr = await adminDb.collection("echeances-sepa").where("representationDe", "==", echeanceId).limit(1).get();
    const dateRepresentation = repr.empty ? null : String((repr.docs[0].data() as any).dateEcheance || "");

    const { subject, html } = await loadTemplate("rejetPrelevement", variablesEmailRejet(ech, dateRepresentation));

    if (apercu) {
      return NextResponse.json({ apercu: true, to: email, subject, html, dejaPrevenueLe: ech.famillePrevenueLe || null });
    }

    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(email)) {
      await logEmail({
        to: email, subject, context: "sepa_rejet", template: "rejetPrelevement",
        status: "failed", error: resendKey ? "Mode restreint : destinataire non autorisé" : "RESEND_API_KEY absente",
        sentBy: (auth as any)?.uid || "admin", paymentId: ech.paymentId || undefined, familyId: ech.familyId,
      }).catch(() => {});
      return NextResponse.json({ sent: false, reason: "destinataire non autorisé (mode restreint)" });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        to: email,
        reply_to: REPLY_TO,
        ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
        subject,
        html,
      }),
    });
    const errText = res.ok ? "" : await res.text().catch(() => "");
    const resendId = res.ok ? String((await res.json().catch(() => ({})))?.id || "") : "";
    await logEmail({
      to: email, subject, context: "sepa_rejet", template: "rejetPrelevement",
      status: res.ok ? "sent" : "failed",
      ...(res.ok ? {} : { error: `HTTP ${res.status}: ${errText}`.slice(0, 500) }),
      ...(resendId ? { resendId } : {}),
      sentBy: (auth as any)?.uid || "admin", paymentId: ech.paymentId || undefined, familyId: ech.familyId,
    }).catch(() => {});
    if (!res.ok) return NextResponse.json({ sent: false, reason: `Resend : HTTP ${res.status}` }, { status: 502 });

    await snap.ref.update({ famillePrevenueLe: new Date().toISOString() });
    return NextResponse.json({ sent: true, to: email, subject });
  } catch (e: any) {
    console.error("[sepa-rejet-email]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
