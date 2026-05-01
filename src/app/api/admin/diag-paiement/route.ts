/**
 * GET /api/admin/diag-paiement?q=gourmelon
 *
 * Cherche dans payments et encaissements toutes les entrées qui matchent
 * un nom de famille ou prénom donné. Read-only.
 *
 * Réservé aux admins (Firebase Auth claim admin=true). Si le claim n'est
 * pas posé, l'endpoint utilise un fallback sur la liste hardcodée des emails
 * admin pour ne pas bloquer le diagnostic.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth : on accepte soit le claim admin, soit un email admin connu
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let isAdmin = false;
  let callerEmail = "?";
  if (token) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      callerEmail = decoded.email || "?";
      isAdmin = decoded.admin === true || ADMIN_EMAILS.includes(decoded.email || "");
    } catch (e) {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "Réservé admin", caller: callerEmail }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase().trim();
  if (!q) {
    return NextResponse.json({ error: "Param q manquant (ex: ?q=gourmelon)" }, { status: 400 });
  }

  // 1. Paiements : fields familyName, items[].childName, items[].activityTitle
  const paymentsSnap = await adminDb.collection("payments").get();
  const matchingPayments: any[] = [];
  for (const doc of paymentsSnap.docs) {
    const p = doc.data() as any;
    const familyName = String(p.familyName || "").toLowerCase();
    const items: any[] = p.items || [];
    const matchesFamily = familyName.includes(q);
    const matchingItems = items.filter(it =>
      String(it.childName || "").toLowerCase().includes(q) ||
      String(it.activityTitle || "").toLowerCase().includes(q)
    );
    if (matchesFamily || matchingItems.length > 0) {
      const date = p.date?.seconds ? new Date(p.date.seconds * 1000).toISOString().slice(0, 10) : null;
      matchingPayments.push({
        id: doc.id,
        date,
        familyName: p.familyName,
        status: p.status,
        paymentMode: p.paymentMode,
        totalTTC: p.totalTTC,
        paidAmount: p.paidAmount,
        nbItems: items.length,
        items: items.map((it: any) => ({
          childName: it.childName,
          activityTitle: it.activityTitle,
          priceTTC: it.priceTTC,
          creneauId: it.creneauId || null,
          stageKey: it.stageKey || null,
        })),
      });
    }
  }

  // 2. Encaissements : fields familyName, activityTitle (selon schema)
  const encsSnap = await adminDb.collection("encaissements").get();
  const matchingEncs: any[] = [];
  for (const doc of encsSnap.docs) {
    const e = doc.data() as any;
    const familyName = String(e.familyName || "").toLowerCase();
    const activityTitle = String(e.activityTitle || "").toLowerCase();
    if (familyName.includes(q) || activityTitle.includes(q)) {
      const date = e.date?.seconds ? new Date(e.date.seconds * 1000).toISOString().slice(0, 10) : (typeof e.date === "string" ? e.date : null);
      matchingEncs.push({
        id: doc.id,
        date,
        familyName: e.familyName,
        activityTitle: e.activityTitle,
        montant: e.montant,
        mode: e.mode,
        reconciledByBank: !!e.reconciledByBank,
        paymentId: e.paymentId || null,
        remiseId: e.remiseId || null,
      });
    }
  }

  return NextResponse.json({
    success: true,
    query: q,
    payments: {
      count: matchingPayments.length,
      totalTTC: matchingPayments.reduce((s, p) => s + (p.totalTTC || 0), 0),
      list: matchingPayments,
    },
    encaissements: {
      count: matchingEncs.length,
      totalEur: matchingEncs.reduce((s, e) => s + (e.montant || 0), 0),
      list: matchingEncs,
    },
  });
}
