import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Moniteurs connus et leurs emails
const STAFF_EMAILS: Record<string, string[]> = {
  "Emmeline": ["emmelinelagy@gmail.com"],
  "Nicolas": ["ceagon@orange.fr", "ceagon50@gmail.com"],
};

// ════════════════════════════════════════════
// Ce cron fait 2 jobs en 1 :
//   1. Récap quotidien moniteurs (planning du jour)
//   2. Rappels J-1 familles (séances de demain)
// ════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    monitorRecap: { pushSent: 0, emailsSent: 0, monitors: [] as string[] },
    familyReminders: { sent: 0, errors: 0, families: 0 },
  };

  const fcmKey = process.env.FIREBASE_SERVER_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

  try {
    // ══════════════════════════════════════
    // JOB 1 : RÉCAP MONITEURS (planning du jour)
    // ══════════════════════════════════════
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayLabel = today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n📋 [JOB 1] Récap moniteurs — ${todayStr}`);

    const todaySnap = await adminDb.collection("creneaux")
      .where("date", "==", todayStr)
      .get();

    const todayCreneaux = todaySnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (todayCreneaux.length > 0) {
      // Grouper par moniteur
      const byMonitor: Record<string, any[]> = {};
      for (const c of todayCreneaux) {
        const monitor = c.monitor || "Non assigné";
        if (!byMonitor[monitor]) byMonitor[monitor] = [];
        byMonitor[monitor].push(c);
      }
      results.monitorRecap.monitors = Object.keys(byMonitor);

      // Chercher les tokens push des staff
      const staffTokens: { name: string; token: string; role: string; email: string }[] = [];

      // Via collection "staff"
      try {
        const staffSnap = await adminDb.collection("staff").get();
        for (const doc of staffSnap.docs) {
          const data = doc.data();
          if (data.pushToken && (data.role === "admin" || data.role === "enseignant")) {
            staffTokens.push({ name: data.name || "Staff", token: data.pushToken, role: data.role, email: data.email || "" });
          }
        }
      } catch { /* collection n'existe pas encore */ }

      // Fallback : push_tokens des comptes admin connus
      if (staffTokens.length === 0) {
        for (const [monitorName, emails] of Object.entries(STAFF_EMAILS)) {
          for (const email of emails) {
            const famSnap = await adminDb.collection("families").where("parentEmail", "==", email).limit(1).get();
            if (!famSnap.empty) {
              const familyId = famSnap.docs[0].id;
              const tokenSnap = await adminDb.collection("push_tokens").doc(familyId).get();
              if (tokenSnap.exists && tokenSnap.data()?.token) {
                staffTokens.push({ name: monitorName, token: tokenSnap.data()!.token, role: "admin", email });
              }
            }
          }
        }
      }

      // Envoyer push notifications aux moniteurs
      if (fcmKey) {
        for (const staff of staffTokens) {
          const monitorCreneaux = byMonitor[staff.name] || [];
          const totalInscrits = todayCreneaux.reduce((s, c) => s + (c.enrolled || []).length, 0);

          let body: string;
          if (monitorCreneaux.length > 0) {
            const details = monitorCreneaux
              .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))
              .map((c: any) => `${c.startTime} ${c.activityTitle} (${(c.enrolled || []).length}/${c.maxPlaces})`)
              .join(" · ");
            body = `Tes ${monitorCreneaux.length} cours : ${details}`;
          } else if (staff.role === "admin") {
            body = `${todayCreneaux.length} cours · ${totalInscrits} cavaliers inscrits`;
          } else {
            continue;
          }

          try {
            const res = await fetch("https://fcm.googleapis.com/fcm/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `key=${fcmKey}` },
              body: JSON.stringify({
                to: staff.token,
                notification: { title: `📋 Planning du ${todayLabel}`, body, icon: "/icons/icon-192x192.png" },
                webpush: {
                  notification: { title: `📋 Planning du ${todayLabel}`, body, icon: "/icons/icon-192x192.png" },
                  fcm_options: { link: `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}/admin/planning` },
                },
              }),
            });
            const data = await res.json();
            if (data.success) { results.monitorRecap.pushSent++; console.log(`  ✅ Push → ${staff.name}`); }
          } catch (e) { console.error(`  ❌ Push ${staff.name}:`, e); }
        }
      }

      // Envoyer email récap aux moniteurs
      if (resendKey) {
        for (const [monitorName, emails] of Object.entries(STAFF_EMAILS)) {
          const monitorCreneaux = byMonitor[monitorName] || [];
          if (monitorCreneaux.length === 0 && !emails.some(e => e.includes("ceagon"))) continue;

          const coursToShow = monitorCreneaux.length > 0 ? monitorCreneaux : todayCreneaux;
          const isPersonal = monitorCreneaux.length > 0;

          const lignes = coursToShow
            .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))
            .map((c: any) => {
              const enrolled = (c.enrolled || []).length;
              const cavaliers = (c.enrolled || []).map((e: any) => e.childName).join(", ");
              return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e3a5f;font-weight:600;">${c.startTime}–${c.endTime}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#555;">${c.activityTitle}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#555;">${c.monitor || "—"}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:${enrolled >= c.maxPlaces ? '#dc2626' : '#16a34a'};font-weight:600;">${enrolled}/${c.maxPlaces}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">${cavaliers || "—"}</td>
              </tr>`;
            }).join("");

          const html = `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:24px;">
            <div style="background:#0C1A2E;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="color:#F0A010;font-size:18px;font-weight:bold;margin:0;">📋 Planning du ${todayLabel}</p>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="color:#1e3a5f;font-size:15px;">Bonjour <strong>${monitorName}</strong>,</p>
              <p style="color:#555;">${isPersonal ? `Tu as <strong>${monitorCreneaux.length} cours</strong> aujourd'hui :` : `Planning complet (<strong>${coursToShow.length} cours</strong>) :`}</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <thead><tr style="background:#f8fafc;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Horaire</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Cours</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Moniteur</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Places</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Cavaliers</th>
                </tr></thead>
                <tbody>${lignes}</tbody>
              </table>
              <p style="color:#94a3b8;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville</p>
            </div>
          </div>`;

          for (const email of emails) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: fromEmail, to: email,
                  subject: `📋 Planning ${todayLabel} — ${isPersonal ? `${monitorCreneaux.length} cours` : `${coursToShow.length} cours`}`,
                  html,
                }),
              });
              results.monitorRecap.emailsSent++;
              console.log(`  📧 Email récap → ${email}`);
            } catch (e) { console.error(`  ❌ Email ${email}:`, e); }
          }
        }
      }
    } else {
      console.log("  → Aucun créneau aujourd'hui");
    }

    // ══════════════════════════════════════
    // JOB 2 : RAPPELS J-1 FAMILLES (demain)
    // ══════════════════════════════════════
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const tomorrowLabel = tomorrow.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n🔔 [JOB 2] Rappels J-1 pour le ${tomorrowStr}`);

    const tomorrowSnap = await adminDb.collection("creneaux")
      .where("date", "==", tomorrowStr)
      .get();

    // Filtrer les créneaux non clôturés côté client
    const tomorrowCreneaux = tomorrowSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((c: any) => c.status !== "closed") as any[];

    if (tomorrowCreneaux.length > 0) {
      // Collecter les familles à notifier
      const recipients = new Map<string, {
        parentName: string;
        familyId: string;
        items: { childName: string; coursTitle: string; horaire: string; moniteur: string; isStage: boolean }[];
      }>();

      for (const c of tomorrowCreneaux) {
        const enrolled = c.enrolled || [];
        const isStage = c.activityType === "stage" || c.activityType === "stage_journee";

        for (const e of enrolled) {
          if (!e.familyId) continue;

          let familyEmail = e.familyEmail || "";
          let parentName = e.familyName || "";

          if (!familyEmail) {
            try {
              const famSnap = await adminDb.collection("families").doc(e.familyId).get();
              if (famSnap.exists) {
                const famData = famSnap.data()!;
                familyEmail = famData.parentEmail || "";
                parentName = parentName || famData.parentName || "";
              }
            } catch {}
          }

          if (!familyEmail) continue;

          if (!recipients.has(familyEmail)) {
            recipients.set(familyEmail, { parentName, familyId: e.familyId, items: [] });
          }

          recipients.get(familyEmail)!.items.push({
            childName: e.childName || "",
            coursTitle: c.activityTitle,
            horaire: `${c.startTime}–${c.endTime}`,
            moniteur: c.monitor || "",
            isStage,
          });
        }
      }

      results.familyReminders.families = recipients.size;

      // Envoyer push notifications aux familles
      if (fcmKey) {
        for (const [, { familyId, parentName, items }] of recipients) {
          try {
            const tokenSnap = await adminDb.collection("push_tokens").doc(familyId).get();
            if (tokenSnap.exists && tokenSnap.data()?.token) {
              const token = tokenSnap.data()!.token;
              const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");
              const body = items.length === 1
                ? `${items[0].coursTitle} · ${items[0].horaire}${childrenStr ? ` — ${childrenStr}` : ""}`
                : `${items.length} séances demain${childrenStr ? ` — ${childrenStr}` : ""}`;

              await fetch("https://fcm.googleapis.com/fcm/send", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `key=${fcmKey}` },
                body: JSON.stringify({
                  to: token,
                  notification: { title: `🐴 Rappel — demain ${tomorrowLabel}`, body, icon: "/icons/icon-192x192.png" },
                  webpush: {
                    notification: { title: `🐴 Rappel — demain`, body, icon: "/icons/icon-192x192.png" },
                    fcm_options: { link: `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}/espace-cavalier/reservations` },
                  },
                }),
              });
            }
          } catch { /* token invalide ou absent, pas grave */ }
        }
      }

      // Envoyer emails J-1
      if (resendKey) {
        for (const [email, { parentName, items }] of recipients) {
          try {
            const lignes = items.map(item => `
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0;">
                <p style="margin:0;color:#1e40af;font-weight:600;font-size:14px;">
                  ${item.isStage ? "🏕️" : "🐴"} ${item.coursTitle}
                  ${items.length > 1 ? `<span style="color:#64748b;font-size:12px;"> — ${item.childName}</span>` : ""}
                </p>
                <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 ${tomorrowLabel}</p>
                <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${item.horaire}</p>
                ${item.moniteur ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">👤 ${item.moniteur}</p>` : ""}
              </div>
            `).join("");

            const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");
            const subject = items.length === 1
              ? `Rappel — ${items[0].coursTitle} demain`
              : `Rappel — ${items.length} séances demain`;

            const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <div style="background:#0C1A2E;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center;">
                <p style="color:#F0A010;font-size:18px;font-weight:bold;margin:0;">🐴 Centre Équestre d'Agon-Coutainville</p>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                <p style="color:#1e3a5f;font-size:15px;">Bonjour <strong>${parentName || "cher parent"}</strong>,</p>
                <p style="color:#555;">Petit rappel pour demain${childrenStr ? ` — <strong>${childrenStr}</strong>` : ""} :</p>
                ${lignes}
                <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;">
                  <p style="margin:0;color:#854d0e;font-size:13px;">💡 N'oubliez pas : casque obligatoire, tenue adaptée recommandée.</p>
                </div>
                <p style="color:#555;font-size:13px;">À demain au centre équestre !</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                <p style="color:#94a3b8;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville — Agon-Coutainville, Normandie</p>
              </div>
            </div>`;

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
            });

            results.familyReminders.sent++;
            console.log(`  ✅ Rappel J-1 → ${email} (${items.length} séance${items.length > 1 ? "s" : ""})`);
          } catch (e) {
            results.familyReminders.errors++;
            console.error(`  ❌ Erreur ${email}:`, e);
          }
        }
      }
    } else {
      console.log("  → Aucun créneau demain");
    }

    console.log("\n✅ Cron daily-notifications terminé");
    return NextResponse.json({ success: true, ...results });

  } catch (error: any) {
    console.error("Cron daily-notifications error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
