import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClubInfo } from "@/lib/club-info";
import { refreshEmailMode, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Dépôt d'un message visiteur depuis la borne d'accueil.
 *
 * C'est la SEULE écriture autorisée à la borne, et elle est volontairement
 * bénigne : une collection dédiée (borne_messages) qui ne touche ni les
 * inscriptions, ni les paiements, ni les familles. Au pire un message
 * farfelu — jamais un enfant inscrit par erreur.
 *
 * Le modèle vocal ne peut appeler cette route qu'APRÈS avoir relu le
 * message au visiteur et obtenu sa confirmation orale (règle du prompt) ;
 * côté serveur on ne fait que valider, tracer et notifier.
 *
 * Notification : email à l'adresse du club + à la boîte gérée par
 * l'assistant IA (ceagon50), en respectant le mode email restreint.
 * Le message est TOUJOURS enregistré en Firestore, même si l'email est
 * bloqué ou échoue — rien ne se perd.
 */

const BOITE_IA = "ceagon50@gmail.com";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 🚦 5 messages / 10 min : une borne d'accueil ne prend pas plus de
  // messages que ça légitimement — au-delà c'est un gamin qui s'amuse
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne_message",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await req.json().catch(() => ({}));
    const nom = String(body?.nom || "").trim().slice(0, 80);
    const telephone = String(body?.telephone || "").trim().slice(0, 30);
    const contenu = String(body?.contenu || "").trim().slice(0, 1000);

    if (!nom || !contenu) {
      return NextResponse.json({ ok: false, error: "Nom et message requis" }, { status: 400 });
    }

    // 1. Toujours enregistrer en base d'abord — la trace prime sur l'email
    const doc = await adminDb.collection("borne_messages").add({
      nom,
      telephone: telephone || null,
      contenu,
      status: "nouveau",
      source: "borne",
      parUid: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Notification email (best effort)
    const club = await getClubInfo();
    await refreshEmailMode();
    const destinataires = Array.from(new Set([club.email, BOITE_IA].filter(Boolean)));
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    let emailEnvoye = false;
    if (apiKey) {
      const resend = new Resend(apiKey);
      for (const to of destinataires) {
        if (!isRecipientAllowed(to)) {
          console.warn(blockedLog(to, "borne_message"));
          continue;
        }
        try {
          await resend.emails.send({
            from,
            to,
            subject: `📩 Message laissé à la borne — ${nom}`,
            text: [
              `Un visiteur a laissé un message sur la borne d'accueil :`,
              ``,
              `Nom : ${nom}`,
              telephone ? `Téléphone : ${telephone}` : `Téléphone : non communiqué`,
              ``,
              `Message :`,
              contenu,
              ``,
              `— Enregistré dans Firestore (borne_messages/${doc.id})`,
            ].join("\n"),
          });
          emailEnvoye = true;
          await logEmail({ to, subject: `Message borne — ${nom}`, context: "borne_message", status: "sent" });
        } catch (e: any) {
          console.error("[Borne message] envoi email échoué:", e?.message || e);
          await logEmail({ to, subject: `Message borne — ${nom}`, context: "borne_message", status: "failed" }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ ok: true, emailEnvoye });
  } catch (e: any) {
    console.error("[Borne message] Erreur:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Erreur interne" }, { status: 500 });
  }
}
