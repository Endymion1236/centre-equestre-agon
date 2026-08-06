import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClubInfo } from "@/lib/club-info";
import { toParisDateString } from "@/lib/date-local";
import {
  addCalendarDays,
  comparePublicPlanningSlots,
  isCalendarDate,
  tarifJournee,
  toPublicPlanningSlot,
  type PublicPlanningSlot,
} from "@/lib/public-planning";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Borne d'accueil — assistant vocal en LECTURE SEULE.
 *
 * Contrairement à /api/agent (admin, écriture avec confirmation), cette
 * route ne dispose d'AUCUN outil d'écriture : la borne est un écran
 * public à l'accueil du club, manipulé par n'importe quel visiteur.
 * Une borne qui écrit en base = inscriptions fantômes, homonymes mal
 * appariés, enfants inscrits par erreur. La borne RENSEIGNE, l'inscription
 * réelle passe par l'espace cavalier (lien affiché à l'écran).
 *
 * Les données planning passent par toPublicPlanningSlot : jamais les noms
 * des inscrits ni les identifiants familles — uniquement places restantes,
 * horaires et tarifs, comme sur le planning public du site.
 */

// ── Outils LECTURE SEULE ──────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "chercher_creneaux",
    description:
      "Cherche les créneaux à venir (cours, stages, balades…) avec horaires, tarifs et places restantes. Utilise cet outil dès qu'on te demande des disponibilités, des dates, des prix de séances ou « est-ce qu'il reste de la place ».",
    input_schema: {
      type: "object" as const,
      properties: {
        start: { type: "string", description: "Date de début YYYY-MM-DD (défaut : aujourd'hui)" },
        end: { type: "string", description: "Date de fin YYYY-MM-DD (défaut : début + 42 jours, max +120 jours)" },
        type: {
          type: "string",
          enum: ["cours", "stage", "stage_journee", "balade", "competition", "anniversaire"],
          description: "Filtrer par type d'activité (optionnel)",
        },
      },
    },
  },
];

// ── Exécution ─────────────────────────────────────────────────────────────────

