import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { adminDb } from "@/lib/firebase-admin";
import { sendPush } from "@/lib/push";
import { loadTemplate } from "@/lib/email-template-loader";
import { compareCreneaux } from "@/lib/creneau-sort";
import { logEmail } from "@/lib/email-log";
import { addDaysParis } from "@/lib/date-local";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailSignature, emailCouleurs as CE,
} from "@/lib/email-templates";

const POLICE_TAB = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Emails toujours destinataires du récap GLOBAL (les gérants), même sans
// cours assigné. Les monitrices, elles, viennent des fiches `moniteurs`.
const ADMIN_RECAP_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com"];

/**
 * Destinataires du récap : construits depuis les fiches moniteurs
 * (Paramètres > Moniteurs), plus les admins.
 *
 * La liste était auparavant écrite en dur avec deux personnes : les
 * monitrices n'ont jamais reçu leur planning. Ajouter une fiche avec un
 * email suffit désormais — sans repasser par le code.
 *
 * Le rapprochement créneau ↔ moniteur ignore accents et tirets : un
 * créneau saisi « Emeline » retrouve la fiche « Éméline ».
 */
async function chargerDestinatairesRecap(): Promise<{ name: string; emails: string[]; isAdmin: boolean }[]> {
  const destinataires: { name: string; emails: string[]; isAdmin: boolean }[] = [];
  try {
    const snap = await adminDb.collection("moniteurs").where("status", "==", "active").get();
    for (const doc of snap.docs) {
      const d = doc.data() as any;
      const email = String(d.email || "").trim();
      if (!d.name || !email) continue;
      const isAdmin = ADMIN_RECAP_EMAILS.includes(email.toLowerCase());
      destinataires.push({ name: String(d.name).trim(), emails: [email], isAdmin });
    }
  } catch (e) {
    console.error("Lecture fiches moniteurs:", e);
  }
  // Les gérants reçoivent toujours le récap global, fiche ou pas.
  for (const email of ADMIN_RECAP_EMAILS) {
    if (!destinataires.some(x => x.emails.includes(email))) {
      destinataires.push({ name: "Nicolas", emails: [email], isAdmin: true });
    }
  }
  return destinataires;
}

