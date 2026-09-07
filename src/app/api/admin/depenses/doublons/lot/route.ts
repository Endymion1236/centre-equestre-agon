import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue, type Query, type QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { preparerLotDoublons } from "@/lib/doublons-depenses";
import type { DepenseCandidate } from "@/lib/justificatifs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const moisValide = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
async function apercu(mois: string, lire: (q: Query) => Promise<QuerySnapshot>) {
  const ds = await lire(adminDb.collection("depenses").where("mois", "==", mois).limit(2001));
  const ls = await lire(adminDb.collection("justificatifs-liens").limit(2001));
  const ps = await lire(adminDb.collection("justificatifs").limit(2001));
  if (ds.size > 2000 || ls.size > 2000 || ps.size > 2000) throw new Error("Volume trop important pour le nettoyage par lot ; le contrôle individuel reste disponible.");
  const lignes = ds.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => a.id.localeCompare(b.id)) as DepenseCandidate[];
  const lies = new Set(ls.docs.map(d => d.id));
  for (const d of ps.docs) if (typeof d.data().depenseId === "string") lies.add(d.data().depenseId);
  const plan = preparerLotDoublons(lignes, lies);
  const empreinte = createHash("sha256").update(JSON.stringify({ mois, lignes, lies: [...lies].sort() })).digest("hex");
  const propositions = plan.propositions.slice(0, 150);
  return { empreinte, propositions, groupesManuels: plan.groupesManuels, restants: plan.propositions.length - propositions.length,
    montantCentimes: propositions.reduce((s, p) => s + Math.round(p.ecarter.montant * 100), 0) };
}
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = req.nextUrl.searchParams.get("mois");
  if (!moisValide(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try { return NextResponse.json(await apercu(mois, q => q.get()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error && !("code" in e) ? e.message : "Aperçu indisponible" }, { status: 409 }); }
}
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    if (!moisValide(body.mois) || typeof body.empreinte !== "string" || !/^[a-f0-9]{64}$/.test(body.empreinte)) throw new Error("Actualisez l’aperçu avant validation");
    const resultat = await adminDb.runTransaction(async tx => {
      const journal = adminDb.collection("depenses-doublons-lots").doc(body.empreinte);
      const deja = await tx.get(journal);
      if (deja.exists) return { ecartees: deja.data()!.nombre, dejaTraite: true };
      const plan = await apercu(body.mois, q => tx.get(q));
      if (plan.empreinte !== body.empreinte) throw new Error("Les dépenses ou associations ont changé. Actualisez et vérifiez le nouvel aperçu ; aucune ligne écartée.");
      if (!plan.propositions.length) throw new Error("Aucun doublon proposé dans ce lot");
      const refs = plan.propositions.map(p => adminDb.collection("depenses-doublons-archives").doc(p.ecarter.id));
      const archives = await tx.getAll(...refs);
      if (archives.some(d => d.exists)) throw new Error("Archive déjà présente : contrôle individuel nécessaire");
      // Au plus 150 x 2 écritures + un journal ; tous les contrôles précèdent les retraits.
      for (let i = 0; i < plan.propositions.length; i++) {
        const p = plan.propositions[i];
        const { id, ...original } = p.ecarter;
        tx.create(refs[i], { original, mois: body.mois, conserveId: p.conserver.id, uid: auth.uid, at: FieldValue.serverTimestamp(), lot: body.empreinte });
        tx.delete(adminDb.collection("depenses").doc(id));
      }
      tx.create(journal, { mois: body.mois, nombre: plan.propositions.length, montantCentimes: plan.montantCentimes,
        associations: plan.propositions.map(p => ({ id: p.ecarter.id, conserveId: p.conserver.id })), uid: auth.uid, at: FieldValue.serverTimestamp() });
      return { ecartees: plan.propositions.length, dejaTraite: false };
    });
    return NextResponse.json(resultat);
  } catch (e) { return NextResponse.json({ error: e instanceof Error && !("code" in e) ? e.message : "Nettoyage non confirmé. Actualisez avant de réessayer." }, { status: 409 }); }
}
