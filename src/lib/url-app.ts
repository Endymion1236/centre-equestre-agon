/**
 * src/lib/url-app.ts — l'adresse publique de l'application, écrite une seule fois.
 *
 * Elle part dans les emails (boutons, images), les notifications, les liens
 * de paiement et de connexion. Octobre 2026 : bascule prévue de
 * centre-equestre-agon.vercel.app vers www.centreequestreagon.com — il suffit
 * de poser NEXT_PUBLIC_APP_URL dans Vercel (puis redéployer), ou de changer
 * le défaut ci-dessous. L'ancienne adresse Vercel continue de répondre : les
 * liens des emails déjà envoyés restent valables.
 */
const DEFAUT = "https://centre-equestre-agon.vercel.app";

export const URL_APP: string = (process.env.NEXT_PUBLIC_APP_URL || DEFAUT).trim().replace(/\/+$/, "");
