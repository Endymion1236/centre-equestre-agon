import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { getClubInfo } from "@/lib/club-info";
import { buildFacturXXml } from "@/lib/facturx";
import { embedFacturX } from "@/lib/facturx-pdf";

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/facturx-pdf?paymentId=…  (admin uniquement)
//
// FACTUR-X COMPLET (fichier hybride) : le PDF de la facture (généré par
// /api/invoice-pdf, serveur) avec le XML EN 16931 embarqué en pièce
// jointe `factur-x.xml` + métadonnées XMP Factur-X/PDF-A.
// Réservé aux factures définitives (invoiceNumber).
// ═══════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const paymentId = (req.nextUrl.searchParams.get("paymentId") || "").trim();
    if (!paymentId) return NextResponse.json({ error: "paymentId requis." }, { status: 400 });

    const snap = await adminDb.collection("payments").doc(paymentId).get();
    if (!snap.exists) return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
    const p = snap.data() as any;
    if (!p.invoiceNumber) {
      return NextResponse.json(
        { error: "Cette commande n'a pas de numéro de facture — le Factur-X est réservé aux factures définitives." },
        { status: 400 }
      );
    }

    // ── Données famille (civilité, adresse, SIREN) ──
    let fam: any = null;
    if (p.familyId) {
      const famSnap = await adminDb.collection("families").doc(p.familyId).get();
      if (famSnap.exists) fam = famSnap.data();
    }
    const civilite = fam?.civilite ? `${fam.civilite} ` : "";
    const adresseLines = [fam?.address, [fam?.zipCode, fam?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
    const buyerAddress = adresseLines ? adresseLines.replace(/\n/g, ", ") : undefined;
    const sirenClean = fam?.siren ? String(fam.siren).replace(/\s/g, "") : "";
    const buyerSiren = /^\d{9}$/.test(sirenClean) ? sirenClean : undefined;

    // ── 1. PDF de la facture via la route serveur existante ──
    const items = p.items || [];
    const totalHT = items.reduce(
      (s: number, i: any) => s + (typeof i.priceHT === "number" ? i.priceHT : Math.round(((i.priceTTC || 0) / 1.055) * 100) / 100),
      0
    );
    const totalTTC = p.totalTTC || 0;
    const invDate = p.invoiceDate?.seconds
      ? new Date(p.invoiceDate.seconds * 1000)
      : p.date?.seconds
      ? new Date(p.date.seconds * 1000)
      : new Date();

    const pdfRes = await fetch(`${req.nextUrl.origin}/api/invoice-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") || "",
      },
      body: JSON.stringify({
        invoiceNumber: p.invoiceNumber,
        date: invDate.toLocaleDateString("fr-FR"),
        familyName: `${civilite}${p.familyName || ""}`.trim(),
        familyEmail: p.familyEmail || fam?.parentEmail || "",
        familyAddress: adresseLines,
        items,
        totalHT: Math.round(totalHT * 100) / 100,
        totalTVA: Math.round((totalTTC - totalHT) * 100) / 100,
        totalTTC,
        paidAmount: p.paidAmount || 0,
        paymentId, // la route reconstruit le détail des encaissements
      }),
    });
    if (!pdfRes.ok) {
      const err = await pdfRes.text().catch(() => "");
      return NextResponse.json({ error: `Génération du PDF impossible (HTTP ${pdfRes.status}) ${err.slice(0, 200)}` }, { status: 502 });
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    // ── 2. XML EN 16931 (mêmes données autoritaires que /api/admin/facturx) ──
    const club = await getClubInfo();
    const xml = buildFacturXXml(
      {
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate || p.date,
        buyer: { name: p.familyName || "Client", email: p.familyEmail || fam?.parentEmail, siren: buyerSiren, address: buyerAddress },
        items: items.map((i: any) => ({
          label: i.activityTitle || i.description || "Prestation",
          priceHT: i.priceHT,
          tva: typeof i.tva === "number" ? i.tva : 5.5,
          priceTTC: i.priceTTC || 0,
        })),
        totalTTC,
        paidAmount: 0,
        dueDate: p.stageDate || null,
      },
      club
    );

    // ── 3. Embarquement → fichier hybride ──
    const hybrid = await embedFacturX(pdfBytes, xml, p.invoiceNumber);
    const filename = `FACTURX_${String(p.invoiceNumber).replace(/[^\w.-]/g, "_")}.pdf`;
    return new NextResponse(Buffer.from(hybrid), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[facturx-pdf]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
