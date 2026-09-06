"use client";
/**
 * Après l'inscription d'un stage « à la journée » : proposer les autres jours
 * du même stage, et recalculer la commande (prix jour × nb de jours) à chaque
 * ajout. Sorti du panneau d'inscription tel quel.
 */
import { collection, getDocs, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EnrolledChild } from "./types";

export interface JoursSupplementaires {
  familyId: string;
  enfants: { childId: string; childName: string }[];
  joursRestants: { id: string; date: string; label: string }[];
  totalJoursStage: number;
  joursInscrits: number;
  stageTitle: string;
  creneauRef: any;
}

interface Props {
  showAddDays: JoursSupplementaires | null;
  setShowAddDays: (v: JoursSupplementaires | null) => void;
  families: any[];
  onEnroll: (id: string, c: EnrolledChild, payMode?: string, options?: { skipPayment?: boolean; skipEmail?: boolean; freeReason?: string; rattrapageId?: string; skipRefresh?: boolean }) => Promise<string | boolean | void>;
  panelToast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setEnrolling: (v: boolean) => void;
  setJustEnrolled: (v: string) => void;
}

export function PanneauJoursSupplementaires({ showAddDays, setShowAddDays, families, onEnroll, panelToast, setEnrolling, setJustEnrolled }: Props) {
  if (!showAddDays) return null;
  return (
            <div className="border-t border-green-200 p-4 bg-green-50/50">
              <div className="font-body text-sm font-semibold text-green-700 mb-2">
                Inscrire aussi dans d'autres jours ?
              </div>
              <p className="font-body text-xs text-slate-600 mb-3">
                {showAddDays.enfants.map(e => e.childName).join(", ")} inscrit(s) pour 1 jour. Voulez-vous ajouter d'autres jours du même stage ?
              </p>
              <div className="flex flex-col gap-1.5 mb-3">
                {showAddDays.joursRestants.map(j => (
                  <button key={j.id} onClick={async () => {
                    setEnrolling(true);
                    try {
                      const fam2 = families.find(f => f.firestoreId === showAddDays.familyId);
                      let inscritsCeJour = 0;
                      if (fam2) {
                        for (const enfant of showAddDays.enfants) {
                          const ok = await onEnroll(j.id, {
                            childId: enfant.childId, childName: enfant.childName,
                            familyId: showAddDays.familyId, familyName: fam2.parentName || "—",
                            enrolledAt: new Date().toISOString(),
                          }, undefined, { skipPayment: true, skipEmail: true });
                          if (ok !== false) inscritsCeJour++;
                        }
                      }

                      // Sans ce contrôle, un jour complet (ou déjà pris) était
                      // facturé sans que personne n'y soit inscrit : la facture
                      // passait à 2 jours pour une seule journée réelle.
                      if (inscritsCeJour === 0) {
                        panelToast(
                          `Inscription impossible le ${j.label} — journée complète ou déjà inscrit. Tarif inchangé.`,
                          "error"
                        );
                        return;
                      }
                      // Recalcul tarif : jours inscrits AVANT + 1 (ce jour qu'on vient d'ajouter)
                      try {
                        const paySnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", showAddDays.familyId), where("status", "==", "pending")));
                        const stagePayment = paySnap.docs.find(d => {
                          const items = d.data().items || [];
                          return items.some((i: any) => (i.activityType === "stage" || i.activityType === "stage_journee") && i.stageKey?.includes(showAddDays.stageTitle));
                        }) || paySnap.docs.find(d => {
                          const items = d.data().items || [];
                          return items.some((i: any) => i.activityType === "stage" || i.activityType === "stage_journee");
                        });
                        if (stagePayment) {
                          const pData = stagePayment.data();
                          const oldItems = pData.items || [];
                          const totalDaysNow = showAddDays.joursInscrits + 1;
                          const totalJoursStage = showAddDays.totalJoursStage || 1;
                          const cr = showAddDays.creneauRef as any;
                          const prixComplet = (cr.priceTTC || (cr.priceHT || 0) * (1 + (cr.tvaTaux || 5.5) / 100)) || 0;
                          // Prix jour défini dans le stage (price1day), brut.
                          // Fallback prorata seulement si non configuré.
                          const prixJour = (cr.price1day && cr.price1day > 0)
                            ? cr.price1day
                            : Math.round((prixComplet / Math.max(1, totalJoursStage)) * 100) / 100;
                          // Prix = prix jour × nb de jours ; si tous les jours pris,
                          // on retombe sur le prix semaine complet. AUCUNE remise.
                          const prixBase = (totalDaysNow >= totalJoursStage)
                            ? prixComplet
                            : Math.round(prixJour * totalDaysNow * 100) / 100;

                          const crRef = showAddDays.creneauRef as any;
                          const updatedItems = oldItems.map((item: any) => {
                            if (item.activityType !== "stage" && item.activityType !== "stage_journee") return item;
                            // Prix jour brut, sans réduction ni plancher.
                            const newPriceTTC = Math.max(0, Math.round(prixBase * 100) / 100);
                            // Mettre à jour le libellé pour refléter le nb de jours réel.
                            let newTitle = item.activityTitle || "";
                            if (/\(\d+j\)/.test(newTitle)) {
                              newTitle = newTitle.replace(/\(\d+j\)/, `(${totalDaysNow}j)`);
                            }
                            // Ajouter la date du jour ajouté au détail (stageDates),
                            // en évitant les doublons, et trier par date.
                            const existingDates = Array.isArray(item.stageDates) ? [...item.stageDates] : [];
                            if (!existingDates.some((d: any) => d.date === j.date)) {
                              existingDates.push({ date: j.date, startTime: crRef?.startTime || "", endTime: crRef?.endTime || "" });
                            }
                            existingDates.sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
                            // Recomposer un libellé de planning lisible (du X au Y).
                            let newSchedule = item.stageSchedule || "";
                            if (existingDates.length > 1) {
                              const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                              newSchedule = `du ${fmt(existingDates[0].date)} au ${fmt(existingDates[existingDates.length - 1].date)} · ${crRef?.startTime || ""}–${crRef?.endTime || ""}`;
                            }
                            const existingCreneauIds = Array.isArray(item.creneauIds) ? [...item.creneauIds] : (item.creneauId ? [item.creneauId] : []);
                            if (!existingCreneauIds.includes(j.id)) existingCreneauIds.push(j.id);
                            return {
                              ...item,
                              activityTitle: newTitle,
                              priceTTC: newPriceTTC,
                              priceHT: Math.round(newPriceTTC / 1.055 * 100) / 100,
                              stageDates: existingDates,
                              stageSchedule: newSchedule,
                              creneauIds: existingCreneauIds,
                            };
                          });
                          const newTotal = Math.round(updatedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;
                          await updateDoc(doc(db, "payments", stagePayment.id), {
                            items: updatedItems, totalTTC: newTotal, updatedAt: serverTimestamp(),
                          });
                        }
                      } catch (e) { console.error("Erreur mise à jour tarif stage:", e); }
                      setJustEnrolled(`${showAddDays.enfants.map(e => e.childName).join(", ")} ajouté(s) le ${j.label}`);
                      const remaining = showAddDays.joursRestants.filter(jr => jr.id !== j.id);
                      if (remaining.length > 0) {
                        setShowAddDays({ ...showAddDays, joursRestants: remaining, joursInscrits: showAddDays.joursInscrits + 1 });
                      } else {
                        setShowAddDays(null);
                      }
                    } catch (e) { console.error(e); }
                    setEnrolling(false);
                    setTimeout(() => setJustEnrolled(""), 4000);
                  }}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-green-200 bg-white font-body text-sm cursor-pointer hover:bg-green-50 text-left">
                    <span className="text-blue-800 font-medium">{j.label}</span>
                    <span className="text-green-600 text-xs font-semibold">+ Ajouter</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddDays(null)}
                className="w-full py-2 rounded-lg font-body text-xs text-slate-600 bg-gray-100 border-none cursor-pointer">
                Terminé
              </button>
            </div>
  );
}
