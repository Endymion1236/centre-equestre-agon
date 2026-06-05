import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import { sendPushBatch } from "@/lib/push";
import { isRecipientAllowed } from "@/lib/email-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];

// Date du jour / fin de période au format YYYY-MM-DD (fuseau Europe/Paris)
function parisYMD(d = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * CRON echeances-sepa-reminder — rappel mensuel (fin de mois)
 *
 * Liste les échéances de paiements échelonnés (forfaits en 3x/10x) non réglées,
 * dues d'ici la fin du mois prochain, pour ne pas oublier de les mettre en
 * prélèvement SEPA. Envoie un email aux admins + une notification push.
 * Déclenchable aussi manuellement (GET + Bearer CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://centre-equestre-agon.vercel.app";
  const today = parisYMD();
  const now = new Date();
  // Dernier jour du mois EN COURS (jour 0 du mois suivant). Les échéances tombant
  // en fin de mois (le 31), un rappel le 25 laisse le temps de mettre en prélèvement.
  const endWindowYMD = parisYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const result = { dueCount: 0, overdueCount: 0, totalAmount: 0, families: 0, pushSent: 0, emailSent: false };

  try {
    // Échéances = paiements échelonnés (echeancesTotal > 1)
    const snap = await adminDb.collection("payments").where("echeancesTotal", ">", 1).get();

    type Row = { family: string; date: string; montant: number; num: number; total: number; overdue: boolean };
    const rows: Row[] = [];
    snap.forEach((d) => {
      const p = d.data() as any;
      if (["paid", "cancelled", "sepa_scheduled"].includes(p.status)) return;
      const date = p.echeanceDate;
      if (!date || date > endWindowYMD) return; // uniquement ce qui est dû d'ici la fin du mois en cours
      rows.push({
        family: p.familyName || "(sans nom)",
        date,
        montant: Number(p.totalTTC || p.montant || 0),
        num: Number(p.echeance || 0),
        total: Number(p.echeancesTotal || 0),
        overdue: date < today,
      });
    });

    rows.sort((a, b) => a.date.localeCompare(b.date));
    result.dueCount = rows.length;
    result.overdueCount = rows.filter((r) => r.overdue).length;
    result.totalAmount = +rows.reduce((s, r) => s + r.montant, 0).toFixed(2);
    result.families = new Set(rows.map((r) => r.family)).size;

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, message: "Aucune échéance à préparer", ...result });
    }

    // ── Email admin ────────────────────────────────────────────────────────
    const fmtDate = (ymd: string) => {
      const [y, m, dd] = ymd.split("-");
      return `${dd}/${m}/${y}`;
    };
    const lignes = rows.map((r) =>
      `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 8px;">${r.overdue ? "⚠️ " : ""}${r.family}</td>
        <td style="padding:5px 8px;color:#6b7280;">échéance ${r.num}/${r.total}</td>
        <td style="padding:5px 8px;color:${r.overdue ? "#dc2626" : "#1f2937"};">${fmtDate(r.date)}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold;">${r.montant.toFixed(2)}€</td>
      </tr>`
    ).join("");

    const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;">
      <h2 style="color:#1e3a5f;margin-bottom:4px;">Échéances SEPA à mettre en prélèvement</h2>
      <p style="color:#374151;">${result.dueCount} échéance(s) à prélever ce mois-ci, pour un total de <strong>${result.totalAmount.toFixed(2)}€</strong>${result.overdueCount ? ` — dont <strong style="color:#dc2626;">${result.overdueCount} en retard</strong>` : ""}.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f9fafb;text-align:left;"><th style="padding:6px 8px;">Famille</th><th style="padding:6px 8px;">Échéance</th><th style="padding:6px 8px;">Date</th><th style="padding:6px 8px;text-align:right;">Montant</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>
      <p style="margin-top:16px;"><a href="${appUrl}/admin/paiements" style="background:#1e3a5f;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;">Ouvrir les échéances</a></p>
      <p style="color:#9ca3af;font-size:11px;margin-top:14px;">Rappel automatique mensuel — pensez à enregistrer les prélèvements SEPA correspondants.</p>
    </div>`;

    const resendKey = process.env.RESEND_API_KEY;
    const to = ADMIN_EMAILS.filter((e) => isRecipientAllowed(e));
    if (resendKey && to.length > 0) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
          to,
          subject: `Rappel : ${result.dueCount} échéance(s) SEPA à prélever${result.overdueCount ? ` (${result.overdueCount} en retard)` : ""}`,
          html,
        });
        result.emailSent = true;
      } catch (e) { console.error("echeances-reminder email:", e); }
    }

    // ── Notification push (staff admin/enseignant) ──────────────────────────
    try {
      const tokens: string[] = [];
      const staffSnap = await adminDb.collection("staff").get();
      staffSnap.forEach((d) => {
        const s = d.data() as any;
        if (s.pushToken && (s.role === "admin" || s.role === "enseignant")) tokens.push(s.pushToken);
      });
      if (tokens.length > 0) {
        const r = await sendPushBatch(
          tokens,
          "Échéances SEPA à prélever",
          `${result.dueCount} échéance(s) à préparer (${result.totalAmount.toFixed(2)}€)${result.overdueCount ? ` · ${result.overdueCount} en retard` : ""}`,
          `${appUrl}/admin/paiements`,
        );
        result.pushSent = r.sent;
      }
    } catch (e) { console.error("echeances-reminder push:", e); }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("echeances-sepa-reminder:", e);
    return NextResponse.json({ error: (e?.message || String(e)).slice(0, 300) }, { status: 500 });
  }
}
