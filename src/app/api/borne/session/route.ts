import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClubInfo } from "@/lib/club-info";
import { toParisDateString } from "@/lib/date-local";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Crée une session éphémère OpenAI Realtime pour la borne d'accueil.
 *
 * Le navigateur ne voit JAMAIS la clé OpenAI : cette route génère un
 * client secret à durée de vie courte (~1 min pour établir la connexion
 * WebRTC), avec les instructions et les outils verrouillés CÔTÉ SERVEUR.
 * Le client ne peut donc ni changer le prompt, ni ajouter d'outils.
 *
 * Comme pour /api/borne : LECTURE SEULE. L'unique outil (chercher_creneaux)
 * est exécuté par le client via /api/borne/creneaux, elle-même authentifiée
 * et limitée en débit.
 */
export async function POST(req: NextRequest) {
  // 🔒 Auth : la tablette borne reste connectée avec un compte Firebase
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 🚦 6 sessions / minute max : une session couvre toute une conversation,
  // en créer plus vite est le signe d'une boucle de reconnexion ou d'un abus
  // (chaque minute de conversation Realtime a un coût audio non négligeable)
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne_session",
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurée" }, { status: 500 });
  }

  const club = await getClubInfo();
  const today = toParisDateString();

  // ⚠️ Ne JAMAIS mettre l'IBAN / SIRET ici : la borne est publique.
  const instructions = `Tu es Câlin, l'assistant vocal d'accueil du ${club.nom}. Tu es affiché sur une borne à l'entrée du club et tu discutes de vive voix avec les visiteurs.

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
1. Tu es en LECTURE SEULE. Tu ne peux PAS inscrire, réserver, ni encaisser — tu n'as aucun outil pour ça. Si quelqu'un dit « inscris-moi », « oui je réserve », « vas-y » : tu ne dis JAMAIS « c'est fait ». Tu expliques que l'inscription se fait depuis l'espace cavalier du site, sur le téléphone des parents ou à l'accueil.
2. Tu ne connais AUCUNE information personnelle : ni les familles inscrites, ni les enfants, ni les paiements. Si on te le demande, réponds que tu n'y as pas accès et qu'il faut voir à l'accueil.
3. Utilise chercher_creneaux pour toute question de disponibilité, de date ou de prix de séance. Ne devine jamais une disponibilité. Pendant que tu cherches, dis-le brièvement (« je regarde le planning »).
4. Réponses COURTES et parlées : 1 à 3 phrases, ton chaleureux, vouvoiement. Jamais de listes énumérées interminables — propose plutôt de préciser (« plutôt quelle semaine ? »).
5. Si tu ne sais pas : oriente vers l'accueil ou le ${club.tel}.
6. Tu parles UNIQUEMENT français, même si on te parle une autre langue (réponds alors que tu ne parles que français, poliment).
7. Beaucoup de visiteurs sont des enfants : reste simple, bienveillant et adapté à tous les âges.`;

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
          instructions,
          audio: {
            input: {
              // VAD sémantique : le modèle attend la fin réelle de la phrase
              // au lieu de couper sur un silence court — crucial avec des
              // enfants qui hésitent
              turn_detection: { type: "semantic_vad" },
            },
            output: {
              voice: "marin",
            },
          },
          tools: [
            {
              type: "function",
              name: "chercher_creneaux",
              description:
                "Cherche les créneaux à venir (cours, stages, balades…) avec horaires, tarifs et places restantes. À utiliser pour toute question de disponibilité, date ou prix de séance.",
              parameters: {
                type: "object",
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
          ],
          tool_choice: "auto",
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Borne session] OpenAI a refusé la création:", res.status, errBody.slice(0, 500));
      return NextResponse.json({ error: "Impossible de créer la session vocale" }, { status: 502 });
    }

    const data = await res.json();
    // On ne renvoie que le strict nécessaire au navigateur
    return NextResponse.json({ clientSecret: data.value, expiresAt: data.expires_at ?? null });
  } catch (e: any) {
    console.error("[Borne session] Erreur:", e?.message || e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
