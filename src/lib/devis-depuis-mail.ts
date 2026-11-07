/**
 * src/lib/devis-depuis-mail.ts — de la boîte mail au module devis.
 *
 * Novembre 2026, demande de Nicolas : « un meilleur lien avec le module
 * devis ». Quand un mail demande un prix (anniversaire, groupe, école,
 * entreprise…), l'assistant propose un devis (objet + lignes) ; la boîte
 * l'ouvre pré-rempli dans le module devis, sur la fiche de l'expéditeur.
 * Les prix ne viennent que des données fournies à l'IA : un prix absent
 * reste à 0 et la ligne est marquée « à compléter », jamais inventée.
 *
 * Pur, sans import, testé (tests/unit/devis-depuis-mail.test.ts).
 */

export interface LigneDevisProposee { label: string; qty: number; priceTTC: number; aCompleter: boolean }
export interface DevisPropose { objet: string; lignes: LigneDevisProposee[] }

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Ce que l'IA propose, assaini : 10 lignes au plus, quantités entières ≥ 1, prix ≥ 0 ou « à compléter ». */
export function nettoyerDevisPropose(brut: unknown): DevisPropose | null {
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Record<string, unknown>;
  const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 10).map((l: any) => {
    const qty = Math.max(1, Math.min(999, Math.round(Number(l?.qty) || 1)));
    const prix = Number(l?.priceTTC);
    const connu = l?.priceTTC !== null && l?.priceTTC !== undefined && Number.isFinite(prix) && prix > 0;
    return { label: texte(l?.label, 140), qty, priceTTC: connu ? Math.round(prix * 100) / 100 : 0, aCompleter: !connu };
  }).filter((l) => l.label);
  if (lignes.length === 0) return null;
  return { objet: texte(b.objet, 140), lignes };
}

export interface PrefillDevis { familyId: string; objet: string; lignes: LigneDevisProposee[]; source?: string }

/** Adresse du module devis, formulaire pré-rempli. */
export function lienDevis(p: PrefillDevis): string {
  return `/admin/devis?prefill=${encodeURIComponent(JSON.stringify(p))}`;
}

/** Relit le pré-remplissage reçu par l'URL (null s'il est absent ou abîmé). */
export function lirePrefillDevis(param: string | null | undefined): PrefillDevis | null {
  if (!param) return null;
  try {
    const p = JSON.parse(param);
    if (!p || typeof p.familyId !== "string" || !p.familyId) return null;
    const d = nettoyerDevisPropose({ objet: p.objet, lignes: (p.lignes || []).map((l: any) => ({ ...l, priceTTC: l?.aCompleter ? null : l?.priceTTC })) });
    return { familyId: p.familyId, objet: d?.objet || texte(p.objet, 140), lignes: d?.lignes || [], ...(p.source ? { source: texte(p.source, 200) } : {}) };
  } catch {
    return null;
  }
}

/** Note du devis : l'objet, et d'où vient la demande. */
export function noteDevisDepuisMail(p: PrefillDevis): string {
  return [p.objet, p.source ? `Demande reçue par email : « ${p.source} »` : ""].filter(Boolean).join("\n");
}
