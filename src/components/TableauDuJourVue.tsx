/**
 * src/components/TableauDuJourVue.tsx
 *
 * Le tableau du jour de la borne, version joyeuse : c'est un écran pour des
 * enfants qui arrivent au club. Fond clair, une couleur vive par cours,
 * prénoms en stickers avec le poney, grands emojis, le cours en cours qui
 * « respire ». Composant de présentation pur (styles en ligne, aucune
 * dépendance) : la page le nourrit, un script peut le rendre en HTML pour
 * l'aperçu.
 */

import type { CSSProperties } from "react";
import type { CarteTableau } from "@/lib/borne-tableau";

export interface TableauDuJourVueProps {
  cartes: CarteTableau[];
  dateLongue: string;
  heure?: string;
  erreur?: string;
  chargement?: boolean;
}

const POLICE = "'Outfit', 'Nunito', 'Segoe UI', system-ui, sans-serif";

/** Une palette par cours, qui tourne : jamais deux voisins de la même couleur. */
const PALETTES = [
  { fond: "#FFE6A7", bord: "#F4B942", encre: "#5A3A00", emoji: "🌞" },
  { fond: "#CDEFD9", bord: "#5CC58A", encre: "#0F4F2E", emoji: "🍀" },
  { fond: "#D6E9FF", bord: "#5AA6F5", encre: "#0F3D7A", emoji: "🌊" },
  { fond: "#FFD9E4", bord: "#F07AA0", encre: "#7A1C3F", emoji: "🌸" },
  { fond: "#E8DDFF", bord: "#A07CF0", encre: "#3D1F7A", emoji: "⭐" },
  { fond: "#FFE0C7", bord: "#F5934A", encre: "#7A3A0F", emoji: "🥕" },
];

const ETIQUETTE: Record<CarteTableau["etat"], { texte: string; fond: string; encre: string }> = {
  en_cours: { texte: "C'est parti !", fond: "#22A06B", encre: "#fff" },
  bientot: { texte: "Bientôt", fond: "#F4B942", encre: "#3A2A00" },
  a_venir: { texte: "Plus tard", fond: "rgba(0,0,0,0.08)", encre: "#3A3A3A" },
};

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "linear-gradient(180deg,#FFF9EC 0%,#FDF3F3 100%)", color: "#1F2A44", fontFamily: POLICE, padding: "28px 32px 40px" },
  entete: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 24 },
  titre: { fontSize: 56, lineHeight: 1, fontWeight: 800, margin: 0, color: "#1F2A44", letterSpacing: "-0.01em" },
  sousTitre: { fontSize: 20, margin: "8px 0 0", color: "#5B6B8A", textTransform: "capitalize" as const },
  bulle: { background: "#fff", border: "3px solid #F4B942", borderRadius: 24, padding: "14px 18px", fontSize: 18, color: "#1F2A44", maxWidth: 420, boxShadow: "0 6px 0 #F4B942" },
  grille: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 22 },
  carte: { borderRadius: 28, padding: "20px 22px 22px", border: "4px solid", position: "relative" as const, boxShadow: "0 8px 0 rgba(0,0,0,0.08)" },
  carteEntete: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  carteTitre: { fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.1 },
  carteInfo: { fontSize: 19, margin: "6px 0 0", opacity: 0.8 },
  etiquette: { borderRadius: 999, padding: "6px 14px", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" as const, flexShrink: 0 },
  stickers: { display: "flex", flexWrap: "wrap" as const, gap: 10, listStyle: "none", margin: 0, padding: 0 },
  sticker: { background: "#fff", borderRadius: 18, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 0 rgba(0,0,0,0.10)", transform: "rotate(-1deg)" },
  prenom: { fontSize: 24, fontWeight: 800 },
  poney: { fontSize: 19, fontWeight: 600, opacity: 0.85 },
  poneyAVenir: { fontSize: 15, fontStyle: "italic" as const, opacity: 0.5 },
  vide: { textAlign: "center" as const, fontSize: 34, fontWeight: 700, padding: "80px 0", color: "#5B6B8A" },
  pied: { marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" as const, fontSize: 14, color: "#8A96AD" },
};

export default function TableauDuJourVue({ cartes, dateLongue, heure, erreur, chargement }: TableauDuJourVueProps) {
  return (
    <main style={styles.page}>
      <style>{`@keyframes respire{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}@keyframes coucou{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}`}</style>
      <header style={styles.entete}>
        <div>
          <div style={{ fontSize: 15, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C98A0B", fontWeight: 800, marginBottom: 8 }}>Centre Équestre d&apos;Agon-Coutainville</div>
          <h1 style={styles.titre}>
            <span style={{ display: "inline-block", animation: "coucou 2.4s ease-in-out infinite" }}>🐴</span> Bienvenue au club&nbsp;!
          </h1>
          <p style={styles.sousTitre}>{dateLongue}{heure ? ` · ${heure}` : ""}</p>
        </div>
        <div style={styles.bulle}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🔎 Trouve ton prénom et ton poney&nbsp;!</div>
          <div style={{ fontSize: 15, color: "#5B6B8A" }}>Parents : café et thé vous attendent dans la salle de club ☕</div>
        </div>
      </header>

      {erreur && <p style={{ color: "#C0392B", fontSize: 16 }}>{erreur}</p>}
      {chargement && !erreur && <p style={styles.vide}>Un instant… 🐎</p>}
      {!chargement && !erreur && cartes.length === 0 && (
        <p style={styles.vide}>Plus de cours aujourd&apos;hui. À bientôt&nbsp;! 👋🐴</p>
      )}

      <div style={styles.grille}>
        {cartes.map((c, i) => {
          const pal = PALETTES[i % PALETTES.length];
          const et = ETIQUETTE[c.etat];
          const enCours = c.etat === "en_cours";
          return (
            <section key={c.id} style={{ ...styles.carte, background: pal.fond, borderColor: pal.bord, color: pal.encre, ...(enCours ? { animation: "respire 3s ease-in-out infinite", boxShadow: `0 8px 0 rgba(0,0,0,0.08), 0 0 0 6px ${pal.bord}55` } : {}) }}>
              <div style={styles.carteEntete}>
                <div>
                  <h2 style={styles.carteTitre}>{pal.emoji} {c.titre}</h2>
                  <p style={styles.carteInfo}>⏰ {c.horaire}{c.moniteur ? ` · avec ${c.moniteur}` : ""}</p>
                </div>
                <span style={{ ...styles.etiquette, background: et.fond, color: et.encre }}>{et.texte}</span>
              </div>
              <ul style={styles.stickers}>
                {c.cavaliers.map((r, j) => (
                  <li key={`${r.prenom}|${r.poney}`} style={{ ...styles.sticker, transform: `rotate(${j % 2 ? 1.2 : -1.2}deg)`, color: pal.encre }}>
                    <span style={styles.prenom}>{r.prenom}</span>
                    {r.poney
                      ? <span style={styles.poney}>🐴 {r.poney}</span>
                      : <span style={styles.poneyAVenir}>poney à venir</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer style={styles.pied}>
        <span>Mise à jour automatique chaque minute 🔄</span>
        <a href="/borne" style={{ color: "#5B6B8A", textDecoration: "none", border: "2px solid #D9DEE9", borderRadius: 14, padding: "8px 14px", background: "#fff" }}>Revenir à l&apos;assistant Câlin</a>
      </footer>
    </main>
  );
}
