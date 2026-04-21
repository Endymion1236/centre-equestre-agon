import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Sécurité : vérifier le token Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // target=tomorrow (défaut) → rappels pour demain (classique)
    // target=after-tomorrow → rappels pour après-demain (non utilisé pour l'instant)
    // Depuis le cron du soir à 20h : target=tomorrow est exactement ce qu'il faut
    const target = new URL(req.url).searchParams.get("target") || "tomorrow";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + (target === "after-tomorrow" ? 2 : 1));
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    console.log(`🔔 Rappels J-1 pour le ${tomorrowStr} (target=${target})`);

    // Charger tous les créneaux de demain
    const creneauxSnap = await adminDb.collection("creneaux")
      .where("date", "==", tomorrowStr)
      .where("status", "!=", "closed")
      .get();

    if (creneauxSnap.empty) {
      console.log("  → Aucun créneau demain");
      return NextResponse.json({ sent: 0, date: tomorrowStr });
    }

    // Collecter les familles à notifier
    // Map : familyEmail → { parentName, children: [{childName, coursTitle, horaire, moniteur, isStage}] }
    const recipients = new Map<string, {
      parentName: string;
      items: { childName: string; coursTitle: string; date: string; horaire: string; moniteur: string; isStage: boolean }[];
    }>();

    const dateLabel = tomorrow.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    for (const crDoc of creneauxSnap.docs) {
      const c = crDoc.data();
      const enrolled = c.enrolled || [];
      const isStage = c.activityType === "stage" || c.activityType === "stage_journee";

      for (const e of enrolled) {
        if (!e.familyId) continue;

        // Charger l'email de la famille depuis Firestore
        let familyEmail = e.familyEmail || "";
        let parentName = e.familyName || "";

        if (!familyEmail) {
          try {
            // Chercher dans la collection users ou families
            const famSnap = await adminDb.collection("users").doc(e.familyId).get();
            if (famSnap.exists) {
              const famData = famSnap.data()!;
              familyEmail = famData.email || famData.parentEmail || "";
              parentName = parentName || famData.parentName || famData.displayName || "";
            }
          } catch {}
        }

        if (!familyEmail) continue;

        if (!recipients.has(familyEmail)) {
          recipients.set(familyEmail, { parentName, items: [] });
        }

        recipients.get(familyEmail)!.items.push({
          childName: e.childName || "",
          coursTitle: c.activityTitle,
          date: dateLabel,
          horaire: `${c.startTime}–${c.endTime}`,
          moniteur: c.monitor || "",
          isStage,
        });
      }
    }

    if (recipients.size === 0) {
      console.log("  → Aucune famille à notifier");
      return NextResponse.json({ sent: 0, date: tomorrowStr });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
    let sent = 0;
    let errors = 0;

    for (const [email, { parentName, items }] of recipients) {
      const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");
      const subject = items.length === 1
        ? `Rappel — ${items[0].coursTitle} demain`
        : `Rappel — ${items.length} séances demain`;
      try {
        // Grouper les items par enfant pour un email lisible
        const lignes = items.map(item => `
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0;">
            <p style="margin:0;color:#1e40af;font-weight:600;font-size:14px;">
              ${item.isStage ? "🏕️" : "🐴"} ${item.coursTitle}
              ${items.length > 1 ? `<span style="color:#64748b;font-size:12px;"> — ${item.childName}</span>` : ""}
            </p>
            <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 ${item.date}</p>
            <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${item.horaire}</p>
            ${item.moniteur ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">👤 ${item.moniteur}</p>` : ""}
          </div>
        `).join("");

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <div style="background:#0C1A2E;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="color:#F0A010;font-size:18px;font-weight:bold;margin:0;">🐴 Centre Équestre d'Agon-Coutainville</p>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="color:#1e3a5f;font-size:15px;">Bonjour <strong>${parentName || "cher parent"}</strong>,</p>
              <p style="color:#555;">Petit rappel pour demain${childrenStr ? ` — <strong>${childrenStr}</strong>` : ""} :</p>
              ${lignes}
              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;">
                <p style="margin:0;color:#854d0e;font-size:13px;">
                  💡 N'oubliez pas : casque obligatoire, tenue adaptée recommandée.
                </p>
              </div>
              <p style="color:#555;font-size:13px;">À demain au centre équestre !</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
              <p style="color:#94a3b8;font-size:11px;text-align:center;">
                Centre Équestre d'Agon-Coutainville — Agon-Coutainville, Normandie
              </p>
            </div>
          </div>
        `;

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
        });

        if (resendRes.ok) {
          sent++;
          await logEmail({
            to: email, subject,
            context: "cron_rappel_j1", template: "rappelJ1",
            status: "sent", sentBy: "system",
          });
          console.log(`  ✅ Rappel envoyé à ${email} (${items.length} séance${items.length > 1 ? "s" : ""})`);
        } else {
          errors++;
          const errText = await resendRes.text().catch(() => "");
          await logEmail({
            to: email, subject,
            context: "cron_rappel_j1", template: "rappelJ1",
            status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500),
            sentBy: "system",
          });
          console.error(`  ❌ Resend ${resendRes.status} pour ${email}`);
        }
      } catch (e) {
        errors++;
        await logEmail({
          to: email, subject,
          context: "cron_rappel_j1", template: "rappelJ1",
          status: "failed", error: (e as any)?.message || String(e),
          sentBy: "system",
        });
        console.error(`  ❌ Erreur envoi à ${email}:`, e);
      }
    }

    console.log(`  → Terminé : ${sent} envoyés, ${errors} erreurs`);
    return NextResponse.json({
      success: true,
      date: tomorrowStr,
      totalCreneaux: creneauxSnap.size,
      totalFamilles: recipients.size,
      sent,
      errors,
    });

  } catch (error: any) {
    console.error("Cron rappels J-1 error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
