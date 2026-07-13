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
    creSnap.forEach((doc) => {
      const c = doc.data() as any;
      const spots = (c.maxPlaces || 0) - (Array.isArray(c.enrolled) ? c.enrolled.length : 0);
      if (spots > 0) {
        available.push({
          titre: c.activityTitle || "",
          type: c.activityType || "cours",
          date: c.date,
          horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
          places: spots,
          prixTTC:
            typeof c.priceTTC === "number"
              ? c.priceTTC
              : typeof c.priceHT === "number"
              ? Math.round(c.priceHT * (1 + (c.tvaTaux ?? 5.5) / 100) * 100) / 100
              : null,
          moniteur: c.monitor || "",
        });
      }
    });
    // On borne la liste transmise à l'IA (évite un prompt géant).
    const activitesDispo = available.slice(0, 60);

    // ── 2. Contexte famille si l'expéditeur est connu ─────────────────
    let familleContexte: any = null;
    const fromEmail = (from || "").trim().toLowerCase();
    if (fromEmail) {
      try {
        const famSnap = await adminDb
          .collection("families")
          .where("parentEmail", "==", fromEmail)
          .limit(1)
          .get();
        if (!famSnap.empty) {
          const f = famSnap.docs[0].data() as any;
          familleContexte = {
            parent: f.parentName || "",
            enfants: (f.children || []).map((ch: any) => ({
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
- Si tu proposes une activité, choisis-la en fonction de la demande et, si connu, de l'âge/galop de l'enfant (souvent indiqués dans le titre, ex "Stage 3/4 ans", "galop d'argent 8/10 ans").
- Si rien ne correspond ou si le mail n'est pas une demande de prestation, laisse "suggestions" vide.
- Le brouillon est une PROPOSITION que le gérant relira et enverra lui-même. Ne promets jamais une inscription faite.

Format JSON attendu:
{
  "classification": "info" | "inscription" | "administratif" | "autre",
  "resume": "1-2 phrases",
  "brouillon": "corps du mail de réponse en français",
  "suggestions": [ { "titre": "...", "date": "YYYY-MM-DD", "horaire": "...", "places": N, "prixTTC": N, "pourquoi": "raison courte" } ]
}`;

    const userContent = `MAIL REÇU
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

    return NextResponse.json({
      ok: true,
      classification: parsed.classification || "autre",
      resume: parsed.resume || "",
      brouillon: parsed.brouillon || "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
      familleConnue: !!familleContexte,
      nbActivitesDispo: activitesDispo.length,
    });
  } catch (e: any) {
    console.error("[inbox-assistant]", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
