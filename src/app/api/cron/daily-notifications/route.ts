import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPush } from "@/lib/push";
import { loadTemplate } from "@/lib/email-template-loader";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STAFF_EMAILS: Record<string, string[]> = {
  "Emmeline": ["emmelinelagy@gmail.com"],
  "Nicolas": ["ceagon@orange.fr", "ceagon50@gmail.com"],
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    monitorRecap: { pushSent: 0, emailsSent: 0, monitors: [] as string[] },
    familyReminders: { pushSent: 0, emailsSent: 0, errors: 0, families: 0 },
    soldeStagej7: { emailsSent: 0, errors: 0 },
  };

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

  try {
    // ══════════════════════════════════════
    // JOB 1 : RÉCAP MONITEURS (planning du jour)
    // ══════════════════════════════════════
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayLabel = today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n📋 [JOB 1] Récap moniteurs — ${todayStr}`);

    const todaySnap = await adminDb.collection("creneaux").where("date", "==", todayStr).get();
    const todayCreneaux = todaySnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (todayCreneaux.length > 0) {
      const byMonitor: Record<string, any[]> = {};
      for (const c of todayCreneaux) {
        const monitor = c.monitor || "Non assigné";
        if (!byMonitor[monitor]) byMonitor[monitor] = [];
        byMonitor[monitor].push(c);
      }
      results.monitorRecap.monitors = Object.keys(byMonitor);

      // Chercher les tokens push des staff
      const staffTokens: { name: string; token: string; role: string; email: string }[] = [];

      try {
        const staffSnap = await adminDb.collection("staff").get();
        for (const doc of staffSnap.docs) {
          const data = doc.data();
          if (data.pushToken && (data.role === "admin" || data.role === "enseignant")) {
            staffTokens.push({ name: data.name || "Staff", token: data.pushToken, role: data.role, email: data.email || "" });
          }
        }
      } catch {}

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

      // Push aux moniteurs
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

        const ok = await sendPush({ token: staff.token, title: `📋 Planning du ${todayLabel}`, body, url: `${appUrl}/admin/planning` });
        if (ok) { results.monitorRecap.pushSent++; console.log(`  ✅ Push → ${staff.name}`); }
      }

      // Email récap moniteurs (format tableau interne — pas éditable via templates)
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
                body: JSON.stringify({ from: fromEmail, to: email, subject: `📋 Planning ${todayLabel} — ${isPersonal ? `${monitorCreneaux.length} cours` : `${coursToShow.length} cours`}`, html }),
              });
              results.monitorRecap.emailsSent++;
              console.log(`  📧 Email → ${email}`);
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

    const tomorrowSnap = await adminDb.collection("creneaux").where("date", "==", tomorrowStr).get();
    const tomorrowCreneaux = tomorrowSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.status !== "closed") as any[];

    if (tomorrowCreneaux.length > 0) {
      const recipients = new Map<string, { parentName: string; familyId: string; items: { childName: string; coursTitle: string; horaire: string; moniteur: string; isStage: boolean }[] }>();

      for (const c of tomorrowCreneaux) {
        const isStage = c.activityType === "stage" || c.activityType === "stage_journee";
        for (const e of (c.enrolled || [])) {
          if (!e.familyId) continue;

          // ── Skip forfaits annuels — ils connaissent leur créneau récurrent ──
          // Un inscrit via forfait annuel a source="annuel" sur sa réservation
          // ou un payment de type annuel/sepa_scheduled actif pour cet enfant
          try {
            const resSnap = await adminDb.collection("reservations")
              .where("familyId", "==", e.familyId)
              .where("childId", "==", e.childId || "")
              .where("creneauId", "==", c.id)
              .limit(1).get();
            if (!resSnap.empty && resSnap.docs[0].data().source === "annuel") {
              console.log(`  → Skip forfait annuel: ${e.childName} / ${c.activityTitle}`);
              continue;
            }
          } catch {}

          let familyEmail = e.familyEmail || "";
          let parentName = e.familyName || "";
          if (!familyEmail) {
            try {
              const famSnap = await adminDb.collection("families").doc(e.familyId).get();
              if (famSnap.exists) { familyEmail = famSnap.data()!.parentEmail || ""; parentName = parentName || famSnap.data()!.parentName || ""; }
            } catch {}
          }
          if (!familyEmail) continue;
          if (!recipients.has(familyEmail)) recipients.set(familyEmail, { parentName, familyId: e.familyId, items: [] });
          recipients.get(familyEmail)!.items.push({ childName: e.childName || "", coursTitle: c.activityTitle, horaire: `${c.startTime}–${c.endTime}`, moniteur: c.monitor || "", isStage });
        }
      }

      results.familyReminders.families = recipients.size;

      // Push J-1 aux familles
      for (const [, { familyId, items }] of recipients) {
        try {
          const tokenSnap = await adminDb.collection("push_tokens").doc(familyId).get();
          if (tokenSnap.exists && tokenSnap.data()?.token) {
            const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");
            const body = items.length === 1
              ? `${items[0].coursTitle} · ${items[0].horaire}${childrenStr ? ` — ${childrenStr}` : ""}`
              : `${items.length} séances demain${childrenStr ? ` — ${childrenStr}` : ""}`;
            const ok = await sendPush({ token: tokenSnap.data()!.token, title: `🐴 Rappel — demain ${tomorrowLabel}`, body, url: `${appUrl}/espace-cavalier/reservations` });
            if (ok) results.familyReminders.pushSent++;
          }
        } catch {}
      }

      // Email J-1
      if (resendKey) {
        for (const [email, { parentName, items }] of recipients) {
          try {
            const childrenStr = [...new Set(items.map(i => i.childName))].filter(Boolean).join(", ");

            // Construire les blocs HTML pour chaque séance
            const lignesHtml = items.map(item => `
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0;">
                <p style="margin:0;color:#1e40af;font-weight:600;font-size:14px;">${item.isStage ? "🏕️" : "🐴"} ${item.coursTitle}${items.length > 1 ? ` <span style="color:#64748b;font-size:12px;">— ${item.childName}</span>` : ""}</p>
                <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 ${tomorrowLabel}</p>
                <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${item.horaire}</p>
                ${item.moniteur ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">👤 ${item.moniteur}</p>` : ""}
              </div>`).join("");

            // Utiliser loadTemplate pour le rappel J-1
            const { subject, html } = await loadTemplate("rappelJ1", {
              parentName: parentName || "cher parent",
              childName: childrenStr || "",
              coursTitle: items.length === 1 ? items[0].coursTitle : `${items.length} séances`,
              date: tomorrowLabel,
              horaire: items.length === 1 ? items[0].horaire : "",
              moniteur: items.length === 1 ? (items[0].moniteur || "") : "",
              childrenStr: childrenStr ? ` — <strong>${childrenStr}</strong>` : "",
              lignes: lignesHtml,
            });

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
            });
            results.familyReminders.emailsSent++;
            console.log(`  ✅ Rappel J-1 → ${email}`);
          } catch { results.familyReminders.errors++; }
        }
      }
    } else {
      console.log("  → Aucun créneau demain");
    }

    // ══════════════════════════════════════
    // JOB 3 : RAPPEL SOLDE STAGE J-7
    // ══════════════════════════════════════
    const j7 = new Date();
    j7.setDate(j7.getDate() + 7);
    const j7Str = j7.toISOString().split("T")[0];
    const j7Label = j7.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n💳 [JOB 3] Rappels solde stage J-7 — stages du ${j7Str}`);

    // Trouver les créneaux de stage dans 7 jours
    const j7Snap = await adminDb.collection("creneaux")
      .where("date", "==", j7Str)
      .get();
    const j7Creneaux = j7Snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const j7Stages = j7Creneaux.filter((c: any) => c.activityType === "stage" || c.activityType === "stage_journee");

    if (j7Stages.length > 0) {
      // Trouver les paiements partiels (acompte 30% versé, solde 70% attendu)
      const soldePending = await adminDb.collection("payments")
        .where("status", "==", "partial")
        .get();

      // Grouper par famille
      const familiesJ7: Record<string, { email: string; familyName: string; items: any[] }> = {};

      for (const payDoc of soldePending.docs) {
        const p = payDoc.data() as any;
        if (!p.familyEmail || !p.familyId) continue;

        // Vérifier si ce paiement concerne un stage dans 7 jours
        const stageItems = (p.items || []).filter((item: any) => {
          return j7Stages.some((c: any) => c.id === item.creneauId || c.activityTitle === item.activityTitle?.split(" — ")[0]);
        });
        if (stageItems.length === 0) continue;

        const solde = (p.totalTTC || 0) - (p.paidAmount || 0);
        if (solde <= 0) continue;

        if (!familiesJ7[p.familyId]) {
          familiesJ7[p.familyId] = { email: p.familyEmail, familyName: p.familyName || "", items: [] };
        }
        familiesJ7[p.familyId].items.push({
          activityTitle: stageItems[0]?.activityTitle || p.items[0]?.activityTitle || "Stage",
          solde,
          paymentId: payDoc.id,
        });
      }

      for (const [familyId, data] of Object.entries(familiesJ7)) {
        try {
          const totalSolde = data.items.reduce((s, i) => s + i.solde, 0);
          const activites = data.items.map(i => i.activityTitle).join(", ");

          // Générer le lien de paiement CAWL pour le solde
          const paymentId = data.items[0]?.paymentId || "";
          const soldeLink = `${appUrl}/espace-cavalier/factures?payId=${paymentId}`;

          const subject = `💳 Rappel solde stage — ${totalSolde.toFixed(2)}€ à régler avant le ${j7Label}`;
          const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <div style="background:#2050A0;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
              <h2 style="margin:0;font-size:18px;">Centre Équestre d'Agon-Coutainville</h2>
            </div>
            <div style="background:#f8faff;padding:24px;border:1px solid #e0e8ff;border-top:none;border-radius:0 0 12px 12px;">
              <p>Bonjour <strong>${data.familyName}</strong>,</p>
              <p>Votre stage commence dans <strong>7 jours</strong> (${j7Label}).</p>
              <p>Il reste un solde à régler :</p>
              <div style="background:white;border:2px solid #2050A0;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#2050A0;">${totalSolde.toFixed(2)}€</div>
                <div style="color:#555;font-size:13px;margin-top:4px;">${activites}</div>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${soldeLink}" style="background:#2050A0;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                  💳 Régler le solde en ligne
                </a>
              </div>
              <p style="color:#888;font-size:12px;text-align:center;">
                Accédez à votre espace cavalier → Mes factures pour régler par CB en ligne.
              </p>
            </div>
          </div>`;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: data.email,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html,
            }),
          });
          results.soldeStagej7.emailsSent++;
          console.log(`  ✅ Rappel solde J-7 → ${data.email} (${totalSolde.toFixed(2)}€)`);
        } catch (e) {
          results.soldeStagej7.errors++;
          console.error(`  ❌ Erreur rappel solde J-7 → ${data.email}`, e);
        }
      }
    } else {
      console.log("  → Aucun stage dans 7 jours");
    }

    console.log("\n✅ Cron daily-notifications terminé");
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error("Cron daily-notifications error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
