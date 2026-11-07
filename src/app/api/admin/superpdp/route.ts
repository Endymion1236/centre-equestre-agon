import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { appelSuperPdp, roleConfigure } from "@/lib/superpdp";
import { resumerFacture, type RoleSuperPdp } from "@/lib/superpdp-regles";
import { apercuDepense } from "@/lib/superpdp-depenses";
import { adminDb } from "@/lib/firebase-admin";

// ═══════════════════════════════════════════════════════════════════
// /api/admin/superpdp — essai de la plateforme agréée Super PDP
// (bac à sable, admin uniquement). Rien de réel ne part : les deux
// entreprises sont fictives (Burger Queen = le club, Tricatel = un
// fournisseur).
//
// GET  ?action=etat                       → connexion de chaque rôle
// GET  ?action=factures&role=club         → factures reçues et envoyées
// GET  ?action=apercu-depenses            → factures reçues par le club, vues
//      comme elles arriveraient dans Dépenses (lecture seule, rien n'est écrit)
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
      const d = await (await appelSuperPdp(role, "/v1.beta/invoices?order=desc&limit=50&expand[]=en_invoice&expand[]=en_invoice.seller&expand[]=en_invoice.buyer&expand[]=events")).json();
      return NextResponse.json({ factures: (d.data || []).map(resumerFacture) });
    }
    if (action === "apercu-depenses") {
      const d = await (await appelSuperPdp("club", "/v1.beta/invoices?direction=in&order=desc&limit=20&expand[]=en_invoice&expand[]=en_invoice.seller&expand[]=en_invoice.buyer")).json();
      const recues = (d.data || []).filter((f: any) => f.en_invoice);
      // Débits du relevé des mois couverts par ces factures et du suivant (paiement après facture).
      const mois = new Set<string>();
      for (const f of recues) {
        const date = String(f.en_invoice.issue_date || "");
        if (!/^\d{4}-\d{2}/.test(date)) continue;
        const [a, m] = date.slice(0, 7).split("-").map(Number);
        mois.add(date.slice(0, 7));
        mois.add(m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`);
      }
      const depenses: any[] = [];
      for (const m of [...mois].slice(0, 12)) {
        const snap = await adminDb.collection("depenses").where("mois", "==", m).get();
        snap.forEach((doc) => depenses.push({ id: doc.id, ...doc.data() }));
      }
      return NextResponse.json({
        apercus: recues.map((f: any) => ({ id: f.id, ...apercuDepense(f.en_invoice, depenses) })),
        moisLus: [...mois].sort(),
      });
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
