/**
 * Satisfaction post-stage — formulaire public (sans connexion), sécurisé par token.
 *
 * GET  /api/satisfaction?token=XXX
 *   -> renvoie les infos d'affichage de l'invitation (stage, enfant, moniteurs).
 *
 * POST /api/satisfaction   body: { token, globalNote, noteProgres, notePoneyNiveau,
 *        noteOrganisation, recommande, commentaire, notesEncadrement: [{nom,note}] }
 *   -> enregistre la réponse dans `avis-satisfaction` (source:"stage") et marque
 *      l'invitation comme répondue.
 *
 * Sécurité : le token (= id du doc invitation) n'est pas devinable. Le serveur
 * ne fait confiance qu'à l'invitation (stage, enfant, moniteurs) ; le client ne
 * fournit que des notes/commentaire. Écriture via SDK admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const clampNote = (v: any) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
};
const moy = (vals: number[]) => {
  const v = vals.filter(n => n > 0);
  return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : 0;
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });
  const snap = await adminDb.collection("satisfaction-invitations").doc(token).get();
  if (!snap.exists) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const d = snap.data() as any;
  return NextResponse.json({
    stageLabel: d.stageLabel || "",
    childName: d.childName || "",
    moniteurs: Array.isArray(d.moniteurs) ? d.moniteurs : [],
    type: d.type === "annee" ? "annee" : "stage",
    saison: typeof d.saison === "number" ? d.saison : null,
    repondu: !!d.repondu,
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "json invalide" }, { status: 400 }); }
  const token = String(body?.token || "");
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const ref = adminDb.collection("satisfaction-invitations").doc(token);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const inv = snap.data() as any;
  if (inv.repondu) return NextResponse.json({ error: "déjà répondu", repondu: true }, { status: 409 });

  const globalNote = clampNote(body.globalNote);
  if (!globalNote) return NextResponse.json({ error: "note globale requise" }, { status: 400 });

  // On part des moniteurs de l'invitation (source de vérité) et on récupère leur note.
  const notesIn: Array<{ nom: string; note: number }> = Array.isArray(body.notesEncadrement) ? body.notesEncadrement : [];
  const moniteurs = (Array.isArray(inv.moniteurs) ? inv.moniteurs : []).map((nom: string) => {
    const found = notesIn.find(n => n?.nom === nom);
    return { nom, note: clampNote(found?.note) };
  });

  const noteProgres = clampNote(body.noteProgres);
  const notePoneyNiveau = clampNote(body.notePoneyNiveau);
  const noteOrganisation = clampNote(body.noteOrganisation);
  const recommande = typeof body.recommande === "boolean" ? body.recommande : undefined;
  const commentaire = String(body.commentaire || "").slice(0, 2000).trim();

  const estAnnee = inv.type === "annee";
  const avis = {
    source: estAnnee ? "annee" : "stage",
    type: estAnnee ? "annee" : "stage",
    saison: typeof inv.saison === "number" ? inv.saison : null,
    invitationId: token,
    stageLabel: inv.stageLabel || "",
    semaine: inv.semaine || "",
    dateFin: inv.dateFin || "",
    childId: inv.childId || "",
    childName: inv.childName || "",
    familyId: inv.familyId || "",
    familyName: inv.familyName || "",
    // Compat avec la page admin existante :
    activityTitle: inv.stageLabel || "Stage",
    globalNote,
    aspects: {
      moniteur: moy(moniteurs.map((m: { nom: string; note: number }) => m.note)),
      progres: noteProgres,
      poneyNiveau: notePoneyNiveau,
      organisation: noteOrganisation,
    },
    commentaire,
    // Spécifique stage :
    moniteurs,
    noteProgres,
    notePoneyNiveau,
    noteOrganisation,
    ...(recommande === undefined ? {} : { recommande }),
    createdAt: new Date(),
  };

  await adminDb.collection("avis-satisfaction").add(avis);
  await ref.update({ repondu: true, dateReponse: new Date() });

  return NextResponse.json({ ok: true });
}
