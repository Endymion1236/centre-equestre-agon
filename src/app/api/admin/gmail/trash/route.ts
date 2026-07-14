import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailTrash, gmailIsConnected } from "@/lib/gmail";

// POST /api/admin/gmail/trash — adminOnly. Met un mail à la corbeille.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    if (!(await gmailIsConnected())) {
      return NextResponse.json({ error: "Gmail non connecté" }, { status: 400 });
    }
    await gmailTrash(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = /403|insufficient|scope/i.test(e?.message || "")
      ? "Autorisation manquante — reconnecte Gmail pour activer la gestion des mails."
      : e?.message || "Échec de la suppression";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
