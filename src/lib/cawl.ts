// ═══ CAWL (Crédit Agricole / Worldline) — SDK Configuration ═══
// Documentation: https://docs.ecommerce.ca.cawl-solutions.fr

const onlinePaymentsSdk = require("onlinepayments-sdk-nodejs");

// Environnement test : payment.preprod.ca.cawl-solutions.fr
// Environnement prod  : payment.ca.cawl-solutions.fr
const isProduction = process.env.CAWL_ENV === "production";

export const cawlSdk = onlinePaymentsSdk.init({
  integrator: "Centre Equestre Agon-Coutainville",
  host: isProduction
    ? "payment.ca.cawl-solutions.fr"
    : "payment.preprod.ca.cawl-solutions.fr",
  scheme: "https",
  port: 443,
  apiKeyId: process.env.CAWL_API_KEY_ID || "",
  secretApiKey: process.env.CAWL_API_SECRET || "",
  enableLogging: !isProduction,
});

export const CAWL_PSPID = process.env.CAWL_PSPID || "";

// Webhook verification
export const CAWL_WEBHOOK_KEY_ID = process.env.CAWL_WEBHOOK_KEY_ID || "";
export const CAWL_WEBHOOK_SECRET = process.env.CAWL_WEBHOOK_SECRET || "";
