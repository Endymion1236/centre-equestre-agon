/**
 * src/app/admin/management/planning-utils.ts
 *
 * Le calcul du planning des salariés, sans écran ni base.
 *
 * Le découpage automatique est la pièce délicate : quand on pose une tâche
 * sur un créneau déjà occupé, les tâches en place doivent s'écarter — être
 * raccourcies, coupées en deux, ou disparaître si elles sont entièrement
 * recouvertes. Ce calcul décidait de la journée de travail d'une personne
 * sans qu'aucun test ne le vérifie.
 */

import type { TachePlanifiee } from "./types";

export const TIME_SLOTS = Array.from({length: (20-7)*4+1}, (_,i) => {
  const totalMin = 7*60 + i*15;
  return `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
});

export function heureToMin(h: string) { const [hh,mm] = h.split(":").map(Number); return hh*60+mm; }
export function minToHeure(m: number) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

// ── Découpage automatique des tâches chevauchées ───────────────────────────
// Quand on insère une nouvelle tâche [newStart, newEnd] (en minutes) sur un
// même salarié/jour, on ajuste les tâches existantes qui la chevauchent :
//   - entièrement à l'intérieur → coupée en deux (avant + après)
//   - chevauchement d'un côté   → raccourcie
//   - entièrement recouverte    → supprimée
export type DecoupeOps = {
  updates: { id: string; heureDebut: string; dureeMinutes: number; label: string; ancien: string }[];
  creates: { from: TachePlanifiee; heureDebut: string; dureeMinutes: number; label: string }[];
  deletes: { id: string; label: string; plage: string }[];
};
export function planDecoupage(existing: TachePlanifiee[], newStart: number, newEnd: number): DecoupeOps {
  const ops: DecoupeOps = { updates: [], creates: [], deletes: [] };
  for (const t of existing) {
    const s = heureToMin(t.heureDebut);
    const e = s + t.dureeMinutes;
    if (!(s < newEnd && e > newStart)) continue; // pas de chevauchement
    const beforeStart = s, beforeEnd = Math.min(e, newStart);
    const afterStart = Math.max(s, newEnd), afterEnd = e;
    const hasBefore = beforeEnd > beforeStart;
    const hasAfter = afterEnd > afterStart;
    const ancien = `${t.heureDebut}→${minToHeure(e)}`;
    if (hasBefore && hasAfter) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(beforeStart), dureeMinutes: beforeEnd - beforeStart, label: t.tacheLabel, ancien });
      ops.creates.push({ from: t, heureDebut: minToHeure(afterStart), dureeMinutes: afterEnd - afterStart, label: t.tacheLabel });
    } else if (hasBefore) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(beforeStart), dureeMinutes: beforeEnd - beforeStart, label: t.tacheLabel, ancien });
    } else if (hasAfter) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(afterStart), dureeMinutes: afterEnd - afterStart, label: t.tacheLabel, ancien });
    } else {
      ops.deletes.push({ id: t.id, label: t.tacheLabel, plage: ancien });
    }
  }
  return ops;
}

/**
 * Arrondit une duree au quart d'heure le plus proche, avec un minimum de
 * 15 min. Utilise pour les pre-remplissages depuis tachesType (qui peuvent
 * avoir des durees non-multiples de 15 comme 5, 10 ou 20 min).
 */
export function roundToQuarter(min: number): number {
  if (min <= 15) return 15;
  return Math.round(min / 15) * 15;
}

export const COULEURS_SALARIE = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151"];

