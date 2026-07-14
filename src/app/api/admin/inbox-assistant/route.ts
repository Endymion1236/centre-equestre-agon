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

    // ── 1. Créneaux à venir réellement disponibles ────────────────────
    const creSnap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .orderBy("date", "asc")
      .limit(400)
      .get();

    const available: any[] = [];
    const creneauMap = new Map<string, any>(); // id → données serveur autoritaires
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
          moniteur: c.monitor || "",
        });
        creneauMap.set(doc.id, {
          titre: c.activityTitle || "",
          type: c.activityType || "cours",
          date: c.date,
          horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
          spots,
          prixTTC,
        });
      }
    });
    // On borne la liste transmise à l'IA (évite un prompt géant).
    const activitesDispo = available.slice(0, 60);

    // ── 2. Contexte famille si l'expéditeur est connu ─────────────────
    let familleContexte: any = null;
    let familyId: string | null = null;
    const childrenMap = new Map<string, string>(); // childId → prénom (validation)
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
            if (ch.id) childrenMap.set(ch.id, ch.firstName || "");
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
- Pour CHAQUE suggestion, tu DOIS reprendre le "creneauId" exact de l'activité choisie dans la liste (copie-le tel quel, ne l'invente jamais).
- Si la demande vise un enfant précis de la famille connue, ajoute son "childId" (repris depuis le contexte famille). Sinon laisse childId à null.
- Si une activité, choisis-la en fonction de la demande et, si connu, de l'âge/galop de l'enfant (souvent indiqués dans le titre, ex "Stage 3/4 ans", "galop d'argent 8/10 ans").
- Pour le niveau/galop : base-toi sur le contexte famille, mais reste PRUDENT — formule "d'après nos informations, <enfant> est <galop>" et invite à confirmer le niveau. N'affirme jamais catégoriquement "correspond parfaitement à son niveau" (la fiche peut être à jour ou non).
- Équivalence des niveaux (galops "poney" ↔ numérotés, MÊME progression, à respecter strictement) : Galop de Bronze = débutant/initiation ; Galop d'Argent = Galop 1 ; Galop d'Or = Galop 2 ; puis Galop 3, 4, 5, 6, 7 (numérotés). Choisis un stage du MÊME niveau que l'enfant (ex : enfant Galop d'Or = Galop 2 → stage "Galop d'or" ou "Galop 2" ; enfant Galop d'Argent = Galop 1 → stage "Galop d'argent" ou "Galop 1" ; débutant → stage "Bronze"/initiation). JAMAIS un niveau inférieur ni supérieur au sien. Si aucun stage du bon niveau n'est disponible, dis-le honnêtement et propose de confirmer, plutôt que de rétrograder.
- Dates : le vrai jour de chaque activité est dans son champ "jour" — NE LE RECALCULE JAMAIS, reprends-le tel quel. "ce week-end" = le samedi et dimanche fournis (CE WEEK-END) ; "cette semaine" = la semaine (lundi→dimanche) contenant la date du jour ; "demain" = jour+1. Ne propose comme "ce week-end" que des activités dont la date correspond au samedi/dimanche fournis ; sinon précise honnêtement la vraie date.
- Demi-journées : certains stages sont ouverts à la journée (champ "demiJourneeOuverte"=true, avec éventuellement "prixJour"). Si la famille cherche une formule plus courte, tu peux mentionner que ce stage est aussi accessible à la journée. Ne le fais que si demiJourneeOuverte=true.
- Si rien ne correspond ou si le mail n'est pas une demande de prestation, laisse "suggestions" vide.
- Le brouillon est une PROPOSITION que le gérant relira et enverra lui-même. Ne promets jamais une inscription faite.

Format JSON attendu:
{
  "classification": "info" | "inscription" | "administratif" | "autre",
  "resume": "1-2 phrases",
  "brouillon": "corps du mail de réponse en français",
  "suggestions": [ { "creneauId": "...", "childId": "..." | null, "pourquoi": "raison courte" } ]
}`;

    const we = prochainWeekend(today);
    const userContent = `DATE DU JOUR : ${labelFr(today)} (${today}).
CE WEEK-END = samedi ${we.samedi} et dimanche ${we.dimanche}.
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
      const cr = s.creneauId ? creneauMap.get(s.creneauId) : null;
      const childId = s.childId && childrenMap.has(s.childId) ? s.childId : null;
      const childName = childId ? childrenMap.get(childId) || null : null;
      const placeOk = !!cr && cr.spots > 0;
      return {
        creneauId: cr ? s.creneauId : null,
        titre: cr ? cr.titre : "",
        type: cr ? cr.type : null,
        date: cr ? cr.date : null,
        horaire: cr ? cr.horaire : null,
        places: cr ? cr.spots : 0,
        prixTTC: cr ? cr.prixTTC : null, // prix AUTORITAIRE (source créneau)
        childId,
        childName,
        pourquoi: s.pourquoi || "",
        actionable: placeOk, // créneau réel + place dispo
        note: !cr ? "créneau introuvable/plus dispo" : !placeOk ? "complet" : null,
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
