/**
 * CRON — Balades collectives sous le seuil de rentabilité (J-2).
 *
 * Appelé chaque soir par l'orchestrateur /api/cron/daily-emails.
 * Pour chaque balade ayant lieu dans 2 jours dont le nombre d'inscrits
 * CONFIRMÉS est strictement inférieur au `minParticipants` de son activité :
 *   1. crée un doc de choix par famille dans `balade-petit-groupe`
 *      (id = token non devinable, même mécanisme que satisfaction) ;
 *   2. envoie l'email « maintien avec supplément / report / avoir » ;
 *   3. envoie un récap au club ;
 *   4. marque le créneau (`petitGroupePropose`) — idempotent : un second
 *      passage le même soir ou le lendemain n'envoie rien deux fois.
 *
 * Une balade sans `minParticipants` configuré sur son activité n'est jamais
 * concernée. Voir src/lib/balade-petit-groupe.ts pour la règle métier.
 *
 * Debug manuel : GET ?date=YYYY-MM-DD (cible une date précise)
 *                GET ?dry=1 (calcule sans écrire ni envoyer)
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { addDaysParis } from "@/lib/date-local";
import { emailLayout } from "@/lib/email-templates";
import {
  BALADE_CHOIX_COLLECTION,
  adresseClub,
  compterInscritsConfirmes,
  dansPeriodePetitGroupe,
  emailFamillePetitGroupe,
  formatDateBalade,
} from "@/lib/balade-petit-groupe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const autorise =
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.headers.get("x-cron-secret") === secret;
  if (!secret || !autorise) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const targetDate = req.nextUrl.searchParams.get("date") || addDaysParis(2);

  try {
    // L'option « petit comité » ne s'applique que du 1er septembre au
    // 10 juillet : en plein été, aucune balade n'est examinée.
    if (!dansPeriodePetitGroupe(targetDate)) {
      return NextResponse.json({
        date: targetDate, horsPeriode: true,
        baladesExaminees: 0, baladesSousSeuil: 0, famillesNotifiees: 0,
        sansEmail: 0, bloques: 0, erreurs: [], dry,
      });
    }

    await refreshEmailMode();

    const creneauxSnap = await adminDb
      .collection("creneaux")
      .where("date", "==", targetDate)
      .get();

    // Filtres en mémoire (volume : quelques créneaux par jour) pour éviter
    // tout index composite : type balade, non fermé, pas déjà traité.
    const balades = creneauxSnap.docs.filter((d) => {
      const c = d.data() as any;
      return c.activityType === "balade" && c.status !== "closed" && !c.petitGroupePropose;
    });

    const result = {
      date: targetDate,
      baladesExaminees: balades.length,
      baladesSousSeuil: 0,
      famillesNotifiees: 0,
      sansEmail: 0,
      bloques: 0,
      erreurs: [] as string[],
      dry,
    };

    if (balades.length === 0) return NextResponse.json(result);

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
    const recapClub: string[] = [];

    for (const crDoc of balades) {
      const c = crDoc.data() as any;

      // Config du seuil : lue sur l'ACTIVITÉ (pas sur le créneau, qui est une
      // copie figée) — modifier le catalogue s'applique donc immédiatement.
      if (!c.activityId) continue;
      const actSnap = await adminDb.collection("activities").doc(c.activityId).get();
      if (!actSnap.exists) continue;
      const act = actSnap.data() as any;
      const minParticipants = typeof act.minParticipants === "number" ? act.minParticipants : 0;
      if (minParticipants < 2) continue; // pas de minimum configuré

      const inscritsConfirmes = compterInscritsConfirmes(c);
      if (inscritsConfirmes === 0 || inscritsConfirmes >= minParticipants) continue;

      result.baladesSousSeuil++;
      const supplement = typeof act.supplementPetitGroupe === "number" && act.supplementPetitGroupe > 0
        ? Math.round(act.supplementPetitGroupe * 100) / 100
        : 0;
      const priceTTC = typeof c.priceTTC === "number" && c.priceTTC > 0
        ? c.priceTTC
        : Math.round((c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100) * 100) / 100;

      // Regrouper les inscrits confirmés par famille
      const parFamille = new Map<string, { familyName: string; children: { childId: string; childName: string }[] }>();
      for (const e of (c.enrolled || [])) {
        if (!e || e.pending || !e.familyId) continue;
        if (!parFamille.has(e.familyId)) {
          parFamille.set(e.familyId, { familyName: e.familyName || "", children: [] });
        }
        parFamille.get(e.familyId)!.children.push({ childId: e.childId || "", childName: e.childName || "" });
      }

      const lignesFamilles: string[] = [];

      for (const [familyId, fam] of parFamille) {
        // Email résolu depuis la fiche famille (source d'autorité), avec
        // repli sur `users` comme les autres crons.
        let familyEmail = "";
        let parentName = fam.familyName;
        try {
          const famSnap = await adminDb.collection("families").doc(familyId).get();
          if (famSnap.exists) {
            const f = famSnap.data() as any;
            familyEmail = (f.parentEmail || f.email || "").trim();
            parentName = parentName || f.parentName || "";
          }
          if (!familyEmail) {
            const uSnap = await adminDb.collection("users").doc(familyId).get();
            if (uSnap.exists) {
              const u = uSnap.data() as any;
              familyEmail = (u.email || u.parentEmail || "").trim();
              parentName = parentName || u.parentName || u.displayName || "";
            }
          }
        } catch {}

        const supplementTotal = Math.round(supplement * fam.children.length * 100) / 100;

        if (dry) {
          result.famillesNotifiees++;
          continue;
        }

        // Doc de choix — le token est l'id du doc, non devinable.
        const choixRef = await adminDb.collection(BALADE_CHOIX_COLLECTION).add({
          creneauId: crDoc.id,
          activityId: c.activityId,
          activityTitle: c.activityTitle || act.title || "Balade",
          date: c.date,
          startTime: c.startTime || "",
          endTime: c.endTime || "",
          familyId,
          familyName: parentName,
          familyEmail,
          children: fam.children,
          priceTTCParCavalier: priceTTC,
          minParticipants,
          inscritsAuMomentEnvoi: inscritsConfirmes,
          supplementParCavalier: supplement,
          supplementTotal,
          status: "attente",
          paymentId: null,
          avoirId: null,
          createdAt: new Date().toISOString(),
          choiceAt: null,
        });
        const lien = `${APP_URL}/balade/${choixRef.id}`;

        lignesFamilles.push(
          `${parentName || familyId} — ${fam.children.map((ch) => ch.childName).filter(Boolean).join(", ")}` +
          `${familyEmail ? ` (${familyEmail})` : " (⚠️ pas d'email)"}`
        );

        if (!familyEmail) { result.sansEmail++; continue; }
        if (!isRecipientAllowed(familyEmail)) {
          console.warn(blockedLog(familyEmail, "balade_petit_groupe"));
          result.bloques++;
          continue;
        }
        if (!resendKey) continue;

        const { subject, html } = emailFamillePetitGroupe({
          parentName,
          activityTitle: c.activityTitle || act.title || "Balade",
          date: c.date,
          startTime: c.startTime || "",
          endTime: c.endTime || "",
          childrenNames: fam.children.map((ch) => ch.childName),
          minParticipants,
          inscrits: inscritsConfirmes,
          supplementParCavalier: supplement,
          supplementTotal,
          lien,
        });

        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to: familyEmail, subject, html }),
          });
          await logEmail({
            to: familyEmail, subject,
            context: "cron_balade_petit_groupe", template: "baladePetitGroupe",
            status: r.ok ? "sent" : "failed",
            ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
            sentBy: "system", familyId,
          });
          if (r.ok) result.famillesNotifiees++;
          else result.erreurs.push(`Resend ${r.status} pour ${familyEmail}`);
        } catch (e: any) {
          result.erreurs.push(e?.message || String(e));
          await logEmail({
            to: familyEmail, subject,
            context: "cron_balade_petit_groupe", template: "baladePetitGroupe",
            status: "failed", error: e?.message || String(e),
            sentBy: "system", familyId,
          }).catch(() => {});
        }
      }

      if (!dry) {
        // Marqueur d'idempotence : la balade ne sera plus jamais re-traitée.
        await adminDb.collection("creneaux").doc(crDoc.id).update({
          petitGroupePropose: {
            at: new Date().toISOString(),
            inscritsConfirmes,
            minParticipants,
            supplementParCavalier: supplement,
          },
        });

        recapClub.push(
          `${c.activityTitle} — ${formatDateBalade(c.date)} ${c.startTime}–${c.endTime} : ` +
          `${inscritsConfirmes}/${minParticipants} inscrits.` +
          (lignesFamilles.length ? ` Familles : ${lignesFamilles.join(" · ")}` : "")
        );
      }
    }

    // ── Récap au club : quelles balades sont sous le seuil, qui a été prévenu ──
    if (!dry && recapClub.length > 0 && resendKey) {
      const to = adresseClub();
      if (isRecipientAllowed(to)) {
        const subject = `⚠️ ${recapClub.length} balade${recapClub.length > 1 ? "s" : ""} sous le minimum (${formatDateBalade(targetDate)})`;
        const html = emailLayout(
          `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1e293b;">Balades du ${formatDateBalade(targetDate)} sous le seuil de rentabilité</p>` +
          recapClub.map((l) => `<p style="margin:0 0 8px;font-size:13px;color:#334155;">${l}</p>`).join("") +
          `<p style="margin:12px 0 0;font-size:13px;color:#334155;">Les familles ont reçu l'email de choix (supplément petit comité / report / avoir). Vous serez notifié de chaque réponse.</p>`
        );
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to, subject, html }),
          });
          await logEmail({
            to, subject, context: "cron_balade_petit_groupe", template: "baladePetitGroupeClub",
            status: r.ok ? "sent" : "failed", sentBy: "system",
            ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
          }).catch(() => {});
        } catch (e) {
          console.error("[balades-petit-groupe] récap club:", e);
        }
      } else {
        console.warn(blockedLog(to, "balade_petit_groupe_club"));
      }
    }

    console.log(`[balades-petit-groupe] ${targetDate} : ${result.baladesSousSeuil} balade(s) sous seuil, ${result.famillesNotifiees} famille(s) notifiée(s)`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Cron balades-petit-groupe error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
