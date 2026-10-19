/**
 * src/lib/boite-suivi.ts — qui a déjà répondu à un mail de la boîte.
 *
 * Octobre 2026, Nicolas : « quand on répond à un mail via l'assistant IA il
 * faudrait qu'on sache si ça a déjà été répondu, si c'est quelqu'un d'autre
 * qui prend le relais ». La boîte lit Gmail en direct : rien ne disait qu'un
 * collègue avait déjà répondu, ou était en train de le faire.
 *
 * Suivi par fil Gmail (collection boite-suivi/{threadId}, écrite par le
 * serveur) : `enCours` quand quelqu'un lance l'assistant, `repondu` quand la
 * réponse part. Un message arrivé APRÈS la réponse redevient « à traiter »
 * (la famille a réécrit). Une préparation de plus de 2 h est oubliée.
 *
 * Module pur, testé seul (tests/unit/boite-suivi.test.ts).
 */

export interface MarqueSuivi { le: string; par: string }
export interface SuiviFil { repondu?: MarqueSuivi | null; enCours?: MarqueSuivi | null }
export type EtatSuivi = { etat: "a-traiter" | "en-cours" | "repondu"; par?: string; le?: string; relance?: boolean };

const DEUX_HEURES = 2 * 3600_000;

/** Nom court d'un administrateur pour l'affichage : son nom, sinon le début de son email. */
export function nomAdmin(jeton: { name?: unknown; email?: unknown } | null | undefined): string {
  const nom = String(jeton?.name || "").trim();
  if (nom) return nom.split(/\s+/)[0];
  const email = String(jeton?.email || "").trim();
  return email ? email.split("@")[0] : "un administrateur";
}

/** État d'un message reçu (date d'en-tête Gmail) au regard du suivi de son fil. */
export function etatSuivi(dateMessage: string, suivi: SuiviFil | null | undefined, maintenant: Date): EtatSuivi {
  const recu = Date.parse(dateMessage);
  const rep = suivi?.repondu, enc = suivi?.enCours;
  const tRep = rep ? Date.parse(rep.le) : NaN;
  if (rep && Number.isFinite(tRep) && (!Number.isFinite(recu) || tRep >= recu)) return { etat: "repondu", par: rep.par, le: rep.le };
  const tEnc = enc ? Date.parse(enc.le) : NaN;
  const relance = !!rep && Number.isFinite(tRep);
  if (enc && Number.isFinite(tEnc) && maintenant.getTime() - tEnc < DEUX_HEURES && (!Number.isFinite(recu) || tEnc >= recu)) return { etat: "en-cours", par: enc.par, le: enc.le, relance };
  return relance ? { etat: "a-traiter", par: rep!.par, le: rep!.le, relance: true } : { etat: "a-traiter" };
}

/** « 14h05 » aujourd'hui, sinon « 18/10 14h05 » (heure de Paris). */
export function heureSuivi(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...o }).format(d);
  const jour = (x: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(x);
  const h = f({ hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return jour(d) === jour(maintenant) ? h : `${jour(d)} ${h}`;
}
