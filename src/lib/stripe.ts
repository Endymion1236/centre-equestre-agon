import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  // En prod, Stripe n'est plus utilisé (remplacé par CAWL)
  // On conserve l'instance pour compatibilité des anciens webhooks
  console.warn("STRIPE_SECRET_KEY non défini — Stripe désactivé");
}

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_disabled",
  { apiVersion: "2025-02-24.acacia" }
);

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
