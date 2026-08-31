/**
 * Confirmations de stage — une seule lettre par famille
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le panneau d'inscription du planning envoyait sa confirmation stage par
 * stage. Inscrire cinq enfants répartis sur trois stages — deux ici, deux là,
 * une ailleurs — c'est trois passages dans le panneau, donc trois emails
 * quasi identiques dans la même minute, alors que la famille n'a fait qu'une
 * inscription et ne reçoit qu'un seul lien de paiement (l'acompte de la
 * commande, 30 € par enfant).
 *
 * Les confirmations sont donc mises en attente ici, dans un document par
 * famille, et partent réunies :
 *
 *   - chaque inscription de stage pousse son bloc dans `stage_confirmations`
 *     (un document par famille, l'identifiant EST le familyId) ;
 *   - l'envoi est repoussé de DELAI_MINUTES à chaque nouveau stage, sans
 *     jamais dépasser FENETRE_MAX_MINUTES après le premier — sinon une
 *     famille inscrite toute la matinée n'aurait jamais sa confirmation ;
 *   - le cron `/api/cron/confirmations-stage` (toutes les 5 minutes) envoie
 *     ce qui est arrivé à échéance ; l'écran d'inscription propose aussi
 *     « Envoyer maintenant », qui force l'envoi sans attendre.
 *
 * Le gabarit employé est `confirmationStages` : un panneau par stage, un
 * total unique, et un message qui parle de place retenue tant que rien n'est
 * encaissé — depuis l'administration on inscrit d'abord, la commande part aux
 * impayés, le lien de paiement suit.
 *
 * Le document n'est jamais supprimé : il porte le statut de l'envoi, ce qui
 * permet de savoir depuis l'administration ce qui est parti et quand.
 */

import { adminDb } from "@/lib/firebase-admin";
import { emailTemplates } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { renderDerouleStage } from "@/lib/stage-deroule";
import { dateEcheanceSolde } from "@/lib/email-prestations";

export const COLLECTION_CONFIRMATIONS = "stage_confirmations";

/** Délai d'attente après chaque inscription, pour laisser venir les suivantes. */
export const DELAI_MINUTES = 5;
/** Au-delà, on n'attend plus : la famille a droit à sa confirmation. */
export const FENETRE_MAX_MINUTES = 30;
/** Trois échecs d'envoi consécutifs : on arrête de réessayer, l'admin reprend la main. */
const MAX_TENTATIVES = 3;

export interface StageEnAttente {
  /** Identifiant stable du stage (titre + premier jour) — sert à ne pas empiler deux fois le même. */
  stageKey: string;
  stageTitle: string;
  /** Libellé lisible des jours, tel qu'affiché dans l'email. */
  dates: string;
  /** Premier jour du stage (YYYY-MM-DD) — échéance du solde. */
  dateDebut: string;
  creneauId?: string;
  enfants: { name: string; prix: number; remise: number }[];
  /** Montant réclamé tout de suite : l'acompte du stage, ou son prix entier s'il n'y a pas d'acompte. */
  aRegler: number;
  /** Reste à régler avant le stage. 0 quand tout est demandé maintenant. */
  solde: number;
}

export interface PayloadConfirmation {
  familyId: string;
  familyName: string;
  email: string;
  /** Commande à laquelle ces lignes ont été rattachées — pour le journal des emails. */
  paymentId?: string;
  /** L'acompte part dans un lien de paiement séparé (l'email ne porte pas de bouton). */
  lienSepare?: boolean;
  stage: StageEnAttente;
}

interface FileConfirmation {
  familyId: string;
  familyName: string;
  email: string;
  paymentId?: string;
  lienSepare?: boolean;
  stages: StageEnAttente[];
  status: "pending" | "sending" | "sent" | "failed";
  premierAjoutA: string;
  envoiPrevuA: string;
  majA: string;
  tentatives?: number;
  derniereErreur?: string;
  envoyeA?: string;
  envoyePar?: string;
  sujet?: string;
}

const iso = (ms: number) => new Date(ms).toISOString();
const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Met une inscription de stage en attente d'envoi groupé.
 * Retourne l'état de la file pour la famille (nombre de stages, échéance).
 */
export async function enfilerConfirmationStage(
  payload: PayloadConfirmation,
): Promise<{ nbStages: number; envoiPrevuA: string }> {
  const ref = adminDb.collection(COLLECTION_CONFIRMATIONS).doc(payload.familyId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const maintenant = Date.now();
    const actuel = snap.exists ? (snap.data() as FileConfirmation) : null;
    // Une file déjà envoyée (ou en échec) ne se rouvre pas : la nouvelle
    // inscription démarre sa propre fenêtre.
    const enCours = !!actuel && actuel.status === "pending";

    const premier = enCours ? Date.parse(actuel!.premierAjoutA) || maintenant : maintenant;
    const envoiPrevuA = iso(Math.min(
      maintenant + DELAI_MINUTES * 60_000,
      premier + FENETRE_MAX_MINUTES * 60_000,
    ));

    // Ré-inscrire le même stage (correction d'un oubli, enfant ajouté) remplace
    // le bloc précédent au lieu de le doubler dans l'email.
    const stages = (enCours ? actuel!.stages || [] : [])
      .filter((s) => s.stageKey !== payload.stage.stageKey);
    stages.push(payload.stage);

    const doc: FileConfirmation = {
      familyId: payload.familyId,
      familyName: payload.familyName || (enCours ? actuel!.familyName : "") || "",
      email: payload.email,
      ...(payload.paymentId ? { paymentId: payload.paymentId } : {}),
      lienSepare: !!payload.lienSepare || (enCours ? !!actuel!.lienSepare : false),
      stages,
      status: "pending",
      premierAjoutA: iso(premier),
      envoiPrevuA,
      majA: iso(maintenant),
      tentatives: 0,
    };
    tx.set(ref, doc);
    return { nbStages: stages.length, envoiPrevuA };
  });
}

