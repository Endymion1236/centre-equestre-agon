/**
 * src/lib/rappel-saison-envoi.ts
 *
 * Le mail de reprise des cours : préparer, puis envoyer.
 *
 * Deux déclencheurs partagent ce module :
 *  - le robot du soir (cron daily-notifications, JOB 4), la veille de la
 *    date `SAISON_DEBUT_DATE` ;
 *  - l'envoi à la main depuis Admin → Communication → Mail de rentrée, quand
 *    le réglage manquait ou que la veille est passée.
 *
 * `preparerRappelSaison` ne fait que lire : combien de familles, quels
 * créneaux, et si l'envoi a déjà eu lieu. `envoyerRappelSaison` envoie, pose
 * le marqueur d'idempotence, et journalise chaque email. Le marqueur bloque
 * tout second envoi pour la même rentrée, sauf demande explicite (`force`).
 */

import { adminDb } from "@/lib/firebase-admin";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { addDaysParis } from "@/lib/date-local";
import { emailLayout, emailSignature } from "@/lib/email-templates";
import { ajouterEnfantAuCreneau, cleCreneauSaison, corpsRappelSaison, type CreneauSaison } from "@/lib/rappel-saison";

export const SUJET_RAPPEL_SAISON = "Reprise des cours — votre planning de la saison";

export interface FamilleRappelSaison {
  email: string;
  parentName: string;
  familyId: string;
  slots: CreneauSaison[];
}

export interface MarqueurRappelSaison {
  sentAt: string;
  families: number;
  emailsSent: number;
  /** Qui a déclenché : « system » (robot) ou l'email de l'admin. */
  sentBy?: string;
}

export interface PreparationRappelSaison {
  saisonDebut: string;
  /** Dernier jour de la première semaine (rentrée + 6). */
  finSemaine: string;
  /** Créneaux de cours retenus (stages et créneaux fermés exclus). */
  creneaux: number;
  familles: FamilleRappelSaison[];
  /** Inscriptions dont la famille n'a pas d'adresse : personne à prévenir. */
  sansEmail: number;
  dejaEnvoye: MarqueurRappelSaison | null;
}

export interface ResultatRappelSaison extends PreparationRappelSaison {
  emailsSent: number;
  errors: number;
  blocked: number;
  /** Vrai quand le marqueur existait et que `force` n'était pas demandé. */
  skipped: boolean;
}

