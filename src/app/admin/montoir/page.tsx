"use client";
import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { renderDerouleStage } from "@/lib/stage-deroule";
import { FeuilleAppelImpression } from "./FeuilleAppelImpression";
import { collection, getDocs, getDoc, updateDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { construireHistoriquePoneys } from "./horse-history";
import { compareCreneaux } from "@/lib/creneau-sort";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAgentContext } from "@/hooks/useAgentContext";
import PoneyChargeView from "./PoneyChargeView";
import QuickAddRider from "./QuickAddRider";
import { Loader2, ChevronLeft, ChevronRight, Printer, ClipboardList, CalendarDays } from "lucide-react";
import type { Creneau, QuickNoteChild } from "./types";
import {
  calcAge, displayName, repriseSig, chuteKey,
  listerEquidesDisponibles, listerEquidesIndisponibles, calculerChargePoneys,
} from "./montoir-helpers";
import { cloturerReprise, rouvrirReprise } from "./montoir-cloture";
import { enregistrerNotesRapides } from "./montoir-notes";
import { enregistrerChute, supprimerChute } from "./montoir-chutes";
import { envoyerRappels } from "./montoir-rappels";
import { useDicteeBilan } from "./useDicteeBilan";
import CarteReprise from "./CarteReprise";
import ModaleChute from "./ModaleChute";
import PanelBilanPeda from "./PanelBilanPeda";

