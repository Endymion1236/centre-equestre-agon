/**
 * POST /api/request-magic-link
 *
 * Route PUBLIQUE (pas d'auth requise) : permet a une famille de demander
 * un lien de connexion par email sans connaitre son mot de passe.
 *
 * Body : { email: string }
 *
 * Reponse :
 *   - 200 toujours, avec message generique :
 *     { ok: true, message: "Si un compte existe..." }
 *     -> on ne revele PAS si l'email existe ou pas (eviter de servir de
 *        oracle a des attaquants qui voudraient enumerer les emails clients)
 *   - 429 si rate limit depasse (3 demandes / email / heure)
 *   - 400 si email malforme
 *
 * Securite :
 *   1. Rate limiting : max 3 demandes par email par heure, max 20 demandes
 *      par IP par heure. Stocke dans Firestore (collection 'rate-limits').
 *   2. Reponse uniforme : meme reponse 200 que l'email existe ou non,
 *      avec un delai aleatoire 200-500ms pour eviter le timing attack.
 *   3. Verification que l'email correspond a une famille existante AVANT
 *      d'envoyer (sinon on enverrait des liens magiques a n'importe qui,
 *      le user Firebase serait cree automatiquement et nous polluerait
 *      la base).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendMagicLink } from "@/lib/magic-link";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 20;

const GENERIC_OK_RESPONSE = {
  ok: true,
  message: "Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien de connexion dans quelques minutes.",
};

export async function POST(req: NextRequest) {
  // Petit delai aleatoire pour eviter le timing attack
  // (reponse en temps constant que l'email existe ou non)
  const jitter = 200 + Math.floor(Math.random() * 300);
  await new Promise(r => setTimeout(r, jitter));

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  // IP cliente (Vercel ajoute x-forwarded-for ; fallback random pour dev local)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  try {
    // ── 1. Rate limit par email ──
    const now = Date.now();
    const windowStart = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();

    const emailEventsSnap = await adminDb.collection("magic-link-events")
      .where("email", "==", email)
      .where("sentAt", ">=", windowStart)
      .get();

    if (emailEventsSnap.size >= MAX_PER_EMAIL_PER_HOUR) {
      console.warn(`[rate-limit] email ${email} a depasse ${MAX_PER_EMAIL_PER_HOUR} demandes/h`);
      // Reponse generique meme en cas de rate limit : ne pas donner d'info
      // a l'attaquant qui pourrait deduire que l'email existe
      return NextResponse.json(GENERIC_OK_RESPONSE);
    }

    // ── 2. Rate limit par IP (si on a pu l'identifier) ──
    if (ip !== "unknown") {
      const ipEventsSnap = await adminDb.collection("rate-limits")
        .doc(`ip_${ip}`)
        .collection("events")
        .where("at", ">=", windowStart)
        .get();

      if (ipEventsSnap.size >= MAX_PER_IP_PER_HOUR) {
        console.warn(`[rate-limit] IP ${ip} a depasse ${MAX_PER_IP_PER_HOUR} demandes/h`);
        return NextResponse.json(GENERIC_OK_RESPONSE);
      }

      // Trace l'evenement pour le compteur IP
      await adminDb.collection("rate-limits")
        .doc(`ip_${ip}`)
        .collection("events")
        .add({ at: new Date().toISOString(), email });
    }

    // ── 3. Verifier qu'une famille existe avec cet email ──
    // Si non : on retourne quand meme la reponse generique (anti-enumeration)
    // mais on n'envoie rien et on ne cree pas de compte Firebase parasite.
    const famSnap = await adminDb.collection("families")
      .where("parentEmail", "==", email)
      .limit(1)
      .get();

    if (famSnap.empty) {
      console.log(`[request-magic-link] email ${email} sans famille -> reponse generique sans envoi`);
      return NextResponse.json(GENERIC_OK_RESPONSE);
    }

    const fam = famSnap.docs[0];
    const famData = fam.data() as any;

    // ── 4. Envoi du magic link ──
    const result = await sendMagicLink({
      email,
      parentName: famData.parentName,
      context: "self_service_reconnect",
      familyId: fam.id,
      sentBy: "self_service",
    });

    if (result.status === "failed") {
      console.error(`[request-magic-link] echec envoi a ${email}:`, result.error);
      // Reponse generique meme en cas d'echec interne (Resend down, etc.)
      // Sinon l'utilisateur ne sait pas s'il a saisi le bon email
      return NextResponse.json(GENERIC_OK_RESPONSE);
    }

    return NextResponse.json(GENERIC_OK_RESPONSE);
  } catch (e: any) {
    console.error("[request-magic-link] fatal:", e);
    // Meme en cas d'erreur serveur, on ne fuite rien
    return NextResponse.json(GENERIC_OK_RESPONSE);
  }
}
