/**
 * src/lib/travail-bilan-serveur.ts — génère et range le bilan mensuel du
 * travail des poneys (règles : lib/travail-bilan.ts). Utilisé par le bouton
 * de l'onglet « Travail des poneys » et par le cron du 1er du mois.
 */
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { LIMITE_REPONSE, MODELE_PRINCIPAL, texteReponse } from "@/lib/ia-modeles";
import { consigneBilanTravail, finDeMois, lireAnalyseBilan, statsMois, type AnalyseBilan, type StatsMois } from "@/lib/travail-bilan";
import type { SeanceTravail } from "@/lib/travail-equides";

export interface BilanTravail { mois: string; stats: StatsMois; analyse: AnalyseBilan | null; erreurIa?: string; genereLe?: string }

const BILANS = "travail-equides-bilans";

export async function lireBilanTravail(mois: string): Promise<BilanTravail | null> {
  const d = await adminDb.collection(BILANS).doc(mois).get();
  return d.exists ? ({ ...(d.data() as any), genereLe: (d.data() as any).genereLe || undefined }) : null;
}

/** Calcule les chiffres, demande l'analyse à l'IA, range le tout sous `travail-equides-bilans/{mois}`. */
export async function genererBilanTravail(mois: string, auteur: string): Promise<BilanTravail> {
  const [seSnap, eqSnap] = await Promise.all([
    adminDb.collection("travail-equides").where("date", ">=", `${mois}-01`).where("date", "<=", finDeMois(mois)).get(),
    adminDb.collection("equides").get(),
  ]);
  const seances = seSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SeanceTravail[];
  const equides = eqSnap.docs
    .map((d) => ({ id: d.id, name: String((d.data() as any).name || ""), status: (d.data() as any).status }))
    .filter((e) => e.name && e.status !== "sorti" && e.status !== "deces");
  const stats = statsMois(seances, equides, mois);

  let analyse: AnalyseBilan | null = null, erreurIa: string | undefined;
  if (stats.nbSeances > 0) {
    if (!process.env.ANTHROPIC_API_KEY) erreurIa = "IA non configurée : seuls les chiffres sont disponibles.";
    else {
      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 100_000, maxRetries: 1 });
        const rep = await client.messages.create({
          model: MODELE_PRINCIPAL, max_tokens: LIMITE_REPONSE, output_config: { effort: "low" },
          messages: [{ role: "user", content: consigneBilanTravail(stats, seances) }],
        } as any);
        analyse = lireAnalyseBilan(texteReponse(rep as any), stats);
        if (!analyse) erreurIa = "L'analyse n'a pas pu être lue : relancez-la.";
      } catch (e: any) { erreurIa = `Analyse indisponible : ${e?.message || e}`; }
    }
  }
  const bilan: BilanTravail = { mois, stats, analyse, ...(erreurIa ? { erreurIa } : {}), genereLe: new Date().toISOString() };
  await adminDb.collection(BILANS).doc(mois).set({ ...bilan, generePar: auteur, majLe: FieldValue.serverTimestamp() });
  return bilan;
}
