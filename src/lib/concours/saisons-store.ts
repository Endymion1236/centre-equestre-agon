// =============================================================================
// Accès Firestore des saisons de Pony Games — collection "saisons-pony-games"
// -----------------------------------------------------------------------------
// Un document par saison, auto-suffisant (cavaliers, équipes, résultats) :
// on lit et on écrit l'objet entier, comme pour les concours.
// =============================================================================

import {
  collection, getDocs, getDoc, addDoc, setDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trierSaisons, type SaisonPonyGames } from "./saisons";

const COL = "saisons-pony-games";

/** Retire les `undefined` (Firestore les refuse). */
function clean<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function lire(id: string, data: any): SaisonPonyGames {
  return {
    id,
    nom: data.nom || "",
    cavaliers: data.cavaliers || [],
    equipes: data.equipes || [],
    resultats: data.resultats || [],
  };
}

export async function listSaisons(): Promise<SaisonPonyGames[]> {
  const snap = await getDocs(collection(db, COL));
  return trierSaisons(snap.docs.map((d) => lire(d.id, d.data())));
}

export async function getSaison(id: string): Promise<SaisonPonyGames | null> {
  const d = await getDoc(doc(db, COL, id));
  return d.exists() ? lire(d.id, d.data()) : null;
}

export async function createSaison(nom: string): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    nom, cavaliers: [], equipes: [], resultats: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveSaison(s: SaisonPonyGames): Promise<void> {
  const { id, ...rest } = s;
  await setDoc(doc(db, COL, id), { ...clean(rest), updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteSaison(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
