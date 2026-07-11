import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/config";
import { PUBLIC_ACTIVITIES } from "@/lib/public-activities";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: Array<{ path: string; priority: number; frequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/accueil", priority: 1, frequency: "weekly" },
    { path: "/activites", priority: 0.95, frequency: "weekly" },
    { path: "/planning", priority: 0.95, frequency: "daily" },
    { path: "/tarifs", priority: 0.85, frequency: "monthly" },
    { path: "/offrir-un-bon", priority: 0.8, frequency: "monthly" },
    { path: "/equipe", priority: 0.75, frequency: "monthly" },
    { path: "/mini-ferme", priority: 0.7, frequency: "monthly" },
    { path: "/galerie", priority: 0.65, frequency: "weekly" },
    { path: "/contact", priority: 0.8, frequency: "monthly" },
    { path: "/mentions-legales", priority: 0.2, frequency: "yearly" },
    { path: "/cgv", priority: 0.2, frequency: "yearly" },
    { path: "/confidentialite", priority: 0.2, frequency: "yearly" },
  ];

  const pages: MetadataRoute.Sitemap = staticPages.map((page) => ({
    url: `${SITE_CONFIG.url}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.frequency,
    priority: page.priority,
  }));

  const activities: MetadataRoute.Sitemap = PUBLIC_ACTIVITIES.map((activity) => ({
    url: `${SITE_CONFIG.url}/activites/${activity.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: activity.featured ? 0.85 : 0.72,
  }));

  return [...pages, ...activities];
}
