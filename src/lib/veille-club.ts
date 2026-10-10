/**
 * src/lib/veille-club.ts — la veille du club, chaque matin.
 *
 * Nicolas a vu passer l'annonce des « dots » d'OpenAI (des agents qui
 * surveillent en continu et prennent l'initiative) et a voulu la même chose,
 * chez lui et sous son contrôle : un passage quotidien sur tout le logiciel
 * qui signale ce qui risque de se perdre, avant qu'une famille appelle.
 * Septembre 2026 a montré le besoin : un créneau fantôme débité sur une
 * carte, des prélèvements introuvables, quinze commandes à 0 € réglé, un
 * forfait en double… chacun découvert par hasard.
 *
 * Ce module CONSTATE seulement : il ne modifie rien, n'encaisse rien,
 * n'envoie rien. La route /api/cron/veille-club lit les collections et
 * envoie le récapitulatif ; l'écran /admin/veille affiche la même liste.
 *
 * Fonction pure : toutes les données arrivent en paramètre, la date du
 * jour (heure de Paris) aussi — c'est ce qui la rend testable.
 */

import { analyserCoherence } from "@/lib/coherence";
import { listerImpayes, duMaintenant } from "@/app/admin/paiements/impayes-utils";
import { statutPaiementCavalier } from "@/app/admin/planning/types";
import { avecAvancementSepa } from "@/app/admin/planning/sepa-avancement";
import { prixForfaitDepuisCommandes } from "@/lib/forfaits";

export type NiveauVeille = "rouge" | "orange" | "jaune" | "bleu" | "gris";

export interface PointVeille {
  /** Numéro dans la liste validée par Nicolas (1 à 18). */
  numero: number;
  code: string;
  niveau: NiveauVeille;
  titre: string;
  /** Nombre de cas. */
  nb: number;
  /** Les cas, du plus important au moins important (tous : l'affichage coupe). */
  lignes: string[];
  /** Écran où le traiter. */
  lien: string;
}

export interface DonneesVeille {
  /** Date du jour, heure de Paris : « AAAA-MM-JJ ». */
  aujourdhui: string;
  /** Instant de l'analyse (délais en heures). */
  maintenant: Date;
  paiements: any[];
  echeancesSepa: any[];
  encaissements: any[];
  creneaux: any[];
  reservations: any[];
  cartes: any[];
  forfaits: any[];
  familles: any[];
  chequesDifferes: any[];
  listeAttente: any[];
  messagesContact: any[];
  avis: any[];
  cloturesJournalieres: any[];
}

export const LIBELLES_NIVEAU: Record<NiveauVeille, string> = {
  rouge: "Argent : ce qui risque de se perdre",
  orange: "Planning et montoir",
  jaune: "Cartes et forfaits",
  bleu: "Communication",
  gris: "Comptabilité et obligations",
};