/** Files en attente, la plus urgente d'abord. */
export async function listerConfirmationsEnAttente(): Promise<Array<FileConfirmation & { id: string }>> {
  const snap = await adminDb
    .collection(COLLECTION_CONFIRMATIONS)
    .where("status", "==", "pending")
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as FileConfirmation) }))
    .sort((a, b) => (a.envoiPrevuA || "").localeCompare(b.envoiPrevuA || ""));
}

/** Abandonne la confirmation en attente d'une famille (aucun email ne partira). */
export async function annulerConfirmation(familyId: string): Promise<boolean> {
  const ref = adminDb.collection(COLLECTION_CONFIRMATIONS).doc(familyId);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as FileConfirmation).status !== "pending") return false;
  await ref.delete();
  return true;
}

/** Bloc « déroulé du stage », commun à tous les chemins d'envoi. Vide si non renseigné. */
async function derouleHtml(): Promise<string> {
  try {
    const snap = await adminDb.collection("settings").doc("stageDeroule").get();
    return renderDerouleStage(snap.exists ? (snap.data() as any) : null);
  } catch {
    return ""; // un réglage illisible n'empêche pas la confirmation de partir
  }
}

/**
 * Ce que la commande a réellement encaissé.
 *
 * Relu au moment de l'envoi, pas à l'inscription : entre les deux, la famille
 * a pu régler le lien d'acompte. Une lettre qui réclame un paiement déjà reçu
 * est pire que pas de lettre du tout.
 */
async function dejaRegle(paymentId?: string): Promise<number> {
  if (!paymentId) return 0;
  try {
    const snap = await adminDb.collection("payments").doc(paymentId).get();
    if (!snap.exists) return 0;
    return Number((snap.data() as any)?.paidAmount) || 0;
  } catch {
    return 0;
  }
}

/**
 * Compose la lettre à partir des stages en attente.
 *
 * Les montants sont ceux calculés à l'inscription, additionnés stage par
 * stage : `aRegler` porte l'acompte quand il y en a un, le prix entier sinon.
 * C'est ce qui permet au message de dire « à régler » sans jamais annoncer
 * une inscription confirmée que rien n'a payée.
 */
async function construireEmail(f: FileConfirmation): Promise<{ subject: string; html: string; template: string }> {
  const stages = f.stages || [];
  const totalTTC = arrondi(stages.reduce(
    (s, st) => s + st.enfants.reduce((n, e) => n + (e.prix || 0), 0), 0,
  ));
  const aRegler = arrondi(stages.reduce((s, st) => s + (st.aRegler || 0), 0));
  const solde = arrondi(stages.reduce((s, st) => s + (st.solde || 0), 0));
  // Le solde est réclamé 7 jours avant le stage : c'est le PREMIER qui commande.
  const premierJour = stages
    .filter((s) => (s.solde || 0) > 0)
    .map((s) => s.dateDebut)
    .filter(Boolean)
    .sort()[0] || stages.map((s) => s.dateDebut).filter(Boolean).sort()[0] || "";

  // Ce qui a déjà été encaissé vient en déduction de ce qu'on réclame : entre
  // l'inscription et l'envoi, la famille a pu régler l'acompte en ligne.
  const regle = Math.min(await dejaRegle(f.paymentId), totalTTC);
  const resteARegler = arrondi(Math.max(0, aRegler - regle));

  const { subject, html } = emailTemplates.confirmationStages({
    parentName: f.familyName || "",
    stages: stages.map((s) => ({ stageTitle: s.stageTitle, dates: s.dates, enfants: s.enfants })),
    totalTTC,
    aRegler: resteARegler,
    solde,
    dejaRegle: regle,
    lienSepare: !!f.lienSepare,
    dateSolde: solde > 0 ? dateEcheanceSolde(premierJour) : undefined,
    derouleHtml: await derouleHtml(),
  });
  return { subject, html, template: "confirmationStages" };
}

export interface ResultatEnvoi {
  sent: boolean;
  reason?: string;
  familyId: string;
  nbStages?: number;
  to?: string;
  subject?: string;
}

