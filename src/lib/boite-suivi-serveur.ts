/** Lecture et écriture du suivi des fils de la boîte (lib/boite-suivi), côté serveur. */
import { adminDb } from "@/lib/firebase-admin";
import { nomAdmin, type SuiviFil } from "@/lib/boite-suivi";

const fil = (threadId: string) => adminDb.collection("boite-suivi").doc(threadId.replace(/[^\w-]/g, "_").slice(0, 200));

/** Marque un fil « en cours » (assistant lancé) ou « répondu » (réponse partie). Jamais bloquant. */
export async function marquerSuivi(threadId: string | undefined, champ: "enCours" | "repondu", jeton: any, extra: Record<string, unknown> = {}) {
  if (!threadId) return;
  try {
    await fil(threadId).set({ threadId, [champ]: { le: new Date().toISOString(), par: nomAdmin(jeton), parUid: jeton?.uid || "", ...extra } }, { merge: true });
  } catch (e) { console.warn("[boite-suivi] écriture impossible", e); }
}

/** Suivi des fils demandés, par threadId. */
export async function lireSuivis(threadIds: string[]): Promise<Record<string, SuiviFil>> {
  const ids = [...new Set(threadIds.filter(Boolean))];
  if (!ids.length) return {};
  try {
    const docs = await adminDb.getAll(...ids.map(fil));
    const sortie: Record<string, SuiviFil> = {};
    docs.forEach((d, i) => { if (d.exists) { const x = d.data() as any; sortie[ids[i]] = { repondu: x.repondu || null, enCours: x.enCours || null }; } });
    return sortie;
  } catch (e) { console.warn("[boite-suivi] lecture impossible", e); return {}; }
}
