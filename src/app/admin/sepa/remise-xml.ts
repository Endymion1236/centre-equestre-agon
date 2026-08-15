/**
 * src/app/admin/sepa/remise-xml.ts
 *
 * Passage des échéances sélectionnées à l'écran aux transactions du fichier
 * pain.008 remis à la banque, et téléchargement du fichier produit.
 *
 * Pourquoi séparé : c'est le point où l'application quitte Firestore pour
 * parler à la banque. Le XML lui-même est fabriqué par `@/lib/sepa`
 * (`generateSepaXml`) ; ce qui est ici, c'est le mapping — quel champ de
 * l'échéance et du mandat va dans quelle balise. Une erreur de mapping ne se
 * voit pas à l'écran : elle se voit sur le relevé bancaire, ou en rejet une
 * semaine plus tard. Isolé du composant, ce calcul est relisible et vérifiable
 * sans monter la page.
 *
 * Les deux fonctions sont sans état d'écran : on leur donne la sélection et
 * les mandats, elles rendent les transactions ; on leur donne un XML et un nom
 * de fichier, elles déclenchent le téléchargement.
 */

import type { SepaTransaction } from "@/lib/sepa";
import type { EcheanceSepa, MandatSepa } from "./types";

/**
 * Construit les transactions XML d'une remise.
 *
 * Les identifiants (`instrId`, `endToEndId`) doivent être uniques dans le
 * fichier : ils combinent l'identifiant du message, le rang de la transaction
 * et les 5 derniers caractères de l'id Firestore de l'échéance.
 *
 * Les valeurs de repli comptent : si le mandat n'est pas retrouvé, on retombe
 * sur la date du jour et le nom de la famille plutôt que de laisser un champ
 * vide qui ferait rejeter tout le fichier par la banque.
 *
 * @param selected   Échéances retenues pour la remise, dans l'ordre d'envoi
 * @param mandats    Tous les mandats connus (pour retrouver IBAN/BIC/titulaire)
 * @param msgId      Identifiant du message de la remise (ex: CEDC12PRLV)
 * @param todayStr   Date du jour AAAA-MM-JJ, utilisée si le mandat est absent
 */
export function construireTransactions(
  selected: EcheanceSepa[],
  mandats: MandatSepa[],
  msgId: string,
  todayStr: string,
): SepaTransaction[] {
  return selected.map((ech, i) => {
    const mandat = mandats.find(m => m.mandatId === ech.mandatId);
    return {
      instrId: `${msgId}M${i + 1}P${ech.id.slice(-5)}`,
      endToEndId: `M${i + 1}P${ech.id.slice(-5)}`,
      amount: ech.montant,
      mandatId: ech.mandatId,
      mandatDate: mandat?.dateSignature || todayStr,
      debtorName: mandat?.titulaire || ech.familyName,
      debtorIban: mandat?.iban || "",
      debtorBic: mandat?.bic || "",
      remittanceInfo: ech.reference || ech.description,
    };
  });
}

/**
 * Déclenche le téléchargement du fichier XML dans le navigateur.
 *
 * Sert aussi bien à la création d'une remise qu'au re-téléchargement depuis
 * l'historique : dans les deux cas le fichier est identique, c'est le même
 * contenu relu depuis Firestore.
 */
export function telechargerXml(xml: string, fileName: string) {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
