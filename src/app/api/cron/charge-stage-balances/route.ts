import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * CRON charge-stage-balances — tous les jours à 8h
 * 
 * Pour chaque paiement stage dont le stage commence dans 7 jours
 * et qui a un solde restant, envoie un email avec lien de paiement.
 * 
 * Flow :
 *   Inscription stage → paiement pending (acompteAmount=30€/enfant)
 *   Famille paie l'acompte → paiement partial (paidAmount=30€)
 *   J-7 : ce cron envoie le lien de paiement pour le solde
 *   Famille paie le solde → paiement paid
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

  const results = {
    processed: 0,
    emailsSent: 0,
    errors: 0,
    skipped: 0,
    details: [] as string[],
  };

  try {
    // Date J+7
    const j7 = new Date();
    j7.setDate(j7.getDate() + 7);
    const j7Str = j7.toISOString().split("T")[0];
    const j7Label = j7.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n💳 [charge-stage-balances] Soldes stage J-7 — stages du ${j7Str}`);

    // Trouver les paiements stage dont la date de début est J+7
    const stagePaySnap = await adminDb.collection("payments")
      .where("stageDate", "==", j7Str)
      .get();

    if (stagePaySnap.empty) {
      console.log("  → Aucun paiement stage pour J+7");
      return NextResponse.json({ ok: true, message: `Aucun stage le ${j7Str}`, ...results });
    }

    for (const payDoc of stagePaySnap.docs) {
      const p = payDoc.data() as any;
      results.processed++;

      // Solde restant
      const solde = (p.totalTTC || 0) - (p.paidAmount || 0);
      if (solde <= 0 || p.status === "paid" || p.status === "cancelled") {
        results.skipped++;
        results.details.push(`${p.familyName}: déjà réglé ou annulé`);
        continue;
      }

      // Éviter les doublons
      if (p.soldeReminderSentAt) {
        results.skipped++;
        results.details.push(`${p.familyName}: rappel déjà envoyé`);
        continue;
      }

      const familyEmail = p.familyEmail || "";
      const familyName = p.familyName || "";
      const stageTitle = p.stageTitle || (p.items || [])[0]?.activityTitle || "Stage";

      if (!familyEmail) {
        results.skipped++;
        results.details.push(`${familyName}: pas d'email`);
        continue;
      }

      const soldeLink = `${appUrl}/espace-cavalier/factures?payId=${payDoc.id}`;

      try {
        const subject = `💳 Solde stage à régler — ${solde.toFixed(2)}€ avant le ${j7Label}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <div style="background:#2050A0;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
            <h2 style="margin:0;font-size:18px;">Centre Équestre d'Agon-Coutainville</h2>
          </div>
          <div style="background:#f8faff;padding:24px;border:1px solid #e0e8ff;border-top:none;border-radius:0 0 12px 12px;">
            <p>Bonjour <strong>${familyName}</strong>,</p>
            <p>Le stage <strong>${stageTitle}</strong> commence dans <strong>7 jours</strong> (${j7Label}).</p>
            ${p.paidAmount > 0 ? `<p>Votre acompte de <strong>${p.paidAmount.toFixed(2)}€</strong> a bien été reçu. Merci !</p>` : `<p>Aucun acompte n'a encore été versé.</p>`}
            <p>Il reste un solde à régler :</p>
            <div style="background:white;border:2px solid #2050A0;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
              <div style="font-size:28px;font-weight:bold;color:#2050A0;">${solde.toFixed(2)}€</div>
              <div style="color:#555;font-size:13px;margin-top:4px;">${stageTitle}</div>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${soldeLink}" style="background:#2050A0;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                💳 Régler le solde en ligne
              </a>
            </div>
            <p style="color:#888;font-size:12px;text-align:center;">
              Vous pouvez également régler sur place par CB, chèque ou espèces.
            </p>
          </div>
        </div>`;

        if (resendKey) {
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: familyEmail,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html,
            }),
          });
          if (resendRes.ok) {
            await logEmail({ to: familyEmail, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "sent", sentBy: "system", paymentId: payDoc.id });
          } else {
            const errText = await resendRes.text().catch(() => "");
            await logEmail({ to: familyEmail, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system", paymentId: payDoc.id });
          }
        }

        // Marquer le rappel comme envoyé
        await adminDb.collection("payments").doc(payDoc.id).update({
          soldeReminderSentAt: FieldValue.serverTimestamp(),
        });

        results.emailsSent++;
        results.details.push(`✅ ${familyName} → ${familyEmail} (${solde.toFixed(2)}€)`);
        console.log(`  ✅ Solde J-7 → ${familyEmail} (${solde.toFixed(2)}€)`);
      } catch (e: any) {
        results.errors++;
        results.details.push(`❌ ${familyName}: ${e.message}`);
        console.error(`  ❌ Erreur solde J-7 → ${familyEmail}`, e);
      }
    }

    console.log(`\n✅ charge-stage-balances terminé: ${results.emailsSent} emails, ${results.skipped} ignorés, ${results.errors} erreurs`);

    return NextResponse.json({
      ok: true,
      message: `Stages du ${j7Str}: ${results.emailsSent} rappels envoyés`,
      ...results,
    });
  } catch (error: any) {
    console.error("Cron charge-stage-balances error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
