// ═══ Génération fichier SEPA Direct Debit — pain.008.001.02 ═══
// Format XML conforme au standard ISO 20022 pour remise au Crédit Agricole

export interface SepaCreditor {
  name: string;
  iban: string;
  bic: string;
  ics: string; // Identifiant Créancier SEPA (ex: FR57ZZZ852487)
}

export interface SepaTransaction {
  instrId: string;       // ID instruction unique (ex: 1868M1P23045)
  endToEndId: string;    // ID bout-en-bout (ex: M1P23045)
  amount: number;        // Montant en EUR
  mandatId: string;      // ID du mandat SEPA (ex: CEDC2190MD1)
  mandatDate: string;    // Date de signature du mandat (YYYY-MM-DD)
  debtorName: string;    // Nom du débiteur
  debtorIban: string;    // IBAN du débiteur
  debtorBic: string;     // BIC du débiteur
  remittanceInfo: string; // Info remise (ex: "Facture N 9712")
}

export interface SepaRemise {
  msgId: string;             // ID unique du message
  creationDate: string;      // Date/heure ISO de création
  requestedDate: string;     // Date de prélèvement demandée (YYYY-MM-DD)
  sequenceType: "FRST" | "RCUR" | "FNAL" | "OOFF"; // Type de séquence
  transactions: SepaTransaction[];
}

// Configuration du créancier (Centre Équestre d'Agon)
export const SEPA_CREDITOR: SepaCreditor = {
  name: "Centre equestre d'Agon Coutainville",
  iban: "FR7616606100640013539343253",
  bic: "AGRIFRPP866",
  ics: "FR57ZZZ852487",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSepaXml(remise: SepaRemise, creditor: SepaCreditor = SEPA_CREDITOR): string {
  const totalAmount = remise.transactions.reduce((s, t) => s + t.amount, 0);
  const nbTxs = remise.transactions.length;

  const txsXml = remise.transactions.map(tx => `<DrctDbtTxInf><PmtId><InstrId>${escapeXml(tx.instrId)}</InstrId><EndToEndId>${escapeXml(tx.endToEndId)}</EndToEndId></PmtId><InstdAmt Ccy="EUR">${tx.amount.toFixed(2)}</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>${escapeXml(tx.mandatId)}</MndtId><DtOfSgntr>${tx.mandatDate}</DtOfSgntr></MndtRltdInf></DrctDbtTx><DbtrAgt><FinInstnId><BIC>${escapeXml(tx.debtorBic)}</BIC></FinInstnId></DbtrAgt><Dbtr><Nm>${escapeXml(tx.debtorName)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${tx.debtorIban}</IBAN></Id></DbtrAcct><RmtInf><Ustrd>${escapeXml(tx.remittanceInfo)}</Ustrd></RmtInf></DrctDbtTxInf>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02 pain.008.001.02.xsd">
<CstmrDrctDbtInitn><GrpHdr><MsgId>${escapeXml(remise.msgId)}</MsgId><CreDtTm>${remise.creationDate}</CreDtTm><NbOfTxs>${nbTxs}</NbOfTxs><CtrlSum>${totalAmount.toFixed(2)}</CtrlSum><InitgPty><Nm>${escapeXml(creditor.name)}</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${escapeXml(remise.msgId)}P</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>false</BtchBookg><NbOfTxs>${nbTxs}</NbOfTxs><CtrlSum>${totalAmount.toFixed(2)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${remise.sequenceType}</SeqTp></PmtTpInf><ReqdColltnDt>${remise.requestedDate}</ReqdColltnDt><Cdtr><Nm>${escapeXml(creditor.name)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${creditor.iban}</IBAN></Id></CdtrAcct><CdtrAgt><FinInstnId><BIC>${creditor.bic}</BIC></FinInstnId></CdtrAgt><ChrgBr>SLEV</ChrgBr><CdtrSchmeId><Id><PrvtId><Othr><Id>${creditor.ics}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>${txsXml}</PmtInf></CstmrDrctDbtInitn></Document>`;
}

// Générer un ID de mandat unique : CEDC{familyCounter}MD{mandatCounter}
export function generateMandatId(remiseCounter: number, mandatIndex: number): string {
  return `CEDC${remiseCounter}MD${mandatIndex}`;
}

// Générer un ID d'instruction unique
export function generateInstrId(remiseId: string, mandatIndex: number, paymentId: string): string {
  return `${remiseId}M${mandatIndex}P${paymentId}`;
}