const cleNom = (nom: string) => String(nom || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[-'\s]+/g, " ")
  .trim();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    declarationsAnciennes: { nb: 0, emailSent: 0 },
    monitorRecap: { pushSent: 0, emailsSent: 0, blocked: 0, monitors: [] as string[] },
    familyReminders: { pushSent: 0, emailsSent: 0, errors: 0, blocked: 0, families: 0 },
    soldeStagej7: { emailsSent: 0, errors: 0, blocked: 0 },
    saisonRappel: { emailsSent: 0, errors: 0, blocked: 0, families: 0 },
  };

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

  try {
    // target=tomorrow → décalage de +1 jour (cron du soir pour le lendemain)
    // target=today (défaut) → sémantique historique (cron du matin pour aujourd'hui)
    const target = new URL(req.url).searchParams.get("target") || "today";
    const dayShift = target === "tomorrow" ? 1 : 0;

    // ══════════════════════════════════════
    // JOB 1 : RÉCAP MONITEURS (planning du jour cible)
    // ══════════════════════════════════════
    const todayStr = addDaysParis(dayShift);
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const today = new Date(ty, tm - 1, td, 12, 0, 0);
    const todayLabel = today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n📋 [JOB 1] Récap moniteurs — ${todayStr} (target=${target})`);

    const todaySnap = await adminDb.collection("creneaux").where("date", "==", todayStr).get();
    const todayCreneaux = todaySnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (todayCreneaux.length > 0) {
      const byMonitor: Record<string, any[]> = {};
      for (const c of todayCreneaux) {
        // Un creneau en BINOME porte « Emeline, Aubance » : chaque nom doit
        // recevoir le cours. Comparer la chaine entiere ne matchait personne
        // — les monitrices ne recevaient que leurs cours en solo.
        const noms = String(c.monitor || "").split(/[,&/+]/).map(cleNom).filter(Boolean);
        if (noms.length === 0) noms.push("non assigne");
        for (const nom of noms) {
          if (!byMonitor[nom]) byMonitor[nom] = [];
          byMonitor[nom].push(c);
        }
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
        // Fallback : retrouver les tokens push via les fiches moniteurs
        for (const { name: monitorName, emails, isAdmin } of await chargerDestinatairesRecap()) {
          for (const email of emails) {
            const famSnap = await adminDb.collection("families").where("parentEmail", "==", email).limit(1).get();
            if (!famSnap.empty) {
              const familyId = famSnap.docs[0].id;
              const tokenSnap = await adminDb.collection("push_tokens").doc(familyId).get();
              if (tokenSnap.exists && tokenSnap.data()?.token) {
                staffTokens.push({ name: monitorName, token: tokenSnap.data()!.token, role: isAdmin ? "admin" : "enseignant", email });
              }
            }
          }
        }
      }

      // Push aux moniteurs
      for (const staff of staffTokens) {
        const monitorCreneaux = byMonitor[cleNom(staff.name)] || [];
        const totalInscrits = todayCreneaux.reduce((s, c) => s + (c.enrolled || []).length, 0);

        let body: string;
        if (monitorCreneaux.length > 0) {
          const details = monitorCreneaux
            .sort(compareCreneaux)
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
        const destinataires = await chargerDestinatairesRecap();
        for (const { name: monitorName, emails, isAdmin } of destinataires) {
          const monitorCreneaux = byMonitor[cleNom(monitorName)] || [];
          // Une monitrice sans cours demain ne reçoit RIEN : le récap global
          // est réservé aux admins (règle : « seulement SES cours »).
          if (monitorCreneaux.length === 0 && !isAdmin) continue;

          const coursToShow = monitorCreneaux.length > 0 ? monitorCreneaux : todayCreneaux;
          const isPersonal = monitorCreneaux.length > 0;

          const lignes = coursToShow
            .sort(compareCreneaux)
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

          const html = emailLayout([
            emailTitre(`Planning du ${todayLabel}`),
            P(`Bonjour <strong>${monitorName}</strong>,`),
            P(isPersonal ? `Tu as <strong>${monitorCreneaux.length} cours</strong> aujourd'hui :` : `Planning complet (<strong>${coursToShow.length} cours</strong>) :`),
            `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:${POLICE_TAB};">
              <thead><tr>
                ${["Horaire", "Cours", "Moniteur", "Places", "Cavaliers"].map(t =>
                  `<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${CE.gris};border-bottom:1px solid ${CE.bord};">${t}</th>`).join("")}
              </tr></thead>
              <tbody>${lignes}</tbody>
            </table>`,
          ].join("\n"), `${isPersonal ? monitorCreneaux.length : coursToShow.length} cours le ${todayLabel}`);

          for (const email of emails) {
            await refreshEmailMode();
            if (!isRecipientAllowed(email)) {
              results.monitorRecap.blocked++;
              console.log(blockedLog(email, "cron_monitor_recap"));
              continue;
            }
            const subject = `📋 Planning ${todayLabel} — ${isPersonal ? `${monitorCreneaux.length} cours` : `${coursToShow.length} cours`}`;
            try {
              const resendRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
              });
              if (resendRes.ok) {
                results.monitorRecap.emailsSent++;
                await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "sent", sentBy: "system" });
                console.log(`  📧 Email → ${email}`);
              } else {
                const errText = await resendRes.text().catch(() => "");
                await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system" });
                console.error(`  ❌ Resend ${resendRes.status} pour ${email}`);
              }
            } catch (e) {
              await logEmail({ to: email, subject, context: "cron_monitor_recap", template: "monitorRecap", status: "failed", error: (e as any)?.message || String(e), sentBy: "system" });
              console.error(`  ❌ Email ${email}:`, e);
            }
          }
        }
      }
    } else {
      console.log("  → Aucun créneau aujourd'hui");
    }

    // ══════════════════════════════════════
    // JOB 2 : RAPPELS J-1 FAMILLES (lendemain du jour cible)
    // ══════════════════════════════════════
    const tomorrowStr = addDaysParis(1 + dayShift);
    const [tomY, tomM, tomD] = tomorrowStr.split("-").map(Number);
    const tomorrow = new Date(tomY, tomM - 1, tomD, 12, 0, 0);
    const tomorrowLabel = tomorrow.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n🔔 [JOB 2] Rappels J-1 pour le ${tomorrowStr} (target=${target})`);

    const tomorrowSnap = await adminDb.collection("creneaux").where("date", "==", tomorrowStr).get();
    const tomorrowCreneaux = tomorrowSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.status !== "closed") as any[];

    if (tomorrowCreneaux.length > 0) {
      const recipients = new Map<string, { parentName: string; familyId: string; items: { childName: string; coursTitle: string; horaire: string; moniteur: string; isStage: boolean }[] }>();

      // ── Rappel J-1 = STAGES UNIQUEMENT, et seulement la veille du JOUR 1 ──
      // Les cours réguliers ne reçoivent plus de rappel J-1 (cf. rappel de saison).
      // "Jour 1" d'un stage = aucun créneau du même stage la veille de "demain".
      // Comme les stages tournent lun→ven avec un week-end de battement, le 1er
      // jour est toujours détecté (la veille — dimanche — n'a pas le stage).
      const veilleStr = addDaysParis(dayShift); // jour précédant "demain"
      const veilleSnap = await adminDb.collection("creneaux").where("date", "==", veilleStr).get();
      const stagesDejaEnCours = new Set<string>(
        veilleSnap.docs
          .map(d => d.data() as any)
          .filter((c: any) => c.activityType === "stage" || c.activityType === "stage_journee")
          .map((c: any) => c.activityTitle)
      );

      for (const c of tomorrowCreneaux) {
        const isStage = c.activityType === "stage" || c.activityType === "stage_journee";
        // Plus aucun rappel J-1 pour les cours réguliers — uniquement les stages.
        if (!isStage) continue;
        // Stage déjà présent la veille → ce n'est pas le jour 1 → pas de rappel.
        if (stagesDejaEnCours.has(c.activityTitle)) continue;
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
            if (!isRecipientAllowed(email)) {
              results.familyReminders.blocked++;
              console.log(blockedLog(email, "cron_rappel_j1"));
              continue;
            }
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

            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
            });
            if (resendRes.ok) {
              results.familyReminders.emailsSent++;
              await logEmail({ to: email, subject, context: "cron_rappel_j1", template: "rappelJ1", status: "sent", sentBy: "system" });
              console.log(`  ✅ Rappel J-1 → ${email}`);
            } else {
              results.familyReminders.errors++;
              const errText = await resendRes.text().catch(() => "");
              await logEmail({ to: email, subject, context: "cron_rappel_j1", template: "rappelJ1", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system" });
            }
          } catch (e) {
            results.familyReminders.errors++;
            await logEmail({ to: email, subject: "Rappel J-1", context: "cron_rappel_j1", template: "rappelJ1", status: "failed", error: (e as any)?.message || String(e), sentBy: "system" });
          }
        }
      }
    } else {
      console.log("  → Aucun créneau demain");
    }

    // ══════════════════════════════════════
    // JOB 3 : RAPPEL SOLDE STAGE J-7
    // ══════════════════════════════════════
    const j7Str = addDaysParis(7);
    const [j7y, j7m, j7d] = j7Str.split("-").map(Number);
    const j7 = new Date(j7y, j7m - 1, j7d, 12, 0, 0);
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
          if (!isRecipientAllowed(data.email)) {
            results.soldeStagej7.blocked++;
            console.log(blockedLog(data.email, "cron_stage_solde"));
            continue;
          }
          const totalSolde = data.items.reduce((s, i) => s + i.solde, 0);
          const activites = data.items.map(i => i.activityTitle).join(", ");

          // Générer le lien de paiement CAWL pour le solde
          const paymentId = data.items[0]?.paymentId || "";
          const soldeLink = `${appUrl}/espace-cavalier/factures?payId=${paymentId}`;

          const subject = `💳 Rappel solde stage — ${totalSolde.toFixed(2)}€ à régler avant le ${j7Label}`;
          const html = emailLayout([
            emailTitre("Le stage commence dans une semaine"),
            P(`Bonjour <strong>${data.familyName}</strong>,`),
            P(`Votre stage commence dans <strong>7 jours</strong> (${j7Label}).`),
            emailPanneau("", [
              emailLigne('<strong style="color:' + CE.encre + ';">Solde à régler</strong>', `${totalSolde.toFixed(2).replace(".", ",")}&nbsp;€`),
              emailLigne("Prestations", activites),
            ].join("")),
            emailButton("Régler mon solde", soldeLink),
            P("Vous pouvez aussi régler sur place, par carte, chèque ou espèces.", 13),
            emailSignature(),
          ].join("\n"), `${totalSolde.toFixed(2).replace(".", ",")} € à régler avant le ${j7Label}`);

          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: data.email,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html,
            }),
          });
          if (resendRes.ok) {
            results.soldeStagej7.emailsSent++;
            await logEmail({ to: data.email, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "sent", sentBy: "system", familyId, paymentId: data.items[0]?.paymentId });
            console.log(`  ✅ Rappel solde J-7 → ${data.email} (${totalSolde.toFixed(2)}€)`);
          } else {
            results.soldeStagej7.errors++;
            const errText = await resendRes.text().catch(() => "");
            await logEmail({ to: data.email, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system", familyId, paymentId: data.items[0]?.paymentId });
          }
        } catch (e) {
          results.soldeStagej7.errors++;
          await logEmail({ to: data.email, subject: "Rappel solde stage J-7", context: "cron_stage_solde", template: "stageSoldeJ7", status: "failed", error: (e as any)?.message || String(e), sentBy: "system", familyId });
          console.error(`  ❌ Erreur rappel solde J-7 → ${data.email}`, e);
        }
      }
    } else {
      console.log("  → Aucun stage dans 7 jours");
    }

    // ══════════════════════════════════════
    // JOB 4 : RAPPEL DE DÉBUT DE SAISON (cours réguliers) — envoi UNIQUE
    // ══════════════════════════════════════
    // Remplace les rappels hebdomadaires des cours : un seul email à la veille
    // de la rentrée, listant à chaque famille son/ses créneau(x) récurrent(s).
    // Config Vercel : SAISON_DEBUT_DATE = "2026-09-21" (jour de rentrée des cours).
    // L'email part la VEILLE (20/09). Idempotent via un marqueur Firestore.
    const saisonDebut = process.env.SAISON_DEBUT_DATE; // ex "2026-09-21"
    if (saisonDebut && /^\d{4}-\d{2}-\d{2}$/.test(saisonDebut)) {
      const debutDate = new Date(`${saisonDebut}T12:00:00`);
      const veilleRentree = addDaysParis(-1, debutDate); // veille de la rentrée
      const realToday = addDaysParis(0);                 // date réelle Paris (indépendante de target)

      if (realToday === veilleRentree) {
        const flagRef = adminDb.collection("system-flags").doc(`saison-rappel-${saisonDebut}`);
        const flagSnap = await flagRef.get();
        if (flagSnap.exists) {
          console.log(`\n🎒 [JOB 4] Rappel de saison déjà envoyé pour ${saisonDebut} — skip`);
        } else {
          console.log(`\n🎒 [JOB 4] Rappel de début de saison (rentrée ${saisonDebut})`);
          // Fenêtre = 1ère semaine de cours (rentrée → +6 jours) = le motif récurrent
          const weekEnd = addDaysParis(6, debutDate);
          const seasonSnap = await adminDb.collection("creneaux")
            .where("date", ">=", saisonDebut).where("date", "<=", weekEnd).get();
          const seasonCreneaux = seasonSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter((c: any) => c.activityType !== "stage" && c.activityType !== "stage_journee" && c.status !== "closed") as any[];

          // Regrouper par famille → créneaux récurrents distincts (jour + heure + titre)
          type Slot = { title: string; jour: string; horaire: string; moniteur: string };
          const famSeason = new Map<string, { parentName: string; familyId: string; slots: Map<string, Slot> }>();
          for (const c of seasonCreneaux) {
            const [yy, mm, dd] = (c.date as string).split("-").map(Number);
            const jourLabel = new Date(yy, mm - 1, dd, 12).toLocaleDateString("fr-FR", { weekday: "long" });
            for (const e of (c.enrolled || [])) {
              if (!e.familyId) continue;
              let famEmail = e.familyEmail || "";
              let parentName = e.familyName || "";
              if (!famEmail) {
                try {
                  const fs = await adminDb.collection("families").doc(e.familyId).get();
                  if (fs.exists) { famEmail = fs.data()!.parentEmail || ""; parentName = parentName || fs.data()!.parentName || ""; }
                } catch {}
              }
              if (!famEmail) continue;
              if (!famSeason.has(famEmail)) famSeason.set(famEmail, { parentName, familyId: e.familyId, slots: new Map() });
              const slotKey = `${c.activityTitle}|${jourLabel}|${c.startTime}`;
              famSeason.get(famEmail)!.slots.set(slotKey, {
                title: c.activityTitle, jour: jourLabel,
                horaire: `${c.startTime}–${c.endTime}`, moniteur: c.monitor || "",
              });
            }
          }
          results.saisonRappel.families = famSeason.size;

          for (const [email, { parentName, slots }] of famSeason) {
            if (!isRecipientAllowed(email)) {
              results.saisonRappel.blocked++;
              console.log(blockedLog(email, "cron_saison_rappel"));
              continue;
            }
            try {
              const lignes = [...slots.values()]
                .sort((a, b) => a.jour.localeCompare(b.jour) || a.horaire.localeCompare(b.horaire))
                .map(s => emailPanneau(s.title, [
                  emailLigne("Jour", s.jour),
                  emailLigne("Horaire", s.horaire),
                  s.moniteur ? emailLigne("Encadrement", s.moniteur) : "",
                ].join(""))).join("");
              const subject = "Reprise des cours — votre planning de la saison";
              const html = emailLayout([
                emailTitre("Les cours reprennent"),
                P(`Bonjour ${parentName || "cher parent"},`),
                P(`Les cours reprennent le <strong>${debutDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>. Voici votre planning récurrent pour la saison :`),
                lignes,
                P("Ce créneau est le vôtre chaque semaine pour toute la saison.", 13),
                emailSignature(),
              ].join("\n"), `Reprise le ${debutDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`);
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ from: fromEmail, to: email, ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}), subject, html }),
              });
              if (res.ok) {
                results.saisonRappel.emailsSent++;
                await logEmail({ to: email, subject, context: "cron_saison_rappel", template: "saisonRappel", status: "sent", sentBy: "system" });
                console.log(`  ✅ Rappel saison → ${email} (${slots.size} créneau(x))`);
              } else {
                results.saisonRappel.errors++;
                const errText = await res.text().catch(() => "");
                await logEmail({ to: email, subject, context: "cron_saison_rappel", template: "saisonRappel", status: "failed", error: `HTTP ${res.status}: ${errText}`.slice(0, 500), sentBy: "system" });
              }
            } catch (e: any) {
              results.saisonRappel.errors++;
              await logEmail({ to: email, subject: "Rappel saison", context: "cron_saison_rappel", template: "saisonRappel", status: "failed", error: "Erreur interne", sentBy: "system" });
            }
          }
          // Marqueur d'idempotence : plus jamais d'envoi pour cette rentrée.
          await flagRef.set({ sentAt: new Date().toISOString(), families: famSeason.size, emailsSent: results.saisonRappel.emailsSent });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Déclarations de règlement qui traînent
    // Un chèque annoncé mais jamais apporté laisse une place occupée et une
    // somme non encaissée, sans que rien ne le signale. Alerte interne au-delà
    // de 15 jours : c'est une décision commerciale, pas une relance à envoyer
    // automatiquement à la famille.
    // ─────────────────────────────────────────────────────────────────────
    const SEUIL_JOURS = 15;
    try {
      const limite = new Date(Date.now() - SEUIL_JOURS * 86400_000);
      const declSnap = await adminDb
        .collection("payment_declarations")
        .where("status", "==", "pending_confirmation")
        .get();

      const anciennes = declSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(d => {
          const cree = d.createdAt?.toDate?.();
          return cree instanceof Date && cree < limite;
        })
        .sort((a, b) => (a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0));

      results.declarationsAnciennes.nb = anciennes.length;

      if (anciennes.length > 0 && resendKey) {
        const dest = process.env.RESEND_BCC_EMAIL || "ceagon50@gmail.com";
        const lignes = anciennes.map(d => {
          const cree = d.createdAt?.toDate?.();
          const jours = cree ? Math.floor((Date.now() - cree.getTime()) / 86400_000) : "?";
          const mode = { cheque: "chèque", especes: "espèces", virement: "virement" }[d.mode as string] || d.mode || "règlement";
          return emailPanneau(
            `${d.familyName || "—"} · ${Number(d.montant || 0).toFixed(2).replace(".", ",")} € par ${mode}`,
            [
              d.activityTitle ? emailLigne("Prestations", String(d.activityTitle)) : "",
              emailLigne("Déclaré il y a", typeof jours === "number" ? `${jours} jour${jours > 1 ? "s" : ""}` : "date inconnue"),
              d.familyEmail ? emailLigne("Email", String(d.familyEmail)) : "",
            ].join(""),
          );
        }).join("");
        const subject = `${anciennes.length} règlement(s) déclaré(s) depuis plus de ${SEUIL_JOURS} jours`;
        const html = emailLayout([
          emailTitre("Règlements déclarés, non confirmés"),
          P("Ces familles ont annoncé un règlement qui n'a toujours pas été confirmé. Leur place reste réservée et la somme n'est pas encaissée."),
          lignes,
          P("À traiter dans Paiements › Déclarations, ou à libérer depuis Inscriptions non payées si la réservation est caduque.", 13),
        ].join("\n"), `${anciennes.length} règlement(s) en attente de confirmation`);
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to: dest, subject, html }),
          });
          if (res.ok) {
            results.declarationsAnciennes.emailSent = 1;
            console.log(`  ✅ Alerte déclarations anciennes → ${dest} (${anciennes.length})`);
          }
        } catch (e) {
          console.error("  ❌ Alerte déclarations anciennes:", e);
        }
      }
    } catch (e) {
      console.error("Déclarations anciennes:", e);
    }

    console.log("\n✅ Cron daily-notifications terminé");
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error("Cron daily-notifications error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(error)}` }, { status: 500 });
  }
}
