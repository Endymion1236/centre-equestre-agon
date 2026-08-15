/**
 * src/app/admin/sepa/echeances-firestore.ts
 *
 * Tout ce qui écrit dans la collection `echeances-sepa` : générer un
 * échéancier, décaler une série entière, corriger la date d'une échéance
 * isolée.
 *
 * Pourquoi hors du composant : ces fonctions décident QUAND la banque va
 * débiter une famille et de COMBIEN. Le découpage d'un montant en n échéances
 * (avec le reste des centimes reporté sur la dernière) et le calcul des dates
 * de mois en mois sont les deux endroits où une erreur se traduit directement
 * en argent prélevé au mauvais moment ou au mauvais montant. Réunis ici, ils
 * se relisent côte à côte et ne dépendent d'aucun état d'écran : on leur passe
 * les données, `toast` et de quoi rafraîchir.
 *
 * Chaque fonction rend `true` quand quelque chose a été écrit : c'est la page
 * qui décide alors de refermer son formulaire et de recharger les données.
 */

import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EcheanceSepa, MandatSepa, SaisieEcheancier, ToastFn } from "./types";

/**
 * Génère `nb` échéances mensuelles pour un mandat.
 *
 * Le montant unitaire est arrondi au centime INFÉRIEUR et le reliquat est
 * ajouté à la dernière échéance : la somme des prélèvements retombe ainsi
 * exactement sur le total dû, sans centime perdu ni centime en trop.
 *
 * Helper réutilisable : appelé deux fois quand l'échéancier est réparti sur
 * deux mandats (parents séparés).
 */
export const genererEcheances = async (
  mandat: MandatSepa,
  total: number,
  nb: number,
  dateDebut: string,
  description: string,
  reference: string,
) => {
  const montantEcheance = Math.floor(total / nb * 100) / 100;
  const reste = Math.round((total - montantEcheance * nb) * 100) / 100;
  const startDate = new Date(dateDebut);
  for (let i = 0; i < nb; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const montant = i === nb - 1 ? montantEcheance + reste : montantEcheance;
    await addDoc(collection(db, "echeances-sepa"), {
      familyId: mandat.familyId,
      familyName: mandat.familyName,
      mandatId: mandat.mandatId,
      montant: Math.round(montant * 100) / 100,
      dateEcheance: dateStr,
      reference,
      description: description || `Échéance ${i + 1}/${nb}`,
      status: "pending",
      remiseId: null,
      paymentId: null,
      createdAt: serverTimestamp(),
    });
  }
};

/**
 * Crée un échéancier depuis le formulaire : sur un seul mandat, ou réparti
 * sur deux (cas des parents séparés qui paient chacun leur part).
 *
 * En mode réparti, les deux séries partagent une même `reference`
 * (`SPLIT-<timestamp>`) : c'est ce qui permet plus tard de reconnaître que ces
 * prélèvements sur deux comptes différents règlent la même inscription.
 */
