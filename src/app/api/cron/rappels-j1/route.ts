import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { addDaysParis } from "@/lib/date-local";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailSignature, emailCouleurs as CE,
} from "@/lib/email-templates";

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
    // Depuis le cron du soir à 20h UTC (= 22h Paris en été) : target=tomorrow
    // doit pointer sur le lendemain en fuseau Paris (pas en UTC du serveur Vercel).
    const target = new URL(req.url).searchParams.get("target") || "tomorrow";
    const offsetDays = target === "after-tomorrow" ? 2 : 1;
    const tomorrowStr = addDaysParis(offsetDays);
    // Pour l'affichage humain dans l'email, on reconstruit un Date en heure
    // Paris en parsant la string YYYY-MM-DD (interprétée midi local pour éviter
    // tout cas limite près de minuit).
    const [y, m, d] = tomorrowStr.split("-").map(Number);
    const tomorrow = new Date(y, m - 1, d, 12, 0, 0);

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
      // 🔒 Garde-fou phase de préparation : ne pas envoyer aux familles non autorisées.
      await refreshEmailMode();
      if (!isRecipientAllowed(email)) { console.warn(blockedLog(email, "rappel_j1")); continue; }
      const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");
      const subject = items.length === 1
        ? `Rappel — ${items[0].coursTitle} demain`
        : `Rappel — ${items.length} séances demain`;
      try {
        // Grouper les items par enfant pour un email lisible
        // Une séance par encadré, aux mêmes briques que le reste : les
        // émojis 🏕️ 🐴 📅 🕐 👤 tenaient lieu d'intitulés et se rendaient
        // en carrés vides sous Outlook.
        const lignes = items.map(item => emailPanneau(
          `${item.coursTitle}${items.length > 1 && item.childName ? ` · ${item.childName}` : ""}`,
          [
            emailLigne("Date", item.date),
            emailLigne("Horaire", item.horaire),
            item.moniteur ? emailLigne("Encadrement", item.moniteur) : "",
          ].join(""),
        )).join("");

        const html = emailLayout([
          emailTitre("C'est demain"),
          P(`Bonjour <strong>${parentName || "cher parent"}</strong>,`),
          P(`Petit rappel pour demain${childrenStr ? ` — <strong>${childrenStr}</strong>` : ""} :`),
          lignes,
          emailPanneau("", P("Casque obligatoire, tenue adaptée recommandée.", 13)),
          emailSignature("À demain au centre équestre."),
        ].join("\n"), `Rappel — demain${childrenStr ? ` : ${childrenStr}` : ""}`);

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
