/**
 * Vérification de la chaîne d'empreintes des encaissements.
 *
 * Chaque encaissement porte une empreinte SHA-256 de ses champs comptables,
 * qui inclut l'empreinte du précédent. Modifier un montant après coup casse
 * l'empreinte de sa ligne ET tous les maillons suivants : c'est ce qui rend
 * l'altération détectable, comme l'exige l'art. 286-I-3° bis du CGI.
 *
 * Encore faut-il vérifier. verifyEncaissementHash() existait depuis la mise en
 * place du dispositif sans être appelée nulle part — une chaîne qu'on ne
 * contrôle jamais ne démontre rien, et c'est précisément ce qu'un vérificateur
 * demande à voir.
 *
 * Module volontairement pur : il reçoit les encaissements déjà lus, ne touche
 * ni à Firestore ni au réseau, et se teste donc sans base.
 */

import { hashEncaissement, verifyEncaissementHash } from "@/lib/compta-hash";

export interface EncaissementVerifiable {
  id: string;
  paymentId?: string;
  familyId?: string;
  familyName?: string;
  montant: number;
  mode: string;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  raison?: string;
  correctionDe?: string;
  dateIso?: string;
  hash?: string;
  previousHash?: string;
}

export interface AnomalieChaine {
  id: string;
  dateIso?: string;
  montant: number;
  familyName?: string;
  detail: string;
}

export interface RapportChaine {
  total: number;
  /** Encaissements portant une empreinte, donc vérifiables. */
  signes: number;
  /** Écritures antérieures au dispositif, ou créées hors du helper. */
  sansEmpreinte: AnomalieChaine[];
  /** Empreinte présente mais ne correspondant plus au contenu : altération. */
  empreintesInvalides: AnomalieChaine[];
  /** Le maillon ne désigne pas l'empreinte de l'écriture précédente. */
  chainonsRompus: AnomalieChaine[];
  /** Vrai si aucune altération ni rupture n'a été trouvée. */
  conforme: boolean;
  /** Phrase prête à afficher. */
  resume: string;
}

function resume(enc: EncaissementVerifiable): AnomalieChaine {
  return {
    id: enc.id,
    dateIso: enc.dateIso,
    montant: enc.montant,
    familyName: enc.familyName,
    detail: "",
  };
}

/** Champs entrant dans le calcul de l'empreinte, dans l'ordre attendu. */
function champsHash(enc: EncaissementVerifiable) {
  return {
    paymentId: enc.paymentId,
    familyId: enc.familyId,
    familyName: enc.familyName,
    montant: enc.montant,
    mode: enc.mode,
    modeLabel: enc.modeLabel,
    ref: enc.ref,
    activityTitle: enc.activityTitle,
    raison: enc.raison,
    correctionDe: enc.correctionDe,
    dateIso: enc.dateIso || "",
    previousHash: enc.previousHash || undefined,
  };
}

/**
 * Parcourt la chaîne dans l'ordre chronologique et rend un rapport.
 *
 * Les écritures sans empreinte sont signalées mais ne rompent pas la chaîne :
 * elles sont antérieures au dispositif. Le chaînage se lit d'un maillon signé
 * au précédent maillon signé.
 */
export async function verifierChaine(
  encaissements: EncaissementVerifiable[],
): Promise<RapportChaine> {
  const tries = [...encaissements].sort((a, b) =>
    (a.dateIso || "").localeCompare(b.dateIso || ""),
  );

  const sansEmpreinte: AnomalieChaine[] = [];
  const empreintesInvalides: AnomalieChaine[] = [];
  const chainonsRompus: AnomalieChaine[] = [];
  let signes = 0;
  let hashPrecedent: string | null = null;

  for (const enc of tries) {
    if (!enc.hash) {
      sansEmpreinte.push({
        ...resume(enc),
        detail: "Écriture sans empreinte : non vérifiable.",
      });
      continue;
    }

    signes++;

    // 1. L'empreinte correspond-elle toujours au contenu de l'écriture ?
    const intacte = await verifyEncaissementHash(champsHash(enc), enc.hash);
    if (!intacte) {
      empreintesInvalides.push({
        ...resume(enc),
        detail:
          "L'empreinte ne correspond plus au contenu : l'écriture a été modifiée après son enregistrement.",
      });
    }

    // 2. Le maillon désigne-t-il bien l'écriture signée précédente ?
    //    Le tout premier maillon n'a pas de précédent, c'est normal.
    if (hashPrecedent !== null && (enc.previousHash || null) !== hashPrecedent) {
      chainonsRompus.push({
        ...resume(enc),
        detail: enc.previousHash
          ? "Le maillon renvoie à une autre écriture que la précédente : une écriture a été supprimée, ou deux ont été enregistrées en même temps."
          : "Maillon absent : l'écriture n'est rattachée à aucune précédente.",
      });
    }

    hashPrecedent = enc.hash;
  }

  const conforme = empreintesInvalides.length === 0 && chainonsRompus.length === 0;
  const resumeTexte = conforme
    ? sansEmpreinte.length === 0
      ? `Chaîne intacte : ${signes} écriture(s) vérifiée(s), aucune altération.`
      : `Chaîne intacte sur les ${signes} écriture(s) signée(s). ${sansEmpreinte.length} écriture(s) plus ancienne(s) ne portent pas d'empreinte et n'ont pas pu être vérifiées.`
    : `${empreintesInvalides.length} écriture(s) modifiée(s) après enregistrement et ${chainonsRompus.length} maillon(s) rompu(s) sur ${signes} écriture(s) signée(s).`;

  return {
    total: encaissements.length,
    signes,
    sansEmpreinte,
    empreintesInvalides,
    chainonsRompus,
    conforme,
    resume: resumeTexte,
  };
}

/** Recalcule l'empreinte d'une écriture — utile pour un diagnostic ciblé. */
export async function empreinteAttendue(enc: EncaissementVerifiable): Promise<string> {
  return hashEncaissement(champsHash(enc));
}
