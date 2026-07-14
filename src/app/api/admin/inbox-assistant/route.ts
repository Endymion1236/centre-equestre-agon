import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/inbox-assistant
// Étape 1 + 2 de l'assistant email : à partir d'un mail (from/subject/body),
//   - classe (info / inscription / administratif / autre)
//   - résume en 1-2 phrases
//   - rédige un BROUILLON de réponse (jamais envoyé automatiquement)
//   - propose 0-3 prestations RÉELLEMENT disponibles (ancrage : créneaux,
//     places restantes, tarifs, + contexte enfants si l'expéditeur est connu)
//
// Ne fait AUCUNE action (pas d'envoi, pas d'inscription). Sortie = suggestions.
// ═══════════════════════════════════════════════════════════════════

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// YYYY-MM-DD du jour à Paris (process Vercel en UTC → on force Europe/Paris).
function todayParis(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA → "YYYY-MM-DD"
}

// Jour de semaine + date en toutes lettres (ex "mardi 14 juillet 2026").
function labelFr(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
// Nom du jour seul (ex "samedi").
function jourFr(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long" }).format(d);
}
// Samedi et dimanche du week-end à venir (à partir de today).
function prochainWeekend(today: string): { samedi: string; dimanche: string } {
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=dim .. 6=sam
  const toSat = (6 - dow + 7) % 7; // 0 si aujourd'hui samedi
  const sat = new Date(d);
  sat.setUTCDate(d.getUTCDate() + toSat);
  const sun = new Date(sat);
  sun.setUTCDate(sat.getUTCDate() + 1);
  return { samedi: sat.toISOString().slice(0, 10), dimanche: sun.toISOString().slice(0, 10) };
}

function ageFrom(birth: any): number | null {
  if (!birth) return null;
  let d: Date | null = null;
  if (typeof birth === "string") d = new Date(birth.length <= 10 ? birth + "T12:00:00Z" : birth);
  else if (birth?.toDate) d = birth.toDate();
  else if (birth?.seconds) d = new Date(birth.seconds * 1000);
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { from, subject, body } = await req.json();
    if (!body && !subject) {
      return NextResponse.json({ error: "Mail vide (subject/body requis)" }, { status: 400 });
    }

    const today = todayParis();
    // Horizon de lecture borné (≈ 9 semaines) : couvre l'été/les demandes
    // courantes SANS lire tout un planning programmé loin (coût des lectures).
    // Au-delà, l'assistant invite la famille à préciser sa demande.
    const horizon = (() => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 63);
      return d.toISOString().slice(0, 10);
    })();

    // ── 1. Créneaux à venir réellement disponibles (fenêtre bornée) ───
    const creSnap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .where("date", "<=", horizon)
      .orderBy("date", "asc")
      .limit(1500)
      .get();

    const available: any[] = [];
    const creneauMap = new Map<string, any>(); // id → données serveur autoritaires

    // Critères d'éligibilité par activité (ageMin/ageMax/galopRequired), saisis
    // dans /admin/activites. Reliés au créneau par le titre d'activité.
    const eligByTitle = new Map<string, any>();
    try {
      const actSnap = await adminDb.collection("activities").get();
      actSnap.forEach((d) => {
        const a = d.data() as any;
        if (a.title) {
          eligByTitle.set(String(a.title).trim().toLowerCase(), {
            ageMin: typeof a.ageMin === "number" ? a.ageMin : null,
            ageMax: typeof a.ageMax === "number" ? a.ageMax : null,
            galopRequired: a.galopRequired || null,
            conditionsAcces: a.conditionsAcces || null,
          });
        }
      });
    } catch {
      /* pas d'activités → pas de critères */
    }
    creSnap.forEach((doc) => {
      const c = doc.data() as any;
      const enrolledCount = Array.isArray(c.enrolled) ? c.enrolled.length : 0;
      const spots = (c.maxPlaces || 0) - enrolledCount;
      const prixTTC =
        typeof c.priceTTC === "number"
          ? c.priceTTC
          : typeof c.priceHT === "number"
          ? Math.round(c.priceHT * (1 + (c.tvaTaux ?? 5.5) / 100) * 100) / 100
          : null;
      if (spots > 0) {
        const isStage = (c.activityType || "") === "stage" || (c.activityType || "") === "stage_journee";
        const demiJourneeOuverte = isStage && !!c.allowDayBooking;
        const elig = eligByTitle.get(String(c.activityTitle || "").trim().toLowerCase()) || {};
        available.push({
          creneauId: doc.id,
          titre: c.activityTitle || "",
          type: c.activityType || "cours",
          date: c.date,
          jour: jourFr(c.date),
          horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
          places: spots,
          prixTTC,
          demiJourneeOuverte,
          prixJour: demiJourneeOuverte && typeof c.priceTTCDay === "number" && c.priceTTCDay > 0 ? c.priceTTCDay : null,
          ageMin: elig.ageMin ?? null,
          ageMax: elig.ageMax ?? null,
          galopRequired: elig.galopRequired ?? null,
          conditionsAcces: elig.conditionsAcces ?? null,
          moniteur: c.monitor || "",
          // Clé de regroupement semaine (même logique que la page réservation famille)
          stageKey: (c.stageGroupId || c.activityId || "") + "",
        });
        creneauMap.set(doc.id, {
          titre: c.activityTitle || "",
          type: c.activityType || "cours",
          date: c.date,
          horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
          spots,
          prixTTC,
          ageMin: elig.ageMin ?? null,
          ageMax: elig.ageMax ?? null,
        });
      }
    });
    // On borne la liste transmise à l'IA (évite un prompt géant) MAIS on garantit
    // la couverture de tout l'été : on inclut TOUS les stages (le produit que les
    // familles réservent, peu nombreux), puis on complète avec un échantillon des
    // autres activités réparti sur les dates (pas seulement les plus proches).
    const isStageType = (t: string) => t === "stage" || t === "stage_journee";
    const stagesJours = available.filter((a) => isStageType(a.type));
    const autresDispo = available.filter((a) => !isStageType(a.type));

    // ── Regroupement des stages en SEMAINES (même clé que la page réservation :
    //    stageGroupId (lot de création) + lundi de la semaine). Un "stage" pour
    //    une famille = la semaine entière ; le prix TTC du créneau est le prix
    //    SEMAINE. On propose donc des GROUPES, jamais des jours isolés.
    const mondayOf = (dateStr: string) => {
      const d = new Date(dateStr + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const groupMapTmp = new Map<string, any[]>();
    stagesJours.forEach((a) => {
      const key = `${a.stageKey}_${mondayOf(a.date)}`;
      if (!groupMapTmp.has(key)) groupMapTmp.set(key, []);
      groupMapTmp.get(key)!.push(a);
    });
    const stageGroupMap = new Map<string, any>(); // groupId → groupe autoritaire
    const stagesDispo: any[] = [];
    groupMapTmp.forEach((jours, key) => {
      jours.sort((x, y) => (x.date < y.date ? -1 : 1));
      const first = jours[0];
      const last = jours[jours.length - 1];
      // Places du groupe = minimum des places restantes sur les jours (il faut
      // une place chaque jour pour inscrire la semaine).
      const places = Math.min(...jours.map((j) => j.places));
      const groupe = {
        groupId: key,
        titre: first.titre,
        type: first.type,
        nbJours: jours.length,
        dateDebut: first.date,
        dateFin: last.date,
        periode:
          jours.length > 1
            ? `du ${jourFr(first.date)} ${labelFr(first.date).replace(/^\S+\s/, "")} au ${jourFr(last.date)} ${labelFr(last.date).replace(/^\S+\s/, "")}`
            : labelFr(first.date),
        horaire: first.horaire,
        places,
        prixSemaineTTC: first.prixTTC, // prix TTC du créneau = prix de la SEMAINE COMPLÈTE
        demiJourneeOuverte: jours.some((j) => j.demiJourneeOuverte),
        prixJour: jours.find((j) => j.prixJour)?.prixJour ?? null,
        ageMin: first.ageMin,
        ageMax: first.ageMax,
        galopRequired: first.galopRequired,
        conditionsAcces: first.conditionsAcces,
        moniteur: first.moniteur,
      };
      stagesDispo.push(groupe);
      stageGroupMap.set(key, { ...groupe, creneauIds: jours.map((j) => j.creneauId) });
    });
    stagesDispo.sort((x, y) => (x.dateDebut < y.dateDebut ? -1 : 1));
    // Échantillon d'"autres" réparti : 1 sur N pour couvrir toute la période.
    const stepAutres = Math.max(1, Math.ceil(autresDispo.length / 50));
    const autresEchantillon = autresDispo.filter((_, i) => i % stepAutres === 0).slice(0, 50);
    const activitesDispo = [...stagesDispo.slice(0, 120), ...autresEchantillon];

    // ── 2. Contexte famille si l'expéditeur est connu ─────────────────
    let familleContexte: any = null;
    let familyId: string | null = null;
    const childrenMap = new Map<string, string>(); // childId → prénom (validation)
    const childElig = new Map<string, { age: number | null; galop: string | null }>();
    const fromEmail = (from || "").trim().toLowerCase();
    if (fromEmail) {
      try {
        const famSnap = await adminDb
          .collection("families")
          .where("parentEmail", "==", fromEmail)
          .limit(1)
          .get();
        if (!famSnap.empty) {
          familyId = famSnap.docs[0].id;
          const f = famSnap.docs[0].data() as any;
          (f.children || []).forEach((ch: any) => {
            if (ch.id) {
              childrenMap.set(ch.id, ch.firstName || "");
              childElig.set(ch.id, {
                age: ageFrom(ch.birthDate),
                galop: ch.galopLevel && ch.galopLevel !== "—" ? ch.galopLevel : null,
              });
            }
          });
          familleContexte = {
            parent: f.parentName || "",
            enfants: (f.children || []).map((ch: any) => ({
              childId: ch.id || null,
              prenom: ch.firstName || "",
              age: ageFrom(ch.birthDate),
              galop: ch.galopLevel && ch.galopLevel !== "—" ? ch.galopLevel : null,
            })),
          };
        }
      } catch {
        /* expéditeur inconnu → pas de contexte */
      }
    }

    // ── 3. Appel IA (JSON strict) ─────────────────────────────────────
    const systemPrompt = `Tu es l'assistant de la boîte email du Centre Équestre Poney Club d'Agon-Coutainville.
Tu aides le gérant à traiter ses mails. Tu réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises Markdown.

Règles:
- Ton chaleureux, professionnel, tutoiement évité avec les familles (vouvoiement), signé "Le Centre Équestre d'Agon-Coutainville".
- Tu ne proposes QUE des prestations présentes dans la liste "activitesDispo" fournie (places réelles). Jamais d'invention de date, de tarif ou de place.
- LES STAGES SONT DES SEMAINES : chaque stage fourni est un GROUPE couvrant "nbJours" jours ("periode" = du premier au dernier jour). Son "prixSemaineTTC" est le prix de la SEMAINE COMPLÈTE (les nbJours jours), PAS un prix par jour. Dans le brouillon, écris toujours le prix sans ambiguïté : "175 € la semaine complète (5 jours)". Si "demiJourneeOuverte"=true, précise qu'une formule à la journée existe (avec "prixJour" si fourni, sinon "tarif journée sur demande"). Ne propose JAMAIS deux fois la même semaine de stage.
- Pour CHAQUE suggestion : si c'est un STAGE, reprends son "groupId" exact (copie-le tel quel) et laisse creneauId à null ; si c'est une autre activité (cours, promenade…), reprends son "creneauId" exact et laisse groupId à null. N'invente jamais un identifiant.
- Si la demande vise un enfant précis de la famille connue, ajoute son "childId" (repris depuis le contexte famille). Sinon laisse childId à null.
- Si une activité, choisis-la en fonction de la demande et, si connu, de l'âge/galop de l'enfant (souvent indiqués dans le titre, ex "Stage 3/4 ans", "galop d'argent 8/10 ans").
- Pour le niveau/galop : base-toi sur le contexte famille, mais reste PRUDENT — formule "d'après nos informations, <enfant> est <galop>" et invite à confirmer le niveau. N'affirme jamais catégoriquement "correspond parfaitement à son niveau" (la fiche peut être à jour ou non).
- Équivalence des niveaux (galops "poney" ↔ numérotés, MÊME progression, à respecter strictement) : Galop de Bronze = débutant/initiation ; Galop d'Argent = Galop 1 ; Galop d'Or = Galop 2 ; puis Galop 3, 4, 5, 6, 7 (numérotés). Choisis un stage du MÊME niveau que l'enfant (ex : enfant Galop d'Or = Galop 2 → stage "Galop d'or" ou "Galop 2" ; enfant Galop d'Argent = Galop 1 → stage "Galop d'argent" ou "Galop 1" ; débutant → stage "Bronze"/initiation). JAMAIS un niveau inférieur ni supérieur au sien. Si aucun stage du bon niveau n'est disponible, dis-le honnêtement et propose de confirmer, plutôt que de rétrograder.
- Dates : le vrai jour de chaque activité est dans son champ "jour" — NE LE RECALCULE JAMAIS, reprends-le tel quel. "ce week-end" = le samedi et dimanche fournis (CE WEEK-END) ; "cette semaine" = la semaine (lundi→dimanche) contenant la date du jour ; "demain" = jour+1. Ne propose comme "ce week-end" que des activités dont la date correspond au samedi/dimanche fournis ; sinon précise honnêtement la vraie date.
- ÉLIGIBILITÉ : chaque activité peut porter des critères "ageMin", "ageMax", "galopRequired" et un texte libre "conditionsAcces". Respecte-les STRICTEMENT. Applique ce qui est VÉRIFIABLE d'après le contexte famille (âge, galop) : ne propose une activité que si l'enfant satisfait l'âge [ageMin, ageMax] et le galop requis (table d'équivalence). Pour les conditions du texte "conditionsAcces" qui ne sont PAS vérifiables dans nos données (ex : "maîtrise du trot enlevé", "maîtrise des 3 allures", "évaluation préalable en carrière"), ne les affirme jamais comme acquises : mentionne-les comme "à confirmer avec la famille". Si "conditionsAcces" mentionne une clause de non-remboursement ou une évaluation préalable, rappelle-la dans ta réponse. Dans le doute, demande à confirmer plutôt que de proposer à tort.
- Demi-journées : certains stages sont ouverts à la journée (champ "demiJourneeOuverte"=true, avec éventuellement "prixJour"). Si la famille cherche une formule plus courte, tu peux mentionner que ce stage est aussi accessible à la journée. Ne le fais que si demiJourneeOuverte=true.
- Si rien ne correspond ou si le mail n'est pas une demande de prestation, laisse "suggestions" vide.
- Le brouillon est une PROPOSITION que le gérant relira et enverra lui-même. Ne promets jamais une inscription faite.

Format JSON attendu:
{
  "classification": "info" | "inscription" | "administratif" | "autre",
  "resume": "1-2 phrases",
  "brouillon": "corps du mail de réponse en français",
  "suggestions": [ { "groupId": "..." | null, "creneauId": "..." | null, "childId": "..." | null, "pourquoi": "raison courte" } ]
}`;

    const we = prochainWeekend(today);
    const userContent = `DATE DU JOUR : ${labelFr(today)} (${today}).
CE WEEK-END = samedi ${we.samedi} et dimanche ${we.dimanche}.
PLANNING CONSULTABLE ICI : du ${today} au ${horizon} (les activités fournies ci-dessous couvrent cette période). Pour une demande portant sur une date APRÈS ${horizon}, ne dis pas "rien de disponible" : indique que le planning en ligne va jusqu'au ${horizon} et invite poliment la famille à préciser/reformuler pour ces dates, que tu vérifieras.
IMPORTANT : n'essaie JAMAIS de recalculer un jour de semaine toi-même. Chaque activité fournie contient déjà son champ "jour" (le vrai jour de la semaine) — utilise-le tel quel.

MAIL REÇU
De: ${from || "(inconnu)"}
Objet: ${subject || "(sans objet)"}
Corps:
${(body || "").slice(0, 4000)}

CONTEXTE FAMILLE (si expéditeur connu):
${familleContexte ? JSON.stringify(familleContexte) : "expéditeur inconnu de la base"}

ACTIVITÉS RÉELLEMENT DISPONIBLES (à venir, places > 0):
${JSON.stringify(activitesDispo)}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = message.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Réponse IA non parsable", raw: cleaned.slice(0, 500) },
        { status: 502 }
      );
    }

    // ── Re-validation SERVEUR des suggestions (le client/IA ne décide rien) ──
    // Pour chaque suggestion : le créneau doit exister et avoir encore de la
    // place ; l'enfant (si fourni) doit appartenir à la famille ; le prix est
    // repris de la source. `actionable` = prêt pour une future inscription.
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [];
    const suggestions = rawSuggestions.map((s: any) => {
      const childId = s.childId && childrenMap.has(s.childId) ? s.childId : null;
      const childName = childId ? childrenMap.get(childId) || null : null;

      // Contrôle d'âge serveur (mutualisé groupe/créneau).
      const checkAge = (ageMin: any, ageMax: any): { ok: boolean; note: string | null } => {
        if (!childId) return { ok: true, note: null };
        const age = childElig.get(childId)?.age ?? null;
        if (age === null) return { ok: true, note: null };
        if (typeof ageMin === "number" && age < ageMin) return { ok: false, note: `réservé dès ${ageMin} ans` };
        if (typeof ageMax === "number" && age > ageMax) return { ok: false, note: `réservé jusqu'à ${ageMax} ans` };
        return { ok: true, note: null };
      };

      // ── Cas STAGE SEMAINE (groupId) : tous les jours du groupe, prix semaine ──
      if (s.groupId && stageGroupMap.has(s.groupId)) {
        const g = stageGroupMap.get(s.groupId)!;
        const placeOk = g.places > 0;
        const { ok: ageOk, note: ageNote } = checkAge(g.ageMin, g.ageMax);
        const actionable = placeOk && ageOk;
        return {
          groupId: s.groupId,
          creneauId: null,
          creneauIds: g.creneauIds, // TOUS les jours de la semaine (inscription entière)
          titre: g.titre,
          type: g.type,
          date: g.dateDebut,
          dateFin: g.dateFin,
          periode: g.periode,
          nbJours: g.nbJours,
          horaire: g.horaire,
          places: g.places,
          prixTTC: g.prixSemaineTTC, // prix AUTORITAIRE de la SEMAINE
          prixMode: "semaine",
          prixJour: g.prixJour,
          childId,
          childName,
          pourquoi: s.pourquoi || "",
          actionable,
          note: !placeOk ? "complet" : !ageOk ? ageNote : null,
        };
      }

      // ── Cas activité simple (creneauId) : comportement existant ──
      const cr = s.creneauId ? creneauMap.get(s.creneauId) : null;
      const placeOk = !!cr && cr.spots > 0;
      const { ok: ageOk, note: ageNote } = cr ? checkAge(cr.ageMin, cr.ageMax) : { ok: true, note: null };
      const actionable = placeOk && ageOk;
      return {
        groupId: null,
        creneauId: cr ? s.creneauId : null,
        creneauIds: cr ? [s.creneauId] : [],
        titre: cr ? cr.titre : "",
        type: cr ? cr.type : null,
        date: cr ? cr.date : null,
        dateFin: null,
        periode: null,
        nbJours: 1,
        horaire: cr ? cr.horaire : null,
        places: cr ? cr.spots : 0,
        prixTTC: cr ? cr.prixTTC : null, // prix AUTORITAIRE (source créneau)
        prixMode: "unitaire",
        prixJour: null,
        childId,
        childName,
        pourquoi: s.pourquoi || "",
        actionable,
        note: !cr ? "créneau/stage introuvable ou plus dispo" : !placeOk ? "complet" : !ageOk ? ageNote : null,
      };
    });

    return NextResponse.json({
      ok: true,
      classification: parsed.classification || "autre",
      resume: parsed.resume || "",
      brouillon: parsed.brouillon || "",
      suggestions,
      familleConnue: !!familleContexte,
      familyId,
      enfants: familleContexte ? familleContexte.enfants : [],
      nbActivitesDispo: activitesDispo.length,
    });
  } catch (e: any) {
    console.error("[inbox-assistant]", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
