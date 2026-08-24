import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/declarer-paiement
 *   { mode: "cheque" | "especes" | "virement",
 *     items: [{ childId, childName, activityTitle, isStage, creneauIds[], prixFinal, sourceFamilyId? }] }
 *
 * Le « je paierai au bureau » du panier famille, en UN SEUL appel serveur.
 *
 * Incident d'origine : le navigateur enchaînait inscription → réservations →
 * commande → déclaration → email. Un rafraîchissement au milieu (bouton qui
 * mouline, serveur froid) laissait un état à moitié fait : enfant inscrit
 * « place tenue », impayé créé, mais NI déclaration NI email — l'admin
 * découvrait un impayé orphelin sans comprendre d'où il venait.
 *
 * Ici : les inscriptions passent toujours par /api/enroll (qui porte les
 * garde-fous capacité/doublons — le jeton du demandeur est retransmis), puis
 * réservations + commande + déclaration s'écrivent en UNE SEULE transaction
 * (batch) : tout ou rien. Une fois la requête reçue, elle se termine même si
 * la famille ferme l'onglet.
 *
 * Confiance sur les prix : identiques à l'ancien flux (calculés côté client,
 * comme la commande qu'il créait déjà lui-même) — la déclaration n'encaisse
 * RIEN, l'admin vérifie le montant à réception du règlement.
 */

const MODES = ["cheque", "especes", "virement"];

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "");
    const brut = Array.isArray(body.items) ? body.items : [];
    if (!MODES.includes(mode) || brut.length === 0 || brut.length > 20) {
      return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
    }
    interface ItemPanier { childId: string; childName: string; activityTitle: string; isStage: boolean; creneauIds: string[]; prixFinal: number; sourceFamilyId: string }
    const items: ItemPanier[] = brut.map((i: any) => ({
      childId: String(i?.childId || ""),
      childName: String(i?.childName || "").slice(0, 80),
      activityTitle: String(i?.activityTitle || "").slice(0, 120),
      isStage: !!i?.isStage,
      creneauIds: (Array.isArray(i?.creneauIds) ? i.creneauIds : []).map(String).filter(Boolean).slice(0, 7),
      prixFinal: Math.round(Number(i?.prixFinal) * 100) / 100,
      sourceFamilyId: i?.sourceFamilyId ? String(i.sourceFamilyId) : "",
    }));
    if (items.some((i) => !i.childId || !i.activityTitle || i.creneauIds.length === 0 || !Number.isFinite(i.prixFinal) || i.prixFinal < 0)) {
      return NextResponse.json({ error: "Panier invalide" }, { status: 400 });
    }

    const famSnap = await adminDb.collection("families").doc(auth.uid).get();
    if (!famSnap.exists) return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    const fam = famSnap.data() as any;

    // 1. Inscriptions (places tenues, hold différé) — via /api/enroll pour
    // garder ses garde-fous, avec le jeton du demandeur. Si un créneau est
    // refusé (complet), on s'arrête AVANT toute écriture de commande.
    const origin = req.nextUrl.origin;
    const authHeader = req.headers.get("authorization") || "";
    for (const it of items) {
      const r = await fetch(`${origin}/api/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          enrollments: [{
            childId: it.childId, childName: it.childName, creneauIds: it.creneauIds,
            pending: true, paymentMethod: mode,
            ...(it.sourceFamilyId ? { sourceFamilyId: it.sourceFamilyId } : {}),
          }],
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as any));
        return NextResponse.json({ error: e?.error || "Inscription refusée (créneau complet ?)" }, { status: 409 });
      }
    }

    // Détails du premier créneau de chaque item, pour la réservation.
    const premiers = await Promise.all(items.map((it) => adminDb.collection("creneaux").doc(it.creneauIds[0]).get()));

    // 2-4. Réservations + commande + déclaration : un seul commit — tout ou rien.
    const batch = adminDb.batch();
    const reservationIds: string[] = [];
    const pendingEnrollments: { childId: string; creneauId: string }[] = [];
    const aujourdhui = new Date().toISOString().slice(0, 10);

    items.forEach((it, idx) => {
      const cr = premiers[idx].exists ? (premiers[idx].data() as any) : null;
      const resRef = adminDb.collection("reservations").doc();
      reservationIds.push(resRef.id);
      it.creneauIds.forEach((cid) => pendingEnrollments.push({ childId: it.childId, creneauId: cid }));
      batch.set(resRef, {
        familyId: auth.uid, familyName: fam.parentName || "",
        ...(it.sourceFamilyId ? { sourceFamilyId: it.sourceFamilyId } : {}),
        childId: it.childId, childName: it.childName,
        activityTitle: it.activityTitle, activityType: it.isStage ? "stage" : "cours",
        creneauId: it.creneauIds[0],
        date: cr?.date || aujourdhui,
        startTime: cr?.startTime || "", endTime: cr?.endTime || "",
        priceTTC: it.prixFinal, status: "pending_payment", source: "client",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const totalTTC = Math.round(items.reduce((s, i) => s + i.prixFinal, 0) * 100) / 100;
    const payRef = adminDb.collection("payments").doc();
    batch.set(payRef, {
      familyId: auth.uid, familyName: fam.parentName || "",
      items: items.map((i) => ({
        activityTitle: `${i.activityTitle} — ${i.childName}`,
        childId: i.childId, childName: i.childName,
        creneauId: i.creneauIds[0],
        // TOUS les jours : nécessaires à la levée des places tenues.
        creneauIds: i.creneauIds,
        priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
      })),
      totalTTC,
      paymentMode: mode, paymentRef: "",
      status: "pending", paidAmount: 0,
      source: "client", date: FieldValue.serverTimestamp(),
    });

    const declRef = adminDb.collection("payment_declarations").doc();
    batch.set(declRef, {
      paymentId: payRef.id,
      familyId: auth.uid, familyName: fam.parentName || "",
      familyEmail: fam.parentEmail || auth.email || "",
      montant: totalTTC,
      mode,
      note: "",
      activityTitle: items.map((i) => i.activityTitle).join(", "),
      status: "pending_confirmation",
      pendingEnrollments,
      reservationIds,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // 5. Prévenir le club (non bloquant — la déclaration est déjà en base et
    // visible dans l'onglet Déclarations même si cet email échoue).
    fetch(`${origin}/api/notify-club`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        context: "reservation_paiement",
        titre: `Paiement ${mode} à confirmer — ${fam.parentName || ""}`,
        lignes: [
          `${fam.parentName || "Une famille"} déclare un paiement de ${totalTTC.toFixed(2)}€ par ${mode}.`,
          `Activités : ${items.map((i) => i.activityTitle).join(", ")}`,
        ],
        familyId: auth.uid,
      }),
    }).catch((e) => console.warn("[declarer-paiement] notify-club:", e));

    return NextResponse.json({ ok: true, paymentId: payRef.id });
  } catch (e) {
    console.error("[declarer-paiement]", e);
    return NextResponse.json({ error: "Erreur d'enregistrement — réessayez" }, { status: 500 });
  }
}
