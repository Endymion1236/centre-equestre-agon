import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { appelSuperPdp, roleConfigure } from "@/lib/superpdp";
import { resumerFacture, type RoleSuperPdp } from "@/lib/superpdp-regles";

// ═══════════════════════════════════════════════════════════════════
// /api/admin/superpdp — essai de la plateforme agréée Super PDP
// (bac à sable, admin uniquement). Rien de réel ne part : les deux
// entreprises sont fictives (Burger Queen = le club, Tricatel = un
// fournisseur).
//
// GET  ?action=etat                       → connexion de chaque rôle
// GET  ?action=factures&role=club         → factures reçues et envoyées
// POST { action: "envoyer-test", de }     → facture d'essai générée par
//      Super PDP, envoyée par « de » (club ou fournisseur) à l'autre
// ═══════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROLES: RoleSuperPdp[] = ["club", "fournisseur"];
const estRole = (r: unknown): r is RoleSuperPdp => r === "club" || r === "fournisseur";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const action = req.nextUrl.searchParams.get("action") || "etat";
  try {
    if (action === "etat") {
      const roles = await Promise.all(ROLES.map(async (role) => {
        if (!roleConfigure(role)) return { role, configure: false };
        try {
          const c = await (await appelSuperPdp(role, "/v1.beta/companies/me")).json();
          return { role, configure: true, ok: true, entreprise: c.formal_name || c.trade_name || "—", mode: c.env || "—" };
        } catch (e: any) {
          return { role, configure: true, ok: false, erreur: e?.message || String(e) };
        }
      }));
      return NextResponse.json({ roles });
    }
    if (action === "factures") {
      const role = req.nextUrl.searchParams.get("role");
      if (!estRole(role)) return NextResponse.json({ error: "role : club ou fournisseur" }, { status: 400 });
      const d = await (await appelSuperPdp(role, "/v1.beta/invoices?order=desc&limit=50&expand[]=en_invoice")).json();
      return NextResponse.json({ factures: (d.data || []).map(resumerFacture) });
    }
    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({} as any));
  try {
    if (body.action === "envoyer-test") {
      const de: RoleSuperPdp = estRole(body.de) ? body.de : "club";
      // Super PDP fabrique une facture valide dont le vendeur est l'entreprise
      // du jeton et l'acheteur une autre entreprise du bac à sable.
      const xml = await (await appelSuperPdp(de, "/v1.beta/invoices/generate_test_invoice?format=ubl")).text();
      const envoi = await (await appelSuperPdp(de, `/v1.beta/invoices?external_id=${encodeURIComponent(`essai-${Date.now()}`)}`, {
        method: "POST", headers: { "Content-Type": "application/xml" }, body: xml,
      })).json();
      return NextResponse.json({ ok: true, id: envoi.id });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
  }
}
