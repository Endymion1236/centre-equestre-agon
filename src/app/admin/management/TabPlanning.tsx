"use client";
import { useState, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, Printer, Save, LayoutTemplate } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine, ModelePlanning, TacheModele } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, formatDateCourte, fmtDuree } from "./types";

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
  const [view, setView] = useState<"tableau" | "horaire" | "fiche">("tableau");
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
    // Trouver les tâches similaires de la même personne cette semaine
    const similaires = taches.filter(
      other => other.id !== t.id &&
        other.salarieId === t.salarieId &&
        other.tacheLabel === t.tacheLabel &&
        other.heureDebut === t.heureDebut
    );

    if (similaires.length === 0) {
      // Seule occurrence → supprimer directement
      if (!confirm(`Supprimer "${t.tacheLabel}" (${JOURS_LABELS[t.jour]}) ?`)) return;
      await deleteDoc(doc(db, "taches-planifiees", t.id));
    } else {
      // Plusieurs occurrences → proposer le choix
      const choix = prompt(
        `"${t.tacheLabel}" est assignée à ${t.salarieName} sur ${similaires.length + 1} jours.\n\n` +
        `Tapez :\n` +
        `  1 → Supprimer uniquement ${JOURS_LABELS[t.jour]}\n` +
        `  2 → Supprimer les ${similaires.length + 1} jours (${[t, ...similaires].map(x => JOURS_LABELS[x.jour].slice(0,3)).join(", ")})`,
        "1"
      );
      if (!choix) return;

      if (choix.trim() === "2") {
        // Supprimer toutes les similaires + celle-ci
        const toDelete = [t, ...similaires];
        await Promise.all(toDelete.map(d => deleteDoc(doc(db, "taches-planifiees", d.id))));
        toast(`${toDelete.length} tâches "${t.tacheLabel}" supprimées pour ${t.salarieName}`, "success");
      } else {
        await deleteDoc(doc(db, "taches-planifiees", t.id));
        toast(`"${t.tacheLabel}" supprimée (${JOURS_LABELS[t.jour]})`, "success");
      }
    }
    onRefresh();
  };

  // ── Sauvegarder la semaine comme modèle ─────────────────────────────
  const handleSaveAsModele = async () => {
    if (!saveModeleName.trim()) { toast("Nom du modèle requis", "error"); return; }
    if (taches.length === 0) { toast("La semaine est vide, rien à sauvegarder", "error"); return; }
    setSaving(true);
    try {
      const tachesModele: TacheModele[] = taches.map(t => ({
        tacheTypeId: t.tacheTypeId || "",
        tacheLabel: t.tacheLabel || "",
        categorie: t.categorie || "autre",
        salarieId: t.salarieId || "",
        salarieName: t.salarieName || "",
        jour: t.jour,
        heureDebut: t.heureDebut || "08:00",
        dureeMinutes: t.dureeMinutes || 30,
        ...(t.notes ? { notes: t.notes } : {}),
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
      console.error("Erreur sauvegarde modèle:", e);
      toast(`Erreur : ${e.message || "Échec sauvegarde"}`, "error");
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
  const [inclureDimanche, setInclureDimanche] = useState(false);
  const nbJours = inclureDimanche ? 7 : 6;
  const joursActifs = JOURS.slice(0, nbJours) as JourSemaine[];
  const chargeParSalarie = useMemo(() => {
    const map: Record<string, number> = {};
    const salIds = [...new Set(taches.map(t => t.salarieId))];
    for (const salId of salIds) {
      // Somme des durées de toutes les tâches sauf les pauses
      map[salId] = taches
        .filter(t => t.salarieId === salId && t.categorie !== "pause")
        .reduce((sum, t) => sum + t.dureeMinutes, 0);
    }
    return map;
  }, [taches]);

  // ── Importer les cours/stages du planning dans les tâches ───────────────
  const [importing, setImporting] = useState(false);

  const handleImportCreneaux = async () => {
    // Calculer les dates de la semaine
    const dates = jourDates.slice(0, nbJours).map(({ jour, date }) => ({
      jour,
      dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    }));

    // Trouver les créneaux de la semaine qui ont un moniteur correspondant à un salarié
    const matchedCreneaux: { creneau: any; salarieId: string; salarieName: string; jour: JourSemaine }[] = [];

    for (const { jour, dateStr } of dates) {
      const dayCr = creneaux.filter(c => c.date === dateStr && c.monitor);
      for (const c of dayCr) {
        // Supporter plusieurs moniteurs séparés par virgule
        const monitorNames = (c.monitor || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        for (const monitorName of monitorNames) {
          const monitorLower = monitorName.toLowerCase();
          const sal = salaries.find(s =>
            s.actif && s.nom.toLowerCase().trim() === monitorLower
          );
          if (sal) {
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
  const [showConflits, setShowConflits] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [openPanel, setOpenPanel] = useState<"planning" | "partager" | null>(null);

  // ── Notifier l'équipe par email ───────────────────────────────────────
  const handleNotifyEquipe = async () => {
    setNotifying(true);
    try {
      const snap = await getDocs(collection(db, "moniteurs"));
      const moniteurs = snap.docs.map(d => ({ ...(d.data() as any), id: d.id }))
        .filter((m: any) => m.status === "active" && m.email);

      if (moniteurs.length === 0) {
        toast("Aucun moniteur avec email trouvé dans Paramètres → Moniteurs", "error");
        setNotifying(false);
        return;
      }

      const activeSals = salaries.filter(s => s.actif);
      const joursLabels = jourDates.slice(0, nbJours);
      const semaineNum = semaine.split("-W")[1];
      const dateDebut = formatDateCourte(lundi);
      const dateFin = formatDateCourte(new Date(lundi.getTime() + 5 * 86400000));
      const siteUrl = "https://centre-equestre-agon.vercel.app";

      let sent = 0;
      for (const mon of moniteurs) {
        // Trouver le salarié correspondant
        const sal = activeSals.find(s => s.nom.toLowerCase().trim() === (mon.name || "").toLowerCase().trim());
        const salTaches = sal
          ? taches.filter(t => t.salarieId === sal.id).sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || a.heureDebut.localeCompare(b.heureDebut))
          : [];
        const totalCharge = salTaches.filter(t => t.categorie !== "pause").reduce((s, t) => s + t.dureeMinutes, 0);

        // Construire le tableau style management (jours en colonnes, tâches en cartes)
        const jourHeaders = joursLabels.map(({ jour, date }) =>
          `<th style="padding:6px 4px;text-align:center;font-size:10px;font-weight:700;color:#475569;background:#f1f5f9;border-bottom:2px solid #e2e8f0;width:${Math.floor(85/6)}%;">${JOURS_LABELS[jour].slice(0,3)} ${date.getDate()}</th>`
        ).join("");

        const jourCells = joursLabels.map(({ jour }) => {
          const dayT = salTaches.filter(t => t.jour === jour);
          if (dayT.length === 0) {
            return `<td style="padding:4px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:center;"><span style="color:#d1d5db;font-size:11px;">—</span></td>`;
          }
          const cards = dayT.map(t => {
            const color = (t as any).color || getCat(t.categorie)?.color || "#64748b";
            const cat = getCat(t.categorie);
            return `<div style="background:${color}12;border:1px solid ${color}25;border-radius:6px;padding:4px 6px;margin-bottom:3px;">
              <div style="font-size:10px;font-weight:600;color:${color};line-height:1.3;">${t.tacheLabel}</div>
              <div style="font-size:9px;color:#94a3b8;">${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}</div>
            </div>`;
          }).join("");
          return `<td style="padding:3px;border-bottom:1px solid #f1f5f9;vertical-align:top;">${cards}</td>`;
        }).join("");

        // Résumé charge par jour
        const chargeCells = joursLabels.map(({ jour }) => {
          const dayT = salTaches.filter(t => t.jour === jour && t.categorie !== "pause");
          const charge = dayT.reduce((s, t) => s + t.dureeMinutes, 0);
          return `<td style="padding:4px;text-align:center;font-size:9px;font-weight:700;color:${charge > 0 ? "#1e3a5f" : "#d1d5db"};border-top:1px solid #e2e8f0;">${charge > 0 ? fmtDuree(charge) : "—"}</td>`;
        }).join("");

        const html = `
<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#ffffff;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#2050A0);padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:2px;">🐴 Centre Équestre d'Agon-Coutainville</div>
    <div style="font-size:20px;font-weight:800;color:#ffffff;">Planning Semaine ${semaineNum}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${dateDebut} → ${dateFin}</div>
  </div>
  
  <!-- Salutation -->
  <div style="padding:16px 24px 10px;">
    <div style="font-size:14px;color:#1e293b;">Bonjour <strong>${mon.name}</strong>,</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">
      ${totalCharge > 0 ? `Votre semaine : <strong style="color:#1e3a5f;">${fmtDuree(totalCharge)}</strong> de travail.` : "Aucune tâche assignée cette semaine."}
    </div>
  </div>

  <!-- Tableau style management -->
  ${totalCharge > 0 ? `
  <div style="padding:8px 24px 16px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr>
          ${jourHeaders}
        </tr>
      </thead>
      <tbody>
        <tr>${jourCells}</tr>
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;">${chargeCells}</tr>
        <tr style="background:#f1f5f9;">
          <td colspan="${joursLabels.length}" style="padding:8px 12px;text-align:center;font-weight:800;color:#1e3a5f;font-size:13px;border-top:2px solid #e2e8f0;">
            Total : ${fmtDuree(totalCharge)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Bouton -->
  <div style="padding:4px 24px 20px;text-align:center;">
    <a href="${siteUrl}/espace-moniteur/planning" style="display:inline-block;background:#2050A0;color:#ffffff;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
      📋 Voir mon planning
    </a>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:12px 24px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;">
    <div style="font-size:10px;color:#94a3b8;text-align:center;">
      Ce planning peut être modifié. En cas de question, contactez Nicolas.
      <br>Centre Équestre d'Agon-Coutainville · <a href="${siteUrl}" style="color:#2050A0;text-decoration:none;">centreequestreagon.com</a>
    </div>
  </div>
</div>`;

        try {
          await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: mon.email,
              subject: `📋 Votre planning semaine ${semaineNum} — ${dateDebut} → ${dateFin}`,
              html,
            }),
          });
          sent++;
        } catch (e) {
          console.error(`Erreur envoi à ${mon.name}:`, e);
        }
      }

      toast(`Planning envoyé à ${sent} moniteur${sent > 1 ? "s" : ""} par email`, "success");
    } catch (e: any) {
      console.error("Erreur notification:", e);
      toast(`Erreur : ${e.message || "Échec envoi"}`, "error");
    }
    setNotifying(false);
  };

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
          context: {
            _systemOverride: `Tu es l'assistant de gestion du Centre Équestre d'Agon-Coutainville. Analyse le planning management de l'équipe.`,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIaResult(data.answer || data.response || data.text || "Pas de réponse");
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
          {jourDates.slice(0, nbJours).map(({jour}) => <col key={jour} style={{width:`${Math.floor(90/nbJours)}%`}} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{padding:"6px 6px", textAlign:"left", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
              Salarié
            </th>
            {jourDates.slice(0, nbJours).map(({jour, label}) => (
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
              {jourDates.slice(0, nbJours).map(({jour}) => {
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
                                const allDays = JOURS.slice(0, nbJours) as JourSemaine[];
                                const allSelected = allDays.every(j => addForm.joursSelectionnes.includes(j));
                                setAddForm({...addForm, joursSelectionnes: allSelected ? [] : [...allDays]});
                              }}
                                style={{fontFamily:"sans-serif",fontSize:8,color:"#3b82f6",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline",padding:0}}>
                                {JOURS.slice(0, nbJours).every(j => addForm.joursSelectionnes.includes(j as JourSemaine)) ? "Aucun" : "Tous"}
                              </button>
                            </div>
                            <div style={{display:"flex",gap:2}}>
                              {JOURS.slice(0, nbJours).map(j => {
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

  // ── Vue Horaire (grille heures × jours, alignée) ──────────────────────────
  const HoraireView = () => {
    // Collecter tous les créneaux horaires uniques de la semaine
    const allSlots = new Set<string>();
    taches.forEach(t => allSlots.add(t.heureDebut));
    const slots = [...allSlots].sort();

    if (slots.length === 0) {
      return <div className="text-center py-8 text-slate-400 font-body text-sm">Aucune tâche cette semaine.</div>;
    }

    const activeSals = salaries.filter(s => s.actif);

    return (
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse", tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:"7%"}} />
            {jourDates.slice(0, nbJours).map(({jour}) => <col key={jour} style={{width:`${Math.floor(93/nbJours)}%`}} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{padding:"6px 4px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
                Heure
              </th>
              {jourDates.slice(0, nbJours).map(({jour, label}) => (
                <th key={jour} style={{padding:"6px 3px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, si) => {
              return (
                <tr key={slot} style={{background: si % 2 === 0 ? "#fafbff" : "#fff"}}>
                  <td style={{padding:"4px 4px", borderBottom:"1px solid #eef2f7", verticalAlign:"top", textAlign:"center"}}>
                    <span style={{fontFamily:"sans-serif", fontSize:12, fontWeight:700, color:"#1e3a5f"}}>{slot}</span>
                  </td>
                  {jourDates.slice(0, nbJours).map(({jour}) => {
                    const slotTaches = taches.filter(t => t.jour === jour && t.heureDebut === slot)
                      .sort((a, b) => a.salarieName.localeCompare(b.salarieName));
                    return (
                      <td key={jour} style={{padding:"2px 3px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                        <div style={{display:"flex", flexDirection:"column", gap:2}}>
                          {slotTaches.map(t => {
                            const cat = getCat(t.categorie);
                            const sal = activeSals.find(s => s.id === t.salarieId);
                            const color = getTaskColor(t);
                            return (
                              <div key={t.id} title={`${t.tacheLabel} — ${t.salarieName}\n${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}${t.notes ? "\n" + t.notes : ""}`}
                                style={{
                                  display:"flex", alignItems:"center", gap:3, padding:"2px 4px",
                                  borderRadius:5, background: t.done ? "#f0fdf4" : (color + "15"),
                                  borderLeft: `3px solid ${sal?.couleur || color}`,
                                  opacity: t.done ? 0.5 : 1,
                                }}>
                                <div style={{flex:1, minWidth:0}}>
                                  <div style={{fontFamily:"sans-serif", fontSize:9, fontWeight:700, color: color, lineHeight:"1.2", wordBreak:"break-word"}}>
                                    {t.tacheLabel}
                                  </div>
                                  <div style={{fontFamily:"sans-serif", fontSize:8, color:"#64748b"}}>
                                    {t.salarieName} · {fmtDuree(t.dureeMinutes)}
                                  </div>
                                </div>
                                <button onClick={()=>toggleDone(t)} style={{width:14,height:14,borderRadius:3,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                                  {t.done && <Check size={8} color="white"/>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
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
          {jourDates.slice(0, nbJours).map(({jour, date}) => {
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
            const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === jour)
              .sort((a,b) => heureToMin(a.heureDebut) - heureToMin(b.heureDebut));
            const dayActivities = creneaux.filter(c => {
              if (c.date !== dateStr) return false;
              // Support multi-moniteurs (séparés par virgule)
              const monitors = (c.monitor || "").split(",").map((s: string) => s.trim().toLowerCase());
              if (!monitors.includes(sal.nom.toLowerCase().trim())) return false;
              // Ne pas afficher si déjà importé comme tâche management
              const alreadyImported = dayTaches.some(t =>
                t.tacheLabel === c.activityTitle && t.heureDebut === c.startTime
              );
              return !alreadyImported;
            }).sort((a: any, b: any) => heureToMin(a.startTime) - heureToMin(b.startTime));
            const dayCharge = dayTaches
              .filter(t => t.categorie !== "pause")
              .reduce((s, t) => s + t.dureeMinutes, 0);
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

      {/* ── PRINT-ONLY HEADER ── */}
      <div className="print-header" style={{display:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid #1e3a5f",paddingBottom:8,marginBottom:12}}>
          <div>
            <div style={{fontFamily:"sans-serif",fontSize:18,fontWeight:800,color:"#1e3a5f"}}>
              Planning équipe — {lundi.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}
            </div>
            <div style={{fontFamily:"sans-serif",fontSize:12,color:"#64748b",marginTop:2}}>
              Semaine {semaine.split("-W")[1]} · {formatDateCourte(lundi)} → {formatDateCourte(new Date(lundi.getTime()+5*86400000))}
            </div>
          </div>
          <div style={{fontFamily:"sans-serif",fontSize:11,color:"#64748b",textAlign:"right"}}>
            Centre Équestre<br/>d'Agon-Coutainville
          </div>
        </div>
      </div>

      <div className="print-hide flex flex-col gap-4">

        {/* ── NAVIGATION SEMAINE + JOURS ── */}
        <Card padding="sm">
          <div className="flex items-center justify-between px-2 mb-3">
            <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
              <ChevronLeft size={16}/>Préc.
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <div className="font-display text-lg font-bold text-blue-800 capitalize">
                {lundi.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </div>
              <div className="font-body text-xs text-gray-400">
                Du {formatDateCourte(lundi)} au {formatDateCourte(new Date(lundi.getTime() + 5 * 86400000))} · Semaine {semaine.split("-W")[1]}
              </div>
              <input type="date" title="Aller à cette date"
                className="font-body text-[10px] px-2 py-0.5 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-gray-400 mt-0.5"
                onChange={e => {
                  if (!e.target.value) return;
                  const [py, pm, pd] = e.target.value.split("-").map(Number);
                  const picked = new Date(py, pm - 1, pd, 12);
                  const targetIso = getISOWeek(picked);
                  setSemaine(targetIso);
                  e.target.value = "";
                }}/>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSemaine(getISOWeek(new Date()))}
                className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 transition-colors">Auj.</button>
              <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
                Suiv.<ChevronRight size={16}/>
              </button>
            </div>
          </div>
          {/* Jours de la semaine */}
          <div className="grid gap-1.5 px-2" style={{gridTemplateColumns: `repeat(${nbJours}, 1fr)`}}>
            {jourDates.slice(0, nbJours).map(({ jour, date }) => {
              const isToday = (() => {
                const now = new Date();
                return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
              })();
              const hasTaches = taches.some(t => t.jour === jour);
              return (
                <div key={jour}
                  className={`text-center py-2 rounded-xl font-body text-xs font-semibold transition-all
                    ${isToday
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                      : hasTaches
                        ? "bg-blue-50 text-blue-800 border border-blue-100"
                        : "bg-gray-50 text-gray-400 border border-gray-100"
                    }`}>
                  {JOURS_LABELS[jour].slice(0, 3)} {date.getDate()}{date.getMonth() !== lundi.getMonth() ? `/${date.getMonth() + 1}` : ""}
                  {hasTaches && !isToday && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 align-middle" />}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── CARDS MONITEURS ── */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {salaries.filter(s=>s.actif).map(sal => {
            const charge = chargeParSalarie[sal.id]||0;
            const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
            const total = taches.filter(t=>t.salarieId===sal.id).length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;
            return (
              <Card key={sal.id} padding="sm">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:sal.couleur}}/>
                    <span className="font-display text-sm font-bold text-blue-800 truncate">{sal.nom}</span>
                  </div>
                  <div className="font-body text-lg font-bold text-blue-800">{fmtDuree(charge)}</div>
                  {total > 0 ? (
                    <>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${pct}%`, background:sal.couleur}}/>
                      </div>
                      <div className="font-body text-[10px] text-gray-400">{done}/{total} tâches ✓</div>
                    </>
                  ) : (
                    <div className="font-body text-[10px] text-gray-300">Aucune tâche</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── BARRE D'ACTIONS — 3 gros boutons ── */}
        <div className="flex gap-3 items-stretch">

          {/* ① Switcher de vue — toujours visible */}
          <div className="flex bg-gray-100 rounded-2xl p-1.5 gap-1 flex-shrink-0">
            {(["tableau","horaire","fiche"] as const).map(v => (
              <button key={v} onClick={()=>setView(v)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl font-body text-xs font-semibold border-none cursor-pointer transition-all min-w-[72px]
                  ${view===v ? "bg-white text-blue-700 shadow-sm" : "bg-transparent text-gray-400 hover:text-blue-700 hover:bg-white/60"}`}>
                <span className="text-lg">{v === "tableau" ? "📊" : v === "horaire" ? "🕐" : "📋"}</span>
                <span>{v === "tableau" ? "Tableau" : v === "horaire" ? "Horaire" : "Fiche"}</span>
              </button>
            ))}
          </div>

          {/* ② Bouton Planning */}
          <button
            onClick={() => setOpenPanel(openPanel === "planning" ? null : "planning")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "planning"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "planning" ? "bg-white/20" : "bg-blue-50"}`}>
              📅
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Planning</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "planning" ? "text-white/70" : "text-gray-400"}`}>
                Importer, modèles, organisation
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "planning" ? "rotate-180" : ""}`}>⌄</div>
          </button>

          {/* ③ Bouton Partager */}
          <button
            onClick={() => setOpenPanel(openPanel === "partager" ? null : "partager")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "partager"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "partager" ? "bg-white/20" : "bg-blue-50"}`}>
              📤
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Partager</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "partager" ? "text-white/70" : "text-gray-400"}`}>
                Imprimer, envoyer par email
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "partager" ? "rotate-180" : ""}`}>⌄</div>
          </button>
        </div>

        {/* ── PANEL PLANNING ── */}
        {openPanel === "planning" && (
          <Card padding="md">
            <div className="grid grid-cols-3 gap-4">

              {/* Importer cours/stages */}
              <button onClick={() => { handleImportCreneaux(); setOpenPanel(null); }} disabled={importing}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-purple-100 bg-purple-50 hover:border-purple-300 hover:bg-purple-100 cursor-pointer text-left transition-all disabled:opacity-50 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {importing ? <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> : "📅"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-purple-800">{importing ? "Import en cours…" : "Importer cours/stages"}</div>
                  <div className="font-body text-xs text-purple-500 mt-0.5">Récupère automatiquement les créneaux du planning de la semaine</div>
                </div>
              </button>

              {/* Appliquer un modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-green-100 bg-green-50 hover:border-green-300 hover:bg-green-100 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                  <LayoutTemplate size={20} className="text-green-600" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-green-800">Appliquer un modèle</div>
                  <div className="font-body text-xs text-green-600 mt-0.5">Charge une semaine type enregistrée</div>
                </div>
                {modeles.length === 0 ? (
                  <p className="font-body text-xs text-green-500 italic">Aucun modèle. Créez-en ci-dessous.</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                    {modeles.map(m => (
                      <button key={m.id} onClick={() => { handleApplyModele(m); }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-green-50 cursor-pointer border border-green-200 hover:border-green-400 text-left transition-colors">
                        <span className="text-sm">{m.type === "scolaire" ? "📚" : m.type === "vacances" ? "☀️" : "📌"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-green-800 truncate">{m.nom}</div>
                          <div className="font-body text-[9px] text-gray-400">{m.taches.length} tâches</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sauvegarder comme modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-200 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Save size={20} className="text-blue-500" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Sauvegarder modèle</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Enregistre la semaine actuelle comme template</div>
                </div>
                {taches.length === 0 ? (
                  <p className="font-body text-xs text-blue-400 italic">Aucune tâche cette semaine.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input value={saveModeleName} onChange={e => setSaveModeleName(e.target.value)}
                      placeholder="Nom du modèle…"
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 text-blue-800 bg-white" />
                    <div className="flex gap-1">
                      {([["scolaire","📚","Scolaire"],["vacances","☀️","Vacances"],["autre","📌","Autre"]] as const).map(([id, emoji, label]) => (
                        <button key={id} onClick={() => setSaveModeleType(id)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border font-body text-[10px] font-semibold cursor-pointer transition-all
                            ${saveModeleType === id ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-blue-800 border-blue-200 hover:border-blue-400"}`}>
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleSaveAsModele}
                      className="w-full py-2 rounded-xl bg-blue-500 text-white font-body text-xs font-semibold cursor-pointer border-none hover:bg-blue-400 shadow-md shadow-blue-500/20 transition-colors">
                      Créer le modèle ({taches.length} tâches)
                    </button>
                  </div>
                )}
              </div>

            </div>
          </Card>
        )}

        {/* ── PANEL PARTAGER ── */}
        {openPanel === "partager" && (
          <Card padding="md">
            <div className="grid grid-cols-2 gap-4">

              {/* Imprimer */}
              <button onClick={() => { window.print(); setOpenPanel(null); }} disabled={taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:shadow">
                  <Printer size={20} className="text-blue-800" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Imprimer</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Format A4 paysage, optimisé pour l'impression</div>
                </div>
              </button>

              {/* Email équipe */}
              <button onClick={() => { handleNotifyEquipe(); setOpenPanel(null); }} disabled={notifying || taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {notifying ? <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> : "📧"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">{notifying ? "Envoi en cours…" : "Email à l'équipe"}</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Envoie le planning personnalisé à chaque moniteur</div>
                </div>
              </button>

            </div>
          </Card>
        )}

        {/* ── ALERTES ── */}
        {conflits.length > 0 && (
          <div style={{background: showConflits ? "#fffbeb" : "#f8fafc", border: showConflits ? "1px solid #fde68a" : "1px solid #e2e8f0", borderRadius:12, padding: showConflits ? "12px 16px" : "8px 16px", display:"flex", alignItems:"center", gap:10}}>
            <span style={{fontSize: showConflits ? 18 : 14, flexShrink:0}}>{showConflits ? "🔴" : "⚪"}</span>
            {showConflits ? (
              <div style={{flex:1}}>
                <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#92400e",marginBottom:6}}>
                  {conflits.length} conflit{conflits.length > 1 ? "s" : ""} horaire{conflits.length > 1 ? "s" : ""} détecté{conflits.length > 1 ? "s" : ""}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {conflits.map((c, i) => (
                    <div key={i} style={{fontFamily:"sans-serif",fontSize:11,color:"#78350f",display:"flex",alignItems:"center",gap:6,background:"#fef3c7",padding:"4px 10px",borderRadius:6,flexWrap:"wrap"}}>
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
            ) : (
              <span style={{fontFamily:"sans-serif",fontSize:11,color:"#94a3b8",flex:1}}>
                {conflits.length} conflit{conflits.length > 1 ? "s" : ""} masqué{conflits.length > 1 ? "s" : ""}
              </span>
            )}
            <button onClick={() => setShowConflits(!showConflits)}
              style={{flexShrink:0,padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"white",fontFamily:"sans-serif",fontSize:10,color:"#64748b",cursor:"pointer",fontWeight:600}}>
              {showConflits ? "Masquer" : "Afficher"}
            </button>
          </div>
        )}

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

      </div>{/* fin print-hide */}

      {/* ── VUE PRINCIPALE ── */}
      <Card padding="md" className="overflow-hidden print-keep">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? <TableauView/>
          : view === "horaire" ? <HoraireView/>
          : <FicheView/>}
      </Card>

      <style>{`
        @media print {
          aside, nav, header,
          [data-sidebar], [data-header],
          .no-print, .print-hide,
          .md\\:hidden, .sticky {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex > :first-child {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex {
            display: block !important;
          }
          .min-h-screen.bg-cream.flex > .flex-1 {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          h1, .flex.flex-col.sm\\:flex-row,
          .flex.flex-wrap.gap-2:not(.print-keep) {
            display: none !important;
          }
          body, body > div, main, [role="main"], div {
            background: white !important;
          }
          body { padding: 0 !important; margin: 0 !important; }
          .print-header { display: block !important; }
          .print-keep {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
          .print-keep button { display: none !important; }
          table { font-size: 10px !important; }
          td, th { padding: 3px 4px !important; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}
