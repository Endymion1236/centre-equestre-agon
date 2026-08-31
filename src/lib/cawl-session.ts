/**
 * Création d'une session de paiement CAWL.
 *
 * Ce code vivait dans la route /api/cawl/checkout, qui exige une session
 * authentifiée. Il fallait pouvoir l'appeler aussi depuis un lien reçu par
 * email, où la famille n'est pas connectée — d'où cette extraction. La route
 * de checkout garde ses contrôles propres au panier (verrou d'ouverture des
 * réservations, contrôle serveur des prix) : seule la fabrication de la
 * session est partagée.
 *
 * ── Pourquoi la session ne doit jamais être envoyée par email ────────────
 *
 * Une session CAWL vit deux heures, l'URL de redirection trois. Un lien
 * envoyé le soir était mort le lendemain matin : c'est ce qui est arrivé à
 * une famille le 31/08/2026. L'email porte donc désormais un lien vers nous,
 * qui fabrique une session neuve au moment du clic (cf. /api/payer).
 */

import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type ParametresSession = {
  /** Origine du déploiement, pour construire l'URL de retour. */
  origin: string;
  totalCents: number;
  description: string;
  merchantRef: string;
  familyId?: string | null;
  familyEmail?: string | null;
  familyName?: string | null;
  paymentId?: string | null;
  isDeposit?: boolean;
  depositPercent?: number;
};

export async function creerSessionCawl({
  origin, totalCents, description, merchantRef,
  familyId, familyEmail, familyName, paymentId,
  isDeposit, depositPercent,
}: ParametresSession): Promise<{ url: string; hostedCheckoutId: string; merchantRef: string }> {
  // URL de retour — CAWL ajoute automatiquement HOSTEDCHECKOUTID et RETURNMAC
  const returnUrl = `${origin}/api/cawl/status?ref=${merchantRef}&paymentId=${paymentId || ""}&familyId=${familyId}&deposit=${isDeposit ? depositPercent : "0"}`;

  // Créer la session Hosted Checkout CAWL
  const checkoutRequest: any = {
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
      // Acompte : enregistrer la carte (Card On File) pour pouvoir prélever
      // le solde automatiquement plus tard (doc CAWL, Exemple B).
      ...(isDeposit ? { cardPaymentMethodSpecificInput: { tokenizationMode: "createWithConsent" } } : {}),
    },
    // ── Moyens de paiement par redirection (Chèque-Vacances Connect…) ──
    //
    // Même piège que pour la carte juste en dessous : sans ce paramètre,
    // CAWL applique son défaut (autorisation seule). La transaction resterait
    // « Autorisée » sans jamais être encaissée, et finirait par expirer.
    //
    // La documentation CAWL du Chèque-Vacances Connect l'impose d'ailleurs :
    // requiresApproval doit valoir false pour le paiement mixte
    // (chèques-vacances + complément carte), qui est la situation la plus
    // courante — une famille a rarement le montant exact en chèques.
    //
    // On n'envoie PAS de paymentProductId : la page de paiement continue
    // ainsi de proposer tous les moyens actifs sur le compte, au choix de la
    // famille, au lieu de la forcer vers un seul.
    redirectPaymentMethodSpecificInput: {
      requiresApproval: false,
    },
    cardPaymentMethodSpecificInput: {
      // SALE = autorisation + CAPTURE immédiate. Sans ce paramètre, CAWL
      // applique son défaut (autorisation seule) : les fonds sont bloqués
      // sur la carte mais JAMAIS encaissés, et l'autorisation finit par
      // expirer. C'est ce qui laissait toutes les transactions du checkout
      // en statut « Autorisé » alors que le prélèvement MIT — qui, lui,
      // envoie déjà SALE (cf. tokenize/finalize) — passait bien en
      // « Paiement demandé ».
      authorizationMode: "SALE",
      // Acompte : transaction initiale "carte en réserve" initiée par le
      // client (consentement). Indispensable pour réutiliser le token en
      // MIT (solde).
      ...(isDeposit ? {
        unscheduledCardOnFileRequestor: "cardholderInitiated",
        unscheduledCardOnFileSequenceIndicator: "first",
      } : {}),
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
  const returnMac = response.body.RETURNMAC || "";

  if (!returnMac) {
    console.warn("CAWL: RETURNMAC absent de la réponse createHostedCheckout");
  }

  // L'URL CAWL preprod correcte selon la doc
  const baseUrl = process.env.CAWL_ENV === "production"
    ? "https://payment.ca.cawl-solutions.fr"
    : "https://payment.preprod.ca.cawl-solutions.fr";

  // Construire l'URL de redirection
  const redirectUrl = response.body.redirectUrl
    || (partialRedirectUrl ? `${baseUrl}/${partialRedirectUrl}` : null);

  if (!redirectUrl) {
    console.error("CAWL: pas d'URL de redirection dans la réponse:", response.body);
    throw new Error("CAWL n'a pas retourné d'URL de paiement");
  }

  // ── Stocker RETURNMAC + metadata pour vérification au retour ─────────
  // On stocke dans cawl_sessions (indépendant de payments, car certains
  // flows comme l'inscription annuelle ne créent pas de payment préalable)
  if (hostedCheckoutId) {
    try {
      await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).set({
        hostedCheckoutId,
        returnMac,
        merchantRef,
        familyId: familyId || null,
        paymentId: paymentId || null,
        totalCents,
        // Marqueur acompte : permet au webhook (qui n'a pas accès aux query
        // params de l'URL de retour) de distinguer acompte / paiement total.
        isDeposit: !!isDeposit,
        depositPercent: isDeposit ? depositPercent : 0,
        createdAt: FieldValue.serverTimestamp(),
        // TTL : RETURNMAC a une durée de vie raisonnablement courte
        // (session CAWL = 2h, redirectUrl = 3h)
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });
    } catch (e) {
      console.error("CAWL: impossible de stocker cawl_sessions:", e);
    }
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

  return { url: redirectUrl, hostedCheckoutId, merchantRef };

}
