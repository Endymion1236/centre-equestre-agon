import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { bornePromptSysteme } from "@/lib/borne-prompt";

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

  const basePrompt = await bornePromptSysteme();
  const instructions = `${basePrompt}

CE QUE MONTRE L'ÉCRAN :
Chaque fois que tu utilises chercher_creneaux, les créneaux trouvés s'affichent automatiquement à l'écran de la borne, en cartes, avec un bouton « Réserver sur mon téléphone » qui montre un code QR. Quand un créneau intéresse le visiteur, invite-le en une phrase à regarder l'écran et à scanner le code avec l'appareil photo de son téléphone : il arrive directement sur ce créneau dans son espace cavalier, où il peut réserver et payer par carte. Ne dicte jamais les créneaux un par un s'ils sont nombreux : dis qu'ils sont à l'écran et résume.

PRISE DE MESSAGES POUR L'ÉQUIPE :
Tu peux prendre un message à transmettre à l'équipe du club (outil laisser_message).

QUAND PROPOSER SPONTANÉMENT un message (sans attendre qu'on te le demande) :
- Dès que quelqu'un veut s'inscrire ou réserver : après avoir expliqué l'espace cavalier et l'accueil, enchaîne TOUJOURS par « Si vous préférez, je peux prendre un message avec vos coordonnées et l'équipe vous rappellera pour faire l'inscription avec vous. »
- Dès que quelqu'un demande à être rappelé, à parler à quelqu'un, ou pose une question à laquelle tu ne peux pas répondre.
- Dès que quelqu'un s'intéresse aux promenades en main (disponibilités hors planning).
En bref : chaque fois que la conversation se termine par « voyez avec l'accueil », propose le message comme alternative immédiate.

Procédure OBLIGATOIRE :
1. Demande le nom de la personne, son message, et propose (sans insister) un numéro de téléphone pour être rappelée.
2. RELIS le message à voix haute : « Je récapitule : de la part de [nom], [message]. C'est bien ça ? »
3. N'appelle l'outil QU'APRÈS un accord clair (« oui », « c'est ça », « parfait »). Jamais sur un simple « ok » ambigu — redemande si le doute existe.
4. Après l'envoi, confirme simplement que l'équipe recevra le message. Si l'outil échoue, excuse-toi et oriente vers l'accueil ou le téléphone du club.
Un message n'est PAS une réservation : si la personne veut réserver, rappelle que ça passe par l'espace cavalier — le message peut seulement demander à être rappelé.`;

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
              // enfants qui hésitent.
              // interrupt_response: false — en club-house, le bruit ambiant
              // était détecté comme une prise de parole et coupait la réponse
              // en plein milieu. L'interruption se fait désormais à l'écran
              // (toucher le poney), plus au son.
              // eagerness "low" : le modèle attend franchement la fin de la
              // phrase avant de répondre — il coupait la parole aux visiteurs
              // qui font des pauses en parlant
              turn_detection: { type: "semantic_vad", eagerness: "low", interrupt_response: false },
              // Réduction de bruit "far_field" : conçue pour les micros
              // d'appareils posés dans une pièce (borne, kiosque) par
              // opposition au casque — filtre le brouhaha avant la détection
              noise_reduction: { type: "far_field" },
            },
            output: {
              voice: "marin",
              // Débit légèrement ralenti : plus confortable pour les enfants
              // et les aînés dans un hall d'accueil
              speed: 0.9,
            },
          },
          tools: [
            {
              type: "function",
              name: "laisser_message",
              description:
                "Transmet un message d'un visiteur à l'équipe du club. À n'appeler QU'APRÈS avoir relu le message au visiteur et obtenu sa confirmation orale explicite.",
              parameters: {
                type: "object",
                properties: {
                  nom: { type: "string", description: "Nom (ou prénom) de la personne qui laisse le message" },
                  telephone: { type: "string", description: "Numéro de téléphone pour être rappelé (optionnel)" },
                  contenu: { type: "string", description: "Le message à transmettre, tel que confirmé par le visiteur" },
                },
                required: ["nom", "contenu"],
              },
            },
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

/**
 * Préchauffage : la page borne appelle ce GET dès son affichage pour
 * réveiller la fonction serverless (imports firebase-admin compris)
 * AVANT que le visiteur n'appuie sur le bouton. Sans ça, le premier
 * démarrage de conversation payait 1 à 3 s de démarrage à froid Vercel.
 * Aucune donnée, aucun coût : juste un chargement de module.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
