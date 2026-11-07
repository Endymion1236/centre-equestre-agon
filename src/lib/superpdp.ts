/**
 * src/lib/superpdp.ts — client serveur de l'API Super PDP (bac à sable).
 *
 * Authentification OAuth 2.1 « client credentials » : client_id et
 * client_secret d'une « Application » Super PDP, rangés dans Vercel
 * (SUPERPDP_CLIENT_ID / _SECRET pour le club, SUPERPDP_FOURNISSEUR_… pour
 * l'entreprise fictive qui joue le fournisseur). Jamais côté navigateur.
 * Mise en forme des réponses : lib/superpdp-regles.ts.
 */

import { variablesDuRole, type RoleSuperPdp } from "@/lib/superpdp-regles";

export const SUPERPDP_API = process.env.SUPERPDP_ENDPOINT || "https://api.superpdp.tech";

const jetons = new Map<RoleSuperPdp, { valeur: string; expire: number }>();

export function roleConfigure(role: RoleSuperPdp): boolean {
  const v = variablesDuRole(role);
  return !!process.env[v.id] && !!process.env[v.secret];
}

async function jeton(role: RoleSuperPdp): Promise<string> {
  const deja = jetons.get(role);
  if (deja && deja.expire > Date.now() + 30_000) return deja.valeur;
  const v = variablesDuRole(role);
  const clientId = process.env[v.id], secret = process.env[v.secret];
  if (!clientId || !secret) throw new Error(`Identifiants Super PDP absents (${v.id} / ${v.secret} dans Vercel).`);
  const res = await fetch(`${SUPERPDP_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret }).toString(),
  });
  if (!res.ok) throw new Error(`Connexion à Super PDP refusée (${res.status}) : vérifiez ${v.id} et ${v.secret}.`);
  const d = await res.json();
  jetons.set(role, { valeur: d.access_token, expire: Date.now() + (Number(d.expires_in) || 300) * 1000 });
  return d.access_token;
}

/** Appel authentifié ; lève une erreur lisible si la réponse n'est pas 2xx. */
export async function appelSuperPdp(role: RoleSuperPdp, chemin: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SUPERPDP_API}${chemin}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${await jeton(role)}` },
  });
  if (!res.ok) {
    const texte = await res.text().catch(() => "");
    throw new Error(`Super PDP ${chemin} : ${res.status} ${texte.slice(0, 300)}`);
  }
  return res;
}
