import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { genererPdfSyntheseCompta } from "@/lib/compta-synthese-pdf";

// ═══════════════════════════════════════════════════════════════════
// PDF de synthèse comptable mensuelle
// ───────────────────────────────────────────────────────────────────
// Généré par /admin/comptabilite (bouton "Export complet du mois").
// Le document lui-même est construit dans lib/compta-synthese-pdf, partagé
// avec l'envoi mensuel à la comptable.
// ═══════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { period, payments = [], encaissements = [] } = body as {
      period: string; // "2026-04"
      payments: any[];
      encaissements: any[];
    };

    const buffer = await genererPdfSyntheseCompta({ period, payments, encaissements });
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="synthese-compta-${period}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error("Erreur génération PDF compta:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}
