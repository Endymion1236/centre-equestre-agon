"use client";
import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { collection, getDocs, getDoc, updateDoc, addDoc, doc, query, where, serverTimestamp, runTransaction, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validateChildrenUpdate } from "@/lib/utils";
import { compareCreneaux } from "@/lib/creneau-sort";

const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const bd = new Date(typeof birthDate === "string" ? birthDate : birthDate?.seconds ? birthDate.seconds * 1000 : birthDate);
  if (isNaN(bd.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return `${age} ans`;
};
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAgentContext } from "@/hooks/useAgentContext";
import { emailTemplates } from "@/lib/email-templates";
import PoneyChargeView from "./PoneyChargeView";
import ThemeSuggestion from "./ThemeSuggestion";
import QuickAddRider from "./QuickAddRider";
import SeanceNotes from "./SeanceNotes";
import { Loader2, ChevronLeft, ChevronRight, XCircle, AlertCircle, Printer, ClipboardList, Mic, MicOff, Sparkles, TrendingUp, AlertTriangle, Trash2, X, CalendarDays,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface Creneau { id: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; status: string; rotationPoneys?: boolean; }
const typeColors: Record<string,string> = {stage:"#27ae60",balade:"#e67e22",cours:"#2050A0",competition:"#7c3aed"};

export default function MontoirPage() {
  const { toast } = useToast();
  const { setAgentContext } = useAgentContext("montoir");
  const [dayOffset, setDayOffset] = useState(0);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
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
  const SEUIL_CHUTES_PONEY = 3; // à partir de N chutes sur la saison → signal visuel
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
      const [cSnap, eSnap, iSnap, cartSnap, famSnap, centreSnap, forfSnap] = await Promise.all([
        getDocs(query(collection(db,"creneaux"),where("date","==",dateStr))),
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

  // Si on arrive avec ?date=YYYY-MM-DD (depuis le planning), se caler sur ce jour.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const off = Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86400000);
      if (!isNaN(off)) setDayOffset(off);
    }
  }, []);

  // Liste des équidés disponibles (pas sortis, pas indisponibles)
  // NB : le schéma côté création (cavalerie/TabIndispos) utilise { active, dateDebut, dateFin }
  // On supporte aussi les anciens formats { status, startDate, endDate } par sécurité.
  // Nom affiché : surnom usuel si renseigné, sinon nom officiel
  const displayName = (eq: any): string => (eq?.surnom && eq.surnom.trim()) ? eq.surnom : (eq?.name || "");
  // Résout un horseName stocké (nom officiel) vers le nom à afficher (surnom > officiel)
  const displayFromHorseName = (horseName: string): string => {
    if (!horseName) return "";
    const eq = equides.find(x => x.name === horseName);
    return eq ? displayName(eq) : horseName;
  };
  const isIndispoActive = (i: any, dateStr: string): boolean => {
    // Terminée ? (deux conventions possibles)
    if (i.active === false) return false;
    if (i.status === "terminee") return false;

    const startRaw = i.dateDebut ?? i.startDate;
    const endRaw = i.dateFin ?? i.endDate;
    const start = startRaw?.seconds
      ? new Date(startRaw.seconds * 1000).toISOString().split("T")[0]
      : (typeof startRaw === "string" ? startRaw.split("T")[0] : "");
    const end = endRaw?.seconds
      ? new Date(endRaw.seconds * 1000).toISOString().split("T")[0]
      : (typeof endRaw === "string" ? endRaw.split("T")[0] : "");

    // Pas encore commencée
    if (start && dateStr < start) return false;
    // Déjà terminée (date de fin dépassée)
    if (end && dateStr > end) return false;
    return true;
  };

  const availableHorses = useMemo(() => {
    const activeIndispos = indisponibilites
      .filter((i: any) => isIndispoActive(i, dateStr))
      .map((i: any) => i.equideId);

    return equides
      .filter(e => e.status !== "sorti" && e.status !== "deces" && !activeIndispos.includes(e.id))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [equides, indisponibilites, dateStr]);

  const unavailableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => isIndispoActive(i, dateStr));
    return activeIndispos.map((i: any) => {
      const eq = equides.find(e => e.id === i.equideId);
      return { name: eq ? displayName(eq) : "?", reason: i.motif || "Indisponible" };
    });
  }, [equides, indisponibilites, dateStr]);

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
  const poneyCharge = useMemo(() => {
    const charge: Record<string, { seances: number; heures: number }> = {};
    creneaux.forEach(c => {
      const dur = (() => {
        const [sh, sm] = (c.startTime || "00:00").split(":").map(Number);
        const [eh, em] = (c.endTime || "00:00").split(":").map(Number);
        return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      })();
      (c.enrolled || []).forEach((e: any) => {
        if (!e.horseName) return;
        if (!charge[e.horseName]) charge[e.horseName] = { seances: 0, heures: 0 };
        // Si rotation activée : ce poney fait dur/N heures dans ce créneau
        // (N = nb de créneaux simultanés avec rotation qui ont ce poney)
        let heuresReelles = dur;
        if (c.rotationPoneys) {
          const simultanes = creneaux.filter(other =>
            other.id !== c.id &&
            other.rotationPoneys &&
            other.startTime < c.endTime && other.endTime > c.startTime &&
            (other.enrolled || []).some((oe: any) => oe.horseName === e.horseName)
          );
          if (simultanes.length > 0) {
            heuresReelles = dur / (simultanes.length + 1);
          }
        }
        charge[e.horseName].seances++;
        charge[e.horseName].heures = Math.round((charge[e.horseName].heures + heuresReelles) * 10) / 10;
      });
    });
    return charge;
  }, [creneaux]);

  // ── Historique des 4 derniers poneys par cavalier (depuis les notes péda) ───
  const childHorseHistory = useMemo(() => {
    const hist: Record<string, string[]> = {};
    families.forEach((f: any) => {
      (f.children || []).forEach((ch: any) => {
        const notes = (ch.peda?.notes || [])
          .filter((n: any) => n.horseName)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 4)
          .map((n: any) => n.horseName as string);
        // Dédupliquer en gardant l'ordre
        const seen = new Set<string>();
        hist[ch.id] = notes.filter((h: string) => { if (seen.has(h)) return false; seen.add(h); return true; });
      });
    });
    return hist;
  }, [families]);

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
  // ── Registre des chutes : ouverture / enregistrement / suppression ─────────
  const chuteKey = (cid: string, childId: string) => `${cid}_${childId}`;
  const openChute = (c: Creneau, e: any) => {
    const ex = chutes[chuteKey(c.id, e.childId)];
    setChuteForm({ circonstances: ex?.circonstances || "", gravite: ex?.gravite || "", consequence: ex?.consequence || "", suites: ex?.suites || "" });
    setChuteModal({ c, e });
  };
  const saveChute = async () => {
    if (!chuteModal) return;
    const { c, e } = chuteModal;
    if (!chuteForm.circonstances.trim()) { toast("Merci d'indiquer les circonstances de la chute.", "error"); return; }
    setChuteSaving(true);
    const id = chuteKey(c.id, e.childId);
    const isNew = !chutes[id];
    const data: any = {
      date: dateStr,
      creneauId: c.id, activityTitle: c.activityTitle || "",
      startTime: c.startTime || "", endTime: c.endTime || "",
      childId: e.childId, childName: e.childName || "", familyName: e.familyName || "",
      horseName: e.horseName || "", horseDisplay: displayFromHorseName(e.horseName) || "",
      monitor: c.monitor || "",
      circonstances: chuteForm.circonstances.trim(), gravite: chuteForm.gravite || "", consequence: chuteForm.consequence || "", suites: chuteForm.suites.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "chutes", id), isNew ? { ...data, createdAt: serverTimestamp() } : data, { merge: true });
      setChutes(prev => ({ ...prev, [id]: { id, ...data } }));
      toast(isNew ? "Chute enregistrée dans le registre." : "Chute mise à jour.", "success");
      setChuteModal(null);
    } catch (err) { console.error(err); toast("Erreur lors de l'enregistrement de la chute.", "error"); }
    setChuteSaving(false);
  };
  const deleteChute = async () => {
    if (!chuteModal) return;
    const { c, e } = chuteModal;
    const id = chuteKey(c.id, e.childId);
    setChuteSaving(true);
    try {
      await deleteDoc(doc(db, "chutes", id));
      setChutes(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast("Chute retirée du registre.", "success");
      setChuteModal(null);
    } catch (err) { console.error(err); toast("Erreur lors de la suppression.", "error"); }
    setChuteSaving(false);
  };

  const [recording, setRecording] = useState<string | null>(null); // childId en cours d'enregistrement
  const [transcripts, setTranscripts] = useState<Record<string, string>>({}); // childId → texte dicté
  const [iaLoading, setIaLoading] = useState<Record<string, boolean>>({}); // childId → loading
  const [iaBilans, setIaBilans] = useState<Record<string, any>>({}); // childId → bilan structuré
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const reopenCreneau = async (cid: string, title: string) => {
    if (!confirm(`Rouvrir "${title}" ?\n\nLe créneau repassera en "ouvert" (les débits de cartes et notes déjà faits à la clôture restent inchangés).`)) return;
    try {
      await updateDoc(doc(db, "creneaux", cid), { status: "active", closedAt: null, reopenedAt: serverTimestamp() });
      toast("Créneau rouvert.", "success");
      fetchData();
    } catch (e) { console.error("Rouvrir créneau:", e); toast("Erreur lors de la réouverture.", "error"); }
  };

  const closeCreneau = async (cid: string) => {
    const c = creneaux.find(x => x.id === cid);
    if (!c) return;
    // Anti-duplication : si déjà clôturé, ne rien faire
    if (c.status === "closed") { toast("Cette reprise est déjà clôturée.", "warning"); return; }

    // Modele "presence par defaut" (mai 2026, demande Nicolas) :
    // Tout cavalier qui n'est PAS explicitement marque absent ou absent
    // non justifie est considere present. Plus besoin de cocher la
    // presence un par un, on ne marque que les absents.
    //
    // -> presents inclut donc les anciens "present" ET ceux qui n'ont
    //    pas de statut (anciennement "nonPointes"). C'est intentionnel.
    const absents = (c.enrolled || []).filter((e: any) => e.presence === "absent");
    const absentsNonJustified = (c.enrolled || []).filter((e: any) => e.presence === "absent_nonjustified");
    const presents = (c.enrolled || []).filter((e: any) =>
      e.presence !== "absent" && e.presence !== "absent_nonjustified"
    );

    const msg = `Clôturer "${c.activityTitle}" (${c.startTime}) ?\n\n` +
      `${presents.length} présent${presents.length > 1 ? "s" : ""}, ${absents.length} absent${absents.length > 1 ? "s" : ""}` +
      (absentsNonJustified.length > 0 ? `, ${absentsNonJustified.length} non justifié${absentsNonJustified.length > 1 ? "s" : ""}` : "");
    if (!confirm(msg)) return;

    // 1. Clôturer le créneau
    await updateDoc(doc(db, "creneaux", cid), { status: "closed", closedAt: serverTimestamp() });

    // 2. Charger toutes les familles (depuis le state)
    const allFams = families;

    // 3. Créer une trace pédagogique pour chaque enfant présent
    let notesCreated = 0;
    for (const child of presents) {
      try {
        const famDoc = allFams.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
        if (!famDoc) continue;
        const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
        if (!matchChild) continue;
        const peda = matchChild.peda || { objectifs: [], notes: [] };

        // Anti-doublon : vérifier si une note pour ce créneau existe déjà
        if (peda.notes.some((n: any) => n.creneauId === cid)) continue;

        const seanceNote = {
          date: new Date().toISOString(),
          text: `Séance : ${c.activityTitle} (${c.startTime}-${c.endTime})${child.horseName ? ` — Poney : ${displayFromHorseName(child.horseName)}` : ""}`,
          author: "Montoir (auto)",
          type: "seance",
          creneauId: cid,
          activityTitle: c.activityTitle,
          horseName: child.horseName || "",
        };
        const updatedChildren = famDoc.children.map((ch: any) =>
          ch.id === child.childId ? { ...ch, peda: { ...peda, notes: [seanceNote, ...peda.notes], updatedAt: new Date().toISOString() } } : ch
        );
        if (!validateChildrenUpdate(famDoc.id, famDoc.parentName || "", famDoc.children || [], updatedChildren, "montoir-cloture")) continue;
        await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });
        notesCreated++;
      } catch (e) { console.error("Erreur trace péda:", e); }
    }

    // 4. Débiter automatiquement les cartes des cavaliers présents
    let cartesDebitees = 0;
    for (const child of presents) {
      // Cas 1 : paymentSource=card avec cardId explicite
      // Cas 2 : fallback — chercher une carte compatible (individuelle ou familiale)
      let carteId = (child as any).cardId;
      const ps = (child as any).paymentSource;
      if (!carteId && ps !== "card" && ps !== "forfait" && ps !== "offert" && ps !== "celeris") {
        try {
          const isCours = ["cours","cours_collectif","cours_particulier"].includes(c.activityType);
          const isBalade = ["balade","promenade","ponyride"].includes(c.activityType);
          // Récupérer la famille de l'enfant pour chercher les cartes familiales
          const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
          const [cartesIndivSnap, cartesFamSnap] = await Promise.all([
            getDocs(query(collection(db, "cartes"), where("childId", "==", child.childId), where("status", "==", "active"))),
            famDoc ? getDocs(query(collection(db, "cartes"), where("familyId", "==", famDoc.id || famDoc.firestoreId), where("familiale", "==", true), where("status", "==", "active"))) : Promise.resolve({ docs: [] }),
          ]);
          const allDocs = [...cartesIndivSnap.docs, ...(cartesFamSnap as any).docs];
          const carteDoc = allDocs.find(d => {
            const cd = d.data();
            if ((cd.remainingSessions || 0) <= 0) return false;
            if (cd.dateFin && new Date(cd.dateFin) < new Date()) return false;
            const ct = cd.activityType || "cours";
            return (ct === "cours" && isCours) || (ct === "balade" && isBalade);
          });
          if (carteDoc) carteId = carteDoc.id;
        } catch {}
      }
      if (!carteId) continue;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        if ((carte.remainingSessions || 0) <= 0) continue;
        const dejaDebite = (carte.history || []).some((h: any) =>
          h.creneauId === cid && !h.credit && h.childName === child.childName
        );
        if (dejaDebite) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid, creneauDate: c.date, startTime: c.startTime,
          horseName: (child as any).horseName || (child as any).equideName || "",
          childName: child.childName, presence: "present", auto: true,
        }];
        const newRemaining = (carte.remainingSessions || 0) - 1;
        await runTransaction(db, async (tx) => {
          // Re-lire dans la transaction pour éviter les race conditions
          const freshSnap = await tx.get(doc(db, "cartes", carteId));
          if (!freshSnap.exists()) throw new Error("Carte introuvable");
          const freshData = freshSnap.data();
          if ((freshData.remainingSessions || 0) <= 0) throw new Error("Carte épuisée");
          // Vérifier anti-doublon dans la transaction
          if ((freshData.history || []).some((h: any) => h.creneauId === cid && !h.credit && h.childName === child.childName)) {
            throw new Error("Déjà débité");
          }
          const updatedHistory = [...(freshData.history || []), {
            date: new Date().toISOString(),
            activityTitle: c.activityTitle,
            creneauId: cid, creneauDate: c.date, startTime: c.startTime,
            horseName: (child as any).horseName || (child as any).equideName || "",
            childName: child.childName, presence: "present", auto: true,
          }];
          const newRem = (freshData.remainingSessions || 0) - 1;
          tx.update(doc(db, "cartes", carteId), {
            remainingSessions: newRem,
            usedSessions: (freshData.usedSessions || 0) + 1,
            history: updatedHistory,
            status: newRem <= 0 ? "used" : "active",
            updatedAt: serverTimestamp(),
          });
        });
        cartesDebitees++;
      } catch (e) { console.error("Erreur débit carte montoir:", e); }
    }

    // 4b. Tracer les absents dans l'historique de leur carte (sans débiter)
    for (const child of absents) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        // Ne pas tracer si déjà tracé pour ce créneau
        if ((carte.history || []).some((h: any) => h.creneauId === cid && h.presence === "absent" && h.childName === child.childName)) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid,
          creneauDate: c.date,
          startTime: c.startTime,
          horseName: (child as any).horseName || "",
          childName: child.childName,
          presence: "absent",
          auto: true,
        }];
        await updateDoc(doc(db, "cartes", carteId), {
          history: newHistory,
          updatedAt: serverTimestamp(),
        });
        // Pas de débit — la séance reste disponible
      } catch (e) { console.error("Erreur trace absent carte:", e); }
    }

    // 4b-bis. Absents NON JUSTIFIÉS : débiter la carte (séance perdue).
    // Politique : pas prévenu ou trop tard → la séance est consommée même
    // sans présence. Cohérent avec le 3ème bouton "Absent non justifié".
    // Sans ça, le cavalier serait "récompensé" de son absence : la carte
    // garderait sa séance, comme pour une absence légitime.
    let cartesDebiteesNJ = 0;
    for (const child of absentsNonJustified) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(doc(db, "cartes", carteId));
          if (!freshSnap.exists()) throw new Error("Carte introuvable");
          const freshData = freshSnap.data();
          if ((freshData.remainingSessions || 0) <= 0) throw new Error("Carte épuisée");
          // Anti-doublon
          if ((freshData.history || []).some((h: any) => h.creneauId === cid && !h.credit && h.childName === child.childName)) {
            throw new Error("Déjà débité");
          }
          const updatedHistory = [...(freshData.history || []), {
            date: new Date().toISOString(),
            activityTitle: c.activityTitle,
            creneauId: cid, creneauDate: c.date, startTime: c.startTime,
            horseName: (child as any).horseName || (child as any).equideName || "",
            childName: child.childName,
            presence: "absent_nonjustified",
            reason: "Séance perdue (absence non justifiée)",
            auto: true,
          }];
          const newRem = (freshData.remainingSessions || 0) - 1;
          tx.update(doc(db, "cartes", carteId), {
            remainingSessions: newRem,
            usedSessions: (freshData.usedSessions || 0) + 1,
            history: updatedHistory,
            status: newRem <= 0 ? "used" : "active",
            updatedAt: serverTimestamp(),
          });
        });
        cartesDebiteesNJ++;
      } catch (e) { console.error("Erreur débit carte (non justifié):", e); }
    }

    // 4c. Créer des crédits rattrapage pour les absents ayant un forfait actif
    let rattrapagesCreated = 0;
    for (const child of absents) {
      try {
        // Vérifier si l'enfant a un forfait actif
        const forfaitSnap = await getDocs(query(
          collection(db, "forfaits"),
          where("childId", "==", child.childId),
          where("status", "in", ["active", "actif"])
        ));
        if (forfaitSnap.empty) continue;

        // Anti-doublon : vérifier si un rattrapage existe déjà pour ce créneau + enfant
        const existingSnap = await getDocs(query(
          collection(db, "rattrapages"),
          where("childId", "==", child.childId),
          where("sourceCreneauId", "==", cid)
        ));
        if (!existingSnap.empty) continue;

        // Saison sept→juin : aucun rattrapage accordé pour une absence en juillet/août.
        const absMonthM = (c.date || "").slice(5, 7);
        if (absMonthM === "07" || absMonthM === "08") continue;

        // Limite de 5 rattrapages par saison (hors situation médicale).
        // Au-delà, on demande si c'est médical : si oui on accorde (exempté),
        // sinon on n'accorde pas de rattrapage.
        const seasonStartStr = (() => { const n = new Date(); const y = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1; return `${y}-09-01`; })();
        const allRSnap = await getDocs(query(collection(db, "rattrapages"), where("childId", "==", child.childId)));
        const nbNonMedical = allRSnap.docs.filter(d => { const r: any = d.data(); return r.medical !== true && (r.sourceDate || "") >= seasonStartStr; }).length;
        let medical = false;
        if (nbNonMedical >= 5) {
          const ok = window.confirm(`${child.childName} a déjà 5 rattrapages cette saison (hors médical).\n\nS'agit-il d'une situation médicale ?\nOK = accorder un rattrapage médical (exempté de la limite)\nAnnuler = ne pas accorder de rattrapage`);
          if (!ok) continue;
          medical = true;
        }

        // Date d'expiration = date d'absence + 3 mois (politique métier)
        // Cohérent avec la désinscription forfait depuis planning admin.
        // Évite l'aberration "fin trimestre civil" qui pouvait être avant
        // la date même de l'absence pour une absence en fin d'année.
        const absenceDate = new Date(c.date + "T12:00:00");
        const expiry = new Date(absenceDate);
        expiry.setMonth(expiry.getMonth() + 3);
        const expiryDateStr = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`;

        await addDoc(collection(db, "rattrapages"), {
          childId: child.childId,
          childName: child.childName,
          familyId: child.familyId,
          familyName: child.familyName,
          forfaitId: forfaitSnap.docs[0].id,
          sourceCreneauId: cid,
          sourceDate: c.date,
          sourceActivity: c.activityTitle,
          sourceTime: `${c.startTime}–${c.endTime}`,
          status: "pending", // pending | used | expired
          medical,
          usedOnCreneauId: null,
          usedOnDate: null,
          expiryDate: expiryDateStr,
          createdAt: serverTimestamp(),
        });
        rattrapagesCreated++;
      } catch (e) { console.error("Erreur création rattrapage:", e); }
    }

    // 5. Proposer l'ajout de notes rapides
    if (presents.length > 0) {
      setQuickNoteChild({ cid, children: presents.map(p => ({ childId: p.childId, childName: p.childName, horseName: p.horseName || "" })) });
    }

    const parts = [`Reprise clôturée.`];
    if (notesCreated > 0) parts.push(`${notesCreated} trace${notesCreated > 1 ? "s" : ""} péda.`);
    if (cartesDebitees > 0) parts.push(`${cartesDebitees} carte${cartesDebitees > 1 ? "s" : ""} débitée${cartesDebitees > 1 ? "s" : ""}.`);
    if (cartesDebiteesNJ > 0) parts.push(`${cartesDebiteesNJ} séance${cartesDebiteesNJ > 1 ? "s" : ""} perdue${cartesDebiteesNJ > 1 ? "s" : ""} (NJ).`);
    if (rattrapagesCreated > 0) parts.push(`${rattrapagesCreated} rattrapage${rattrapagesCreated > 1 ? "s" : ""} créé${rattrapagesCreated > 1 ? "s" : ""}.`);
    if (absentsNonJustified.length > rattrapagesCreated && absentsNonJustified.length > 0) {
      // Mention discrète : ces absences ne génèrent ni rattrapage ni recrédit
      parts.push(`${absentsNonJustified.length} non justifié${absentsNonJustified.length > 1 ? "s" : ""} (séance perdue).`);
    }
    toast(parts.join(" "), "success");
    fetchData();
  };

  // ── Dictée vocale ──────────────────────────────────────────────────────────
  const startRecording = async (childId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Choisir le format supporté
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // Arrêter toutes les pistes micro
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const audioFile = new File([audioBlob], `bilan_${childId}.${ext}`, { type: mimeType });
        // Envoyer à Whisper
        await transcribeWithWhisper(childId, audioFile);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500); // chunks toutes les 500ms
      setRecording(childId);
    } catch (e: any) {
      alert(`Impossible d'accéder au microphone : ${e.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(null);
  };

  const transcribeWithWhisper = async (childId: string, audioFile: File) => {
    setIaLoading(prev => ({ ...prev, [childId]: true }));
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      const res = await authFetch("/api/whisper", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setTranscripts(prev => ({ ...prev, [childId]: data.text }));
      } else {
        alert(`Erreur Whisper : ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erreur transcription : ${e.message}`);
    }
    setIaLoading(prev => ({ ...prev, [childId]: false }));
  };

  const analyserBilanIA = async (child: any, creneauInfo: any) => {
    const transcript = transcripts[child.childId];
    if (!transcript?.trim()) return;
    setIaLoading(prev => ({ ...prev, [child.childId]: true }));

    // Récupérer les infos pédagogiques de l'enfant
    const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
    const matchChild = famDoc?.children.find((ch: any) => ch.id === child.childId);
    const peda = matchChild?.peda || { objectifs: [], notes: [] };
    const recentNotes = (peda.notes || []).slice(0, 3).map((n: any) => n.text);

    try {
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bilan_peda",
          transcript,
          child: {
            firstName: matchChild?.firstName || child.childName,
            lastName: matchChild?.lastName || "",
            galopLevel: matchChild?.galopLevel || "—",
            objectifs: peda.objectifs || [],
            recentNotes,
          },
          seance: {
            activityTitle: creneauInfo.activityTitle,
            date: new Date(creneauInfo.date).toLocaleDateString("fr-FR"),
            horseName: child.horseName || "",
          },
        }),
      });
      const data = await res.json();
      if (data.success) setIaBilans(prev => ({ ...prev, [child.childId]: { ...data.bilan, creneauId: creneauInfo.id } }));
      else alert(`Erreur IA : ${data.error}`);
    } catch (e: any) { alert(`Erreur : ${e.message}`); }
    setIaLoading(prev => ({ ...prev, [child.childId]: false }));
  };

  const saveBilanIA = async (child: any, bilan: any) => {
    const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
    if (!famDoc) return;
    const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
    if (!matchChild) return;
    const peda = matchChild.peda || { objectifs: [], notes: [] };

    // 1. Créer la note structurée
    const noteTexte = [
      bilan.note.pointsForts ? `✅ Points forts : ${bilan.note.pointsForts}` : "",
      bilan.note.aTravailler ? `🔧 À travailler : ${bilan.note.aTravailler}` : "",
      bilan.note.objectifSuivant ? `🎯 Prochain objectif : ${bilan.note.objectifSuivant}` : "",
    ].filter(Boolean).join("\n");

    const newNote = {
      date: new Date().toISOString(),
      text: noteTexte,
      rawTranscript: transcripts[child.childId] || "",
      author: "Bilan IA — Moniteur",
      type: "bilan_ia",
      creneauId: bilan.creneauId || "",
      activityTitle: quickNoteChild?.cid || "",
    };

    let updatedPeda = { ...peda, notes: [newNote, ...peda.notes], updatedAt: new Date().toISOString() };

    // 2. Mettre à jour le galop si mentionné
    let galopUpdate = matchChild.galopLevel;
    if (bilan.galopUpdate && bilan.galopUpdate !== matchChild.galopLevel) {
      galopUpdate = bilan.galopUpdate;
    }

    // 3. Valider des objectifs existants
    if (bilan.objectifsAValider?.length > 0) {
      updatedPeda.objectifs = (updatedPeda.objectifs || []).map((o: any) =>
        bilan.objectifsAValider.includes(o.id) ? { ...o, status: "valide", validatedAt: new Date().toISOString() } : o
      );
    }

    // 4. Créer un nouvel objectif si suggéré
    if (bilan.nouvelObjectif?.label) {
      const newObj = {
        id: `obj_${Date.now()}`,
        label: bilan.nouvelObjectif.label,
        category: bilan.nouvelObjectif.category || "technique",
        status: "en_cours",
        createdAt: new Date().toISOString(),
      };
      updatedPeda.objectifs = [newObj, ...(updatedPeda.objectifs || [])];
    }

    const updatedChildren = famDoc.children.map((ch: any) =>
      ch.id === child.childId
        ? { ...ch, peda: updatedPeda, galopLevel: galopUpdate }
        : ch
    );

    await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });

    // Supprimer le bilan de l'état local
    setIaBilans(prev => { const n = { ...prev }; delete n[child.childId]; return n; });
    setTranscripts(prev => { const n = { ...prev }; delete n[child.childId]; return n; });
    toast(`✅ Bilan IA enregistré pour ${child.childName}`, "success");
  };

  const saveQuickNotes = async () => {
    if (!quickNoteChild) return;
    const allFams = families;
    const authorName = "Moniteur"; // On pourrait passer le user ici

    for (const child of quickNoteChild.children) {
      const noteText = quickNotes[child.childId];
      if (!noteText?.trim()) continue;
      const famDoc = allFams.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
      if (!famDoc) continue;
      const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
      if (!matchChild) continue;
      const peda = matchChild.peda || { objectifs: [], notes: [] };
      const note = { date: new Date().toISOString(), text: noteText.trim(), author: authorName, type: "manual" };
      const updatedChildren = famDoc.children.map((ch: any) =>
        ch.id === child.childId ? { ...ch, peda: { ...peda, notes: [note, ...peda.notes], updatedAt: new Date().toISOString() } } : ch
      );
      await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });
    }
    setQuickNoteChild(null);
    setQuickNotes({});
  };

  const totalE = creneaux.reduce((s,c)=>s+(c.enrolled?.length||0),0);
  // Compte coherent avec la nouvelle logique "present par defaut" :
  // sont presents tous ceux qui n'ont PAS ete marques absent/non justifie.
  const totalP = creneaux.reduce((s,c)=>s+(c.enrolled||[]).filter(
    (e:any)=>e.presence!=="absent" && e.presence!=="absent_nonjustified"
  ).length,0);

  return (
    <div>
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
          <button onClick={()=>window.print()} className="flex items-center gap-2 font-body text-sm text-slate-600 bg-white px-3 sm:px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><Printer size={16} /> Imprimer</button>
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
          <div className="font-display text-lg font-bold text-blue-800 capitalize flex items-center justify-center gap-1.5">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}<CalendarDays size={15} className="text-blue-400 print:hidden" /></div><div className="font-body text-xs text-slate-600">{creneaux.length} reprise{creneaux.length>1?"s":""} · {totalE} inscrits · {totalP} présents</div></div>
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
      {creneaux.length === 0 ? <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div><p className="font-body text-sm text-slate-600">Aucune reprise ce jour.</p></Card> :
      <div className="flex flex-col gap-6">{creneaux.map(c => { const en = c.enrolled||[]; const col = (c as any).color || typeColors[c.activityType]||"#666"; const closed = c.status==="closed"; const pres = en.filter((e:any)=>e.presence!=="absent" && e.presence!=="absent_nonjustified").length; return (
        <Card key={c.id} padding="md" className={closed ? "border-gray-200 bg-gray-50/50" : ""}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-blue-500/8">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px]" style={{color:"#475569"}}>{c.endTime}</div></div>
              <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}{(c as any).themeStage && <span className="ml-2 font-body text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">🎭 {(c as any).themeStage}</span>}</div><div className="font-body text-xs" style={{color:"#334155"}}>{c.monitor} · {en.length}/{c.maxPlaces}</div></div>
            </div>
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              {/* Navigation jour intégrée à la reprise : passer veille/lendemain
                  sans remonter en haut de page. */}
              <div className="flex items-center gap-0.5 mr-1" title="Changer de jour">
                <button onClick={()=>setDayOffset(d=>d-1)} aria-label="Jour précédent"
                  className="p-1.5 rounded-md text-slate-500 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"><ChevronLeft size={14}/></button>
                {dayOffset !== 0 && <button onClick={()=>setDayOffset(0)}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-blue-600 bg-blue-50 border-none cursor-pointer">auj.</button>}
                <button onClick={()=>setDayOffset(d=>d+1)} aria-label="Jour suivant"
                  className="p-1.5 rounded-md text-slate-500 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"><ChevronRight size={14}/></button>
              </div>
              <Badge color={closed?"gray":pres===en.length&&en.length>0?"green":"orange"}>{closed?"Clôturée":`${pres}/${en.length} présents`}</Badge>
              {closed && (
                <button onClick={()=>reopenCreneau(c.id, c.activityTitle)}
                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-700 bg-amber-100 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-amber-200">
                  🔓 Rouvrir
                </button>
              )}
              {!closed && (
                <button onClick={()=>setAddCreneau(c)}
                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-600 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-500">
                  + Ajouter
                </button>
              )}
              {!closed && (
                <button onClick={()=>toggleRotationPoneys(c)}
                  title="Rotation poneys : même poney autorisé sur deux stages simultanés (fait 1h dans chacun)"
                  className={`flex items-center gap-1.5 font-body text-xs px-2.5 py-1.5 rounded-lg border-none cursor-pointer transition-all ${c.rotationPoneys ? "bg-green-100 text-green-700 font-semibold" : "bg-gray-100 text-gray-400"}`}>
                  🔄 Rotation{c.rotationPoneys ? " ✓" : ""}
                </button>
              )}
              {!closed && (c.activityType === "stage" || c.activityType === "stage_journee") && (
                <ThemeSuggestion creneau={c} families={families} />
              )}
              {!closed && en.length>0 && <>
                <button onClick={async () => {
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
                        ? emailTemplates.rappelStage({ parentName: r.parentName, enfants: r.children, stageTitle: c.activityTitle, dateDebut: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), horaire: `${c.startTime}–${c.endTime}` })
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
                }} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Rappeler</button>
                <button onClick={()=>closeCreneau(c.id)} className="font-body text-xs font-semibold text-slate-600 bg-sand px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">Clôturer</button>
              </>}
            </div>
          </div>
          <SeanceNotes creneau={c} onChanged={fetchData} />
          {en.length===0 ? <p className="font-body text-sm text-slate-600 italic">Aucun inscrit</p> :
          <div>
            {/* En-tête masqué sur mobile : les lignes y passent en 2 niveaux
                (nom+âge / poney+présence), les libellés deviennent inutiles. */}
            <div className="hidden sm:flex items-center px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-wider" style={{color:"#334155"}}>
              <span className="w-8">#</span><span className="flex-1">Cavalier</span><span className="w-32">Famille</span><span className="w-36">Poney</span><span className="w-24 text-center">Présence</span>
            </div>
            {en.map((e:any, i:number) => (
              <div key={e.childId} className={`flex flex-wrap sm:flex-nowrap items-center gap-y-1.5 px-3 py-2.5 rounded-lg ${i%2===0?"bg-sand":""} ${(e.presence==="absent"||e.presence==="absent_nonjustified")?"opacity-40":""}`}>
                <span className="w-8 font-body text-xs hidden sm:block" style={{color:"#475569"}}>{i+1}</span>
                {/* Mobile : nom + âge sur une ligne pleine largeur (le badge ne
                    casse plus au milieu) ; desktop : colonne flexible inchangée. */}
                <span className="w-full sm:w-auto sm:flex-1 font-body text-sm font-semibold text-blue-800 flex items-center gap-1.5 min-w-0">
                  {(() => {
                    const famForLink = families.find((f:any) => (f.children||[]).some((cc:any)=>cc.id===e.childId));
                    const famId = famForLink?.firestoreId || famForLink?.id;
                    return (<>
                      {/* Nom cliquable → fiche famille (cavalier ciblé) */}
                      {famId ? (
                        <a href={`/admin/cavaliers?id=${famId}&child=${e.childId}`} title="Ouvrir la fiche client"
                          className="truncate text-blue-800 no-underline hover:underline hover:text-blue-600">{e.childName}</a>
                      ) : <span className="truncate">{e.childName}</span>}
                      {/* Desktop : icône progression, sans quitter le montoir */}
                      {famId && (
                        <a href={`/admin/progression/${e.childId}?familyId=${famId}`} title="Voir la progression"
                          target="_blank" rel="noopener noreferrer"
                          className="hidden sm:inline-flex shrink-0 text-pink-500 no-underline hover:text-pink-600">
                          <TrendingUp size={13} />
                        </a>
                      )}
                    </>);
                  })()}
                  {(() => {
                    const fam = families.find((f:any) => (f.children||[]).some((c:any)=>c.id===e.childId));
                    const child = (fam?.children||[]).find((c:any)=>c.id===e.childId);
                    const age = calcAge(child?.birthDate);
                    // Anniversaire dans les 7 jours → 🎂 pour que la monitrice le souhaite en séance
                    const dBirth = (() => {
                      if (!child?.birthDate) return null;
                      const bd = new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : child.birthDate);
                      if (isNaN(bd.getTime())) return null;
                      const today = new Date(); today.setHours(0,0,0,0);
                      const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
                      if (next < today) next.setFullYear(today.getFullYear() + 1);
                      return Math.round((next.getTime() - today.getTime()) / 86400000);
                    })();
                    return <>
                      {age ? <span className="shrink-0 whitespace-nowrap font-body text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{age}</span> : null}
                      {dBirth !== null && dBirth <= 7 && (
                        <span className="shrink-0 whitespace-nowrap font-body text-[10px] font-semibold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded-full"
                          title={dBirth === 0 ? "C'est son anniversaire aujourd'hui !" : `Anniversaire dans ${dBirth} jour${dBirth > 1 ? "s" : ""}`}>
                          🎂{dBirth === 0 ? " Aujourd'hui !" : ` J-${dBirth}`}
                        </span>
                      )}
                    </>;
                  })()}
                </span>
                <span className="w-32 font-body text-xs hidden sm:block" style={{color:"#334155"}}>
                  {(() => {
                    const famForLink = families.find((f:any) => (f.children||[]).some((cc:any)=>cc.id===e.childId));
                    const famId = famForLink?.firestoreId || famForLink?.id;
                    return famId
                      ? <a href={`/admin/cavaliers?id=${famId}&child=${e.childId}`} title="Ouvrir la fiche client" className="no-underline hover:underline" style={{color:"#334155"}}>{e.familyName}</a>
                      : e.familyName;
                  })()}
                </span>
                <span className="grow basis-40 sm:grow-0 sm:basis-auto sm:w-36 min-w-0">{!closed ? (() => {
                  // Doublon dans CE créneau → toujours bloqué
                  const usedInThis = new Set<string>();
                  en.forEach((oe: any) => { if (oe.childId !== e.childId && oe.horseName) usedInThis.add(oe.horseName); });
                  // Poneys sur créneaux simultanés → bloqué seulement si pas de rotation
                  const usedElsewhere = new Set<string>();
                  creneaux.forEach(other => {
                    if (other.id === c.id) return;
                    if (other.startTime >= c.endTime || other.endTime <= c.startTime) return;
                    (other.enrolled || []).forEach((oe: any) => { if (oe.horseName) usedElsewhere.add(oe.horseName); });
                  });

                  return (
                    <div className="w-full sm:w-36 flex flex-col gap-1">
                      <select value={e.horseName||""} onChange={ev=>assignHorse(c,e.childId,ev.target.value)} className="px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white w-full">
                        <option value="">Affecter...</option>
                        {availableHorses.map(h => {
                          const usedHere = usedInThis.has(h.name);
                          const usedOther = usedElsewhere.has(h.name);
                          const blockedOther = usedOther && !c.rotationPoneys;
                          const charge = poneyCharge[h.name];
                          const chargeStr = charge ? ` (${charge.seances}s)` : "";
                          const nbChutes = poneyChuteCount[h.name] || 0;
                          const chuteStr = nbChutes >= SEUIL_CHUTES_PONEY ? ` ⚠️${nbChutes}` : "";
                          return <option key={h.id} value={h.name} disabled={usedHere || blockedOther}
                            style={usedHere || blockedOther ? {color:"#ccc"} : charge?.seances >= seuilPoney.orange ? {color:"#f59e0b"} : {}}>
                            {displayName(h)}{chargeStr}{chuteStr}{usedHere ? " ✗" : blockedOther ? " ✗" : usedOther ? " ↺" : ""}
                          </option>;
                        })}
                      </select>
                      {e.horseName && (poneyChuteCount[e.horseName] || 0) >= SEUIL_CHUTES_PONEY && (
                        <div className="font-body text-[9px] font-semibold text-red-600 flex items-center gap-1" title={`${poneyChuteCount[e.horseName]} chutes enregistrées cette saison avec ce poney`}>
                          ⚠️ {poneyChuteCount[e.horseName]} chutes cette saison
                        </div>
                      )}
                      {/* Historique 4 derniers poneys du cavalier */}
                      {(childHorseHistory[e.childId] || []).length > 0 && (
                        <div className="font-body text-[9px] text-slate-400 truncate" title={`Historique : ${childHorseHistory[e.childId].join(" → ")}`}>
                          ↺ {childHorseHistory[e.childId].join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })() : <span className="block truncate font-body text-xs font-semibold text-blue-800">{displayFromHorseName(e.horseName) || "—"}</span>}</span>
                <span className="shrink-0 ml-auto sm:ml-0 sm:w-32 flex justify-end sm:justify-center gap-1 sm:gap-2">{!closed ? <>
                  {/* Bouton "Chute" (facultatif) : à activer UNIQUEMENT s'il y a eu
                      une chute. Rouge plein = chute enregistrée dans le registre. */}
                  <button onClick={()=>openChute(c,e)} title={chutes[chuteKey(c.id,e.childId)] ? "Chute enregistrée — cliquer pour modifier" : "Signaler une chute"} className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${chutes[chuteKey(c.id,e.childId)] ? "bg-red-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-red-100"}`}><AlertTriangle size={17}/></button>
                  {/* Bouton "Present" retire (mai 2026, demande Nicolas) :
                      tout cavalier non explicitement marque absent/non
                      justifie est considere present par defaut. On ne
                      coche plus que les absences. */}
                  <button onClick={()=>togglePresence(c,e.childId,"absent")} title="Absent (rattrapage offert) — recliquer pour annuler" className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent"?"bg-red-500 text-white":"bg-gray-100 text-slate-600 hover:bg-red-100"}`}><XCircle size={18}/></button>
                  {/* 3ème bouton : absence non justifiée → séance perdue, AUCUN rattrapage généré à la clôture.
                      Utilisé pour les cavaliers qui ne préviennent pas (ou trop tard). Couleur ambre/orange
                      pour le distinguer visuellement du rouge "absent justifié". */}
                  <button onClick={()=>togglePresence(c,e.childId,"absent_nonjustified")} title="Absent non justifié (séance perdue, pas de rattrapage) — recliquer pour annuler" className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent_nonjustified"?"bg-amber-500 text-white":"bg-gray-100 text-slate-600 hover:bg-amber-100"}`}><AlertCircle size={18}/></button>
                  <span className="hidden print:inline font-body text-xs font-semibold">{e.presence==="absent"?"✗ Absent":e.presence==="absent_nonjustified"?"⚠ NJ":"✓ Présent"}</span>
                </> : <span className="flex items-center gap-1.5">{chutes[chuteKey(c.id,e.childId)] && <Badge color="red">⚠️ Chute</Badge>}<Badge color={e.presence==="absent"?"red":e.presence==="absent_nonjustified"?"orange":"green"}>{e.presence==="absent"?"Absent":e.presence==="absent_nonjustified"?"Absent non justifié":"Présent"}</Badge></span>}</span>
              </div>
            ))}
          </div>}
        </Card>); })}</div>}
      </>}

      {/* ── Modal : circonstances d'une chute ─────────────────────────────── */}
      {chuteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setChuteModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-600"><AlertTriangle size={16} className="text-white" /></div>
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Signaler une chute</h2>
                  <p className="font-body text-xs text-slate-600">{chuteModal.e.childName}{chuteModal.e.horseName ? ` — 🐴 ${displayFromHorseName(chuteModal.e.horseName)}` : ""} · {chuteModal.c.activityTitle} ({chuteModal.c.startTime})</p>
                </div>
              </div>
              <button onClick={() => setChuteModal(null)} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Circonstances de la chute <span className="text-red-600">*</span></label>
                <textarea autoFocus value={chuteForm.circonstances} onChange={ev => setChuteForm(f => ({ ...f, circonstances: ev.target.value }))} rows={4} placeholder="Ex : refus à l'obstacle, le cavalier a basculé par-dessus l'encolure. Réception sur le côté, pas de perte de connaissance." className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y" />
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Gravité <span className="font-normal text-slate-400">(facultatif)</span></label>
                <div className="flex gap-2">
                  {([["legere","Légère","bg-green-100 text-green-800 border-green-300"],["moderee","Modérée","bg-amber-100 text-amber-800 border-amber-300"],["grave","Grave","bg-red-100 text-red-800 border-red-300"]] as const).map(([val,lbl,cls]) => (
                    <button key={val} type="button" onClick={() => setChuteForm(f => ({ ...f, gravite: f.gravite === val ? "" : val }))} className={`flex-1 font-body text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer ${chuteForm.gravite === val ? cls : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Conséquence <span className="font-normal text-slate-400">(facultatif)</span></label>
                <div className="flex flex-col sm:flex-row gap-2">
                  {([["remonte","Est remonté","bg-green-100 text-green-800 border-green-300"],["refuse","A refusé de remonter","bg-amber-100 text-amber-800 border-amber-300"],["arret","Arrête l'équitation","bg-red-100 text-red-800 border-red-300"]] as const).map(([val,lbl,cls]) => (
                    <button key={val} type="button" onClick={() => setChuteForm(f => ({ ...f, consequence: f.consequence === val ? "" : val }))} className={`flex-1 font-body text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer ${chuteForm.consequence === val ? cls : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Suites / actions <span className="font-normal text-slate-400">(facultatif)</span></label>
                <textarea value={chuteForm.suites} onChange={ev => setChuteForm(f => ({ ...f, suites: ev.target.value }))} rows={2} placeholder="Ex : parents prévenus, pas de suite / passage chez le médecin conseillé." className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2">
              {chutes[chuteKey(chuteModal.c.id, chuteModal.e.childId)] ? (
                <button onClick={deleteChute} disabled={chuteSaving} className="flex items-center gap-1.5 font-body text-sm font-semibold text-red-600 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100 disabled:opacity-50"><Trash2 size={15} /> Retirer</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setChuteModal(null)} disabled={chuteSaving} className="font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer disabled:opacity-50">Annuler</button>
                <button onClick={saveChute} disabled={chuteSaving} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-red-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-red-500 disabled:opacity-50">{chuteSaving ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />} Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel bilan pédagogique IA post-clôture */}
      {quickNoteChild && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => { stopRecording(); setQuickNoteChild(null); setQuickNotes({}); setTranscripts({}); setIaBilans({}); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Bilan pédagogique</h2>
                  <p className="font-body text-xs text-slate-600">Dictez votre observation — l'IA structure la fiche cavalier</p>
                </div>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {quickNoteChild.children.map(child => {
                const isRec = recording === child.childId;
                const transcript = transcripts[child.childId] || "";
                const loading = iaLoading[child.childId] || false;
                const bilan = iaBilans[child.childId];
                // Trouver la reprise
                const creneau = creneaux.find(c => c.id === quickNoteChild.cid);

                return (
                  <div key={child.childId} className="border border-gray-100 rounded-2xl p-4">
                    {/* En-tête enfant */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-sm font-semibold text-blue-800">{child.childName}</span>
                        {child.horseName && <Badge color="blue">🐴 {displayFromHorseName(child.horseName)}</Badge>}
                      </div>
                      {bilan && <Badge color="green">✓ Analysé</Badge>}
                    </div>

                    {/* Bouton dictée + transcription */}
                    {!bilan && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => isRec ? stopRecording() : startRecording(child.childId)}
                            disabled={loading}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all disabled:opacity-50 ${isRec ? "bg-red-500 text-white" : "bg-purple-50 text-purple-700 hover:bg-purple-100"}`}>
                            {isRec ? <><MicOff size={16} /> Arrêter la dictée</> : <><Mic size={16} /> Dicter</>}
                          </button>
                          {loading && !transcript && (
                            <div className="flex items-center gap-2 px-4 py-2.5 text-purple-600 font-body text-sm">
                              <Loader2 size={14} className="animate-spin" /> Transcription Whisper...
                            </div>
                          )}
                          {transcript && !loading && !isRec && (
                            <button onClick={() => analyserBilanIA(child, creneau)}
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer"
                              style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                              <Sparkles size={14} /> Analyser avec l'IA
                            </button>
                          )}
                          {loading && transcript && (
                            <div className="flex items-center gap-2 px-4 py-2.5 text-purple-600 font-body text-sm">
                              <Loader2 size={14} className="animate-spin" /> Analyse IA...
                            </div>
                          )}
                        </div>

                        {/* Indicateur enregistrement */}
                        {isRec && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                            <span className="font-body text-xs text-red-600">Enregistrement en cours — parlez naturellement, appuyez Arrêter quand terminé</span>
                          </div>
                        )}

                        {/* Zone transcript */}
                        <textarea
                          value={transcript}
                          onChange={e => setTranscripts(prev => ({ ...prev, [child.childId]: e.target.value }))}
                          placeholder={isRec ? "🎙️ Enregistrement..." : "Le transcript apparaîtra ici après dictée, ou tapez directement..."}
                          rows={3}
                          className={`w-full px-3 py-2.5 rounded-xl border font-body text-sm bg-white focus:outline-none resize-none transition-all ${isRec ? "border-red-200 bg-red-50/20" : "border-gray-200 focus:border-purple-400"}`}
                        />
                      </div>
                    )}

                    {/* Résultat bilan IA */}
                    {bilan && (
                      <div className="flex flex-col gap-3">
                        <div className="bg-purple-50 rounded-xl p-3 flex flex-col gap-2">
                          {bilan.note.pointsForts && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">✅ Points forts</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.pointsForts}</div>
                            </div>
                          )}
                          {bilan.note.aTravailler && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-orange-500 uppercase tracking-wider mb-0.5">🔧 À travailler</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.aTravailler}</div>
                            </div>
                          )}
                          {bilan.note.objectifSuivant && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-0.5">🎯 Prochain objectif</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.objectifSuivant}</div>
                            </div>
                          )}
                        </div>
                        {/* Mises à jour détectées */}
                        <div className="flex flex-wrap gap-1.5">
                          {bilan.galopUpdate && <Badge color="blue">📈 Niveau → {bilan.galopUpdate}</Badge>}
                          {bilan.objectifsAValider?.length > 0 && <Badge color="green">✓ {bilan.objectifsAValider.length} objectif(s) validé(s)</Badge>}
                          {bilan.nouvelObjectif && <Badge color="purple">+ Nouvel objectif</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveBilanIA(child, bilan)}
                            className="flex-1 py-2 rounded-xl font-body text-sm font-semibold text-white bg-green-500 border-none cursor-pointer hover:bg-green-600">
                            ✓ Enregistrer
                          </button>
                          <button onClick={() => { setIaBilans(prev => { const n={...prev}; delete n[child.childId]; return n; }); }}
                            className="px-4 py-2 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">
                            Modifier
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Note manuelle si pas de dictée */}
                    {!transcript && !bilan && (
                      <div className="mt-2">
                        <input
                          value={quickNotes[child.childId] || ""}
                          onChange={e => setQuickNotes({ ...quickNotes, [child.childId]: e.target.value })}
                          placeholder="Ou saisir une note rapide sans IA..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-100 font-body text-xs bg-gray-50 focus:border-blue-300 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => { stopRecording(); setQuickNoteChild(null); setQuickNotes({}); setTranscripts({}); setIaBilans({}); }}
                className="flex-1 py-2.5 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">Fermer</button>
              <button onClick={saveQuickNotes}
                className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-500 bg-blue-50 border-none cursor-pointer hover:bg-blue-100">
                Enregistrer les notes manuelles
              </button>
            </div>
          </div>
        </div>
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
  );
}
