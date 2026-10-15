/**
 * GET /api/admin/fec?mois=AAAA-MM
 *   → { fichier, contenu, source, ecrituresVentes, ecrituresReglements, ecrituresAchats, ecrituresBanque, anomalies, compteAttente } : le FEC du mois, le même que
 *     celui de l'envoi mensuel au cabinet (lib/envoi-comptable → chargerFecMois).
 *     Journaux VE, RG, HA (achats) et BQ (banque, depuis le relevé du mois).
 *     Pour juillet-août 2026, il reprend les écritures Céleris importées, puis HA et BQ.
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { messageErreur } from "@/lib/message-erreur";
import { MOIS_RE, chargerFecMois } from "@/lib/envoi-comptable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = String(req.nextUrl.searchParams.get("mois") || "");
  if (!MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    const fec = await chargerFecMois(mois);
    return NextResponse.json({ fichier: fec.fichier, contenu: fec.contenu, source: fec.source,
      ecrituresVentes: fec.ecrituresVentes, ecrituresReglements: fec.ecrituresReglements, ecrituresAchats: fec.ecrituresAchats, ecrituresBanque: fec.ecrituresBanque, anomalies: fec.anomalies, compteAttente: fec.compteAttente },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[fec]", e);
    return NextResponse.json({ error: `FEC indisponible — ${messageErreur(e)}` }, { status: 500 });
  }
}
