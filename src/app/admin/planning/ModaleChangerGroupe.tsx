"use client";
/**
 * src/app/admin/planning/ModaleChangerGroupe.tsx
 *
 * Déplacer un cavalier d'un stage — ou d'un groupe — vers un autre, en une
 * opération. L'écran ne décide de rien : il affiche le plan calculé par
 * `@/lib/changement-groupe` (ce qui coince, ce que devient le prix) et ne
 * laisse valider que si le plan est jouable.
 *
 * Ce qui est montré avant de cliquer, parce que c'est ce qui se passe mal
 * quand on le fait à la main : le prix, l'acompte déjà versé, et le fait que
 * la liste d'attente sera prévenue — ou non.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, ArrowRight } from "lucide-react";
import { grouperEnStages, type CreneauStage, type PlanChangementGroupe } from "@/lib/changement-groupe";
import { memeStage } from "@/lib/meme-stage";
import { fetchVacationPeriods, getPeriodForDate, type VacationPeriod } from "@/lib/discounts";
import { appliquerChangement, prepererChangement } from "./changer-groupe-actions";

/** Combien de temps on regarde devant soi pour proposer des destinations. */
const HORIZON_JOURS = 120;

const enISO = (d: Date) => d.toISOString().split("T")[0];

const jourCourt = (dateISO: string) =>
  new Date(dateISO + "T12:00:00Z").toLocaleDateString("fr-FR",
    { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** « du lundi 19 au mercredi 21 octobre — 9h00 » */
function libelleStage(jours: CreneauStage[]): string {
  if (jours.length === 0) return "";
  const debut = jourCourt(jours[0].date);
  const fin = jours.length > 1 ? ` → ${jourCourt(jours[jours.length - 1].date)}` : "";
  const heure = jours[0].startTime ? ` · ${jours[0].startTime}` : "";
  return `${debut}${fin}${heure} · ${jours.length}j`;
}

interface Props {
  /** Le créneau depuis lequel on ouvre le panneau. */
  creneau: CreneauStage & { id: string };
  childId: string;
  childName: string;
  /** Créneaux affichés à l'écran, pour repérer un conflit d'horaire. */
  creneauxConnus: CreneauStage[];
  periodeSource?: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function ModaleChangerGroupe({
  creneau, childId, childName, creneauxConnus, periodeSource, onClose, onDone, toast,
}: Props) {
  const [chargement, setChargement] = useState(true);
  // Les périodes de vacances servent uniquement à prévenir : les barèmes de
  // réduction diffèrent d'une période à l'autre, et le déplacement conserve
  // la remise d'origine au lieu de la recalculer.
  const [periodes, setPeriodes] = useState<VacationPeriod[]>([]);
  const [destinations, setDestinations] = useState<CreneauStage[][]>([]);
  const [choix, setChoix] = useState<number | null>(null);
  const [prepare, setPrepare] = useState<Awaited<ReturnType<typeof prepererChangement>>>(null);
  const [calcul, setCalcul] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // ── Les destinations possibles ─────────────────────────────────────────
  // Tous les stages à venir, le stage actuel mis à part. On part du lundi du
  // stage en cours pour que les autres groupes de la MÊME semaine — le cas le
  // plus courant — apparaissent en tête.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const debut = new Date(creneau.date + "T12:00:00Z");
        debut.setUTCDate(debut.getUTCDate() - ((debut.getUTCDay() + 6) % 7));
        const fin = new Date(debut);
        fin.setUTCDate(fin.getUTCDate() + HORIZON_JOURS);

        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", enISO(debut)),
          where("date", "<=", enISO(fin)),
        ));
        const stages = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((c) => c.activityType === "stage" || c.activityType === "stage_journee");

        const lots = grouperEnStages(stages).filter((lot) => !memeStage(lot[0], creneau));
        if (!annule) setDestinations(lots);
        const vacances = await fetchVacationPeriods();
        if (!annule) setPeriodes(vacances);
      } catch (e) {
        console.error("Chargement des destinations:", e);
        if (!annule) toast("Impossible de charger les stages disponibles.", "error");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [creneau, toast]);

  // ── Le plan, recalculé à chaque changement de destination ──────────────
  useEffect(() => {
    if (choix === null) { setPrepare(null); return; }
    let annule = false;
    setCalcul(true);
    (async () => {
      try {
        const resultat = await prepererChangement(
          {
            creneauId: creneau.id, childId, creneauxConnus,
            periodeSource: periodeSource ?? getPeriodForDate(creneau.date, periodes),
          },
          {
            creneaux: destinations[choix] as any,
            periodeId: getPeriodForDate(destinations[choix][0].date, periodes),
          },
        );
        if (!annule) setPrepare(resultat);
      } catch (e: any) {
        console.error("Préparation du changement:", e);
        if (!annule) toast(`Calcul impossible : ${e?.message || e}`, "error");
      } finally {
        if (!annule) setCalcul(false);
      }
    })();
    return () => { annule = true; };
  }, [choix, destinations, creneau.id, creneau.date, childId, creneauxConnus, periodeSource, periodes, toast]);

  const plan: PlanChangementGroupe | null = prepare?.plan || null;

  const groupesDeLaSemaine = useMemo(() => {
    const lundi = new Date(creneau.date + "T12:00:00Z");
    lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
    const dimanche = new Date(lundi);
    dimanche.setUTCDate(dimanche.getUTCDate() + 6);
    return new Set(destinations
      .map((lot, i) => (lot[0].date >= enISO(lundi) && lot[0].date <= enISO(dimanche) ? i : -1))
      .filter((i) => i >= 0));
  }, [destinations, creneau.date]);

  const valider = async () => {
    if (!prepare || !plan?.possible || choix === null) return;
    setEnvoi(true);
    try {
      const resultat = await appliquerChangement(
        {
          creneauId: creneau.id, childId, creneauxConnus,
          periodeSource: periodeSource ?? getPeriodForDate(creneau.date, periodes),
        },
        {
          creneaux: destinations[choix] as any,
          periodeId: getPeriodForDate(destinations[choix][0].date, periodes),
        },
        prepare, toast,
      );
      if (!resultat.ok) { toast(resultat.message, "error", 8000); return; }
      toast(
        resultat.refAvoir ? `${resultat.message} — avoir ${resultat.refAvoir}` : resultat.message,
        "success", 7000,
      );
      await onDone();
      onClose();
    } catch (e: any) {
      console.error("Changement de groupe:", e);
      toast(`Le déplacement a échoué : ${e?.message || e}`, "error", 8000);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Changer {childName} de groupe</h2>
            <p className="font-body text-xs text-slate-500">
              Actuellement : <strong>{creneau.activityTitle}</strong>
              {creneau.startTime ? ` · ${creneau.startTime}` : ""} · semaine du {jourCourt(creneau.date)}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="font-body text-xs text-blue-800 leading-relaxed">
              L'inscription est <strong>déplacée</strong>, pas refaite : la commande, l'acompte déjà versé et le numéro de
              facture restent les mêmes. Seul le prix bouge, et seulement de l'écart entre les deux tarifs.
            </p>
          </div>

          {chargement ? (
            <div className="flex items-center gap-2 font-body text-sm text-slate-500 py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> Chargement des stages…
            </div>
          ) : destinations.length === 0 ? (
            <p className="font-body text-sm text-slate-500 italic py-6 text-center">
              Aucun autre stage sur les {HORIZON_JOURS} prochains jours.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              {destinations.map((lot, i) => {
                const places = Math.min(...lot.map((c) =>
                  (c.maxPlaces || 0) - (c.enrolled || []).filter((e: any) => e?.childId !== childId).length));
                const complet = places <= 0;
                return (
                  <button key={lot[0].id || i} type="button" disabled={complet}
                    onClick={() => setChoix(i)}
                    className={`text-left rounded-lg border px-3 py-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                      choix === i ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body text-sm font-semibold text-slate-700">{lot[0].activityTitle}</span>
                      <span className={`font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        complet ? "text-rose-700 bg-rose-100" : "text-emerald-700 bg-emerald-100"
                      }`}>
                        {complet ? "complet" : `${places} place${places > 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <div className="font-body text-[11px] text-slate-500">
                      {libelleStage(lot)}
                      {groupesDeLaSemaine.has(i) && <span className="text-blue-600"> · même semaine</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {calcul && (
            <div className="flex items-center gap-2 font-body text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" /> Calcul…
            </div>
          )}

          {plan && !calcul && (
            <div className="border-t border-gray-100 pt-4">
              {plan.itemModifie !== null && (
                <div className="flex items-center gap-2 font-body text-sm mb-3">
                  <span className="text-slate-500">{plan.prixAncien.toFixed(2)}€</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <strong className={plan.ecart === 0 ? "text-slate-700" : plan.ecart > 0 ? "text-orange-600" : "text-emerald-600"}>
                    {plan.prixNouveau.toFixed(2)}€
                  </strong>
                  {plan.ecart !== 0 && (
                    <span className={`font-body text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      plan.ecart > 0 ? "text-orange-700 bg-orange-100" : "text-emerald-700 bg-emerald-100"
                    }`}>
                      {plan.ecart > 0 ? "+" : ""}{plan.ecart.toFixed(2)}€
                    </span>
                  )}
                  <span className="font-body text-[11px] text-slate-400 ml-auto">
                    déjà réglé : {plan.paidAmount.toFixed(2)}€
                  </span>
                </div>
              )}

              {plan.blocages.map((b, i) => (
                <div key={i} className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-1.5">
                  <p className="font-body text-xs text-rose-800">⛔ {b}</p>
                </div>
              ))}
              {plan.avertissements.map((a, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1.5">
                  <p className="font-body text-xs text-amber-800">{a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose}
            className="font-body text-sm text-slate-600 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50">
            Annuler
          </button>
          <button type="button" disabled={!plan?.possible || envoi || calcul} onClick={valider}
            className="font-body text-sm text-white border-none rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
            {envoi && <Loader2 size={14} className="animate-spin" />}
            Déplacer {childName}
          </button>
        </div>
      </div>
    </div>
  );
}
