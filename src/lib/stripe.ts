import Stripe from "stripe";

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_4ZhShDbyBvSqtoeqbxhClGda",
  { apiVersion: "2025-02-24.acacia" }
);

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_UxUjDCJ5AFjrZiO9A97LJOYL";
