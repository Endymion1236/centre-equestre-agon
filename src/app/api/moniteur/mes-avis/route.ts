import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/moniteur/mes-avis
 *
 * Avis de satisfaction que Nicolas a explicitement partagés avec la monitrice
 * connectée.
 *
 * Choix assumé : rien n'est visible par défaut. Un avis dur qui arrive brut sur
 * le téléphone d'une monitrice un dimanche soir fait des dégâts sans rien
 * apprendre à personne. Le partage est un geste volontaire, qui peut
 * s'accompagner d'un mot.
 *
 * L'appariement se fait sur le nom, `moniteurs[].nom` étant du texte libre
 * saisi côté famille et non une référence à la fiche : comparaison
 * insensible à la casse et aux accents, et prise en charge des binômes
 * (« Alice et Aubance ») déjà rencontrés sur les récapitulatifs quotidiens.
 */

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Les prénoms cités par une entrée, en tenant compte des binômes. */
function prenomsDe(nom: string): string[] {
  return norm(nom)
    .split(/\s+et\s+|\s*[,&+\/]\s*/)
    .map(p => p.trim().split(" ")[0])
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Fiche moniteur de la personne connectée
    const monSnap = await adminDb
      .collection("moniteurs")
      .where("email", "==", (auth.email || "").toLowerCase())
      .limit(1)
      .get();

    if (monSnap.empty) {
      return NextResponse.json({ avis: [], moniteur: null });
    }
    const mon = monSnap.docs[0].data() as any;
    const monNom = `${mon.prenom || ""} ${mon.nom || ""}`.trim();
    const mesPrenoms = new Set(prenomsDe(monNom));
    if (mon.prenom) mesPrenoms.add(norm(mon.prenom).split(" ")[0]);

    const avisSnap = await adminDb
      .collection("avis-satisfaction")
      .where("partageMoniteurs", "==", true)
      .get();

    const avis = avisSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .map(a => {
        // Note attribuée personnellement, quand elle existe
        let maNote: number | null = null;
        let citee = false;
        for (const m of a.moniteurs || []) {
          const prenoms = prenomsDe(m?.nom || "");
          if (prenoms.some((p: string) => mesPrenoms.has(p))) {
            citee = true;
            if (typeof m.note === "number") maNote = m.note;
          }
        }
        return { a, citee, maNote };
      })
      .filter(x => x.citee)
      .map(({ a, maNote }) => ({
        id: a.id,
        // Le prénom du cavalier suffit : la monitrice n'a pas besoin du
        // dossier famille pour lire un retour sur sa séance.
        childFirstName: (a.childName || "").trim().split(" ")[0] || "",
        stageLabel: a.stageLabel || a.activityTitle || "",
        globalNote: a.globalNote ?? null,
        maNote,
        commentaire: a.commentaire || "",
        motAdmin: a.motMoniteurs || "",
        createdAt: a.createdAt?.toDate?.()?.toISOString?.() || null,
      }))
      .sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));

    const notees = avis.filter(a => typeof a.maNote === "number").map(a => a.maNote as number);
    const moyenne = notees.length
      ? Math.round((notees.reduce((s, n) => s + n, 0) / notees.length) * 10) / 10
      : null;

    return NextResponse.json({
      moniteur: monNom,
      moyenne,
      nbNotes: notees.length,
      avis,
    });
  } catch (e) {
    console.error("[api/moniteur/mes-avis]", e);
    return NextResponse.json({ avis: [], moniteur: null });
  }
}
