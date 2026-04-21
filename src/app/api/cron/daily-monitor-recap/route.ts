import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { compareCreneaux } from "@/lib/creneau-sort";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Moniteurs connus et leurs emails (pour matcher le champ "monitor" des créneaux)
const STAFF_EMAILS: Record<string, string[]> = {
  "Emmeline": ["emmelinelagy@gmail.com"],
  "Nicolas": ["ceagon@orange.fr", "ceagon50@gmail.com"],
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // target=tomorrow → envoyer le récap de DEMAIN (cas du cron du soir)
    // target=today (défaut) → récap d'aujourd'hui (cas de lancement manuel le matin)
    const target = new URL(req.url).searchParams.get("target") || "today";
    const targetDate = new Date();
    if (target === "tomorrow") targetDate.setDate(targetDate.getDate() + 1);
    const todayStr = targetDate.toISOString().split("T")[0];
    const dateLabel = targetDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`📋 Récap quotidien moniteurs pour le ${todayStr} (target=${target})`);

    // 1. Charger tous les créneaux du jour
    const creneauxSnap = await adminDb.collection("creneaux")
      .where("date", "==", todayStr)
      .get();

    if (creneauxSnap.empty) {
      console.log("  → Aucun créneau ce jour-là");
      return NextResponse.json({ sent: 0, date: todayStr, message: "Aucun créneau" });
    }

    const creneaux = creneauxSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. Grouper par moniteur
    const byMonitor: Record<string, any[]> = {};
    for (const c of creneaux) {
      const monitor = (c as any).monitor || "Non assigné";
      if (!byMonitor[monitor]) byMonitor[monitor] = [];
      byMonitor[monitor].push(c);
    }

    // 3. Aussi construire un récap global pour les admins
    const globalRecap = creneaux
      .sort((a: any, b: any) => (a.startTime || "").localeCompare(b.startTime || ""))
      .map((c: any) => {
        const enrolled = (c.enrolled || []).length;
        return `${c.startTime}–${c.endTime} · ${c.activityTitle} · ${c.monitor || "?"} · ${enrolled}/${c.maxPlaces || "?"}`;
      });

    // 4. Chercher les tokens push pour les staff
    // D'abord chercher dans la collection staff (si elle existe)
    // Sinon fallback sur STAFF_EMAILS
    let staffTokens: { name: string; token: string; role: string; email: string }[] = [];

    // Méthode 1 : Collection "staff" dans Firestore
    try {
      const staffSnap = await adminDb.collection("staff").get();
      for (const doc of staffSnap.docs) {
        const data = doc.data();
        if (data.pushToken && (data.role === "admin" || data.role === "enseignant")) {
          staffTokens.push({
            name: data.name || data.displayName || "Staff",
            token: data.pushToken,
            role: data.role,
            email: data.email || "",
          });
        }
      }
    } catch {
      // Collection staff n'existe pas encore, on continue
    }

    // Méthode 2 : Fallback sur push_tokens des comptes admin connus
    if (staffTokens.length === 0) {
      const allEmails = Object.values(STAFF_EMAILS).flat();
      // Chercher les families/users avec ces emails
      for (const [monitorName, emails] of Object.entries(STAFF_EMAILS)) {
        for (const email of emails) {
          // Chercher dans push_tokens par familyId (on cherche le familyId via families)
          const famSnap = await adminDb.collection("families")
            .where("parentEmail", "==", email)
            .limit(1)
            .get();

          if (!famSnap.empty) {
            const familyId = famSnap.docs[0].id;
            const tokenSnap = await adminDb.collection("push_tokens").doc(familyId).get();
            if (tokenSnap.exists && tokenSnap.data()?.token) {
              staffTokens.push({
                name: monitorName,
                token: tokenSnap.data()!.token,
                role: "admin",
                email,
              });
            }
          }
        }
      }
    }

    const fcmKey = process.env.FIREBASE_SERVER_KEY;
    if (!fcmKey) {
      console.log("  → FIREBASE_SERVER_KEY manquante");
      return NextResponse.json({ error: "FIREBASE_SERVER_KEY manquante" }, { status: 500 });
    }

    let sent = 0;

    for (const staff of staffTokens) {
      // Construire le message personnalisé
      const monitorCreneaux = byMonitor[staff.name] || [];
      const totalCreneaux = creneaux.length;
      const totalInscrits = creneaux.reduce((s: number, c: any) => s + ((c as any).enrolled || []).length, 0);

      let body: string;
      if (monitorCreneaux.length > 0) {
        // Ce moniteur a des cours aujourd'hui
        const details = monitorCreneaux
          .sort(compareCreneaux)
          .map((c: any) => `${c.startTime} ${c.activityTitle} (${(c.enrolled || []).length}/${c.maxPlaces})`)
          .join(" · ");
        body = `Tes ${monitorCreneaux.length} cours : ${details}`;
      } else if (staff.role === "admin") {
        // Admin sans cours perso mais récap global
        body = `${totalCreneaux} cours programmés · ${totalInscrits} cavaliers inscrits`;
      } else {
        continue; // Enseignant sans cours, pas de notif
      }

      const title = `📋 Planning du ${dateLabel}`;

      try {
        const res = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `key=${fcmKey}`,
          },
          body: JSON.stringify({
            to: staff.token,
            notification: {
              title,
              body,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcm_options: {
                link: `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}/admin/planning`,
              },
            },
          }),
        });
        const data = await res.json();
        if (data.success) {
          sent++;
          console.log(`  ✅ Push envoyé à ${staff.name} (${staff.email})`);
        } else {
          console.log(`  ❌ Échec push ${staff.name}:`, data.results?.[0]?.error || "unknown");
        }
      } catch (e) {
        console.error(`  ❌ Erreur push ${staff.name}:`, e);
      }
    }

    // 5. Aussi envoyer un email récap si Resend est configuré
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
    let emailsSent = 0;

    if (resendKey) {
      for (const [monitorName, emails] of Object.entries(STAFF_EMAILS)) {
        const monitorCreneaux = byMonitor[monitorName] || [];
        if (monitorCreneaux.length === 0 && !emails.some(e => e.includes("ceagon"))) continue;

        const coursToShow = monitorCreneaux.length > 0 ? monitorCreneaux : creneaux as any[];
        const isPersonal = monitorCreneaux.length > 0;

        const lignes = coursToShow
          .sort(compareCreneaux)
          .map((c: any) => {
            const enrolled = (c.enrolled || []).length;
            const cavaliers = (c.enrolled || []).map((e: any) => e.childName).join(", ");
            return `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e3a5f;font-weight:600;">${c.startTime}–${c.endTime}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#555;">${c.activityTitle}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#555;">${c.monitor || "—"}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:${enrolled >= c.maxPlaces ? '#dc2626' : enrolled > 0 ? '#16a34a' : '#94a3b8'};font-weight:600;">${enrolled}/${c.maxPlaces}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">${cavaliers || "—"}</td>
              </tr>`;
          }).join("");

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:24px;">
            <div style="background:#0C1A2E;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="color:#F0A010;font-size:18px;font-weight:bold;margin:0;">📋 Planning du ${dateLabel}</p>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="color:#1e3a5f;font-size:15px;">Bonjour <strong>${monitorName}</strong>,</p>
              <p style="color:#555;">${isPersonal ? `Tu as <strong>${monitorCreneaux.length} cours</strong> aujourd'hui :` : `Voici le planning complet du jour (<strong>${(coursToShow as any[]).length} cours</strong>) :`}</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Horaire</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Cours</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Moniteur</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Places</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Cavaliers</th>
                  </tr>
                </thead>
                <tbody>${lignes}</tbody>
              </table>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
              <p style="color:#94a3b8;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville</p>
            </div>
          </div>`;

        for (const email of emails) {
          const subject = `📋 Planning ${dateLabel} — ${isPersonal ? `${monitorCreneaux.length} cours` : `${(coursToShow as any[]).length} cours`}`;
          try {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: fromEmail,
                to: email,
                subject,
                html,
              }),
            });
            if (resendRes.ok) {
              emailsSent++;
              await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "sent", sentBy: "system" });
              console.log(`  📧 Email récap envoyé à ${email}`);
            } else {
              const errText = await resendRes.text().catch(() => "");
              await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system" });
              console.error(`  ❌ Resend ${resendRes.status} pour ${email}`);
            }
          } catch (e) {
            await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "failed", error: (e as any)?.message || String(e), sentBy: "system" });
            console.error(`  ❌ Erreur email ${email}:`, e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: todayStr,
      totalCreneaux: creneaux.length,
      staffNotified: staffTokens.length,
      pushSent: sent,
      emailsSent,
      monitors: Object.keys(byMonitor),
    });
  } catch (error: any) {
    console.error("Cron daily-monitor-recap error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
