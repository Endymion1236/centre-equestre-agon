"use client";
/**
 * src/app/admin/parametres/page.tsx
 *
 * Écran d'administration des réglages du centre. Chaque onglet écrit un
 * document `settings/*` de Firestore (ou une collection dédiée pour les
 * vacances, les moniteurs et les marées).
 *
 * Ce fichier est l'ORCHESTRATEUR : il détient l'état, les chargements et les
 * sauvegardes, et distribue le tout aux composants de section (Section*.tsx).
 * Les sections sont des composants de présentation ; l'état est resté ici pour
 * une raison précise : plusieurs chargements se font à l'ouverture de la PAGE
 * et non à l'affichage de l'onglet (le semis des vacances scolaires écrit même
 * en base au premier lancement), et un onglet qu'on quitte puis rouvre doit
 * retrouver ce qu'on y avait saisi.
 *
 * ⚠️ Les réglages saisis ici pilotent toute l'application, facturation
 * comprise. Les noms de champs et de documents sont un contrat avec les autres
 * pages (voir types.ts) : un champ écrit sous une mauvaise clé ne se remarque
 * pas ici, il se remarque sur une facture.
 */
import { useAgentContext } from "@/hooks/useAgentContext";
import { STAGE_DEROULE_VIDE, type StageDeroule } from "@/lib/stage-deroule";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Save } from "lucide-react";
import MareesSection from "./MareesSection";
import { DEFAULT_ECHELLE_LABELS, DEFAULT_VALIDATED_FFE_LEVEL, type ProgressionLabelsSettings } from "@/lib/progression-helpers";
import { DEFAULT_VACATION_PERIODS, EPREUVES_PAR_DEFAUT } from "./constantes";
import type {
  CustomInscriptionLine, MaintenanceTab, Promo, SectionId, VacationPeriod,
} from "./types";
import { useComptesMoniteurs } from "./useComptesMoniteurs";
import SectionCentre from "./SectionCentre";
import SectionInscription from "./SectionInscription";
import SectionReductions from "./SectionReductions";
import SectionDegressivite from "./SectionDegressivite";
import SectionVacances from "./SectionVacances";
import { SectionAnnulation, SectionPlanComptable, SectionHoraires } from "./SectionsSimples";
import SectionMoniteurs from "./SectionMoniteurs";
import SectionEpreuves from "./SectionEpreuves";
import SectionProgression from "./SectionProgression";
import SectionFidelite from "./SectionFidelite";
import SectionStageDeroule from "./SectionStageDeroule";
import SectionMaintenance from "./SectionMaintenance";
import SectionNotifications from "./SectionNotifications";

