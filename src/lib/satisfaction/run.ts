/**
 * Logique d'envoi des questionnaires de satisfaction post-stage.
 * Partagée par /api/cron/satisfaction-stages (CRON_SECRET) et
 * /api/admin/satisfaction-stages (admin connecté, pour tester).
 */
import { adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import { isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";

const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "onboarding@resend.dev";
const BCC = process.env.RESEND_BCC_EMAIL || process.env.RESEND_BCC || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

const norm = (s: string) => (s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\(.*?\)/g, "").replace(/\bstage\b/g, "").replace(/\s+/g, " ").trim();

export const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lundiDe = (s: string) => { const d = new Date(s + "T12:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };

function emailHtml(childFirst: string, stageLabel: string, link: string) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
    <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px">Centre Équestre d'Agon-Coutainville</div>
      <h1 style="margin:6px 0 0;font-size:20px">Votre avis nous intéresse</h1>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p>Bonjour,</p>
      <p>${childFirst ? `${childFirst} vient` : "Votre enfant vient"} de terminer le stage <strong>${stageLabel}</strong>.
      Pour nous aider à progresser, pourriez-vous nous donner votre avis ? Cela prend moins d'une minute.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Donner mon avis</a>
      </p>
      <p style="font-size:12px;color:#64748b">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${link}</p>
      <p style="margin-top:24px">Merci, et à très bientôt !<br>L'équipe du Centre Équestre d'Agon-Coutainville</p>
    </div>
  </div>`;
}

export interface RunOptions { date?: string; dry?: boolean; toOverride?: string; }

export async function runSatisfactionStages(opts: RunOptions = {}) {
  const dateFin = opts.date || parisDate(new Date(Date.now() - 86400000));
  const dry = !!opts.dry;
  const toOverride = (opts.toOverride || "").trim();

  // Créneaux de la fenêtre [dateFin-6j … dateFin]
  const start = addDays(dateFin, -6);
  const snap = await adminDb.collection("creneaux").where("date", ">=", start).where("date", "<=", dateFin).get();

  type Jour = { date: string; monitor: string; enrolled: any[] };
  const groups = new Map<string, { title: string; jours: Jour[] }>();
  for (const d of snap.docs) {
    const c = d.data() as any;
    const type = c.activityType || "";
    if (type !== "stage" && type !== "stage_journee") continue;
    const title = (c.activityTitle || c.title || "").trim();
    const key = `${norm(title)}__${type}`;
    if (!groups.has(key)) groups.set(key, { title, jours: [] });
    groups.get(key)!.jours.push({ date: c.date || "", monitor: c.monitor || "", enrolled: Array.isArray(c.enrolled) ? c.enrolled : [] });
  }

  // Index enfant -> famille (email)
  const famSnap = await adminDb.collection("families").get();
  const childFam = new Map<string, { email: string; familyName: string; familyId: string; childName: string }>();
  for (const d of famSnap.docs) {
    const f = d.data() as any;
    for (const ch of (f.children || [])) {
      childFam.set(ch.id, { email: f.email || "", familyName: f.parentName || "", familyId: d.id, childName: `${ch.firstName || ""} ${ch.lastName || ""}`.trim() });
    }
  }

  const apiKey = process.env.RESEND_API_KEY || "";
  const resend = apiKey ? new Resend(apiKey) : null;
  const result: any = { dateFin, dry, stages: [] as any[], invitations: 0, emails: 0, bloques: 0, sansEmail: 0, sansResend: 0 };

  for (const g of groups.values()) {
    const dates = [...new Set(g.jours.map(j => j.date).filter(Boolean))].sort();
    if (dates.length < 2) continue;                  // stages MULTIJOURS uniquement
    if (dates[dates.length - 1] !== dateFin) continue; // terminés à dateFin

    const semaine = lundiDe(dateFin);
    const stageKey = `${norm(g.title)}_${dates[0]}`;

    const childMon = new Map<string, { childName: string; familyId: string; familyName: string; mons: Set<string> }>();
    for (const j of g.jours) {
      for (const e of j.enrolled) {
        if (!e?.childId) continue;
        if (!childMon.has(e.childId)) childMon.set(e.childId, { childName: e.childName || "", familyId: e.familyId || "", familyName: e.familyName || "", mons: new Set() });
        if (j.monitor) childMon.get(e.childId)!.mons.add(j.monitor);
      }
    }

    const exist = await adminDb.collection("satisfaction-invitations").where("stageKey", "==", stageKey).get();
    const dejaInvite = new Set(exist.docs.map(d => (d.data() as any).childId));

    const report = { stageLabel: g.title, dateFin, enfants: 0, envoyes: 0 };
    for (const [childId, info] of childMon) {
      if (dejaInvite.has(childId)) continue;
      report.enfants++;
      const fam = childFam.get(childId);
      const email = fam?.email || "";
      const invitation = {
        stageKey, stageLabel: g.title, semaine, dateFin,
        childId, childName: info.childName || fam?.childName || "",
        familyId: info.familyId || fam?.familyId || "",
        familyName: info.familyName || fam?.familyName || "",
        familyEmail: email,
        moniteurs: [...info.mons],
        repondu: false,
        createdAt: new Date(),
      };
      if (dry) { result.invitations++; continue; }

      const ref = await adminDb.collection("satisfaction-invitations").add(invitation);
      result.invitations++;
      const link = `${APP_URL}/satisfaction/${ref.id}`;
      const dest = toOverride || email;
      if (!dest) { result.sansEmail++; continue; }
      if (!isRecipientAllowed(dest)) { console.log(blockedLog(dest, "satisfaction-stage")); result.bloques++; continue; }
      if (!resend) { result.sansResend++; continue; }

      const childFirst = (info.childName || "").split(" ")[0];
      const subject = `Votre avis sur le stage${childFirst ? ` de ${childFirst}` : ""}`;
      try {
        await resend.emails.send({ from: FROM, to: dest, ...(BCC ? { bcc: BCC } : {}), subject, html: emailHtml(childFirst, g.title, link) });
        result.emails++; report.envoyes++;
        await logEmail({ to: dest, subject, context: "cron_satisfaction_stage", template: "satisfactionStage", status: "sent", familyId: invitation.familyId, sentBy: "system" }).catch(() => {});
      } catch (err: any) {
        await logEmail({ to: dest, subject, context: "cron_satisfaction_stage", status: "failed", error: String(err?.message || err), sentBy: "system" }).catch(() => {});
      }
    }
    result.stages.push(report);
  }

  return result;
}
