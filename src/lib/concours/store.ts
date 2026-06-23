// =============================================================================
// Accès Firestore pour les concours — collection "concours"
// Emplacement cible : src/lib/concours/store.ts
// -----------------------------------------------------------------------------
// Un concours est un document auto-suffisant (terrains, personnes, chevaux,
// passages, rappels). On lit/écrit l'objet entier. L'id du document Firestore
// devient le champ `id` du concours.
// =============================================================================

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Concours, Terrain } from "./types";

const COL = "concours";

/** Retire les `undefined` (Firestore les refuse). Les dates sont des strings. */
function clean<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const TERRAINS_DEFAUT: Terrain[] = [
  { id: "manege", nom: "Manège" },
  { id: "carriere", nom: "Carrière" },
];

/** Liste légère pour la page d'accueil (on renvoie l'objet complet, suffisant ici). */
export async function listConcours(): Promise<Concours[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Concours, "id">), id: d.id }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getConcours(id: string): Promise<Concours | null> {
  const d = await getDoc(doc(db, COL, id));
  if (!d.exists()) return null;
  return { ...(d.data() as Omit<Concours, "id">), id: d.id };
}

/** Crée un concours et renvoie son id. */
export async function createConcours(data: Omit<Concours, "id">): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...clean(data),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Enregistre (écrase) un concours existant. */
export async function saveConcours(c: Concours): Promise<void> {
  const { id, ...rest } = c;
  await setDoc(doc(db, COL, id), { ...clean(rest), updatedAt: serverTimestamp() });
}

export async function deleteConcours(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Squelette d'un nouveau concours vide. */
export function concoursVide(titre: string, sousTitre: string, date: string): Omit<Concours, "id"> {
  return {
    titre: titre.trim() || "Concours",
    sousTitre: sousTitre.trim() || undefined,
    date,
    terrains: TERRAINS_DEFAUT,
    personnes: [],
    chevaux: [],
    passages: [],
    rappels: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Bases existantes : cavaliers (families/children) et poneys (equides)
// ───────────────────────────────────────────────────────────────────────────

export interface CavalierBase {
  childId: string;
  prenom: string;
  famille: string;
  galop?: string;
  familyId: string;
}

export interface PoneyBase {
  equideId: string;
  nom: string;
}

/** Aplatit tous les cavaliers (children) de toutes les familles. */
export async function listerCavaliersBase(): Promise<CavalierBase[]> {
  const snap = await getDocs(collection(db, "families"));
  const out: CavalierBase[] = [];
  snap.docs.forEach((d) => {
    const f = d.data() as any;
    const famille = (f.lastName || f.parentName || "").toString();
    (f.children || []).forEach((c: any) => {
      if (!c?.id) return;
      out.push({
        childId: c.id,
        prenom: c.firstName || "?",
        famille,
        galop: c.galopLevel,
        familyId: d.id,
      });
    });
  });
  return out.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));
}

/** Liste les poneys/équidés de la cavalerie. */
export async function listerPoneysBase(): Promise<PoneyBase[]> {
  const snap = await getDocs(collection(db, "equides"));
  return snap.docs
    .map((d) => ({ equideId: d.id, nom: (d.data() as any).name || "?" }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

// ───────────────────────────────────────────────────────────────────────────
// Import depuis le planning : séances (creneaux) d'une date + leurs inscrits
// ───────────────────────────────────────────────────────────────────────────

export interface CreneauImport {
  id: string;
  titre: string;
  heure: string;
  type: string;
  inscrits: { childId: string; prenom: string; familyId: string; poneyNom?: string }[];
}

/** Récupère les séances du planning à une date donnée (ISO "AAAA-MM-JJ"). */
export async function listerCreneauxDuJour(date: string): Promise<CreneauImport[]> {
  if (!date) return [];
  const snap = await getDocs(query(collection(db, "creneaux"), where("date", "==", date)));
  return snap.docs
    .map((d) => {
      const c = d.data() as any;
      const inscrits = (c.enrolled || [])
        .map((e: any) => ({
          childId: e.childId,
          prenom: e.childName || e.firstName || "?",
          familyId: e.familyId || "",
          poneyNom: e.horseName || undefined,
        }))
        .filter((x: any) => x.childId);
      return {
        id: d.id,
        titre: c.activityTitle || "Séance",
        heure: c.startTime || "",
        type: c.activityType || "",
        inscrits,
      };
    })
    .sort((a, b) => a.heure.localeCompare(b.heure));
}
