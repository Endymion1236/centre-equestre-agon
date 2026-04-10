import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      items, familyId, familyEmail, familyName,
      depositPercent, paymentId, stageDate, totalTTC, adminInitiated,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "CAWL non configuré (CAWL_PSPID manquant)" }, { status: 500 });
    }

    // Calcul du montant total en centimes
    // Accepte : priceInCents (panier client), priceTTC (admin), ou totalTTC global
    const isDeposit = depositPercent && depositPercent > 0 && depositPercent < 100;
    const multiplier = isDeposit ? depositPercent / 100 : 1;

    let totalCents: number;
    if (totalTTC && totalTTC > 0) {
      // Montant fourni directement (depuis admin — lien impayé)
      totalCents = Math.round(totalTTC * 100 * multiplier);
    } else {
      // Calculer depuis les items — accepte priceInCents ou priceTTC
      totalCents = items.reduce((sum: number, item: any) => {
        const cents = item.priceInCents
          ? Math.round(item.priceInCents * multiplier)
          : item.priceTTC
            ? Math.round(item.priceTTC * 100 * multiplier)
            : item.priceHT
              ? Math.round(item.priceHT * 100 * 1.2 * multiplier)
              : 0;
        return sum + cents * (item.quantity || 1);
      }, 0);
    }

    if (totalCents <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    // Description pour la page de paiement
    const description = items.map((item: any) => {
      return isDeposit ? `Acompte ${depositPercent}% — ${item.name}` : item.name;
    }).join(", ");

    // Référence unique marchand
    const merchantRef = `CE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const origin = req.nextUrl.origin;

    // URL de retour — CAWL ajoute automatiquement HOSTEDCHECKOUTID et RETURNMAC
    const returnUrl = `${origin}/api/cawl/status?ref=${merchantRef}&paymentId=${paymentId || ""}&familyId=${familyId}&deposit=${isDeposit ? depositPercent : "0"}`;

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
        returnUrl,
        locale: "fr_FR",
        showResultPage: false,
        // Pas de filtre produit en test — laisser CAWL proposer tous les moyens disponibles
      },
    };

    const response = await cawlSdk.hostedCheckout.createHostedCheckout(
      CAWL_PSPID,
      checkoutRequest,
      {}
    );

    // Log complet de la réponse pour débugger
    console.log("CAWL response.body:", JSON.stringify(response.body, null, 2));
    console.log("CAWL response.status:", response.status);

    const hostedCheckoutId = response.body.hostedCheckoutId || "";
    const partialRedirectUrl = response.body.partialRedirectUrl || "";

    // L'URL CAWL preprod correcte selon la doc
    const baseUrl = process.env.CAWL_ENV === "production"
      ? "https://payment.ca.cawl-solutions.fr"
      : "https://payment.preprod.ca.cawl-solutions.fr";

    // Construire l'URL de redirection
    const redirectUrl = response.body.redirectUrl
      || (partialRedirectUrl ? `${baseUrl}/${partialRedirectUrl}` : null);

    if (!redirectUrl) {
      console.error("CAWL: pas d'URL de redirection dans la réponse:", response.body);
      return NextResponse.json({ error: "CAWL n'a pas retourné d'URL de paiement" }, { status: 500 });
    }

    // ── Sauvegarder la référence CAWL dans le payment Firestore ──────────
    if (paymentId) {
      try {
        await adminDb.collection("payments").doc(paymentId).update({
          cawlRef: merchantRef,
          cawlHostedCheckoutId: hostedCheckoutId,
          cawlInitiatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error("CAWL: impossible de sauvegarder cawlRef dans payments:", e);
      }
    }

    console.log(`CAWL checkout créé: ${merchantRef} — ${totalCents / 100}€ — paymentId=${paymentId}`);

    return NextResponse.json({
      url: redirectUrl,
      hostedCheckoutId,
      merchantRef,
    });
  } catch (error: any) {
    console.error("CAWL checkout error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
