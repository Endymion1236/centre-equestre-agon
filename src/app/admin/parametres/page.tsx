"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CGV_STAGES_CAS, CGV_COURS_ANNUELS, CGV_BALADES, CGV_BALADES_PETIT_GROUPE, CGV_ANNULATION_CENTRE } from "@/lib/cgv-clauses";
import { Card, Badge } from "@/components/ui";
import { Save, Plus, Trash2, Loader2, Calendar } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import MareesSection from "./MareesSection";
import SectionMaintenance from "./SectionMaintenance";
import SectionMoniteurs from "./SectionMoniteurs";
import SectionReductions from "./SectionReductions";
import SectionStages from "./SectionStages";
import SectionProgression from "./SectionProgression";

const defaultAccounts = [
  { code: "70641000", label: "Animations collectivité", tva: "5.50%", affectation: "Animations CE, collectivités" },
  { code: "70611110", label: "Cotisations / Adhésions", tva: "5.50%", affectation: "Adhésions annuelles" },
  { code: "70611600", label: "Découverte / Familiarisation", tva: "5.50%", affectation: "Séances découverte, baby poney" },
  { code: "70605000", label: "Divers", tva: "20%", affectation: "Produits divers" },
  { code: "70619900", label: "Droits d'accès installations", tva: "5.50%", affectation: "Accès carrière, manège" },
  { code: "70611300", label: "Enseignement / Cartes", tva: "5.50%", affectation: "Cartes d'heures" },
  { code: "70611700", label: "Enseignement / Coaching", tva: "5.50%", affectation: "Cours particuliers, coaching" },
  { code: "70611000", label: "Enseignement / Forfaits", tva: "5.50%", affectation: "Forfaits annuels, trimestriels" },
  { code: "4386", label: "Formation professionnelle", tva: "0%", affectation: "BPJEPS, formations" },
  { code: "70613110", label: "Location poneys", tva: "20%", affectation: "Location poneys extérieurs" },
  { code: "70630110", label: "Pensions équidé", tva: "5.50%", affectation: "Pensions box, paddock" },
  { code: "70611500", label: "Randonnées / Promenades", tva: "5.50%", affectation: "Balades plage, randonnées" },
  { code: "70100000", label: "Refacturation FFE", tva: "0%", affectation: "Licences FFE refacturées" },
  { code: "70880000", label: "Refacturation soin", tva: "20%", affectation: "Soins vétérinaires refacturés" },
  { code: "70611400", label: "Stages équitation", tva: "5.50%", affectation: "Stages vacances" },
  { code: "70622011", label: "Transport", tva: "20%", affectation: "Transport chevaux/cavaliers" },
  { code: "70410000", label: "Ventes équidés", tva: "20%", affectation: "Vente de chevaux/poneys" },
];

