/**
 * POST /api/admin/rattacher-emails
 *
 * Croise les fiches familles SANS adresse email avec un export CSV de
 * l'ancien logiciel (liste des cavaliers, colonnes Nom / Prénom / E-mail /
 * responsable / E-mail tuteur), et propose une adresse par fiche.
 *
 * Pourquoi : à l'ouverture, 143 fiches avaient des cavaliers mais aucune
 * adresse — donc aucun moyen de recevoir le mail de pré-inscription, et la
 * certitude de fabriquer des comptes orphelins. Les adresses existaient
 * pourtant, dans l'export de l'ancien système. Recopier 143 adresses à la
 * main d'un fichier vers des fiches, c'est l'assurance d'au moins une erreur.
 *
 * Deux actions :
 *   { action: "proposer", csv: "<contenu du fichier>" }
 *     → pour chaque fiche sans adresse, les adresses candidates trouvées par
 *       le nom des ENFANTS d'abord (le plus fiable : l'export est une liste
 *       de cavaliers), puis par le nom du parent. Chaque proposition dit d'où
 *       elle vient. Les ambiguïtés sont rendues comme telles, jamais tranchées.
 *   { action: "appliquer", familyId, email }
 *     → écrit l'adresse sur la fiche, UNIQUEMENT si elle n'a toujours pas
 *       d'adresse valide (jamais d'écrasement), avec trace de la source.
 *
 * L'application reste un geste unitaire et explicite de l'admin : la route ne
 * rattache jamais en masse — une adresse posée sur la mauvaise famille
 * enverrait les codes d'accès chez le voisin.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { emailValide } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nom comparable : sans accents, sans casse, lettres seules. */
