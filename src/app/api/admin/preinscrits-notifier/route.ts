import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { refreshEmailMode, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pré-inscrits : liste (GET) et notification groupée (POST).
 *
 * Une pré-inscription retient une place sans rien facturer. Avant la rentrée,
 * il faut prévenir ces familles : leur place existe, mais elle n'est pas encore
 * confirmée — mandat de prélèvement à signer, dossier à compléter.
 *
 * Les réponses arrivent sur la boîte du centre (REPLY_TO), pas sur le domaine
 * d'envoi qui ne reçoit rien.
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const BCC_SUIVI = "ceagon50@gmail.com";

/** Rassemble les pré-inscrits par famille, sur les créneaux à venir. */
async function collecter() {
  const aujourdhui = new Date().toISOString().split("T")[0];
  const snap = await adminDb
    .collection("creneaux")
    .where("date", ">=", aujourdhui)
    .get();

  const parFamille = new Map<string, {
    familyId: string; familyName: string; email: string;
    lignes: { childName: string; activite: string; date: string; horaire: string; annuel: boolean; waKey: string }[];
  }>();

  for (const d of snap.docs) {
    const c = d.data() as any;
    // Cours à l'année UNIQUEMENT. Une pré-inscription à un stage se règle sur
    // place le jour venu : relancer une famille pour un dossier et un mandat
    // de prélèvement n'aurait aucun sens.
    if (c.activityType === "stage" || c.activityType === "stage_journee") continue;
    for (const e of c.enrolled || []) {
      if (!e?.preinscription) continue;
      if (e.preinscriptionMode === "stage") continue;
      const cle = e.familyId;
      if (!cle) continue;
      if (!parFamille.has(cle)) {
        parFamille.set(cle, {
          familyId: cle, familyName: e.familyName || "", email: "", lignes: [],
        });
      }
      const jourIndex = c.date ? (new Date(c.date + "T12:00:00Z").getUTCDay() + 6) % 7 : -1;
      parFamille.get(cle)!.lignes.push({
        childName: e.childName || "",
        activite: c.activityTitle || "",
        date: c.date || "",
        horaire: `${c.startTime || ""}–${c.endTime || ""}`,
        annuel: e.preinscriptionMode === "annuel",
        waKey: c.activityId && jourIndex >= 0 ? `${c.activityId}-${jourIndex}-${c.startTime}` : "",
      });
    }
  }

  // Emails résolus côté serveur, jamais transmis par le navigateur.
  for (const f of parFamille.values()) {
    try {
      const fam = await adminDb.collection("families").doc(f.familyId).get();
      if (fam.exists) {
        const fd = fam.data() as any;
        f.email = (fd.parentEmail || "").trim();
        if (!f.familyName) f.familyName = fd.parentName || "";
      }
    } catch { /* famille supprimée : laissée sans email, signalée à l'écran */ }
  }

  for (const f of parFamille.values()) {
    f.lignes.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...parFamille.values()].sort((a, b) => a.familyName.localeCompare(b.familyName));
}

/**
 * Familles déjà prévenues : collection preinscritsNotifies, un doc par
 * familyId. Sert à ne pas re-relancer les mêmes familles quand de nouveaux
 * pré-inscrits arrivent — seuls les nouveaux sont cochés par défaut.
 */
async function dejaPrevenues(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const snap = await adminDb.collection("preinscritsNotifies").get();
    snap.forEach(d => {
      const ts = (d.data() as any).lastSentAt;
      const date = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
      map.set(d.id, date ? date.toISOString() : "");
    });
  } catch (e) { console.error("[preinscrits] lecture preinscritsNotifies:", e); }
  return map;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const [familles, prevenues] = await Promise.all([collecter(), dejaPrevenues()]);
  const enrichies = familles.map(f => ({
    ...f,
    dejaPrevenuLe: prevenues.get(f.familyId) || null,
  }));
  return NextResponse.json({
    nbFamilles: enrichies.length,
    nbPlaces: enrichies.reduce((s, f) => s + f.lignes.length, 0),
    sansEmail: enrichies.filter(f => !f.email).length,
    dejaPrevenues: enrichies.filter(f => f.dejaPrevenuLe).length,
    familles: enrichies,
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({} as any));
  const subject = (body?.subject || "").trim();
  const message = (body?.message || "").trim();
  const cibles: string[] = Array.isArray(body?.familyIds) ? body.familyIds : [];
  if (!subject || !message) {
    return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  }

  await refreshEmailMode();

  // Réglages WhatsApp : lien de communauté + un lien par reprise, indexés par
  // `activityId-jourSemaine-heure` comme sur le tableau de bord famille.
  let waCommunity = "";
  let waReprises: Record<string, string> = {};
  try {
    const wa = await adminDb.collection("settings").doc("whatsapp").get();
    if (wa.exists) {
      const d = wa.data() as any;
      waCommunity = d.communityUrl || "";
      waReprises = d.reprises || {};
    }
  } catch { /* absence de réglages : le mail part sans encart WhatsApp */ }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const familles = (await collecter()).filter(
    f => f.email && (cibles.length === 0 || cibles.includes(f.familyId))
  );

  let envoyes = 0, bloques = 0, erreurs = 0;
  for (const f of familles) {
    if (!isRecipientAllowed(f.email)) {
      blockedLog("preinscrits-notifier", f.email);
      bloques++;
      continue;
    }
    const lignes = f.lignes.map(l => {
      const d = new Date(l.date + "T12:00:00").toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long",
      });
      return `<li style="margin-bottom:6px;"><strong>${l.childName}</strong> — ${l.activite}` +
        `${l.annuel ? " (à l'année)" : ` · ${d}`} · ${l.horaire}</li>`;
    }).join("");

    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;">
      <p>Bonjour ${f.familyName || ""},</p>
      <div style="white-space:pre-wrap;line-height:1.6;">${message
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <div style="margin:20px 0;padding:14px;background:#eef2ff;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 8px;font-weight:bold;">Place${f.lignes.length > 1 ? "s" : ""} retenue${f.lignes.length > 1 ? "s" : ""} :</p>
        <ul style="margin:0;padding-left:18px;">${lignes}</ul>
      </div>
      ${(() => {
        // Groupes WhatsApp des reprises de CETTE famille. Un lien vers son
        // propre groupe convainc bien mieux qu'un lien générique.
        const liens = [...new Map(
          f.lignes
            .filter(l => l.waKey && waReprises[l.waKey])
            .map(l => [l.waKey, { label: l.activite, url: waReprises[l.waKey] }])
        ).values()];
        if (liens.length === 0 && !waCommunity) return "";
        const boutons = liens.map(l =>
          `<a href="${l.url}" style="display:block;margin-bottom:8px;padding:11px 16px;background:#16a34a;
             color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
             Groupe WhatsApp — ${l.label}</a>`
        ).join("");
        const communaute = (liens.length === 0 && waCommunity)
          ? `<a href="${waCommunity}" style="display:inline-block;padding:11px 16px;background:#16a34a;
               color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
               Rejoindre la communauté WhatsApp</a>`
          : "";
        return `<div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
          <p style="margin:0 0 6px;font-weight:bold;">Rejoignez le groupe WhatsApp de votre reprise</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
            C'est par là que passent les infos de dernière minute : météo, changement
            d'horaire, séance annulée. Un seul clic, une seule fois.
          </p>
          ${boutons}${communaute}
        </div>`;
      })()}
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <p style="margin:0 0 8px;font-weight:bold;">Votre espace famille</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
          Nous changeons d'outil de gestion cette saison. Vous disposez désormais
          d'un espace en ligne pour consulter le planning et vos réservations,
          retrouver vos factures, suivre la progression et les galops de votre
          enfant, et réserver stages et balades.
        </p>
        <a href="https://centre-equestre-agon.vercel.app/espace-cavalier"
           style="display:inline-block;padding:11px 20px;background:#1e40af;color:#ffffff;
                  text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
          Accéder à mon espace
        </a>
        <p style="margin:12px 0 0;font-size:12px;color:#64748b;">
          À partir du 1<sup>er</sup> octobre, l'adresse deviendra
          <strong>centreequestreagon.com</strong>. Vous serez redirigé automatiquement.
        </p>
      </div>
      <p style="color:#64748b;font-size:13px;">
        Vous pouvez répondre directement à ce message, il nous parviendra.
      </p>
      <p style="margin-top:16px;">Centre Équestre d'Agon-Coutainville</p>
    </div>`;

    try {
      // Resend limite à 2 requêtes/seconde : un dépassement (429) est
      // réessayé une fois après une pause au lieu d'être compté en échec.
      let { error } = await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: f.email,
        bcc: BCC_SUIVI,
        subject,
        html,
      });
      if (error && ((error as any).name === "rate_limit_exceeded" || (error as any).statusCode === 429)) {
        await new Promise(r => setTimeout(r, 1500));
        ({ error } = await resend.emails.send({
          from: FROM_EMAIL, replyTo: REPLY_TO, to: f.email, bcc: BCC_SUIVI, subject, html,
        }));
      }
      if (error) {
        erreurs++;
        console.error("[preinscrits]", f.email, error);
        await logEmail({
          to: f.email, subject, context: "preinscrits_notifier",
          status: "failed", error: (error as any)?.message || String(error),
          familyId: f.familyId,
        });
      } else {
        envoyes++;
        await logEmail({
          to: f.email, subject, context: "preinscrits_notifier",
          status: "sent", familyId: f.familyId,
        });
        // Mémorise la famille comme prévenue : au prochain passage, elle ne
        // sera plus cochée par défaut — seuls les nouveaux pré-inscrits le seront.
        await adminDb.collection("preinscritsNotifies").doc(f.familyId).set({
          familyName: f.familyName || "",
          email: f.email,
          lastSubject: subject,
          lastSentAt: FieldValue.serverTimestamp(),
          nbEnvois: FieldValue.increment(1),
        }, { merge: true });
      }
    } catch (e: any) {
      erreurs++;
      console.error("[preinscrits]", f.email, e);
      await logEmail({
        to: f.email, subject, context: "preinscrits_notifier",
        status: "failed", error: e?.message || String(e),
        familyId: f.familyId,
      }).catch(() => {});
    }
    // Cadence sous la limite Resend (2 requêtes/seconde).
    await new Promise(r => setTimeout(r, 600));
  }

  return NextResponse.json({ ok: true, envoyes, bloques, erreurs, total: familles.length });
}
