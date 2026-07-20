import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailTrash, gmailIsConnected } from "@/lib/gmail";

// POST /api/admin/gmail/trash — adminOnly. Met un mail à la corbeille.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, ids } = await req.json();
    // Suppression unitaire (`id`) ou par lot (`ids`) : même route.
    const list: string[] = Array.isArray(ids) ? ids.filter(Boolean) : id ? [id] : [];
    if (list.length === 0) return NextResponse.json({ error: "id(s) requis" }, { status: 400 });
    if (!(await gmailIsConnected())) {
      return NextResponse.json({ error: "Gmail non connecté" }, { status: 400 });
    }
    // Séquentiel volontaire : reste sous le quota Gmail et évite qu'un échec
    // ponctuel n'emporte tout le lot. On remonte le détail par message.
    const results = await Promise.allSettled(list.map((x) => gmailTrash(x)));
    const trashed = list.filter((_, i) => results[i].status === "fulfilled");
    const failed = list.filter((_, i) => results[i].status === "rejected");
    return NextResponse.json({ ok: failed.length === 0, trashed, failed });
  } catch (e: any) {
    const msg = /403|insufficient|scope/i.test(e?.message || "")
      ? "Autorisation manquante — reconnecte Gmail pour activer la gestion des mails."
      : e?.message || "Échec de la suppression";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
