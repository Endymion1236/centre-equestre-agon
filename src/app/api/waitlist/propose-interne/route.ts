// Variante cron de /api/waitlist/propose (chaine des 24h).
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { logEmail } from "@/lib/email-log";
import { refreshEmailMode, isRecipientAllowed } from "@/lib/email-guard";

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
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    .filter((w) => !w.proposedAt)
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
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
        <div style="background:#1e3a5f;color:#fff;padding:16px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold;">Centre Équestre d'Agon-Coutainville</div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px;">
          <p style="font-size:15px;color:#1e293b;">Bonjour <strong>${w.familyName || ""}</strong>,</p>
          <p style="font-size:15px;color:#334155;line-height:1.6;">Bonne nouvelle : une place vient de se libérer pour
            <strong>${c.activityTitle || ""}</strong>${c.date ? ` le <strong>${c.date}</strong>` : ""}${c.startTime ? ` (${c.startTime}–${c.endTime || ""})` : ""},
            pour laquelle <strong>${w.childName || "votre cavalier"}</strong> est en liste d'attente.</p>
          <p style="font-size:14px;color:#334155;line-height:1.6;">Elle vous est proposée en priorité pendant <strong>24&nbsp;heures</strong> — passé ce délai, elle sera proposée à la famille suivante.</p>
          <p style="text-align:center;margin:22px 0;"><a href="${lien}" style="background:#16a34a;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:bold;">Réserver la place</a></p>
          <p style="font-size:12px;color:#64748b;">Vous n'êtes plus intéressé ? Ignorez simplement ce message.</p>
        </div>
      </div>`;
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
  await adminDb.collection("waitlist").doc(w.id).update({
    proposedAt: new Date(), proposedEmailSent: envoye,
  });

  return NextResponse.json({ ok: true, famille: w.familyName, email, envoye });
}
