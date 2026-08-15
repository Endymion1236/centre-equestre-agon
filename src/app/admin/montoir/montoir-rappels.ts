/**
 * src/app/admin/montoir/montoir-rappels.ts
 *
 * Le bouton « Rappeler » d'une reprise : un mail de rappel par FAMILLE, et
 * non par cavalier — deux freres inscrits au meme cours ne doivent pas valoir
 * deux mails identiques aux parents. Le regroupement se fait donc sur
 * l'adresse du parent, et les prenoms sont listes dans le meme message.
 *
 * Le modele change selon l'activite : rappel de stage (avec le deroule des
 * sequences saisi dans Parametres) ou rappel de cours.
 *
 * Code DEPLACE tel quel depuis le onClick inline de page.tsx : le corps de
 * l'envoi n'a pas bouge, seules les donnees de page arrivent en parametre.
 */

"use client";

import { emailTemplates } from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";
import type { Creneau, Toast } from "./types";

/** Ce que l'envoi de rappels emprunte a la page, passe explicitement. */
export type DepsRappels = {
  families: any[];
  /** Deroule des 2 sequences, reglage unique Parametres > Deroule stages. */
  stageDerouleHtml: string;
  toast: Toast;
};

export const envoyerRappels = async (c: Creneau, en: any[], deps: DepsRappels) => {
  const { families, stageDerouleHtml, toast } = deps;
                  const recipients = new Map<string, { email: string; parentName: string; children: string[]; familyId: string }>();
                  en.forEach((e: any) => {
                    const fam = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === e.childId));
                    if (fam?.parentEmail) {
                      const key = fam.parentEmail;
                      if (!recipients.has(key)) recipients.set(key, { email: key, parentName: fam.parentName || "", children: [], familyId: fam.firestoreId });
                      recipients.get(key)!.children.push(e.childName);
                    }
                  });
                  const isStageType = c.activityType === "stage" || c.activityType === "stage_journee";
                  let sent = 0;
                  for (const [, r] of recipients) {
                    try {
                      const emailData = isStageType
                        ? emailTemplates.rappelStage({ parentName: r.parentName, enfants: r.children, stageTitle: c.activityTitle, dateDebut: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), horaire: `${c.startTime}–${c.endTime}`, derouleHtml: stageDerouleHtml })
                        : emailTemplates.rappelCours({ parentName: r.parentName, childName: r.children.join(", "), coursTitle: c.activityTitle, date: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), horaire: `${c.startTime}–${c.endTime}`, moniteur: c.monitor || "" });
                      authFetch("/api/send-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: r.email,
                          ...emailData,
                          context: "admin_rappel_montoir",
                          template: isStageType ? "rappelStage" : "rappelCours",
                          familyId: r.familyId,
                          creneauId: c.id,
                        }),
                      }).catch(e => console.warn("Email:", e));
                      sent++;
                    } catch (e) { console.error(e); }
                  }
                  toast(`${sent} rappel${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}`, "success");
};
