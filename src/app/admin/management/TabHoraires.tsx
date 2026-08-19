"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, addDoc, deleteDoc, setDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChevronLeft, ChevronRight, Printer, Plus, Trash2, Calendar, Wallet } from "lucide-react";
import type { TachePlanifiee, Salarie, JourSemaine, Absence, BilanHebdo, TypeAbsence } from "./types";
import { JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, fmtDuree, LIBELLE_ABSENCE } from "./types";
import { MOIS_LISSES, MOIS_DECOMPTE_LISSAGE, soldeLissage, etatSemaine, lundiDansPeriodeLissee, type SoldeLissage } from "@/lib/lissage-ete";
import { calculerJournee, minutesEnHeure } from "@/lib/temps-travail";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  salaries: Salarie[];
}

function heureToMin(h: string) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
function minToHeure(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
/** Durée signée pour le compteur : +1h30 / −2h00 / 0h00. */
function fmtSigne(min: number) { return `${min < 0 ? "−" : "+"}${fmtDuree(Math.abs(min))}`; }

const contratMinDe = (s: Salarie) => Math.round((s.heuresContratSemaine ?? 35) * 60);
const joursTravDe = (s: Salarie) => s.joursTravailles ?? 5;
/** Valeur par défaut (minutes) d'un jour d'absence pour un salarié. */
const jourMinDe = (s: Salarie) => Math.round(contratMinDe(s) / Math.max(1, joursTravDe(s)));
/** "YYYY-MM-DD" en date locale (les jours du mois sont construits en local). */
const dateISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;


function getWeeksOfMonth(year: number, month: number): string[] {
  const weeks: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const iso = getISOWeek(d);
    if (!weeks.includes(iso)) weeks.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

/**
 * Données d'une ligne de la fiche horaire pour un jour.
 *
 * Les pauses sont marquées **explicitement** (catégorie "pause") par l'admin
 * dans le planning. Elles sont exclues du temps de travail calculé.
 *
 * Si la journée contient au moins une tâche "pause", on coupe l'affichage
 * matin / après-midi autour de la première pause. Sinon, journée continue.
 *
 * Le `duree` ne compte JAMAIS les pauses — c'est la durée réelle travaillée
 * (= amplitude de la journée moins la somme des durées des pauses explicites).
 */
type RowData = {
  date: Date;
  jour: JourSemaine;
  debut: string;        // début matin OU début unique si pas de pause
  fin: string;          // fin matin OU fin unique si pas de pause
  debutAprem: string;   // vide si pas de pause explicite
  finAprem: string;     // vide si pas de pause explicite
  pauseMin: number;     // 0 si pas de pause, sinon somme des pauses en minutes
  duree: number;        // durée travaillée (pauses exclues)
  isSamedi: boolean;
  isoWeek: string;
  absenceLabel?: string; // ex. "Congé payé" si une absence couvre ce jour
  absenceMin?: number;   // durée de l'absence (minutes)
};
/** Découpe pour les requêtes Firestore `in`, limitées à 10 valeurs. */
function paquetsDe10<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
  return out;
}

/** Bilan de la période lissée, tel qu'affiché en août. */
type BilanLissage = SoldeLissage & {
  semaines: number;         // semaines dues, comptées au contrat de la période
  travaille: number;        // minutes réellement travaillées
  absMin: number;           // absences payées de la période (pour information)
  /**
   * Semaines comptées au contrat alors qu'elles ne contiennent NI heure NI
   * congé. Chacune ajoute un contrat hebdomadaire au dénominateur et efface
   * d'autant les heures sup des autres semaines. C'est le piège d'Eva :
   * présente une seule semaine en août, 28 h faites pour 25 h de contrat, et
   * aucune heure sup — parce que sept semaines vides pesaient sur la période.
   */
  semainesVides: string[];
  /**
   * Projection FIN AOÛT : toutes les semaines dues de la période, y compris
   * celles à venir dont le planning est déjà posé. C'est le chiffre qu'on
   * obtient en comptant l'été à la main — le solde arrêté, lui, ne juge que
   * les semaines terminées. Sans cette ligne, l'écran affichait 0 heure sup
   * le 19 août à quelqu'un dont les 5 h de dépassement étaient sur la
   * dernière semaine du mois, déjà planifiée.
   */
  prevision: SoldeLissage & { semaines: number; travaille: number };
};

type WeekSummary = {
  isoWeek: string;
  travaille: number;   // minutes réellement travaillées
  absMin: number;      // minutes d'absence payée (neutralisent le contrat)
  cible: number;       // contrat − absences
  surplus: number;     // max(0, travaille − cible)
  deficit: number;     // max(0, cible − travaille)
  mode: "paye" | "recup";
  clos: boolean;
  contribution: number; // ce qui irait au compteur : (recup? surplus:0) − deficit
  supPayee: number;     // heures sup payées de la semaine
  aVenir: boolean;      // semaine entièrement future (non comptée au compteur)
  enCours: boolean;     // semaine commencée mais pas terminée
  surplusPrevu: number; // dépassement d'une semaine À VENIR, déjà planifié
  horsContrat: boolean; // salarié pas en poste cette semaine-là
  aCheval: boolean;     // semaine à cheval sur le mois précédent ou suivant
  horsMois: number;     // minutes de la semaine tombant dans le mois voisin
  moisVoisin: string;   // nom de ce mois voisin ("juillet", "septembre"…)
  lissee: boolean;      // semaine neutralisée par le lissage d'été
};

export default function TabHoraires({ semaine, setSemaine, taches, salaries }: Props) {
  const lundi = getLundideSemaine(semaine);
  const [mois, setMois] = useState(() => lundi.getMonth());
  const [annee, setAnnee] = useState(() => lundi.getFullYear());
  const [allTaches, setAllTaches] = useState<TachePlanifiee[]>([]);
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [allBilans, setAllBilans] = useState<BilanHebdo[]>([]);
  const [salEdits, setSalEdits] = useState<Record<string, Partial<Salarie>>>({});
  const [loading, setLoading] = useState(false);
  const [selectedSalId, setSelectedSalId] = useState<string>("");

  // Salarié avec ses éventuelles éditions locales (contrat / compteur) appliquées.
  const salFusion = useCallback((s: Salarie): Salarie => ({ ...s, ...salEdits[s.id] }), [salEdits]);

  const activeSals = salaries.filter(s => s.actif);
  const weeksOfMonth = useMemo(() => getWeeksOfMonth(annee, mois), [annee, mois]);
  // Les semaines de la période lissée (juillet + août). En août, le solde se
  // calcule sur les deux mois : il faut donc charger juillet en plus.
  const weeksPeriodeLissee = useMemo(
    () => (MOIS_LISSES.includes(mois)
      ? [...getWeeksOfMonth(annee, 6), ...getWeeksOfMonth(annee, 7)]
      : []),
    [annee, mois],
  );
  const weeksAcharger = useMemo(() => {
    const vues = mois === MOIS_DECOMPTE_LISSAGE ? [...weeksPeriodeLissee, ...weeksOfMonth] : weeksOfMonth;
    return Array.from(new Set(vues));
  }, [mois, weeksPeriodeLissee, weeksOfMonth]);
  const moisLabel = new Date(annee, mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // `in` est plafonné à 10 valeurs : la période lissée en dépasse, d'où le
      // découpage. Sans lui, les dernières semaines seraient silencieusement
      // absentes — et un congé d'août aurait disparu du calcul.
      const paquets = paquetsDe10(weeksAcharger);
      const [snaps, absSnaps, bilSnaps] = await Promise.all([
        Promise.all(weeksAcharger.map(w => getDocs(query(collection(db, "taches-planifiees"), where("semaine", "==", w))))),
        Promise.all(paquets.map(p => getDocs(query(collection(db, "absences-management"), where("semaine", "in", p))))),
        Promise.all(paquets.map(p => getDocs(query(collection(db, "bilans-heures"), where("semaine", "in", p))))),
      ]);
      const all: TachePlanifiee[] = [];
      snaps.forEach(snap => snap.docs.forEach(d => all.push({ id: d.id, ...d.data() } as TachePlanifiee)));
      setAllTaches(all);
      const abs: Absence[] = [];
      absSnaps.forEach(snap => snap.docs.forEach(d => abs.push({ id: d.id, ...d.data() } as Absence)));
      setAllAbsences(abs);
      const bil: BilanHebdo[] = [];
      bilSnaps.forEach(snap => snap.docs.forEach(d => bil.push({ id: d.id, ...d.data() } as BilanHebdo)));
      setAllBilans(bil);
      setLoading(false);
    };
    load();
  }, [weeksAcharger]);

  const prevMonth = () => { if (mois === 0) { setMois(11); setAnnee(a => a - 1); } else setMois(m => m - 1); };
  const nextMonth = () => { if (mois === 11) { setMois(0); setAnnee(a => a + 1); } else setMois(m => m + 1); };

  const joursduMois = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(annee, mois, 1);
    while (d.getMonth() === mois) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  }, [annee, mois]);

  const handlePrint = () => window.print();

  // ── Persistance RH ────────────────────────────────────────────────────────
  const majSalarie = async (salId: string, patch: Partial<Salarie>) => {
    setSalEdits(prev => ({ ...prev, [salId]: { ...prev[salId], ...patch } }));
    try { await updateDoc(doc(db, "salaries-management", salId), { ...patch, updatedAt: serverTimestamp() }); } catch (e) { console.error(e); }
  };

  const ajouterAbsence = async (sal: Salarie, date: string, type: TypeAbsence, dureeMinutes: number) => {
    if (!date) return;
    const semaine = getISOWeek(new Date(date + "T12:00:00"));
    const payload: Omit<Absence, "id"> = { salarieId: sal.id, salarieName: sal.nom, date, semaine, type, dureeMinutes, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "absences-management"), payload);
    setAllAbsences(prev => [...prev, { id: ref.id, ...payload }]);
  };

  const supprimerAbsence = async (absId: string) => {
    await deleteDoc(doc(db, "absences-management", absId));
    setAllAbsences(prev => prev.filter(a => a.id !== absId));
  };

  /**
   * Semaine travaillée ou non. Les saisonniers n'arrivent pas le 1er juillet :
   * sans ce marqueur, chaque semaine précédant leur prise de poste comptait un
   * contrat plein en déficit, et gonflait le contrat de la période lissée.
   */
  const setHorsContrat = async (salId: string, semaine: string, horsContrat: boolean) => {
    const id = `${salId}_${semaine}`;
    const existing = allBilans.find(b => b.id === id);
    const payload: BilanHebdo = {
      id, salarieId: salId, semaine,
      surplusMode: existing?.surplusMode ?? "paye",
      clos: existing?.clos ?? false,
      horsContrat,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  const setMode = async (salId: string, semaine: string, surplusMode: "paye" | "recup") => {
    const id = `${salId}_${semaine}`;
    const payload: BilanHebdo = { id, salarieId: salId, semaine, surplusMode, clos: false, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  // Intègre la contribution d'une semaine au compteur du salarié et clôt la semaine.
  const appliquerSemaine = async (sal: Salarie, semaine: string, contributionMin: number) => {
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant + contributionMin });
    const id = `${sal.id}_${semaine}`;
    const existing = allBilans.find(b => b.id === id);
    const payload: BilanHebdo = { id, salarieId: sal.id, semaine, surplusMode: existing?.surplusMode ?? "paye", clos: true, contributionAppliquee: contributionMin, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  // Rouvre une semaine close : retranche du compteur ce qui avait été appliqué.
  const decloturerSemaine = async (sal: Salarie, semaine: string) => {
    const id = `${sal.id}_${semaine}`;
    const existing = allBilans.find(b => b.id === id);
    const aRetrancher = existing?.contributionAppliquee ?? 0;
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant - aRetrancher });
    const payload: BilanHebdo = { id, salarieId: sal.id, semaine, surplusMode: existing?.surplusMode ?? "paye", clos: false, contributionAppliquee: 0, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  const ajusterCompteur = async (sal: Salarie, deltaMin: number) => {
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant + deltaMin });
  };

  /**
   * Une semaine appartient à la période lissée si son LUNDI tombe en juillet
   * ou en août. Le critère porte sur la semaine entière, jamais sur le mois
   * affiché : la semaine du 31 août au 6 septembre est comptée en entier, celle
   * du 29 juin au 5 juillet reste dans le décompte de juin. Sans quoi une
   * semaine à cheval serait facturée à contrat plein pour deux ou trois jours
   * de travail regardés.
   */
  const dansPeriodeLissee = (isoWeek: string): boolean =>
    lundiDansPeriodeLissee(getLundideSemaine(isoWeek), annee);

  /** Les sept jours d'une semaine ISO, du lundi au dimanche. */
  const joursDeLaSemaine = (isoWeek: string): Date[] => {
    const lundi = getLundideSemaine(isoWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      return d;
    });
  };

  /**
   * La journée d'un salarié, calculée par la règle commune
   * (lib/temps-travail.ts) : périodes travaillées, battements courts comptés,
   * pauses saisies déduites.
   *
   * Source unique du tableau mensuel ET du total de la période lissée. Celle-ci
   * déborde du mois affiché : deux calculs séparés auraient fini par diverger,
   * et le total imprimé n'aurait plus expliqué les heures sup annoncées.
   */
  const journeeDe = (salTaches: TachePlanifiee[], date: Date) => {
    const dow = (date.getDay() + 6) % 7;
    const jour = JOURS[dow] as JourSemaine;
    const isoWeek = getISOWeek(date);
    const dayTaches = salTaches.filter(t => t.semaine === isoWeek && t.jour === jour);
    const calc = calculerJournee(dayTaches);
    return { jour, isoWeek, dow, calc, duree: calc.dureeMin };
  };

  /**
   * Solde de la période lissée (juillet + août).
   *
   * Ne comptent que les semaines TERMINÉES : une semaine en cours apporterait
   * un contrat plein pour quelques jours travaillés, donc un déficit qui
   * n'existe pas. Chaque semaine retenue est comptée sur ses sept jours, même
   * quand ils débordent sur juin ou septembre.
   */
  const bilanLissage = (sal: Salarie): BilanLissage => {
    const contrat = contratMinDe(sal);
    const salTaches = allTaches.filter(t => t.salarieId === sal.id);
    const debutAujourdhui = new Date(); debutAujourdhui.setHours(0, 0, 0, 0);

    const semainesComptees = Array.from(new Set(weeksPeriodeLissee))
      .filter(dansPeriodeLissee)
      .filter(w => etatSemaine(getLundideSemaine(w), debutAujourdhui) === "terminee");

    // Les semaines hors contrat sortent du CONTRAT de la période — un saisonnier
    // arrivé mi-juillet ne doit pas les deux premières semaines du mois — mais
    // leurs heures, s'il y en a, restent comptées.
    const semainesDues = semainesComptees.filter(
      w => !allBilans.find(b => b.id === `${sal.id}_${w}`)?.horsContrat,
    );

    const travaille = semainesComptees.reduce(
      (sum, w) => sum + joursDeLaSemaine(w).reduce((s2, d) => s2 + journeeDe(salTaches, d).duree, 0),
      0,
    );

    const absMin = allAbsences
      .filter(a => a.salarieId === sal.id && a.type !== "sans_solde" && semainesDues.includes(a.semaine))
      .reduce((sum, a) => sum + (a.dureeMinutes || 0), 0);

    // Semaines dues sans la moindre heure ni le moindre congé : soit le salarié
    // n'était pas en poste, soit le planning n'a jamais été saisi. Dans les deux
    // cas elles alourdissent le contrat de la période sans rien y apporter.
    const semainesVides = semainesDues.filter(w => {
      const heures = joursDeLaSemaine(w).reduce((s2, d) => s2 + journeeDe(salTaches, d).duree, 0);
      if (heures > 0) return false;
      return !allAbsences.some(a => a.salarieId === sal.id && a.semaine === w);
    });

    const solde = soldeLissage({
      contratMin: contrat,
      semaines: semainesDues.length,
      travailleMin: travaille,
      absMin,
    });

    // Projection fin août : mêmes règles, mais sur TOUTES les semaines dues de
    // la période — terminées, en cours ou à venir — avec les heures planifiées.
    const toutesSemaines = Array.from(new Set(weeksPeriodeLissee)).filter(dansPeriodeLissee);
    const semainesDuesTotal = toutesSemaines.filter(
      w => !allBilans.find(b => b.id === `${sal.id}_${w}`)?.horsContrat,
    );
    const travaillePrev = toutesSemaines.reduce(
      (sum, w) => sum + joursDeLaSemaine(w).reduce((s2, d) => s2 + journeeDe(salTaches, d).duree, 0),
      0,
    );
    const absPrev = allAbsences
      .filter(a => a.salarieId === sal.id && a.type !== "sans_solde" && semainesDuesTotal.includes(a.semaine))
      .reduce((sum, a) => sum + (a.dureeMinutes || 0), 0);
    const soldePrev = soldeLissage({
      contratMin: contrat,
      semaines: semainesDuesTotal.length,
      travailleMin: travaillePrev,
      absMin: absPrev,
    });

    return {
      semaines: semainesDues.length, travaille, absMin, semainesVides, ...solde,
      prevision: { semaines: semainesDuesTotal.length, travaille: travaillePrev, ...soldePrev },
    };
  };

  const buildSalData = (sal: Salarie) => {
    const salId = sal.id;
    const contrat = contratMinDe(sal);
    const salTaches = allTaches.filter(t => t.salarieId === salId);
    let totalMois = 0;

    const rows: RowData[] = [];
    joursduMois.forEach(date => {
      const j = journeeDe(salTaches, date);
      if (j.dow > 6) return; // skip invalid

      // Absence éventuelle couvrant ce jour (congé payé, récup, maladie…)
      const abs = allAbsences.find(a => a.salarieId === salId && a.date === dateISO(date));
      const absX = abs ? { absenceLabel: LIBELLE_ABSENCE[abs.type], absenceMin: abs.dureeMinutes } : {};
      const base = { date, jour: j.jour, isSamedi: j.dow === 5, isoWeek: j.isoWeek, ...absX };

      if (!j.calc.travaille) {
        rows.push({ ...base, debut: "", fin: "", debutAprem: "", finAprem: "", pauseMin: 0, duree: 0 });
        return;
      }
      totalMois += j.duree;

      // La coupure la plus longue sépare matin et après-midi sur la fiche
      // imprimée — qu'elle ait été saisie en pause ou qu'elle soit un simple
      // trou entre deux tâches. Avant, seule une pause saisie coupait la
      // journée : une vraie coupure du midi passait pour du travail continu.
      if (j.calc.coupure) {
        rows.push({
          ...base,
          debut: minutesEnHeure(j.calc.debutMin),
          fin: minutesEnHeure(j.calc.coupure.debut),
          debutAprem: minutesEnHeure(j.calc.coupure.fin),
          finAprem: minutesEnHeure(j.calc.finMin),
          pauseMin: (j.calc.coupure.fin - j.calc.coupure.debut) + j.calc.pauseDeduiteMin,
          duree: j.duree,
        });
      } else {
        rows.push({
          ...base,
          debut: minutesEnHeure(j.calc.debutMin),
          fin: minutesEnHeure(j.calc.finMin),
          debutAprem: "", finAprem: "",
          pauseMin: j.calc.pauseDeduiteMin,
          duree: j.duree,
        });
      }
    });

    // Heures par semaine, comptées sur les SEPT jours de la semaine — pas sur
    // sa seule portion visible dans le mois affiché.
    //
    // Cas vécu (Alice, août 2026) : la semaine 31 court du 27 juillet au
    // 2 août. Vue depuis août, elle n'affichait que les 1er et 2, soit « 0 min
    // travaillé » — face à une cible de 25 h, cela fabriquait 25 h de déficit
    // pour une semaine réellement travaillée. Les tâches des jours de juillet
    // sont déjà chargées (la requête porte sur la semaine entière) : il
    // suffisait de les regarder.
    const weekMap: Record<string, number> = {};
    weeksOfMonth.forEach(w => {
      weekMap[w] = joursDeLaSemaine(w).reduce((sum, d) => sum + journeeDe(salTaches, d).duree, 0);
    });

    const debutAujourdhui = new Date(); debutAujourdhui.setHours(0, 0, 0, 0);
    // Salarié en horaires lissés, sur un mois de la période : c'est ce qui
    // décide d'afficher l'encadré de période. La neutralisation, elle, se juge
    // semaine par semaine — une semaine de juillet dont le lundi est en juin
    // appartient au décompte de juin, pas à la période.
    const lisse = !!sal.lissageEte && MOIS_LISSES.includes(mois);
    const weekSummaries: WeekSummary[] = weeksOfMonth.map(w => {
      const travaille = weekMap[w] || 0;
      const absMin = allAbsences
        .filter(a => a.salarieId === salId && a.semaine === w && a.type !== "sans_solde")
        .reduce((s, a) => s + (a.dureeMinutes || 0), 0);
      const bilan = allBilans.find(b => b.id === `${salId}_${w}`);
      const mode = bilan?.surplusMode ?? "paye";
      const clos = !!bilan?.clos;
      // Semaine hors contrat : le salarié n'était pas en poste. Aucun contrat
      // n'est dû, donc aucun déficit possible — mais les heures éventuellement
      // faites restent acquises, elles ne s'évaporent pas.
      const horsContrat = !!bilan?.horsContrat;
      const contratSemaine = horsContrat ? 0 : contrat;
      const cible = Math.max(0, contratSemaine - absMin);
      // Déficit : mesuré sur la cible réduite -> un congé protège du déficit.
      // Surplus : mesuré sur le CONTRAT PLEIN à partir des heures réellement
      // travaillées -> un congé ne fabrique jamais d'heures sup.
      const surplus = Math.max(0, travaille - contratSemaine);
      const deficit = Math.max(0, cible - travaille);
      // Semaine entièrement future (son lundi est après aujourd'hui) : pas encore
      // travaillée, on ne la compte pas en déficit ni au compteur.
      const lundiW = getLundideSemaine(w);
      const dimancheW = new Date(lundiW); dimancheW.setDate(lundiW.getDate() + 6);
      const etat = etatSemaine(lundiW, debutAujourdhui);
      const aVenir = etat === "a_venir";
      // Semaine commencée mais pas finie : les jours restants ne sont pas un
      // déficit. Sans ce garde-fou, le mercredi d'une semaine à 25 h affichait
      // « −10h30 de déficit » et proposait de le figer au compteur — alors
      // qu'il restait quatre jours pour les faire.
      const enCours = etat === "en_cours";
      const lissee = !!sal.lissageEte && dansPeriodeLissee(w);
      const neutralisee = aVenir || enCours || lissee;
      const deficitRetenu = neutralisee ? 0 : deficit;
      const surplusRetenu = lissee ? 0 : surplus; // un surplus déjà fait est acquis
      const contribution = aVenir || lissee ? 0 : (mode === "recup" ? surplusRetenu : 0) - deficitRetenu;
      const supPayee = aVenir || lissee ? 0 : (mode === "paye" ? surplusRetenu : 0);
      // Une semaine à venir ne PAIE pas d'heures sup — les heures ne sont pas
      // faites, et le planning peut encore changer. Mais elle n'a aucune raison
      // de les cacher : le planning est déjà posé, et c'est justement pour
      // décider qu'on le regarde à l'avance. On les affiche comme prévision.
      const surplusPrevu = aVenir && !lissee ? surplus : 0;
      // Semaine qui déborde du mois affiché. Elle n'est PAS découpée : une
      // semaine se compte entière, du lundi au dimanche, et n'appartient qu'à
      // un seul décompte. On montre en revanche la part qui vient du mois
      // voisin, sinon l'écart avec le « Total du mois » — qui, lui, s'arrête au
      // calendrier — reste inexplicable.
      const aCheval = lundiW.getMonth() !== mois || dimancheW.getMonth() !== mois;
      const joursHorsMois = aCheval
        ? joursDeLaSemaine(w).filter(d => d.getMonth() !== mois)
        : [];
      const horsMois = joursHorsMois.reduce((sum, d) => sum + journeeDe(salTaches, d).duree, 0);
      const moisVoisin = joursHorsMois.length > 0
        ? joursHorsMois[0].toLocaleDateString("fr-FR", { month: "long" })
        : "";
      return {
        isoWeek: w, travaille, absMin, cible,
        surplus: surplusRetenu,
        deficit: deficitRetenu,
        mode, clos, contribution, supPayee, aVenir, enCours, surplusPrevu, aCheval, horsMois, moisVoisin, lissee, horsContrat,
      };
    });

    // En période lissée, le solde ne tombe qu'en août — et il remplace la somme
    // des semaines, il ne s'y ajoute pas.
    // Calculé en août seulement : c'est le seul mois où les deux mois de
    // données sont chargés. Le demander en juillet donnerait un total amputé
    // d'août — juste, mais faux, et il finirait par s'afficher quelque part.
    const lissage = lisse && mois === MOIS_DECOMPTE_LISSAGE ? bilanLissage(sal) : null;
    // Les semaines lissées ne rapportent rien à la semaine (supPayee = 0) :
    // leur solde arrive en un bloc, en août. Les semaines du mois qui ne sont
    // PAS dans la période — celle à cheval sur juin, par exemple — gardent
    // leur décompte hebdomadaire habituel et s'y ajoutent.
    const totalSupPayee = weekSummaries.reduce((s, w) => s + w.supPayee, 0)
      + (mois === MOIS_DECOMPTE_LISSAGE ? (lissage?.surplus ?? 0) : 0);
    // Dépassements déjà planifiés sur les semaines à venir : annoncés à part,
    // jamais mélangés aux heures sup acquises.
    const totalSupPrevue = weekSummaries.reduce((s, w) => s + w.surplusPrevu, 0);
    // Compteur : valeur stockée (déjà augmentée des semaines closes) + prévision des
    // semaines non closes et non futures.
    const compteurStocke = sal.compteurMinutes ?? 0;
    const previsionMois = weekSummaries.filter(w => !w.clos && !w.aVenir).reduce((s, w) => s + w.contribution, 0);
    const compteurPrev = compteurStocke + previsionMois;

    return { rows, totalMois, weekSummaries, totalSupPayee, totalSupPrevue, compteurStocke, previsionMois, compteurPrev, contrat, lisse, lissage };
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Navigation mois */}
      <div className="flex items-center justify-between no-print">
        <button onClick={prevMonth} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
          <ChevronLeft size={16} />Mois préc.
        </button>
        <div className="text-center">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">{moisLabel}</div>
          <div className="font-body text-xs text-slate-400">{weeksOfMonth.length} semaines · {joursduMois.length} jours</div>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 font-body text-sm text-slate-600 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200">
            <Printer size={14} /> Imprimer
          </button>
          <button onClick={nextMonth} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
            Mois suiv.<ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Sélecteur salarié */}
      <div className="flex flex-wrap gap-2 no-print">
        <button onClick={() => setSelectedSalId("")}
          className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${!selectedSalId ? "bg-blue-500 text-white" : "bg-white text-slate-500 border border-gray-200"}`}>
          Tous
        </button>
        {activeSals.map(sal => (
          <button key={sal.id} onClick={() => setSelectedSalId(sal.id)}
            className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer flex items-center gap-1.5 ${selectedSalId === sal.id ? "bg-blue-500 text-white" : "bg-white text-slate-500 border border-gray-200"}`}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: sal.couleur }} />
            {sal.nom}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 font-body text-sm text-slate-400">Chargement du mois…</div>
      ) : (
        (selectedSalId ? activeSals.filter(s => s.id === selectedSalId) : activeSals).map(salRaw => {
          const sal = salFusion(salRaw);
          const { rows, totalMois, weekSummaries, totalSupPayee, totalSupPrevue, compteurStocke, previsionMois, compteurPrev, contrat, lisse, lissage } = buildSalData(sal);
          let lastWeek = "";
          return (
            <div key={sal.id} className="bg-white rounded-xl border border-gray-100 p-4 print-page">
              {/* Panneau RH (non imprimé) : contrat, absences, compteur, mode hebdo */}
              <PanneauRH
                sal={sal}
                mois={mois}
                lisse={lisse}
                lissage={lissage}
                weekSummaries={weekSummaries}
                weeksOfMonth={weeksOfMonth}
                compteurStocke={compteurStocke}
                previsionMois={previsionMois}
                compteurPrev={compteurPrev}
                absences={allAbsences.filter(a => a.salarieId === sal.id && weeksOfMonth.includes(a.semaine))}
                onMajSalarie={majSalarie}
                onAjouterAbsence={ajouterAbsence}
                onSupprimerAbsence={supprimerAbsence}
                onSetMode={setMode}
                onSetHorsContrat={setHorsContrat}
                onAppliquerSemaine={appliquerSemaine}
                onDecloturer={decloturerSemaine}
                onAjusterCompteur={ajusterCompteur}
              />
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 8, borderBottom: "2px solid #1e3a5f" }}>
                <div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 16, fontWeight: 800, color: "#1e3a5f" }}>
                    Fiche horaires — {sal.nom}
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>
                    {moisLabel} · contrat {fmtDuree(contrat)}/sem.
                    {lisse && <span style={{ textTransform: "none" }}> · horaires lissés sur juillet–août</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#64748b" }}>Centre Équestre d'Agon-Coutainville</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginTop: 2 }}>
                    Total travaillé : {fmtDuree(totalMois)}
                  </div>
                  {totalSupPayee > 0 && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 1 }}>
                      {lisse
                        ? `dont ${fmtDuree(totalSupPayee)} heures sup. payées sur juillet–août`
                        : `dont ${fmtDuree(totalSupPayee)} heures sup. payées`}
                    </div>
                  )}
                  {totalSupPrevue > 0 && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#ef4444", marginTop: 1 }}>
                      + {fmtDuree(totalSupPrevue)} prévues (semaines à venir)
                    </div>
                  )}
                  {lisse && mois !== MOIS_DECOMPTE_LISSAGE && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#64748b", marginTop: 1 }}>
                      Heures sup. décomptées fin août sur les deux mois
                    </div>
                  )}
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", marginTop: 1 }}>
                    Compteur récup. : {fmtSigne(compteurPrev)}
                  </div>
                </div>
              </div>

              {/* Tableau */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif", fontSize: 9 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: "3px 4px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Date</th>
                    <th style={{ padding: "3px 4px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Jour</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Matin début</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Matin fin</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Aprem début</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Aprem fin</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Durée</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "15%" }}>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const dateStr = row.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                    const newWeek = row.isoWeek !== lastWeek;
                    // Insert week summary before new week (except first)
                    const weekSummaryRow = newWeek && lastWeek ? weekSummaries.find(w => w.isoWeek === lastWeek) : null;
                    lastWeek = row.isoWeek;

                    return [
                      weekSummaryRow && (
                        <tr key={`ws-${weekSummaryRow.isoWeek}`} style={{ background: "#eef2ff" }}>
                          <td colSpan={6} style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                            Sem. {weekSummaryRow.isoWeek.split("-W")[1]}
                          </td>
                          <td style={{ padding: "3px 4px", textAlign: "center", fontWeight: 800, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                            {fmtDuree(weekSummaryRow.travaille)}
                            {weekSummaryRow.aVenir ? (
                              <span style={{ color: "#94a3b8", fontSize: 8, marginLeft: 3, fontStyle: "italic" }}>à venir</span>
                            ) : (
                              <>
                                {weekSummaryRow.absMin > 0 && (
                                  <span style={{ color: "#0ea5e9", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(weekSummaryRow.absMin)} abs.</span>
                                )}
                                {weekSummaryRow.surplus > 0 && (
                                  <span style={{ color: weekSummaryRow.mode === "recup" ? "#0f766e" : "#dc2626", fontSize: 8, marginLeft: 3 }}>
                                    +{fmtDuree(weekSummaryRow.surplus)} {weekSummaryRow.mode === "recup" ? "récup" : "sup"}
                                  </span>
                                )}
                                {weekSummaryRow.deficit > 0 && (
                                  <span style={{ color: "#b45309", fontSize: 8, marginLeft: 3 }}>−{fmtDuree(weekSummaryRow.deficit)}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td style={{ borderBottom: "2px solid #cbd5e1" }}></td>
                        </tr>
                      ),
                      <tr key={i} style={{ background: row.duree === 0 ? "#fafafa" : (i % 2 === 0 ? "#fff" : "#fafbff") }}>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#1e293b" }}>{dateStr}</td>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", color: row.isSamedi ? "#3b82f6" : "#64748b", textTransform: "capitalize" }}>
                          {JOURS_LABELS[row.jour].slice(0, 3)}
                        </td>
                        {/* Détermination matin / après-midi pour la répartition des cellules.
                            - Si pause explicite : on a directement debut/fin (matin) et debutAprem/finAprem (aprem)
                            - Si pas de pause : on regarde si la plage commence avant 13h
                              → oui = matin uniquement, aprem vide
                              → non = aprem uniquement, matin vide
                            (un salarié qui ne travaille que l'après-midi ne doit pas
                            voir ses heures dans la colonne 'Matin') */}
                        {(() => {
                          let matinDeb = "", matinFin = "", apremDeb = "", apremFin = "";
                          if (row.debut) {
                            if (row.debutAprem) {
                              // Pause explicite → 4 cellules remplies
                              matinDeb = row.debut;
                              matinFin = row.fin;
                              apremDeb = row.debutAprem;
                              apremFin = row.finAprem;
                            } else {
                              // Journée continue, classement selon l'heure de début
                              const debutMin = heureToMin(row.debut);
                              if (debutMin < 13 * 60) {
                                // Commence avant 13h → considéré matin (même si déborde sur l'aprem)
                                matinDeb = row.debut;
                                matinFin = row.fin;
                              } else {
                                // Commence après 13h → uniquement aprem
                                apremDeb = row.debut;
                                apremFin = row.fin;
                              }
                            }
                          }
                          const cellStyle = { padding: "2px 4px", borderBottom: "1px solid #eef2f7", textAlign: "center" as const, fontWeight: 600 };
                          const colorIf = (v: string) => v ? "#1e293b" : "#d1d5db";
                          // Jour d'absence sans travail : libellé sur les 4 colonnes horaires
                          if (row.absenceLabel && row.duree === 0) {
                            return (
                              <td colSpan={4} style={{ ...cellStyle, color: "#0284c7", fontStyle: "italic", background: "#f0f9ff" }}>
                                {row.absenceLabel}{row.absenceMin ? ` · ${fmtDuree(row.absenceMin)}` : ""}
                              </td>
                            );
                          }
                          return <>
                            <td style={{ ...cellStyle, color: colorIf(matinDeb) }}>{matinDeb || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(matinFin) }}>{matinFin || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(apremDeb) }}>{apremDeb || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(apremFin) }}>{apremFin || "—"}</td>
                          </>;
                        })()}
                        {/* Durée + indication pause si présente */}
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", textAlign: "center", fontWeight: 700, color: row.duree > 0 ? "#1e3a5f" : "#d1d5db", lineHeight: 1.15 }}>
                          {row.duree > 0 ? (
                            <>
                              {fmtDuree(row.duree)}
                              {row.pauseMin > 0 && (
                                <div style={{ fontSize: 7, fontWeight: 500, color: "#94a3b8" }}>pause {fmtDuree(row.pauseMin)}</div>
                              )}
                            </>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7" }}>
                          {row.duree > 0 && <div style={{ borderBottom: "1px solid #cbd5e1", width: "80%", margin: "0 auto", height: 12 }} />}
                        </td>
                      </tr>,
                    ];
                  })}
                  {/* Dernière semaine summary */}
                  {(() => {
                    const lastWs = weekSummaries.find(w => w.isoWeek === lastWeek);
                    if (!lastWs) return null;
                    return (
                      <tr style={{ background: "#eef2ff" }}>
                        <td colSpan={6} style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                          Sem. {lastWs.isoWeek.split("-W")[1]}
                        </td>
                        <td style={{ padding: "3px 4px", textAlign: "center", fontWeight: 800, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                          {fmtDuree(lastWs.travaille)}
                          {lastWs.aVenir ? (
                            <span style={{ color: "#94a3b8", fontSize: 8, marginLeft: 3, fontStyle: "italic" }}>à venir</span>
                          ) : (
                            <>
                              {lastWs.absMin > 0 && <span style={{ color: "#0ea5e9", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(lastWs.absMin)} abs.</span>}
                              {lastWs.surplus > 0 && <span style={{ color: lastWs.mode === "recup" ? "#0f766e" : "#dc2626", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(lastWs.surplus)} {lastWs.mode === "recup" ? "récup" : "sup"}</span>}
                              {lastWs.deficit > 0 && <span style={{ color: "#b45309", fontSize: 8, marginLeft: 3 }}>−{fmtDuree(lastWs.deficit)}</span>}
                            </>
                          )}
                        </td>
                        <td style={{ borderBottom: "2px solid #cbd5e1" }}></td>
                      </tr>
                    );
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f1f5f9" }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: "#1e3a5f", textAlign: "right", borderTop: "2px solid #e2e8f0", fontSize: 10 }}>
                      Total du mois
                    </td>
                    <td style={{ padding: "4px 4px", fontWeight: 800, color: "#1e3a5f", textAlign: "center", borderTop: "2px solid #e2e8f0", fontSize: 10 }}>
                      {fmtDuree(totalMois)}
                    </td>
                    <td style={{ borderTop: "2px solid #e2e8f0" }}></td>
                  </tr>
                  {totalSupPayee > 0 && (
                    <tr style={{ background: "#fef2f2" }}>
                      <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: "#dc2626", textAlign: "right", fontSize: 10 }}>
                        Heures supplémentaires payées
                      </td>
                      <td style={{ padding: "4px 4px", fontWeight: 800, color: "#dc2626", textAlign: "center", fontSize: 10 }}>
                        {fmtDuree(totalSupPayee)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  <tr style={{ background: "#f0fdfa" }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", textAlign: "right", fontSize: 10 }}>
                      Compteur récupération (cumul)
                    </td>
                    <td style={{ padding: "4px 4px", fontWeight: 800, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", textAlign: "center", fontSize: 10 }}>
                      {fmtSigne(compteurPrev)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 30 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Signature du salarié</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 30 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "#94a3b8", marginTop: 3 }}>{sal.nom} · Date :</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Signature de l'employeur</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 30 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "#94a3b8", marginTop: 3 }}>Nicolas Richard · Date :</div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <style>{`
        @media print {
          .no-print, nav, header, [data-sidebar], [data-header] { display: none !important; }
          .print-page {
            page-break-after: always;
            page-break-inside: avoid;
            border: none !important;
            padding: 8px !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .print-page:last-child { page-break-after: auto; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 10mm 8mm; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau RH (non imprimé) : contrat, compteur de récupération, modes hebdo, absences
// ─────────────────────────────────────────────────────────────────────────────
function PanneauRH({
  sal, mois, lisse, lissage, weekSummaries, compteurStocke, previsionMois, compteurPrev, absences,
  onMajSalarie, onAjouterAbsence, onSupprimerAbsence, onSetMode, onSetHorsContrat, onAppliquerSemaine, onDecloturer, onAjusterCompteur,
}: {
  sal: Salarie;
  mois: number;
  lisse: boolean;
  lissage: BilanLissage | null;
  weekSummaries: WeekSummary[];
  weeksOfMonth: string[];
  compteurStocke: number; previsionMois: number; compteurPrev: number;
  absences: Absence[];
  onMajSalarie: (salId: string, patch: Partial<Salarie>) => void;
  onAjouterAbsence: (sal: Salarie, date: string, type: TypeAbsence, dureeMin: number) => void;
  onSupprimerAbsence: (absId: string) => void;
  onSetMode: (salId: string, semaine: string, mode: "paye" | "recup") => void;
  onSetHorsContrat: (salId: string, semaine: string, horsContrat: boolean) => void;
  onAppliquerSemaine: (sal: Salarie, semaine: string, contributionMin: number) => void;
  onDecloturer: (sal: Salarie, semaine: string) => void;
  onAjusterCompteur: (sal: Salarie, deltaMin: number) => void;
}) {
  const [absDate, setAbsDate] = useState("");
  const [absType, setAbsType] = useState<TypeAbsence>("conge_paye");
  const [absDuree, setAbsDuree] = useState("");
  const jourDefautMin = jourMinDe(sal);
  const inp = "px-2 py-1.5 rounded-md border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none";

  return (
    <div className="no-print mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3 flex flex-col gap-3">
      <div className="font-display text-sm font-bold text-blue-900 flex items-center gap-2"><Wallet size={15} /> Suivi RH — {sal.nom}</div>

      {/* Contrat */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">
          Contrat (h/sem.)
          <input type="number" min="0" step="0.5" defaultValue={sal.heuresContratSemaine ?? 35}
            onBlur={e => onMajSalarie(sal.id, { heuresContratSemaine: parseFloat(e.target.value) || 35 })}
            className={`${inp} w-20`} />
        </label>
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">
          Jours/sem.
          <input type="number" min="1" max="7" step="1" defaultValue={sal.joursTravailles ?? 5}
            onBlur={e => onMajSalarie(sal.id, { joursTravailles: parseInt(e.target.value) || 5 })}
            className={`${inp} w-16`} />
        </label>
        <span className="font-body text-[11px] text-slate-400">1 jour d&apos;absence ≈ {fmtDuree(jourDefautMin)}</span>
      </div>

      {/* Lissage d'été */}
      <label className="flex items-start gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2 cursor-pointer">
        <input type="checkbox" defaultChecked={!!sal.lissageEte}
          onChange={e => onMajSalarie(sal.id, { lissageEte: e.target.checked })}
          className="mt-0.5 cursor-pointer accent-blue-500" />
        <span className="font-body text-xs text-slate-600 leading-relaxed">
          <strong>Horaires lissés sur juillet et août.</strong> Sur ces deux mois, aucune semaine
          ne compte seule : un creux de juillet est absorbé par une pointe d&apos;août. Le solde est
          établi une fois, fin août, sur le total des deux mois. Un déficit de période n&apos;est pas dû ;
          seul un surplus est retenu, en heures sup. payées.
        </span>
      </label>

      {/* Compteur */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2">
        <span className="font-body text-xs text-slate-600">Compteur récup. :</span>
        <span className={`font-body text-sm font-bold ${compteurPrev < 0 ? "text-red-600" : "text-teal-700"}`}>{fmtSigne(compteurPrev)}</span>
        <span className="font-body text-[11px] text-slate-400">(acquis {fmtSigne(compteurStocke)} · prévision mois {fmtSigne(previsionMois)})</span>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => onAjusterCompteur(sal, -60)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">−1h</button>
          <button onClick={() => onAjusterCompteur(sal, -30)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">−30</button>
          <button onClick={() => onAjusterCompteur(sal, 30)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">+30</button>
          <button onClick={() => onAjusterCompteur(sal, 60)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">+1h</button>
          <button onClick={() => { if (confirm("Remettre l'acquis du compteur à zéro ?")) onAjusterCompteur(sal, -compteurStocke); }}
            className="px-2 py-1 rounded bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">À 0</button>
        </span>
      </div>

      {/* Solde de la période lissée */}
      {lisse && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-col gap-1">
          <div className="font-body text-xs font-bold text-amber-900">
            Période lissée juillet – août
          </div>
          {mois !== MOIS_DECOMPTE_LISSAGE ? (
            <div className="font-body text-[11px] text-amber-800 leading-relaxed">
              Les semaines de juillet ne produisent ni heure sup ni déficit. Le solde des deux mois
              sera établi sur le mois d&apos;août — ouvre août pour le voir.
            </div>
          ) : lissage && lissage.semaines === 0 ? (
            <div className="font-body text-[11px] text-amber-800">
              Aucune semaine due sur la période pour l&apos;instant — soit aucune n&apos;est terminée,
              soit toutes sont marquées hors contrat.
            </div>
          ) : lissage ? (
            <>
              <div className="font-body text-[11px] text-amber-800">
                {lissage.semaines} semaine(s) due(s) · travaillé <strong>{fmtDuree(lissage.travaille)}</strong> pour
                un contrat de <strong>{fmtDuree(lissage.contratPeriode)}</strong>
                {lissage.absMin > 0 && <span className="text-sky-700"> · dont {fmtDuree(lissage.absMin)} de congés</span>}
              </div>
              {lissage.semainesVides.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-white px-2.5 py-2 mt-1">
                  <div className="font-body text-[11px] text-amber-900 leading-relaxed">
                    <strong>{lissage.semainesVides.length} semaine(s) comptée(s) au contrat sans une seule heure
                    ni congé</strong> ({lissage.semainesVides.map(w => "S" + w.split("-W")[1]).join(", ")}).
                    Chacune ajoute {fmtDuree(contratMinDe(sal))} au contrat de la période et efface d&apos;autant
                    les heures sup des autres semaines. Si le salarié n&apos;était pas en poste, sors-les du contrat.
                  </div>
                  <button
                    onClick={() => {
                      if (!confirm(
                        `Marquer ${lissage.semainesVides.length} semaine(s) hors contrat pour ${sal.nom} ?\n\n` +
                        `Elles ne compteront plus au contrat de la période. Les heures éventuellement saisies plus tard y resteront comptées.`
                      )) return;
                      lissage.semainesVides.forEach(w => onSetHorsContrat(sal.id, w, true));
                    }}
                    className="mt-2 px-2.5 py-1 rounded-md bg-amber-600 text-white font-body text-[11px] font-semibold border-none cursor-pointer hover:bg-amber-700">
                    Marquer ces {lissage.semainesVides.length} semaine(s) hors contrat
                  </button>
                </div>
              )}
              {lissage.surplus > 0 ? (
                <div className="font-body text-xs font-bold text-red-600">
                  + {fmtDuree(lissage.surplus)} d&apos;heures sup. payées sur la période
                  <span className="font-normal text-amber-700"> (semaines terminées uniquement)</span>
                </div>
              ) : lissage.deficit > 0 ? (
                <div className="font-body text-xs font-semibold text-emerald-700">
                  Aucune heure sup pour l&apos;instant. Le déficit de {fmtDuree(lissage.deficit)} n&apos;est pas dû : il est absorbé par le lissage.
                </div>
              ) : (
                <div className="font-body text-xs font-semibold text-emerald-700">À l&apos;équilibre sur les semaines terminées.</div>
              )}
              {lissage.prevision.semaines > lissage.semaines && (
                <div className="font-body text-[11px] text-amber-900 border-t border-amber-200 pt-1.5 mt-0.5">
                  <strong>Prévision fin août</strong>, planning déjà posé compris ({lissage.prevision.semaines} semaines,
                  {" "}{fmtDuree(lissage.prevision.travaille)} pour {fmtDuree(lissage.prevision.contratPeriode)}) :{" "}
                  {lissage.prevision.surplus > 0 ? (
                    <strong className="text-red-600">+{fmtDuree(lissage.prevision.surplus)} d&apos;heures sup.</strong>
                  ) : lissage.prevision.deficit > 0 ? (
                    <span>déficit de {fmtDuree(lissage.prevision.deficit)}, non dû.</span>
                  ) : (
                    <span>à l&apos;équilibre.</span>
                  )}{" "}
                  Le solde définitif sera arrêté une fois la dernière semaine terminée.
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Semaines du mois */}
      {weekSummaries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {weekSummaries.map(w => (
            <div key={w.isoWeek} className="flex flex-wrap items-center gap-2 text-xs font-body">
              <span className="font-semibold text-slate-700 w-16 shrink-0">Sem. {w.isoWeek.split("-W")[1]}</span>
              <label
                title="Décoche si le salarié n'était pas en poste cette semaine-là : aucun contrat n'est alors dû."
                className={`flex items-center gap-1 shrink-0 ${w.clos ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" checked={!w.horsContrat} disabled={w.clos}
                  onChange={e => onSetHorsContrat(sal.id, w.isoWeek, !e.target.checked)}
                  className="cursor-pointer accent-blue-500 disabled:cursor-default" />
                <span className={w.horsContrat ? "text-slate-400 line-through" : "text-slate-500"}>travaillée</span>
              </label>
              {w.horsContrat ? (
                <span className="text-slate-500">
                  hors contrat{w.travaille > 0 && <span className="text-red-600 font-semibold"> · {fmtDuree(w.travaille)} pourtant travaillées</span>}
                </span>
              ) : (
                <span className="text-slate-500">{fmtDuree(w.travaille)} / cible {fmtDuree(w.cible)}{w.absMin > 0 ? <span className="text-sky-600"> · {fmtDuree(w.absMin)} congé</span> : null}</span>
              )}
              {w.aCheval && (
                <span className="text-slate-400 italic" title="Une semaine se compte entière, du lundi au dimanche. Elle n'est jamais coupée en deux : elle apparaît identique dans les deux mois et n'est comptée qu'une fois.">
                  semaine entière{w.horsMois > 0 ? ` · dont ${fmtDuree(w.horsMois)} en ${w.moisVoisin}` : ` · à cheval sur ${w.moisVoisin}`}
                </span>
              )}
              {w.horsContrat && w.travaille === 0 ? (
                <span className="text-slate-400 italic">pas en poste</span>
              ) : w.lissee ? (
                <span className="text-amber-700 italic">lissée — comptée sur juillet–août</span>
              ) : w.aVenir ? (
                <>
                  <span className="text-slate-400 italic">à venir</span>
                  {w.surplusPrevu > 0 && (
                    <span className="text-red-500 font-semibold"
                      title="Heures déjà planifiées au-delà du contrat. Elles ne seront payées qu'une fois la semaine faite.">
                      +{fmtDuree(w.surplusPrevu)} prévues
                    </span>
                  )}
                </>
              ) : w.enCours ? (
                <>
                  <span className="text-blue-600 italic">en cours</span>
                  {w.surplus > 0 && <span className="text-red-600 font-semibold">+{fmtDuree(w.surplus)} déjà au-delà du contrat</span>}
                </>
              ) : w.surplus === 0 && w.deficit === 0 ? (
                <span className="text-emerald-600">à l'équilibre</span>
              ) : (
                <>
                  {w.surplus > 0 && (
                    <span className="inline-flex rounded-md overflow-hidden border border-gray-200">
                      <button onClick={() => onSetMode(sal.id, w.isoWeek, "paye")} disabled={w.clos}
                        className={`px-2 py-1 ${w.mode === "paye" ? "bg-red-500 text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>sup payée</button>
                      <button onClick={() => onSetMode(sal.id, w.isoWeek, "recup")} disabled={w.clos}
                        className={`px-2 py-1 ${w.mode === "recup" ? "bg-teal-600 text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>récup</button>
                    </span>
                  )}
                  {w.surplus > 0 && <span className={w.mode === "recup" ? "text-teal-700 font-semibold" : "text-red-600 font-semibold"}>+{fmtDuree(w.surplus)}</span>}
                  {w.deficit > 0 && <span className="text-amber-700 font-semibold">−{fmtDuree(w.deficit)} déficit</span>}
                </>
              )}
              {w.clos ? (
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="text-slate-400">intégré ✓</span>
                  <button onClick={() => onDecloturer(sal, w.isoWeek)}
                    className="px-2 py-1 rounded bg-gray-100 text-slate-600 font-semibold hover:bg-gray-200">Rouvrir</button>
                </span>
              ) : w.lissee || w.enCours ? null : !w.aVenir ? (
                <button onClick={() => onAppliquerSemaine(sal, w.isoWeek, w.contribution)}
                  className="ml-auto px-2 py-1 rounded bg-blue-600 text-white font-semibold">
                  Clôturer ({fmtSigne(w.contribution)})
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {weekSummaries.some(w => w.aCheval) && (
        <div className="font-body text-[11px] text-slate-500 leading-relaxed">
          <strong>Semaine à cheval :</strong> une semaine se compte entière, du lundi au dimanche, et
          n&apos;est jamais coupée entre deux mois. Elle apparaît donc à l&apos;identique dans les deux, et
          n&apos;est clôturée qu&apos;une fois. Le « Total du mois » de la fiche imprimée, lui, s&apos;arrête au
          calendrier : c&apos;est ce qui explique la différence.
        </div>
      )}

      {/* Absences */}
      <div className="flex flex-col gap-2">
        <div className="font-body text-xs font-semibold text-slate-600 flex items-center gap-1"><Calendar size={13} /> Congés / absences du mois</div>
        {absences.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...absences].sort((a, b) => a.date.localeCompare(b.date)).map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2 py-1 text-[11px] font-body">
                {new Date(a.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · {LIBELLE_ABSENCE[a.type]} · {fmtDuree(a.dureeMinutes)}
                <button onClick={() => onSupprimerAbsence(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" value={absDate} onChange={e => setAbsDate(e.target.value)} className={`${inp} w-36`} />
          <select value={absType} onChange={e => setAbsType(e.target.value as TypeAbsence)} className={inp}>
            {(Object.keys(LIBELLE_ABSENCE) as TypeAbsence[]).map(t => <option key={t} value={t}>{LIBELLE_ABSENCE[t]}</option>)}
          </select>
          <input type="number" min="0" step="0.5" value={absDuree} onChange={e => setAbsDuree(e.target.value)}
            placeholder={`${(jourDefautMin / 60).toFixed(1)}h`} className={`${inp} w-20`} title="Durée en heures. Laisser vide = une journée." />
          <button
            onClick={() => {
              if (!absDate) return;
              const dureeMin = absDuree ? Math.round(parseFloat(absDuree) * 60) : jourDefautMin;
              onAjouterAbsence(sal, absDate, absType, dureeMin);
              setAbsDate(""); setAbsDuree("");
            }}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white font-body text-sm font-semibold inline-flex items-center gap-1">
            <Plus size={14} /> Ajouter
          </button>
        </div>
        <div className="font-body text-[11px] text-slate-400">Congé payé / récup / maladie / férié neutralisent le contrat du jour (ni déficit ni heures sup dessus). « Sans solde » ne neutralise pas.</div>
      </div>
    </div>
  );
}
