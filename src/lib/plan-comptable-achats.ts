/**
 * src/lib/plan-comptable-achats.ts
 *
 * Ventilation des DÉPENSES dans les comptes du cabinet comptable.
 *
 * Source : balance générale de l'EARL Centre équestre d'Agon-Coutainville,
 * exercice clos le 30/06/2025 (cabinet API Expertises). Les numéros et
 * libellés sont ceux du cabinet, à huit chiffres, pas le plan comptable
 * général : c'est ce que la comptable lit sans retraduire.
 *
 * Trois niveaux, du plus sûr au plus approximatif, et jamais de « Divers »
 * silencieux :
 *   1. la catégorie du tableau des opérations → un compte par défaut ;
 *   2. un mot-clé du libellé bancaire ou du fournisseur → une subdivision
 *      (eau vs électricité, sellerie vs petit équipement, loyer vs Skoda…) ;
 *   3. sinon « à ventiler » : compte laissé vide, signalé dans l'export.
 *
 * Deux règles du cabinet reprises telles quelles : les licences et
 * engagements FFE sont des comptes d'attente (4672/4673), pas des charges ;
 * le compte FFE du club est un compte de trésorerie (51730000).
 */

export interface CompteAchat { compte: string; libelle: string }
export interface Ventilation extends CompteAchat { source: "categorie" | "mot-cle" | "nature" | "a-ventiler"; note?: string }

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Comptes de charges et assimilés utilisés par le cabinet en 2024-25 (extrait). */
export const COMPTES: Record<string, string> = {
  "60141000": "Aliments concentrés", "60142000": "Litières copeaux", "60143000": "Aliments grossiers", "60150000": "Produits vétérinaires chevaux", "60278100": "Paille",
  "60544000": "Maréchalerie", "60560000": "Travail des chevaux", "60580000": "Prestations diverses", "61100000": "Sous-traitance générale",
  "60610000": "Eau", "60630000": "Électricité", "60640000": "Carburants lubrifiants",
  "60660000": "Fournitures d'entretien et petit équipement", "60660100": "Matériel de sellerie", "60662000": "Fournitures administratives",
  "61310000": "Loyer centre équestre", "61320000": "Location véhicule Skoda", "61321000": "Location machine à café", "61322000": "Location imprimante", "61323000": "Location TPE", "61340000": "Locations d'animaux", "61380000": "Autres locations",
  "61510000": "Terrains (entretien, réparations)", "61530000": "Entretien bâtiments", "61550000": "Entretien matériels", "61553000": "Entretien véhicules", "61562000": "Maintenance",
  "61600000": "Assurances", "61610000": "Assurances véhicules", "61680000": "Assurance matériels agricoles",
  "61800000": "Frais divers, documentation, formations", "61830000": "Documentation technique",
  "62250000": "Honoraires vétérinaires", "62253000": "Honoraires laboratoire", "62260000": "Honoraires juridiques", "62261000": "Honoraires sociaux (GHN)", "62262000": "Honoraires comptables", "62270000": "Frais d'actes et contentieux",
  "62300000": "Publicités", "62340000": "Cadeaux à la clientèle", "62360000": "Catalogues et imprimés",
  "62410000": "Transports sur achats", "62510000": "Voyages et déplacements", "62560000": "Missions", "62570000": "Réceptions",
  "62610000": "Frais postaux", "62620000": "Téléphone fixe", "62630000": "Téléphone portable", "62640000": "Internet",
  "62700000": "Services bancaires", "62710000": "Commissions CB", "62720000": "Commissions sur émission d'emprunt",
  "62800000": "Diverses cotisations", "62810000": "Cotisations professionnelles", "62820000": "Inscriptions, filiations", "62830000": "Cotisations chevaux", "62840000": "Frais ANCV", "62880000": "Autres services extérieurs",
  "63130000": "Participation formation continue", "63330000": "Formation professionnelle continue", "63570000": "Droits d'enregistrement, timbre",
  "64111000": "Personnel permanent", "64500000": "Charges sociales salariés", "64510000": "Cotisations MSA", "64600000": "Cotisations sociales de l'exploitant", "64700000": "Tickets resto", "64750000": "Médecine du travail, pharmacie",
  "66120000": "Intérêts des emprunts", "67120000": "Pénalités et amendes",
  // Hors charges
  "21210000": "Agencements et aménagements", "21540000": "Matériel agricole", "21820000": "Matériel de transport", "21830000": "Matériel de bureau et informatique", "24313000": "Chevaux de sport", "24314000": "Chevaux de manège",
  "42100000": "Personnel, rémunérations dues", "43100000": "Mutualité sociale agricole", "43110000": "MSA Richard", "43700000": "MSA salariés",
  "44562000": "TVA déductible sur immobilisations", "44566000": "TVA déductible sur autres biens et services",
  "45511000": "Associés, compte courant", "46720000": "Licences (attente)", "46730000": "Engagements cavaliers (attente)",
  "51200000": "Crédit Agricole", "51220000": "Excédent Pro", "51730000": "FFE club", "51740000": "FFE compét", "58000000": "Virements internes",
  "16420000": "Emprunts moyen et long terme", "40100000": "Fournisseurs",
};

