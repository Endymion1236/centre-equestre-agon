/**
 * src/lib/stage-deroule.ts
 *
 * Deroule d'une seance de stage (2 sequences), affiche dans les emails de
 * confirmation et de rappel.
 *
 * Pourquoi : les emails n'annoncaient qu'une plage horaire — « 10h00–12h00 ».
 * Une famille en deduit deux heures a cheval, alors que la seance alterne
 * deux sequences. D'ou des reclamations recurrentes le jour du stage.
 *
 * Reglage UNIQUE, partage par tous les stages, saisi dans Parametres
 * (document Firestore `settings/stageDeroule`).
 *
 * ⚠️ Regle de sécurité : tant que le reglage est vide, AUCUN bloc n'est
 * ajoute aux emails. Mieux vaut l'absence d'information qu'un deroule
 * invente qui aggraverait les reclamations qu'il est cense eviter.
 */

export interface StageDeroule {
  /** Ex : « 1re heure — Équitation montée » */
  sequence1Titre: string;
  /** Ex : « Travail en carrière, jeux et parcours à poney » */
  sequence1Detail: string;
  sequence2Titre: string;
  sequence2Detail: string;
  /** Note libre affichee sous les deux sequences (optionnelle). */
  note?: string;
}

export const STAGE_DEROULE_VIDE: StageDeroule = {
  sequence1Titre: "",
  sequence1Detail: "",
  sequence2Titre: "",
  sequence2Detail: "",
  note: "",
};

/** Le reglage contient-il de quoi afficher quelque chose d'utile ? */
export function derouleEstRempli(d?: Partial<StageDeroule> | null): boolean {
  if (!d) return false;
  // Un titre suffit : le detail est facultatif.
  return Boolean((d.sequence1Titre || "").trim() && (d.sequence2Titre || "").trim());
}

/** Echappe le texte saisi : il part dans un email en HTML. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Bloc HTML du deroule, pret a inserer dans un email.
 * Renvoie une chaine VIDE si le reglage n'est pas renseigne.
 */
export function renderDerouleStage(d?: Partial<StageDeroule> | null): string {
  if (!derouleEstRempli(d)) return "";

  const ligne = (numero: number, titre: string, detail: string) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:32px;">
        <div style="width:24px;height:24px;border-radius:12px;background:#2050A0;color:#ffffff;font-size:12px;font-weight:bold;text-align:center;line-height:24px;">${numero}</div>
      </td>
      <td style="padding:10px 0 10px 10px;vertical-align:top;">
        <div style="color:#1e3a5f;font-weight:600;font-size:14px;">${esc(titre)}</div>
        ${detail.trim() ? `<div style="color:#555;font-size:13px;margin-top:2px;">${esc(detail)}</div>` : ""}
      </td>
    </tr>`;

  return `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:0 0 4px;color:#92400e;font-weight:600;font-size:13px;">🐴 Comment se déroule la séance</p>
    <table style="width:100%;border-collapse:collapse;">
      ${ligne(1, d!.sequence1Titre!, d!.sequence1Detail || "")}
      ${ligne(2, d!.sequence2Titre!, d!.sequence2Detail || "")}
    </table>
    ${(d!.note || "").trim() ? `<p style="margin:8px 0 0;color:#92400e;font-size:12px;">${esc(d!.note)}</p>` : ""}
  </div>`;
}

/** Version texte brut — pour un apercu dans l'admin, ou un SMS. */
export function renderDerouleTexte(d?: Partial<StageDeroule> | null): string {
  if (!derouleEstRempli(d)) return "";
  const lignes = [
    `1. ${d!.sequence1Titre}${d!.sequence1Detail ? ` — ${d!.sequence1Detail}` : ""}`,
    `2. ${d!.sequence2Titre}${d!.sequence2Detail ? ` — ${d!.sequence2Detail}` : ""}`,
  ];
  if ((d!.note || "").trim()) lignes.push(d!.note!.trim());
  return lignes.join("\n");
}
