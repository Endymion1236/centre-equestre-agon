"use client";
/**
 * src/app/admin/planning/useTarifsInscription.ts
 *
 * Les deux chargements Firestore dont dépendent les MONTANTS affichés :
 *
 *  - useSessionsSaison : combien de séances ce cours compte sur la saison, et
 *    combien il en reste. C'est le dénominateur et le numérateur du prorata —
 *    donc, très directement, ce que la famille va payer pour une inscription
 *    en cours d'année.
 *  - useLignesStage : le prix par enfant d'un stage, réductions fratrie et
 *    multi-stages appliquées.
 *
 * Sortis du panneau parce que ce sont des calculs asynchrones à cycle de vie
 * propre (annulation si le créneau change en cours de route), et que leurs
 * garde-fous — division par zéro, repli synchrone si le barème ne répond pas —
 * méritent d'être lisibles d'un seul tenant.
 */

import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { computeStageReductions, computeStageReductionsAsync } from "@/lib/planning-services";
import {
  fetchVacationPeriods, fetchDiscountSettings,
  type VacationPeriod, type DiscountSettings,
} from "@/lib/discounts";
import { calculePrixEffectifStage } from "./enroll-tarifs";

export function useSessionsSaison({ creneau, dateFinSaisonEffective, inscParams }: {
  creneau: any;
  dateFinSaisonEffective: Date;
  inscParams: { totalSessionsSaison: number };
}) {
  // Calculer 2 compteurs depuis Firestore en une seule requête :
  //   - sessionsTotalSaison : nombre de séances générées pour ce cours sur
  //     toute la saison du créneau (du 1er septembre au 30 juin). Sert de
  //     référence pour le prorata.
  //   - sessionsRestantes : nombre de séances entre [start, finSaison].
  //
  // Le prorata = sessionsRestantes / sessionsTotalSaison reflète le ratio
  // entre ce que le cavalier fera réellement et ce qu'il aurait fait en
  // s'inscrivant au début de la saison. Si on l'inscrit au début → 100%.
  //
  // Critères de comptage : même activityTitle + même startTime + même jour de
  // semaine que le créneau cliqué. Pas de filtre moniteur (changements possibles).
  const [sessionsRestantes, setSessionsRestantes] = useState<number>(0);
  const [sessionsTotalSaison, setSessionsTotalSaison] = useState<number>(inscParams.totalSessionsSaison || 35);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    const computeSessions = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const creneauDate = new Date(creneau.date);
      creneauDate.setHours(0, 0, 0, 0);
      const start = creneauDate > today ? creneauDate : today;
      const startStr = start.toISOString().split("T")[0];
      const endStr = dateFinSaisonEffective.toISOString().split("T")[0];
      const jourSemaineRef = creneauDate.getDay(); // 0=dim, 1=lun, ... 6=sam

      // Borne basse de la SAISON (1er septembre de l'année où démarre la saison).
      // Saison sept-juin : si dateFinSaisonEffective = 30/06/Y, début saison = 01/09/(Y-1)
      const finYear = dateFinSaisonEffective.getFullYear();
      const debutSaison = new Date(finYear - 1, 8, 1); // mois 8 = septembre
      const debutSaisonStr = debutSaison.toISOString().split("T")[0];

      try {
        // Une seule requête : tous les créneaux de la saison entière.
        // On filtre ensuite côté client pour les 2 compteurs.
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", debutSaisonStr),
          where("date", "<=", endStr),
        ));
        let totalSaison = 0;
        let restantes = 0;
        for (const d of snap.docs) {
          const c = d.data() as any;
          if (c.activityTitle !== creneau.activityTitle) continue;
          if (c.startTime !== creneau.startTime) continue;
          const cdow = new Date(c.date + "T12:00:00").getDay();
          if (cdow !== jourSemaineRef) continue;
          totalSaison++;
          if (c.date >= startStr) restantes++;
        }
        if (!cancelled) {
          setSessionsRestantes(restantes);
          // Garde-fou : si aucun créneau trouvé pour la saison, on retombe
          // sur le paramètre statique pour éviter une division par zéro.
          setSessionsTotalSaison(totalSaison > 0 ? totalSaison : (inscParams.totalSessionsSaison || 35));
          setLoadingSessions(false);
        }
      } catch (e) {
        console.error("Erreur calcul sessions", e);
        if (!cancelled) {
          setSessionsRestantes(0);
          setSessionsTotalSaison(inscParams.totalSessionsSaison || 35);
          setLoadingSessions(false);
        }
      }
    };
    computeSessions();
    return () => { cancelled = true; };
  }, [creneau.id, creneau.date, creneau.activityTitle, creneau.startTime, dateFinSaisonEffective, inscParams.totalSessionsSaison]);


  return { sessionsRestantes, sessionsTotalSaison, loadingSessions };
}