/** Catégorie du tableau → compte par défaut. */
const PAR_CATEGORIE: Record<string, string> = {
  "Aliments, litières, paille": "60141000",
  "Maréchalerie & travail des chevaux": "60544000",
  "Vétérinaire & santé des chevaux": "62250000",
  "Eau & électricité": "60630000",
  "Carburants": "60640000",
  "Fournitures & petit équipement (dont sellerie)": "60660000",
  "Entretien (bâtiments, matériel, véhicules)": "61550000",
  "Locations & loyers": "61380000",
  "Assurances": "61600000",
  "Honoraires & gestion (compta, juridique, GHN)": "62262000",
  // Un prestataire facture une prestation : sous-traitance, pas un salaire.
  "Prestataires & sous-traitance (moniteurs, travaux)": "60580000",
  // Abonnements et logiciels : maintenance par défaut, télécom par mot-clé.
  "Informatique, logiciels & abonnements": "61562000",
  "Frais bancaires & commissions (CB, Stripe)": "62700000",
  "Publicité & communication": "62300000",
  "Engagements de concours": "46730000",
  "Autres dépenses": "62880000",
  "Salaires": "42100000",
  "Cotisations sociales": "43100000",
  "Virements internes": "58000000",
  "Emprunts": "16420000",
  "Personnel — hors charges": "45511000",
  "Compte FFE (avance licences & engagements)": "51730000",
};

