"use client";
import { useState, useMemo } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, Printer, Save, LayoutTemplate } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine, ModelePlanning, TacheModele } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte, fmtDuree } from "./types";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  tachesType: TacheType[];
  salaries: Salarie[];
  creneaux: any[];
  modeles: ModelePlanning[];
  onRefresh: () => void;
}

const TIME_SLOTS = Array.from({length: (20-7)*4+1}, (_,i) => {
  const totalMin = 7*60 + i*15;
  return `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
});

function heureToMin(h: string) { const [hh,mm] = h.split(":").map(Number); return hh*60+mm; }
function minToHeure(m: number) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

const COULEURS_SALARIE = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151"];

export default function TabPlanning({ semaine, setSemaine, taches, tachesType, salaries, creneaux, modeles, onRefresh }: Props) {
  const { toast } = useToast();
  const [addCell, setAddCell] = useState<{ salarieId: string; jour: JourSemaine } | null>(null);
  const [addForm, setAddForm] = useState({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30, joursSelectionnes: [] as JourSemaine[], enchainer: false });
  const [saving, setSaving] = useState(false);
  const [showApplyModele, setShowApplyModele] = useState(false);
  const [showSaveModele, setShowSaveModele] = useState(false);
  const [saveModeleName, setSaveModeleName] = useState("");
  const [saveModeleType, setSaveModeleType] = useState<"scolaire" | "vacances" | "autre">("scolaire");
  const [applyingModele, setApplyingModele] = useState(false);
  const [view, setView] = useState<"tableau" | "timeline" | "journalier" | "fiche">("tableau");
  const [selectedDay, setSelectedDay] = useState<JourSemaine>(() => {
    const dayIndex = (new Date().getDay() + 6) % 7; // 0=lundi
    return JOURS[Math.min(dayIndex, 4)] as JourSemaine; // cap à vendredi
  });
  const [selectedSalarieId, setSelectedSalarieId] = useState<string>("");
  const [joursTravailles, setJoursTravailles] = useState<JourSemaine[]>(["lundi","mardi","mercredi","jeudi","vendredi"]);

  const lundi = getLundideSemaine(semaine);

  const prevWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()-7);
    const iso = getISO(d); setSemaine(iso);
  };
  const nextWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()+7);
    setSemaine(getISO(d));
  };
  function getISO(date: Date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate()+3-((d.getDay()+6)%7));
    const w1 = new Date(d.getFullYear(),0,4);
    const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
    return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
  }

  const jourDates = JOURS.map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate()+i);
    return { jour: j, date: d, label: `${JOURS_LABELS[j]} ${formatDateCourte(d)}` };
  });

  // Ouvrir le formulaire d'ajout
  const openAdd = (salarieId: string, jour: JourSemaine) => {
    const defaultTache = tachesType.find(t => t.joursDefaut?.includes(jour));

    // Calculer l'heure de début = fin de la dernière tâche de ce salarié ce jour
    const existingTaches = taches
      .filter(t => t.salarieId === salarieId && t.jour === jour)
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
    
    let heureDebut = "08:00";
    if (existingTaches.length > 0) {
      const last = existingTaches[existingTaches.length - 1];
      heureDebut = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
    }

    // Si la tâche a des horaires standards, prendre le premier qui est >= heureDebut calculée
    const horairesStd = defaultTache?.horairesDefaut?.sort() || [];
    if (horairesStd.length > 0) {
      const debutMin = heureToMin(heureDebut);
      const nextHoraire = horairesStd.find(h => heureToMin(h) >= debutMin);
      if (nextHoraire) heureDebut = nextHoraire;
    }

    setAddForm({
      tacheTypeId: defaultTache?.id || (tachesType[0]?.id || ""),
      heureDebut,
      dureeMinutes: defaultTache?.dureeMinutes || 30,
      joursSelectionnes: [] as JourSemaine[],
      enchainer: false,
    });
    setAddCell({ salarieId, jour });
  };

  const addTache = async () => {
    if (!addCell || !addForm.tacheTypeId) return;
    setSaving(true);
    const tt = tachesType.find(t => t.id === addForm.tacheTypeId)!;
    const sal = salaries.find(s => s.id === addCell.salarieId)!;
    const joursToAdd: JourSemaine[] = addForm.joursSelectionnes.length > 0
      ? addForm.joursSelectionnes
      : [addCell.jour];

    try {
      const batch: Promise<any>[] = [];
      const details: string[] = [];
      for (const jour of joursToAdd) {
        // Calculer l'heure de début pour ce jour
        let heureDebut = addForm.heureDebut;
        if (addForm.enchainer && joursToAdd.length > 1) {
          const jourTaches = taches
            .filter(t => t.salarieId === addCell.salarieId && t.jour === jour)
            .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
          if (jourTaches.length > 0) {
            const last = jourTaches[jourTaches.length - 1];
            heureDebut = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
          }
        }

        details.push(`${JOURS_LABELS[jour].slice(0, 3)} ${heureDebut}`);

        batch.push(addDoc(collection(db, "taches-planifiees"), {
          tacheTypeId: addForm.tacheTypeId,
          tacheLabel: tt.label,
          categorie: tt.categorie,
          salarieId: addCell.salarieId,
          salarieName: sal?.nom || "",
          jour,
          heureDebut,
          dureeMinutes: addForm.dureeMinutes || tt.dureeMinutes,
          semaine,
          done: false,
          createdAt: serverTimestamp(),
        }));
      }
      await Promise.all(batch);
      if (joursToAdd.length > 1) {
        toast(`${tt.label} ajoutée : ${details.join(", ")}`, "success");
      }
      setAddCell(null);
      onRefresh();
    } catch(e:any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  const toggleDone = async (t: TachePlanifiee) => {
    await updateDoc(doc(db, "taches-planifiees", t.id), { done: !t.done, updatedAt: serverTimestamp() });
    onRefresh();
  };

  const delTache = async (t: TachePlanifiee) => {
    await deleteDoc(doc(db, "taches-planifiees", t.id));
    onRefresh();
  };

  // ── Sauvegarder la semaine comme modèle ─────────────────────────────
  const handleSaveAsModele = async () => {
    if (!saveModeleName.trim()) { toast("Nom du modèle requis", "error"); return; }
    if (taches.length === 0) { toast("La semaine est vide, rien à sauvegarder", "error"); return; }
    setSaving(true);
    try {
      const tachesModele: TacheModele[] = taches.map(t => ({
        tacheTypeId: t.tacheTypeId,
        tacheLabel: t.tacheLabel,
        categorie: t.categorie,
        salarieId: t.salarieId,
        salarieName: t.salarieName,
        jour: t.jour,
        heureDebut: t.heureDebut,
        dureeMinutes: t.dureeMinutes,
        notes: t.notes,
      }));

      const COULEURS_TYPE = { scolaire: "#2050A0", vacances: "#d97706", autre: "#6b7280" };
      await addDoc(collection(db, "modeles-planning"), {
        nom: saveModeleName.trim(),
        description: `Créé depuis la semaine ${semaine}`,
        type: saveModeleType,
        couleur: COULEURS_TYPE[saveModeleType],
        taches: tachesModele,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast(`Modèle "${saveModeleName}" créé avec ${tachesModele.length} tâches`, "success");
      setShowSaveModele(false);
      setSaveModeleName("");
      onRefresh();
    } catch (e: any) {
      toast("Erreur lors de la sauvegarde", "error");
    }
    setSaving(false);
  };

  // ── Appliquer un modèle sur la semaine courante ─────────────────────
  const handleApplyModele = async (modele: ModelePlanning) => {
    const msg = taches.length > 0
      ? `Appliquer "${modele.nom}" sur la semaine ${semaine} ?\n\nLes ${taches.length} tâches existantes seront conservées, les tâches du modèle seront AJOUTÉES.`
      : `Appliquer "${modele.nom}" sur la semaine ${semaine} ?`;
    if (!confirm(msg)) return;

    setApplyingModele(true);
    try {
      let count = 0;
      // Batch par groupes de 50
      for (let i = 0; i < modele.taches.length; i += 50) {
        const chunk = modele.taches.slice(i, i + 50);
        const promises = chunk.map(t =>
          addDoc(collection(db, "taches-planifiees"), {
            tacheTypeId: t.tacheTypeId,
            tacheLabel: t.tacheLabel,
            categorie: t.categorie,
            salarieId: t.salarieId,
            salarieName: t.salarieName,
            jour: t.jour,
            heureDebut: t.heureDebut,
            dureeMinutes: t.dureeMinutes,
            notes: t.notes || "",
            semaine,
            done: false,
            createdAt: serverTimestamp(),
          })
        );
        await Promise.all(promises);
        count += chunk.length;
      }

      toast(`Modèle "${modele.nom}" appliqué : ${count} tâches ajoutées`, "success");
      setShowApplyModele(false);
      onRefresh();
    } catch (e: any) {
      toast("Erreur lors de l'application du modèle", "error");
    }
    setApplyingModele(false);
  };

  // Calcul charge par salarié (minutes totales / semaine)
  // Charge par salarié = temps effectif (début première tâche → fin dernière tâche) - pauses
  const joursActifs = JOURS.slice(0, 6) as JourSemaine[];
  const chargeParSalarie = useMemo(() => {
    const map: Record<string, number> = {};
    const salIds = [...new Set(taches.map(t => t.salarieId))];
    for (const salId of salIds) {
      let totalEffectif = 0;
      for (const jour of joursActifs) {
        const jourTaches = taches
          .filter(t => t.salarieId === salId && t.jour === jour)
          .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
        if (jourTaches.length === 0) continue;

        // Amplitude = début première → fin dernière
        const debutJour = heureToMin(jourTaches[0].heureDebut);
        const lastTache = jourTaches[jourTaches.length - 1];
        const finJour = heureToMin(lastTache.heureDebut) + lastTache.dureeMinutes;
        const amplitude = finJour - debutJour;

        // Soustraire les pauses
        const pausesMinutes = jourTaches
          .filter(t => t.categorie === "pause")
          .reduce((s, t) => s + t.dureeMinutes, 0);

        totalEffectif += Math.max(0, amplitude - pausesMinutes);
      }
      map[salId] = totalEffectif;
    }
    return map;
  }, [taches]);

  // ── Importer les cours/stages du planning dans les tâches ───────────────
  const [importing, setImporting] = useState(false);

  const handleImportCreneaux = async () => {
    // Calculer les dates de la semaine
    const dates = jourDates.slice(0, 6).map(({ jour, date }) => ({
      jour,
      dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    }));

    // Trouver les créneaux de la semaine qui ont un moniteur correspondant à un salarié
    const matchedCreneaux: { creneau: any; salarieId: string; salarieName: string; jour: JourSemaine }[] = [];

    for (const { jour, dateStr } of dates) {
      const dayCr = creneaux.filter(c => c.date === dateStr && c.monitor);
      for (const c of dayCr) {
        // Matcher le moniteur du créneau avec un salarié (comparaison souple)
        const monitorLower = (c.monitor || "").toLowerCase().trim();
        const sal = salaries.find(s =>
          s.actif && s.nom.toLowerCase().trim() === monitorLower
        );
        if (sal) {
          // Vérifier qu'il n'existe pas déjà une tâche identique
          const alreadyExists = taches.some(t =>
            t.salarieId === sal.id &&
            t.jour === jour &&
            t.heureDebut === c.startTime &&
            t.tacheLabel === c.activityTitle
          );
          if (!alreadyExists) {
            matchedCreneaux.push({ creneau: c, salarieId: sal.id, salarieName: sal.nom, jour });
          }
        }
      }
    }

    if (matchedCreneaux.length === 0) {
      toast("Aucun nouveau cours/stage à importer cette semaine (déjà importés ou aucun moniteur correspondant)", "info");
      return;
    }

    const confirmed = confirm(
      `Importer ${matchedCreneaux.length} cours/stages du planning ?\n\n` +
      matchedCreneaux.slice(0, 8).map(m =>
        `• ${JOURS_LABELS[m.jour]} ${m.creneau.startTime}→${m.creneau.endTime} : ${m.creneau.activityTitle} (${m.salarieName})`
      ).join("\n") +
      (matchedCreneaux.length > 8 ? `\n… et ${matchedCreneaux.length - 8} autres` : "")
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const batch: Promise<any>[] = [];
      for (const { creneau, salarieId, salarieName, jour } of matchedCreneaux) {
        const startMin = heureToMin(creneau.startTime);
        const endMin = heureToMin(creneau.endTime);
        const duree = endMin - startMin;

        batch.push(addDoc(collection(db, "taches-planifiees"), {
          tacheTypeId: "__planning__",
          tacheLabel: creneau.activityTitle,
          categorie: "animation" as any,
          color: creneau.color || "",
          salarieId,
          salarieName,
          jour,
          heureDebut: creneau.startTime,
          dureeMinutes: duree > 0 ? duree : 60,
          semaine,
          done: false,
          notes: `${creneau.activityType || ""} · ${(creneau.enrolled || []).length}/${creneau.maxPlaces || "?"} inscrits`,
          createdAt: serverTimestamp(),
        }));
      }
      await Promise.all(batch);
      toast(`${matchedCreneaux.length} cours/stages importés du planning`, "success");
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast("Erreur lors de l'import", "error");
    }
    setImporting(false);
  };

  const getCat = (cat: string) => CATEGORIES.find(c => c.id === cat);
  // Couleur de la tâche : couleur custom (import planning) > couleur catégorie > fallback
  const getTaskColor = (t: TachePlanifiee) => (t as any).color || getCat(t.categorie)?.color || "#64748b";

  // ── Détection automatique des tâches obligatoires manquantes ───────────
  const tachesObligatoires = tachesType.filter(t => t.obligatoire);

  const tachesManquantes = useMemo(() => {
    const manquantes: { tache: TacheType; jour: JourSemaine }[] = [];
    for (const tt of tachesObligatoires) {
      // Jours attendus : joursObligatoires > joursDefaut > lun-ven
      const joursConfig = (tt.joursObligatoires && tt.joursObligatoires.length > 0)
        ? tt.joursObligatoires
        : (tt.joursDefaut && tt.joursDefaut.length > 0)
          ? tt.joursDefaut
          : JOURS.slice(0, 5) as JourSemaine[];
      // Filtrer par les jours réellement travaillés cette semaine
      const joursAttendus = joursConfig.filter(j => joursTravailles.includes(j));
      for (const jour of joursAttendus) {
        const exists = taches.some(t => t.tacheTypeId === tt.id && t.jour === jour);
        const existsByLabel = taches.some(t => t.tacheLabel === tt.label && t.jour === jour);
        if (!exists && !existsByLabel) {
          manquantes.push({ tache: tt, jour });
        }
      }
    }
    return manquantes;
  }, [taches, tachesObligatoires, joursTravailles]);

  // ── Détection des conflits horaires (même salarié, même jour, chevauchement) ─
  interface Conflit {
    salarieName: string;
    salarieId: string;
    jour: JourSemaine;
    tache1: TachePlanifiee;
    tache2: TachePlanifiee;
  }

  const conflits = useMemo(() => {
    const result: Conflit[] = [];
    const salIds = [...new Set(taches.map(t => t.salarieId))];
    for (const salId of salIds) {
      for (const jour of joursActifs) {
        const jourTaches = taches
          .filter(t => t.salarieId === salId && t.jour === jour)
          .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
        for (let i = 0; i < jourTaches.length; i++) {
          const t1 = jourTaches[i];
          const fin1 = heureToMin(t1.heureDebut) + t1.dureeMinutes;
          for (let j = i + 1; j < jourTaches.length; j++) {
            const t2 = jourTaches[j];
            const debut2 = heureToMin(t2.heureDebut);
            if (debut2 < fin1) {
              // Chevauchement détecté
              result.push({
                salarieName: t1.salarieName,
                salarieId: salId,
                jour,
                tache1: t1,
                tache2: t2,
              });
            }
          }
        }
      }
    }
    return result;
  }, [taches]);

  // ── Vérification IA complète ──────────────────────────────────────────
  const [iaChecking, setIaChecking] = useState(false);
  const [iaResult, setIaResult] = useState<string | null>(null);

  const handleIACheck = async () => {
    setIaChecking(true);
    setIaResult(null);
    try {
      const planningResume = joursActifs.map(jour => {
        const jourTaches = taches.filter(t => t.jour === jour);
        return `${JOURS_LABELS[jour]} :\n` + (jourTaches.length === 0
          ? "  (aucune tâche)"
          : jourTaches.map(t => `  - ${t.tacheLabel} → ${t.salarieName} (${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)})`).join("\n"));
      }).join("\n");

      const obligatoiresListe = tachesObligatoires.map(t =>
        `- ${t.label} (${t.categorie}, ${fmtDuree(t.dureeMinutes)}, jours: ${(t.joursDefaut || []).map(j => JOURS_LABELS[j].slice(0, 3)).join(", ") || "lun-ven"})`
      ).join("\n");

      const salariesListe = salaries.filter(s => s.actif).map(s => s.nom).join(", ");

      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question: `Tu es l'assistant de gestion du centre équestre. Vérifie ce planning hebdomadaire de l'équipe.

SALARIÉS ACTIFS : ${salariesListe}

TÂCHES OBLIGATOIRES (doivent être assignées chaque jour prévu) :
${obligatoiresListe || "(aucune tâche marquée obligatoire)"}

PLANNING DE LA SEMAINE ${semaine} :
${planningResume}

TÂCHES MANQUANTES DÉTECTÉES AUTOMATIQUEMENT : ${tachesManquantes.length === 0 ? "Aucune" : tachesManquantes.map(m => `${m.tache.label} le ${JOURS_LABELS[m.jour]}`).join(", ")}

Analyse ce planning et donne :
1. ✅ Ce qui est bien couvert
2. ⚠️ Les tâches obligatoires manquantes ou incomplètes
3. 💡 Des suggestions d'amélioration (charge équilibrée, tâches oubliées, surcharge d'un salarié)

