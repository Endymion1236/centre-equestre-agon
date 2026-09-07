import { CENTRE_IBAN } from "./coordonnees-bancaires";
import { compteBanque } from "./plan-comptable-achats";

export const COMPTES_BANQUE_DEPENSE = [
  { compte: "51200000", libelle: "Crédit Agricole" },
  { compte: "51220000", libelle: "Excédent Pro" },
  { compte: "51730000", libelle: "FFE club" },
  { compte: "51740000", libelle: "FFE compétition" },
] as const;
export type SourceBanqueDepense = { compte?: string; compteBanqueConfirme?: string | null; note?: string; source?: string };
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const vide = () => ({ compte: "", libelle: "Compte de prélèvement à préciser", origine: "inconnue" as const });

/** Un compte de charge (627…) n'identifie jamais la banque qui l'a prélevé. */
export function banqueDepense(ligne: SourceBanqueDepense) {
  if (ligne.compteBanqueConfirme) {
    const c = COMPTES_BANQUE_DEPENSE.find(c => c.compte === ligne.compteBanqueConfirme);
    return c ? { ...c, origine: "confirmee" as const } : vide();
  }
  const source = compteBanque(ligne.compte);
  if (source.compte) return { ...source, origine: "compte-releve" as const };
  // L'ancien import a parfois gardé uniquement le nom du PDF. Une référence
  // explicite au compte du centre est utilisable, jamais un simple « CA…pdf ».
  // Ne pas remplacer une autre banque nommée par un indice dans une note.
  const generique = !ligne.compte?.trim() || normal(ligne.compte) === "compte courant";
  if (generique && ligne.source === "releve-bancaire" && /^relev[ée]\s/i.test(ligne.note || "")) {
    const reference = (ligne.note || "").replace(/[\s.\u00a0\u202f-]/g, "").toUpperCase();
    const numeroCompte = CENTRE_IBAN.slice(14, 25);
    if (reference.includes(CENTRE_IBAN) || new RegExp(`(^|[^0-9])${numeroCompte}([^0-9]|$)`).test(reference))
      return { ...compteBanque("51200000"), origine: "reference-releve" as const };
  }
  return vide();
}

/** Choix explicite, réversible ; le compte source et l'identifiant d'import restent intacts. */
export function verifierChoixBanque(ligne: SourceBanqueDepense, choix: unknown, avant: unknown): string | null {
  if (ligne.source !== "releve-bancaire") throw new Error("Ce choix concerne une opération issue d’un relevé bancaire.");
  if (avant !== (ligne.compteBanqueConfirme || null)) throw new Error("Le compte a été modifié : actualisez la fiche avant de réessayer.");
  if (choix !== null && !COMPTES_BANQUE_DEPENSE.some(c => c.compte === choix)) throw new Error("Choisissez un compte bancaire proposé dans la liste.");
  return choix as string | null;
}