/** Mots-clés (libellé bancaire ou fournisseur) → subdivision, par catégorie. Premier trouvé gagne. */
const MOTS_CLES: Record<string, [RegExp, string][]> = {
  "Aliments, litières, paille": [[/\b(foin|round|balle|lacolley|grossier)/, "60143000"], [/\bpaille\b/, "60278100"], [/(copeau|litiere|liti)/, "60142000"], [/(granule|nutrea|agrial|lamaison|point vert|concentre)/, "60141000"]],
  "Maréchalerie & travail des chevaux": [[/(marech|tabac|ferrure|parage)/, "60544000"], [/(travail|debourrage|dressage|coach)/, "60560000"]],
  "Vétérinaire & santé des chevaux": [[/(pharma|vetodiag|produit|vermifuge|medicament)/, "60150000"], [/(labo)/, "62253000"]],
  "Eau & électricité": [[/(saur|eau\b|veolia)/, "60610000"], [/(edf|engie|electr|energie|enercoop)/, "60630000"], [/(gaz|antargaz|butane|propane)/, "60630000"]],
  "Fournitures & petit équipement (dont sellerie)": [[/(seller|padd|horze|equi ?clic|devoucoux|forestier|equithe|licol|tapis|filet|mors)/, "60660100"], [/(papet|bureau|toner|cartouche|imprim|tampon)/, "60662000"]],
  "Entretien (bâtiments, matériel, véhicules)": [[/(garage|pneu|controle technique|carross|vidange|motin|jb ?mega|vehicule|camion|skoda)/, "61553000"], [/(batiment|toiture|platrerie|peinture|macon|couverture)/, "61530000"], [/(maintenance|sage|logiciel|contrat d entretien)/, "61562000"], [/(terrain|carriere|sable|clotur)/, "61510000"]],
  "Locations & loyers": [[/(arval|skoda|vehicule|lld)/, "61320000"], [/(rex rotary|imprimante|copieur)/, "61322000"], [/(tpe|leasing solutions|cm cic|leasecom|terminal)/, "61323000"], [/(cafe)/, "61321000"], [/(equilocation|cheval|poney|animal)/, "61340000"], [/(association|asso ce|ce d agon|loyer)/, "61310000"]],
  "Assurances": [[/(vehicule|auto|camion|flotte)/, "61610000"], [/(agricole|materiel|tracteur|groupama.*mat)/, "61680000"]],
  // Un moniteur indépendant relève du travail des chevaux quand il monte ou
  // débourre ; un artisan, de l'entretien du bâtiment. Un gros chantier reste
  // une immobilisation, à classer comme telle sur la ligne.
  "Prestataires & sous-traitance (moniteurs, travaux)": [[/(moniteur|monitrice|enseignant|coach|debourrage|dressage|travail du cheval)/, "60560000"], [/(macon|maconnerie|plombier|plomberie|electricien|charpente|couverture|menuiserie|peinture|terrassement|paysagiste|elagage|travaux)/, "61530000"]],
  // Télécom et internet ont leur propre compte ; le reste est de la maintenance.
  "Informatique, logiciels & abonnements": [[/(orange|free|bouygues|sfr|internet|fibre|telecom)/, "62640000"], [/(mobile|portable|forfait)/, "62630000"], [/(formation|apprentissage)/, "63330000"]],
  "Honoraires & gestion (compta, juridique, GHN)": [[/(ghn|groupement hippique)/, "62261000"], [/(notaire|avocat|juridique|infogreffe)/, "62260000"], [/(huissier|acte|contentieux)/, "62270000"], [/(pignolet|comptable|expert|api expertises)/, "62262000"]],
  "Frais bancaires & commissions (CB, Stripe)": [[/(com carte|commission cb|commission carte|vente( a)? distance|vad|stripe|sumup|cawl|worldline|tpe)/, "62710000"], [/(emprunt|dossier)/, "62720000"], [/(ancv)/, "62840000"]],
  "Publicité & communication": [[/(imprim|print|flyer|catalogue|affiche|banderole|copinew)/, "62360000"], [/(cadeau|coupe|medaille|trophee)/, "62340000"]],
  "Autres dépenses": [[/(tickets? (resto|restaurants?)|edenred)/, "64700000"], [/(mobile|portable)/, "62630000"], [/(restaurant|resto|la cale|kin saya|equinoxe|reception|traiteur|pizza|burger|mcdo)/, "62570000"], [/(hotel|mission|airbnb|gite)/, "62560000"], [/(peage|sncf|train|parking|deplacement|chargemap|carburant)/, "62510000"], [/(la poste|colissimo|chronopost|ups\b|timbre)/, "62610000"], [/(orange|free|bouygues|sfr|internet|box|fibre)/, "62640000"], [/(openai|anthropic|google|resend|adobe|elevenlabs|midjourney|o2switch|standardfacile|hosteur|abonnement|logiciel|saas|deezer|canva|microsoft|apple)/, "61800000"], [/(formation|ocapiat|stage form)/, "63330000"], [/(ifce|sire|cotisation cheval)/, "62830000"], [/(cotisation|adhesion|filiation|licence dirigeant)/, "62810000"], [/(amende|penalite|majoration)/, "67120000"], [/(medecine du travail|mutualite|pharmacie)/, "64750000"], [/(mco nuisibles|derat|desinsect|nettoyage)/, "61550000"]],
  // Le Crédit Agricole prélève capital et intérêts sur deux lignes distinctes,
  // en le disant dans le libellé (« … 01/09/26 INTERETS »). Quand le relevé
  // tranche lui-même, inutile de demander à la comptable de ventiler : seule
  // une mensualité globale, qui ne dit rien, reste à répartir d'après le
  // tableau d'amortissement.
  "Emprunts": [[/\binterets?\b/, "66120000"], [/\bcapital\b|amortissement/, "16420000"], [/assurance/, "61600000"]],
  "Cotisations sociales": [[/(msa richard|richard|exploitant)/, "43110000"], [/(salari|dsn)/, "43700000"]],
  "Immobilisation — à amortir": [[/(?=.*(cheval|chevaux|poney|jument|hongre|pouliche))(?=.*\b(sport|competition)\b)/, "24313000"], [/(cheval|chevaux|poney|jument|hongre|pouliche|manege)/, "24314000"], [/(tracteur|remorque|van|epandeur|tondeuse|quad|materiel agri|broyeur)/, "21540000"], [/(camion|vehicule|voiture|utilitaire|fourgon)/, "21820000"], [/(ordinateur|pc\b|mac\b|tablette|imprimante|informatique|ecran|serveur)/, "21830000"], [/(carriere|cloture|barriere|box|abri|hangar|agencement|amenagement|obstacle)/, "21210000"]],
};