// ── Petits outils de dates (chaînes « AAAA-MM-JJ », pas d'heure serveur) ──
export function decalerJours(iso: string, n: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n, 12));
  return d.toISOString().slice(0, 10);
}
const jourSemaine = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const dateFr = (iso?: string) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "?");
const eur = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",")} €`;
const secondes = (t: any): number => Number(t?.seconds ?? t?._seconds ?? (t instanceof Date ? t.getTime() / 1000 : 0)) || 0;
/** Date Paris « AAAA-MM-JJ » d'un horodatage Firestore. */
export function jourParis(t: any): string {
  const s = secondes(t);
  if (!s) return "";
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s * 1000));
}

const vivant = (p: any) => p?.status !== "cancelled";
const point = (numero: number, code: string, niveau: NiveauVeille, titre: string, lignes: string[], lien: string): PointVeille =>
  ({ numero, code, niveau, titre, nb: lignes.length, lignes, lien });

export function analyserVeille(d: DonneesVeille): PointVeille[] {
  const J = d.aujourdhui;
  const points: PointVeille[] = [];
  const paiements = d.paiements || [];
  const ech = d.echeancesSepa || [];

  // ── 🔴 1. Prélèvements SEPA dont la date est passée, jamais mis en remise ──
  const nonRemis = ech.filter(e => e?.status === "pending" && e?.dateEcheance && e.dateEcheance < J)
    .sort((a, b) => String(a.dateEcheance).localeCompare(String(b.dateEcheance)));
  points.push(point(1, "sepa-non-remis", "rouge",
    "Prélèvements SEPA à date passée, jamais remis en banque (ils ne seront pas prélevés)",
    nonRemis.map(e => `${e.familyName || "Famille"} — ${eur(e.montant)}, prévu le ${dateFr(e.dateEcheance)}`),
    "/admin/sepa?tab=echeancier"));

  // ── 🔴 1 bis. « Prélèvement SEPA » encaissé à la main, sans échéance ──
  // Octobre 2026 : choisi dans l'onglet Encaisser, le mode SEPA écrivait un
  // encaissement immédiat (facture « réglée ») sans aucune échéance : rien
  // n'était jamais prélevé (DUHEM, 650 €). Un vrai prélèvement porte
  // `sepaEcheanceId`. Une écriture annulée par contre-passation ne compte plus.
  const encs = d.encaissements || [];
  const annules = new Set(encs.map(e => e?.correctionDe).filter(Boolean));
  const sepaSansEcheance = encs.filter(e => (e?.mode === "prelevement_sepa" || e?.mode === "sepa")
    && Number(e?.montant) > 0 && !e?.sepaEcheanceId && !e?.correctionDe && !annules.has(e?.id)
    // Le lien à l'échéance existe depuis le 08/09/2026 : avant, un vrai
    // prélèvement ne le portait pas encore.
    && jourParis(e?.date) >= "2026-09-09");
  points.push(point(1, "sepa-encaisse-sans-echeance", "rouge",
    "« Prélèvement SEPA » enregistré comme encaissé sans échéance : l'argent ne sera jamais prélevé",
    sepaSansEcheance.map(e => `${e.familyName || "Famille"} — ${eur(e.montant)}, saisi le ${dateFr(jourParis(e.date))} : annulez l'écriture au Journal, puis programmez le prélèvement (Impayés → Encaisser → SEPA)`),
    "/admin/paiements?tab=journal"));

  // ── 🔴 2. Remise SEPA à préparer dans les 5 jours ──
  const aRemettre = ech.filter(e => e?.status === "pending" && e?.dateEcheance >= J && e.dateEcheance <= decalerJours(J, 5));
  if (aRemettre.length) {
    const total = aRemettre.reduce((s, e) => s + (Number(e.montant) || 0), 0);
    const parDate = new Map<string, number>();
    for (const e of aRemettre) parDate.set(e.dateEcheance, (parDate.get(e.dateEcheance) || 0) + 1);
    points.push(point(2, "sepa-a-remettre", "rouge",
      `Remise SEPA à préparer : ${aRemettre.length} prélèvement(s) dans les 5 jours, ${eur(total)}`,
      [...parDate.entries()].sort().map(([date, n]) => `${n} prélèvement(s) le ${dateFr(date)}`),
      "/admin/sepa?tab=echeancier"));
  }

  // ── 🔴 3. Pré-notifications SEPA à vérifier, pas encore envoyées ──
  points.push(point(3, "prenotification-a-verifier", "rouge",
    "Pré-notifications SEPA à vérifier puis envoyer aux familles",
    paiements.filter(p => vivant(p) && p.prenotificationSepa === "a_verifier").map(p => `${p.familyName || "Famille"} — ${eur(p.totalTTC)}`),
    "/admin/sepa"));

  // ── 🔴 4. Impayés qui vieillissent (plus de 7 jours) ──
  const limite = decalerJours(J, -7);
  const vieux = listerImpayes(paiements, J)
    .filter(p => { const jour = jourParis(p.date); return jour && jour < limite; })
    .sort((a, b) => duMaintenant(b) - duMaintenant(a));
  points.push(point(4, "impayes-anciens", "rouge",
    "Impayés de plus de 7 jours",
    vieux.map(p => `${p.familyName || "Famille"} — ${eur(duMaintenant(p))} (${(p.items || []).map((i: any) => i.activityTitle).filter(Boolean).slice(0, 2).join(", ") || "commande"}, ${dateFr(jourParis(p.date))})`),
    "/admin/paiements?tab=impayes"));

  // ── 🔴 5. Écarts de cohérence bloquants (journal, SEPA, factures) ──
  const anomalies = analyserCoherence({
    paiements, creneaux: d.creneaux || [], reservations: d.reservations || [], encaissements: d.encaissements || [],
    echeancesSepa: ech, cartes: d.cartes || [], familles: d.familles || [], maintenant: d.maintenant,
  }).filter(a => a.gravite === "bloquant");
  points.push(point(5, "coherence", "rouge",
    "Écarts à corriger dans l'onglet Cohérence",
    anomalies.map(a => a.detail),
    "/admin/coherence"));

  // ── 🔴 6. Chèques différés à déposer (échus ou dans les 3 jours) ──
  const cheques = (d.chequesDifferes || [])
    .filter(c => c?.status === "pending" && c?.dateEncaissementPrevue && c.dateEncaissementPrevue <= decalerJours(J, 3))
    .sort((a, b) => String(a.dateEncaissementPrevue).localeCompare(String(b.dateEncaissementPrevue)));
  points.push(point(6, "cheques-a-deposer", "rouge",
    "Chèques différés à déposer",
    cheques.map(c => `${c.familyName || "Famille"} — ${eur(c.montant)}, ${c.dateEncaissementPrevue < J ? "échu depuis le" : "à déposer le"} ${dateFr(c.dateEncaissementPrevue)}${c.numero ? ` (n° ${c.numero})` : ""}`),
    "/admin/paiements?tab=cheques_differes"));

  const creneaux = d.creneaux || [];

  // ── 🟠 7. Reprises passées non clôturées au montoir (14 derniers jours) ──
  const nonClotures = creneaux
    .filter(c => c?.date && c.date < J && c.date >= decalerJours(J, -14) && c.status !== "closed" && (c.enrolled || []).length > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  points.push(point(7, "reprises-non-cloturees", "orange",
    "Reprises passées non clôturées au montoir (cartes non débitées, présences manquantes)",
    nonClotures.map(c => `${c.activityTitle} — ${dateFr(c.date)} ${c.startTime || ""} (${(c.enrolled || []).length} cavalier(s))`),
    "/admin/montoir"));

  // ── 🟠 8. Créneaux suspects : doublons, cours à un jour inhabituel ──
  const suspects: string[] = [];
  const aVenir = creneaux.filter(c => c?.date && c.date >= J && c.date <= decalerJours(J, 14));
  const vus = new Map<string, number>();
  for (const c of aVenir) {
    const cle = `${c.date}|${c.startTime}|${c.activityTitle}`;
    vus.set(cle, (vus.get(cle) || 0) + 1);
  }
  for (const [cle, n] of vus) if (n > 1) {
    const [date, heure, titre] = cle.split("|");
    suspects.push(`${titre} — ${dateFr(date)} ${heure} : ${n} créneaux identiques`);
  }
  // Un cours récurrent (≥ 3 fois le même jour de semaine) qui apparaît une
  // seule fois un autre jour : le cas du samedi recopié du vendredi.
  const joursParCours = new Map<string, Map<number, number>>();
  for (const c of creneaux) {
    if (!c?.date || !c.activityTitle) continue;
    const cle = `${c.activityTitle}|${c.startTime}`;
    if (!joursParCours.has(cle)) joursParCours.set(cle, new Map());
    const m = joursParCours.get(cle)!;
    m.set(jourSemaine(c.date), (m.get(jourSemaine(c.date)) || 0) + 1);
  }
  const NOMS_JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  for (const c of aVenir) {
    if (["stage", "stage_journee", "anniversaire", "evenement"].includes(c.activityType)) continue;
    const m = joursParCours.get(`${c.activityTitle}|${c.startTime}`);
    if (!m || m.get(jourSemaine(c.date)) !== 1) continue;
    const habituel = [...m.entries()].find(([jour, n]) => jour !== jourSemaine(c.date) && n >= 3);
    if (habituel) suspects.push(`${c.activityTitle} — ${dateFr(c.date)} ${c.startTime} : ce cours a lieu d'habitude le ${NOMS_JOURS[habituel[0]]}`);
  }
  points.push(point(8, "creneaux-suspects", "orange", "Créneaux suspects dans les 14 prochains jours (doublon ou copie par erreur ?)", suspects, "/admin/planning"));

  // ── 🟠 9. Cavaliers des 7 prochains jours sans aucun règlement ni carte ──
  const paiementsAvance = avecAvancementSepa(paiements, ech);
  const sansReglement: string[] = [];
  for (const c of creneaux.filter(c => c?.date && c.date >= J && c.date <= decalerJours(J, 7))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))) {
    for (const e of c.enrolled || []) {
      if (e?.preinscription) continue;
      if (statutPaiementCavalier(e, paiementsAvance, c).etat === "impaye") {
        sansReglement.push(`${e.childName || "Cavalier"} — ${c.activityTitle}, ${dateFr(c.date)} ${c.startTime || ""}`);
      }
    }
  }
  points.push(point(9, "inscrits-sans-reglement", "orange", "Cavaliers des 7 prochains jours sans règlement ni carte", sansReglement, "/admin/planning"));

  // ── 🟠 10. Places libres alors que la liste d'attente attend ──
  const attente = (d.listeAttente || []).filter(w => (w?.status || "waiting") === "waiting");
  const placesLibres: string[] = [];
  for (const c of creneaux.filter(c => c?.date && c.date >= J)) {
    const libres = (Number(c.maxPlaces) || 0) - (c.enrolled || []).length;
    if (libres <= 0 || c.waitlistHold) continue;
    const enAttente = attente.filter(w => w.creneauId === c.id).length;
    if (enAttente > 0) placesLibres.push(`${c.activityTitle} — ${dateFr(c.date)} ${c.startTime || ""} : ${libres} place(s) libre(s), ${enAttente} en attente`);
  }
  points.push(point(10, "places-liste-attente", "orange", "Places libérées alors que la liste d'attente attend", placesLibres, "/admin/planning"));

  // ── 🟡 11. Cartes presque épuisées ──
  points.push(point(11, "cartes-bientot-epuisees", "jaune",
    "Cartes de séances avec une seule séance restante (en proposer une nouvelle)",
    (d.cartes || []).filter(c => c?.status === "active" && Number(c.remainingSessions) === 1)
      .map(c => `${c.familiale ? `${c.familyName} (carte familiale)` : c.childName || c.familyName || "Cavalier"} — ${c.totalSessions || "?"} séances, 1 restante`),
    "/admin/cartes"));

  // ── 🟡 12. Forfaits en double, ou dont le prix ne suit pas les commandes ──
  const forfaitsActifs = (d.forfaits || []).filter(f => f && f.status !== "cancelled" && f.status !== "resilie");
  const forfaitsSouci: string[] = [];
  const groupes = new Map<string, any[]>();
  for (const f of forfaitsActifs) {
    const cle = `${f.childId}|${f.slotKey}|${f.seasonStartYear ?? ""}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(f);
  }
  for (const liste of groupes.values()) if (liste.length > 1) {
    forfaitsSouci.push(`${liste[0].childName} — ${liste.length} fiches actives pour ${liste[0].slotKey || liste[0].activityTitle}`);
  }
  for (const f of forfaitsActifs) {
    const prix = prixForfaitDepuisCommandes(paiements, f);
    if (prix !== null && Math.abs(prix - (Number(f.forfaitPriceTTC) || 0)) >= 0.01) {
      forfaitsSouci.push(`${f.childName} — fiche à ${eur(f.forfaitPriceTTC)}, commandes à ${eur(prix)}`);
    }
  }
  points.push(point(12, "forfaits-doublon-prix", "jaune", "Forfaits en double ou au mauvais prix", forfaitsSouci, "/admin/forfaits"));

  // ── 🟡 13. Forfaits sans commande, commandes SEPA sans échéancier ──
  const sansCommande: string[] = [];
  for (const f of forfaitsActifs) {
    if (f.complement) continue;
    if (prixForfaitDepuisCommandes(paiements, f) === null) sansCommande.push(`${f.childName} — forfait ${f.slotKey || f.activityTitle} sans commande`);
  }
  for (const p of paiements.filter(p => p?.status === "sepa_scheduled")) {
    const liees = ech.filter(e => (e.paymentId && e.paymentId === p.id) || (!e.paymentId && p.orderId && e.orderId === p.orderId));
    if (!liees.some(e => e.status === "pending" || e.status === "remis")) {
      sansCommande.push(`${p.familyName || "Famille"} — commande « SEPA » à ${eur(p.totalTTC)} sans prélèvement à venir : Prélèvements SEPA → « Remettre dans les impayés »`);
    }
  }
  points.push(point(13, "forfaits-sans-commande", "jaune", "Forfaits sans commande, ou commandes SEPA sans échéancier", sansCommande, "/admin/forfaits"));

  // ── 🔵 14. Emails rejetés (adresse fausse, boîte pleine) ──
  points.push(point(14, "emails-rejetes", "bleu",
    "Emails non remis aux familles",
    paiements.filter(p => vivant(p) && p.alerteEmail).map(p => `${p.familyName || "Famille"} — ${p.alerteEmail.to || "?"} (${p.alerteEmail.raison || p.alerteEmail.statut || "rejeté"})`),
    "/admin/paiements?tab=impayes"));

  // ── 🔵 15. Messages du formulaire de contact sans suite depuis 48 h ──
  const seuil48h = d.maintenant.getTime() / 1000 - 48 * 3600;
  points.push(point(15, "messages-sans-reponse", "bleu",
    "Messages du site sans suite depuis plus de 48 h",
    (d.messagesContact || []).filter(m => !m?.traite && secondes(m?.createdAt) && secondes(m.createdAt) < seuil48h)
      .map(m => `${[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "?"} — « ${String(m.subject || m.message || "").slice(0, 60)} » (${dateFr(jourParis(m.createdAt))})`),
    "/admin/messages-contact"));

  // ── 🔵 16. Avis de satisfaction négatifs sans réponse ──
  points.push(point(16, "avis-negatifs", "bleu",
    "Avis de satisfaction mitigés ou négatifs, sans réponse",
    (d.avis || []).filter(a => typeof a?.globalNote === "number" && a.globalNote <= 3 && !a.reponse && !a.reponseAt)
      .map(a => `${a.familyName || a.parentName || "Famille"} — ${a.globalNote}/5${a.stageLabel || a.activityTitle ? `, ${a.stageLabel || a.activityTitle}` : ""}`),
    "/admin/satisfaction"));

  // ── ⚪ 17. Clôture journalière (ticket Z) oubliée hier ──
  const hier = decalerJours(J, -1);
  const encaisseHier = (d.encaissements || []).some(e => jourParis(e?.date) === hier);
  const clotureHier = (d.cloturesJournalieres || []).some(c => c?.date === hier);
  if (encaisseHier && !clotureHier) {
    points.push(point(17, "cloture-z-oubliee", "gris",
      "Clôture journalière (ticket Z) d'hier non faite",
      [`Des encaissements ont été saisis le ${dateFr(hier)} mais la journée n'est pas clôturée.`],
      "/admin/comptabilite/cloture-journaliere"));
  }

  // ── ⚪ 18. Échéances : déclaration de TVA du trimestre écoulé ──
  const [, mois, jour] = J.split("-").map(Number);
  if ([1, 4, 7, 10].includes(mois) && jour <= 15) {
    points.push(point(18, "tva-trimestre", "gris",
      "Déclaration de TVA du trimestre écoulé à préparer",
      ["Préparer la déclaration dans Comptabilité (encart TVA du trimestre), à valider avec le cabinet."],
      "/admin/comptabilite"));
  }

  return points.filter(p => p.nb > 0);
}

