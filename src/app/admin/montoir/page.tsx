"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { collection, getDocs, getDoc, updateDoc, addDoc, doc, query, where, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validateChildrenUpdate } from "@/lib/utils";

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
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Printer, ClipboardList, Mic, MicOff, Sparkles,
} from "lucide-react";

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
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return d; }, [dayOffset]);
  const dateStr = currentDay.toISOString().split("T")[0];

  const fetchData = async () => {
    try {
      const [cSnap, eSnap, iSnap, cartSnap, famSnap, centreSnap] = await Promise.all([
        getDocs(query(collection(db,"creneaux"),where("date","==",dateStr))),
        getDocs(collection(db,"equides")),
        getDocs(collection(db,"indisponibilites")),
        getDocs(collection(db,"cartes")),
        getDocs(collection(db,"families")),
        getDoc(doc(db,"settings","centre")),
      ]);
      if (centreSnap.exists()) {
        const d = centreSnap.data() as any;
        setSeuilPoney({
          orange: d.seuilPoneyOrange || 3,
          rouge: d.seuilPoneyRouge || 4,
          heures: d.seuilPoneyHeures || 4,
        });
      }
      const creneauxData = cSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>a.startTime.localeCompare(b.startTime)) as Creneau[];
      setCreneaux(creneauxData);
      setEquides(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      setIndisponibilites(iSnap.docs.map(d=>({id:d.id,...d.data()})));
      setCartes(cartSnap.docs.map(d=>({id:d.id,...d.data()})));
      setFamilies(famSnap.docs.map(d=>({id:d.id,...d.data()})));

      // Contexte agent — données montoir du jour
      setAgentContext({
        creneaux_du_jour: creneauxData.map((c: any) => ({
          id: c.id,
          titre: c.activityTitle,
          heure: `${c.startTime}-${c.endTime}`,
          inscrits: (c.enrolled||[]).length,
          presents: (c.enrolled||[]).filter((e:any) => e.presence === "present").length,
          absents: (c.enrolled||[]).filter((e:any) => e.presence === "absent").length,
          non_pointes: (c.enrolled||[]).filter((e:any) => !e.presence).length,
          statut: c.status || "planned",
        })),
        a_cloturer: creneauxData.filter((c: any) => c.status !== "closed").length,
      });
    } catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [dayOffset]);

  // Liste des équidés disponibles (pas sortis, pas indisponibles)
  const availableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    }).map((i: any) => i.equideId);

    return equides
      .filter(e => e.status !== "sorti" && e.status !== "deces" && !activeIndispos.includes(e.id))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [equides, indisponibilites, dateStr]);

  const unavailableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    });
    return activeIndispos.map((i: any) => {
      const eq = equides.find(e => e.id === i.equideId);
      return { name: eq?.name || "?", reason: i.motif || "Indisponible" };
    });
  }, [equides, indisponibilites, dateStr]);

  const updateEnrolled = async (cid: string, enrolled: any[]) => { await updateDoc(doc(db,"creneaux",cid),{enrolled}); fetchData(); };
  const togglePresence = (c: Creneau, childId: string, val: string) => { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, presence: val} : e)); };
  // ── Charge journalière des poneys (nb séances + nb heures aujourd'hui) ──────
  const poneyCharge = useMemo(() => {
    const charge: Record<string, { seances: number; heures: number }> = {};
    creneaux.forEach(c => {
      if (c.status === "closed") return; // compter aussi les clôturées
      const dur = (() => {
        const [sh, sm] = (c.startTime || "00:00").split(":").map(Number);
        const [eh, em] = (c.endTime || "00:00").split(":").map(Number);
        return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      })();
      (c.enrolled || []).forEach((e: any) => {
        if (!e.horseName) return;
        if (!charge[e.horseName]) charge[e.horseName] = { seances: 0, heures: 0 };
        charge[e.horseName].seances++;
        charge[e.horseName].heures += dur;
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
  const [recording, setRecording] = useState<string | null>(null); // childId en cours d'enregistrement
  const [transcripts, setTranscripts] = useState<Record<string, string>>({}); // childId → texte dicté
  const [iaLoading, setIaLoading] = useState<Record<string, boolean>>({}); // childId → loading
  const [iaBilans, setIaBilans] = useState<Record<string, any>>({}); // childId → bilan structuré
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const closeCreneau = async (cid: string) => {
    const c = creneaux.find(x => x.id === cid);
    if (!c) return;
    // Anti-duplication : si déjà clôturé, ne rien faire
    if (c.status === "closed") { toast("Cette reprise est déjà clôturée.", "warning"); return; }

    const presents = (c.enrolled || []).filter((e: any) => e.presence === "present");
    const absents = (c.enrolled || []).filter((e: any) => e.presence === "absent");
    const nonPointes = (c.enrolled || []).filter((e: any) => !e.presence);

    if (nonPointes.length > 0) {
      if (!confirm(`${nonPointes.length} cavalier${nonPointes.length > 1 ? "s" : ""} non pointé${nonPointes.length > 1 ? "s" : ""}.\n\nClôturer quand même ?`)) return;
    }

    const msg = `Clôturer "${c.activityTitle}" (${c.startTime}) ?\n\n` +
      `${presents.length} présent${presents.length > 1 ? "s" : ""}, ${absents.length} absent${absents.length > 1 ? "s" : ""}`;
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
          text: `Séance : ${c.activityTitle} (${c.startTime}-${c.endTime})${child.horseName ? ` — Poney : ${child.horseName}` : ""}`,
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
      if (!carteId && (child as any).paymentSource !== "card") {
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

        // Calculer la fin du trimestre en cours
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const trimestreEnd = new Date(now.getFullYear(), Math.ceil((currentMonth + 1) / 3) * 3, 0); // dernier jour du trimestre

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
          usedOnCreneauId: null,
          usedOnDate: null,
          expiryDate: trimestreEnd.toISOString().split("T")[0],
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
    if (rattrapagesCreated > 0) parts.push(`${rattrapagesCreated} rattrapage${rattrapagesCreated > 1 ? "s" : ""} créé${rattrapagesCreated > 1 ? "s" : ""}.`);
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
      const res = await fetch("/api/whisper", { method: "POST", body: formData });
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
      const res = await fetch("/api/ia", {
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
  const totalP = creneaux.reduce((s,c)=>s+(c.enrolled||[]).filter((e:any)=>e.presence==="present").length,0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="font-display text-2xl font-bold text-blue-800">Montoir</h1><p className="font-body text-xs text-slate-600">Présences · Affectation poneys · Clôture reprises</p></div>
        <button onClick={()=>window.print()} className="flex items-center gap-2 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><Printer size={16} /> Imprimer</button>
      </div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Veille</button>
        <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-slate-600">{creneaux.length} reprise{creneaux.length>1?"s":""} · {totalE} inscrits · {totalP} présents</div></div>
        <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain <ChevronRight size={16} /></button></div>
      </div>
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      <>
      {/* Charge journalière poneys */}
      {equides.length > 0 && Object.keys(poneyCharge).length > 0 && (
        <Card padding="sm" className="mb-3">
          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Charge poneys aujourd'hui</div>
          <div className="flex flex-wrap gap-1.5">
            {availableHorses.map(h => {
              const ch = poneyCharge[h.name];
              if (!ch) return <span key={h.id} className="font-body text-[10px] px-2 py-1 rounded-lg bg-green-50 text-green-700">{h.name} 0s</span>;
              const color = ch.seances >= seuilPoney.rouge ? "bg-red-50 text-red-600" : ch.seances >= seuilPoney.orange ? "bg-orange-50 text-orange-600" : ch.seances >= 2 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700";
              const heuresAlert = ch.heures >= seuilPoney.heures;
              return <span key={h.id} className={`font-body text-[10px] px-2 py-1 rounded-lg font-semibold ${color}`}>{h.name} {ch.seances}s·{ch.heures}h{heuresAlert ? " ⚠️" : ""}</span>;
            })}
            {unavailableHorses.map((h, i) => (
              <span key={i} className="font-body text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-400 line-through">{h.name}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Vue timeline charge poneys */}
      {equides.length > 0 && creneaux.some(c => (c.enrolled || []).some((e: any) => e.horseName)) && (
        <div className="mb-4">
          <PoneyChargeView creneaux={creneaux} equides={equides} availableHorses={availableHorses} />
        </div>
      )}

      {/* Équidés disponibles / indisponibles */}
      {equides.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
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
      <div className="flex flex-col gap-6">{creneaux.map(c => { const en = c.enrolled||[]; const col = typeColors[c.activityType]||"#666"; const closed = c.status==="closed"; const pres = en.filter((e:any)=>e.presence==="present").length; return (
        <Card key={c.id} padding="md" className={closed ? "border-gray-200 bg-gray-50/50" : ""}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-blue-500/8">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px]" style={{color:"#475569"}}>{c.endTime}</div></div>
              <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs" style={{color:"#334155"}}>{c.monitor} · {en.length}/{c.maxPlaces}</div></div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge color={closed?"gray":pres===en.length&&en.length>0?"green":"orange"}>{closed?"Clôturée":`${pres}/${en.length} présents`}</Badge>
              {!closed && (
                <button onClick={()=>toggleRotationPoneys(c)}
                  title="Rotation poneys : même poney autorisé sur deux stages simultanés (fait 1h dans chacun)"
                  className={`flex items-center gap-1.5 font-body text-xs px-2.5 py-1.5 rounded-lg border-none cursor-pointer transition-all ${c.rotationPoneys ? "bg-green-100 text-green-700 font-semibold" : "bg-gray-100 text-gray-400"}`}>
                  🔄 Rotation{c.rotationPoneys ? " ✓" : ""}
                </button>
              )}
              {!closed && en.length>0 && <>
                <button onClick={async () => {
                  const recipients = new Map<string, { email: string; parentName: string; children: string[] }>();
                  en.forEach((e: any) => {
                    const fam = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === e.childId));
                    if (fam?.parentEmail) {
                      const key = fam.parentEmail;
                      if (!recipients.has(key)) recipients.set(key, { email: key, parentName: fam.parentName || "", children: [] });
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
                      fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: r.email, ...emailData }) }).catch(e => console.warn("Email:", e));
                      sent++;
                    } catch (e) { console.error(e); }
                  }
                  toast(`${sent} rappel${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}`, "success");
                }} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Rappeler</button>
                <button onClick={()=>closeCreneau(c.id)} className="font-body text-xs font-semibold text-slate-600 bg-sand px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">Clôturer</button>
              </>}
            </div>
          </div>
          {en.length===0 ? <p className="font-body text-sm text-slate-600 italic">Aucun inscrit</p> :
          <div>
            <div className="flex items-center px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-wider" style={{color:"#334155"}}>
              <span className="w-8 hidden sm:block">#</span><span className="flex-1">Cavalier</span><span className="w-32 hidden sm:block">Famille</span><span className="w-28 sm:w-36">Poney</span><span className="w-20 sm:w-24 text-center">Présence</span>
            </div>
            {en.map((e:any, i:number) => (
              <div key={e.childId} className={`flex items-center px-3 py-2.5 rounded-lg ${i%2===0?"bg-sand":""} ${e.presence==="absent"?"opacity-40":""}`}>
                <span className="w-8 font-body text-xs hidden sm:block" style={{color:"#475569"}}>{i+1}</span>
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">
                  {e.childName}
                  {(() => { const fam = families.find((f:any) => (f.children||[]).some((c:any)=>c.id===e.childId)); const child = (fam?.children||[]).find((c:any)=>c.id===e.childId); const age = calcAge(child?.birthDate); return age ? <span className="ml-1.5 font-body text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{age}</span> : null; })()}
                </span>
                <span className="w-32 font-body text-xs hidden sm:block" style={{color:"#334155"}}>{e.familyName}</span>
                <span className="w-28 sm:w-36">{!closed ? (() => {
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
                    <div className="w-28 sm:w-36 flex flex-col gap-1">
                      <select value={e.horseName||""} onChange={ev=>assignHorse(c,e.childId,ev.target.value)} className="px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white w-full">
                        <option value="">Affecter...</option>
                        {availableHorses.map(h => {
                          const usedHere = usedInThis.has(h.name);
                          const usedOther = usedElsewhere.has(h.name);
                          const blockedOther = usedOther && !c.rotationPoneys;
                          const charge = poneyCharge[h.name];
                          const chargeStr = charge ? ` (${charge.seances}s)` : "";
                          return <option key={h.id} value={h.name} disabled={usedHere || blockedOther}
                            style={usedHere || blockedOther ? {color:"#ccc"} : charge?.seances >= seuilPoney.orange ? {color:"#f59e0b"} : {}}>
                            {h.name}{chargeStr}{usedHere ? " ✗" : blockedOther ? " ✗" : usedOther ? " ↺" : ""}
                          </option>;
                        })}
                      </select>
                      {/* Historique 4 derniers poneys du cavalier */}
                      {(childHorseHistory[e.childId] || []).length > 0 && (
                        <div className="font-body text-[9px] text-slate-400 truncate" title={`Historique : ${childHorseHistory[e.childId].join(" → ")}`}>
                          ↺ {childHorseHistory[e.childId].join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })() : <span className="font-body text-xs font-semibold text-blue-800">{e.horseName||"—"}</span>}</span>
                <span className="w-20 sm:w-24 flex justify-center gap-1 sm:gap-2">{!closed ? <>
                  <button onClick={()=>togglePresence(c,e.childId,"present")} className={`w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="present"?"bg-green-500 text-white":"bg-gray-100 text-slate-600 hover:bg-green-100"}`}><CheckCircle2 size={18}/></button>
                  <button onClick={()=>togglePresence(c,e.childId,"absent")} className={`w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent"?"bg-red-500 text-white":"bg-gray-100 text-slate-600 hover:bg-red-100"}`}><XCircle size={18}/></button>
                </> : <Badge color={e.presence==="present"?"green":e.presence==="absent"?"red":"gray"}>{e.presence==="present"?"Présent":e.presence==="absent"?"Absent":"—"}</Badge>}</span>
              </div>
            ))}
          </div>}
        </Card>); })}</div>}
      </>}

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
                        {child.horseName && <Badge color="blue">🐴 {child.horseName}</Badge>}
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
    </div>
  );
}
