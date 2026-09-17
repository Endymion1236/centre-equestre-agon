import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { toParisDateString } from "@/lib/date-local";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { etatReponseDevis, JETON_DEVIS_RE, reponseValide } from "@/lib/devis-reponse";
import { emailLayout, emailParagraphe as P, emailTitre } from "@/lib/email-templates";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";

/**
 * Réponse à un devis depuis l'email, sans compte (public, protégé par jeton).
 *
 *   GET  /api/public/devis-reponse?token=…  → le devis, pour l'afficher
 *   POST /api/public/devis-reponse { token, reponse }  → accepté / refusé
 *
 * Un établissement n'a pas d'espace client : la personne qui reçoit le
 * devis sur la boîte d'un centre de loisirs doit pouvoir répondre depuis le
 * message. Le jeton est l'unique preuve ; le serveur ne lit QUE le devis
 * qu'il désigne, et n'accepte du client aucun montant ni identifiant.
 */

async function lireDevis(token: string) {
  const snap = await adminDb.collection("devis").where("token", "==", token).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/** Ce que la page publique a le droit de voir : le devis, rien d'autre. */
function vuePublique(d: any, etat: string) {
  return {
    etat,
    numero: d.numero || "",
    client: d.familyName || "",
    service: d.serviceFacture || "",
    items: (d.items || []).map((i: any) => ({
      label: i.label || "", description: i.description || "",
      qty: Number(i.qty) || 1, priceTTC: Number(i.priceTTC) || 0, remisePct: Number(i.remisePct) || 0,
    })),
    totalTTC: Number(d.totalTTC) || 0,
    note: d.note || "",
    validUntil: d.validUntil || "",
    repondiLe: d.reponduLe || "",
  };
}

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get("token") || "");
  if (!JETON_DEVIS_RE.test(token)) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  try {
    const doc = await lireDevis(token);
    if (!doc) return NextResponse.json({ etat: "introuvable" }, { status: 404 });
    const d = doc.data() as any;
    return NextResponse.json(vuePublique(d, etatReponseDevis(d, toParisDateString())));
  } catch (e) {
    console.error("[devis-reponse] lecture", e);
    return NextResponse.json({ error: "Devis temporairement indisponible" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    const reponse = body?.reponse;
    if (!JETON_DEVIS_RE.test(token) || !reponseValide(reponse)) {
      return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
    }

    // Débit limité par jeton : un lien public ne doit pas servir de levier.
    const rl = await checkRateLimit({ uid: `devis:${token}`, routeKey: "devis_reponse", limit: 10, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    const doc = await lireDevis(token);
    if (!doc) return NextResponse.json({ etat: "introuvable" }, { status: 404 });
    const d = doc.data() as any;
    const etat = etatReponseDevis(d, toParisDateString());
    if (etat !== "ouvert") return NextResponse.json(vuePublique(d, etat), { status: 409 });

    await doc.ref.update({
      status: reponse,
      reponduLe: new Date().toISOString(),
      reponduPar: "lien-email",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await prevenirClub(d, reponse === "accepted");
    return NextResponse.json(vuePublique({ ...d, status: reponse, reponduLe: new Date().toISOString() }, "deja_repondu"));
  } catch (e) {
    console.error("[devis-reponse] enregistrement", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

/** Le club doit l'apprendre : le devis ne passe pas par l'espace famille. */
async function prevenirClub(d: any, accepte: boolean) {
  try {
    const to = process.env.CLUB_NOTIFY_EMAIL || process.env.RESEND_BCC_EMAIL || "ceagon50@gmail.com";
    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(to)) return;
    const subject = `Devis ${d.numero || ""} ${accepte ? "accepté" : "refusé"} — ${d.familyName || ""}`;
    const html = emailLayout([
      emailTitre(`Devis ${accepte ? "accepté" : "refusé"}`),
      P(`<strong>${d.familyName || "Le client"}</strong>${d.serviceFacture ? ` (${d.serviceFacture})` : ""} a ${accepte ? "accepté" : "refusé"} le devis <strong>${d.numero || ""}</strong> depuis le lien reçu par email.`),
      P(`Montant : <strong>${(Number(d.totalTTC) || 0).toFixed(2).replace(".", ",")} €</strong> TTC.`),
      accepte ? P("À convertir en commande depuis Administration → Devis.", 13) : "",
    ].join("\n"), subject);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>", to, subject, html }),
    });
    await logEmail({ to, subject, context: "devis_reponse", status: r.ok ? "sent" : "failed", sentBy: "system", familyId: d.familyId }).catch(() => {});
  } catch (e) {
    console.warn("[devis-reponse] notification club :", e);
  }
}