async function chercherCreneaux(input: any): Promise<string> {
  const today = toParisDateString();
  const start = isCalendarDate(input?.start || "") ? input.start : today;
  // Ne jamais renvoyer le passé : la borne parle toujours du futur
  const effectiveStart = start < today ? today : start;
  const requestedEnd = isCalendarDate(input?.end || "") ? input.end : addCalendarDays(effectiveStart, 42);
  const maxEnd = addCalendarDays(effectiveStart, 120);
  const end = requestedEnd > maxEnd ? maxEnd : requestedEnd;

  const snapshot = await adminDb
    .collection("creneaux")
    .where("date", ">=", effectiveStart)
    .where("date", "<=", end)
    .get();

  let slots = snapshot.docs
    .map((d) => toPublicPlanningSlot(d.id, d.data()))
    .filter((s): s is PublicPlanningSlot => s !== null)
    .sort(comparePublicPlanningSlots);

  if (input?.type) {
    slots = slots.filter((s) => s.activityType === input.type);
  }

  if (slots.length === 0) {
    return `Aucun créneau trouvé entre le ${effectiveStart} et le ${end}${input?.type ? ` pour le type « ${input.type} »` : ""}.`;
  }

  // Format compact pour le modèle — cap à 60 lignes pour maîtriser les tokens
  const lignes = slots.slice(0, 60).map((s) => {
    const restantes = Math.max(0, s.maxPlaces - s.enrolledCount);
    const dispo = restantes === 0 ? "COMPLET" : `${restantes} place${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`;
    const prix = typeof s.priceTTC === "number" && s.priceTTC > 0 ? `${s.priceTTC}€` : "prix à confirmer à l'accueil";
    const jour = tarifJournee(s);
    const prixJour = jour ? ` (journée possible : ${jour}€)` : "";
    return `[date_iso:${s.date}] [type:${s.activityType}] ${s.activityTitle} ${s.startTime}-${s.endTime} — ${prix}${prixJour} — ${dispo}`;
  });

  const suite = slots.length > 60 ? `\n(… et ${slots.length - 60} autres créneaux — affine la période)` : "";
  return lignes.join("\n") + suite;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire : la tablette borne reste connectée avec un compte
  // dédié. Pas de route ouverte au public — les appels IA/TTS sont facturés,
  // un endpoint anonyme serait une pompe à frais.
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 🚦 Rate limit : 20 questions / minute pour la borne (une conversation
  // normale en fait 2-4 ; au-delà c'est un bug de boucle ou un abus)
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { question, history = [] } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "Question requise" }, { status: 400 });
    }

    const club = await getClubInfo();
    const today = toParisDateString();

    // ⚠️ Ne JAMAIS mettre l'IBAN / SIRET dans ce prompt : la borne est
    // publique, on ne lui confie que ce qui figure déjà sur le site vitrine.
    const systemPrompt = `Tu es Câlin, l'assistant d'accueil du ${club.nom}. Tu es affiché sur une borne à l'entrée du club et tu renseignes les visiteurs à voix haute.

DATE DU JOUR : ${today}

INFOS PRATIQUES :
- Adresse : ${club.address}
- Téléphone : ${club.tel}
- Email : ${club.email}
- Site : ${club.website}
- Activités : cours poney/cheval dès 3 ans (baby poney), stages vacances, balades à cheval sur la plage, Pony Games, mini-ferme pédagogique, anniversaires.

TARIFS DE RÉFÉRENCE :
- Forfait annuel 1×/semaine : 650€ | 2×/semaine : 1100€ | 3×/semaine : 1400€
- Adhésion : 1er enfant 60€, 2ème 40€, 3ème 20€, 4ème+ gratuit
- Licence FFE : 25€ (-18 ans) / 36€ (+18 ans)
- Stage semaine : 175€ | Stage journée : 45€
Pour les prix exacts d'un créneau précis, utilise chercher_creneaux — les prix du planning font foi.

RÈGLES ABSOLUES :
1. Tu es en LECTURE SEULE. Tu ne peux PAS inscrire, réserver, ni encaisser — tu n'as aucun outil pour ça. Si quelqu'un dit « inscris-moi », « oui je réserve », « ok vas-y » : tu ne dis JAMAIS « c'est fait ». Tu expliques que l'inscription se fait depuis l'espace cavalier et tu renvoies le lien.
2. Tu ne connais AUCUNE information personnelle : ni les familles inscrites, ni les enfants, ni les paiements. Si on te demande « est-ce que le petit Untel est inscrit », réponds que tu n'as pas accès à ces informations et qu'il faut voir à l'accueil.
3. Utilise chercher_creneaux pour toute question de disponibilité, de date ou de prix de séance. Ne devine jamais une disponibilité.
4. Réponses COURTES (1 à 3 phrases) : elles sont lues à voix haute. Pas de listes, pas de markdown, pas d'émojis.
5. Si tu ne sais pas : oriente vers l'accueil ou le ${club.tel}.
6. Tu parles français, chaleureux et poli (vouvoiement).

FORMAT DE RÉPONSE — réponds UNIQUEMENT en JSON valide, sans backticks :
{ "text": "ta réponse orale", "action": null }
Si la personne veut s'inscrire / réserver et que tu connais le créneau visé (les données contiennent [date_iso:YYYY-MM-DD] et [type:...]) :
{ "text": "…", "action": { "label": "Réserver ce créneau", "href": "/espace-cavalier/reserver?filter=TYPE&date=DATE_ISO" } }
Sinon pour une inscription générale : href = "/espace-cavalier/reserver".`;

    // Historique (alternance stricte user/assistant)
    const messages: Anthropic.MessageParam[] = [];
    for (const h of Array.isArray(history) ? history.slice(-10) : []) {
      if ((h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
        if (messages.length === 0 || messages[messages.length - 1].role !== h.role) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: question });
    } else {
      messages[messages.length - 1] = { role: "user", content: question };
    }

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages,
    });

    // Boucle outils — max 3 tours (chercher_creneaux uniquement, lecture seule)
    let loopCount = 0;
    while (response.stop_reason === "tool_use" && loopCount < 3) {
      loopCount++;
      const toolUses = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: string;
        try {
          result = tu.name === "chercher_creneaux"
            ? await chercherCreneaux(tu.input)
            : `Outil inconnu : ${tu.name}`;
        } catch (e: any) {
          console.error("[Borne] Erreur outil:", e?.message || e);
          result = "Erreur technique lors de la consultation du planning.";
        }
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = (textBlock as Anthropic.TextBlock | undefined)?.text || "";

    // Parser le JSON structuré — fallback texte brut si le modèle a dérapé
    let text = raw.trim();
    let action: { label: string; href: string } | null = null;
    try {
      const cleaned = raw
        .replace(/^\s*```json\s*/i, "")
        .replace(/^\s*```\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (parsed?.text) {
        text = String(parsed.text);
        if (parsed.action?.href && parsed.action?.label) {
          const href = String(parsed.action.href);
          // Garde-fou : uniquement des liens internes vers l'espace cavalier
          if (href.startsWith("/espace-cavalier")) {
            action = { label: String(parsed.action.label), href };
          }
        }
      }
    } catch {
      // Texte brut — on le garde tel quel
    }

    if (!text) text = "Je n'ai pas pu répondre, désolé. Vous pouvez vous renseigner à l'accueil.";

    return NextResponse.json({ text, action });
  } catch (error: any) {
    console.error("[Borne] Erreur route:", error?.message || error);
    return NextResponse.json(
      { text: "Une erreur technique est survenue. L'équipe de l'accueil pourra vous renseigner.", action: null },
      { status: 200 },
    );
  }
}
