/** Audit hors ligne, sans écriture : npx tsx scripts/audit-echeanciers-sepa.ts backup.json > audit.json
 * Entrée : export de /api/admin/backup-json. Le rapport contient des données personnelles :
 * conserver localement et ne jamais le joindre à une PR.
 */
import { readFileSync } from "node:fs";
import { datesEcheances } from "../src/lib/echeancier-paiement";

type Row = Record<string, any> & { id: string; dateEcheance: string };
const file = process.argv[2];
if (!file) throw new Error("Fournir un export JSON complet de /api/admin/backup-json");
const backup = JSON.parse(readFileSync(file, "utf8"));
const data = backup.data;
if (!Array.isArray(data?.["echeances-sepa"]) || !Array.isArray(data?.payments)) {
  throw new Error("Export incomplet : echeances-sepa et payments requis");
}
const rows: Row[] = data["echeances-sepa"];
const payments = new Map(data.payments.map((p: any) => [p.id, p]));
const groups = new Map<string, Row[]>();
const ambiguous: { id: string; raison: string }[] = [];
for (const row of rows) {
  const key = row.orderId ? `order:${row.orderId}:${row.mandatId}`
    : row.paymentId ? `payment:${row.paymentId}:${row.mandatId}` : null;
  if (!key || !Number.isInteger(row.echeance) || !Number.isInteger(row.echeancesTotal)) {
    ambiguous.push({ id: row.id, raison: "Série ou rang non renseigné : analyse manuelle" });
    continue;
  }
  groups.set(key, [...(groups.get(key) || []), row]);
}
const candidates: any[] = [];
const exclusions: any[] = [];
for (const [key, series] of groups) {
  const first = series.find(e => e.echeance === 1);
  const ranks = new Set(series.map(e => e.echeance));
  const total = first?.echeancesTotal;
  if (!first || !Number.isInteger(total) || total < 2 || series.length !== total || ranks.size !== total) {
    ambiguous.push({ id: key, raison: "Série incomplète, doublons ou premier rang absent" });
    continue;
  }
  const base = first.dateEcheance;
  let expected: string[];
  try { expected = datesEcheances(base, total); }
  catch { ambiguous.push({ id: key, raison: "Date de départ invalide" }); continue; }
  // Une divergence isolée peut être un décalage volontaire. Ne proposer que les
  // lignes correspondant exactement à l'ancien débordement de setMonth.
  for (const row of series) {
    const i = row.echeance - 1;
    if (i < 0 || i >= total || row.dateEcheance === expected[i]) continue;
    const old = new Date(`${base}T12:00:00`);
    old.setMonth(old.getMonth() + i);
    const oldDate = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, "0")}-${String(old.getDate()).padStart(2, "0")}`;
    if (row.dateEcheance !== oldDate) {
      ambiguous.push({ id: row.id, raison: "Date divergente de l'ancien algorithme : décalage manuel possible" });
      continue;
    }
    const blocked = row.status !== "pending" || row.remiseId != null || row.prelevementId != null;
    const payment: any = payments.get(row.paymentId) || data.payments.find((p: any) => p.orderId === row.orderId);
    const detail = { id: row.id, serie: key, rang: row.echeance, ancienneDate: row.dateEcheance,
      dateProposee: expected[i], status: row.status, remiseId: row.remiseId ?? null,
      famille: row.familyName, mandatId: row.mandatId,
      prenotificationEnvoyeeLe: payment?.prenotificationSepa?.envoyeeLe ?? null };
    (blocked ? exclusions : candidates).push(detail);
  }
}
console.log(JSON.stringify({ exporteLe: backup._meta?.exportedAt, analyses: rows.length,
  correctionProposee: candidates, conserverSansModification: exclusions,
  revueManuelle: ambiguous }, null, 2));