/** Le récapitulatif du matin, en HTML d'email (liens absolus vers l'admin). */
export function htmlVeille(points: PointVeille[], appUrl: string, dateLisible: string, maxLignes = 8): string {
  const couleurs: Record<NiveauVeille, string> = { rouge: "#b91c1c", orange: "#c2410c", jaune: "#a16207", bleu: "#1d4ed8", gris: "#475569" };
  const echap = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = (Object.keys(LIBELLES_NIVEAU) as NiveauVeille[]).map((niveau) => {
    const pts = points.filter(p => p.niveau === niveau);
    if (!pts.length) return "";
    const blocs = pts.map(p => {
      const lignes = p.lignes.slice(0, maxLignes).map(l => `<li style="margin:2px 0;">${echap(l)}</li>`).join("");
      const reste = p.lignes.length > maxLignes ? `<li style="margin:2px 0;color:#6b7280;">… et ${p.lignes.length - maxLignes} autre(s)</li>` : "";
      return `<div style="margin:0 0 14px;padding:10px 12px;border-left:4px solid ${couleurs[niveau]};background:#f9fafb;border-radius:6px;">
        <div style="font-weight:600;color:${couleurs[niveau]};">${p.numero}. ${echap(p.titre)} <span style="color:#6b7280;font-weight:400;">(${p.nb})</span></div>
        <ul style="margin:6px 0 8px;padding-left:18px;font-size:13px;color:#374151;">${lignes}${reste}</ul>
        <a href="${appUrl}${p.lien}" style="font-size:12px;color:#fff;background:#1e3a5f;padding:5px 10px;border-radius:6px;text-decoration:none;">Ouvrir</a>
      </div>`;
    }).join("");
    return `<h3 style="font-size:14px;color:${couleurs[niveau]};margin:18px 0 8px;">${LIBELLES_NIVEAU[niveau]}</h3>${blocs}`;
  }).join("");
  return `<div style="font-family:sans-serif;max-width:620px;color:#111827;">
    <h2 style="color:#1e3a5f;margin-bottom:4px;">Veille du club — ${echap(dateLisible)}</h2>
    <p style="margin-top:0;color:#4b5563;">${points.length} point(s) à regarder ce matin. Rien n'a été modifié : chaque bouton ouvre l'écran où agir.</p>
    ${sections}
    <p style="margin-top:18px;"><a href="${appUrl}/admin/veille" style="color:#1e3a5f;">Voir la veille dans l'admin</a></p>
    <p style="color:#9ca3af;font-size:11px;margin-top:10px;">Envoyé chaque jour à 7 h 30, seulement s'il y a quelque chose à signaler.</p>
  </div>`;
}
