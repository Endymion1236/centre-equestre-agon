import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Espaces privés et pages techniques : rien à faire dans les
        // résultats de recherche. Ce n'est pas une protection — les règles
        // Firestore s'en chargent — mais de l'hygiène : personne ne veut
        // voir « Espace Collaborateur — Connexion » remonter sur Google.
        disallow: [
          "/admin/",
          "/api/",
          "/espace-cavalier/",
          "/espace-moniteur/",
          "/connexion-magique",
          "/montoir/",
          "/borne",
          "/desabonnement",
        ],
      },
    ],
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
    host: SITE_CONFIG.url,
  };
}
