import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { refreshEmailMode, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { logEmail } from "@/lib/email-log";
import {
  emailLayout, emailButton, emailPanneau, emailTitre,
  emailParagraphe as P, emailSignature, emailCouleurs as CE,
} from "@/lib/email-templates";

const POLICE_MSG = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
  const [snap, famSnap] = await Promise.all([
    adminDb.collection("creneaux").where("date", ">=", aujourdhui).get(),
    adminDb.collection("families").get(),
  ]);

  // Index des familles par id, et des enfants par childId. L'inscription d'un
  // créneau garde le familyId du moment : si l'enfant a depuis changé de
  // fiche (« Lier cavaliers », fusion de doublons, fiche recréée), l'ancien
  // id pointe dans le vide et la famille apparaissait « sans email » alors
  // que sa fiche actuelle en a un. On résout donc la fiche RÉELLE : par
  // familyId, en suivant les fusions (mergedInto), puis par l'enfant lui-même.
  const parId = new Map<string, any>();
  const parEnfant = new Map<string, { fam: any; child: any }>();
  famSnap.docs.forEach(d => {
    const fd = { id: d.id, ...(d.data() as any) };
    parId.set(d.id, fd);
    (fd.children || []).forEach((c: any) => { if (c?.id) parEnfant.set(c.id, { fam: fd, child: c }); });
  });
  const resoudreFamille = (e: any): any => {
    let fam = parId.get(e.familyId);
    let garde = 0;
    while (fam?.mergedInto && parId.get(fam.mergedInto) && garde++ < 3) fam = parId.get(fam.mergedInto);
    const viaEnfant = e.childId ? parEnfant.get(e.childId)?.fam : null;
    // La fiche portant réellement l'enfant prime dès que la piste familyId
    // est morte ou muette (fiche disparue, fusionnée, sans email).
    if (viaEnfant && (!fam || fam.status === "merged" || !(fam.parentEmail || "").trim())) fam = viaEnfant;
    return fam || null;
  };

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
      const fam = resoudreFamille(e);
      const cle = fam?.id || e.familyId;
      if (!cle) continue;
      if (!parFamille.has(cle)) {
        parFamille.set(cle, {
          familyId: cle,
          familyName: fam?.parentName || e.familyName || "",
          email: (fam?.parentEmail || "").trim(),
          lignes: [],
        });
      }
      const jourIndex = c.date ? (new Date(c.date + "T12:00:00Z").getUTCDay() + 6) % 7 : -1;
      // Nom actuel de la fiche (Prénom Nom) plutôt que la copie figée du
      // créneau, souvent réduite au prénom.
      const enfant = e.childId ? parEnfant.get(e.childId)?.child : null;
      const nomEnfant = enfant
        ? `${enfant.firstName || ""} ${enfant.lastName || ""}`.trim() || e.childName || ""
        : e.childName || "";
      parFamille.get(cle)!.lignes.push({
        childName: nomEnfant,
        activite: c.activityTitle || "",
        date: c.date || "",
        horaire: `${c.startTime || ""}–${c.endTime || ""}`,
        annuel: e.preinscriptionMode === "annuel",
        waKey: c.activityId && jourIndex >= 0 ? `${c.activityId}-${jourIndex}-${c.startTime}` : "",
      });
    }
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

/**
 * Familles dont on tient un IBAN : un mandat SEPA, actif ou en attente de
 * signature, qui porte un IBAN. Un mandat révoqué ou annulé ne compte pas.
 * C'est ce qui manque le plus souvent à un dossier de pré-inscrit : la
 * liste le montre d'un coup d'œil, vert ou rouge.
 */
async function famillesAvecIban(): Promise<Set<string>> {
  const avec = new Set<string>();
  try {
    const snap = await adminDb.collection("mandats-sepa").get();
    for (const d of snap.docs) {
      const m = d.data() as any;
      const statut = String(m.status || "active").toLowerCase();
      if (["revoked", "revoque", "cancelled", "annule", "inactive"].includes(statut)) continue;
      if (m.familyId && String(m.iban || "").replace(/\s/g, "").length >= 15) avec.add(m.familyId);
    }
  } catch (e) {
    console.warn("[preinscrits] lecture des mandats SEPA :", e);
  }
  return avec;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const [familles, prevenues, ibans] = await Promise.all([collecter(), dejaPrevenues(), famillesAvecIban()]);
  const enrichies = familles.map(f => ({
    ...f,
    dejaPrevenuLe: prevenues.get(f.familyId) || null,
    iban: ibans.has(f.familyId),
  }));
  return NextResponse.json({
    nbFamilles: enrichies.length,
    nbPlaces: enrichies.reduce((s, f) => s + f.lignes.length, 0),
    sansEmail: enrichies.filter(f => !f.email).length,
    dejaPrevenues: enrichies.filter(f => f.dejaPrevenuLe).length,
    avecIban: enrichies.filter(f => f.iban).length,
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

    const html = emailLayout([
      P(`Bonjour ${f.familyName || ""},`),
      `<div style="white-space:pre-wrap;font-family:${POLICE_MSG};font-size:15px;line-height:1.65;color:${CE.texte};margin:0 0 4px;">${message
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
      emailPanneau(`Place${f.lignes.length > 1 ? "s" : ""} retenue${f.lignes.length > 1 ? "s" : ""}`,
        `<ul style="margin:0;padding-left:18px;font-family:${POLICE_MSG};font-size:14px;line-height:1.8;color:${CE.texte};">${lignes}</ul>`),
      (() => {
        // Groupes WhatsApp des reprises de CETTE famille. Un lien vers son
        // propre groupe convainc bien mieux qu'un lien générique.
        const liens = [...new Map(
          f.lignes
            .filter(l => l.waKey && waReprises[l.waKey])
            .map(l => [l.waKey, { label: l.activite, url: waReprises[l.waKey] }])
        ).values()];
        if (liens.length === 0 && !waCommunity) return "";
        const boutons = liens.length > 0
          ? liens.map(l => emailButton(`Groupe WhatsApp — ${l.label}`, l.url)).join("")
          : emailButton("Rejoindre la communauté WhatsApp", waCommunity);
        return emailPanneau("Le groupe WhatsApp de votre reprise",
          P("C'est par là que passent les infos de dernière minute : météo, changement d'horaire, séance annulée. Un seul clic, une seule fois.", 14) + boutons);
      })(),
      emailPanneau("Votre espace famille", [
        P("Nous changeons d'outil de gestion cette saison. Vous disposez désormais d'un espace en ligne pour consulter le planning et vos réservations, retrouver vos factures, suivre la progression et les galops de votre enfant, et réserver stages et balades.", 14),
        emailButton("Accéder à mon espace", "https://centre-equestre-agon.vercel.app/espace-cavalier"),
        P("À partir du 1<sup>er</sup> octobre, l'adresse deviendra <strong>centreequestreagon.com</strong>. Vous serez redirigé automatiquement.", 12),
      ].join("")),
      P("Vous pouvez répondre directement à ce message, il nous parviendra.", 13),
      emailSignature(),
    ].join("\n"), `Place${f.lignes.length > 1 ? "s" : ""} retenue${f.lignes.length > 1 ? "s" : ""} pour la saison`);

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
        status: "failed", error: "Erreur interne",
        familyId: f.familyId,
      }).catch(() => {});
    }
    // Cadence sous la limite Resend (2 requêtes/seconde).
    await new Promise(r => setTimeout(r, 600));
  }

  return NextResponse.json({ ok: true, envoyes, bloques, erreurs, total: familles.length });
}
