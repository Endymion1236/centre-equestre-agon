/**
 * src/app/admin/sepa/mandats-firestore.ts
 *
 * Création d'un mandat de prélèvement : contrôle des coordonnées bancaires,
 * écriture dans `mandats-sepa`, puis envoi de la confirmation au débiteur.
 *
 * Pourquoi hors du composant : ce handler est le seul endroit où l'on décide
 * qu'un IBAN est bon. Tout ce qui passe ici sera rejoué tel quel dans le
 * fichier remis à la banque des mois plus tard — un IBAN mal saisi ne se
 * remarque qu'au premier rejet, avec les frais et le rattrapage que ça
 * implique. Le sortir de la page permet de lire la séquence de garde-fous
 * (checksum IBAN, cohérence BIC/pays, prénotification obligatoire) d'un seul
 * tenant, sans la mêler au rendu du formulaire.
 *
 * Toutes les dépendances sont explicites : la fonction ne lit aucun état de
 * React, on lui passe la saisie, les listes dont elle a besoin, `toast` et
 * `setSaving`. Elle rend `true` si le mandat a bien été créé — c'est à la page
 * de refermer et vider son formulaire dans ce cas.
 */

import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { validateIban, validateBic } from "@/lib/sepa-validation";
import type { Family } from "@/types";
import { lookupBic } from "./bic";
import type { MandatSepa, SaisieMandat, ToastFn } from "./types";

export async function creerMandat(params: {
  saisie: SaisieMandat;
  families: (Family & { firestoreId: string })[];
  mandats: MandatSepa[];
  toast: ToastFn;
  setSaving: (v: boolean) => void;
}): Promise<boolean> {
  const { saisie, families, mandats, toast, setSaving } = params;

  // Validation IBAN par checksum (ISO 13616, modulo 97)
  // Empeche les saisies erronees qui causeraient un rejet bancaire plus tard.
  const cleanIban = saisie.iban.replace(/\s/g, "").toUpperCase();
  const ibanCheck = validateIban(cleanIban);
  if (!ibanCheck.valid) {
    toast(`IBAN invalide : ${ibanCheck.error}`, "error");
    return false;
  }

  setSaving(true);
  let cree = false;
  try {
    const family = families.find(f => f.firestoreId === saisie.familyId);
    // Validation BIC : on prend le BIC fourni OU on auto-complete depuis l'IBAN
    const bicProvided = saisie.bic?.replace(/\s/g, "").toUpperCase();
    const bicAuto = lookupBic(cleanIban);
    const bic = bicProvided || bicAuto;
    // Si on a un BIC (fourni ou auto), on le valide structurellement.
    // L'IBAN ayant deja ete valide plus haut, on connait son pays.
    if (bic) {
      const countryFromIban = cleanIban.substring(0, 2);
      const bicCheck = validateBic(bic, countryFromIban);
      if (!bicCheck.valid) {
        toast(`BIC invalide : ${bicCheck.error}`, "error");
        setSaving(false);
        return false;
      }
    }
    const nextMandatNum = mandats.length + 1;
    const mandatId = `CEDC${nextMandatNum}MD${Math.floor(Math.random() * 9000) + 1000}`;

    const mandatRef = await addDoc(collection(db, "mandats-sepa"), {
      familyId: saisie.familyId,
      familyName: family?.parentName || "",
      mandatId,
      iban: cleanIban,
      bic,
      dateSignature: saisie.dateSignature,
      titulaire: saisie.titulaire,
      libelle: saisie.libelle || "",
      status: "active",
      createdAt: serverTimestamp(),
    });
    // Confirmation de mandat + prenotification de l'echeancier (obligation
    // SEPA d'informer le debiteur avant tout prelevement).
    try {
      const rn = await authFetch("/api/admin/sepa/notifier-mandat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandatDocId: mandatRef.id }),
      });
      const dn = await rn.json();
      if (dn?.sent) toast(`Mandat créé et envoyé (${dn.echeances} échéance${dn.echeances > 1 ? "s" : ""})`, "success");
      else if (dn?.blocked) toast("Mandat créé — email bloqué (mode restreint)", "warning");
      else toast("Mandat créé, mais l'email n'a pas pu être envoyé", "warning");
    } catch {
      toast("Mandat créé, mais l'email n'a pas pu être envoyé", "warning");
    }
    cree = true;
  } catch (e: any) { toast(e.message, "error"); }
  setSaving(false);
  return cree;
}

/**
 * Supprime un mandat, après la confirmation navigateur d'origine.
 * Rend `true` seulement si la suppression a eu lieu (la page recharge alors).
 */
export async function supprimerMandat(id: string, toast: ToastFn): Promise<boolean> {
  if (!confirm("Supprimer ce mandat SEPA ?")) return false;
  await deleteDoc(doc(db, "mandats-sepa", id));
  toast("Mandat supprimé", "success");
  return true;
}
