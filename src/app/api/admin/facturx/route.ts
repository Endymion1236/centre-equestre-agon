import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { getClubInfo } from "@/lib/club-info";
import { buildFacturXXml } from "@/lib/facturx";

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/facturx?paymentId=…  (admin uniquement)
//
// Télécharge le XML Factur-X (profil EN 16931, syntaxe CII) d'une
// FACTURE DÉFINITIVE (doc payments avec invoiceNumber). Une commande
// sans numéro de facture est refusée : le format est réservé aux
// pièces définitives numérotées.
// ═══════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const paymentId = (req.nextUrl.searchParams.get("paymentId") || "").trim();
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId requis." }, { status: 400 });
    }
    const snap = await adminDb.collection("payments").doc(paymentId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
    }
    const p = snap.data() as any;
    if (!p.invoiceNumber) {
      return NextResponse.json(
        { error: "Cette commande n'a pas de numéro de facture — le Factur-X est réservé aux factures définitives." },
        { status: 400 }
      );
    }

    // Adresse + SIREN du client (renseignés sur la fiche famille, surtout
    // pertinents pour les clients pros/collectivités).
    let buyerAddress: string | undefined;
    let buyerSiren: string | undefined;
    if (p.familyId) {
      try {
        const famSnap = await adminDb.collection("families").doc(p.familyId).get();
        if (famSnap.exists) {
          const f = famSnap.data() as any;
          const parts = [f.address, [f.zipCode, f.city].filter(Boolean).join(" ")].filter(Boolean);
          if (parts.length > 0) buyerAddress = parts.join(", ");
          if (f.siren && /^\d{9}$/.test(String(f.siren).replace(/\s/g, ""))) {
            buyerSiren = String(f.siren).replace(/\s/g, "");
          }
        }
      } catch {
        /* adresse facultative */
      }
    }

    const club = await getClubInfo();
    const xml = buildFacturXXml(
      {
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate || p.date,
        buyer: { name: p.familyName || "Client", email: p.familyEmail, siren: buyerSiren, address: buyerAddress },
        items: (p.items || []).map((i: any) => ({
          label: i.activityTitle || i.description || "Prestation",
          priceHT: i.priceHT,
          tva: typeof i.tva === "number" ? i.tva : 5.5,
          priceTTC: i.priceTTC || 0,
        })),
        totalTTC: p.totalTTC || 0,
        paidAmount: 0, // facture pleine : les règlements figurent au dossier, la facture porte le dû total
        dueDate: p.stageDate || null,
      },
      club
    );

    const filename = `FACTUR-X_${String(p.invoiceNumber).replace(/[^\w.-]/g, "_")}.xml`;
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[facturx]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
