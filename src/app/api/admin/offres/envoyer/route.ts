import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { refreshEmailMode, isEmailRestricted, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { offerKeyFrom } from "@/lib/offres";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/offres/envoyer  (admin uniquement)
//
// Envoi d'une offre last-minute aux familles ciblées. Sûreté :
//   - Le client n'envoie que des familyIds : les EMAILS sont re-résolus
//     côté serveur et le consentementMarketing est RE-VÉRIFIÉ famille par
//     famille au moment de l'envoi (en dur, non contournable).
//   - Le mode email restreint (email-guard) s'applique : en phase de
//     préparation, seuls les emails autorisés partent réellement.
//   - Personnalisation simple : {parent} et {enfant} dans objet/corps.
//   - Journal offres_envois : familles réellement servies, pour ne pas
//     recibler deux fois la même offre.
//   - Envoi individuel (un email par famille), BCC de suivi.
//
// Body : { creneauIds: string[], familyIds: string[], subject, message,
//          enfantParFamille?: Record<familyId, prenom> }
// ═══════════════════════════════════════════════════════════════════

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const BCC_SUIVI = "ceagon50@gmail.com";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const creneauIds: string[] = Array.isArray(body?.creneauIds)
      ? body.creneauIds.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 10)
      : [];
    const familyIds: string[] = Array.isArray(body?.familyIds)
      ? body.familyIds.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 200)
      : [];
    const subject = (body?.subject || "").trim();
    const message = (body?.message || "").trim();
    const enfantParFamille: Record<string, string> =
      body?.enfantParFamille && typeof body.enfantParFamille === "object" ? body.enfantParFamille : {};

    if (creneauIds.length === 0 || familyIds.length === 0 || !subject || !message) {
      return NextResponse.json(
        { error: "creneauIds, familyIds, subject et message requis.", status: "badRequest" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY manquant.", status: "config" }, { status: 500 });
    }
    const resend = new Resend(apiKey);
    await refreshEmailMode();

    // ── Re-résolution serveur : email + consentement RE-VÉRIFIÉ ──
    const famSnaps = await Promise.all(familyIds.map((id) => adminDb.collection("families").doc(id).get()));
    const sent: { familyId: string; email: string }[] = [];
    const skipped: { familyId: string; raison: string }[] = [];

    for (const snap of famSnaps) {
      if (!snap.exists) {
        skipped.push({ familyId: snap.id, raison: "famille introuvable" });
        continue;
      }
      const f = snap.data() as any;
      const email = (f.parentEmail || "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        skipped.push({ familyId: snap.id, raison: "email invalide" });
        continue;
      }
      // RGPD — re-vérification au moment T de l'envoi.
      if (f.consentementMarketing !== true) {
        skipped.push({ familyId: snap.id, raison: "sans consentement" });
        continue;
      }
      // Mode restreint (phase de préparation).
      if (isEmailRestricted() && !isRecipientAllowed(email)) {
        console.warn(blockedLog(email, "offre-last-minute"));
        skipped.push({ familyId: snap.id, raison: "bloqué (mode restreint)" });
        continue;
      }

      const parent = f.parentName || "";
      const enfant = enfantParFamille[snap.id] || "";
      const perso = (s: string) => s.replaceAll("{parent}", parent).replaceAll("{enfant}", enfant);

      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        bcc: BCC_SUIVI,
        subject: perso(subject),
        text: perso(message),
      });
      if (error) {
        skipped.push({ familyId: snap.id, raison: `Resend: ${error.message || "erreur"}` });
        continue;
      }
      sent.push({ familyId: snap.id, email });
    }

    // ── Journal (uniquement les familles réellement servies) ──
    if (sent.length > 0) {
      await adminDb.collection("offres_envois").add({
        offerKey: offerKeyFrom(creneauIds),
        creneauIds,
        familyIds: sent.map((s) => s.familyId),
        emails: sent.map((s) => s.email),
        subject,
        sentBy: auth.email || auth.uid || "",
        sentAt: FieldValue.serverTimestamp(),
      });
    }
    console.log(`[offres/envoyer] ${sent.length} envoyé(s), ${skipped.length} ignoré(s)`);

    return NextResponse.json({ ok: true, envoyes: sent.length, ignores: skipped });
  } catch (e: any) {
    console.error("[offres/envoyer]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
