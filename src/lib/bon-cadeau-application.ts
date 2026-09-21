/**
 * src/lib/bon-cadeau-application.ts — appliquer un bon cadeau sur une commande.
 *
 * Un bon cadeau est vendu une fois (recette au journal à la vente, cf.
 * bon-cadeau-traitement). Quand il sert à régler une commande, ce n'est PAS
 * une nouvelle recette : l'écriture passe en mode « avoir », libellée
 * « Bon cadeau », et le solde du bon diminue d'autant.
 *
 * Ce module est la seule porte d'application, partagée par :
 *  - la famille, depuis son espace (Mes paiements, panier) ;
 *  - l'admin, depuis Encaisser, Impayés, Cartes, et l'acompte de stage du
 *    planning.
 *
 * Il fait ce que la caisse fait pour tout encaissement : écriture chaînée,
 * recalcul du réglé depuis le journal, numéro de facture quand la commande
 * est soldée, levée des places tenues. La route famille d'origine oubliait
 * les deux derniers points : une commande soldée par bon restait sans numéro
 * de facture, et la place tenue pouvait être purgée alors qu'elle était payée.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";
import { attribuerNumeroFacture } from "@/lib/invoice-number";
import { confirmerPlacesTenues } from "@/lib/places-tenues";

export interface BonCadeauLu {
  id: string;
  code: string;
  montant: number;
  solde: number;
  statut: string;
  validUntil: string | null;
  beneficiaire: string;
}

export type VerificationBon =
  | { ok: true; bon: BonCadeauLu }
  | { ok: false; raison: string; bon?: BonCadeauLu };

const arrondi = (n: number) => Math.round(n * 100) / 100;

export const normaliserCodeBon = (code: unknown) => String(code || "").trim().toUpperCase();

/** Lecture pure d'un document bon, sans accès base : testable. */
export function lireBon(id: string, data: any): BonCadeauLu {
  const montant = Number(data?.montant) || 0;
  return {
    id,
    code: normaliserCodeBon(data?.code),
    montant,
    solde: typeof data?.solde === "number" ? data.solde : montant,
    statut: String(data?.statut || "actif"),
    validUntil: data?.validUntil ? String(data.validUntil) : null,
    beneficiaire: String(data?.beneficiaire || data?.pour || ""),
  };
}

/** Le bon peut-il servir aujourd'hui ? Renvoie la raison sinon. */
export function evaluerBon(bon: BonCadeauLu, aujourdhui: string): VerificationBon {
  if (bon.statut !== "actif") {
    const libelle = bon.statut === "utilise" ? "déjà entièrement utilisé" : bon.statut === "annule" ? "annulé" : bon.statut === "expire" ? "expiré" : bon.statut;
    return { ok: false, raison: `Ce bon est ${libelle}.`, bon };
  }
  if (bon.solde <= 0.005) return { ok: false, raison: "Ce bon est déjà épuisé.", bon };
  if (bon.validUntil && bon.validUntil < aujourdhui) return { ok: false, raison: `Ce bon a expiré le ${bon.validUntil}.`, bon };
  return { ok: true, bon };
}

const aujourdhuiParis = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

export async function verifierBonCadeau(code: unknown): Promise<VerificationBon> {
  const codeClean = normaliserCodeBon(code);
  if (!codeClean) return { ok: false, raison: "Saisissez le code du bon (ex. BON-XXXX)." };
  const snap = await adminDb.collection("bons-cadeaux").where("code", "==", codeClean).limit(1).get();
  if (snap.empty) return { ok: false, raison: "Bon cadeau introuvable : vérifiez le code." };
  return evaluerBon(lireBon(snap.docs[0].id, snap.docs[0].data()), aujourdhuiParis());
}

export interface ApplicationBon {
  applique: number;
  resteAPayer: number;
  soldeRestantBon: number;
  facturePayee: boolean;
  invoiceNumber: string | null;
  code: string;
}