function cle(valeur: unknown): string {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** "Léa Du Pont" → clés de tokens triées, pour comparer des noms complets. */
function cleNomComplet(...parties: unknown[]): string {
  return parties
    .flatMap((p) => String(p ?? "").split(/[\s\-']+/))
    .map(cle)
    .filter(Boolean)
    .sort()
    .join("|");
}

interface LigneCsv {
  nom: string;
  prenom: string;
  email: string;
  emailTuteur: string;
  nomResponsable: string;
  prenomResponsable: string;
}

/**
 * Lecture CSV minimale mais correcte sur les champs entre guillemets
 * (l'export contient des virgules dans les adresses postales).
 */
function lireCsv(texte: string): LigneCsv[] {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return [];

  const parse = (ligne: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let dans = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (dans) {
        if (c === '"' && ligne[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') dans = false;
        else cur += c;
      } else if (c === '"') dans = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };

  const entetes = parse(lignes[0]).map((h) => cle(h));
  const idx = (nom: string) => entetes.findIndex((h) => h === cle(nom));
  const iNom = idx("Nom"), iPrenom = idx("Prénom"), iEmail = idx("E-mail");
  const iEmailTuteur = idx("E-mail tuteur");
  const iNomResp = idx("Nom du responsable"), iPrenomResp = idx("Prénom du responsable");
  if (iNom < 0 || iPrenom < 0 || iEmail < 0) return [];

  const net = (v?: string) => (v || "").trim();
  const netEmail = (v?: string) => {
    const e = net(v).toLowerCase();
    return emailValide(e) ? e : "";
  };

  return lignes.slice(1).map(parse).map((c) => ({
    nom: net(c[iNom]),
    prenom: net(c[iPrenom]),
    email: netEmail(c[iEmail]),
    emailTuteur: iEmailTuteur >= 0 ? netEmail(c[iEmailTuteur]) : "",
    nomResponsable: iNomResp >= 0 ? net(c[iNomResp]) : "",
    prenomResponsable: iPrenomResp >= 0 ? net(c[iPrenomResp]) : "",
  })).filter((l) => l.nom && l.prenom && (l.email || l.emailTuteur));
}

interface Candidat {
  email: string;
  source: string;   // « cavalier Léa Durand (email tuteur) »
  fiabilite: "enfant" | "parent";
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    // ── Appliquer une adresse sur UNE fiche ──
    if (body.action === "appliquer") {
      const familyId = String(body.familyId || "");
      const email = String(body.email || "").trim().toLowerCase();
      if (!familyId || !emailValide(email)) {
        return NextResponse.json({ error: "Fiche ou adresse invalide" }, { status: 400 });
      }
      const ref = adminDb.collection("families").doc(familyId);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
      const f = snap.data() as any;
      // Jamais d'écrasement : si une adresse valide est apparue entre-temps
      // (saisie au comptoir, autre onglet), on s'arrête et on le dit.
      if (emailValide(String(f.parentEmail || "").trim())) {
        return NextResponse.json(
          { error: `Cette fiche a déjà une adresse (${f.parentEmail}) — rien n'a été modifié` },
          { status: 409 },
        );
      }
      await ref.update({
        parentEmail: email,
        emailRattacheLe: FieldValue.serverTimestamp(),
        emailRattacheSource: "export-csv-ancien-logiciel",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    // ── Proposer : croiser le CSV avec les fiches sans adresse ──
    const csv = String(body.csv || "");
    if (!csv.trim()) return NextResponse.json({ error: "Fichier CSV vide" }, { status: 400 });
    const lignes = lireCsv(csv);
    if (lignes.length === 0) {
      return NextResponse.json(
        { error: "Aucune ligne exploitable — vérifie que c'est bien l'export « Liste cavaliers » avec les colonnes Nom / Prénom / E-mail" },
        { status: 400 },
      );
    }

    // Index par nom complet : cavaliers, et responsables (tuteurs).
    const parCavalier = new Map<string, LigneCsv[]>();
    const parResponsable = new Map<string, LigneCsv[]>();
    for (const l of lignes) {
      const k = cleNomComplet(l.nom, l.prenom);
      if (k) (parCavalier.get(k) || parCavalier.set(k, []).get(k)!).push(l);
      const kr = cleNomComplet(l.nomResponsable, l.prenomResponsable);
      if (kr) (parResponsable.get(kr) || parResponsable.set(kr, []).get(kr)!).push(l);
    }

    const famSnap = await adminDb.collection("families").get();
    const propositions: any[] = [];
    let nbSansAdresse = 0;

    for (const d of famSnap.docs) {
      const f = d.data() as any;
      if (f.status === "merged") continue;
      const enfants: any[] = Array.isArray(f.children) ? f.children : [];
      if (enfants.length === 0) continue;
      if (emailValide(String(f.parentEmail || "").trim())) continue;
      nbSansAdresse++;

      // Adresse préférée d'une ligne : celle du tuteur (c'est l'adresse de la
      // famille), sinon celle du cavalier lui-même (cavalier adulte).
      const emailDe = (l: LigneCsv) => l.emailTuteur || l.email;

      const candidats = new Map<string, Candidat>();
      const ajouter = (email: string, source: string, fiabilite: Candidat["fiabilite"]) => {
        if (!email || candidats.has(email)) return;
        candidats.set(email, { email, source, fiabilite });
      };

      // 1. Par les enfants de la fiche — le chemin le plus sûr.
      for (const e of enfants) {
        const nomEnfant = cleNomComplet(e.lastName || f.lastName || "", e.firstName || "");
        if (!nomEnfant) continue;
        for (const l of parCavalier.get(nomEnfant) || []) {
          ajouter(
            emailDe(l),
            `cavalier ${l.prenom} ${l.nom}${l.emailTuteur ? " (adresse du tuteur)" : ""}`,
            "enfant",
          );
        }
      }
      // 2. Par le nom du parent — responsable dans le CSV, ou cavalier adulte.
      const nomParent = cleNomComplet(f.parentName || "");
      if (nomParent) {
        for (const l of parResponsable.get(nomParent) || []) {
          ajouter(emailDe(l), `responsable de ${l.prenom} ${l.nom}`, "parent");
        }
        for (const l of parCavalier.get(nomParent) || []) {
          ajouter(l.email || l.emailTuteur, `cavalier ${l.prenom} ${l.nom} (lui-même)`, "parent");
        }
      }

      const liste = [...candidats.values()]
        .sort((a, b) => (a.fiabilite === b.fiabilite ? 0 : a.fiabilite === "enfant" ? -1 : 1));
      propositions.push({
        familyId: d.id,
        parentName: f.parentName || "",
        parentPhone: f.parentPhone || "",
        enfants: enfants.map((e: any) => `${e.firstName || ""} ${e.lastName || f.lastName || ""}`.trim()),
        candidats: liste.slice(0, 4),
        // Une seule adresse trouvée = proposition nette. Plusieurs = à trancher.
        ambigu: liste.length > 1,
      });
    }

    propositions.sort((a, b) => {
      // Les fiches avec une proposition nette d'abord, puis les ambiguës,
      // puis les introuvables — l'ordre de travail naturel.
      const rang = (p: any) => (p.candidats.length === 1 ? 0 : p.candidats.length > 1 ? 1 : 2);
      return rang(a) - rang(b) || a.parentName.localeCompare(b.parentName, "fr");
    });

    return NextResponse.json({
      nbSansAdresse,
      nbLignesCsv: lignes.length,
      trouvees: propositions.filter((p) => p.candidats.length > 0).length,
      propositions,
    });
  } catch (e) {
    console.error("[rattacher-emails]", e);
    return NextResponse.json({ error: "Erreur lors du rapprochement" }, { status: 500 });
  }
}
