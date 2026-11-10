import { NextRequest, NextResponse } from "next/server";
import { importerFacturesRecues } from "@/lib/superpdp-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * CRON superpdp-reception — chaque matin : les factures fournisseurs reçues
 * sur Super PDP entrent dans les pièces de Dépenses (lib/superpdp-import).
 * Ne fait rien tant que le compte branché n'est pas celui de production du
 * club (garde-fou de lib/superpdp-reception). GET + Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const bilan = await importerFacturesRecues("cron-superpdp", 40);
    console.log("[cron superpdp]", JSON.stringify(bilan));
    return NextResponse.json(bilan);
  } catch (e: any) {
    console.error("[cron superpdp]", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
