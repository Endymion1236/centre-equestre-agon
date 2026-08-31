/**
 * Dessins au trait des emails — `node scripts/generer-icones-email.mjs`
 *
 * Ils sont produits ici plutôt que déposés à la main : le trait, la couleur et
 * la taille de rendu suivent alors la palette du code, et on peut les refaire
 * si elle change. Rasterisés à 3× pour rester nets sur écran Retina.
 *
 * Deux dessins ont été retirés de cette liste. Une tête de cheval : au trait
 * et à 34 px elle ne se lisait pas. Un fer à cheval en en-tête : il était
 * encadré de deux filets d'un pixel posés dans des cellules de tableau, et
 * Gmail mobile impose une hauteur minimale à une cellule — les filets
 * devenaient deux pavés dorés pleins. Un ornement qu'il faut deviner, ou qui
 * se rend mal quelque part, vaut moins que pas d'ornement.
 *
 * Ce sont des images distantes : une messagerie qui bloque les images les fera
 * disparaître. C'est pourquoi ils restent purement décoratifs — alt vide,
 * dimensions fixées — et qu'aucune information ne repose sur eux.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const OR = "#B8860B";       // doré lisible sur fond sable

const svg = (d, stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const FORMES = {
  calendrier: `<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>
               <circle cx="8.5" cy="14.5" r=".9" fill="__C__" stroke="none"/>
               <circle cx="12" cy="14.5" r=".9" fill="__C__" stroke="none"/>
               <circle cx="15.5" cy="14.5" r=".9" fill="__C__" stroke="none"/>`,
  carte: `<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>`,
  epingle: `<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>`,
  telephone: `<path d="M6.5 3.5h3l1.6 4-2 1.4a12.5 12.5 0 0 0 6 6l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z"/>`,
  enveloppe: `<rect x="2.5" y="5" width="19" height="14" rx="2.2"/><path d="m3.4 6.6 8.6 6.2 8.6-6.2"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>`,
};

const COULEUR = {};
const TAILLE = {};

for (const [nom, forme] of Object.entries(FORMES)) {
  const stroke = COULEUR[nom] || OR;
  const source = svg(forme.replaceAll("__C__", stroke), stroke);
  const px = TAILLE[nom] || 22;
  writeFileSync(`public/images/email/${nom}.svg`, source);
  await sharp(Buffer.from(source), { density: 600 })
    .resize(px * 3, px * 3, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`public/images/email/${nom}.png`);
  console.log(`${nom}.png — ${px * 3}px (affiché à ${px})`);
}
