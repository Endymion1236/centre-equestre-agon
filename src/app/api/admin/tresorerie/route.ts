/**
 * GET  /api/admin/tresorerie — comptes suivis + tous les relevés de fin de mois.
 * POST /api/admin/tresorerie
 *   { action: "saisir", compte, mois: "AAAA-MM", montant: number | null }
 *       → pose (ou efface si null) le solde de fin de mois d'un compte.
 *   { action: "comptes", comptes: string[] }
 *       → la liste des comptes bancaires suivis (settings/tresorerie).
 *   { action: "importer", compte, releves: [{ mois, montant }] }
 *       → reprise d'historique (le classeur Excel 2018→2026). N'écrase JAMAIS
 *         un relevé déjà saisi : l'import complète, la saisie manuelle prime.
 *
 * Pourquoi côté serveur : même parti pris que messages-contact — la collection
 * est écrite et lue par adminDb, aucune règle Firestore à publier pour que
 * l'écran fonctionne. Un relevé de trésorerie n'est PAS une écriture comptable
 * (pas de journal NF525, pas de hash) : c'est un outil de pilotage, corrigible
 * à tout moment, comme l'était le classeur.
 *
 * Un document par (mois, compte) : `tresorerie-releves/{AAAA-MM}_{cléCompte}`.
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { POSTES_DEPENSES, POSTE_HORS_DEPENSES } from "@/lib/postes-depenses";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "Crédit Agricole — courant" → "credit-agricole-courant" (id de document stable). */
function cleCompte(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const COMPTE_DEFAUT = "Compte courant";

// `horsTotal` : les comptes qui existent mais ne comptent PAS dans la
// trésorerie affichée — typiquement l'épargne bloquée « en cas de coup dur »
// (le compte de dépôt fiscal à 30 000 €) : c'est une réserve, pas du
// disponible, et la mélanger au courant fausserait la lecture des saisons.
async function listeComptes(): Promise<{ comptes: string[]; horsTotal: string[] }> {
  const snap = await adminDb.collection("settings").doc("tresorerie").get();
  const d = snap.exists ? (snap.data() as any) : null;
  const comptes = Array.isArray(d?.comptes) && d.comptes.length > 0 ? d.comptes.map(String) : [COMPTE_DEFAUT];
  const horsTotal = (Array.isArray(d?.horsTotal) ? d.horsTotal.map(String) : []).filter((c: string) => comptes.includes(c));
  return { comptes, horsTotal };
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const [{ comptes, horsTotal }, relSnap] = await Promise.all([
      listeComptes(),
      adminDb.collection("tresorerie-releves").get(),
    ]);
    const releves = relSnap.docs.map((d) => {
      const r = d.data() as any;
      return {
        id: d.id,
        mois: r.mois || "",
        compte: r.compte || COMPTE_DEFAUT,
        montant: Number(r.montant || 0),
        note: r.note || "",
        source: r.source || "saisie",
      };
    }).filter((r) => MOIS_RE.test(r.mois));
    return NextResponse.json({ comptes, horsTotal, releves });
  } catch (e) {
    console.error("[tresorerie] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture des relevés" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    if (body.action === "comptes") {
      const comptes = (Array.isArray(body.comptes) ? body.comptes : [])
        .map((c: unknown) => String(c || "").trim())
        .filter(Boolean)
        .slice(0, 10);
      if (comptes.length === 0) {
        return NextResponse.json({ error: "Au moins un compte" }, { status: 400 });
      }
      const horsTotal = (Array.isArray(body.horsTotal) ? body.horsTotal : [])
        .map((c: unknown) => String(c || "").trim())
        .filter((c: string) => comptes.includes(c));
      if (horsTotal.length >= comptes.length) {
        return NextResponse.json({ error: "Au moins un compte doit compter dans le total" }, { status: 400 });
      }
      await adminDb.collection("settings").doc("tresorerie").set(
        { comptes, horsTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true },
      );
      return NextResponse.json({ ok: true, comptes, horsTotal });
    }

    // ── Lecture d'un relevé de compte PDF ──
    // Le réflexe de fin de mois, version sûre : au lieu de recopier le solde à
    // la main (avec le risque de faute de frappe), on dépose le relevé — le
    // solde de fin de mois est extrait et PROPOSÉ, l'admin valide. Le PDF
    // n'est jamais conservé, comme pour les fiches de paie.
    if (body.action === "extraire") {
      const pdfBase64 = String(body.pdfBase64 || "");
      if (!pdfBase64 || pdfBase64.length > 6_000_000) {
        return NextResponse.json({ error: "PDF manquant ou trop lourd (4 Mo max)" }, { status: 400 });
      }
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Clé d'analyse absente (ANTHROPIC_API_KEY)" }, { status: 500 });

      const nomsPostes = POSTES_DEPENSES.map((p) => p.nom);
      const anthropic = new Anthropic({ apiKey });
      const rep = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 6000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            {
              type: "text",
              text:
                "Ce document est un RELEVÉ DE COMPTE bancaire français d'un centre équestre. Réponds par un objet JSON seul, sans autre texte :\n" +
                '{ "typeDoc": "releve", "banque": "nom de la banque", "compte": "libellé ou intitulé du compte (et fin de numéro le cas échéant)", "mois": "AAAA-MM du solde de clôture (le mois de la date d\'arrêté du NOUVEAU solde)", "soldeFin": nombre (le NOUVEAU solde / solde en fin de période, NÉGATIF si le compte est débiteur), "soldeDebut": nombre ou null (ancien solde), "dateSoldeFin": "AAAA-MM-JJ" ou null,\n' +
                '  "operations": [ { "date": "AAAA-MM-JJ", "libelle": "libellé de l\'opération, nom du fournisseur mis en avant", "montant": nombre positif, "poste": "…" } ] }\n' +
                "operations = UNIQUEMENT les DÉBITS (sorties d'argent), un objet par opération, dans l'ordre du relevé. Pour chaque débit, choisis \"poste\" EXACTEMENT dans cette liste :\n" +
                nomsPostes.map((n) => `- "${n}"`).join("\n") + "\n" +
                `- "${POSTE_HORS_DEPENSES}" pour tout débit qui n'est PAS une dépense de fonctionnement à suivre : échéance ou remboursement d'emprunt, salaire ou virement à un salarié, cotisations MSA/URSSAF/DGFiP/TESA, TVA et impôts, virement interne entre comptes du centre, retrait d'espèces, remboursement à un client.\n` +
                "Montants en euros, point décimal, sans séparateur de milliers. Si ce n'est pas un relevé de compte, réponds {\"erreur\": \"document non reconnu\"}.",
            },
          ],
        }],
      });

      const texte = rep.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const m = texte.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: "Lecture du relevé impossible" }, { status: 422 });
      let data: any;
      try { data = JSON.parse(m[0]); } catch {
        return NextResponse.json({ error: "Lecture du relevé impossible" }, { status: 422 });
      }
      if (data.erreur) return NextResponse.json({ error: String(data.erreur) }, { status: 422 });

      const nb = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      // Chaque débit lu devient une dépense PROPOSÉE : poste ramené à la liste
      // connue (sinon « hors dépenses », l'admin re-catégorise), mois tiré de
      // la date de l'opération (pas de celle du relevé — un relevé à cheval
      // sur deux mois range chaque débit dans le sien).
      const operations = (Array.isArray(data.operations) ? data.operations : [])
        .slice(0, 200)
        .map((o: any) => {
          const montant = nb(o?.montant);
          const date = DATE_RE.test(String(o?.date)) ? String(o.date) : "";
          const poste = nomsPostes.includes(String(o?.poste)) ? String(o.poste) : POSTE_HORS_DEPENSES;
          return montant !== null && montant > 0
            ? { date, mois: date.slice(0, 7), libelle: String(o?.libelle || "").trim().slice(0, 80), montant, poste }
            : null;
        })
        .filter(Boolean);

      // Proposition seulement — c'est l'admin qui valide, aucune écriture ici.
      return NextResponse.json({
        propositionReleve: {
          banque: String(data.banque || "").trim().slice(0, 60),
          compte: String(data.compte || "").trim().slice(0, 80),
          mois: MOIS_RE.test(String(data.mois)) ? String(data.mois) : "",
          soldeFin: nb(data.soldeFin),
          soldeDebut: nb(data.soldeDebut),
          dateSoldeFin: String(data.dateSoldeFin || ""),
          operations,
          fichier: String(body.filename || ""),
        },
      });
    }

    if (body.action === "saisir") {
      const compte = String(body.compte || COMPTE_DEFAUT).trim();
      const mois = String(body.mois || "");
      if (!MOIS_RE.test(mois) || !compte) {
        return NextResponse.json({ error: "Mois ou compte invalide" }, { status: 400 });
      }
      const ref = adminDb.collection("tresorerie-releves").doc(`${mois}_${cleCompte(compte)}`);
      if (body.montant === null || body.montant === "") {
        await ref.delete();
        return NextResponse.json({ ok: true, efface: true });
      }
      const montant = Number(String(body.montant).replace(",", "."));
      if (!Number.isFinite(montant)) {
        return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
      }
      await ref.set({
        mois, compte,
        montant: Math.round(montant * 100) / 100,
        note: String(body.note || "").slice(0, 500),
        source: "saisie",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "importer") {
      const compte = String(body.compte || COMPTE_DEFAUT).trim();
      const lignes = Array.isArray(body.releves) ? body.releves : [];
      if (lignes.length === 0 || lignes.length > 500) {
        return NextResponse.json({ error: "Entre 1 et 500 relevés" }, { status: 400 });
      }
      let importes = 0, ignores = 0, invalides = 0;
      for (const l of lignes) {
        const mois = String(l?.mois || "");
        const montant = Number(l?.montant);
        if (!MOIS_RE.test(mois) || !Number.isFinite(montant)) { invalides++; continue; }
        const ref = adminDb.collection("tresorerie-releves").doc(`${mois}_${cleCompte(compte)}`);
        const existant = await ref.get();
        // Une saisie manuelle prime toujours sur le classeur repris.
        if (existant.exists && (existant.data() as any)?.source === "saisie") { ignores++; continue; }
        await ref.set({
          mois, compte,
          montant: Math.round(montant * 100) / 100,
          note: "",
          source: "import-excel",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        importes++;
      }
      return NextResponse.json({ ok: true, importes, ignores, invalides });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    console.error("[tresorerie] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
