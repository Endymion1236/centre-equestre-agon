/**
 * /api/enroll — Inscription sécurisée d'un enfant dans un ou plusieurs créneaux.
 *
 * Objectif (audit P0 #3 + #7) : ne plus laisser le navigateur réécrire
 * directement le tableau `enrolled` d'un créneau (ce qui permettait de
 * supprimer les inscrits d'autres familles ou de dépasser la capacité).
 *
 * Garanties :
 *   - Auth obligatoire (verifyAuth), familyId forcé à auth.uid.
 *   - L'enfant doit appartenir à la famille connectée (sauf réservation liée
 *     explicite via sourceFamilyId — cas conservé pour ne rien casser).
 *   - Transaction par créneau : vérifie la capacité (maxPlaces) et les doublons.
 *   - Nom de l'enfant/famille pris depuis la fiche famille (pas depuis le client).
 *
 * Body : { enrollments: [{ childId, creneauIds: string[], sourceFamilyId?, childName? }] }
 * Réponse : { ok, enrolled: string[], full: string[], notOwned: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth, isAdminToken } from "@/lib/api-auth";
import { bloquerSiReservationsFermees } from "@/lib/reservations-ouvertes";
import { dateExpirationHold } from "@/lib/places-tenues";
import { isForfaitActif } from "@/lib/forfaits";
import { deciderInscriptionNiveau, compatibiliteCavalier, LIBELLE_NIVEAU, estNiveauPromenade } from "@/lib/promenade-niveau";

interface EnrollItem {
  childId: string;
  creneauIds: string[];
  sourceFamilyId?: string;
  childName?: string;
  paymentSource?: string;      // ex. "forfait" pour une inscription annuelle
  forfaitId?: string | null;
  pending?: boolean;           // place tenue mais non confirmée (paiement différé)
  holdUntil?: string;          // ISO — au-delà, la place tenue est purgée
  paymentMethod?: string;
  /** Promenade « niveau à définir » : niveau déclaré par la famille pour ce cavalier. */
  niveauPromenade?: string;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  // Verrou d'avant-ouverture (les admins passent toujours)
  const verrou = await bloquerSiReservationsFermees(auth);
  if (verrou) return verrou;
  const uid = auth.uid;
  // Le staff inscrit au nom du club : une inscription posée depuis le
  // back-office est ferme par construction (l'admin sait ce qu'il fait et
  // encaisse au comptoir). Une inscription posée par une FAMILLE, elle, ne
  // peut être qu'une place TENUE — voir plus bas.
  const estStaff = isAdminToken(auth) || auth.moniteur === true;

  try {
    const body = await req.json();
    const items: EnrollItem[] = Array.isArray(body.enrollments) ? body.enrollments : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Aucune inscription fournie" }, { status: 400 });
    }

    // Source d'autorité : la fiche famille (jamais le client).
    const famSnap = await adminDb.collection("families").doc(uid).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const family = famSnap.data() as any;
    const childrenMap = new Map<string, string>();
    (family.children || []).forEach((c: any) => childrenMap.set(c.id, c.firstName || c.prenom || ""));
    // Enfants LIÉS : autorisés explicitement par l'admin (fiche famille → « Lier
    // des cavaliers »). Chaque entrée porte le childId + sa sourceFamilyId. C'est
    // la relation enregistrée qui autorise à réserver pour un enfant d'une autre
    // famille — connaître un sourceFamilyId ne suffit plus (audit).
    const linkedMap = new Map<string, { sourceFamilyId: string; childName: string }>();
    (family.linkedChildren || []).forEach((c: any) => {
      if (c?.childId) linkedMap.set(c.childId, { sourceFamilyId: c.sourceFamilyId || "", childName: c.childName || "" });
    });
    const familyName = family.parentName || "";

    const enrolled: string[] = [];
    const full: string[] = [];
    const notOwned: string[] = [];
    const missing: string[] = [];

    for (const item of items) {
      if (!item?.childId || !Array.isArray(item.creneauIds)) continue;
      const creneauIds = item.creneauIds.filter(Boolean);
      if (creneauIds.length === 0) continue;

      // ── Autorisation de l'enfant (nom pris à la source, jamais du client) ──
      // - soit l'enfant appartient à la famille connectée ;
      // - soit c'est un enfant LIÉ, explicitement autorisé par l'admin, ET la
      //   sourceFamilyId annoncée correspond à celle enregistrée dans le lien.
      let childName: string;
      if (childrenMap.has(item.childId)) {
        childName = childrenMap.get(item.childId) || "";
      } else if (linkedMap.has(item.childId)) {
        const link = linkedMap.get(item.childId)!;
        // La sourceFamilyId annoncée doit correspondre au lien enregistré.
        if (item.sourceFamilyId && item.sourceFamilyId !== link.sourceFamilyId) {
          notOwned.push(item.childId); continue;
        }
        childName = link.childName;
      } else {
        notOwned.push(item.childId);
        continue;
      }

      // ── Forfait annoncé : vérifié à la source ──────────────────────────
      // `paymentSource: "forfait"` et `forfaitId` venaient du client sans
      // contrôle : n'importe qui pouvait se déclarer couvert par un forfait
      // inexistant. On n'accepte l'identifiant que s'il désigne un forfait
      // réel, appartenant à la famille connectée et non clôturé. Sinon on
      // stocke null — l'inscription reste tenue et devra être payée.
      // Fiche de l'enfant (âge, galop) pour la compatibilité de niveau d'une
      // promenade. Un enfant lié vit dans une autre famille : pas de fiche
      // ici, la compatibilité n'est alors pas vérifiée côté serveur.
      const enfant: any = (family.children || []).find((c: any) => c.id === item.childId) || null;
      let forfaitIdValide: string | null = null;
      if (item.forfaitId) {
        try {
          const fSnap = await adminDb.collection("forfaits").doc(String(item.forfaitId)).get();
          const f = fSnap.exists ? (fSnap.data() as any) : null;
          const proprietaire = f?.familyId === uid
            || (item.sourceFamilyId && f?.familyId === item.sourceFamilyId && linkedMap.has(item.childId));
          if (f && proprietaire && f.childId === item.childId && isForfaitActif(f.status)) {
            forfaitIdValide = String(item.forfaitId);
          } else {
            console.warn(`/api/enroll — forfaitId ${item.forfaitId} refusé pour uid=${uid}, child=${item.childId}`);
          }
        } catch (e) {
          console.warn(`/api/enroll — vérification forfait ${item.forfaitId} impossible:`, e);
        }
      }

      // ── Inscription ATOMIQUE de l'item : on lit TOUS les créneaux, on vérifie
      // que chacun a de la place (ou l'enfant déjà inscrit), puis on inscrit
      // PARTOUT ou NULLE PART. Évite qu'un stage soit inscrit à moitié mais
      // facturé en entier (faille corrigée).
      try {
        const outcome = await adminDb.runTransaction(async (tx) => {
          const refs = creneauIds.map((cid) => adminDb.collection("creneaux").doc(cid));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          // 1) Vérifier tous les créneaux avant toute écriture
          const aFixer = new Map<number, string>();
          for (let i = 0; i < snaps.length; i++) {
            const s = snaps[i];
            if (!s.exists) return { status: "missing" as const, cid: creneauIds[i] };
            const cr = s.data() as any;
            const list: any[] = cr.enrolled || [];
            if (list.some((e: any) => e.childId === item.childId)) continue; // déjà inscrit = ok
            const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
            if (list.length >= maxP) return { status: "full" as const, cid: creneauIds[i] };
            // Promenade au niveau fixé par la première inscription : le
            // premier verrouille, les suivants doivent être du même niveau.
            // Décidé ICI, dans la transaction, pour que deux premières
            // inscriptions simultanées ne fixent pas deux niveaux.
            const decision = deciderInscriptionNiveau(cr, item.niveauPromenade, estStaff);
            if (!decision.ok) return { status: decision.code, cid: creneauIds[i], niveauFixe: decision.niveauFixe };
            const niveauVise = decision.fixer || (estNiveauPromenade(cr.niveauFixe) ? cr.niveauFixe : null);
            if (niveauVise && !estStaff) {
              const compat = compatibiliteCavalier(niveauVise, { birthDate: enfant?.birthDate, galopLevel: enfant?.galopLevel });
              if (!compat.ok) return { status: "niveau_inapte" as const, cid: creneauIds[i], niveauFixe: niveauVise, raison: compat.raison };
            }
            if (decision.fixer) aFixer.set(i, decision.fixer);
          }
          // 2) Tout est bon → inscrire partout
          for (let i = 0; i < snaps.length; i++) {
            const cr = snaps[i].data() as any;
            const list: any[] = cr.enrolled || [];
            if (list.some((e: any) => e.childId === item.childId)) continue;
            const entry: any = {
              childId: item.childId,
              childName,
              familyId: uid,
              familyName,
              enrolledAt: new Date().toISOString(),
            };
            if (item.sourceFamilyId) entry.sourceFamilyId = item.sourceFamilyId;
            if (item.paymentSource) entry.paymentSource = item.paymentSource;
            if ("forfaitId" in item) entry.forfaitId = forfaitIdValide;

            // ── Place tenue : décidée par le SERVEUR, jamais par le client ──
            // Auparavant `pending` et `holdUntil` étaient recopiés du corps de
            // requête. Une famille appelant la route directement pouvait donc
            // omettre `pending` (place ferme définitive, que rien ne purge, sans
            // le moindre paiement) ou poser un `holdUntil` à cinq ans. Le
            // parcours d'inscription annuelle le faisait d'ailleurs nominalement.
            //
            // Règle : toute inscription posée par une famille est TENUE. Elle
            // devient définitive quand l'encaissement est confirmé
            // (confirmerPlacesTenues, appelé par /api/cawl/status, le webhook et
            // la validation admin d'une déclaration), et repart sinon via le cron
            // de purge. Seul le staff pose une inscription ferme.
            const tenue = estStaff ? !!item.pending : true;
            if (tenue) {
              entry.pending = true;
              // Durée calculée côté serveur à partir du mode de règlement :
              // trente minutes pour une CB en ligne, sept jours pour un chèque
              // ou des espèces que le bureau encaissera plus tard.
              entry.holdUntil = dateExpirationHold(new Date(), item.paymentMethod);
              if (item.paymentMethod) entry.paymentMethod = item.paymentMethod;
            }
            if (item.niveauPromenade && estNiveauPromenade(item.niveauPromenade)) entry.niveauPromenade = item.niveauPromenade;
            const fixer = aFixer.get(i);
            tx.update(refs[i], {
              enrolled: [...list, entry],
              enrolledCount: list.length + 1,
              ...(fixer ? { niveauFixe: fixer, niveauFixeLe: new Date().toISOString(), niveauFixePar: childName } : {}),
            });
          }
          return { status: "ok" as const };
        });
        if (outcome.status === "ok") enrolled.push(...creneauIds);
        else if (outcome.status === "full") full.push(outcome.cid);
        else if (outcome.status === "missing") missing.push(outcome.cid);
        else if (outcome.status === "niveau_requis" || outcome.status === "niveau_different" || outcome.status === "niveau_inapte") {
          // Refus lié au niveau de la promenade : message clair, rien d'inscrit.
          const fixe = estNiveauPromenade(outcome.niveauFixe) ? LIBELLE_NIVEAU[outcome.niveauFixe] : "";
          const error = outcome.status === "niveau_requis"
            ? "Indiquez le niveau de votre cavalier pour cette promenade."
            : outcome.status === "niveau_different"
              ? `Cette promenade est réservée au niveau ${fixe}, fixé par la première inscription. Choisissez une promenade de votre niveau ou un autre dimanche.`
              : `Cette promenade est de niveau ${fixe}. ${(outcome as any).raison || ""}`.trim();
          return NextResponse.json({ error, code: "NIVEAU_PROMENADE", creneauId: outcome.cid, niveauFixe: outcome.niveauFixe }, { status: 409 });
        }
      } catch (e) {
        console.error(`/api/enroll — échec item (child ${item.childId}):`, e);
        full.push(creneauIds[0]);
      }
    }

    // ── Créneau introuvable → ÉCHEC, jamais un succès silencieux ──────────
    // Ce cas était ignoré : la transaction renvoyait "missing", la route n'en
    // faisait rien, et comme `full` et `notOwned` restaient vides, elle
    // répondait `{ ok: true, enrolled: [] }` en HTTP 200. Le navigateur, qui
    // ne teste que `res.ok`, poursuivait : il créait la réservation ET le
    // paiement pour un cours qui n'existe pas, puis partait vers CAWL.
    //
    // C'est exactement le symptôme « ça m'a inscrit sur un cours qui n'existe
    // pas et ça m'a enregistré le paiement ». Il suffit que la liste des
    // créneaux du navigateur soit périmée — page ouverte depuis un moment,
    // créneau supprimé ou base réinitialisée entre-temps.
    if (missing.length > 0) {
      console.warn(`/api/enroll — créneaux introuvables pour uid=${uid}:`, missing);
      return NextResponse.json(
        {
          error: "Ce créneau n'existe plus. Rafraîchis la page : le planning a changé depuis que tu l'as ouverte.",
          code: "CRENEAU_INTROUVABLE",
          missing, full, notOwned,
        },
        { status: 409 }
      );
    }

    // Un item n'a pas pu être inscrit entièrement (complet) → on refuse, pour que
    // le client n'aille pas facturer une inscription partielle.
    if (full.length > 0) {
      return NextResponse.json({ error: "Créneau(x) complet(s)", full, notOwned }, { status: 409 });
    }
    if (enrolled.length === 0 && notOwned.length > 0) {
      return NextResponse.json({ error: "Enfant non autorisé", notOwned }, { status: 403 });
    }

    // Garde-fou : une demande qui n'inscrit personne ne peut pas être un
    // succès. Sans lui, tout nouveau cas non prévu retomberait dans le même
    // piège — répondre 200 à une inscription qui n'a rien fait.
    if (enrolled.length === 0) {
      console.error(`/api/enroll — aucune inscription réalisée pour uid=${uid}`, { items: items.length });
      return NextResponse.json(
        { error: "Aucune inscription n'a pu être enregistrée. Rafraîchis la page et réessaie.", full, notOwned, missing },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, enrolled, full, notOwned });
  } catch (e: any) {
    console.error("/api/enroll — erreur:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
