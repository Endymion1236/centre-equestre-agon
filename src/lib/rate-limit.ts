import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Rate limiter simple basé sur Firestore.
 *
 * Conçu pour les routes sensibles au coût (IA, TTS, transcription) afin
 * d'empêcher :
 *   - Un compte compromis qui spammerait les routes IA
 *   - Un bug côté client (boucle useEffect par exemple) qui exploserait
 *     la facture Anthropic/OpenAI/ElevenLabs
 *   - Un déni de service par épuisement de quota API
 *
 * Stratégie : fenêtre glissante basée sur un compteur Firestore par
 * (uid, routeKey). La fenêtre est "remise à zéro" via un champ `windowStartMs`
 * — quand on dépasse la durée, on réinitialise.
 *
 * Ce n'est PAS un rate limiter distribué parfait (race conditions possibles
 * si deux requêtes arrivent au même moment), mais c'est suffisant pour
 * les volumes visés (~93 membres) et l'objectif (protection coût).
 *
 * Pour une protection haute précision : Upstash Redis. À envisager si les
 * volumes explosent.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
  limit: number;
  windowMs: number;
}

/**
 * Vérifie et incrémente le compteur pour (uid, routeKey).
 *
 * @returns allowed=true si sous la limite. Quand false, la route appelante
 *          doit retourner rateLimitResponse() (HTTP 429).
 */
export async function checkRateLimit(params: {
  uid: string;
  routeKey: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const { uid, routeKey, limit, windowMs } = params;

  if (!uid) {
    return { allowed: true, remaining: limit, resetInMs: 0, limit, windowMs };
  }

  const docId = `${uid}_${routeKey}`;
  const ref = adminDb.collection("rate_limits").doc(docId);
  const now = Date.now();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;

      const windowStart = (data?.windowStartMs as number) || 0;
      const count = (data?.count as number) || 0;

      // Fenêtre expirée → reset
      if (!windowStart || now - windowStart >= windowMs) {
        tx.set(ref, {
          uid,
          routeKey,
          count: 1,
          windowStartMs: now,
          lastRequestAt: FieldValue.serverTimestamp(),
        });
        return {
          allowed: true,
          remaining: limit - 1,
          resetInMs: windowMs,
          limit,
          windowMs,
        };
      }

      const resetInMs = windowMs - (now - windowStart);

      if (count >= limit) {
        tx.update(ref, { lastRequestAt: FieldValue.serverTimestamp() });
        return {
          allowed: false,
          remaining: 0,
          resetInMs,
          limit,
          windowMs,
        };
      }

      tx.update(ref, {
        count: count + 1,
        lastRequestAt: FieldValue.serverTimestamp(),
      });
      return {
        allowed: true,
        remaining: limit - count - 1,
        resetInMs,
        limit,
        windowMs,
      };
    });

    return result;
  } catch (e) {
    console.error(`Rate limit check failed for ${uid}_${routeKey}:`, e);
    // Fail-open : on autorise en cas de glitch Firestore plutôt que de bloquer
    return { allowed: true, remaining: 0, resetInMs: 0, limit, windowMs };
  }
}

/**
 * Construit la NextResponse 429 avec les headers standards RFC 6585.
 */
export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({
      error: "Trop de requêtes. Merci de réessayer dans quelques instants.",
      retryAfterMs: result.resetInMs,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset-Ms": String(result.resetInMs),
        "Retry-After": String(Math.ceil(result.resetInMs / 1000)),
      },
    }
  );
}