/**
 * Envoie la confirmation d'une famille.
 *
 * `force` court-circuite l'attente (bouton « Envoyer maintenant »). Sans lui,
 * une file dont l'échéance n'est pas atteinte est laissée tranquille : c'est
 * ce qui permet au cron de tourner toutes les 5 minutes sans couper le
 * regroupement en cours.
 */
export async function envoyerConfirmationFamille(
  familyId: string,
  opts: { force?: boolean; declenchePar?: string } = {},
): Promise<ResultatEnvoi> {
  const ref = adminDb.collection(COLLECTION_CONFIRMATIONS).doc(familyId);

  // Réservation de la file : deux appels simultanés (cron + clic admin) ne
  // doivent pas produire deux emails.
  const file = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data() as FileConfirmation;
    if (d.status !== "pending") return null;
    if (!(d.stages || []).length) return null;
    if (!opts.force && (Date.parse(d.envoiPrevuA) || 0) > Date.now()) return null;
    tx.update(ref, { status: "sending", majA: new Date().toISOString() });
    return d;
  });

  if (!file) return { sent: false, reason: "rien à envoyer", familyId };

  const echec = async (raison: string, definitif = false) => {
    const tentatives = (file.tentatives || 0) + 1;
    await ref.update({
      status: definitif || tentatives >= MAX_TENTATIVES ? "failed" : "pending",
      tentatives,
      derniereErreur: raison.slice(0, 500),
      majA: new Date().toISOString(),
    }).catch(() => {});
    return { sent: false, reason: raison, familyId };
  };

  try {
    if (!file.email) return await echec("famille sans adresse email", true);

    const { subject, html, template } = await construireEmail(file);
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
    const contexte = "confirmation_stage_groupee";
    const sentBy = opts.declenchePar || "system";

    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(file.email)) {
      const raison = resendKey
        ? "Mode restreint : destinataire non autorisé"
        : "RESEND_API_KEY absente";
      await logEmail({
        to: file.email, subject, context: contexte, template, status: "failed",
        error: raison, sentBy, familyId, ...(file.paymentId ? { paymentId: file.paymentId } : {}),
      });
      // Rien ne partira jamais dans ces conditions : inutile de réessayer.
      return await echec(raison, true);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: file.email,
        reply_to: REPLY_TO,
        ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
        subject,
        html,
      }),
    });

    const errText = res.ok ? "" : await res.text().catch(() => "");
    await logEmail({
      to: file.email, subject, context: contexte, template,
      status: res.ok ? "sent" : "failed",
      ...(res.ok ? {} : { error: `HTTP ${res.status}: ${errText}`.slice(0, 500) }),
      sentBy, familyId, ...(file.paymentId ? { paymentId: file.paymentId } : {}),
    });

    if (!res.ok) return await echec(`Resend HTTP ${res.status}: ${errText}`.slice(0, 500));

    await ref.update({
      status: "sent",
      envoyeA: new Date().toISOString(),
      envoyePar: sentBy,
      sujet: subject,
      majA: new Date().toISOString(),
      derniereErreur: "",
    });
    return { sent: true, familyId, nbStages: (file.stages || []).length, to: file.email, subject };
  } catch (e: any) {
    console.error("[stage-confirmations] envoi", e);
    return await echec(e?.message || String(e));
  }
}

/**
 * Remet en attente les envois restés « en cours ».
 *
 * Une file est marquée `sending` le temps de l'envoi, pour que le cron et le
 * bouton « Envoyer maintenant » ne produisent pas deux lettres. Si la fonction
 * est interrompue entre les deux (déploiement, temps d'exécution dépassé), le
 * marqueur resterait posé et la famille n'aurait jamais rien : au bout de dix
 * minutes, on considère l'envoi perdu et la file redevient à envoyer.
 */
async function libererEnvoisInterrompus(): Promise<void> {
  const limite = new Date(Date.now() - 10 * 60_000).toISOString();
  try {
    const snap = await adminDb
      .collection(COLLECTION_CONFIRMATIONS)
      .where("status", "==", "sending")
      .get();
    for (const d of snap.docs) {
      const f = d.data() as FileConfirmation;
      if ((f.majA || "") > limite) continue;
      await d.ref.update({ status: "pending", majA: new Date().toISOString() });
    }
  } catch (e) {
    console.error("[stage-confirmations] libération des envois interrompus", e);
  }
}

/**
 * Envoie toutes les confirmations arrivées à échéance (cron).
 *
 * L'échéance est comparée en mémoire plutôt que dans la requête : « statut
 * égal » + « date antérieure » réclamerait un index composite à déployer, pour
 * une collection qui ne compte au plus qu'un document par famille en attente.
 */
export async function envoyerConfirmationsDues(): Promise<ResultatEnvoi[]> {
  const maintenant = new Date().toISOString();
  await libererEnvoisInterrompus();
  const snap = await adminDb
    .collection(COLLECTION_CONFIRMATIONS)
    .where("status", "==", "pending")
    .get();

  const resultats: ResultatEnvoi[] = [];
  for (const d of snap.docs) {
    if (((d.data() as FileConfirmation).envoiPrevuA || "") > maintenant) continue;
    resultats.push(await envoyerConfirmationFamille(d.id));
  }
  return resultats;
}