export default function ParametresPage() {
    const { setAgentContext } = useAgentContext("parametres");

  useEffect(() => {
    setAgentContext({ module_actif: "parametres", description: "moniteurs, tarifs, infos centre" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [section, setSection] = useState<"centre" | "reductions" | "degressivite" | "vacances" | "annulation" | "comptable" | "moniteurs" | "fidelite" | "inscription" | "progression" | "maintenance" | "notifications" | "marees" | "stages">("centre");

  // Ouvrir directement une section via l'URL (ex. /admin/parametres?section=moniteurs)
  useEffect(() => {
    const allowed = ["centre","reductions","degressivite","vacances","annulation","comptable","moniteurs","fidelite","inscription","progression","maintenance","notifications","marees","stages"];
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && allowed.includes(s)) setSection(s as any);
  }, []);
  const [testPushSending, setTestPushSending] = useState(false);

  // ─── Infos Centre ───
  const [centreParams, setCentreParams] = useState({
    nom: "Centre Equestre d'Agon-Coutainville",
    legalName: "E.A.R.L. Centre Equestre Poney Club d'Agon-Coutainville",
    address: "56 Charrière du Commerce, 50230 Agon-Coutainville",
    tel: "02 44 84 99 96",
    email: "ceagon50@gmail.com",
    siret: "50756918400017",
    tvaIntra: "",
    iban: "FR76 1660 6100 6400 1353 9343 253",
    bic: "AGRIFRPP866",
    website: "https://centreequestreagon.com",
    // Envoi mensuel des écritures à la comptable (Boucler le mois + cron du 5)
    emailComptable: "",
    envoiComptableAuto: false,
    // Seuils poneys
    seuilPoneyOrange: 3,   // nb séances → alerte orange
    seuilPoneyRouge: 4,    // nb séances → alerte rouge
    seuilPoneyHeures: 4,   // nb heures max/jour
  });
  const [centreSaved, setCentreSaved] = useState(false);

  // ─── Type d'une ligne optionnelle libre ───
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
    // Saison
    totalSessionsSaison: 35,
    dateFinSaison: "2026-06-30",
    // Stages
    assuranceOccasionnelle: 10,
  });
  const [inscriptionSaved, setInscriptionSaved] = useState(false);


  // ─── Fidélité ───
  const [fideliteEnabled, setFideliteEnabled] = useState(false);
  // Option « balades petit comité » : maître ON/OFF de toute la mécanique
  // (emails J-2, choix supplément/report/avoir/remboursement, bouton de test).
  const [petitGroupeActif, setPetitGroupeActif] = useState(true);
  const [petitGroupeSaving, setPetitGroupeSaving] = useState(false);
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

  // ═══ Vacances scolaires ═══
  // Source pour la logique de réduction famille/multi-stages.
  interface VacationPeriod { id: string; name: string; startDate: string; endDate: string; }
  const [vacations, setVacations] = useState<VacationPeriod[]>([]);
  const [loadingVacations, setLoadingVacations] = useState(true);
  const [savingVacation, setSavingVacation] = useState(false);
  const [newVacName, setNewVacName] = useState("");
  const [newVacStart, setNewVacStart] = useState("");
  const [newVacEnd, setNewVacEnd] = useState("");
  // Vacances scolaires zone B 2025-2026 (source : education.gouv.fr)
  const DEFAULT_VACATION_PERIODS = [
    { name: "Vacances de la Toussaint 2025", startDate: "2025-10-18", endDate: "2025-11-03" },
    { name: "Vacances de Noël 2025", startDate: "2025-12-20", endDate: "2026-01-05" },
    { name: "Vacances d'Hiver 2026", startDate: "2026-02-14", endDate: "2026-03-02" },
    { name: "Vacances de Printemps 2026", startDate: "2026-04-11", endDate: "2026-04-27" },
    { name: "Vacances d'Été 2026", startDate: "2026-07-04", endDate: "2026-08-31" },
  ];
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
        if (typeof data.prixPlancherStage === "number") setPrixPlancherStage(data.prixPlancherStage);
      }
    }).catch(console.error);
  }, []);

  // ─── Réductions & codes promo ───

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

  // Charger le réglage « balades petit comité » (actif par défaut)
  useEffect(() => {
    getDoc(doc(db, "settings", "balade-petit-groupe"))
      .then((snap) => { if (snap.exists()) setPetitGroupeActif((snap.data() as any).actif !== false); })
      .catch((e) => console.error("Erreur chargement petit comité:", e));
  }, []);

  const togglePetitGroupe = async () => {
    if (petitGroupeSaving) return;
    const nouveau = !petitGroupeActif;
    setPetitGroupeSaving(true);
    try {
      await setDoc(doc(db, "settings", "balade-petit-groupe"), {
        actif: nouveau, updatedAt: new Date(),
      }, { merge: true });
      setPetitGroupeActif(nouveau);
    } catch (e) { console.error("Sauvegarde petit comité:", e); alert("Erreur lors de la sauvegarde."); }
    setPetitGroupeSaving(false);
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

  const inputCls = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-center";

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
          ["moniteurs", "Moniteurs"],
          ["progression", "📈 Progression"],
          ["fidelite", "🏆 Fidélité"],
          ["notifications", "🔔 Notifications"],
          ["stages", "🐴 Déroulé stages"],
          ["marees", "🌊 Marées"],
          ["maintenance", "Maintenance"],
        ] as const).map(([id, label]) => (
          <button type="button" key={id} onClick={() => setSection(id)}
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
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏠 Identité du centre</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "nom", label: "Nom commercial" },
                { key: "legalName", label: "Raison sociale (factures)" },
                { key: "address", label: "Adresse complète" },
                { key: "tel", label: "Téléphone" },
                { key: "email", label: "Email de contact" },
                { key: "website", label: "Site web" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">{label}</label>
                  <input value={(centreParams as any)[key]}
                    onChange={e => setCentreParams(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🧾 Informations légales & bancaires</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "siret", label: "SIRET" },
                { key: "tvaIntra", label: "N° TVA intracommunautaire (si applicable)" },
                { key: "iban", label: "IBAN" },
                { key: "bic", label: "BIC" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">{label}</label>
                  <input value={(centreParams as any)[key]}
                    onChange={e => setCentreParams(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                    placeholder={key === "tvaIntra" ? "FR00 000000000 (optionnel)" : ""} />
                </div>
              ))}
            </div>
            <p className="font-body text-[10px] text-slate-400 mt-3">Ces informations apparaissent sur les factures, bons cadeaux et emails officiels.</p>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">📤 Envoi des écritures à la comptable</h3>
            <p className="font-body text-xs text-slate-500 mb-3">
              Chaque début de mois, les écritures du mois bouclé (factures, ventes, journal des encaissements, dépenses, FEC, PDF de synthèse)
              partent à cette adresse depuis « Boucler le mois », ou toutes seules le 5 si l&apos;envoi automatique est coché.
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Email de la comptable</label>
                <input type="email" value={(centreParams as any).emailComptable || ""}
                  onChange={e => setCentreParams(prev => ({ ...prev, emailComptable: e.target.value.trim() }))}
                  placeholder="cabinet@exemple.fr"
                  className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
              </div>
              <label className="flex items-center gap-2 font-body text-sm text-blue-800 cursor-pointer">
                <input type="checkbox" checked={Boolean((centreParams as any).envoiComptableAuto)}
                  onChange={e => setCentreParams(prev => ({ ...prev, envoiComptableAuto: e.target.checked }))}
                  className="accent-blue-500 w-4 h-4" />
                Envoi automatique le 5 de chaque mois (sauf si déjà envoyé à la main)
              </label>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🐴 Seuils d'alerte poneys</h3>
            <p className="font-body text-xs text-slate-500 mb-3">Charge journalière au-delà de laquelle une alerte s'affiche dans le Montoir</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "seuilPoneyOrange", label: "Alerte orange (nb séances)", unit: "séances" },
                { key: "seuilPoneyRouge",  label: "Alerte rouge (nb séances)",  unit: "séances" },
                { key: "seuilPoneyHeures", label: "Maximum heures/jour",         unit: "heures" },
              ].map(({ key, label, unit }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="10" value={(centreParams as any)[key]}
                      onChange={e => setCentreParams(prev => ({ ...prev, [key]: parseInt(e.target.value) || 1 }))}
                      className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-xs text-slate-400">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <button type="button" onClick={saveCentre}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
            {centreSaved ? "✅ Sauvegardé !" : "Sauvegarder les infos du centre"}
          </button>
        </div>
      )}

      {/* ─── Réductions & promos ─── */}
      {section === "reductions" && <SectionReductions />}

      {/* ─── Dégressivité ─── */}
      {section === "degressivite" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Réductions multi-stages (même enfant)</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              S'applique <strong>uniquement aux stages</strong> : un même enfant qui s'inscrit à plusieurs stages dans la même période de vacances bénéficie d'une réduction sur les inscriptions suivantes.
            </p>
            <div className="flex flex-col gap-3">
              {multiStage.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="font-body text-sm text-gray-500 flex-1">{r.nth}ème stage consécutif</span>
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-gray-400">-</span>
                    <input type="number" value={r.discount} onChange={(e) => {
                      const updated = [...multiStage];
                      updated[i].discount = parseInt(e.target.value) || 0;
                      setMultiStage(updated);
                    }} className={`${inputCls} w-16`} />
                    <span className="font-body text-sm text-gray-400">%</span>
                  </div>
                  <button type="button" onClick={() => setMultiStage(multiStage.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setMultiStage([...multiStage, { nth: multiStage.length + 2, discount: 0 }])}
                className="flex items-center gap-1 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">
                <Plus size={14} /> Ajouter un palier
              </button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Réductions famille (forfaits annuels + stages)</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              S'applique aux <strong>forfaits annuels</strong> (selon le rang du nouvel enfant inscrit dans la famille)
              et aux <strong>stages</strong> sur une même période de vacances scolaires.
            </p>
            <div className="flex flex-col gap-3">
              {familyDiscount.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="font-body text-sm text-gray-500 flex-1">{r.nth}ème enfant {r.nth === 2 ? "(2ème)" : r.nth === 3 ? "(3ème)" : `(${r.nth}ème+)`}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-gray-400">-</span>
                    <input type="number" value={r.discount} onChange={(e) => {
                      const updated = [...familyDiscount];
                      updated[i].discount = parseInt(e.target.value) || 0;
                      setFamilyDiscount(updated);
                    }} className={`${inputCls} w-16`} />
                    <span className="font-body text-sm text-gray-400">%</span>
                  </div>
                  <button type="button" onClick={() => setFamilyDiscount(familyDiscount.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setFamilyDiscount([...familyDiscount, { nth: (familyDiscount[familyDiscount.length - 1]?.nth || 1) + 1, discount: 0 }])}
                className="flex items-center gap-1 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">
                <Plus size={14} /> Ajouter un palier
              </button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Prix plancher par stage</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Garde-fou : même si les réductions cumulées (famille + multi-stages) dépassent ce seuil,
              le prix d'un stage ne descendra jamais sous ce montant. Utile car un stage de plusieurs jours
              compte aujourd'hui comme plusieurs réservations, ce qui peut gonfler le rang multi-stages.
              <strong> Mettre 0 pour désactiver le plancher.</strong>
            </p>
            <div className="flex items-center gap-4">
              <span className="font-body text-sm text-gray-500 flex-1">Prix minimum par stage</span>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={1} value={prixPlancherStage}
                  onChange={e => setPrixPlancherStage(parseFloat(e.target.value) || 0)}
                  className={`${inputCls} w-24`} />
                <span className="font-body text-sm text-gray-400">€</span>
              </div>
            </div>
          </Card>

          <Card padding="sm" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              💡 <strong>Cumul possible :</strong> un 2ème enfant à son 3ème stage bénéficie de -{familyDiscount[0]?.discount || 0}% (famille) + -{multiStage[1]?.discount || 0}% ({multiStage[1]?.nth || 3}ème stage) = -{(familyDiscount[0]?.discount || 0) + (multiStage[1]?.discount || 0)}%.{prixPlancherStage > 0 && <> Plafond au prix plancher : <strong>{prixPlancherStage}€</strong>.</>}
            </div>
          </Card>

          <button type="button" onClick={handleSave} disabled={savingDegress} className="self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
            {savingDegress ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {savingDegress ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      )}

      {/* ─── Vacances scolaires ─── */}
      {section === "vacances" && (
        <div className="flex flex-col gap-5">
          <Card padding="sm" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              <Calendar className="inline w-4 h-4 mr-1" />
              Ces périodes définissent quand les réductions famille et multi-stages s&apos;appliquent. Une inscription stage en dehors de ces périodes n&apos;aura pas de réduction automatique.
            </div>
          </Card>
          {loadingVacations ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <>
              <Card padding="md">
                <h3 className="font-body text-base font-semibold text-blue-800 mb-4">
                  Périodes définies ({vacations.length})
                </h3>
                <div className="flex flex-col gap-3">
                  {[...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((v) => (
                    <div key={v.id} className="flex items-center gap-3 flex-wrap border border-blue-500/8 rounded-lg p-3">
                      <input type="text" value={v.name}
                        onChange={(e) => handleUpdateVacation(v.id, "name", e.target.value)}
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <input type="date" value={v.startDate}
                        onChange={(e) => handleUpdateVacation(v.id, "startDate", e.target.value)}
                        className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <span className="font-body text-xs text-gray-400">→</span>
                      <input type="date" value={v.endDate}
                        onChange={(e) => handleUpdateVacation(v.id, "endDate", e.target.value)}
                        className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <button type="button" onClick={() => handleDeleteVacation(v.id)}
                        className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {vacations.length === 0 && (
                    <p className="font-body text-sm text-gray-400 italic text-center py-4">Aucune période définie.</p>
                  )}
                </div>
              </Card>
              <Card padding="md">
                <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Ajouter une période</h3>
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Nom</label>
                    <input type="text" value={newVacName} onChange={(e) => setNewVacName(e.target.value)}
                      placeholder="Ex : Vacances de la Toussaint 2026"
                      className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Début</label>
                    <input type="date" value={newVacStart} onChange={(e) => setNewVacStart(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Fin</label>
                    <input type="date" value={newVacEnd} onChange={(e) => setNewVacEnd(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <button type="button" onClick={handleAddVacation} disabled={savingVacation}
                    className={`px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                      ${savingVacation ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
                    {savingVacation ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus size={14} className="inline mr-1" />Ajouter</>}
                  </button>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ─── Annulation ─── */}
      {section === "annulation" && (
        // Ex-formulaire « délai / retenue / mode de remboursement » : ces
        // champs n'étaient LUS PAR AUCUN code et affichaient une politique
        // (72h, retenue 50 %) contraire aux CGV réelles. La politique
        // d'annulation est CONTRACTUELLE : elle vit dans cgv-clauses.ts
        // (source unique — page CGV, emails, case à cocher au paiement) et
        // s'affiche ici en lecture seule, sans pouvoir diverger.
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Politique d&apos;annulation (CGV)</h3>
          <p className="font-body text-xs text-slate-500 mb-4">
            Ces clauses sont contractuelles : la page CGV, les emails et l&apos;acceptation au paiement affichent
            exactement le même texte, depuis une source unique. Elles ne se règlent pas ici — un réglage
            modifiable aurait pu diverger des conditions déjà acceptées par les familles. Pour les faire
            évoluer : demander la modification, elle s&apos;appliquera partout d&apos;un coup.
          </p>
          <div className="flex flex-col gap-3 font-body text-sm text-slate-700">
            <div>
              <div className="font-semibold text-blue-800 mb-1">Stages</div>
              <ul className="m-0 pl-5 text-xs text-slate-600 leading-relaxed">
                {CGV_STAGES_CAS.map((cas) => (
                  <li key={cas.quand}><strong>{cas.quand}</strong> : {cas.consequence}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-blue-800 mb-1">Cours annuels</div>
              <p className="m-0 text-xs text-slate-600 leading-relaxed">{CGV_COURS_ANNUELS}</p>
            </div>
            <div>
              <div className="font-semibold text-blue-800 mb-1">Balades</div>
              <p className="m-0 text-xs text-slate-600 leading-relaxed">{CGV_BALADES}</p>
              <p className="m-0 mt-1 text-xs text-slate-600 leading-relaxed">{CGV_BALADES_PETIT_GROUPE}</p>
            </div>
            <div>
              <div className="font-semibold text-blue-800 mb-1">Annulation par le centre</div>
              <p className="m-0 text-xs text-slate-600 leading-relaxed">{CGV_ANNULATION_CENTRE}</p>
            </div>
          </div>
          <a href="/cgv" target="_blank" rel="noopener noreferrer"
            className="inline-block mt-4 font-body text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg no-underline hover:bg-blue-100">
            Voir la page CGV publique →
          </a>
        </Card>
      )}

      {section === "annulation" && (
        <Card padding="md" className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-body text-base font-semibold text-blue-800 mb-1">🌙 Balades « petit comité »</h3>
              <p className="font-body text-xs text-slate-500 m-0 max-w-xl">
                Quand une balade collective est sous son minimum de participants à J-2 (entre le 1er septembre
                et le 10 juillet), chaque famille reçoit l&apos;email de choix : maintien avec supplément, report,
                avoir ou remboursement. Désactivé, plus aucun email ne part — ni par le cron du soir, ni par
                le bouton de test du planning.
              </p>
            </div>
            <button type="button" onClick={togglePetitGroupe} disabled={petitGroupeSaving}
              className={`w-12 h-6 rounded-full transition-all border-none cursor-pointer flex-shrink-0 disabled:opacity-50 ${petitGroupeActif ? "bg-blue-500" : "bg-gray-200"}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-all mx-0.5 ${petitGroupeActif ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>
          <p className={`font-body text-xs font-semibold mt-2 m-0 ${petitGroupeActif ? "text-green-600" : "text-slate-400"}`}>
            {petitGroupeActif ? "✓ Option active" : "Option désactivée"}
          </p>
        </Card>
      )}

      {/* ─── Plan comptable ─── */}
      {section === "comptable" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="font-body text-sm text-gray-500">Plan comptable importé de Celeris — {defaultAccounts.length} comptes (lecture seule, géré par le cabinet comptable)</p>
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="w-24">Compte</span>
              <span className="flex-1">Intitulé</span>
              <span className="w-20 text-center">TVA</span>
              <span className="flex-1">Affectation</span>
            </div>
            {defaultAccounts.map((a, i) => (
              <div key={i} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors">
                <span className="w-24 font-body text-sm font-bold text-blue-500">{a.code}</span>
                <span className="flex-1 font-body text-sm font-medium text-blue-800">{a.label}</span>
                <span className="w-20 text-center">
                  <Badge color={a.tva === "0%" ? "gray" : a.tva === "5.50%" ? "green" : "orange"}>{a.tva}</Badge>
                </span>
                <span className="flex-1 font-body text-xs text-gray-400">{a.affectation}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ─── Moniteurs ─── */}
      {section === "moniteurs" && <SectionMoniteurs />}

      {/* ─── Inscription annuelle ─── */}
      {section === "inscription" && (
        <div className="flex flex-col gap-5">
          {/* Forfaits par fréquence */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">📋 Forfaits annuels</h3>
            <p className="font-body text-xs text-slate-500 mb-4">Prix plein tarif — le prorata est calculé automatiquement selon la date d'inscription</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "forfait1x", label: "1 cours / semaine", icon: "1×" },
                { key: "forfait2x", label: "2 cours / semaine", icon: "2×" },
                { key: "forfait3x", label: "3 cours / semaine", icon: "3×" },
              ].map(({ key, label, icon }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center font-body text-sm font-bold text-blue-600">{icon}</span>
                    <span className="font-body text-sm text-blue-800">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">€/an</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Adhésion dégressive */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">👨‍👩‍👧‍👦 Adhésion dégressive par famille</h3>
            <p className="font-body text-xs text-slate-500 mb-4">Le rang est calculé automatiquement selon le nombre d'enfants déjà inscrits en forfait annuel cette saison</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "adhesion1", label: "1er enfant" },
                { key: "adhesion2", label: "2ème enfant" },
                { key: "adhesion3", label: "3ème enfant" },
                { key: "adhesion4plus", label: "4ème enfant et +" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">€</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Licence FFE + Saison */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">📄 Licence FFE & Saison</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "licenceMoins18", label: "Licence FFE -18 ans" },
                { key: "licencePlus18", label: "Licence FFE +18 ans" },
                { key: "totalSessionsSaison", label: "Nombre de séances / saison" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">{key === "totalSessionsSaison" ? "séances" : "€"}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <span className="font-body text-sm text-blue-800">Fin de saison</span>
                <input type="date" value={inscriptionParams.dateFinSaison}
                  onChange={e => setInscriptionParams(prev => ({ ...prev, dateFinSaison: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
              </div>

            </div>
          </Card>

          {/* Stages */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏕️ Stages — Assurance occasionnelle</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="font-body text-sm text-blue-800">Assurance occasionnelle 1 mois</span>
                <div className="font-body text-xs text-slate-400 mt-0.5">Proposée aux cavaliers non licenciés lors des stages</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" value={inscriptionParams.assuranceOccasionnelle}
                  onChange={e => setInscriptionParams(prev => ({ ...prev, assuranceOccasionnelle: parseFloat(e.target.value) || 0 }))}
                  className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                <span className="font-body text-sm text-slate-400">€</span>
              </div>
            </div>
          </Card>

          <button type="button" onClick={saveInscription}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
            {inscriptionSaved ? "✅ Sauvegardé !" : "Sauvegarder les paramètres"}
          </button>
        </div>
      )}

      {/* ─── Progression : labels échelle 1-5 ─── */}
      {section === "progression" && <SectionProgression />}

      {/* ─── Fidélité ─── */}
      {section === "fidelite" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏆 Programme de fidélité</h3>
            <div className="flex flex-col gap-5">

              {/* Activer/désactiver */}
              <div className="flex items-center justify-between p-4 bg-sand rounded-xl">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">Activer le programme fidélité</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Les points sont attribués automatiquement à chaque encaissement</div>
                </div>
                <button type="button" onClick={() => setFideliteEnabled(!fideliteEnabled)}
                  className={`w-12 h-6 rounded-full transition-all border-none cursor-pointer ${fideliteEnabled ? "bg-blue-500" : "bg-gray-200"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-all mx-0.5 ${fideliteEnabled ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>

              {fideliteEnabled && (
                <>
                  {/* Taux de conversion */}
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Taux de conversion</label>
                    <div className="flex items-center gap-3 bg-sand rounded-xl p-4">
                      <input type="number" min="1" value={fideliteTaux}
                        onChange={e => setFideliteTaux(Number(e.target.value))}
                        className="w-24 text-center border border-gray-200 rounded-lg px-3 py-2 font-body text-sm bg-white focus:outline-none focus:border-blue-500" />
                      <span className="font-body text-sm text-gray-500">points = <strong className="text-blue-800">1€</strong> de réduction</span>
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-1.5">
                      Exemple : avec {fideliteTaux} points/€ → 100€ dépensés = {Math.floor(100 * 1 / fideliteTaux * 100) / 100}€ de réduction possible
                    </div>
                  </div>

                  {/* Seuil minimum */}
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Seuil minimum pour utiliser les points</label>
                    <div className="flex items-center gap-3 bg-sand rounded-xl p-4">
                      <input type="number" min="1" value={fideliteMinPoints}
                        onChange={e => setFideliteMinPoints(Number(e.target.value))}
                        className="w-24 text-center border border-gray-200 rounded-lg px-3 py-2 font-body text-sm bg-white focus:outline-none focus:border-blue-500" />
                      <span className="font-body text-sm text-gray-500">points minimum requis</span>
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-1.5">
                      Soit {(fideliteMinPoints / fideliteTaux).toFixed(2)}€ de réduction minimum
                    </div>
                  </div>

                  {/* Résumé */}
                  <div className="bg-blue-50 rounded-xl p-4 font-body text-xs text-blue-700 space-y-1">
                    <div>✅ <strong>1€ encaissé</strong> = <strong>1 point</strong></div>
                    <div>✅ <strong>{fideliteTaux} points</strong> = <strong>1€</strong> de réduction</div>
                    <div>✅ Minimum <strong>{fideliteMinPoints} points</strong> pour utiliser</div>
                    <div>✅ Points valables <strong>1 an</strong> après acquisition</div>
                    <div>✅ La famille gère depuis son espace cavalier</div>
                  </div>
                </>
              )}

              <button type="button" onClick={saveFidelite}
                className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
                {fideliteSaved ? "✅ Sauvegardé !" : "Sauvegarder"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Marées ─── */}
      {section === "stages" && <SectionStages />}

      {section === "marees" && (
        <MareesSection />
      )}

      {/* ─── Maintenance ─── */}
      {section === "maintenance" && <SectionMaintenance />}
      {section === "notifications" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">🔔 Notifications push — Admin</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Les notifications arrivent même quand l&apos;application est fermée (si vous avez autorisé les notifications dans votre navigateur).
            </p>

            {/* Comment activer */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <div className="font-body text-sm font-semibold text-blue-800 mb-2">📱 Comment activer les notifications ?</div>
              <ol className="font-body text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Ouvrez l'application admin sur votre téléphone ou ordinateur</li>
                <li>Votre navigateur vous demandera <strong>"Autoriser les notifications"</strong> → cliquez <strong>Autoriser</strong></li>
                <li>Si vous avez refusé, allez dans les paramètres de votre navigateur → Site → Notifications → Autoriser</li>
                <li>Sur <strong>iPhone/Safari</strong> : ajoutez d'abord le site à l'écran d'accueil (partage → Sur l'écran d'accueil)</li>
              </ol>
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={async () => {
                setTestPushSending(true);
                try {
                  const res = await authFetch("/api/push", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      broadcast: true,
                      title: "🐴 Test notification",
                      body: "Les notifications push fonctionnent correctement !",
                    }),
                  });
                  const data = await res.json();
                  alert(data.sent > 0 ? `✅ Notification envoyée à ${data.sent} appareil(s)` : "⚠️ Aucun appareil enregistré. Autorisez d'abord les notifications.");
                } catch { alert("Erreur lors de l'envoi"); }
                setTestPushSending(false);
              }} disabled={testPushSending}
                className="flex items-center gap-2 font-body text-sm font-semibold text-blue-600 bg-blue-50 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 disabled:opacity-50">
                {testPushSending ? <Loader2 size={14} className="animate-spin" /> : "📱"}
                Tester une notification
              </button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