/** Compte de charge (ou assimilé) d'une ligne du tableau. */
export function ventilerDepense(l: { poste?: string; fournisseur?: string; immobilisation?: boolean; depensePersonnelle?: boolean; avanceFfe?: boolean }): Ventilation {
  const poste = l.poste || "";
  // Un choix de nature explicite prime toujours sur un libellé de fournisseur.
  if (l.depensePersonnelle || poste === "Personnel — hors charges") return { compte: "45511000", libelle: COMPTES["45511000"], source: "nature" };
  if (l.avanceFfe || poste === "Compte FFE (avance licences & engagements)") return { compte: "51730000", libelle: COMPTES["51730000"], source: "nature" };
  const immobilisation = l.immobilisation || poste === "Immobilisation — à amortir";
  const texte = norm(l.fournisseur);
  const regles = MOTS_CLES[immobilisation ? "Immobilisation — à amortir" : poste] || [];
  for (const [re, compte] of regles) if (re.test(texte)) return { compte, libelle: COMPTES[compte] || "", source: "mot-cle" };
  if (immobilisation) return { compte: "", libelle: "Immobilisation (classe 2)", source: "a-ventiler", note: "Bien durable : préciser le compte 21/24 (matériel agricole, transport, informatique, cheval)." };
  if (poste === "Emprunts") return { compte: "", libelle: "Échéance d’emprunt à ventiler", source: "a-ventiler", note: "Échéance : capital en 1642xxxx, intérêts en 6612xxxx selon le tableau d'amortissement." };
  if (poste === "Retraite / PER — à vérifier") return { compte: "", libelle: "PER de l'exploitant", source: "a-ventiler", note: "Traitement fiscal à décider par la comptable (pas une charge d'exploitation par défaut)." };
  const compte = PAR_CATEGORIE[poste];
  if (compte) return { compte, libelle: COMPTES[compte] || "", source: "categorie" };
  return { compte: "", libelle: "", source: "a-ventiler", note: poste === "hors-depenses" || !poste ? "Débit non classé." : `Catégorie « ${poste} » sans compte connu.` };
}

