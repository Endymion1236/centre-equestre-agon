export interface LigneBancaireImportee {
  date: string;
  label: string;
  amount: number;
  matched: boolean;
  matchType: string;
  matchDetail: string;
}

export interface PeriodeCsv {
  debut: Date;
  fin: Date;
  startStr: string;
  endStr: string;
  nbJours: number;
  joursDepuisFin: number;
  alertes: string[];
}

const JOUR_MS = 86_400_000;

export function analyserPeriodeCsv(raw: string, maintenant: Date = new Date()): PeriodeCsv | null {
  const match = raw.match(
    /entre le (\d{2})\/(\d{2})\/(\d{4})\s+et le (\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (!match) return null;

  const [, d1, m1, y1, d2, m2, y2] = match;
  const startStr = `${d1}/${m1}/${y1}`;
  const endStr = `${d2}/${m2}/${y2}`;
  const debut = new Date(`${y1}-${m1}-${d1}T12:00:00`);
  const fin = new Date(`${y2}-${m2}-${d2}T12:00:00`);
  const nbJours = Math.round((fin.getTime() - debut.getTime()) / JOUR_MS) + 1;
  const joursDepuisFin = Math.round((maintenant.getTime() - fin.getTime()) / JOUR_MS);

  const alertes: string[] = [];
  if (nbJours < 3) alertes.push(`• Periode tres courte : seulement ${nbJours} jour(s)`);
  if (joursDepuisFin > 30) alertes.push(`• Derniere operation il y a ${joursDepuisFin} jours`);
  if (nbJours <= 0) {
    alertes.push(`• Periode invalide : fin (${endStr}) anterieure au debut (${startStr})`);
  }

  return { debut, fin, startStr, endStr, nbJours, joursDepuisFin, alertes };
}

function nettoyerChampCsv(valeur: string) {
  return valeur.replace(/\s+/g, " ").trim();
}

function separerChampsCsv(enregistrement: string) {
  const champs: string[] = [];
  let champ = "";
  let dansGuillemets = false;

  for (const caractere of enregistrement) {
    if (caractere === '"') {
      dansGuillemets = !dansGuillemets;
    } else if (caractere === ";" && !dansGuillemets) {
      champs.push(champ.trim());
      champ = "";
    } else {
      champ += caractere;
    }
  }
  champs.push(champ.trim());
  return champs;
}

function nombreCsv(valeur: string) {
  return parseFloat(valeur.replace(/\s/g, "").replace(",", ".")) || 0;
}

function estDateBancaire(valeur: string) {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(valeur)
    || /^\d{4}-\d{2}-\d{2}$/.test(valeur)
    || /^\d{1,2}-\d{1,2}-\d{4}$/.test(valeur);
}

/**
 * Lit un export Crédit Agricole (débit/crédit) ou un CSV simple
 * Date;Libellé;Montant. Seuls les mouvements entrants sont retournés.
 */
export function parserCsvBancaire(raw: string): LigneBancaireImportee[] {
  const lignes = raw.split("\n");
  let indexEntete = lignes.findIndex((ligne) => {
    const minuscule = ligne.toLowerCase();
    return minuscule.includes("date")
      && (minuscule.includes("libellé") || minuscule.includes("libelle") || minuscule.includes("label"));
  });
  if (indexEntete < 0) indexEntete = 0;

  const entete = lignes[indexEntete].toLowerCase();
  const debitCredit = entete.includes("débit") || entete.includes("debit")
    || entete.includes("crédit") || entete.includes("credit");
  const texte = lignes.slice(indexEntete + 1).join("\n");

  const enregistrements: string[] = [];
  let courant = "";
  let dansGuillemets = false;
  for (const caractere of texte) {
    if (caractere === '"') {
      dansGuillemets = !dansGuillemets;
      courant += caractere;
    } else if (caractere === "\n" && !dansGuillemets) {
      if (courant.trim()) enregistrements.push(courant);
      courant = "";
    } else {
      courant += caractere;
    }
  }
  // Les exports bancaires finissent normalement par un saut de ligne. Accepter
  // aussi le dernier enregistrement sans séparateur rend le parser indépendant
  // de ce détail de transport.
  if (courant.trim()) enregistrements.push(courant);

  return enregistrements.flatMap((enregistrement) => {
    const champs = separerChampsCsv(enregistrement);
    const date = nettoyerChampCsv(champs[0] || "");
    const label = nettoyerChampCsv(champs[1] || "");
    if (!estDateBancaire(date) || !label) return [];

    const debit = debitCredit ? nombreCsv(champs[2] || "0") : 0;
    const montantSimple = debitCredit ? 0 : nombreCsv(champs[2] || "0");
    const credit = debitCredit ? nombreCsv(champs[3] || "0") : Math.max(montantSimple, 0);
    const montant = Math.round((credit - (debitCredit ? debit : Math.max(-montantSimple, 0))) * 100) / 100;
    if (montant <= 0) return [];

    return [{
      date,
      label,
      amount: montant,
      matched: false,
      matchType: "",
      matchDetail: "",
    }];
  });
}

export function parserDateBancaire(valeur: string): Date | null {
  if (!valeur) return null;
  const francaise = valeur.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (francaise) {
    const jour = francaise[1].padStart(2, "0");
    const mois = francaise[2].padStart(2, "0");
    return new Date(`${francaise[3]}-${mois}-${jour}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return new Date(valeur);
  const tirets = valeur.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (tirets) {
    const jour = tirets[1].padStart(2, "0");
    const mois = tirets[2].padStart(2, "0");
    return new Date(`${tirets[3]}-${mois}-${jour}`);
  }
  return null;
}

export function cleLigneBancaire(ligne: { date: string; label: string; amount: number }) {
  return `${ligne.date}|${ligne.label}|${ligne.amount.toFixed(2)}`;
}

/** Extrait les transactions du détail de remise copié depuis Crédit Agricole. */
export function parserDetailCa(texte: string): number[] {
  const montants: number[] = [];
  const avecHeure = /\d{2}:\d{2}(?::\d{2})?\s*(\d{1,6})[,.](\d{2})\s*(?:EUR|€)/gi;
  let match: RegExpExecArray | null;

  while ((match = avecHeure.exec(texte)) !== null) {
    const montant = parseFloat(`${match[1]}.${match[2]}`);
    if (!Number.isNaN(montant) && montant > 0 && montant < 50000) montants.push(montant);
  }
  if (montants.length > 0) return montants;

  const ligneMontant = /(?:^|[\s\u00A0\t])(\d{1,3}(?:[\s\u00A0]\d{3})*|\d{1,6})[,.](\d{2})\s*(?:EUR|€)/i;
  for (const ligne of texte.split(/[\r\n]+/)) {
    const minuscule = ligne.toLowerCase();
    if (minuscule.includes("total") || minuscule.includes("somme")
      || minuscule.includes("récap") || minuscule.includes("recap")) continue;
    const trouve = ligne.match(ligneMontant);
    if (!trouve) continue;
    const partieEntiere = trouve[1].replace(/[\s\u00A0]/g, "");
    const montant = parseFloat(`${partieEntiere}.${trouve[2]}`);
    if (!Number.isNaN(montant) && montant > 0 && montant < 50000) montants.push(montant);
  }
  return montants;
}