export default function ParametresPage() {
    const { setAgentContext } = useAgentContext("parametres");

  useEffect(() => {
    setAgentContext({ module_actif: "parametres", description: "moniteurs, tarifs, infos centre" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [section, setSection] = useState<SectionId>("centre");
  // Ouvrir directement une section via l'URL (ex. /admin/parametres?section=moniteurs)
  useEffect(() => {
    const allowed = ["centre","reductions","degressivite","vacances","annulation","comptable","horaires","moniteurs","fidelite","inscription","epreuves","progression","maintenance","notifications","marees","stages"];
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && allowed.includes(s)) setSection(s as any);
  }, []);
  const [notifSettings, setNotifSettings] = useState({
    nouvelle_inscription: true,
    nouveau_paiement: true,
    impaye: true,
    liste_attente: true,
    annulation: true,
    nouveau_cavalier: false,
    rappel_stage: true,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [testPushSending, setTestPushSending] = useState(false);
  const [maintenanceTab, setMaintenanceTab] = useState<MaintenanceTab>("nettoyage");
  // ─── Infos Centre ───
  const [centreParams, setCentreParams] = useState({
    nom: "Centre Equestre d'Agon-Coutainville",
    legalName: "E.A.R.L. Centre Equestre Poney Club d'Agon-Coutainville",
    address: "56 Charrière du Commerce, 50230 Agon-Coutainville",
    tel: "02 44 84 99 96",
    email: "ceagon@orange.fr",
    siret: "50756918400017",
    tvaIntra: "",
    iban: "FR76 1660 6100 6400 1353 9343 253",
    bic: "AGRIFRPP866",
    website: "https://centreequestreagon.com",
    // Seuils poneys
    seuilPoneyOrange: 3,   // nb séances → alerte orange
    seuilPoneyRouge: 4,    // nb séances → alerte rouge
    seuilPoneyHeures: 4,   // nb heures max/jour
  });
  const [centreSaved, setCentreSaved] = useState(false);

  // ─── Paramètres inscription annuelle ───
  const [inscriptionParams, setInscriptionParams] = useState({
    // Forfaits par fréquence
    forfait1x: 650,
    forfait2x: 1100,
    forfait3x: 1400,
    // Adhésion dégressive
    adhesion1: 60,
    adhesion2: 40,
    adhesion3: 20,
    adhesion4plus: 0,
    // Licence FFE
    licenceMoins18: 25,
    licencePlus18: 36,
    licenceTvaRate: 0,           // TVA appliquée à la licence FFE (typiquement 0%)
    licenceAccountCode: "70100000", // code comptable de la licence
    // Saison
    totalSessionsSaison: 35,
    dateFinSaison: "2026-06-30",
    // Stages
    assuranceOccasionnelle: 10,
    // Lignes libres optionnelles (forfait compétition, options, suppléments...)
    customLines: [] as CustomInscriptionLine[],
  });
  const [inscriptionSaved, setInscriptionSaved] = useState(false);

  // ─── Épreuves compétition ───
  const [epreuves, setEpreuves] = useState<Record<string, string[]>>(EPREUVES_PAR_DEFAUT);
  const [epreuvesSaved, setEpreuvesSaved] = useState(false);
  const [newEpreuve, setNewEpreuve] = useState<Record<string, string>>({});

  useEffect(() => {
    getDoc(doc(db, "settings", "notifications")).then(snap => {
      if (snap.exists()) setNotifSettings(prev => ({ ...prev, ...snap.data() }));
    });
  }, []);

  useEffect(() => {
    if (section !== "epreuves") return;
    getDoc(doc(db, "settings", "competitions")).then(snap => {
      if (snap.exists()) setEpreuves(prev => ({ ...prev, ...snap.data() }));
    });
  }, [section]);

  const saveEpreuves = async () => {
    await setDoc(doc(db, "settings", "competitions"), { ...epreuves, updatedAt: new Date() });
    setEpreuvesSaved(true);
    setTimeout(() => setEpreuvesSaved(false), 2000);
  };

  // ─── Déroulé des stages (2 séquences) ────────────────────────────────────
  // Réglage unique partagé par tous les stages. Repris dans les emails de
  // confirmation ET de rappel. Tant qu'il est vide, aucun bloc n'apparaît
  // dans les emails : on n'annonce jamais un déroulé qu'on n'a pas saisi.
  const [deroule, setDeroule] = useState<StageDeroule>(STAGE_DEROULE_VIDE);
  const [derouleSaved, setDerouleSaved] = useState(false);
  useEffect(() => {
    if (section !== "stages") return;
    getDoc(doc(db, "settings", "stageDeroule")).then(snap => {
      if (snap.exists()) setDeroule(prev => ({ ...prev, ...(snap.data() as any) }));
    });
  }, [section]);
  const saveDeroule = async () => {
    await setDoc(doc(db, "settings", "stageDeroule"), {
      sequence1Titre: deroule.sequence1Titre.trim(),
      sequence1Detail: deroule.sequence1Detail.trim(),
      sequence2Titre: deroule.sequence2Titre.trim(),
      sequence2Detail: deroule.sequence2Detail.trim(),
      note: (deroule.note || "").trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setDerouleSaved(true);
    setTimeout(() => setDerouleSaved(false), 2000);
  };

  // ─── Progression : labels échelle 1-5 + seuil "validé FFE" ────────────────
  const [progressionLabels, setProgressionLabels] = useState<string[]>(DEFAULT_ECHELLE_LABELS);
  const [progressionValidatedFfe, setProgressionValidatedFfe] = useState<number>(DEFAULT_VALIDATED_FFE_LEVEL);
  const [progressionSaved, setProgressionSaved] = useState(false);
  useEffect(() => {
    if (section !== "progression") return;
    getDoc(doc(db, "settings", "progression_labels")).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as ProgressionLabelsSettings;
        if (Array.isArray(data.echelle) && data.echelle.length === 5) {
          setProgressionLabels(data.echelle);
        }
        if (typeof data.validatedFfe === "number") {
          setProgressionValidatedFfe(data.validatedFfe);
        }
      }
    });
  }, [section]);
  const saveProgressionLabels = async () => {
    // Validation : les 5 labels doivent être non vides
    const cleaned = progressionLabels.map(l => l.trim()).map(l => l || "Niveau");
    await setDoc(doc(db, "settings", "progression_labels"), {
      echelle: cleaned,
      validatedFfe: progressionValidatedFfe,
      updatedAt: serverTimestamp(),
    } as ProgressionLabelsSettings, { merge: true });
    setProgressionLabels(cleaned);
    setProgressionSaved(true);
    setTimeout(() => setProgressionSaved(false), 2000);
  };
  const [moniteurs, setMoniteurs] = useState<any[]>([]);
  const [showAddMoniteur, setShowAddMoniteur] = useState(false);
  const [editMoniteurId, setEditMoniteurId] = useState<string | null>(null);
  const [moniteurForm, setMoniteurForm] = useState({ name: "", role: "", email: "", phone: "", status: "active" });
  const [moniteurSaving, setMoniteurSaving] = useState(false);
  // Comptes de connexion (Firebase Auth) — pour afficher/gérer l'accès depuis ici.
  // On relie un compte à une fiche moniteur par l'EMAIL. Voir useComptesMoniteurs.ts.
  const {
    authMoniteurs, accountBusy, reloadAuthMoniteurs,
    accountFor, createAccess, deleteAccess, refreshAccessClaim, diagAccess,
  } = useComptesMoniteurs();

  useEffect(() => {
    if (section !== "moniteurs") return;
    getDocs(collection(db, "moniteurs")).then(snap => {
      setMoniteurs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    reloadAuthMoniteurs();
  }, [section]);

  // ─── Fidélité ───
  const [fideliteEnabled, setFideliteEnabled] = useState(false);
  const [fideliteTaux, setFideliteTaux] = useState(100); // 100 points = 1€
  const [fideliteMinPoints, setFideliteMinPoints] = useState(500); // minimum pour utiliser
  const [fideliteSaved, setFideliteSaved] = useState(false);

  const [multiStage, setMultiStage] = useState([
    { nth: 2, discount: 10 },
    { nth: 3, discount: 15 },
    { nth: 4, discount: 20 },
  ]);
  const [familyDiscount, setFamilyDiscount] = useState([
    { nth: 2, discount: 5 },
    { nth: 3, discount: 10 },
    { nth: 4, discount: 15 },
  ]);
  // Prix plancher par stage (configurable admin). 0 = pas de plancher.
  // Voir lib/discounts.ts > applyDiscounts pour l'application.
  const [prixPlancherStage, setPrixPlancherStage] = useState<number>(0);
  const [cancellation, setCancellation] = useState({ hours: 72, retention: 50 });

  // ═══ Vacances scolaires ═══ (type VacationPeriod : voir types.ts)
  const [vacations, setVacations] = useState<VacationPeriod[]>([]);
  const [loadingVacations, setLoadingVacations] = useState(true);
  const [savingVacation, setSavingVacation] = useState(false);
  const [newVacName, setNewVacName] = useState("");
  const [newVacStart, setNewVacStart] = useState("");
  const [newVacEnd, setNewVacEnd] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "vacationPeriods"));
        if (snap.empty) {
          // Seed automatique au premier lancement
          for (const p of DEFAULT_VACATION_PERIODS) {
            await addDoc(collection(db, "vacationPeriods"), { ...p, createdAt: serverTimestamp() });
          }
          const newSnap = await getDocs(collection(db, "vacationPeriods"));
          setVacations(newSnap.docs.map(d => ({ id: d.id, ...d.data() } as VacationPeriod)));
        } else {
          setVacations(snap.docs.map(d => ({ id: d.id, ...d.data() } as VacationPeriod)));
        }
      } catch (e) { console.error("[parametres] load vacations:", e); }
      setLoadingVacations(false);
    })();
  }, []);
  const handleAddVacation = async () => {
    if (!newVacName || !newVacStart || !newVacEnd) { alert("Merci de remplir tous les champs."); return; }
    if (newVacStart > newVacEnd) { alert("La date de début doit être antérieure à la date de fin."); return; }
    setSavingVacation(true);
    try {
      const ref = await addDoc(collection(db, "vacationPeriods"), {
        name: newVacName, startDate: newVacStart, endDate: newVacEnd, createdAt: serverTimestamp(),
      });
      setVacations([...vacations, { id: ref.id, name: newVacName, startDate: newVacStart, endDate: newVacEnd }]);
      setNewVacName(""); setNewVacStart(""); setNewVacEnd("");
    } catch (e) { console.error(e); alert("Erreur : " + (e as any).message); }
    setSavingVacation(false);
  };
  const handleUpdateVacation = async (id: string, field: string, value: string) => {
    setVacations(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
    try { await updateDoc(doc(db, "vacationPeriods", id), { [field]: value }); } catch (e) { console.error(e); }
  };
  const handleDeleteVacation = async (id: string) => {
    if (!confirm("Supprimer cette période ?")) return;
    try { await deleteDoc(doc(db, "vacationPeriods", id)); setVacations(vacations.filter(v => v.id !== id)); } catch (e) { console.error(e); }
  };
  const [saved, setSaved] = useState(false);
  const [savingDegress, setSavingDegress] = useState(false);

  // Charger dégressivité depuis Firestore
  useEffect(() => {
    getDoc(doc(db, "settings", "degressivite")).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.multiStage) setMultiStage(data.multiStage);
        if (data.familyDiscount) setFamilyDiscount(data.familyDiscount);
        if (data.cancellation) setCancellation(data.cancellation);
        if (typeof data.prixPlancherStage === "number") setPrixPlancherStage(data.prixPlancherStage);
      }
    }).catch(console.error);
  }, []);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);

  // Charger les promos depuis Firestore
  useEffect(() => {
    const loadPromos = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "promos"));
        if (snap.exists() && snap.data().items) {
          setPromos(snap.data().items);
        }
      } catch (e) { console.error(e); }
      setLoadingPromos(false);
    };
    loadPromos();
  }, []);

  const savePromos = async () => {
    try {
      await setDoc(doc(db, "settings", "promos"), { items: promos, updatedAt: new Date() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert("Erreur sauvegarde"); }
  };

  // Charger les paramètres depuis Firestore
  // NB : la collection settings/tarifs (legacy de l'ancien onglet "Tarifs annuels")
  // n'est plus lue ici. Les données qui y sont restent en base au cas où mais
  // seul settings/inscription est désormais la source de vérité.
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [inscSnap, centreSnap] = await Promise.all([
          getDoc(doc(db, "settings", "inscription")),
          getDoc(doc(db, "settings", "centre")),
        ]);
        if (inscSnap.exists()) setInscriptionParams(prev => ({ ...prev, ...inscSnap.data() }));
        if (centreSnap.exists()) setCentreParams(prev => ({ ...prev, ...centreSnap.data() }));
      } catch (e) { console.error("Erreur chargement paramètres:", e); }
    };
    loadSettings();
  }, []);

  const saveCentre = async () => {
    try {
      await setDoc(doc(db, "settings", "centre"), { ...centreParams, updatedAt: new Date() });
      setCentreSaved(true);
      setTimeout(() => setCentreSaved(false), 2000);
    } catch (e) { console.error(e); alert("Erreur sauvegarde"); }
  };

  const saveInscription = async () => {
    try {
      await setDoc(doc(db, "settings", "inscription"), { ...inscriptionParams, updatedAt: new Date() });
      setInscriptionSaved(true);
      setTimeout(() => setInscriptionSaved(false), 2000);
    } catch (e) { console.error(e); alert("Erreur sauvegarde"); }
  };

  // Charger paramètres fidélité
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "fidelite"));
        if (snap.exists()) {
          const d = snap.data();
          setFideliteEnabled(d.enabled ?? false);
          setFideliteTaux(d.taux ?? 100);
          setFideliteMinPoints(d.minPoints ?? 500);
        }
      } catch (e) { console.error("Erreur chargement fidélité:", e); }
    };
    load();
  }, []);

  const saveFidelite = async () => {
    try {
      await setDoc(doc(db, "settings", "fidelite"), {
        enabled: fideliteEnabled,
        taux: fideliteTaux,
        minPoints: fideliteMinPoints,
        updatedAt: new Date(),
      });
      setFideliteSaved(true);
      setTimeout(() => setFideliteSaved(false), 2000);
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    setSavingDegress(true);
    try {
      await setDoc(doc(db, "settings", "degressivite"), {
        multiStage,
        familyDiscount,
        cancellation,
        prixPlancherStage,
        updatedAt: new Date(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Erreur sauvegarde dégressivité:", e);
      alert("Erreur lors de la sauvegarde.");
    }
    setSavingDegress(false);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Paramètres</h1>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {([
          ["centre", "🏠 Centre"],
          ["inscription", "📋 Inscription annuelle"],
          ["reductions", "Réductions & promos"],
          ["degressivite", "Dégressivité"],
          ["vacances", "📅 Vacances scolaires"],
          ["annulation", "Annulation"],
          ["comptable", "Plan comptable"],
          ["horaires", "Horaires"],
          ["moniteurs", "Moniteurs"],
          ["epreuves", "🏆 Épreuves"],
          ["progression", "📈 Progression"],
          ["fidelite", "🏆 Fidélité"],
          ["notifications", "🔔 Notifications"],
          ["stages", "🐴 Déroulé stages"],
          ["marees", "🌊 Marées"],
          ["maintenance", "Maintenance"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${section === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Success message */}
      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700 flex items-center gap-2">
          <Save size={16} /> Modifications enregistrées !
        </div>
      )}

      {/* ─── Tarifs annuels ─── */}
      {/* ─── Centre ─── */}
      {section === "centre" && (
        <SectionCentre
          centreParams={centreParams}
          setCentreParams={setCentreParams}
          centreSaved={centreSaved}
          saveCentre={saveCentre}
        />
      )}

      {/* ─── Réductions & promos ─── */}
      {section === "reductions" && (
        <SectionReductions
          promos={promos}
          setPromos={setPromos}
          loadingPromos={loadingPromos}
          savePromos={savePromos}
        />
      )}

      {/* ─── Dégressivité ─── */}
      {section === "degressivite" && (
        <SectionDegressivite
          multiStage={multiStage}
          setMultiStage={setMultiStage}
          familyDiscount={familyDiscount}
          setFamilyDiscount={setFamilyDiscount}
          prixPlancherStage={prixPlancherStage}
          setPrixPlancherStage={setPrixPlancherStage}
          handleSave={handleSave}
          savingDegress={savingDegress}
        />
      )}

      {/* ─── Vacances scolaires ─── */}
      {section === "vacances" && (
        <SectionVacances
          vacations={vacations}
          loadingVacations={loadingVacations}
          savingVacation={savingVacation}
          newVacName={newVacName}
          setNewVacName={setNewVacName}
          newVacStart={newVacStart}
          setNewVacStart={setNewVacStart}
          newVacEnd={newVacEnd}
          setNewVacEnd={setNewVacEnd}
          handleAddVacation={handleAddVacation}
          handleUpdateVacation={handleUpdateVacation}
          handleDeleteVacation={handleDeleteVacation}
        />
      )}

      {/* ─── Annulation ─── */}
      {section === "annulation" && (
        <SectionAnnulation
          cancellation={cancellation}
          setCancellation={setCancellation}
          handleSave={handleSave}
        />
      )}

      {/* ─── Plan comptable ─── */}
      {section === "comptable" && (
        <SectionPlanComptable />
      )}

      {/* ─── Horaires ─── */}
      {section === "horaires" && (
        <SectionHoraires handleSave={handleSave} />
      )}

      {/* ─── Moniteurs ─── */}
      {section === "moniteurs" && (
        <SectionMoniteurs
          moniteurs={moniteurs}
          setMoniteurs={setMoniteurs}
          authMoniteurs={authMoniteurs}
          accountBusy={accountBusy}
          accountFor={accountFor}
          createAccess={createAccess}
          deleteAccess={deleteAccess}
          refreshAccessClaim={refreshAccessClaim}
          diagAccess={diagAccess}
          showAddMoniteur={showAddMoniteur}
          setShowAddMoniteur={setShowAddMoniteur}
          editMoniteurId={editMoniteurId}
          setEditMoniteurId={setEditMoniteurId}
          moniteurForm={moniteurForm}
          setMoniteurForm={setMoniteurForm}
          moniteurSaving={moniteurSaving}
          setMoniteurSaving={setMoniteurSaving}
        />
      )}

      {/* ─── Inscription annuelle ─── */}
      {section === "inscription" && (
        <SectionInscription
          inscriptionParams={inscriptionParams}
          setInscriptionParams={setInscriptionParams}
          inscriptionSaved={inscriptionSaved}
          saveInscription={saveInscription}
        />
      )}

      {/* ─── Épreuves compétition ─── */}
      {section === "epreuves" && (
        <SectionEpreuves
          epreuves={epreuves}
          setEpreuves={setEpreuves}
          newEpreuve={newEpreuve}
          setNewEpreuve={setNewEpreuve}
          epreuvesSaved={epreuvesSaved}
          saveEpreuves={saveEpreuves}
        />
      )}

      {/* ─── Progression : labels échelle 1-5 ─── */}
      {section === "progression" && (
        <SectionProgression
          progressionLabels={progressionLabels}
          setProgressionLabels={setProgressionLabels}
          progressionValidatedFfe={progressionValidatedFfe}
          setProgressionValidatedFfe={setProgressionValidatedFfe}
          progressionSaved={progressionSaved}
          saveProgressionLabels={saveProgressionLabels}
        />
      )}

      {/* ─── Fidélité ─── */}
      {section === "fidelite" && (
        <SectionFidelite
          fideliteEnabled={fideliteEnabled}
          setFideliteEnabled={setFideliteEnabled}
          fideliteTaux={fideliteTaux}
          setFideliteTaux={setFideliteTaux}
          fideliteMinPoints={fideliteMinPoints}
          setFideliteMinPoints={setFideliteMinPoints}
          fideliteSaved={fideliteSaved}
          saveFidelite={saveFidelite}
        />
      )}

      {/* ─── Marées ─── */}
      {section === "stages" && (
        <SectionStageDeroule
          deroule={deroule}
          setDeroule={setDeroule}
          derouleSaved={derouleSaved}
          saveDeroule={saveDeroule}
        />
      )}

      {section === "marees" && (
        <MareesSection />
      )}

      {/* ─── Maintenance ─── */}
      {section === "maintenance" && (
        <SectionMaintenance
          maintenanceTab={maintenanceTab}
          setMaintenanceTab={setMaintenanceTab}
        />
      )}

      {section === "notifications" && (
        <SectionNotifications
          notifSettings={notifSettings}
          setNotifSettings={setNotifSettings}
          notifSaving={notifSaving}
          setNotifSaving={setNotifSaving}
          testPushSending={testPushSending}
          setTestPushSending={setTestPushSending}
          setSaved={setSaved}
        />
      )}

    </div>
  );
}
