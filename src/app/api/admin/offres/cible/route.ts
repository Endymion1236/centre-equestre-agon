import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { isChildEligible, ageFromBirth } from "@/lib/eligibilite";
import { offerKeyFrom } from "@/lib/offres";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/offres/cible  (admin uniquement)
//
// Ciblage d'une offre last-minute : à partir d'un ou plusieurs créneaux
// (une semaine de stage = tous ses creneauIds), renvoie les familles à
// contacter. TOUT est calculé côté serveur :
//   - éligibilité enfant par ÂGE (ageMin/ageMax) et GALOP (galopRequired),
//     règle prudente : critère non vérifiable (date de naissance ou galop
//     manquant) = exclu — on ne démarche pas "au cas où" ;
//   - RGPD : consentementMarketing === true OBLIGATOIRE (en dur) ;
//   - exclusion des enfants DÉJÀ INSCRITS sur ces créneaux ;
//   - dédoublonnage par email parent ;
//   - marquage des familles déjà contactées pour cette offre
//     (collection offres_envois, clé = creneauIds triés).
//
// Body    : { creneauIds: string[] }
// Réponse : { ok, offre: {titre, dates, horaire, placesRestantes},
//             cibles: [{familyId, parentName, parentEmail, enfants: [..],
//                       dejaContactee}] , exclusions: {sansConsentement, nonEligibles, dejaInscrits} }
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const creneauIds: string[] = Array.isArray(body?.creneauIds)
      ? body.creneauIds.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 10)
      : [];
    if (creneauIds.length === 0) {
      return NextResponse.json({ error: "creneauIds requis.", status: "badRequest" }, { status: 400 });
    }

    // ── 1. Créneaux : critères, places, enfants déjà inscrits ──
    const creSnaps = await Promise.all(creneauIds.map((id) => adminDb.collection("creneaux").doc(id).get()));
    const missing = creSnaps.find((s) => !s.exists);
    if (missing) {
      return NextResponse.json({ error: "Un créneau est introuvable.", status: "missing" }, { status: 404 });
    }
    const crs = creSnaps.map((s) => ({ id: s.id, ...(s.data() as any) }));
    crs.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = crs[0];

    // Critères d'éligibilité : ceux de l'ACTIVITÉ (portés par les créneaux).
    const activityIds = Array.from(new Set(crs.map((c) => c.activityId).filter(Boolean)));
    let elig: { ageMin: number | null; ageMax: number | null; galopRequired: any } = {
      ageMin: null,
      ageMax: null,
      galopRequired: null,
    };
    if (activityIds.length > 0) {
      const actSnap = await adminDb.collection("activities").doc(activityIds[0]).get();
      if (actSnap.exists) {
        const a = actSnap.data() as any;
        elig = {
          ageMin: typeof a.ageMin === "number" ? a.ageMin : null,
          ageMax: typeof a.ageMax === "number" ? a.ageMax : null,
          galopRequired: a.galopRequired ?? null,
        };
      }
    }

    const dejaInscritsIds = new Set<string>();
    crs.forEach((c) => (Array.isArray(c.enrolled) ? c.enrolled : []).forEach((e: any) => e.childId && dejaInscritsIds.add(e.childId)));
    const placesRestantes = Math.min(
      ...crs.map((c) => {
        const maxP = typeof c.maxPlaces === "number" ? c.maxPlaces : Infinity;
        return Math.max(0, maxP - (Array.isArray(c.enrolled) ? c.enrolled.length : 0));
      })
    );

    // ── 2. Familles déjà contactées pour CETTE offre ──
    const key = offerKeyFrom(creneauIds);
    const envoisSnap = await adminDb.collection("offres_envois").where("offerKey", "==", key).get();
    const dejaContactees = new Set<string>();
    envoisSnap.forEach((d) => ((d.data() as any).familyIds || []).forEach((f: string) => dejaContactees.add(f)));

    // ── 3. Toutes les familles → filtre serveur ──
    const famSnap = await adminDb.collection("families").get();
    const cibles: any[] = [];
    let sansConsentement = 0;
    let nonEligibles = 0;
    let dejaInscrits = 0;
    const emailsVus = new Set<string>();

    famSnap.forEach((d) => {
      const f = d.data() as any;
      const email = (f.parentEmail || "").trim().toLowerCase();
      if (!email) return;
      // RGPD : consentement OBLIGATOIRE, filtre en dur.
      if (f.consentementMarketing !== true) {
        sansConsentement++;
        return;
      }
      const enfants = (f.children || []).filter((ch: any) => {
        if (!ch?.id) return false;
        if (dejaInscritsIds.has(ch.id)) {
          dejaInscrits++;
          return false;
        }
        if (!isChildEligible(elig, { birthDate: ch.birthDate, galopLevel: ch.galopLevel })) {
          nonEligibles++;
          return false;
        }
        return true;
      });
      if (enfants.length === 0) return;
      if (emailsVus.has(email)) return; // dédoublonnage par email parent
      emailsVus.add(email);
      cibles.push({
        familyId: d.id,
        parentName: f.parentName || "",
        parentEmail: email,
        enfants: enfants.map((ch: any) => ({
          childId: ch.id,
          prenom: ch.firstName || "",
          age: ageFromBirth(ch.birthDate),
          galop: ch.galopLevel && ch.galopLevel !== "—" ? ch.galopLevel : null,
        })),
        dejaContactee: dejaContactees.has(d.id),
      });
    });
    cibles.sort((a, b) => (a.parentName || "").localeCompare(b.parentName || ""));

    return NextResponse.json({
      ok: true,
      offre: {
        titre: first.activityTitle || "",
        type: first.activityType || "",
        dateDebut: first.date,
        dateFin: crs[crs.length - 1].date,
        horaire: [first.startTime, first.endTime].filter(Boolean).join("-"),
        placesRestantes: Number.isFinite(placesRestantes) ? placesRestantes : null,
        nbJours: crs.length,
        criteres: elig,
      },
      offerKey: key,
      cibles,
      exclusions: { sansConsentement, nonEligibles, dejaInscrits },
    });
  } catch (e: any) {
    console.error("[offres/cible]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
