import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const ownerEmail = process.env.RESEND_OWNER_EMAIL;

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY manquante dans les variables Vercel" }, { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);
    const domains = await resend.domains.list();
    const domainList = (domains.data as any)?.data || [];

    // Tester un envoi vers l'owner
    let testResult: any = null;
    if (ownerEmail) {
      const { data, error } = await resend.emails.send({
        from: fromEmail || "onboarding@resend.dev",
        to: [ownerEmail],
        subject: "✅ Test Resend — Centre Équestre Agon",
        html: `<p>Ce message confirme que Resend est opérationnel.</p>
               <p><strong>FROM_EMAIL :</strong> ${fromEmail || "onboarding@resend.dev (mode test)"}</p>
               <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>`,
      });
      testResult = error ? { success: false, error: error.message } : { success: true, id: data?.id };
    }

    return NextResponse.json({
      ok: true,
      config: {
        RESEND_API_KEY: `${apiKey.slice(0, 8)}...`,
        RESEND_FROM_EMAIL: fromEmail || "⚠️ manquante — mode test (onboarding@resend.dev)",
        RESEND_OWNER_EMAIL: ownerEmail || "⚠️ manquante",
        testMode: !fromEmail,
      },
      domains: domainList.map((d: any) => ({
        name: d.name,
        status: d.status,
        region: d.region,
      })),
      testEmail: testResult,
      action: !fromEmail
        ? "⚠️ Ajoutez RESEND_FROM_EMAIL dans Vercel → Settings → Environment Variables. Ex: noreply@centreequestreagon.fr (domaine vérifié dans Resend)"
        : "✅ Configuration complète",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
