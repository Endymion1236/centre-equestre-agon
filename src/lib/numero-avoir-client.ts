/**
 * Demande une référence d'avoir depuis un écran d'administration.
 *
 * Volontairement bloquant en cas d'échec : créer l'avoir avec une référence
 * de secours fabriquée sur place reproduirait exactement le défaut qu'on
 * corrige (des références hors séquence, indétectables ensuite). Mieux vaut
 * que l'opération s'arrête avec un message clair et soit refaite.
 */

import { authFetch } from "@/lib/auth-fetch";

export async function demanderNumeroAvoir(opts: {
  paymentId?: string | null;
  familyId?: string | null;
  motif?: string | null;
} = {}): Promise<string> {
  let res: Response;
  try {
    res = await authFetch("/api/avoir/next-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: opts.paymentId || null,
        familyId: opts.familyId || null,
        motif: opts.motif || null,
      }),
    });
  } catch (e) {
    throw new Error(
      "Impossible d'attribuer un numéro d'avoir (connexion). L'avoir n'a pas été créé — réessayez.",
    );
  }

  if (!res.ok) {
    throw new Error(
      `Impossible d'attribuer un numéro d'avoir (erreur ${res.status}). L'avoir n'a pas été créé — réessayez.`,
    );
  }

  const data = await res.json().catch(() => null);
  if (!data?.reference) {
    throw new Error("Numéro d'avoir non attribué. L'avoir n'a pas été créé — réessayez.");
  }
  return data.reference as string;
}
