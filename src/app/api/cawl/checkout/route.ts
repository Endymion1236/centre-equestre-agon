import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      items, familyId, familyEmail, familyName,
      depositPercent, paymentId, stageDate,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "CAWL non configuré (CAWL_PSPID manquant)" }, { status: 500 });
    }

    // Calcul du montant total en centimes
    const isDeposit = depositPercent && depositPercent > 0 && depositPercent < 100;
    const multiplier = isDeposit ? depositPercent / 100 : 1;
    const totalCents = items.reduce((sum: number, item: any) => {
      return sum + Math.round((item.priceInCents || 0) * multiplier) * (item.quantity || 1);
    }, 0);

    if (totalCents <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    // Description pour la page de paiement
    const description = items.map((item: any) => {
      const name = isDeposit ? `Acompte ${depositPercent}% — ${item.name}` : item.name;
      return name;
    }).join(", ");

    // Référence unique marchand
    const merchantRef = `CE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const origin = req.nextUrl.origin;
    const successUrl = isDeposit
      ? `${origin}/espace-cavalier/reservations?success=true&deposit=true`
      : `${origin}/espace-cavalier/reservations?success=true`;
    const cancelUrl = `${origin}/espace-cavalier/reserver?cancelled=true`;

    // Créer la session Hosted Checkout CAWL
    const checkoutRequest = {
      order: {
        amountOfMoney: {
          amount: totalCents,
          currencyCode: "EUR",
        },
        customer: {
          merchantCustomerId: familyId,
          contactDetails: {
            emailAddress: familyEmail,
          },
          personalInformation: {
            name: {
              firstName: familyName?.split(" ")[0] || "",
              surname: familyName?.split(" ").slice(1).join(" ") || familyName || "",
            },
          },
        },
        references: {
          merchantReference: merchantRef,
          descriptor: description.substring(0, 256),
        },
      },
      hostedCheckoutSpecificInput: {
        returnUrl: `${origin}/api/cawl/status?ref=${merchantRef}&paymentId=${paymentId || ""}&familyId=${familyId}`,
        locale: "fr_FR",
        showResultPage: false,
      },
    };

    const response = await cawlSdk.hostedCheckout.createHostedCheckout(
      CAWL_PSPID,
      checkoutRequest,
      {}
    );

    // Construire l'URL de redirection
    const redirectUrl = response.body.redirectUrl
      || `https://payment.preprod.ca.cawl-solutions.fr/hostedcheckout/${response.body.partialRedirectUrl}`;

    return NextResponse.json({
      url: redirectUrl,
      hostedCheckoutId: response.body.hostedCheckoutId,
      merchantRef,
    });
  } catch (error: any) {
    console.error("CAWL checkout error:", error);
    return NextResponse.json({ error: error.message || "Erreur CAWL" }, { status: 500 });
  }
}