export async function appliquerBonCadeau(params: {
  code: unknown;
  paymentId: string;
  /** Plafond demandé (ex. l'acompte d'un stage). Défaut : tout ce que le bon peut couvrir. */
  montantMax?: number | null;
  /** Côté famille : la commande doit appartenir à ce compte. Absent côté admin. */
  familleUid?: string | null;
  /** Qui applique : « famille:<uid> », l'email de l'admin… (audit du numéro de facture). */
  appliquePar: string;
}): Promise<ApplicationBon> {
  const verif = await verifierBonCadeau(params.code);
  if (!verif.ok) throw new Error(verif.raison);
  const bon = verif.bon;

  const payRef = adminDb.collection("payments").doc(String(params.paymentId));
  const paySnap = await payRef.get();
  if (!paySnap.exists) throw new Error("Commande introuvable.");
  const p = paySnap.data() as any;
  if (params.familleUid && p.familyId !== params.familleUid) throw new Error("Cette commande n'est pas la vôtre.");
  if (p.status === "cancelled") throw new Error("Cette commande est annulée.");
  if (p.status === "paid") throw new Error("Cette commande est déjà réglée.");

  const totalTTC = Number(p.totalTTC) || 0;
  const restant = arrondi(totalTTC - (Number(p.paidAmount) || 0));
  if (restant <= 0.005) throw new Error("Rien à régler sur cette commande.");

  const plafond = typeof params.montantMax === "number" && params.montantMax > 0 ? params.montantMax : restant;
  const applique = arrondi(Math.min(bon.solde, restant, plafond));
  if (applique <= 0.005) throw new Error("Montant à appliquer nul.");

  const activityTitle = (p.items || []).map((i: any) => i.activityTitle).filter(Boolean).join(", ") || "Commande";

  // 1. Écriture au journal, chaînée. Mode « avoir » : c'est un crédit
  //    consommé, la recette a été comptée à la vente du bon.
  await createEncaissementServer({
    paymentId: payRef.id,
    familyId: p.familyId || "",
    familyName: p.familyName || "",
    montant: applique,
    mode: "avoir",
    modeLabel: "Bon cadeau",
    ref: bon.code,
    activityTitle,
    raison: `Bon cadeau ${bon.code}`,
    bonCadeauId: bon.id,
    isAvoir: true,
  });

  // 2. Le réglé se relit dans le journal, jamais par addition en mémoire.
  const encSnap = await adminDb.collection("encaissements").where("paymentId", "==", payRef.id).get();
  const totalEncaisse = arrondi(encSnap.docs.reduce((s, d) => s + (Number((d.data() as any).montant) || 0), 0));
  const facturePayee = totalEncaisse >= totalTTC - 0.005;
  const modes = [...new Set(encSnap.docs.map((d) => (d.data() as any).mode).filter(Boolean))];

  // 3. Numéro de facture séquentiel quand la commande est soldée.
  let invoiceNumber: string | null = p.invoiceNumber || null;
  if (facturePayee && !invoiceNumber) {
    try {
      invoiceNumber = (await attribuerNumeroFacture({ paymentId: payRef.id, attributedBy: params.appliquePar })).invoiceNumber;
    } catch (e) {
      console.error("[bon-cadeau] numéro de facture non attribué (non bloquant) :", e);
    }
  }

  await payRef.update({
    paidAmount: totalEncaisse,
    status: facturePayee ? "paid" : "partial",
    paymentMode: modes.length === 1 ? modes[0] : modes.length > 1 ? "mixte" : "avoir",
    paymentModes: modes,
    ...(invoiceNumber && !p.invoiceNumber ? { invoiceNumber, invoiceDate: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 4. Le bon diminue d'autant ; épuisé, il passe « utilisé ».
  const soldeRestantBon = arrondi(bon.solde - applique);
  await adminDb.collection("bons-cadeaux").doc(bon.id).update({
    solde: soldeRestantBon,
    statut: soldeRestantBon <= 0.005 ? "utilise" : "actif",
    usedFamilyId: p.familyId || "",
    utilisations: FieldValue.arrayUnion({
      date: new Date().toISOString(),
      paymentId: payRef.id,
      montant: applique,
      par: params.appliquePar,
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 5. Les places tenues de la commande deviennent fermes (même règle que la caisse).
  try { await confirmerPlacesTenues(payRef.id); }
  catch (e) { console.error("[bon-cadeau] confirmation des places (non bloquant) :", e); }

  return {
    applique,
    resteAPayer: arrondi(Math.max(0, totalTTC - totalEncaisse)),
    soldeRestantBon,
    facturePayee,
    invoiceNumber,
    code: bon.code,
  };
}
