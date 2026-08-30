import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { refreshEmailMode, isRecipientAllowed } from "@/lib/email-guard";
import { encadreConditionsPourType } from "@/lib/cgv-clauses";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailSignature, emailCouleurs as CE,
} from "@/lib/email-templates";

/**
 * POST /api/waitlist/propose  { creneauId }
 *
 * Propose automatiquement la place liberee a la PREMIERE famille de la
 * liste d'attente : email avec lien direct vers le creneau (la modale se
 * rouvre via ?creneau=), priorite annoncee de 24h.
 *
 * Choix assume (decision gerant) : proposition SOUPLE — la place n'est pas
 * verrouillee techniquement pendant les 24h, une autre famille passant par
 * le planning peut la prendre. Verrouiller exigerait de bloquer la vente
 * d'une place peut-etre refusee ; on prefere qu'une place parte vite.
 * L'entree est marquee proposedAt pour ne jamais re-proposer a la meme
 * famille ; la relance du suivant apres 24h passera par le cron quotidien.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { creneauId } = await req.json().catch(() => ({}));
  if (!creneauId) return NextResponse.json({ error: "creneauId requis" }, { status: 400 });

  const cSnap = await adminDb.collection("creneaux").doc(String(creneauId)).get();
  if (!cSnap.exists) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });
  const c = cSnap.data() as any;
  const places = (c.maxPlaces || 0) - (c.enrolled || []).length;
  if (places <= 0) return NextResponse.json({ ok: false, raison: "complet" });

  // Premiere famille en attente non encore contactee, ordre d'arrivee.
  const wSnap = await adminDb.collection("waitlist")
    .where("creneauId", "==", String(creneauId)).get();
  const attente = wSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    // Convention partagee avec le planning (handleUnenroll) : seules les
    // entrees "waiting" sont eligibles — "notified" a deja sa priorite en
    // cours, "expired" a laisse passer sa chance. Les attentes de stage
    // multi-jours sont laissees au circuit du planning, qui sait verifier
    // que la semaine ENTIERE est libre avant de prevenir.
    .filter((w) => (w.status || "waiting") === "waiting"
      && !(w.isStage && Array.isArray(w.creneauIds) && w.creneauIds.length > 1))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  if (attente.length === 0) return NextResponse.json({ ok: false, raison: "personne en attente" });

  const w = attente[0];
  const email = String(w.familyEmail || "").trim();

  await refreshEmailMode();
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

  let envoye = false;
  if (email && resendKey && isRecipientAllowed(email)) {
    const lien = `${appUrl}/espace-cavalier/reserver?creneau=${encodeURIComponent(String(creneauId))}`;
    const subject = `Une place s'est libérée — ${c.activityTitle || "activité"}`;
    const html = emailLayout([
        emailTitre("Une place s'est libérée"),
        P(`Bonjour <strong>${w.familyName || ""}</strong>,`),
        P(`Bonne nouvelle : une place vient de se libérer pour <strong>${c.activityTitle || ""}</strong>${c.date ? ` le <strong>${c.date}</strong>` : ""}${c.startTime ? ` (${c.startTime}–${c.endTime || ""})` : ""}, pour laquelle <strong>${w.childName || "votre cavalier"}</strong> est en liste d'attente.`),
        P("Elle vous est proposée en priorité pendant <strong>24&nbsp;heures</strong> — passé ce délai, elle sera proposée à la famille suivante.", 14),
        emailButton("Réserver la place", lien),
        P("Un souci pour réserver en ligne, ou une question ? Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message — nous prendrons l'inscription avec vous.", 13),
        encadreConditionsPourType(String(c.activityType || "")),
        P(`<span style="color:${CE.discret};">Vous n'êtes plus intéressé ? Ignorez simplement ce message.</span>`, 12),
        emailSignature(),
      ].join("\n"), `Place disponible — ${c.activityTitle || ""}${c.date ? ` le ${c.date}` : ""}`);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
    });
    envoye = r.ok;
    await logEmail({ to: email, subject, context: "waitlist_proposition", template: "waitlistPropose", status: r.ok ? "sent" : "failed", sentBy: "system" }).catch(() => {});
  }

  // Marque la proposition meme si l'email est bloque (mode restreint) : on
  // ne re-proposera pas a la meme famille, l'admin voit le statut.
  // Memes champs que le circuit planning + hold 24h sur le creneau : la
  // place est reservee a cette famille, les autres ne la voient plus.
  const holdUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await adminDb.collection("waitlist").doc(w.id).update({
    status: "notified", notifiedAt: new Date().toISOString(), holdUntil,
    proposedEmailSent: envoye,
  });
  await adminDb.collection("creneaux").doc(String(creneauId)).update({
    waitlistHold: {
      familyId: w.familyId, childId: w.childId, childName: w.childName,
      until: holdUntil, waitlistEntryId: w.id,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, famille: w.familyName, email, envoye });
}
