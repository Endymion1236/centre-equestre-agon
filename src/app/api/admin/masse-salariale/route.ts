/**
 * Masse salariale mensuelle — même esprit que la trésorerie : un outil de
 * pilotage par saison, PAS une écriture comptable.
 *
 * GET  → toutes les lignes { mois, salarie, brut, net, coutEmployeur, heures }.
 * POST { action: "extraire", pdfBase64, filename }
 *      → lit UNE fiche de paie avec Claude (le PDF part à l'API d'analyse puis
 *        est oublié : RIEN n'est stocké — ni le fichier, ni son texte). Retourne
 *        une PROPOSITION que l'admin valide ou corrige avant enregistrement.
 * POST { action: "enregistrer", mois, salarie, brut, net?, coutEmployeur?, heures? }
 *      → pose la ligne (un document par mois × salarié). Écrase la ligne du
 *        même salarié pour le même mois : une fiche de paie remplace la
 *        précédente version d'elle-même.
 * POST { action: "supprimer", mois, salarie }
 *
 * La fiche de paie contient des données personnelles (NIR, adresse, salaire) :
 * ne conserver QUE les agrégats nécessaires au pilotage est un choix délibéré,
 * pas une paresse — le bulletin lui-même reste dans le classeur du personnel.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function cleSalarie(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const snap = await adminDb.collection("masse-salariale").get();
    const lignes = snap.docs.map((d) => {
      const r = d.data() as any;
      return {
        id: d.id,
        mois: r.mois || "",
        salarie: r.salarie || "",
        brut: Number(r.brut || 0),
        net: r.net != null ? Number(r.net) : null,
        coutEmployeur: r.coutEmployeur != null ? Number(r.coutEmployeur) : null,
        heures: r.heures != null ? Number(r.heures) : null,
        source: r.source || "saisie",
      };
    }).filter((l) => MOIS_RE.test(l.mois) && l.salarie);
    return NextResponse.json({ lignes });
  } catch (e) {
    console.error("[masse-salariale] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    if (body.action === "extraire") {
      const pdfBase64 = String(body.pdfBase64 || "");
      if (!pdfBase64 || pdfBase64.length > 6_000_000) {
        return NextResponse.json({ error: "PDF manquant ou trop lourd (4 Mo max)" }, { status: 400 });
      }
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Clé d'analyse absente (ANTHROPIC_API_KEY)" }, { status: 500 });

      const anthropic = new Anthropic({ apiKey });
      const rep = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text:
                "Ce document est une fiche de paie française. Extrais UNIQUEMENT ces informations et réponds par un objet JSON seul, sans autre texte :\n" +
                '{ "salarie": "Prénom Nom", "mois": "AAAA-MM (période de paie)", "brut": nombre, "net": nombre (net à payer avant impôt si distinct, sinon net payé), "coutEmployeur": nombre ou null (total « coût employeur » / « coût global » / brut + charges patronales, seulement s\'il figure sur le bulletin), "heures": nombre ou null (heures travaillées ou payées du mois) }\n' +
                "Les montants en euros, sans séparateur de milliers, point décimal. Si une valeur est introuvable, mets null. Si le document n'est PAS une fiche de paie, réponds {\"erreur\": \"pas une fiche de paie\"}.",
            },
          ],
        }],
      });

      const texte = rep.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const m = texte.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: "Lecture du bulletin impossible" }, { status: 422 });
      let data: any;
      try { data = JSON.parse(m[0]); } catch {
        return NextResponse.json({ error: "Lecture du bulletin impossible" }, { status: 422 });
      }
      if (data.erreur) return NextResponse.json({ error: String(data.erreur) }, { status: 422 });

      // Proposition brute — c'est l'admin qui valide. Aucune écriture ici.
      return NextResponse.json({
        proposition: {
          salarie: String(data.salarie || "").trim(),
          mois: MOIS_RE.test(String(data.mois)) ? String(data.mois) : "",
          brut: Number.isFinite(Number(data.brut)) ? Math.round(Number(data.brut) * 100) / 100 : null,
          net: Number.isFinite(Number(data.net)) ? Math.round(Number(data.net) * 100) / 100 : null,
          coutEmployeur: Number.isFinite(Number(data.coutEmployeur)) ? Math.round(Number(data.coutEmployeur) * 100) / 100 : null,
          heures: Number.isFinite(Number(data.heures)) ? Math.round(Number(data.heures) * 100) / 100 : null,
          fichier: String(body.filename || ""),
        },
      });
    }

    if (body.action === "enregistrer") {
      const mois = String(body.mois || "");
      const salarie = String(body.salarie || "").trim();
      const brut = Number(String(body.brut ?? "").toString().replace(",", "."));
      if (!MOIS_RE.test(mois) || !salarie || !Number.isFinite(brut) || brut < 0) {
        return NextResponse.json({ error: "Mois, salarié ou brut invalide" }, { status: 400 });
      }
      const opt = (v: unknown) => {
        const n = Number(String(v ?? "").toString().replace(",", "."));
        return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n * 100) / 100 : null;
      };
      await adminDb.collection("masse-salariale").doc(`${mois}_${cleSalarie(salarie)}`).set({
        mois, salarie,
        brut: Math.round(brut * 100) / 100,
        net: opt(body.net),
        coutEmployeur: opt(body.coutEmployeur),
        heures: opt(body.heures),
        source: body.source === "fiche-paie" ? "fiche-paie" : "saisie",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "supprimer") {
      const mois = String(body.mois || "");
      const salarie = String(body.salarie || "").trim();
      if (!MOIS_RE.test(mois) || !salarie) {
        return NextResponse.json({ error: "Mois ou salarié invalide" }, { status: 400 });
      }
      await adminDb.collection("masse-salariale").doc(`${mois}_${cleSalarie(salarie)}`).delete();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    console.error("[masse-salariale] écriture", e);
    const msg = e?.status === 400 && /pdf|document/i.test(String(e?.message))
      ? "Le fichier n'a pas pu être lu comme un PDF"
      : "Erreur lors du traitement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
