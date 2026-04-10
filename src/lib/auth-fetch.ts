import { auth } from "@/lib/firebase";

/**
 * fetch() avec le token Firebase automatiquement ajouté dans le header Authorization.
 * Remplace `fetch("/api/xxx", { ... })` par `authFetch("/api/xxx", { ... })`.
 *
 * Si l'utilisateur n'est pas connecté, le fetch est envoyé sans token
 * (la route API renverra 401).
 */
export async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (e) {
    console.warn("authFetch: impossible d'obtenir le token Firebase", e);
  }

  return fetch(url, { ...init, headers });
}
