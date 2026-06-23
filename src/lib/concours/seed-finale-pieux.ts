// =============================================================================
// Seed de démonstration : l'affiche "PONY GAMES AGON — Finale Pieux 2026"
// Emplacement cible : src/lib/concours/seed-finale-pieux.ts
// -----------------------------------------------------------------------------
// Sert à alimenter la page v1 sans backend. Plus tard, ces données viendront
// de Firestore et de tes cavaliers/chevaux déjà en base.
// =============================================================================

import type { Concours, RoleType, RoleAssignation, ParticipationPassage } from "./types";

// Petits helpers pour écrire les passages de façon lisible.
const part = (personneId: string, chevalId?: string): ParticipationPassage => ({ personneId, chevalId });
const role = (
  type: RoleType,
  ids: string[],
  opts?: { nbRequis?: number; optionnel?: boolean },
): RoleAssignation => ({
  type,
  personneIds: ids,
  nbRequis: opts?.nbRequis ?? (ids.length || 1),
  optionnel: opts?.optionnel,
});

export const SEED_FINALE_PIEUX: Concours = {
  id: "finale-pieux-2026",
  titre: "PONY GAMES AGON",
  sousTitre: "Finale Pieux 2026",
  date: "2026-06-17",
  terrains: [
    { id: "manege", nom: "Manège" },
    { id: "carriere", nom: "Carrière" },
  ],

  personnes: [
    { id: "nicolas", prenom: "Nicolas", peutCoacher: true },
    { id: "emmeline", prenom: "Emmeline", peutCoacher: true },
    { id: "julie", prenom: "Julie" },
    { id: "fred", prenom: "Fred" },
    { id: "zoe", prenom: "Zoé" },
    { id: "suzanne", prenom: "Suzanne" },
    { id: "apolline", prenom: "Apolline" },
    { id: "malo", prenom: "Malo" },
    { id: "maeva", prenom: "Maëva" },
    { id: "louise", prenom: "Louise" },
    { id: "mia", prenom: "Mia" },
    { id: "ambre", prenom: "Ambre" },
    { id: "marianne", prenom: "Marianne" },
    { id: "solal", prenom: "Solal" },
    { id: "lilou", prenom: "Lilou" },
    { id: "jeanne", prenom: "Jeanne" },
    { id: "christophe", prenom: "Christophe" },
    { id: "appoline", prenom: "Appoline" },
    { id: "paloma", prenom: "Paloma" },
    { id: "josephine", prenom: "Joséphine" },
    { id: "maeline", prenom: "Maëline" },
    { id: "carla", prenom: "Carla" },
    { id: "eva", prenom: "Eva" },
  ],

  chevaux: [
    { id: "milton", nom: "Milton" },
    { id: "java", nom: "Java" },
    { id: "joy", nom: "Joy" },
    { id: "neptune", nom: "Neptune" },
    { id: "flamenko", nom: "Flamenko" },
    { id: "lpp", nom: "LPP" },
    { id: "gucci", nom: "Gucci" },
    { id: "viking", nom: "Viking" },
    { id: "caramel", nom: "Caramel" },
    { id: "grincheux", nom: "Grincheux" },
    { id: "rose", nom: "Rose" },
    { id: "camelia", nom: "Camélia" },
    { id: "galaxy", nom: "Galaxy" },
    { id: "boom", nom: "Boom" },
    { id: "verona", nom: "Verona" },
  ],

  passages: [
    // ───────────────── MANÈGE ─────────────────
    {
      id: "m1", terrain: "manege", ordre: 1,
      heurePrepa: "08:30", heureACheval: "09:00", heurePassage: "09:30",
      categorie: "Paire découverte", nomEquipe: "Les Jamais 2 sans toi",
      participants: [part("julie", "milton"), part("fred", "java")],
      roles: [role("coach", ["nicolas"]), role("placeur", ["ambre", "marianne"]), role("juge", ["paloma"])],
    },
    {
      id: "m2", terrain: "manege", ordre: 2,
      heurePrepa: "09:00", heureACheval: "09:30", heurePassage: "10:00",
      categorie: "Équipe minime", nomEquipe: "Ponies Splash",
      participants: [
        part("zoe", "joy"), part("suzanne", "neptune"), part("apolline", "flamenko"),
        part("malo", "lpp"), part("maeva", "gucci"),
      ],
      roles: [
        role("coach", ["emmeline"]), role("placeur", ["fred", "marianne"]),
        role("juge", ["carla"]), role("camion", ["eva"], { optionnel: true }),
      ],
    },
    {
      id: "m3", terrain: "manege", ordre: 3,
      heurePrepa: "09:45", heureACheval: "10:15", heurePassage: "10:45",
      categorie: "Paire découverte", nomEquipe: "Les Hippogalos",
      participants: [part("louise", "viking"), part("mia", "caramel")],
      roles: [
        role("coach", ["nicolas"]), role("placeur", ["fred", "eva"]),
        role("juge", ["malo"]), role("camion", ["carla", "eva"], { optionnel: true }),
      ],
    },
    {
      id: "m4", terrain: "manege", ordre: 4,
      heurePrepa: "10:15", heureACheval: "10:45", heurePassage: "11:15",
      categorie: "Paire poussin", nomEquipe: "Team Blue",
      participants: [part("ambre", "neptune"), part("marianne", "flamenko")],
      roles: [role("coach", ["nicolas"]), role("placeur", ["malo", "maeva"]), role("juge", ["suzanne"])],
    },
    {
      id: "m5", terrain: "manege", ordre: 5,
      heurePrepa: "10:45", heureACheval: "11:15", heurePassage: "11:45",
      categorie: "Paire poussin", nomEquipe: "Marianne et Solal",
      participants: [part("marianne", "viking"), part("solal", "grincheux")],
      roles: [
        role("coach", ["emmeline"]), role("placeur", ["fred", "carla"]),
        role("juge", ["eva"]), role("camion", ["carla"], { optionnel: true }),
      ],
    },
    {
      id: "m6", terrain: "manege", ordre: 6, heureACheval: "12:30",
      categorie: "", nomEquipe: "Remise des prix",
      participants: [], roles: [], evenement: true,
    },
    {
      id: "m7", terrain: "manege", ordre: 7,
      heurePrepa: "11:45", heureACheval: "12:15", heurePassage: "12:45",
      categorie: "Paire minime", nomEquipe: "Malo et Suzanne",
      participants: [part("malo", "lpp"), part("suzanne", "gucci")],
      roles: [role("coach", ["emmeline"]), role("placeur", ["mia", "louise"]), role("juge", ["carla"])],
    },
    {
      id: "m8", terrain: "manege", ordre: 8,
      heurePrepa: "12:45", heureACheval: "13:15", heurePassage: "13:45",
      categorie: "Équipe benjamins", nomEquipe: "Les poneys d'enfer",
      participants: [part("ambre", "grincheux"), part("solal", "caramel"), part("marianne", "flamenko")],
      roles: [
        role("coach", ["nicolas"]), role("placeur", ["jeanne", "josephine"]),
        role("juge", ["fred"]), role("camion", ["carla", "eva"], { optionnel: true }),
      ],
    },
    {
      id: "m9", terrain: "manege", ordre: 9, heureACheval: "17:00",
      categorie: "", nomEquipe: "Remise des prix finale",
      participants: [], roles: [], evenement: true,
    },

    // ───────────────── CARRIÈRE ─────────────────
    {
      id: "c1", terrain: "carriere", ordre: 1,
      heurePrepa: "09:00", heureACheval: "09:30", heurePassage: "10:00",
      categorie: "Paire indice 2", nomEquipe: "Lilou et Julie",
      participants: [part("lilou", "rose"), part("julie", "milton")],
      roles: [
        role("coach", ["nicolas"]), role("placeur", ["christophe", "paloma"]),
        role("juge", ["josephine"]), role("camion", ["eva"], { optionnel: true }),
      ],
      noteRelais: "Julie rejoint directement la carrière en sortie du manège.",
    },
    {
      id: "c2", terrain: "carriere", ordre: 2,
      heurePrepa: "10:00", heureACheval: "10:30", heurePassage: "11:00",
      categorie: "Paire indice 2", nomEquipe: "Jeanne et Zoé",
      participants: [part("jeanne", "camelia"), part("zoe", "galaxy")],
      roles: [role("coach", ["emmeline"]), role("placeur", ["fred"]), role("juge", ["eva"])],
      noteRelais: "Maëva échauffe Galaxy pour Zoé.",
    },
    {
      id: "c3", terrain: "carriere", ordre: 3,
      heurePrepa: "10:00", heureACheval: "10:30", heurePassage: "11:00",
      categorie: "Paire indice 2", nomEquipe: "Christophe et Appoline",
      participants: [part("christophe", "boom"), part("appoline", "joy")],
      roles: [role("coach", []), role("placeur", ["carla", "malo"]), role("juge", ["suzanne"])],
      noteRelais: "Relais organisé pour Appoline/Joy.",
    },
    {
      id: "c4", terrain: "carriere", ordre: 4,
      heurePrepa: "11:00", heureACheval: "11:30", heurePassage: "12:00",
      categorie: "Équipe cadet 2", nomEquipe: "Les fusées d'Agon",
      participants: [
        part("paloma", "verona"), part("josephine", "rose"),
        part("maeline", "gucci"), part("jeanne", "galaxy"),
      ],
      roles: [role("coach", ["nicolas"]), role("placeur", ["mia", "fred"]), role("juge", ["christophe"])],
    },
    {
      id: "c5", terrain: "carriere", ordre: 5,
      heurePrepa: "13:00", heureACheval: "13:30", heurePassage: "14:00",
      categorie: "Équipe adultes", nomEquipe: "Les irréductibles gaulois",
      participants: [
        part("julie", "camelia"), part("christophe", "boom"), part("emmeline", "galaxy"),
        part("carla", "java"), part("eva", "verona"),
      ],
      roles: [role("coach", []), role("placeur", ["jeanne", "josephine"]), role("juge", ["maeva"])],
    },
    {
      id: "c6", terrain: "carriere", ordre: 6, heureACheval: "14:15",
      categorie: "", nomEquipe: "Remise des prix",
      participants: [], roles: [], evenement: true,
    },
  ],

  rappels: [
    "Julie rejoint directement la carrière à 10h00 en sortie du manège.",
    "Maëva échauffe Galaxy pour Zoé avant Jeanne et Zoé.",
    "Malo échauffe Joy pour Appoline avant Christophe et Appoline.",
    "À 14h00, pas de coach pour les irréductibles gaulois.",
    "Les plus jeunes peuvent être placeurs de matériel, mais pas responsables de la préparation au camion.",
  ],
};
