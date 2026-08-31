/**
 * Reconnaissance des robots, pour le compteur de fréquentation.
 *
 * ── Ce que ça attrape, et ce que ça n'attrape pas ────────────────────────
 *
 * Un compteur de visites honnête doit dire ce qu'il mesure. Trois filtres se
 * cumulent ici, du plus efficace au plus fin :
 *
 *   1. le compteur est appelé par du JavaScript dans le navigateur. La
 *      grande majorité des robots d'indexation ne l'exécutent pas et sont
 *      donc invisibles pour lui sans qu'on ait rien à faire ;
 *   2. ceux qui l'exécutent — Googlebot le fait — s'annoncent dans leur
 *      user-agent. C'est ce que cette liste reconnaît ;
 *   3. un user-agent absent ou trop court n'est pas un navigateur.
 *
 * Ce qui passera malgré tout : un robot qui exécute le JavaScript ET se fait
 * passer pour un navigateur. Il en existe, et aucune liste ne les arrêtera.
 * Le chiffre affiché est donc une bonne mesure, pas une mesure exacte — et
 * l'administration le dit, plutôt que de laisser croire à une précision
 * qu'aucun compteur n'a.
 */

/**
 * Fragments de user-agent propres aux robots, en minuscules.
 *
 * Retenus parce qu'ils n'apparaissent jamais dans un navigateur réel. « bot »
 * seul suffirait pour la plupart, mais les autres entrées attrapent les
 * aspirateurs et bibliothèques HTTP qui ne le portent pas.
 */
const SIGNATURES = [
  // Familles génériques — couvrent googlebot, bingbot, ahrefsbot, semrushbot…
  "bot", "crawl", "spider", "slurp",
  // Navigateurs pilotés : ils exécutent le JavaScript, donc le filtre 1 ne
  // les arrête pas. C'est ici qu'on les prend.
  "headless", "phantomjs", "puppeteer", "playwright", "selenium",
  // Bibliothèques et outils en ligne de commande.
  "curl/", "wget", "python-requests", "python-urllib", "go-http-client",
  "java/", "okhttp", "axios/", "node-fetch", "got (", "libwww-perl",
  // Aperçus de lien (messageries, réseaux sociaux) : ce sont des passages
  // automatiques déclenchés par un partage, pas des visites.
  "facebookexternalhit", "whatsapp", "telegrambot", "discordbot", "slackbot",
  "twitterbot", "linkedinbot", "embedly", "pinterest", "skypeuripreview",
  "vkshare", "redditbot", "applebot", "flipboard",
  // Surveillance et performance.
  "pingdom", "uptimerobot", "statuscake", "lighthouse", "pagespeed",
  "gtmetrix", "chrome-lighthouse", "vercel-screenshot", "vercelbot",
  // Archivage et analyse.
  "archive.org_bot", "ia_archiver", "petalbot", "dataforseo", "serpstat",
  "mj12bot", "dotbot", "seokicks", "blexbot", "zoominfobot", "bytespider",
];

/**
 * Vrai si ce user-agent est celui d'un robot.
 *
 * Un user-agent vide ou très court est traité comme un robot : tous les
 * navigateurs en envoient un, et long. C'est le cas des appels forgés à la
 * main, qui n'ont aucune raison d'être comptés comme des visites.
 */
export function estRobot(userAgent?: string | null): boolean {
  const ua = (userAgent || "").toLowerCase().trim();
  if (ua.length < 20) return true;
  return SIGNATURES.some((s) => ua.includes(s));
}

/**
 * Rubriques publiques du site, pour ranger les vues par page.
 *
 * Pourquoi une liste fermée plutôt que le chemin tel quel : le compteur range
 * les vues dans une carte `pages` à l'intérieur d'un document Firestore, et un
 * document est plafonné à 1 Mio. Compter les chemins tels qu'ils arrivent
 * laisserait n'importe qui faire grossir ce document à volonté, une URL
 * inventée après l'autre — et les robots à eux seuls en fabriquent beaucoup.
 * Tout ce qui n'est pas listé est rangé sous « autre ».
 */
const RUBRIQUES = new Set([
  "accueil", "activites", "balade", "cgv", "challenge", "confidentialite",
  "contact", "equipe", "galerie", "installations", "lancement",
  "mentions-legales", "mini-ferme", "montoir", "offrir-un-bon", "planning",
  "satisfaction", "tarifs",
]);

/**
 * Ramène une URL à la rubrique qu'elle représente.
 *
 * « /activites/poney-club?utm_source=fb » devient « activites ». La page
 * d'accueil devient « accueil ». Les paramètres de campagne disparaissent :
 * ils multiplieraient les entrées sans rien apprendre sur la fréquentation.
 */
export function rubriqueDe(chemin: string): string {
  const sansParametres = (chemin || "/").split(/[?#]/)[0];
  const premier = sansParametres.split("/").filter(Boolean)[0];
  if (!premier) return "accueil";
  return RUBRIQUES.has(premier) ? premier : "autre";
}
