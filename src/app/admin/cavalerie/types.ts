export type EquideType = "poney" | "shetland" | "cheval" | "ane";
export type EquideSex = "male" | "femelle" | "hongre";
export type EquideStatus = "actif" | "retraite" | "sorti" | "deces" | "en_formation" | "indisponible";
export type SoinType = "vermifuge" | "vaccin" | "marechal" | "dentiste" | "osteopathe" | "veterinaire" | "tonte" | "autre";
export type DocumentEquideType = "radio" | "ordonnance" | "carnet_sante" | "certificat" | "assurance" | "livret" | "facture_veto" | "autre";

export interface Equide {
  id: string;
  name: string;
  sire: string;
  puce: string;
  type: EquideType;
  sex: EquideSex;
  robe: string;
  race: string;
  birthDate: any;
  toise: number | null;
  photo: string | null;
  provenance: string;
  proprietaire: string;
  dateArrivee: any;
  dateSortie: any;
  motifSortie: string | null;
  status: EquideStatus;
  available: boolean;
  niveauCavalier: string;
  disciplines: string[];
  temperament: string;
  cavaliersFavoris: string[];
  maxReprisesPerDay: number;
  maxHeuresHebdo: number;
  notes: string;
  ordre?: number;
  createdAt: any;
  updatedAt: any;
}

export interface SoinRecord {
  id: string;
  equideIds: string[];
  type: SoinType;
  label: string;
  date: string;
  prochainRdv: string;
  praticien: string;
  cout: number;
  observations: string;
  createdAt: any;
}

export interface MouvementRegistre {
  id: string;
  equideId: string;
  type: "entree" | "sortie";
  date: string;
  motif: string;
  temporaire: boolean;
  dateRetour: string;
  provenance: string;
  destination: string;
  prixAchat: number | null;
  prixVente: number | null;
  observations: string;
  createdAt: any;
}

export interface DocumentEquide {
  id: string;
  equideId: string;
  type: DocumentEquideType;
  label: string;
  url: string;
  date: string;
  createdAt: any;
}

export const TYPE_LABELS: Record<EquideType, string> = {
  poney: "Poney", shetland: "Shetland", cheval: "Cheval", ane: "Âne",
};
export const SEX_LABELS: Record<EquideSex, string> = {
  male: "Étalon", femelle: "Jument", hongre: "Hongre",
};
export const STATUS_LABELS: Record<EquideStatus, string> = {
  actif: "Actif", retraite: "Retraite", sorti: "Sorti", deces: "Décédé",
  en_formation: "En formation", indisponible: "Indisponible",
};
export const SOIN_LABELS: Record<SoinType, string> = {
  vermifuge: "Vermifuge", vaccin: "Vaccination", marechal: "Maréchal-ferrant",
  dentiste: "Dentiste", osteopathe: "Ostéopathe", veterinaire: "Vétérinaire",
  tonte: "Tonte", autre: "Autre",
};