export const dateRentreeValide = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T12:00:00`).getTime());

const marqueurRef = (saisonDebut: string) => adminDb.collection("system-flags").doc(`saison-rappel-${saisonDebut}`);

export async function preparerRappelSaison(saisonDebut: string): Promise<PreparationRappelSaison> {
  if (!dateRentreeValide(saisonDebut)) throw new Error("Date de rentrée invalide (attendu AAAA-MM-JJ)");
  const debutDate = new Date(`${saisonDebut}T12:00:00`);
  const finSemaine = addDaysParis(6, debutDate);

  const flagSnap = await marqueurRef(saisonDebut).get();
  const dejaEnvoye = flagSnap.exists ? (flagSnap.data() as MarqueurRappelSaison) : null;

  const seasonSnap = await adminDb.collection("creneaux")
    .where("date", ">=", saisonDebut).where("date", "<=", finSemaine).get();
  const seasonCreneaux = seasonSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((c: any) => c.activityType !== "stage" && c.activityType !== "stage_journee" && c.status !== "closed") as any[];

  // Regrouper par famille → créneaux récurrents distincts (jour + heure +
  // titre), chacun avec le prénom du ou des enfants.
  const famSeason = new Map<string, { parentName: string; familyId: string; slots: Map<string, CreneauSaison> }>();
  const emailsFamilles = new Map<string, { email: string; parentName: string }>();
  let sansEmail = 0;
  for (const c of seasonCreneaux) {
    const [yy, mm, dd] = String(c.date).split("-").map(Number);
    const jourLabel = new Date(yy, mm - 1, dd, 12).toLocaleDateString("fr-FR", { weekday: "long" });
    for (const e of (c.enrolled || [])) {
      if (!e.familyId) continue;
      let famEmail = String(e.familyEmail || "");
      let parentName = String(e.familyName || "");
      if (!famEmail) {
        const connu = emailsFamilles.get(e.familyId);
        if (connu) { famEmail = connu.email; parentName = parentName || connu.parentName; }
        else {
          try {
            const fs = await adminDb.collection("families").doc(e.familyId).get();
            if (fs.exists) {
              famEmail = String(fs.data()!.parentEmail || "");
              parentName = parentName || String(fs.data()!.parentName || "");
            }
          } catch {}
          emailsFamilles.set(e.familyId, { email: famEmail, parentName });
        }
      }
      if (!famEmail) { sansEmail++; continue; }
      const cle = famEmail.trim().toLowerCase();
      if (!famSeason.has(cle)) famSeason.set(cle, { parentName, familyId: e.familyId, slots: new Map() });
      ajouterEnfantAuCreneau(famSeason.get(cle)!.slots, cleCreneauSaison(c.activityTitle, jourLabel, c.startTime), {
        title: c.activityTitle, jour: jourLabel,
        horaire: `${c.startTime}–${c.endTime}`, moniteur: c.monitor || "",
      }, e.childName || "");
    }
  }

  const familles: FamilleRappelSaison[] = [...famSeason.entries()]
    .map(([email, f]) => ({ email, parentName: f.parentName, familyId: f.familyId, slots: [...f.slots.values()] }))
    .sort((a, b) => a.parentName.localeCompare(b.parentName, "fr"));

  return { saisonDebut, finSemaine, creneaux: seasonCreneaux.length, familles, sansEmail, dejaEnvoye };
}

export async function envoyerRappelSaison(params: {
  saisonDebut: string;
  /** Renvoyer malgré le marqueur (envoi à la main, en connaissance de cause). */
  force?: boolean;
  /** « system » pour le robot, l'email de l'admin pour l'envoi à la main. */
  sentBy: string;
  /** Clé du journal des emails : cron_saison_rappel / admin_saison_rappel. */
  context: string;
}): Promise<ResultatRappelSaison> {
  const { saisonDebut, force = false, sentBy, context } = params;
  const preparation = await preparerRappelSaison(saisonDebut);
  const resultat: ResultatRappelSaison = { ...preparation, emailsSent: 0, errors: 0, blocked: 0, skipped: false };

  if (preparation.dejaEnvoye && !force) {
    console.log(`🎒 Rappel de saison déjà envoyé pour ${saisonDebut} (${preparation.dejaEnvoye.sentAt}) — skip`);
    resultat.skipped = true;
    return resultat;
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const debutDate = new Date(`${saisonDebut}T12:00:00`);
  const titreCourt = `Reprise le ${debutDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;

  for (const famille of preparation.familles) {
    const { email, parentName, slots } = famille;
    if (!isRecipientAllowed(email)) {
      resultat.blocked++;
      console.log(blockedLog(email, context));
      continue;
    }
    try {
      const html = emailLayout([
        corpsRappelSaison({ parentName, debut: debutDate, slots }),
        emailSignature(),
      ].join("\n"), titreCourt);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail, to: email,
          ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
          subject: SUJET_RAPPEL_SAISON, html,
        }),
      });
      if (res.ok) {
        resultat.emailsSent++;
        await logEmail({ to: email, subject: SUJET_RAPPEL_SAISON, context, template: "saisonRappel", status: "sent", sentBy, familyId: famille.familyId });
        console.log(`  ✅ Rappel saison → ${email} (${slots.length} créneau(x))`);
      } else {
        resultat.errors++;
        const errText = await res.text().catch(() => "");
        await logEmail({ to: email, subject: SUJET_RAPPEL_SAISON, context, template: "saisonRappel", status: "failed", error: `HTTP ${res.status}: ${errText}`.slice(0, 500), sentBy, familyId: famille.familyId });
      }
    } catch {
      resultat.errors++;
      await logEmail({ to: email, subject: SUJET_RAPPEL_SAISON, context, template: "saisonRappel", status: "failed", error: "Erreur interne", sentBy, familyId: famille.familyId });
    }
  }

  // Marqueur d'idempotence : plus jamais d'envoi automatique pour cette
  // rentrée. Un renvoi forcé le réécrit avec la nouvelle date.
  await marqueurRef(saisonDebut).set({
    sentAt: new Date().toISOString(),
    families: preparation.familles.length,
    emailsSent: resultat.emailsSent,
    sentBy,
    ...(force && preparation.dejaEnvoye ? { renvoiDe: preparation.dejaEnvoye.sentAt } : {}),
  } satisfies MarqueurRappelSaison & { renvoiDe?: string });

  return resultat;
}
