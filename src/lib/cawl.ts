// ═══ CAWL (Crédit Agricole / Worldline) — SDK Configuration ═══
// Documentation: https://docs.ecommerce.ca.cawl-solutions.fr

const onlinePaymentsSdk = require("onlinepayments-sdk-nodejs");

const isProduction = process.env.CAWL_ENV === "production";

// Accepte les deux noms de variable pour compatibilité
const apiKeyId = process.env.CAWL_API_KEY_ID || process.env.CAWL_API_KEY || "";
const secretApiKey = process.env.CAWL_SECRET_API_KEY || process.env.CAWL_API_SECRET || "";

export const cawlSdk = onlinePaymentsSdk.init({
  integrator: "Centre Equestre Agon-Coutainville",
  host: isProduction
    ? "payment.ca.cawl-solutions.fr"
    : "payment.preprod.ca.cawl-solutions.fr",
  scheme: "https",
  port: 443,
  apiKeyId,
  secretApiKey,
  enableLogging: !isProduction,
});

export const CAWL_PSPID = process.env.CAWL_PSPID || "";
export const CAWL_WEBHOOK_KEY_ID = process.env.CAWL_WEBHOOK_KEY_ID || "";
export const CAWL_WEBHOOK_SECRET = process.env.CAWL_WEBHOOK_SECRET || "";