export default function MontoirPage() {
  const { toast } = useToast();
  const { setAgentContext } = useAgentContext("montoir");
  const [dayOffset, setDayOffset] = useState(0);
  // Re-scroll : après un changement de jour déclenché DEPUIS une reprise, on
  // mémorise sa signature (titre + heure) pour revenir sur la reprise
  // équivalente du nouveau jour au lieu de remonter en haut.
  const pendingScrollSig = useRef<string | null>(null);

  // Reprises repliees : a l'ouverture du montoir on veut la VUE D'ENSEMBLE
  // (barre par cours : horaire, titre, moniteur, x/y, presents), et on
  // deplie a la demande. On memorise l'inverse — les reprises DEPLIEES —
  // pour que l'etat par defaut (tout replie) ne demande aucun stockage.
  const [depliees, setDepliees] = useState<Set<string>>(new Set());
  const estDepliee = (id: string) => depliees.has(id);
  const basculerReprise = (id: string) => setDepliees((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toutDeplier = (ids: string[]) => setDepliees(new Set(ids));
  const toutReplier = () => setDepliees(new Set());
  const sigRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  // Creneaux des dernieres semaines : servent UNIQUEMENT a reconstruire
  // l'historique des poneys (les notes peda ont pu etre perdues).
  const [creneauxHistorique, setCreneauxHistorique] = useState<any[]>([]);
  // Deroule des 2 sequences repris dans le rappel de stage (reglage unique,
  // Parametres > Deroule stages). Vide tant qu'il n'est pas saisi.
  const [stageDerouleHtml, setStageDerouleHtml] = useState("");
  useEffect(() => {
    getDoc(doc(db, "settings", "stageDeroule"))
      .then(snap => setStageDerouleHtml(renderDerouleStage(snap.exists() ? (snap.data() as any) : null)))
      .catch(() => setStageDerouleHtml(""));
  }, []);
  // Filtre d'impression par moniteur : chacun imprime l'appel de SES reprises.
  // "" = tous (comportement actuel inchangé).
  const [printMonitor, setPrintMonitor] = useState<string>("");
  const [equides, setEquides] = useState<any[]>([]);
  const [seuilPoney, setSeuilPoney] = useState({ orange: 3, rouge: 4, heures: 4 });
  const [indisponibilites, setIndisponibilites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartes, setCartes] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [forfaits, setForfaits] = useState<any[]>([]);
  const [addCreneau, setAddCreneau] = useState<any | null>(null);
  // ── Registre des chutes ──────────────────────────────────────────────────
  // Une chute par cavalier et par séance, id déterministe `${creneauId}_${childId}`.
  // Le bouton n'est PAS obligatoire : on ne l'active que s'il y a eu une chute.
  const [chutes, setChutes] = useState<Record<string, any>>({});
  const [chuteModal, setChuteModal] = useState<{ c: Creneau; e: any } | null>(null);
  const [chuteForm, setChuteForm] = useState<{ circonstances: string; gravite: string; consequence: string; suites: string }>({ circonstances: "", gravite: "", consequence: "", suites: "" });
  const [chuteSaving, setChuteSaving] = useState(false);
  const [poneyChuteCount, setPoneyChuteCount] = useState<Record<string, number>>({});
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return d; }, [dayOffset]);
  // Date LOCALE (Europe/Paris) — surtout PAS toISOString(), qui convertit en UTC
  // et renvoie la VEILLE entre 00h et 02h du matin l'été (Paris = UTC+2). C'est ce
  // décalage qui affichait le montoir du 6 alors qu'on était le 7 au petit matin.
  const dateStr = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, "0")}-${String(currentDay.getDate()).padStart(2, "0")}`;

  // Saut direct vers une date choisie (sélecteur natif) : on recalcule
  // l'offset en jours par rapport à aujourd'hui, comme pour l'arrivée ?date=.
  const handleDatePick = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const off = Math.round((new Date(v + "T00:00:00").getTime() - today.getTime()) / 86400000);
    if (!isNaN(off)) setDayOffset(off);
  };

  const fetchData = async () => {
    try {
      const [cSnap, cHistSnap, eSnap, iSnap, cartSnap, famSnap, centreSnap, forfSnap] = await Promise.all([
        getDocs(query(collection(db,"creneaux"),where("date","==",dateStr))),
        // 6 semaines glissantes, hors jour courant, pour l'historique poneys
        getDocs(query(
          collection(db,"creneaux"),
          where("date",">=", new Date(new Date(dateStr + "T12:00:00").getTime() - 42*86400000).toISOString().slice(0,10)),
          where("date","<", dateStr),
        )),
        getDocs(collection(db,"equides")),
        getDocs(collection(db,"indisponibilites")),
        getDocs(collection(db,"cartes")),
        getDocs(collection(db,"families")),
        getDoc(doc(db,"settings","centre")),
        getDocs(query(collection(db,"forfaits"),where("status","==","actif"))),
      ]);
      if (centreSnap.exists()) {
        const d = centreSnap.data() as any;
        setSeuilPoney({
          orange: d.seuilPoneyOrange || 3,
          rouge: d.seuilPoneyRouge || 4,
          heures: d.seuilPoneyHeures || 4,
        });
      }
      const creneauxData = (cSnap.docs.map(d=>({id:d.id,...d.data()})) as Creneau[]).sort(compareCreneaux);
      setCreneaux(creneauxData);
      setCreneauxHistorique(cHistSnap.docs.map(d=>({id:d.id,...d.data()})));
      setEquides(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      setIndisponibilites(iSnap.docs.map(d=>({id:d.id,...d.data()})));
      setCartes(cartSnap.docs.map(d=>({id:d.id,...d.data()})));
      setFamilies(famSnap.docs.map(d=>({id:d.id,...d.data()})));
      setForfaits(forfSnap.docs.map(d=>({id:d.id,...d.data()})));
      // Registre des chutes : requête ISOLÉE et tolérante aux erreurs.
      // Si la règle Firestore "chutes" n'est pas encore publiée (ou toute autre
      // erreur), on ne doit surtout PAS faire échouer le chargement du Montoir.
      // On charge la saison en cours pour en déduire (1) les chutes du jour
      // (état des boutons) et (2) le cumul de chutes par poney (signal affectation).
      try {
        const now = new Date();
        const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const seasonStart = `${seasonStartYear}-09-01`;
        const chutesSnap = await getDocs(query(collection(db,"chutes"),where("date",">=",seasonStart)));
        const chutesMap: Record<string, any> = {};
        const poneyCount: Record<string, number> = {};
        chutesSnap.docs.forEach(d => {
          const data = d.data() as any;
          if (data.date === dateStr) chutesMap[d.id] = { id: d.id, ...data };
          if (data.horseName) poneyCount[data.horseName] = (poneyCount[data.horseName] || 0) + 1;
        });
        setChutes(chutesMap);
        setPoneyChuteCount(poneyCount);
      } catch (e) {
        console.warn("Registre chutes indisponible (règle Firestore non publiée ?) :", e);
        setChutes({});
        setPoneyChuteCount({});
      }

      // Contexte agent — données montoir du jour
      // Nouvelle logique "presence par defaut" : un cavalier sans statut
      // est considere present (pas besoin de cocher).
      setAgentContext({
        creneaux_du_jour: creneauxData.map((c: any) => ({
          id: c.id,
          titre: c.activityTitle,
          heure: `${c.startTime}-${c.endTime}`,
          inscrits: (c.enrolled||[]).length,
          presents: (c.enrolled||[]).filter((e:any) =>
            e.presence !== "absent" && e.presence !== "absent_nonjustified"
          ).length,
          absents: (c.enrolled||[]).filter((e:any) => e.presence === "absent").length,
          absents_non_justifies: (c.enrolled||[]).filter((e:any) => e.presence === "absent_nonjustified").length,
          statut: c.status || "planned",
        })),
        a_cloturer: creneauxData.filter((c: any) => c.status !== "closed").length,
      });
    } catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [dayOffset]);

  // Après chargement d'un nouveau jour, si le changement venait d'une reprise,
  // re-scroller sur la reprise équivalente (même titre + heure).
  useEffect(() => {
    if (loading) return;
    const sig = pendingScrollSig.current;
    if (!sig) return;
    pendingScrollSig.current = null;
    const t = setTimeout(() => {
      const el = sigRefs.current[sig];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [loading, creneaux]);

  // Si on arrive avec ?date=YYYY-MM-DD (depuis le planning), se caler sur ce jour.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const off = Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86400000);
      if (!isNaN(off)) setDayOffset(off);
    }
  }, []);

  // Nom AFFICHE d'un cavalier : `childName` est fige dans le creneau a
  // l'inscription et ne suit pas un renommage ulterieur. On lit la fiche
  // famille pour l'affichage (le registre des chutes, lui, conserve
  // volontairement le nom du moment des faits).
  const nomActuel = (e: any): string => {
    const fam = families.find((f: any) => (f.firestoreId || f.id) === e.familyId);
    const child: any = (fam?.children || []).find((c: any) => c.id === e.childId);
    if (!child) return e.childName || "—";
    const nom = `${child.firstName || ""} ${child.lastName || ""}`.trim();
    return nom || e.childName || "—";
  };
  // Résout un horseName stocké (nom officiel) vers le nom à afficher (surnom > officiel)
  const displayFromHorseName = (horseName: string): string => {
    if (!horseName) return "";
    const eq = equides.find(x => x.name === horseName);
    return eq ? displayName(eq) : horseName;
  };

  // Liste des équidés disponibles (pas sortis, pas indisponibles) et
  // indisponibles du jour : le calcul est dans montoir-helpers.ts.
  const availableHorses = useMemo(
    () => listerEquidesDisponibles(equides, indisponibilites, dateStr),
    [equides, indisponibilites, dateStr],
  );

  const unavailableHorses = useMemo(
    () => listerEquidesIndisponibles(equides, indisponibilites, dateStr),
    [equides, indisponibilites, dateStr],
  );

  const updateEnrolled = async (cid: string, enrolled: any[]) => {
    // Nettoyage anti-undefined : Firestore rejette les valeurs undefined.
    // On retire toute cle dont la valeur est undefined dans chaque inscrit
    // avant l'ecriture (sinon updateDoc peut echouer ou ignorer le champ).
    const clean = enrolled.map(e => {
      const o: any = {};
      for (const k in e) if (e[k] !== undefined) o[k] = e[k];
      return o;
    });
    await updateDoc(doc(db, "creneaux", cid), { enrolled: clean });
    fetchData();
  };
  // Toggle : si on reclique sur le meme statut, on l'efface (-> retour
  // "present par defaut"). Sinon on applique le nouveau statut.
  // Indispensable depuis qu'on a retire le bouton vert : sans toggle, une
  // mauvaise saisie ne pourrait plus etre corrigee.
  const togglePresence = (c: Creneau, childId: string, val: string) => {
    updateEnrolled(c.id, (c.enrolled||[]).map(e => {
      if (e.childId !== childId) return e;
      // Re-clic sur le meme statut -> on retire la presence (= present par
      // defaut). IMPORTANT : on SUPPRIME la cle plutot que de mettre
      // undefined, car Firestore rejette/ignore les valeurs undefined dans
      // les objets d'un array (le champ garderait alors son ancienne valeur
      // -> la croix resterait cochee). On reconstruit donc l'objet sans la
      // cle presence.
      if (e.presence === val) {
        const { presence, ...rest } = e;
        return rest;
      }
      return { ...e, presence: val };
    }));
  };
  // ── Charge journalière des poneys (nb séances + nb heures aujourd'hui) ──────
  const poneyCharge = useMemo(() => calculerChargePoneys(creneaux), [creneaux]);

  // ── Historique des derniers poneys montes ────────────────────────────────
  // Deux sources croisees : les notes peda ET les affectations inscrites dans
  // les creneaux passes. Voir horse-history.ts pour le detail.
  const childHorseHistory = useMemo(
    () => construireHistoriquePoneys({ families, creneauxHistorique, max: 4 }),
    [families, creneauxHistorique],
  );

  const assignHorse = (c: Creneau, childId: string, h: string) => {
    if (!h) { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, horseName: ""} : e)); return; }
    // Doublon dans CE créneau — toujours interdit
    const doubleInThis = (c.enrolled || []).find((oe: any) => oe.childId !== childId && oe.horseName === h);
    if (doubleInThis) {
      toast(`⚠️ ${h} est déjà affecté à ${doubleInThis.childName} dans cette reprise`, "error");
      return;
    }
    // Si PAS de rotation : bloquer si poney déjà pris sur un créneau simultané
    if (!c.rotationPoneys) {
      const conflict = creneaux.find(other => {
        if (other.id === c.id) return false;
        if (other.startTime >= c.endTime || other.endTime <= c.startTime) return false;
        return (other.enrolled || []).some((oe: any) => oe.horseName === h);
      });
      if (conflict) {
        const occupePar = (conflict.enrolled || []).find((oe: any) => oe.horseName === h);
        toast(`⚠️ ${h} est déjà affecté à "${conflict.activityTitle}" (${conflict.startTime}-${conflict.endTime})${occupePar ? ` — ${occupePar.childName}` : ""}. Activez la rotation poneys si c'est un stage.`, "error");
        return;
      }
    }
    // Si rotation activée : le même poney peut faire deux stages simultanés (il fait 1h dans chacun)
    updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, horseName: h} : e));
  };

  const toggleRotationPoneys = async (c: Creneau) => {
    await updateDoc(doc(db, "creneaux", c.id), { rotationPoneys: !c.rotationPoneys });
    fetchData();
  };
  const [quickNoteChild, setQuickNoteChild] = useState<{ cid: string; children: any[] } | null>(null);
  const [quickNotes, setQuickNotes] = useState<Record<string, string>>({});
  // ── Bilan IA ──────────────────────────────────────────────────────────────
  // Dictee, transcription Whisper et bilan structure : voir useDicteeBilan.ts.
  // L'etat vit au niveau de la page (et non dans le panneau) pour survivre a
  // sa fermeture — une transcription peut etre encore en vol.
  const {
    recording, transcripts, setTranscripts, iaLoading, iaBilans, setIaBilans,
    startRecording, stopRecording, analyserBilanIA, saveBilanIA,
  } = useDicteeBilan({ families, quickNoteCid: quickNoteChild?.cid || "", toast });

  // ── Registre des chutes : ouverture / enregistrement / suppression ─────────
  // L'ecriture elle-meme est dans montoir-chutes.ts.
  const openChute = (c: Creneau, e: any) => {
    const ex = chutes[chuteKey(c.id, e.childId)];
    setChuteForm({ circonstances: ex?.circonstances || "", gravite: ex?.gravite || "", consequence: ex?.consequence || "", suites: ex?.suites || "" });
    setChuteModal({ c, e });
  };
  const depsChute = () => ({ chuteModal, chuteForm, chutes, dateStr, displayFromHorseName, toast, setChutes, setChuteModal, setChuteSaving });
  const saveChute = () => enregistrerChute(depsChute());
  const deleteChute = () => supprimerChute(depsChute());

  // ── Cloture / reouverture d'une reprise ────────────────────────────────────
  // Le detail (traces peda, debits de cartes, rattrapages) est dans
  // montoir-cloture.ts : ce sont des seances payees, ca se relit d'un bloc.
  const depsCloture = () => ({ creneaux, families, displayFromHorseName, toast, fetchData, setQuickNoteChild });
  const reopenCreneau = (cid: string, title: string) => rouvrirReprise(cid, title, depsCloture());
  const closeCreneau = (cid: string) => cloturerReprise(cid, depsCloture());

  // Notes rapides du panneau de bilan (voir montoir-notes.ts) et rappels par
  // mail d'une reprise (voir montoir-rappels.ts).
  const saveQuickNotes = () => enregistrerNotesRapides({ quickNoteChild, quickNotes, families, setQuickNoteChild, setQuickNotes });
  const envoyerRappel = (c: Creneau, en: any[]) => envoyerRappels(c, en, { families, stageDerouleHtml, toast });

  const totalE = creneaux.reduce((s,c)=>s+(c.enrolled?.length||0),0);
  // Moniteurs distincts ayant au moins une reprise ce jour (sélecteur d'impression).
  const monitorsToday = Array.from(
    new Set(creneaux.map(c => (c.monitor || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "fr"));
  // Compte coherent avec la nouvelle logique "present par defaut" :
  // sont presents tous ceux qui n'ont PAS ete marques absent/non justifie.
  const totalP = creneaux.reduce((s,c)=>s+(c.enrolled||[]).filter(
    (e:any)=>e.presence!=="absent" && e.presence!=="absent_nonjustified"
  ).length,0);

  return (
    <div>
      {/* Feuille d'appel dédiée à l'impression : rendue hors du flux écran,
          visible uniquement au print. L'interface de travail ci-dessous est
          masquée à l'impression (classe print:hidden sur son conteneur). */}
      <FeuilleAppelImpression
        dateLabel={currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        monitorFilter={printMonitor}
        creneaux={creneaux}
        families={families}
        calcAge={calcAge}
        horseDisplay={displayFromHorseName}
      />
      <div className="print:hidden">
      {/* En-tête : flex-wrap pour que les boutons passent sous le titre sur
          mobile au lieu de provoquer un défilement horizontal de la page. */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div><h1 className="font-display text-2xl font-bold text-blue-800">Montoir</h1><p className="font-body text-xs text-slate-600">Présences · Affectation poneys · Clôture reprises</p></div>
        </div>
        <div className="print:hidden flex flex-wrap items-center gap-2">
          <a href={`/admin/planning?date=${dateStr}`}
            className="flex items-center gap-2 font-body text-sm font-semibold text-blue-600 bg-blue-50 px-3 sm:px-4 py-2 rounded-lg no-underline hover:bg-blue-100">
            📅 Planning
          </a>
          <a href={`/montoir/display?date=${dateStr}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-600 px-3 sm:px-4 py-2 rounded-lg no-underline hover:bg-blue-500">
            📺 Projeter
          </a>
          <a href="/admin/registre-chutes" title="Registre des chutes"
            className="flex items-center gap-2 font-body text-sm text-slate-600 bg-white px-3 sm:px-4 py-2 rounded-lg border border-gray-200 no-underline hover:bg-gray-50">
            ⚠️ Registre chutes
          </a>
          {monitorsToday.length > 1 && (
            <select value={printMonitor} onChange={(e) => setPrintMonitor(e.target.value)} title="Filtrer l'affichage et l'impression par moniteur" className="font-body text-sm text-slate-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">
              <option value="">Tous les moniteurs</option>
              {monitorsToday.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          )}
          <button onClick={()=>window.print()} className="flex items-center gap-2 font-body text-sm text-slate-600 bg-white px-3 sm:px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><Printer size={16} /> Imprimer{printMonitor ? ` — ${printMonitor}` : ""}</button>
        </div>
      </div>
      {/* Navigation jour : sur mobile la date passe en premier (pleine largeur,
          centrée) et les boutons Veille / Auj. / Lendemain se partagent la
          ligne du dessous — plus de débordement horizontal. */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div className="w-full sm:w-auto sm:order-2 text-center relative">
          <input
            type="date"
            value={dateStr}
            onChange={handleDatePick}
            aria-label="Choisir une date"
            title="Choisir une date"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer print:hidden"
          />
          <div className="font-display text-lg font-bold text-blue-800 capitalize flex items-center justify-center gap-1.5">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}<CalendarDays size={15} className="text-blue-400 print:hidden" /></div>{printMonitor && <div className="hidden print:block font-body text-sm font-semibold text-blue-800 mt-0.5">Appel — {printMonitor}</div>}<div className="font-body text-xs text-slate-600">{creneaux.length} reprise{creneaux.length>1?"s":""} · {totalE} inscrits · {totalP} présents</div></div>
        <button onClick={()=>setDayOffset(d=>d-1)} className="sm:order-1 flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-3 sm:px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Veille</button>
        <div className="sm:order-3 flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-3 sm:px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-3 sm:px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain <ChevronRight size={16} /></button></div>
      </div>
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      <>
      {/* Charge journalière poneys */}
      {equides.length > 0 && Object.keys(poneyCharge).length > 0 && (
        <Card padding="sm" className="mb-3 print:hidden hidden sm:block">
          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Charge poneys aujourd'hui</div>
          <div className="flex flex-wrap gap-1.5">
            {availableHorses.map(h => {
              const ch = poneyCharge[h.name];
              if (!ch) return <span key={h.id} className="font-body text-[10px] px-2 py-1 rounded-lg bg-green-50 text-green-700">{displayName(h)} 0s</span>;
              const color = ch.seances >= seuilPoney.rouge ? "bg-red-50 text-red-600" : ch.seances >= seuilPoney.orange ? "bg-orange-50 text-orange-600" : ch.seances >= 2 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700";
              const heuresAlert = ch.heures >= seuilPoney.heures;
              return <span key={h.id} className={`font-body text-[10px] px-2 py-1 rounded-lg font-semibold ${color}`}>{displayName(h)} {ch.seances}s·{ch.heures}h{heuresAlert ? " ⚠️" : ""}</span>;
            })}
            {unavailableHorses.map((h, i) => (
              <span key={i} className="font-body text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-400 line-through">{h.name}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Vue timeline charge poneys */}
      {equides.length > 0 && creneaux.some(c => (c.enrolled || []).some((e: any) => e.horseName)) && (
        <div className="mb-4 print:hidden hidden sm:block">
          <PoneyChargeView creneaux={creneaux} equides={equides} availableHorses={availableHorses} />
        </div>
      )}

      {/* Équidés disponibles / indisponibles */}
      {equides.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 print:hidden">
          <div className="font-body text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
            {availableHorses.length} équidé{availableHorses.length > 1 ? "s" : ""} disponible{availableHorses.length > 1 ? "s" : ""}
          </div>
          {unavailableHorses.map((h, i) => (
            <div key={i} className="font-body text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg">
              {h.name} — {h.reason}
            </div>
          ))}
        </div>
      )}
      {/* Commandes globales : ouvrir le montoir sur la vue d'ensemble, puis
          tout deplier d'un geste si on prefere l'ancien affichage. */}
      {creneaux.length > 0 && (
        <div className="flex items-center gap-2 mb-3 print:hidden">
          <button onClick={()=>toutDeplier(creneaux.map(c=>c.id!))}
            className="font-body text-xs font-semibold text-slate-600 bg-gray-100 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">
            ⤵ Tout déplier
          </button>
          <button onClick={toutReplier}
            className="font-body text-xs font-semibold text-slate-600 bg-gray-100 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">
            ⤴ Tout replier
          </button>
          <span className="font-body text-[11px] text-slate-400">
            {depliees.size} reprise{depliees.size>1?"s":""} ouverte{depliees.size>1?"s":""}
          </span>
        </div>
      )}
      {creneaux.length === 0 ? <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div><p className="font-body text-sm text-slate-600">Aucune reprise ce jour.</p></Card> :
      <div className="flex flex-col gap-6">{creneaux.filter(c => !printMonitor || (c.monitor || "").trim() === printMonitor).map(c => { const _sig = repriseSig(c); return (
        <div key={c.id} ref={(el) => { sigRefs.current[_sig] = el; }} className="scroll-mt-4">
        <CarteReprise
          c={c}
          creneaux={creneaux}
          families={families}
          availableHorses={availableHorses}
          poneyCharge={poneyCharge}
          poneyChuteCount={poneyChuteCount}
          seuilPoney={seuilPoney}
          chutes={chutes}
          childHorseHistory={childHorseHistory}
          dayOffset={dayOffset}
          estDepliee={estDepliee}
          basculerReprise={basculerReprise}
          onChangerJour={(v) => { pendingScrollSig.current = _sig; setDayOffset(v); }}
          displayFromHorseName={displayFromHorseName}
          nomActuel={nomActuel}
          reopenCreneau={reopenCreneau}
          setAddCreneau={setAddCreneau}
          toggleRotationPoneys={toggleRotationPoneys}
          envoyerRappel={envoyerRappel}
          closeCreneau={closeCreneau}
          fetchData={fetchData}
          assignHorse={assignHorse}
          togglePresence={togglePresence}
          openChute={openChute}
        />
        </div>); })}</div>}
      </>}

      {/* ── Modal : circonstances d'une chute ─────────────────────────────── */}
      {chuteModal && (
        <ModaleChute
          chuteModal={chuteModal}
          chuteForm={chuteForm}
          setChuteForm={setChuteForm}
          chutes={chutes}
          chuteSaving={chuteSaving}
          displayFromHorseName={displayFromHorseName}
          setChuteModal={setChuteModal}
          saveChute={saveChute}
          deleteChute={deleteChute}
        />
      )}

      {/* Panel bilan pédagogique IA post-clôture */}
      {quickNoteChild && (
        <PanelBilanPeda
          quickNoteChild={quickNoteChild}
          creneaux={creneaux}
          recording={recording}
          transcripts={transcripts}
          setTranscripts={setTranscripts}
          iaLoading={iaLoading}
          iaBilans={iaBilans}
          setIaBilans={setIaBilans}
          quickNotes={quickNotes}
          setQuickNotes={setQuickNotes}
          displayFromHorseName={displayFromHorseName}
          startRecording={startRecording}
          stopRecording={stopRecording}
          analyserBilanIA={analyserBilanIA}
          saveBilanIA={saveBilanIA}
          saveQuickNotes={saveQuickNotes}
          setQuickNoteChild={setQuickNoteChild}
        />
      )}
      {addCreneau && (
        <QuickAddRider
          creneau={addCreneau}
          families={families}
          cartes={cartes}
          forfaits={forfaits}
          onClose={() => setAddCreneau(null)}
          onDone={(msg) => { setAddCreneau(null); toast(`✅ ${msg}`, "success"); fetchData(); }}
        />
      )}
    </div>
    </div>
  );
}