Réponds de façon concise et pratique, en français.`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIaResult(data.response || data.text || "Pas de réponse");
      } else {
        setIaResult("Erreur lors de la vérification IA");
      }
    } catch (e) {
      setIaResult("Erreur de connexion à l'IA");
    }
    setIaChecking(false);
  };

  // ── Vue tableau ──────────────────────────────────────────────────────────
  const TableauView = () => (
    <div style={{overflowX:"auto", margin:"0 -16px", padding:"0 16px"}}>
      <table style={{width:"100%", borderCollapse:"collapse", tableLayout:"fixed"}}>
        <colgroup>
          <col style={{width:"10%", minWidth:80}} />
          {jourDates.slice(0,6).map(({jour}) => <col key={jour} style={{width:"15%"}} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{padding:"6px 6px", textAlign:"left", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
              Salarié
            </th>
            {jourDates.slice(0,6).map(({jour, label}) => (
              <th key={jour} style={{padding:"6px 3px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {salaries.filter(s=>s.actif).map((sal, si) => (
            <tr key={sal.id} style={{background: si%2===0?"#f8faff":"#fff"}}>
              <td style={{padding:"6px 6px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                <div style={{display:"flex", alignItems:"center", gap:4}}>
                  <div style={{width:7, height:7, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                  <span style={{fontFamily:"sans-serif", fontSize:11, fontWeight:700, color:"#1e293b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{sal.nom}</span>
                </div>
                <div style={{fontFamily:"sans-serif", fontSize:9, color:"#94a3b8", marginTop:2}}>
                  {fmtDuree(chargeParSalarie[sal.id]||0)} cette sem.
                </div>
              </td>
              {jourDates.slice(0,6).map(({jour}) => {
                const cellTaches = taches.filter(t => t.salarieId===sal.id && t.jour===jour).sort((a,b) => a.heureDebut.localeCompare(b.heureDebut));
                return (
                  <td key={jour} style={{padding:"3px 3px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                    <div style={{display:"flex", flexDirection:"column", gap:3}}>
                      {cellTaches.map(t => {
                        const cat = getCat(t.categorie);
                        return (
                          <div key={t.id} title={`${t.tacheLabel}\n${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}${t.notes ? "\n" + t.notes : ""}`} style={{
                            display:"flex", alignItems:"flex-start", gap:3, padding:"3px 5px",
                            borderRadius:6, background: t.done ? "#f0fdf4" : (getTaskColor(t)+"18"),
                            border:`1px solid ${getTaskColor(t)+"30"}`,
                            opacity: t.done ? 0.6 : 1,
                          }}>
                            <span style={{fontSize:10, marginTop:1}}>{cat?.emoji}</span>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{fontFamily:"sans-serif", fontSize:10, fontWeight:600, color: t.done?"#16a34a":getTaskColor(t), textDecoration:t.done?"line-through":"none", lineHeight:"1.3", wordBreak:"break-word"}}>
                                {t.tacheLabel}
                              </div>
                              <div style={{fontFamily:"sans-serif", fontSize:8, color:"#94a3b8"}}>
                                {t.heureDebut}→{minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)} ({t.dureeMinutes<60?`${t.dureeMinutes}min`:`${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})
                              </div>
                            </div>
                            <button onClick={()=>toggleDone(t)} style={{width:18,height:18,borderRadius:4,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                              {t.done && <Check size={10} color="white"/>}
                            </button>
                            <button onClick={()=>delTache(t)} style={{width:16,height:16,borderRadius:3,border:"none",background:"transparent",cursor:"pointer",color:"#cbd5e1",padding:0,fontSize:12,lineHeight:1}}>✕</button>
                          </div>
                        );
                      })}
                      {/* Bouton ajouter */}
                      {addCell?.salarieId===sal.id && addCell?.jour===jour ? (
                        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:8,display:"flex",flexDirection:"column",gap:6}}>
                          <select value={addForm.tacheTypeId} onChange={e=>{
                            const tt=tachesType.find(t=>t.id===e.target.value);
                            const firstHoraire = tt?.horairesDefaut?.sort()[0];
                            setAddForm({...addForm, tacheTypeId:e.target.value, dureeMinutes:tt?.dureeMinutes||30, heureDebut: firstHoraire || addForm.heureDebut});
                          }} style={{width:"100%",padding:"4px 6px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:11,background:"white"}}>
                            <option value="">— Choisir une tâche —</option>
                            {CATEGORIES.map(cat => {
                              const items = tachesType.filter(t => t.categorie === cat.id);
                              if (!items.length) return null;
                              return (
                                <optgroup key={cat.id} label={`${cat.emoji} ${cat.label}`}>
                                  {items.map(t => <option key={t.id} value={t.id}>{cat.emoji} {t.label} ({t.dureeMinutes < 60 ? `${t.dureeMinutes}min` : `${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})</option>)}
                                </optgroup>
                              );
                            })}
                          </select>
                          {/* Horaires standards en raccourcis */}
                          {(() => {
                            const tt = tachesType.find(t => t.id === addForm.tacheTypeId);
                            const horaires = tt?.horairesDefaut?.sort() || [];
                            if (horaires.length === 0) return null;
                            return (
                              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                {horaires.map(h => (
                                  <button key={h} onClick={() => setAddForm({...addForm, heureDebut: h})}
                                    style={{padding:"3px 8px",borderRadius:6,border: addForm.heureDebut===h ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                                      background: addForm.heureDebut===h ? "#fffbeb" : "white",
                                      fontFamily:"sans-serif",fontSize:11,fontWeight: addForm.heureDebut===h ? 700 : 500,
                                      color: addForm.heureDebut===h ? "#b45309" : "#475569",cursor:"pointer"}}>
                                    {h}
                                  </button>
                                ))}
                                <button onClick={() => {
                                  const el = document.getElementById("_custom_hour_select") as HTMLSelectElement;
                                  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
                                }}
                                  style={{padding:"3px 6px",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",fontFamily:"sans-serif",fontSize:10,color:"#94a3b8",cursor:"pointer"}}>
                                  Autre…
                                </button>
                              </div>
                            );
                          })()}
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <select id="_custom_hour_select" value={addForm.heureDebut} onChange={e=>setAddForm({...addForm,heureDebut:e.target.value})}
                              style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white",
                                display: (tachesType.find(t=>t.id===addForm.tacheTypeId)?.horairesDefaut?.length || 0) > 0 ? "none" : "block"}}>
                              {TIME_SLOTS.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <select value={addForm.dureeMinutes} onChange={e=>setAddForm({...addForm,dureeMinutes:parseInt(e.target.value)})}
                              style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white"}}>
                              {[15,30,45,60,90,120,180,240].map(d=><option key={d} value={d}>{d<60?`${d}m`:`${d/60}h`}</option>)}
                            </select>
                            {/* Bouton enchaîner après la précédente */}
                            {(() => {
                              if (!addCell) return null;
                              const prev = taches
                                .filter(t => t.salarieId === addCell.salarieId && t.jour === addCell.jour)
                                .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                              if (prev.length === 0) return null;
                              const last = prev[prev.length - 1];
                              const finLast = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
                              return (
                                <button onClick={() => setAddForm({...addForm, heureDebut: finLast})}
                                  title={`Démarrer à ${finLast} (après ${last.tacheLabel})`}
                                  style={{padding:"3px 6px",borderRadius:6,border:"1px solid #c4b5fd",background: addForm.heureDebut === finLast ? "#ede9fe" : "white",
                                    fontFamily:"sans-serif",fontSize:9,color:"#7c3aed",cursor:"pointer",whiteSpace:"nowrap",fontWeight:600}}>
                                  ⏩ {finLast}
                                </button>
                              );
                            })()}
                          </div>
                          {/* Heure de fin calculée */}
                          {addForm.heureDebut && addForm.dureeMinutes > 0 && (
                            <div style={{fontFamily:"sans-serif",fontSize:10,color:"#3b82f6",fontWeight:600,textAlign:"center",background:"#dbeafe",borderRadius:6,padding:"3px 0"}}>
                              {addForm.heureDebut} → {minToHeure(heureToMin(addForm.heureDebut) + addForm.dureeMinutes)} ({addForm.dureeMinutes < 60 ? `${addForm.dureeMinutes}min` : `${Math.floor(addForm.dureeMinutes/60)}h${addForm.dureeMinutes%60>0?String(addForm.dureeMinutes%60).padStart(2,"0"):""}`})
                            </div>
                          )}
                          {/* Sélection des jours */}
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                              <span style={{fontFamily:"sans-serif",fontSize:9,color:"#475569",fontWeight:600}}>Jours :</span>
                              <button onClick={() => {
                                const allDays = JOURS.slice(0,6) as JourSemaine[];
                                const allSelected = allDays.every(j => addForm.joursSelectionnes.includes(j));
                                setAddForm({...addForm, joursSelectionnes: allSelected ? [] : [...allDays]});
                              }}
                                style={{fontFamily:"sans-serif",fontSize:8,color:"#3b82f6",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline",padding:0}}>
                                {JOURS.slice(0,6).every(j => addForm.joursSelectionnes.includes(j as JourSemaine)) ? "Aucun" : "Tous"}
                              </button>
                            </div>
                            <div style={{display:"flex",gap:2}}>
                              {JOURS.slice(0,6).map(j => {
                                const selected = addForm.joursSelectionnes.includes(j as JourSemaine);
                                const isCurrent = j === addCell?.jour;
                                return (
                                  <button key={j} onClick={() => {
                                    const curr = addForm.joursSelectionnes;
                                    setAddForm({...addForm, joursSelectionnes: selected ? curr.filter(x => x !== j) : [...curr, j as JourSemaine]});
                                  }}
                                    style={{
                                      padding:"3px 0", width:"100%", borderRadius:5, fontSize:9, fontWeight:selected?700:500,
                                      fontFamily:"sans-serif", cursor:"pointer",
                                      background: selected ? "#3b82f6" : isCurrent ? "#eff6ff" : "white",
                                      color: selected ? "white" : isCurrent ? "#3b82f6" : "#94a3b8",
                                      border: selected ? "1px solid #3b82f6" : isCurrent ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                                    }}>
                                    {JOURS_LABELS[j].slice(0,2)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Option enchaîner + aperçu par jour */}
                          {addForm.joursSelectionnes.length > 1 && (
                            <div>
                              <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontFamily:"sans-serif",fontSize:10,color:"#475569",marginBottom:4}}>
                                <input type="checkbox" checked={addForm.enchainer}
                                  onChange={e => setAddForm({...addForm, enchainer: e.target.checked})}
                                  style={{accentColor:"#7c3aed",width:12,height:12}} />
                                <span style={{fontWeight:600}}>⏩ Après les tâches existantes</span>
                                <span style={{color:"#94a3b8",fontWeight:400}}>(heure auto par jour)</span>
                              </label>
                              {addForm.enchainer && addCell && (
                                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                  {addForm.joursSelectionnes.sort((a,b) => JOURS.indexOf(a) - JOURS.indexOf(b)).map(j => {
                                    const jourTaches = taches
                                      .filter(t => t.salarieId === addCell.salarieId && t.jour === j)
                                      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                                    let h = addForm.heureDebut;
                                    if (jourTaches.length > 0) {
                                      const last = jourTaches[jourTaches.length - 1];
                                      h = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
                                    }
                                    return (
                                      <span key={j} style={{fontFamily:"sans-serif",fontSize:9,background:"#f3f0ff",color:"#7c3aed",padding:"2px 6px",borderRadius:5,fontWeight:600}}>
                                        {JOURS_LABELS[j].slice(0,2)} {h}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={addTache} disabled={saving||!addForm.tacheTypeId}
                              style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",
                                background: addForm.joursSelectionnes.length > 1 ? "#16a34a" : "#3b82f6",
                                color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                              {saving ? "..." : addForm.joursSelectionnes.length > 1 ? `✓ Ajouter (${addForm.joursSelectionnes.length}j)` : "✓ Ajouter"}
                            </button>
                            <button onClick={()=>setAddCell(null)}
                              style={{padding:"4px 8px",borderRadius:6,border:"none",background:"#f1f5f9",color:"#64748b",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={()=>openAdd(sal.id,jour)}
                          style={{padding:"3px 0",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",color:"#94a3b8",fontFamily:"sans-serif",fontSize:11,cursor:"pointer",width:"100%"}}>
                          + Ajouter
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Vue timeline par salarié ─────────────────────────────────────────────
  const TimelineView = () => {
    const START = 7*60, END = 20*60;
    const TOTAL = END-START;
    const HEURES = [7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const pct = (min: number) => `${((min-START)/TOTAL)*100}%`;
    const w = (dur: number) => `${Math.max((dur/TOTAL)*100, 1)}%`;
    const ROW_H = 44;
    const LABEL_W = 110;

    const printTimeline = () => {
      const printContent = document.getElementById("management-timeline-print");
      if (!printContent) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html><head><meta charset="utf-8"><title>Planning équipe — Semaine ${semaine}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; background: white; }
          h1 { font-size: 16px; font-weight: 800; color: #0C1A2E; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; margin-bottom: 16px; }
          .timeline-wrap { overflow: visible; }
          .header-row { display: flex; margin-left: ${LABEL_W}px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
          .header-h { flex: 1; font-size: 9px; font-weight: 700; color: #64748b; border-left: 1px solid #e2e8f0; padding-left: 3px; }
          .salarie-block { margin-bottom: 16px; page-break-inside: avoid; }
          .salarie-name { font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
          .salarie-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
          .salarie-charge { font-size: 10px; color: #64748b; }
          .day-row { display: flex; align-items: center; margin-bottom: 4px; }
          .day-label { width: ${LABEL_W}px; flex-shrink: 0; font-size: 10px; color: #475569; font-weight: 600; padding-right: 8px; text-align: right; }
          .day-bar { flex: 1; height: ${ROW_H}px; background: #f8faff; border-radius: 6px; position: relative; border: 1px solid #e2e8f0; overflow: visible; }
          .act-block { position: absolute; top: 0; bottom: 0; background: #dbeafe; border-right: 2px solid #93c5fd; }
          .act-label { position: absolute; top: 50%; transform: translateY(-50%); font-size: 9px; color: #1d4ed8; font-weight: 700; padding-left: 4px; white-space: nowrap; }
          .task-block { position: absolute; top: 3px; bottom: 3px; border-radius: 4px; display: flex; align-items: center; overflow: visible; }
          .task-label { font-size: 10px; color: white; font-weight: 700; padding: 0 5px; white-space: nowrap; }
          .task-time { font-size: 8px; color: rgba(255,255,255,0.8); padding-left: 4px; white-space: nowrap; flex-shrink: 0; }
          .hour-grid { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; pointer-events: none; }
          .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
          .legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: #475569; }
          .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
          @media print { body { padding: 8px; } .salarie-block { page-break-inside: avoid; } }
        </style></head><body>
        <h1>Planning équipe — Semaine ${semaine.split("-W")[1]} · ${semaine.split("-W")[0]}</h1>
        <div class="subtitle">${formatDateCourte(lundi)} → ${formatDateCourte(new Date(lundi.getTime()+5*86400000))} · Généré le ${new Date().toLocaleDateString("fr-FR")}</div>
        ${printContent.innerHTML}
        </body></html>
      `);
      win.document.close();
      setTimeout(() => { win.print(); }, 300);
    };

    return (
      <div className="flex flex-col gap-1">
        {/* Bouton print */}
        <div className="flex justify-end mb-2 print:hidden">
          <button onClick={printTimeline}
            className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <Printer size={13}/> Imprimer le planning
          </button>
        </div>

        <div id="management-timeline-print">
          {/* Axe horaire */}
          <div style={{display:"flex", marginLeft:LABEL_W, marginBottom:6}}>
            {HEURES.map(h => (
              <div key={h} style={{flex:1, textAlign:"left", fontFamily:"sans-serif", fontSize:10, fontWeight:700, color:"#64748b", borderLeft:"1px solid #e2e8f0", paddingLeft:3}}>
                {h}h
              </div>
            ))}
          </div>

          {salaries.filter(s=>s.actif).map(sal => {
            const chargeSal = fmtDuree(chargeParSalarie[sal.id]||0);
            const doneSal = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
            const totalSal = taches.filter(t=>t.salarieId===sal.id).length;
            return (
              <div key={sal.id} style={{marginBottom:20}}>
                {/* En-tête salarié */}
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6, paddingLeft:LABEL_W}}>
                  <div style={{width:12, height:12, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                  <span style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e293b"}}>{sal.nom}</span>
                  <span style={{fontFamily:"sans-serif", fontSize:10, color:"#64748b"}}>{chargeSal} cette semaine</span>
                  {totalSal > 0 && (
                    <span style={{fontFamily:"sans-serif", fontSize:10, color:"#16a34a", background:"#f0fdf4", padding:"1px 6px", borderRadius:10}}>
                      {doneSal}/{totalSal} ✓
                    </span>
                  )}
                </div>

                {/* Lignes par jour */}
                {jourDates.slice(0,6).map(({jour, date}) => {
                  const cellTaches = taches.filter(t=>t.salarieId===sal.id&&t.jour===jour);
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                  const actCreneau = creneaux.filter(c=>c.date===dateStr&&c.monitor===sal.nom);
                  const jourLabel = `${JOURS_LABELS[jour].slice(0,3)} ${formatDateCourte(date)}`;

                  return (
                    <div key={jour} style={{display:"flex", alignItems:"center", marginBottom:3}}>
                      <div style={{width:LABEL_W, flexShrink:0, fontFamily:"sans-serif", fontSize:10, fontWeight:600, color:"#475569", paddingRight:8, textAlign:"right"}}>
                        {jourLabel}
                      </div>
                      <div style={{flex:1, height:ROW_H, background:"#f8faff", borderRadius:6, position:"relative", border:"1px solid #e8edf5", overflow:"visible"}}>
                        {/* Grille heures */}
                        {HEURES.slice(1).map(h => (
                          <div key={h} style={{position:"absolute", left:pct(h*60), top:0, bottom:0, borderLeft:"1px dashed #e2e8f0"}}/>
                        ))}

                        {/* Activités planning (bleu clair avec label) */}
                        {actCreneau.map((c,i) => {
                          const s=heureToMin(c.startTime), e=heureToMin(c.endTime);
                          if(s<START||s>=END) return null;
                          return (
                            <div key={i} style={{position:"absolute", left:pct(s), width:w(e-s), top:0, bottom:0, background:"#dbeafe", borderRight:"2px solid #93c5fd", display:"flex", alignItems:"center", overflow:"visible", zIndex:1}}>
                              <span style={{fontSize:9, color:"#1d4ed8", fontWeight:700, padding:"0 4px", whiteSpace:"nowrap", overflow:"visible"}}>
                                {c.activityTitle}
                              </span>
                            </div>
                          );
                        })}

                        {/* Tâches planifiées */}
                        {cellTaches.map(t => {
                          const s=heureToMin(t.heureDebut);
                          if(s<START||s>=END) return null;
                          const cat=getCat(t.categorie);
                          const durMin = t.dureeMinutes;
                          const isShort = durMin < 45;
                          return (
                            <div key={t.id}
                              title={`${t.tacheLabel} — ${t.heureDebut}→${minToHeure(s + durMin)} (${durMin}min)`}
                              style={{
                                position:"absolute", left:pct(s), width:w(durMin), minWidth:isShort?6:undefined,
                                top:3, bottom:3,
                                background: t.done ? "#94a3b8" : getTaskColor(t),
                                borderRadius:5,
                                opacity: t.done ? 0.5 : 1,
                                cursor:"pointer",
                                display:"flex", alignItems:"center",
                                overflow:"visible",
                                boxShadow: t.done ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
                                zIndex: 2,
                              }}
                              onClick={()=>toggleDone(t)}>
                              <span style={{fontSize:10, color:"white", fontWeight:700, paddingLeft:5, paddingRight:4, whiteSpace:"nowrap", overflow:"visible", flex:"none"}}>
                                {t.done ? "✓ " : ""}{t.tacheLabel}
                              </span>
                              {!isShort && (
                                <span style={{fontSize:8, color:"rgba(255,255,255,0.8)", paddingRight:4, flexShrink:0, whiteSpace:"nowrap"}}>
                                  {t.heureDebut}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Légende */}
          <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12, paddingTop:10, borderTop:"1px solid #e2e8f0"}}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{display:"flex", alignItems:"center", gap:4}}>
                <div style={{width:10, height:10, borderRadius:3, background:cat.color}}/>
                <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>{cat.emoji} {cat.label}</span>
              </div>
            ))}
            <div style={{display:"flex", alignItems:"center", gap:4}}>
              <div style={{width:10, height:10, borderRadius:3, background:"#dbeafe", border:"2px solid #93c5fd"}}/>
              <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>📅 Activité planning</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Vue journalière par salarié ──────────────────────────────────────────
  const JournalierView = () => {
    const START = 7*60, END = 20*60;
    const TOTAL = END-START;
    const HEURES = [7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const pct = (min: number) => `${((min-START)/TOTAL)*100}%`;
    const w = (dur: number) => `${Math.max((dur/TOTAL)*100, 1)}%`;
    const ROW_H = 44;
    const LABEL_W = 140;

    const dayData = jourDates.find(j => j.jour === selectedDay)!;
    const dateStr = `${dayData.date.getFullYear()}-${String(dayData.date.getMonth()+1).padStart(2,"0")}-${String(dayData.date.getDate()).padStart(2,"0")}`;
    const jourLabel = dayData.date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    const printJournalier = () => {
      const printContent = document.getElementById("management-journalier-print");
      if (!printContent) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html><head><meta charset="utf-8"><title>Planning journalier — ${jourLabel}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; background: white; }
          h1 { font-size: 18px; font-weight: 800; color: #0C1A2E; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .header-row { display: flex; margin-left: ${LABEL_W}px; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 12px; }
          .header-h { flex: 1; font-size: 10px; font-weight: 700; color: #475569; border-left: 1px solid #e2e8f0; padding-left: 4px; }
          .sal-row { display: flex; align-items: center; margin-bottom: 6px; }
          .sal-label { width: ${LABEL_W}px; flex-shrink: 0; padding-right: 12px; }
          .sal-name { font-size: 13px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px; }
          .sal-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
          .sal-charge { font-size: 9px; color: #64748b; margin-top: 1px; }
          .sal-bar { flex: 1; height: ${ROW_H}px; background: #f8faff; border-radius: 8px; position: relative; border: 1px solid #e2e8f0; overflow: visible; }
          .hour-grid { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; }
          .act-block { position: absolute; top: 0; bottom: 0; background: #dbeafe; border-right: 2px solid #93c5fd; display: flex; align-items: center; overflow: visible; }
          .act-label { font-size: 9px; color: #1d4ed8; font-weight: 700; padding: 0 5px; white-space: nowrap; }
          .task-block { position: absolute; top: 4px; bottom: 4px; border-radius: 5px; display: flex; align-items: center; overflow: visible; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
          .task-label { font-size: 10px; color: white; font-weight: 700; padding: 0 6px; white-space: nowrap; flex: none; }
          .task-time { font-size: 9px; color: rgba(255,255,255,0.85); padding-right: 5px; white-space: nowrap; flex-shrink: 0; }
          .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
          .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #475569; }
          .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
          .summary { margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
          .summary h3 { font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
          .summary-line { font-size: 11px; color: #475569; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
          @media print { body { padding: 10px; } }
        </style></head><body>
        <h1>Planning journalier</h1>
        <div class="subtitle">${jourLabel} — Semaine ${semaine.split("-W")[1]}</div>
        ${printContent.innerHTML}
        </body></html>
      `);
      win.document.close();
      setTimeout(() => { win.print(); }, 300);
    };

    const activeSalaries = salaries.filter(s => s.actif);

    return (
      <div className="flex flex-col gap-3">
        {/* Sélecteur de jour */}
        <div className="flex items-center gap-2 flex-wrap">
          {jourDates.slice(0,6).map(({jour, date}) => {
            const isToday = new Date().toDateString() === date.toDateString();
            return (
              <button key={jour} onClick={() => setSelectedDay(jour)}
                className={`px-4 py-2 rounded-xl font-body text-xs font-semibold border cursor-pointer transition-all
                  ${selectedDay===jour
                    ? "bg-blue-600 text-white border-blue-600"
                    : isToday
                      ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                      : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>
                {JOURS_LABELS[jour].slice(0,3)} {formatDateCourte(date)}
                {isToday && selectedDay !== jour && <span className="ml-1 text-[10px]">•</span>}
              </button>
            );
          })}
          {jourDates.length > 5 && jourDates.slice(5).map(({jour, date}) => (
            <button key={jour} onClick={() => setSelectedDay(jour)}
              className={`px-4 py-2 rounded-xl font-body text-xs font-semibold border cursor-pointer transition-all
                ${selectedDay===jour
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-400 border-gray-200 hover:bg-gray-50"}`}>
              {JOURS_LABELS[jour].slice(0,3)} {formatDateCourte(date)}
            </button>
          ))}
        </div>

        {/* Bouton imprimer */}
        <div className="flex justify-between items-center">
          <div className="font-display text-sm font-bold text-blue-800 capitalize">{jourLabel}</div>
          <button onClick={printJournalier}
            className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <Printer size={13}/> Imprimer cette journée
          </button>
        </div>

        <div id="management-journalier-print">
          {/* Axe horaire */}
          <div style={{display:"flex", marginLeft:LABEL_W, marginBottom:6}}>
            {HEURES.map(h => (
              <div key={h} style={{flex:1, textAlign:"left", fontFamily:"sans-serif", fontSize:10, fontWeight:700, color:"#64748b", borderLeft:"1px solid #e2e8f0", paddingLeft:3}}>
                {h}h
              </div>
            ))}
          </div>

          {/* Une ligne par salarié */}
          {activeSalaries.map(sal => {
            const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === selectedDay);
            const dayActivities = creneaux.filter(c => c.date === dateStr && c.monitor === sal.nom);
            const dayCharge = (() => {
              if (dayTaches.length === 0) return 0;
              const sorted = [...dayTaches].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
              const debut = heureToMin(sorted[0].heureDebut);
              const last = sorted[sorted.length - 1];
              const fin = heureToMin(last.heureDebut) + last.dureeMinutes;
              const pauses = sorted.filter(t => t.categorie === "pause").reduce((s, t) => s + t.dureeMinutes, 0);
              return Math.max(0, fin - debut - pauses);
            })();
            const dayDone = dayTaches.filter(t => t.done).length;

            return (
              <div key={sal.id} style={{display:"flex", alignItems:"center", marginBottom:6}}>
                {/* Label salarié */}
                <div style={{width:LABEL_W, flexShrink:0, paddingRight:12}}>
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <div style={{width:10, height:10, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                    <span style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e293b"}}>{sal.nom}</span>
                  </div>
                  <div style={{fontFamily:"sans-serif", fontSize:9, color:"#64748b", marginTop:1, paddingLeft:16}}>
                    {fmtDuree(dayCharge)}
                    {dayTaches.length > 0 && ` · ${dayDone}/${dayTaches.length} ✓`}
                  </div>
                </div>

                {/* Barre timeline */}
                <div style={{flex:1, height:ROW_H, background:"#f8faff", borderRadius:8, position:"relative", border:"1px solid #e8edf5", overflow:"visible"}}>
                  {/* Grille heures */}
                  {HEURES.slice(1).map(h => (
                    <div key={h} style={{position:"absolute", left:pct(h*60), top:0, bottom:0, borderLeft:"1px dashed #e2e8f0"}}/>
                  ))}

                  {/* Activités planning */}
                  {dayActivities.map((c, i) => {
                    const s = heureToMin(c.startTime), e = heureToMin(c.endTime);
                    if (s < START || s >= END) return null;
                    return (
                      <div key={`act-${i}`} style={{position:"absolute", left:pct(s), width:w(e-s), top:0, bottom:0, background:"#dbeafe", borderRight:"2px solid #93c5fd", display:"flex", alignItems:"center", overflow:"visible", zIndex:1}}>
                        <span style={{fontSize:9, color:"#1d4ed8", fontWeight:700, padding:"0 5px", whiteSpace:"nowrap", overflow:"visible"}}>
                          {c.activityTitle}
                        </span>
                      </div>
                    );
                  })}

                  {/* Tâches planifiées */}
                  {dayTaches.map(t => {
                    const s = heureToMin(t.heureDebut);
                    if (s < START || s >= END) return null;
                    const cat = getCat(t.categorie);
                    const durMin = t.dureeMinutes;
                    const isShort = durMin < 45;
                    return (
                      <div key={t.id}
                        title={`${t.tacheLabel} — ${t.heureDebut}→${minToHeure(s + durMin)} (${durMin}min)`}
                        style={{
                          position:"absolute", left:pct(s), width:w(durMin),
                          top:4, bottom:4,
                          background: t.done ? "#94a3b8" : getTaskColor(t),
                          borderRadius:5,
                          opacity: t.done ? 0.5 : 1,
                          cursor:"pointer",
                          display:"flex", alignItems:"center",
                          overflow:"visible",
                          boxShadow: t.done ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
                          zIndex: 2,
                        }}
                        onClick={() => toggleDone(t)}>
                        <span style={{fontSize:10, color:"white", fontWeight:700, paddingLeft:6, paddingRight:4, whiteSpace:"nowrap", overflow:"visible", flex:"none"}}>
                          {t.done ? "✓ " : ""}{t.tacheLabel}
                        </span>
                        {!isShort && (
                          <span style={{fontSize:9, color:"rgba(255,255,255,0.85)", paddingRight:5, flexShrink:0, whiteSpace:"nowrap"}}>
                            {t.heureDebut}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Résumé journée */}
          <div style={{marginTop:16, padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8}}>
            <div style={{fontFamily:"sans-serif", fontSize:11, fontWeight:700, color:"#1e293b", marginBottom:6}}>Résumé de la journée</div>
            {activeSalaries.map(sal => {
              const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === selectedDay);
              if (dayTaches.length === 0) return null;
              const charge = dayTaches.reduce((sum, t) => sum + t.dureeMinutes, 0);
              return (
                <div key={sal.id} style={{fontFamily:"sans-serif", fontSize:10, color:"#475569", marginBottom:3, display:"flex", alignItems:"center", gap:6}}>
                  <div style={{width:8, height:8, borderRadius:"50%", background:sal.couleur}}/>
                  <strong>{sal.nom}</strong> — {fmtDuree(charge)} — {dayTaches.map(t => t.tacheLabel).join(", ")}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12, paddingTop:10, borderTop:"1px solid #e2e8f0"}}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{display:"flex", alignItems:"center", gap:4}}>
                <div style={{width:10, height:10, borderRadius:3, background:cat.color}}/>
                <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>{cat.emoji} {cat.label}</span>
              </div>
            ))}
            <div style={{display:"flex", alignItems:"center", gap:4}}>
              <div style={{width:10, height:10, borderRadius:3, background:"#dbeafe", border:"2px solid #93c5fd"}}/>
              <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>📅 Activité planning</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Vue Fiche individuelle (lisible + imprimable) ────────────────────────
  const FicheView = () => {
    const activeSalaries = salaries.filter(s => s.actif);
    const sal = activeSalaries.find(s => s.id === selectedSalarieId) || activeSalaries[0];
    if (!sal) return <div className="text-center py-8 text-slate-400 font-body text-sm">Aucun salarié actif.</div>;

    // Auto-select first salarie if none selected
    if (!selectedSalarieId && sal) {
      setTimeout(() => setSelectedSalarieId(sal.id), 0);
    }

    const printFiche = () => {
      const el = document.getElementById("management-fiche-print");
      if (!el) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<html><head><meta charset="utf-8"><title>Planning ${sal.nom} — Semaine ${semaine}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; background: white; color: #1e293b; }
          h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .day-section { margin-bottom: 18px; page-break-inside: avoid; }
          .day-title { font-size: 14px; font-weight: 800; color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
          .task-row { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
          .task-time { width: 70px; font-size: 13px; font-weight: 700; color: #475569; flex-shrink: 0; }
          .task-name { flex: 1; font-size: 13px; font-weight: 600; }
          .task-dur { width: 60px; font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; }
          .task-cat { font-size: 10px; color: #94a3b8; margin-left: 8px; }
          .activity-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; background: #f0f7ff; margin: 0 -8px; padding: 5px 8px; border-radius: 4px; }
          .activity-row .task-name { color: #1d4ed8; }
          .total { margin-top: 6px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; }
          .empty-day { font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0; }
          @media print { body { padding: 10px; } .day-section { page-break-inside: avoid; } }
        </style></head><body>
        <h1>Planning — ${sal.nom}</h1>
        <div class="subtitle">Semaine ${semaine.split("-W")[1]} · ${semaine.split("-W")[0]} · ${formatDateCourte(lundi)} → ${formatDateCourte(new Date(lundi.getTime()+5*86400000))}</div>
        ${el.innerHTML}
      </body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 300);
    };

    return (
      <div className="flex flex-col gap-4">
        {/* Sélecteur salarié */}
        <div className="flex items-center gap-3 flex-wrap">
          {activeSalaries.map(s => (
            <button key={s.id} onClick={() => setSelectedSalarieId(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all
                ${selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id)
                  ? "text-white border-transparent"
                  : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}
              style={selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id) ? {background: s.couleur} : {}}>
              <div className="w-2.5 h-2.5 rounded-full" style={{background: selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id) ? "white" : s.couleur}}/>
              {s.nom}
            </button>
          ))}
        </div>

        {/* Bouton imprimer */}
        <div className="flex justify-between items-center">
          <div className="font-display text-lg font-bold text-blue-800">
            Planning de {sal.nom}
          </div>
          <button onClick={printFiche}
            className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <Printer size={14}/> Imprimer la fiche
          </button>
        </div>

        <div id="management-fiche-print">
          {jourDates.slice(0,6).map(({jour, date}) => {
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
            const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === jour)
              .sort((a,b) => heureToMin(a.heureDebut) - heureToMin(b.heureDebut));
            const dayActivities = creneaux.filter(c => c.date === dateStr && c.monitor === sal.nom)
              .sort((a: any, b: any) => heureToMin(a.startTime) - heureToMin(b.startTime));
            const dayCharge = (() => {
              if (dayTaches.length === 0) return 0;
              const sorted = [...dayTaches].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
              const debut = heureToMin(sorted[0].heureDebut);
              const last = sorted[sorted.length - 1];
              const fin = heureToMin(last.heureDebut) + last.dureeMinutes;
              const pauses = sorted.filter(t => t.categorie === "pause").reduce((s, t) => s + t.dureeMinutes, 0);
              return Math.max(0, fin - debut - pauses);
            })();
            const jourComplet = date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
            const isEmpty = dayTaches.length === 0 && dayActivities.length === 0;

            return (
              <div key={jour} style={{marginBottom:18, pageBreakInside:"avoid"}}>
                <div style={{fontSize:14, fontWeight:800, color:"#1e3a5f", borderBottom:"2px solid #e2e8f0", paddingBottom:4, marginBottom:8, textTransform:"capitalize"}}>
                  {jourComplet}
                </div>

                {isEmpty ? (
                  <div style={{fontSize:11, color:"#94a3b8", fontStyle:"italic", padding:"4px 0"}}>Rien de prévu</div>
                ) : (
                  <>
                    {/* Activités planning (cours, stages...) */}
                    {dayActivities.map((c: any, i: number) => (
                      <div key={`act-${i}`} style={{display:"flex", alignItems:"center", padding:"6px 8px", borderBottom:"1px solid #f1f5f9", background:"#f0f7ff", borderRadius:4, marginBottom:2}}>
                        <div style={{width:70, fontSize:13, fontWeight:700, color:"#1d4ed8", flexShrink:0}}>{c.startTime}</div>
                        <div style={{flex:1, fontSize:13, fontWeight:600, color:"#1d4ed8"}}>
                          📅 {c.activityTitle}
                        </div>
                        <div style={{width:60, fontSize:11, color:"#64748b", textAlign:"right", flexShrink:0}}>
                          → {c.endTime}
                        </div>
                      </div>
                    ))}

                    {/* Tâches planifiées */}
                    {dayTaches.map(t => {
                      const cat = getCat(t.categorie);
                      const fin = minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes);
                      return (
                        <div key={t.id}
                          style={{display:"flex", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #f1f5f9", cursor:"pointer", opacity: t.done ? 0.5 : 1}}
                          onClick={() => toggleDone(t)}>
                          <div style={{width:70, fontSize:13, fontWeight:700, color:"#475569", flexShrink:0}}>{t.heureDebut}</div>
                          <div style={{flex:1, display:"flex", alignItems:"center", gap:6}}>
                            <span style={{fontSize:14}}>{cat?.emoji}</span>
                            <span style={{fontSize:13, fontWeight:600, color: t.done ? "#94a3b8" : getTaskColor(t), textDecoration: t.done ? "line-through" : "none"}}>
                              {t.tacheLabel}
                            </span>
                            <span style={{fontSize:10, color:"#94a3b8"}}>{cat?.label}</span>
                          </div>
                          <div style={{width:80, fontSize:11, color:"#64748b", textAlign:"right", flexShrink:0}}>
                            {fmtDuree(t.dureeMinutes)} → {fin}
                          </div>
                          <div style={{width:24, height:24, borderRadius:6, border:`2px solid ${t.done?"#16a34a":"#d1d5db"}`, background:t.done?"#16a34a":"white", display:"flex", alignItems:"center", justifyContent:"center", marginLeft:8, flexShrink:0}}>
                            {t.done && <Check size={14} color="white"/>}
                          </div>
                        </div>
                      );
                    })}

                    {/* Total jour */}
                    {dayCharge > 0 && (
                      <div style={{marginTop:6, fontSize:12, fontWeight:700, color:"#475569", textAlign:"right"}}>
                        Total : {fmtDuree(dayCharge)} · {dayTaches.filter(t=>t.done).length}/{dayTaches.length} tâches validées
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Total semaine */}
          <div style={{marginTop:12, padding:"10px 14px", background:"#f0f7ff", borderRadius:8, border:"1px solid #bfdbfe"}}>
            <div style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e3a5f"}}>
              Total semaine : {fmtDuree(chargeParSalarie[sal.id] || 0)}
              {" · "}{taches.filter(t=>t.salarieId===sal.id&&t.done).length}/{taches.filter(t=>t.salarieId===sal.id).length} tâches validées
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation semaine — style planning */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Ligne 1 : Mois + navigation */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
            <ChevronLeft size={16}/> Sem. préc.
          </button>
          <div className="text-center">
            <div className="font-display text-base font-bold text-blue-800 capitalize">
              {lundi.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </div>
            <div className="font-body text-[10px] text-slate-400">
              Semaine {semaine.split("-W")[1]}
            </div>
          </div>
          <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
            Sem. suiv. <ChevronRight size={16}/>
          </button>
        </div>
        {/* Ligne 2 : Jours de la semaine cliquables */}
        <div className="flex">
          {jourDates.slice(0, 6).map(({ jour, date }) => {
            const isToday = (() => {
              const now = new Date();
              return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            })();
            const hasTaches = taches.some(t => t.jour === jour);
            const dayNum = date.getDate();
            const dayLabel = JOURS_LABELS[jour].slice(0, 3);
            return (
              <button key={jour}
                onClick={() => { setView("journalier"); setSelectedDay(jour); }}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "8px 0", border: "none", cursor: "pointer",
                  background: isToday ? "#eff6ff" : "transparent",
                  borderBottom: isToday ? "2px solid #3b82f6" : "2px solid transparent",
                }}>
                <span style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 600, color: isToday ? "#3b82f6" : "#94a3b8", textTransform: "uppercase" }}>
                  {dayLabel}
                </span>
                <span style={{
                  fontFamily: "sans-serif", fontSize: 16, fontWeight: 800,
                  color: isToday ? "#3b82f6" : "#1e293b",
                  width: 32, height: 32, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? "#dbeafe" : "transparent",
                }}>
                  {dayNum}
                </span>
                {hasTaches && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: isToday ? "#3b82f6" : "#94a3b8" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Jours travaillés cette semaine */}
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-2 border border-gray-100">
        <span className="font-body text-xs font-semibold text-slate-500">Jours travaillés :</span>
        <div className="flex gap-1">
          {JOURS.slice(0, 6).map(j => {
            const active = joursTravailles.includes(j as JourSemaine);
            return (
              <button key={j} onClick={() => {
                setJoursTravailles(prev => active ? prev.filter(x => x !== j) : [...prev, j as JourSemaine]);
              }}
                className={`px-2 py-1 rounded-md font-body text-[10px] font-semibold border-none cursor-pointer transition-all
                  ${active ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                {JOURS_LABELS[j as JourSemaine].slice(0, 3)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-1">
          <button onClick={() => setJoursTravailles(["lundi","mardi","mercredi","jeudi","vendredi"])}
            className="font-body text-[9px] text-blue-500 bg-transparent border-none cursor-pointer underline">Lun-Ven</button>
          <button onClick={() => setJoursTravailles(["mardi","mercredi","jeudi","vendredi","samedi"])}
            className="font-body text-[9px] text-blue-500 bg-transparent border-none cursor-pointer underline">Mar-Sam</button>
          <button onClick={() => setJoursTravailles(["lundi","mardi","mercredi","jeudi","vendredi","samedi"])}
            className="font-body text-[9px] text-blue-500 bg-transparent border-none cursor-pointer underline">Lun-Sam</button>
        </div>
      </div>

      {/* Résumé charge */}
      <div className="flex flex-wrap gap-2">
        {salaries.filter(s=>s.actif).map(sal => {
          const charge = chargeParSalarie[sal.id]||0;
          const heures = fmtDuree(charge);
          const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
          const total = taches.filter(t=>t.salarieId===sal.id).length;
          return (
            <div key={sal.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{background:sal.couleur}}/>
              <span className="font-body text-xs font-semibold text-blue-800">{sal.nom}</span>
              <span className="font-body text-xs text-slate-500">{heures}</span>
              {total > 0 && <span className="font-body text-[10px] text-green-600">{done}/{total} ✓</span>}
            </div>
          );
        })}
      </div>

      {/* Toggle vue + actions modèles */}
      <div className="flex gap-2 flex-wrap items-center">
        {(["tableau","timeline","journalier","fiche"] as const).map(v => (
          <button key={v} onClick={()=>setView(v)}
            className={`px-4 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${view===v?"bg-blue-500 text-white":"bg-white text-slate-500 border border-gray-200"}`}>
            {v === "tableau" ? "📊 Tableau" : v === "timeline" ? "📅 Timeline" : v === "journalier" ? "👤 Journalier" : "📋 Fiche"}
          </button>
        ))}
        <div className="flex-1" />
        {/* Bouton Importer cours/stages */}
        <button onClick={handleImportCreneaux} disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold cursor-pointer border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 disabled:opacity-50">
          {importing ? <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> : <span>📅</span>}
          {importing ? "Import…" : "Importer cours/stages"}
        </button>
        {/* Bouton Appliquer un modèle */}
        <div className="relative">
          <button onClick={() => setShowApplyModele(!showApplyModele)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold cursor-pointer border border-green-200 bg-white text-green-700 hover:bg-green-50">
            <LayoutTemplate size={13}/> Appliquer un modèle
          </button>
          {showApplyModele && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[280px]">
              <div className="font-body text-xs font-bold text-gray-500 mb-2">Appliquer sur la semaine {semaine}</div>
              {modeles.length === 0 ? (
                <p className="font-body text-xs text-gray-400 py-3 text-center">Aucun modèle. Créez-en dans l'onglet Modèles.</p>
              ) : (
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {modeles.map(m => (
                    <button key={m.id} onClick={() => handleApplyModele(m)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer border-none bg-transparent text-left">
                      <span>{m.type === "scolaire" ? "📚" : m.type === "vacances" ? "☀️" : "📌"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-xs font-semibold text-blue-800 truncate">{m.nom}</div>
                        <div className="font-body text-[10px] text-gray-400">{m.taches.length} tâches · {fmtDuree(m.taches.reduce((s,t)=>s+t.dureeMinutes,0))}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowApplyModele(false)}
                className="mt-2 w-full text-center font-body text-[10px] text-gray-400 bg-transparent border-none cursor-pointer hover:text-gray-600">Fermer</button>
            </div>
          )}
        </div>
        {/* Bouton Sauvegarder comme modèle */}
        <div className="relative">
          <button onClick={() => setShowSaveModele(!showSaveModele)} disabled={taches.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold cursor-pointer border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={13}/> Sauvegarder comme modèle
          </button>
          {showSaveModele && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 min-w-[300px]">
              <div className="font-body text-xs font-bold text-gray-500 mb-3">Sauvegarder les {taches.length} tâches comme modèle</div>
              <input value={saveModeleName} onChange={e => setSaveModeleName(e.target.value)} placeholder="Nom du modèle (ex: Semaine scolaire)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              <div className="flex gap-2 mb-3">
                {([["scolaire","📚","Scolaire"],["vacances","☀️","Vacances"],["autre","📌","Autre"]] as const).map(([id, emoji, label]) => (
                  <button key={id} onClick={() => setSaveModeleType(id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer ${saveModeleType === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200"}`}>
                    {emoji} {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowSaveModele(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 font-body text-xs text-gray-500 cursor-pointer bg-white">Annuler</button>
                <button onClick={handleSaveAsModele}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 text-white font-body text-xs font-semibold cursor-pointer border-none hover:bg-blue-400">
                  Créer le modèle
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bandeau conflits horaires */}
      {conflits.length > 0 && (
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:18,flexShrink:0}}>🔴</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#92400e",marginBottom:6}}>
              {conflits.length} conflit{conflits.length > 1 ? "s" : ""} horaire{conflits.length > 1 ? "s" : ""} détecté{conflits.length > 1 ? "s" : ""}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {conflits.map((c, i) => (
                <div key={i} style={{fontFamily:"sans-serif",fontSize:11,color:"#78350f",display:"flex",alignItems:"center",gap:6,background:"#fef3c7",padding:"4px 10px",borderRadius:6}}>
                  <span style={{fontWeight:700}}>{c.salarieName}</span>
                  <span style={{color:"#a16207"}}>·</span>
                  <span>{JOURS_LABELS[c.jour].slice(0, 3)}</span>
                  <span style={{color:"#a16207"}}>·</span>
                  <span style={{fontWeight:600,color:"#dc2626"}}>
                    {c.tache1.tacheLabel} ({c.tache1.heureDebut}→{minToHeure(heureToMin(c.tache1.heureDebut) + c.tache1.dureeMinutes)})
                  </span>
                  <span style={{color:"#a16207"}}>↔</span>
                  <span style={{fontWeight:600,color:"#dc2626"}}>
                    {c.tache2.tacheLabel} ({c.tache2.heureDebut}→{minToHeure(heureToMin(c.tache2.heureDebut) + c.tache2.dureeMinutes)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bandeau tâches obligatoires manquantes */}
      {tachesManquantes.length > 0 && (
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#991b1b",marginBottom:4}}>
              {tachesManquantes.length} tâche{tachesManquantes.length > 1 ? "s" : ""} obligatoire{tachesManquantes.length > 1 ? "s" : ""} manquante{tachesManquantes.length > 1 ? "s" : ""}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {tachesManquantes.slice(0, 12).map((m, i) => (
                <span key={i} style={{fontFamily:"sans-serif",fontSize:10,background:"#fee2e2",color:"#dc2626",padding:"2px 8px",borderRadius:6,fontWeight:600}}>
                  {m.tache.label} · {JOURS_LABELS[m.jour].slice(0, 3)}
                </span>
              ))}
              {tachesManquantes.length > 12 && (
                <span style={{fontFamily:"sans-serif",fontSize:10,color:"#991b1b"}}>+{tachesManquantes.length - 12} autres</span>
              )}
            </div>
          </div>
          <button onClick={handleIACheck} disabled={iaChecking}
            style={{flexShrink:0,padding:"6px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            {iaChecking ? <div style={{width:12,height:12,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /> : <span>🤖</span>}
            {iaChecking ? "Analyse…" : "Vérifier avec l'IA"}
          </button>
        </div>
      )}

      {/* Bandeau tout OK si aucune manquante et qu'il y a des obligatoires */}
      {tachesManquantes.length === 0 && tachesObligatoires.length > 0 && taches.length > 0 && (
        <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>✅</span>
          <span style={{fontFamily:"sans-serif",fontSize:12,color:"#166534",fontWeight:600}}>
            Toutes les tâches obligatoires sont assignées cette semaine
          </span>
          <div style={{flex:1}} />
          <button onClick={handleIACheck} disabled={iaChecking}
            style={{padding:"5px 12px",borderRadius:8,border:"1px solid #d4d4d8",background:"white",color:"#7c3aed",fontFamily:"sans-serif",fontSize:10,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            {iaChecking ? "Analyse…" : "🤖 Check complet IA"}
          </button>
        </div>
      )}

      {/* Résultat de la vérification IA */}
      {iaResult && (
        <div style={{background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:12,padding:"14px 18px",position:"relative"}}>
          <button onClick={() => setIaResult(null)}
            style={{position:"absolute",top:8,right:10,background:"transparent",border:"none",cursor:"pointer",color:"#a78bfa",fontSize:16}}>✕</button>
          <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            🤖 Analyse IA du planning
          </div>
          <div style={{fontFamily:"sans-serif",fontSize:12,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
            {iaResult}
          </div>
        </div>
      )}

      {/* Vue */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden p-4">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? <TableauView/>
          : view === "timeline" ? <TimelineView/>
          : view === "journalier" ? <JournalierView/>
          : <FicheView/>}
      </div>
    </div>
  );
}
