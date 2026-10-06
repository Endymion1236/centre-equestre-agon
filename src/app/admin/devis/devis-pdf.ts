/**
 * src/app/admin/devis/devis-pdf.ts — le PDF joint à l'email d'un devis.
 *
 * Le devis partait en email sans pièce jointe (octobre 2026) : la famille ou
 * la structure n'avait rien à imprimer, signer ou transmettre à sa
 * comptabilité. Le générateur des factures (api/invoice-pdf) sait produire un
 * « DEVIS » : ce module lui prépare les données.
 *
 * Module pur, testé seul (tests/unit/devis-pdf.test.ts).
 */
import type { ParamsFacturePdf } from "@/lib/download-invoice";
import { tauxTva } from "@/lib/tva-taux";

export interface LigneDevisPdf {
  label: string;
  description?: string;
  qty?: number;
  /** Prix unitaire TTC plein, avant remise. */
  priceTTC?: number;
  tva?: number | null;
  remisePct?: number;
}

export interface DevisPourPdf {
  numero: string;
  familyName: string;
  familyEmail?: string;
  serviceFacture?: string;
  items: LigneDevisPdf[];
  totalTTC: number;
  validUntil?: string;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Total TTC d'une ligne, remise comprise — même calcul que l'écran des devis. */
export function ttcLigneDevis(i: LigneDevisPdf): number {
  return arrondi((i.qty || 1) * (i.priceTTC || 0) * (1 - (i.remisePct || 0) / 100));
}

/** « 2026-11-05 » → « 05/11/2026 » (sans passer par l'heure : pas de décalage de fuseau). */
export function dateDevisFr(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function paramsPdfDevis(d: DevisPourPdf, adresse: string, emisLe: string): ParamsFacturePdf {
  const items = d.items
    .filter((i) => String(i.label || "").trim())
    .map((i) => {
      const taux = tauxTva(i.tva);
      const qte = i.qty || 1;
      const ttc = ttcLigneDevis(i);
      const ht = arrondi(ttc / (1 + taux / 100));
      const puHT = arrondi((i.priceTTC || 0) / (1 + taux / 100));
      return {
        activityTitle: i.label.trim(),
        ...(i.description?.trim() ? { sousTitre: i.description.trim() } : {}),
        quantity: qte,
        puHT,
        priceHT: ht,
        remise: i.remisePct ? Math.max(0, arrondi(qte * puHT - ht)) : 0,
        tva: taux,
        priceTTC: ttc,
      };
    });
  const totalTTC = arrondi(items.reduce((s, i) => s + i.priceTTC, 0));
  const totalHT = arrondi(items.reduce((s, i) => s + i.priceHT, 0));
  return {
    invoiceNumber: d.numero,
    date: emisLe,
    familyName: d.familyName,
    familyEmail: d.familyEmail || "",
    familyAddress: adresse,
    serviceFacture: d.serviceFacture || undefined,
    items,
    totalHT,
    totalTVA: arrondi(totalTTC - totalHT),
    totalTTC,
    paidAmount: 0,
    paymentMode: "",
    paymentDate: "",
    documentType: "devis",
    validUntil: dateDevisFr(d.validUntil),
  };
}
