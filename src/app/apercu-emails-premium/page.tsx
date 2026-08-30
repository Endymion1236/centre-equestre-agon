import ApercuEmailsPage from "@/app/admin/apercu-emails/page";

/**
 * Aperçu public et temporaire des emails premium.
 *
 * Cette route vit uniquement sur la branche premium-emails afin de pouvoir
 * valider le rendu sur un déploiement Vercel Preview sans dépendre de
 * Firebase Auth. Les données affichées sont entièrement fictives et aucun
 * email n'est envoyé depuis cette page.
 */
export default function ApercuEmailsPremiumPublicPage() {
  return <ApercuEmailsPage />;
}
