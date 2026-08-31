/**
 * tests/unit/robots.test.ts
 *
 * Filtrage des robots du compteur de fréquentation.
 *   npx tsx tests/unit/robots.test.ts
 *
 * Enjeu : un compteur de visites ne vaut que par ce qu'il écarte. Deux
 * erreurs opposées le rendent inutile — laisser passer les robots gonfle le
 * chiffre, écarter un vrai navigateur le creuse — et ni l'une ni l'autre ne
 * se voit à l'usage, puisqu'il n'existe aucun chiffre de référence auquel
 * comparer. D'où ces user-agents réels des deux côtés.
 *
 * Le second volet couvre le rangement par rubrique. Il ne sert pas qu'à
 * l'affichage : les vues sont comptées dans une carte à l'intérieur d'un
 * document Firestore, plafonné à 1 Mio. Sans liste fermée, n'importe quelle
 * URL inventée y ajouterait une entrée.
 */

import { estRobot, rubriqueDe } from "../../src/lib/robots";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires filtrage des robots");
console.log("══════════════════════════════════════════════════════════════\n");

console.log("Robots — doivent être écartés");
{
  const robots: [string, string][] = [
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
    ["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
    // Celui-ci exécute le JavaScript : le fait que le compteur tourne dans le
    // navigateur ne suffit pas à l'arrêter, c'est la signature qui le prend.
    ["Chrome sans interface", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36"],
    ["curl", "curl/8.4.0"],
    ["python-requests", "python-requests/2.31.0"],
    ["Aperçu de lien Facebook", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
    ["Aperçu de lien WhatsApp", "WhatsApp/2.23.20.0"],
    ["Surveillance UptimeRobot", "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"],
    ["Lighthouse", "Mozilla/5.0 Chrome-Lighthouse"],
    ["Bytespider", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"],
    ["user-agent vide", ""],
    ["user-agent trop court", "x"],
  ];
  for (const [nom, ua] of robots) assert(nom, estRobot(ua), ua.slice(0, 50));
}

console.log("\nNavigateurs — ne doivent JAMAIS être écartés");
{
  const navigateurs: [string, string][] = [
    ["Safari iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"],
    ["Chrome Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
    ["Chrome Android", "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"],
    ["Safari macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"],
    ["Firefox", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"],
    ["Edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"],
    ["Samsung Internet", "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"],
  ];
  for (const [nom, ua] of navigateurs) assert(nom, !estRobot(ua), ua.slice(0, 50));
}

console.log("\nRangement par rubrique");
{
  const cas: [string, string][] = [
    ["/", "accueil"],
    ["/tarifs", "tarifs"],
    ["/activites", "activites"],
    ["/activites/poney-club", "activites"],
    // Les paramètres de campagne multiplieraient les entrées sans rien
    // apprendre sur la fréquentation.
    ["/tarifs?utm_source=facebook&utm_campaign=rentree", "tarifs"],
    ["/contact#formulaire", "contact"],
    // Tout ce qui n'est pas une rubrique connue tombe dans un seul seau :
    // c'est ce qui empêche le document de grossir indéfiniment.
    ["/url-inventee-par-un-robot", "autre"],
    ["/wp-admin/setup-config.php", "autre"],
    ["/admin/statistiques", "autre"],
  ];
  for (const [chemin, attendu] of cas)
    assert(`${chemin} → ${attendu}`, rubriqueDe(chemin) === attendu, `obtenu « ${rubriqueDe(chemin)} »`);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