/** Comptes fournisseurs individuels du cabinet (401 + code), reconnus au libellé bancaire. */
const FOURNISSEURS: [RegExp, string, string][] = [
  [/agrial|lamaison/, "401AGRIAL", "Agrial"], [/allianz/, "401ALLIANZ", "Allianz"], [/amazon|amzn/, "401AMAZON", "Amazon"], [/anthropic/, "401ANTHROP", "Anthropic"], [/arval/, "401ARVAL", "Arval"],
  [/association ce|asso ce d agon|ce d agon/, "401ASSCE", "Association CE d'Agon"], [/avem/, "401AVEM", "Avem"], [/bricomarche/, "401BRICO", "Bricomarché"], [/carrefour/, "401CARREFO", "Carrefour"],
  [/leasing solutions|cclc/, "401CCLSLEA", "CCLC Leasing Solutions"], [/cdiscount/, "401CDISCOU", "Cdiscount"], [/chargemap/, "401CHARGEM", "Chargemap"], [/cm cic/, "401CMCI", "CM-CIC Leasing"],
  [/complexe hippique|pieux/, "401COMPHIP", "Complexe Hippique des Pieux"], [/copinew/, "401COPINEW", "Copinew"], [/coutances motoculture/, "401COUTA", "Coutances Motoculture"], [/dc baches|dc et baches/, "401DC", "DC & Bâches"],
  [/decathlon/, "401DECATHL", "Décathlon"], [/ecobox/, "401ECOB", "Ecobox"], [/edenred/, "401EDENRED", "Edenred"], [/eleven ?labs/, "401ELEVE", "ElevenLabs"], [/energie d ici/, "401ENER", "Énergie d'ici"], [/engie/, "401ENGIE", "Engie"],
  [/equi ?clic/, "401EQUICLI", "Equi-Clic"], [/equidrive/, "401EQUID", "Equidrive"], [/equilocation/, "401EQUIL", "Equilocation"], [/\bffe\b|federation francaise d equitation/, "401FFE", "FFE"], [/free\b/, "401FREE", "Free"],
  [/garage/, "401GARAGES", "Garages divers"], [/gd open|celeris|gd obs/, "401GDOPEN", "GD Open (Céléris)"], [/generali/, "401GENE", "Equi Generali"], [/ghn|groupement hippique/, "401GHN", "GHN"], [/google/, "401GOOGLE", "Google"],
  [/groupama/, "401GROUPAM", "Groupama"], [/horse pilot/, "401HORSPIL", "Horse Pilot"], [/hosteur/, "401HOST", "Hosteur"], [/ifce/, "401IFCE", "IFCE"], [/jb ?mega/, "401JBMEGA", "JB Mega"],
  [/lacolley|lacoll/, "401LACOGIM", "Lacolley Jimmy"], [/la poste/, "401LAPOSTE", "La Poste"], [/leboncoin/, "401LEBONCO", "Leboncoin"], [/leclerc/, "401LECLERC", "Leclerc"], [/picotin/, "401LEPIC", "EARL Le Picotin"],
  [/lr energies/, "401LRE", "LR Énergies"], [/manuloc/, "401MANU", "Manuloc"], [/marescq/, "401MARES", "Marescq Karine"], [/mco nuisibles/, "401MCONUI", "MCO Nuisibles"], [/meli nature/, "401MELI", "Meli Nature"],
  [/midjourney/, "401MID", "Midjourney"], [/le monde/, "401MONDE", "Le Monde"], [/montgardon/, "401MONTGAR", "Montgardon"], [/motin/, "401MOTIFRE", "Motin"], [/nutrea/, "401NUTREA", "Nutrea"],
  [/o2switch/, "401O2SWITC", "o2switch"], [/omga/, "401OMGA", "OMGA"], [/openai|open ai/, "401OPENAI", "OpenAI"], [/orange/, "401ORANGE", "Orange"], [/padd/, "401PADD", "PADD"], [/peage|sanef|vinci autoroutes|apr?r\b/, "401PEAGE", "Péages"],
  [/perdreau/, "401PERDR", "Perdreau"], [/pharmacie/, "401PHARM", "Pharmacie"], [/pignolet/, "401PIGN", "Pignolet Alain"], [/point p\b|pointp|point\.p/, "401POINTP", "Point P"], [/pony express/, "401PONY", "Pony Express du Cotentin"],
  [/print o ?clock|printoclock/, "401PRINOCL", "Print O'Clock"], [/regie ouest/, "401REGIOUE", "Régie Ouest"], [/restaurant|la cale|kin saya|equinoxe/, "401RESTAUR", "Restaurants divers"], [/rex rotary/, "401REXROTA", "Rex Rotary"],
  [/saur/, "401SAUR", "Saur"], [/schippers/, "401SCHIPPE", "Schippers"], [/sellerie de marigny|sellerie marigny/, "401SELLMAR", "Sellerie de Marigny"], [/sodiva/, "401SODIVA", "Sodiva"], [/solride/, "401SOLRI", "Solride"],
  [/sonovente/, "401SONOVEN", "Sonovente"], [/standardfacile|standard facile/, "401STAND", "StandardFacile"], [/super u|u express|station u/, "401SUP", "Super U / U Express"], [/tabac/, "401TABAFRA", "Tabac Franck (maréchal)"],
  [/temu/, "401TEMU", "Temu"], [/tjm vivier/, "401TJM", "TJM Vivier"], [/veterin|clinique vet|pommiers/, "401VETERIN", "Vétérinaires"], [/vis express/, "401VISEXP", "Vis Express"], [/vital concept/, "401VITAL", "Vital Concept"], [/vida ?xl/, "401VXINTER", "Vida XL"],
];
/**
 * Compte du fournisseur, nominatif quand le cabinet en tient un.
 *
 * Le cabinet ouvre un compte 401 nominatif pour ses fournisseurs réguliers
 * (Agrial, Padd, Orange…). Pour un achat occasionnel — le ticket de caisse
 * d'un commerçant qu'on ne reverra pas — il passe par le compte collectif
 * 40100000, et c'est très bien ainsi. Réclamer un compte nominatif pour
 * chaque ticket transformait la moitié du tableau en alertes orange sans
 * rien apprendre à personne.
 *
 * `collectif` distingue les deux : la proposition reste utilisable telle
 * quelle, et la comptable ouvre un compte nominatif si le fournisseur
 * s'installe dans les habitudes du club.
 */
export function compteFournisseur(fournisseur: unknown): CompteAchat & { collectif?: boolean } {
  const t = norm(fournisseur);
  for (const [re, compte, libelle] of FOURNISSEURS) if (re.test(t)) return { compte, libelle };
  return { compte: "40100000", libelle: "Fournisseurs (compte collectif)", collectif: true };
}

/** Compte de banque : celui du relevé importé quand on le connaît. */
export function compteBanque(compte: unknown): CompteAchat {
  const t = norm(compte);
  if (["51200000", "51220000", "51730000", "51740000"].includes(t)) return { compte: t, libelle: COMPTES[t] };
  if (/excedent/.test(t)) return { compte: "51220000", libelle: COMPTES["51220000"] };
  if (/\bffe\b.*\bcompet|\bcompet\w*.*\bffe\b/.test(t)) return { compte: "51740000", libelle: COMPTES["51740000"] };
  if (/\bffe\b|federation francaise d equitation/.test(t)) return { compte: "51730000", libelle: COMPTES["51730000"] };
  if (/credit agricole|\bca\b/.test(t)) return { compte: "51200000", libelle: COMPTES["51200000"] };
  return { compte: "", libelle: "Compte bancaire à identifier" };
}
