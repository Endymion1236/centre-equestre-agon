/**
 * src/lib/superpdp-reception.ts — réception RÉELLE des factures fournisseurs
 * par Super PDP, plateforme agréée du club (accord du cabinet, 11/2026).
 *
 * Chaque facture reçue devient une pièce de Dépenses (collection
 * `justificatifs`, fichier d'origine PDF ou XML dans le stockage privé), avec
 * les montants lus dans la facture électronique — pas d'IA. Le rattachement
 * au débit du relevé suit le chemin habituel (« Rapprocher automatiquement
 * les pièces »).
 *
 * Garde-fou : on n'importe QUE depuis le compte de production du club
 * (env « production », SIREN du club). Une facture du bac à sable est
 * fictive : enregistrée, elle deviendrait une pièce comptable.
 *
 * Pur, sans import, testé (tests/unit/superpdp-reception.test.ts).
 */

export const SIREN_CLUB = "507569184";

export interface CompteSuperPdp { env?: string; number?: string; number_scheme?: string; formal_name?: string }

/** Peut-on enregistrer des pièces depuis ce compte ? */
export function compteDeProductionDuClub(c: CompteSuperPdp | null | undefined, siren = SIREN_CLUB): { ok: boolean; raison?: string } {
  if (!c) return { ok: false, raison: "Compte Super PDP illisible." };
  if (c.env !== "production") return { ok: false, raison: `Compte en mode « ${c.env || "?"} » : les factures du bac à sable sont fictives, elles ne sont jamais enregistrées dans Dépenses. Mettez dans Vercel les identifiants de l'application créée sur le compte de PRODUCTION.` };
  const numero = String(c.number || "").replace(/\s/g, "");
  if (c.number_scheme !== "fr_siren" || numero.slice(0, 9) !== siren) {
    return { ok: false, raison: `Le compte Super PDP (${c.formal_name || "?"}, n° ${numero || "?"}) n'est pas celui du club (SIREN ${siren}).` };
  }
  return { ok: true };
}

/** Identifiant de la pièce : une facture de la plateforme n'entre qu'une fois. */
export const idPiecePlateforme = (idFacture: number | string) => `superpdp-${String(idFacture).replace(/[^0-9A-Za-z_-]/g, "")}`;

/** Type de fichier reçu (PDF Factur-X, ou XML UBL/CII). */
export function mimeFichierRecu(contentType: string | null | undefined, debut: Uint8Array): "application/pdf" | "application/xml" | null {
  const ct = String(contentType || "").toLowerCase();
  const tete = String.fromCharCode(...Array.from(debut.slice(0, 5)));
  if (tete === "%PDF-" || ct.includes("pdf")) return "application/pdf";
  if (ct.includes("xml") || tete.trimStart().startsWith("<")) return "application/xml";
  return null;
}

/** Nom de la pièce, comme une facture déposée : « Fournisseur — n° — date.pdf ». */
export function nomPiecePlateforme(p: { fournisseur?: string; numero?: string; date?: string }, mime: string): string {
  const ext = mime === "application/pdf" ? "pdf" : "xml";
  const morceaux = [p.fournisseur || "Fournisseur", p.numero ? `n° ${p.numero}` : "", p.date || ""].filter(Boolean);
  return `${morceaux.join(" — ").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 170)}.${ext}`;
}

/** Factures reçues encore absentes de Dépenses (les plus anciennes d'abord). */
export function facturesAImporter<T extends { id: number; direction?: string }>(factures: T[], dejaLa: Set<string>): T[] {
  return factures
    .filter((f) => f.direction === "in" && !dejaLa.has(idPiecePlateforme(f.id)))
    .sort((a, b) => a.id - b.id);
}

/** Avoir (note de crédit, codes UNTDID 1001 : 381, 261, 262, 396, 502, 503). */
export function estAvoirPlateforme(en: { type_code?: unknown } | null | undefined): boolean {
  return ["381", "261", "262", "396", "502", "503"].includes(String(en?.type_code ?? ""));
}