/**
 * Lignes de facturation d'un stage : un prix par enfant sélectionné.
 *
 * `existingStageCount` reste à 0 : réductions fratrie uniquement sur les
 * enfants inscrits EN MÊME TEMPS, pas de cumul avec les inscriptions passées —
 * une fois encaissé, compteur remis à zéro.
 */
export function useLignesStage({ isStage, selectedChildren, children, priceTTC, stageMode, stageDaysCount, creneau, fam }: {
  isStage: boolean;
  selectedChildren: string[];
  children: any[];
  priceTTC: number;
  stageMode: "semaine" | "jour";
  stageDaysCount: number;
  creneau: any;
  fam: any;
}) {
  // Calcul stage : réductions fratrie uniquement sur les enfants inscrits EN MÊME TEMPS
  // Pas de cumul avec les inscriptions passées — une fois encaissé, compteur reset
  const existingStageCount = 0;

  // Barèmes + périodes de vacances (chargés au montage pour applyDiscounts)
  const [discountSettings, setDiscountSettings] = useState<DiscountSettings>({
    familyDiscount: [], multiStageDiscount: [],
  });
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  useEffect(() => {
    fetchDiscountSettings().then(setDiscountSettings).catch(console.error);
    fetchVacationPeriods().then(setVacationPeriods).catch(console.error);
  }, []);

  // stageLines est calculé async (via applyDiscounts) en période de vacances
  // scolaires, et tombe en fallback sur le prix plein sinon.
  const [stageLines, setStageLines] = useState<any[]>([]);

  useEffect(() => {
    if (!isStage) { setStageLines([]); return; }

    // Nombre de jours réel du stage
    const nbJoursStage = stageDaysCount || 1;

    // Prix effectif selon mode + tarifs configurés sur le créneau
    // (cf. calculePrixEffectifStage : mode jour = prix jour brut, sans remise).
    const prixEffectif = calculePrixEffectifStage(creneau, priceTTC, stageMode, nbJoursStage);

    if (selectedChildren.length === 0 || !fam) { setStageLines([]); return; }

    // En mode JOUR : aucune réduction, aucun plancher. Prix jour brut par enfant.
    if (stageMode === "jour") {
      const lines: any[] = selectedChildren.map((childId) => {
        const child = children.find((c: any) => c.id === childId);
        const fullName = (child as any)?.lastName
          ? `${(child as any).firstName} ${(child as any).lastName}`
          : ((child as any)?.firstName || (child as any)?.name || "");
        return {
          childId,
          childName: fullName,
          prixBase: prixEffectif,
          prixReduit: prixEffectif,
          remiseEuros: 0,
          rang: 0,
          discountPercent: 0,
          discountReasons: [],
          originalPriceTTC: prixEffectif,
        };
      });
      setStageLines(lines);
      return;
    }

    // Calcul async via applyDiscounts
    let cancelled = false;
    (async () => {
      try {
        const lines = await computeStageReductionsAsync({
          selectedChildren,
          children,
          prixBase: prixEffectif,
          familyId: fam.firestoreId,
          stageDate: creneau.date,
          stageType: creneau.activityType,
          creneauId: creneau.id!,
          settings: discountSettings,
          periods: vacationPeriods,
        });
        if (!cancelled) {
          // Adapter childName avec le nom complet si disponible (compat avec l'UI)
          const adjusted = lines.map((l) => {
            const child = children.find((c: any) => c.id === l.childId);
            const fullName = (child as any)?.lastName
              ? `${(child as any).firstName} ${(child as any).lastName}`
              : ((child as any)?.firstName || l.childName);
            return { ...l, childName: fullName };
          });
          setStageLines(adjusted);
        }
      } catch (e) {
        console.error("[EnrollPanel] computeStageReductionsAsync failed, fallback synchrone:", e);
        if (!cancelled) {
          // Fallback en cas d'erreur : ancien comportement (sans cumul)
          setStageLines(computeStageReductions(selectedChildren, children, prixEffectif, existingStageCount));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isStage, selectedChildren, children, priceTTC, stageMode, stageDaysCount, creneau, fam, discountSettings, vacationPeriods]);


  return { stageLines, existingStageCount };
}
