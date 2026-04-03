import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EQUIDES_PRESENTS = [
  { name: "GATSBY",                 sire: "16365133L", puce: "250258500168262",    entree: "2020-07-06" },
  { name: "SHIVA",                  sire: "52480703G", puce: "25000152480703G",    entree: "2020-07-06" },
  { name: "VIOLINE DES BUTS",       sire: "09155889W", puce: "25000109155889W",    entree: "2020-07-06" },
  { name: "VOYOU DES BUTS",         sire: "09155893R", puce: "25000109155893R",    entree: "2020-07-06" },
  { name: "DAHLIA DE LA PAGELLERIE",sire: "13373463B", puce: "25000113373463B",    entree: "2020-07-06" },
  { name: "RIKIKI",                 sire: "52300100P", puce: "25000152300100P",    entree: "2020-07-06" },
  { name: "ROCKY DE LOISEL",        sire: "05029836L", puce: "25000105029836L",    entree: "2020-07-06" },
  { name: "TORI DES LAUZES",        sire: "07303343H", puce: "25000107303343H",    entree: "2020-07-06" },
  { name: "DUCATIE DE LA ROCHE",    sire: "13337708Q", puce: "25000113337708Q",    entree: "2020-07-06" },
  { name: "REINE DES MONTS",        sire: "05049498P", puce: "25000105049498P",    entree: "2020-07-06" },
  { name: "D'UN PETIT BOUT DE BATZ",sire: "52688446Z", puce: "250259806095652",    entree: "2020-07-06" },
  { name: "VERMICELLE",             sire: "52735578T", puce: "2502599805599777",   entree: "2020-07-06" },
  { name: "VIENS TU HUARDIERE",     sire: "52527925D", puce: "25000152527925D",    entree: "2020-07-06" },
  { name: "QUILLIAN",               sire: "",          puce: "DE443438504808",      entree: "2020-07-06" },
  { name: "SERGIO",                 sire: "52066480Z", puce: "25000152066480Z",    entree: "2020-07-06" },
  { name: "VOYOU",                  sire: "52637708Z", puce: "25000152637708Z",    entree: "2020-07-06" },
  { name: "BOOM SHAKALAKA",         sire: "50453473S", puce: "826002110024066",    entree: "2020-07-06" },
  { name: "AVATAR PENN AR",         sire: "10320005C", puce: "25000110320005C",    entree: "2020-07-06" },
  { name: "LISON",                  sire: "52103455J", puce: "",                   entree: "2020-07-06" },
  { name: "NOEVA DES VICKLANDS",    sire: "01396620J", puce: "",                   entree: "2020-07-06" },
  { name: "English rose",           sire: "14555351Q", puce: "25000114555351Q",    entree: "2021-01-16" },
  { name: "Flamenco",               sire: "152079202Z",puce: "250001152079202Z",   entree: "2021-05-04" },
  { name: "Guerriere",              sire: "16354912W", puce: "25000116354912W",    entree: "2022-01-08" },
  { name: "Gasby",                  sire: "16364462Q", puce: "25000116364462Q",    entree: "2022-01-08" },
  { name: "Ultime",                 sire: "08037638L", puce: "25000108037638L",    entree: "2022-05-06" },
  { name: "Héloise",                sire: "52874203P", puce: "25000152874203P",    entree: "2022-06-21" },
  { name: "Espoir",                 sire: "14545813H", puce: "250258709013992",    entree: "2022-10-11" },
  { name: "Kool Raoul",             sire: "",          puce: "",                   entree: "2022-10-11" },
  { name: "Caramel",                sire: "",          puce: "",                   entree: "2022-10-11" },
  { name: "LOLA",                   sire: "",          puce: "",                   entree: "2022-10-13" },
  { name: "Java",                   sire: "19374046D", puce: "250258709064490",    entree: "2023-06-30" },
  { name: "Joy Kan",                sire: "19400599R", puce: "250259806299308",    entree: "2024-03-30" },
  { name: "Inside",                 sire: "18740858B", puce: "250259806225158",    entree: "2023-03-30" },
  { name: "Happy",                  sire: "52807029E", puce: "250259806221375",    entree: "2024-08-19" },
  { name: "Josh",                   sire: "",          puce: "",                   entree: "2024-07-30" },
  { name: "El Pepe",                sire: "",          puce: "",                   entree: "2024-07-30" },
  { name: "Mini",                   sire: "52879551B", puce: "250258709118224",    entree: "2024-09-18" },
  { name: "Grincheux",              sire: "52879549D", puce: "250258709118482",    entree: "2023-08-02" },
  { name: "Hot Shot",               sire: "",          puce: "",                   entree: "2024-10-05" },
  { name: "ST CLERANS VERONA",      sire: "",          puce: "372004000114820",    entree: "2024-10-31" },
  { name: "Neptuno",                sire: "",          puce: "",                   entree: "2025-05-10" },
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const results: string[] = [];

  try {
    if (!dryRun) {
      // Vider les collections
      const [equiSnap, mouvSnap] = await Promise.all([
        adminDb.collection("equides").get(),
        adminDb.collection("mouvements_registre").get(),
      ]);
      const batchDel = adminDb.batch();
      equiSnap.docs.forEach(d => batchDel.delete(d.ref));
      mouvSnap.docs.forEach(d => batchDel.delete(d.ref));
      await batchDel.commit();
      results.push(`🗑 ${equiSnap.size} équidés supprimés, ${mouvSnap.size} mouvements supprimés`);

      // Importer — Firestore batch max 500 ops
      const batch = adminDb.batch();
      for (const e of EQUIDES_PRESENTS) {
        const ref = adminDb.collection("equides").doc();
        batch.set(ref, {
          name: e.name,
          sire: e.sire,
          puce: e.puce,
          type: "poney",
          sex: "femelle",
          robe: "", race: "",
          birthDate: null, toise: null, photo: null,
          provenance: "Centre Équestre Agon-Coutainville",
          proprietaire: "Richard Nicolas",
          dateArrivee: new Date(e.entree),
          dateSortie: null, motifSortie: null,
          status: "actif", available: true,
          niveauCavalier: "", disciplines: [],
          temperament: "", cavaliersFavoris: [],
          maxReprisesPerDay: 3, maxHeuresHebdo: 15,
          notes: "",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.push(`✅ ${e.name}${e.sire ? ` — SIRE ${e.sire}` : ""}${e.puce ? ` — puce ${e.puce}` : ""}`);
      }
      await batch.commit();
      results.push(`\n🎉 ${EQUIDES_PRESENTS.length} équidés importés`);
    } else {
      results.push(`[DRY RUN] ${EQUIDES_PRESENTS.length} équidés à importer :`);
      EQUIDES_PRESENTS.forEach(e => results.push(`  → ${e.name}`));
    }

    return NextResponse.json({ success: true, total: EQUIDES_PRESENTS.length, dryRun, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, results }, { status: 500 });
  }
}
