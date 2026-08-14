import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/preinscrits-stages
 *
 * Récapitulatif des pré-inscriptions aux stages, regroupées par stage et par
 * semaine. Sans cet écran, il fallait ouvrir chaque jour du planning pour
 * savoir combien de monde attend sur les vacances à venir.
 *
 * Ne couvre QUE les stages : les cours à l'année ont leur propre écran, avec
 * une logique de relance différente.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const aujourdhui = new Date().toISOString().split("T")[0];
  const snap = await adminDb
    .collection("creneaux")
    .where("date", ">=", aujourdhui)
    .get();

  /** Un cavalier peut être pré-inscrit sur plusieurs jours du même stage :
   *  on le compte une fois, en retenant ses jours. */
  type Cav = { childId: string; childName: string; familyName: string; jours: string[] };
  const stages = new Map<string, {
    cle: string; titre: string; semaineLundi: string;
    dates: Set<string>; places: number; inscritsFermes: number;
    cavaliers: Map<string, Cav>;
  }>();

  for (const d of snap.docs) {
    const c = d.data() as any;
    if (c.activityType !== "stage" && c.activityType !== "stage_journee") continue;
    const enrolled: any[] = c.enrolled || [];
    const pre = enrolled.filter(e => e?.preinscription);
    if (pre.length === 0) continue;

    // Lundi de la semaine, en UTC midi pour éviter tout décalage de fuseau.
    const j = new Date((c.date || "") + "T12:00:00Z");
    const lundi = new Date(j);
    lundi.setUTCDate(lundi.getUTCDate() - ((j.getUTCDay() + 6) % 7));
    const semaineLundi = lundi.toISOString().split("T")[0];
    const cle = `${semaineLundi}__${c.activityTitle}__${c.startTime}`;

    if (!stages.has(cle)) {
      stages.set(cle, {
        cle, titre: c.activityTitle || "(sans titre)", semaineLundi,
        dates: new Set(), places: 0, inscritsFermes: 0, cavaliers: new Map(),
      });
    }
    const st = stages.get(cle)!;
    st.dates.add(c.date);
    // Places et inscrits fermes : on prend le maximum sur les jours du stage
    // plutôt que la somme, qui n'aurait aucun sens (5 jours × 8 places ≠ 40).
    st.places = Math.max(st.places, c.maxPlaces || 0);
    st.inscritsFermes = Math.max(st.inscritsFermes, enrolled.length - pre.length);

    for (const e of pre) {
      const k = e.childId;
      if (!k) continue;
      if (!st.cavaliers.has(k)) {
        st.cavaliers.set(k, {
          childId: k, childName: e.childName || "", familyName: e.familyName || "", jours: [],
        });
      }
      st.cavaliers.get(k)!.jours.push(c.date);
    }
  }

  const resultat = [...stages.values()]
    .map(st => ({
      cle: st.cle,
      titre: st.titre,
      semaineLundi: st.semaineLundi,
      nbJours: st.dates.size,
      places: st.places,
      inscritsFermes: st.inscritsFermes,
      nbPreinscrits: st.cavaliers.size,
      cavaliers: [...st.cavaliers.values()]
        .map(c => ({ ...c, jours: c.jours.sort() }))
        .sort((a, b) => a.childName.localeCompare(b.childName)),
    }))
    .sort((a, b) => a.semaineLundi.localeCompare(b.semaineLundi) || a.titre.localeCompare(b.titre));

  return NextResponse.json({
    nbStages: resultat.length,
    nbPreinscrits: resultat.reduce((s, x) => s + x.nbPreinscrits, 0),
    stages: resultat,
  });
}