export async function creerEcheancier(params: {
  saisie: SaisieEcheancier;
  mandats: MandatSepa[];
  repartir: boolean;
  toast: ToastFn;
  setSaving: (v: boolean) => void;
}): Promise<boolean> {
  const { saisie, mandats, repartir, toast, setSaving } = params;

  const mandat = mandats.find(m => m.id === saisie.mandatId);
  if (!mandat || !saisie.montantTotal || !saisie.dateDebut) return false;
  const nb = parseInt(saisie.nbEcheances);
  if (!nb || nb < 1) { toast("Nombre d'échéances invalide", "error"); return false; }
  const montant1 = parseFloat(saisie.montantTotal);

  if (repartir) {
    const mandat2 = mandats.find(m => m.id === saisie.mandatId2);
    const montant2 = parseFloat(saisie.montant2);
    if (!mandat2) { toast("Choisis le 2e mandat", "error"); return false; }
    if (mandat2.id === mandat.id) { toast("Les 2 mandats doivent être différents", "error"); return false; }
    if (!montant2 || montant2 <= 0) { toast("Montant du 2e mandat manquant", "error"); return false; }
    setSaving(true);
    let creeReparti = false;
    try {
      const ref = `SPLIT-${Date.now()}`;
      await genererEcheances(mandat, montant1, nb, saisie.dateDebut, saisie.description, ref);
      await genererEcheances(mandat2, montant2, nb, saisie.dateDebut, saisie.description, ref);
      toast(`Réparti : ${montant1.toFixed(2)}€ + ${montant2.toFixed(2)}€ = ${(montant1 + montant2).toFixed(2)}€`, "success");
      creeReparti = true;
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
    return creeReparti;
  }

  setSaving(true);
  let cree = false;
  try {
    await genererEcheances(mandat, montant1, nb, saisie.dateDebut, saisie.description, "");
    toast(`${nb} échéances créées pour ${mandat.familyName}`, "success");
    cree = true;
  } catch (e: any) { toast(e.message, "error"); }
  setSaving(false);
  return cree;
}

// ─── Decaler toutes les echeances d'une serie a partir d'une nouvelle date ───
// Cas d'usage : on inscrit en mai mais on veut que le 1er prelevement parte
// en septembre. Au lieu de modifier 10 dates a la main, on choisit la nouvelle
// date de la 1ere echeance, les autres suivent automatiquement (+1 mois).
//
// Identifie les echeances de la meme serie via orderId (et famille au cas ou).
// Trie par numero d'echeance (echeance: 1, 2, 3, ...).
// Pour chaque echeance i, met dateEcheance = nouvelleDateBase + i mois.
export async function decalerSerie(params: {
  firstEcheance: EcheanceSepa;
  echeances: EcheanceSepa[];
  toast: ToastFn;
}): Promise<boolean> {
  const { firstEcheance, echeances, toast } = params;

  const orderId = firstEcheance.orderId;
  if (!orderId) {
    toast("Cette échéance n'a pas d'identifiant de série (legacy)", "warning");
    return false;
  }
  const nouvelleDateStr = prompt(
    `Décaler toute la série (${firstEcheance.echeancesTotal || "?"} échéances) :\n\nNouvelle date de la 1ère échéance ?\n(Format : AAAA-MM-JJ, ex : 2026-09-01)`,
    firstEcheance.dateEcheance
  );
  if (!nouvelleDateStr) return false;
  // Validation format date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nouvelleDateStr)) {
    toast("Format invalide. Utilisez AAAA-MM-JJ (ex: 2026-09-01)", "error");
    return false;
  }
  const baseDate = new Date(nouvelleDateStr + "T12:00:00"); // midi pour eviter timezone
  if (isNaN(baseDate.getTime())) {
    toast("Date invalide", "error");
    return false;
  }
  // Recuperer toutes les echeances de cette serie (meme orderId, status pending)
  const seriesEcheances = echeances
    .filter(e => e.orderId === orderId && e.status === "pending")
    .sort((a, b) => (a.echeance || 0) - (b.echeance || 0));
  if (seriesEcheances.length === 0) {
    toast("Aucune échéance pending pour cette série", "warning");
    return false;
  }
  if (!confirm(`Décaler ${seriesEcheances.length} échéance(s) à partir du ${nouvelleDateStr} ?\n\nLes échéances seront espacées de 1 mois.`)) return false;
  let updated = 0;
  for (const ech of seriesEcheances) {
    const idx = (ech.echeance || 1) - 1; // 1ere echeance = index 0
    const newDate = new Date(baseDate);
    newDate.setMonth(newDate.getMonth() + idx);
    // Format YYYY-MM-DD (eviter toISOString qui peut decaler en UTC)
    const yyyy = newDate.getFullYear();
    const mm = String(newDate.getMonth() + 1).padStart(2, "0");
    const dd = String(newDate.getDate()).padStart(2, "0");
    const newDateStr = `${yyyy}-${mm}-${dd}`;
    try {
      await updateDoc(doc(db, "echeances-sepa", ech.id), { dateEcheance: newDateStr });
      updated++;
    } catch (e) {
      console.error(`Echec maj echeance ${ech.id}:`, e);
    }
  }
  toast(`✅ ${updated} échéance(s) décalée(s) à partir du ${nouvelleDateStr}`, "success");
  return true;
}

/**
 * Corrige la date d'une seule échéance, depuis le champ date de la liste.
 *
 * On ne recharge que les échéances (et non toute la page) : l'admin corrige
 * souvent plusieurs dates à la suite, un rechargement complet à chaque champ
 * quitté serait insupportable.
 */
export async function mettreAJourDateEcheance(params: {
  ech: EcheanceSepa;
  newDate: string;
  toast: ToastFn;
  setEcheances: (echeances: EcheanceSepa[]) => void;
}) {
  const { ech, newDate, toast, setEcheances } = params;
  if (newDate && newDate !== ech.dateEcheance) {
    await updateDoc(doc(db, "echeances-sepa", ech.id), { dateEcheance: newDate });
    toast("Date de prélèvement mise à jour", "success");
    // Refresh les données
    const snap = await getDocs(collection(db, "echeances-sepa"));
    setEcheances(snap.docs.map(d => ({ id: d.id, ...d.data() } as EcheanceSepa)));
  }
}

/**
 * Supprime une échéance, après la confirmation navigateur d'origine.
 * Rend `true` seulement si la suppression a eu lieu (la page recharge alors).
 */
export async function supprimerEcheance(id: string, toast: ToastFn): Promise<boolean> {
  if (!confirm("Supprimer cette échéance ?")) return false;
  await deleteDoc(doc(db, "echeances-sepa", id));
  toast("Échéance supprimée", "success");
  return true;
}
