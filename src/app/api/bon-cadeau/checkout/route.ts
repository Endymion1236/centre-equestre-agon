import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Achat PUBLIC d'un bon cadeau (sans compte) : crée une session de paiement
// carte CAWL et stocke les détails de l'achat pour le traitement au retour.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const montant = parseFloat(String(body.montant).replace(",", "."));
    const beneficiaire = String(body.beneficiaire || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 300);
    const acheteurNom = String(body.acheteurNom || "").trim().slice(0, 80);
    const acheteurEmail = String(body.acheteurEmail || "").trim().slice(0, 120);

    if (!montant || montant < 10 || montant > 500) {
      return NextResponse.json({ error: "Le montant doit être compris entre 10 € et 500 €." }, { status: 400 });
    }
    if (!acheteurEmail.includes("@")) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }
    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "Paiement en ligne non configuré." }, { status: 500 });
    }

    const totalCents = Math.round(montant * 100);
    const merchantRef = `BON-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const origin = req.nextUrl.origin;
    // CAWL ajoute HOSTEDCHECKOUTID + RETURNMAC à cette URL au retour.
    const returnUrl = `${origin}/api/bon-cadeau/status?ref=${merchantRef}`;

    const checkoutRequest: any = {
      order: {
        amountOfMoney: { amount: totalCents, currencyCode: "EUR" },
        customer: {
          contactDetails: { emailAddress: acheteurEmail },
          personalInformation: {
            name: {
              firstName: acheteurNom.split(" ")[0] || "",
              surname: acheteurNom.split(" ").slice(1).join(" ") || acheteurNom || "Client",
            },
          },
        },
        references: { merchantReference: merchantRef, descriptor: "Bon cadeau CE Agon" },
      },
      hostedCheckoutSpecificInput: { returnUrl, locale: "fr_FR", showResultPage: false },
    };

    const response = await cawlSdk.hostedCheckout.createHostedCheckout(CAWL_PSPID, checkoutRequest, {});
    const hostedCheckoutId = response.body.hostedCheckoutId || "";
    const partialRedirectUrl = response.body.partialRedirectUrl || "";
    const returnMac = response.body.RETURNMAC || "";

    const baseUrl = process.env.CAWL_ENV === "production"
      ? "https://payment.ca.cawl-solutions.fr"
      : "https://payment.preprod.ca.cawl-solutions.fr";
    const redirectUrl = response.body.redirectUrl
      || (partialRedirectUrl ? `${baseUrl}/${partialRedirectUrl}` : null);

    if (!redirectUrl) {
      console.error("bon-cadeau checkout: pas d'URL de paiement:", response.body);
      return NextResponse.json({ error: "Paiement indisponible pour le moment." }, { status: 500 });
    }

    if (hostedCheckoutId) {
      await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).set({
        hostedCheckoutId, returnMac, merchantRef,
        bonCadeau: true,
        montant, beneficiaire, message, acheteurNom, acheteurEmail,
        totalCents,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ redirectUrl });
  } catch (e: any) {
    console.error("bon-cadeau checkout:", e);
    return NextResponse.json({ error: "Erreur lors de l'initialisation du paiement." }, { status: 500 });
  }
}
