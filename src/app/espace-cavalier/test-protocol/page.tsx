"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui";

type Status = "ok" | "ko" | "remarque" | "non_teste";

interface Step {
  action: string;
  attendu: string;
}

interface TestCase {
  id: string;
  titre: string;
  description: string;
  steps: Step[];
  priorite: "critique" | "haute" | "normale";
}

interface Scenario {
  id: string;
  titre: string;
  emoji: string;
  description: string;
  tests: TestCase[];
}

// ─── Scénarios de test espace famille ────────────────────────────────────────
const SCENARIOS: Scenario[] = [
  {
    id: "connexion",
    titre: "Connexion & profil",
    emoji: "🔐",
    description: "Vérifier l'accès et la configuration du compte famille",
    tests: [
      {
        id: "CNX-01", titre: "Connexion Google", priorite: "critique",
        description: "Se connecter avec un compte Google",
        steps: [
          { action: "Aller sur /espace-cavalier et cliquer 'Se connecter avec Google'", attendu: "Redirection vers le tableau de bord" },
          { action: "Vérifier que le nom de la famille s'affiche en haut", attendu: "Nom correct affiché" },
        ],
      },
      {
        id: "CNX-02", titre: "Profil famille complet", priorite: "haute",
        description: "Renseigner les informations de la famille",
        steps: [
          { action: "Aller dans Profil famille → modifier nom, téléphone, adresse", attendu: "Modifications enregistrées" },
          { action: "Ajouter ou vérifier un cavalier avec prénom, date de naissance et niveau de galop", attendu: "Cavalier visible avec son galop" },
        ],
      },
      {
        id: "CNX-03", titre: "Droit à l'effacement", priorite: "normale",
        description: "Le bouton RGPD est présent",
        steps: [
          { action: "Aller dans Profil famille → descendre en bas de page", attendu: "Bouton 'Demander la suppression de mes données' visible" },
        ],
      },
    ],
  },
  {
    id: "planning",
    titre: "Vue Planning (Timeline)",
    emoji: "📅",
    description: "Tester la nouvelle vue planning intelligente",
    tests: [
      {
        id: "PL-01", titre: "Affichage vue Planning", priorite: "critique",
        description: "La vue Planning s'affiche par défaut",
        steps: [
          { action: "Aller dans Réserver → vérifier que l'onglet 'Planning' est sélectionné par défaut", attendu: "Vue Planning active avec navigation par jours" },
          { action: "Observer les 7 prochains jours avec leurs points indicateurs", attendu: "Points colorés sur les jours qui ont des créneaux" },
        ],
      },
      {
        id: "PL-02", titre: "Filtre 'Pour moi'", priorite: "critique",
        description: "Les créneaux sont filtrés selon le niveau de galop",
        steps: [
          { action: "S'assurer que le cavalier a un niveau de galop renseigné dans son profil", attendu: "Niveau de galop visible sur le profil" },
          { action: "Revenir sur Planning → filtre '✨ Pour moi' actif → vérifier les créneaux affichés", attendu: "Seuls les créneaux compatibles avec le niveau ±1 sont visibles" },
          { action: "Chercher un créneau avec le badge '✨ Parfait pour toi'", attendu: "Badge visible sur le créneau du niveau exact" },
        ],
      },
      {
        id: "PL-03", titre: "Navigation jour par jour", priorite: "haute",
        description: "Naviguer entre les jours",
        steps: [
          { action: "Cliquer sur un autre jour dans la barre de navigation", attendu: "Les créneaux du jour sélectionné s'affichent" },
          { action: "Utiliser les flèches ← → pour naviguer", attendu: "Navigation fluide, jour change correctement" },
        ],
      },
      {
        id: "PL-04", titre: "Filtres type", priorite: "normale",
        description: "Filtrer par type d'activité",
        steps: [
          { action: "Cliquer sur 'Stages' dans les filtres", attendu: "Seuls les stages s'affichent" },
          { action: "Cliquer sur 'Balades'", attendu: "Seules les balades s'affichent" },
          { action: "Cliquer sur 'Tout voir'", attendu: "Tous les créneaux réapparaissent" },
        ],
      },
      {
        id: "PL-05", titre: "Filtre par cavalier", priorite: "haute",
        description: "Si plusieurs cavaliers, filtrer par enfant",
        steps: [
          { action: "Si la famille a plusieurs cavaliers, cliquer sur le prénom d'un enfant", attendu: "Filtre 'Pour moi' n'affiche que les créneaux compatibles avec ce cavalier" },
        ],
      },
    ],
  },
  {
    id: "reservation",
    titre: "Réservation & panier",
    emoji: "🛒",
    description: "Tester le flux complet d'inscription à un créneau",
    tests: [
      {
        id: "RES-01", titre: "Réserver depuis la Timeline", priorite: "critique",
        description: "Cliquer sur Réserver → ouvre le modal enfant",
        steps: [
          { action: "Sur un créneau disponible, cliquer 'Réserver →'", attendu: "Modal 'Pour quel cavalier ?' s'ouvre" },
          { action: "Sélectionner un cavalier", attendu: "Le panier s'ouvre automatiquement avec l'article ajouté" },
        ],
      },
      {
        id: "RES-02", titre: "Paiement CB — 1 cours (CAWL)", priorite: "critique",
        description: "Payer 1 cours par CB et vérifier Firestore + admin",
        steps: [
          { action: "Réserver 1 cours → panier → Carte bancaire → Payer", attendu: "Redirection vers page CAWL (payment.preprod.ca.cawl-solutions.fr)" },
          { action: "Saisir carte test → Continue Transaction sur simulateur 3DS", attendu: "Retour sur /reservations avec bandeau vert 'Paiement confirmé'" },
          { action: "Mes factures → vérifier le statut", attendu: "Facture affiche 'Payé' + mode 'CB en ligne'" },
          { action: "Admin → Paiements → Encaissements", attendu: "Ligne CAWL visible avec montant correct" },
          { action: "Vérifier email reçu sur ceagon50@gmail.com", attendu: "Email de confirmation avec nom famille + montant + activité" },
        ],
      },
      {
        id: "RES-02B", titre: "Paiement CB — 2 stages panier unique", priorite: "critique",
        description: "Réserver 2 stages différents en un seul paiement CAWL",
        steps: [
          { action: "Réserver Stage A → panier → 'Continuer mes réservations'", attendu: "Panier garde 1 article, modal se ferme" },
          { action: "Réserver Stage B → vérifier le panier", attendu: "2 lignes dans le panier, total = Stage A + Stage B" },
          { action: "Carte bancaire → Payer", attendu: "1 seule page CAWL avec le total global" },
          { action: "Mes factures après paiement", attendu: "1 seule facture 'Payée' avec les 2 stages" },
        ],
      },
      {
        id: "RES-02C", titre: "Blocage doublon panier", priorite: "haute",
        description: "Impossible d'inscrire le même enfant 2x au même créneau",
        steps: [
          { action: "Réserver Baby pour Eliot → Continuer → re-sélectionner Baby pour Eliot", attendu: "Alerte 'Cet enfant est déjà dans le panier pour ce stage'" },
          { action: "Vérifier le panier", attendu: "Toujours 1 seul article, pas de doublon" },
        ],
      },
      {
        id: "RES-03", titre: "Paiement par chèque/espèces", priorite: "critique",
        description: "Déclaration d'un paiement hors ligne",
        steps: [
          { action: "Dans le panier → sélectionner '📝 Chèque' ou '💵 Espèces' → cliquer 'Déclarer mon paiement'", attendu: "Message de confirmation '✅ Déclaration envoyée !'" },
          { action: "Vérifier que l'admin reçoit un email de notification", attendu: "Email reçu sur ceagon50@gmail.com avec le nom de la famille et le montant" },
          { action: "Dans l'admin → Paiements → Déclarations → Confirmer réception", attendu: "Paiement passe à 'paid', email de confirmation envoyé à la famille" },
        ],
      },
      {
        id: "RES-04", titre: "Vue Liste (ancienne vue)", priorite: "normale",
        description: "L'ancienne vue par mois fonctionne toujours",
        steps: [
          { action: "Réserver → onglet 'Liste' → sélectionner un mois", attendu: "Stages et cours listés par date" },
          { action: "Cliquer sur un créneau → sélectionner un enfant → Ajouter au panier", attendu: "Article dans le panier" },
        ],
      },
    ],
  },
  {
    id: "suivi",
    titre: "Suivi des inscriptions",
    emoji: "📋",
    description: "Vérifier l'affichage des réservations et paiements",
    tests: [
      {
        id: "SUI-01", titre: "Mes réservations", priorite: "critique",
        description: "Les inscriptions s'affichent correctement",
        steps: [
          { action: "Aller dans 'Mes réservations'", attendu: "Liste des cours à venir avec date, heure, activité" },
          { action: "Vérifier qu'une réservation annulée n'apparaît PAS", attendu: "Seules les réservations confirmées visibles" },
        ],
      },
      {
        id: "SUI-02", titre: "Mes factures", priorite: "haute",
        description: "Les paiements sont visibles et téléchargeables",
        steps: [
          { action: "Aller dans 'Mes factures'", attendu: "Liste des paiements avec montant et statut" },
          { action: "Cliquer sur l'icône télécharger sur un paiement", attendu: "Facture HTML s'ouvre dans un nouvel onglet (correctement rendue, pas de texte brut)" },
        ],
      },
      {
        id: "SUI-03", titre: "Déclarer un paiement depuis les factures", priorite: "haute",
        description: "La déclaration est aussi accessible depuis l'onglet Factures",
        steps: [
          { action: "Mes factures → trouver un paiement 'À régler' → bouton '✉️ Déclarer'", attendu: "Modal de déclaration chèque/espèces s'ouvre" },
        ],
      },
    ],
  },
  {
    id: "inscription_annuelle",
    titre: "Inscription annuelle (admin)",
    emoji: "🎓",
    description: "Tester le flux complet d'inscription annuelle depuis l'admin",
    tests: [
      {
        id: "ANN-01", titre: "Inscription forfait annuel CB 3×", priorite: "critique",
        description: "Créer une inscription annuelle depuis le planning admin",
        steps: [
          { action: "Planning admin → cliquer sur un créneau de cours → EnrollPanel → mode Annuel → choisir enfant → 3× → CB → Inscrire", attendu: "3 échéances créées dans Paiements → Échéances, mode CB" },
          { action: "Vérifier dans la fiche famille (Cavaliers) que les réservations apparaissent", attendu: "22+ réservations futures listées" },
        ],
      },
      {
        id: "ANN-02", titre: "Inscription forfait annuel SEPA 10×", priorite: "critique",
        description: "Tester le flux SEPA complet",
        steps: [
          { action: "Créer un mandat SEPA pour la famille dans Prélèvements SEPA", attendu: "Mandat actif visible" },
          { action: "Planning → EnrollPanel → Annuel → 10× → SEPA → Inscrire", attendu: "10 échéances dans Prélèvements SEPA → Échéancier, paiement sepa_scheduled dans payments" },
          { action: "SEPA → cocher une échéance → Créer remise XML → télécharger", attendu: "Fichier XML téléchargé" },
          { action: "SEPA → Remises → Marquer comme déposée", attendu: "Échéances passent à 'prélevé', paiement passe à paid" },
        ],
      },
      {
        id: "ANN-03", titre: "Désinscription forfait annuel", priorite: "critique",
        description: "Vérifier que tout est nettoyé",
        steps: [
          { action: "Forfaits admin → trouver le forfait → Désinscrire → Confirmer", attendu: "Message de désinscription avec le nombre de séances, réservations et échéances annulées" },
          { action: "Vérifier dans Cavaliers → fiche famille : section Réservations", attendu: "0 réservation à venir" },
          { action: "Vérifier Paiements → Impayés", attendu: "0€ dû pour cette famille" },
          { action: "Si SEPA : vérifier Prélèvements SEPA → Échéancier", attendu: "0 échéance en attente" },
        ],
      },
    ],
  },
  {
    id: "mobile",
    titre: "Expérience mobile",
    emoji: "📱",
    description: "Vérifier que tout fonctionne sur smartphone",
    tests: [
      {
        id: "MOB-01", titre: "Homepage mobile", priorite: "critique",
        description: "La page d'accueil s'affiche correctement",
        steps: [
          { action: "Ouvrir centreequestreagon.com sur mobile", attendu: "Deux demi-écrans CE / LaserBay empilés, aucun débordement" },
        ],
      },
      {
        id: "MOB-02", titre: "Modifier un créneau sur mobile (admin)", priorite: "critique",
        description: "Le modal de modification fonctionne",
        steps: [
          { action: "Admin → Planning → clic sur l'engrenage d'un créneau", attendu: "Modal s'ouvre en bottom-sheet depuis le bas" },
          { action: "Modifier l'heure de début via le sélecteur", attendu: "Sélecteur dropdown (pas un picker natif Android)" },
          { action: "Cliquer 'Enregistrer'", attendu: "Modification sauvegardée, modal se ferme" },
        ],
      },
      {
        id: "MOB-03", titre: "Réservation mobile", priorite: "haute",
        description: "Le flux de réservation fonctionne sur mobile",
        steps: [
          { action: "Espace cavalier → Réserver → Planning → Réserver → sélectionner enfant", attendu: "Modal enfant en bottom-sheet, panier s'ouvre" },
          { action: "Choisir un mode de paiement → valider", attendu: "Confirmation ou redirection CAWL" },
        ],
      },
      {
        id: "MOB-04", titre: "Boutons visibles sur mobile (vue semaine)", priorite: "haute",
        description: "Corbeille et engrenage visibles sans hover",
        steps: [
          { action: "Admin → Planning → vue Semaine sur mobile", attendu: "Icônes corbeille 🗑️ et engrenage ⚙️ visibles directement sur les cartes créneaux" },
        ],
      },
    ],
  },
  {
    id: "compta",
    titre: "Comptabilité & rapprochement",
    emoji: "💰",
    description: "Tester les outils financiers admin",
    tests: [
      {
        id: "CPT-01", titre: "Import CSV Crédit Agricole", priorite: "haute",
        description: "Importer un relevé bancaire",
        steps: [
          { action: "Admin → Comptabilité → Rapprochement → Importer CSV CA", attendu: "Lignes parsées, pas d'erreur d'encodage Latin1" },
          { action: "Vérifier le matching CB groupé par jour et les chèques du mois", attendu: "Transactions identifiées et matchées" },
        ],
      },
      {
        id: "CPT-02", titre: "Facture depuis la fiche", priorite: "haute",
        description: "Télécharger une facture admin",
        steps: [
          { action: "Cavaliers → fiche famille → section Paiements → icône 📄", attendu: "Facture s'ouvre dans un nouvel onglet (rendue correctement)" },
        ],
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  ok:        { icon: "✅", label: "OK",       bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  btn: "bg-green-500 text-white" },
  ko:        { icon: "❌", label: "KO",       bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    btn: "bg-red-500 text-white" },
  remarque:  { icon: "⚠️", label: "?",        bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", btn: "bg-orange-400 text-white" },
  non_teste: { icon: "⏳", label: "—",        bg: "bg-gray-50",   border: "border-gray-100",   text: "text-gray-500",   btn: "bg-gray-200 text-gray-600" },
};

const PRIO_CFG = {
  critique: "🔴",
  haute:    "🟠",
  normale:  "🔵",
};

export default function TestProtocolPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, { status: Status; note: string; updatedAt?: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedScenario, setExpandedScenario] = useState<Set<string>>(new Set(["connexion", "planning", "reservation"]));
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "tous">("tous");

  const storageKey = `testProtocol_${user?.uid || "anon"}`;

  // Load from Firestore
  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDoc(doc(db, "settings", `testProtocol_${user.uid}`));
      if (snap.exists()) setResults(snap.data().results || {});
    })();
  }, [user]);

  const save = async (newResults: typeof results) => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", `testProtocol_${user.uid}`), {
        results: newResults, updatedAt: serverTimestamp(),
      }, { merge: true });
    } finally { setSaving(false); }
  };

  const setStatus = (testId: string, status: Status) => {
    const cur = results[testId]?.status;
    const newStatus = cur === status ? "non_teste" : status;
    const next = { ...results, [testId]: { ...results[testId], status: newStatus, updatedAt: new Date().toISOString() } };
    setResults(next);
    save(next);
  };

  const saveNote = (testId: string) => {
    const next = { ...results, [testId]: { ...results[testId], note: noteInput, updatedAt: new Date().toISOString() } };
    setResults(next);
    save(next);
    setNoteEditing(null);
  };

  const reset = (testId: string) => {
    const next = { ...results };
    delete next[testId];
    setResults(next);
    save(next);
  };

  const allTests = SCENARIOS.flatMap(s => s.tests);
  const stats = {
    total: allTests.length,
    ok: allTests.filter(t => results[t.id]?.status === "ok").length,
    ko: allTests.filter(t => results[t.id]?.status === "ko").length,
    remarque: allTests.filter(t => results[t.id]?.status === "remarque").length,
    non_teste: allTests.filter(t => !results[t.id] || results[t.id]?.status === "non_teste").length,
  };
  const pct = stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0;

  const toggleScenario = (id: string) => {
    const next = new Set(expandedScenario);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedScenario(next);
  };

  const toggleTest = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Protocole de tests</h1>
        <p className="font-body text-xs text-slate-500">
          Guide de validation de l'espace famille — {allTests.length} tests · {saving ? "Sauvegarde..." : "Auto-sauvegardé"}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "✅ OK",  val: stats.ok,       color: "text-green-600" },
          { label: "❌ KO",  val: stats.ko,       color: "text-red-600" },
          { label: "⚠️",     val: stats.remarque, color: "text-orange-600" },
          { label: "⏳",     val: stats.non_teste,color: "text-gray-400" },
        ].map(s => (
          <Card key={s.label} padding="sm" className="text-center">
            <div className={`font-body text-xl font-bold ${s.color}`}>{s.val}</div>
            <div className="font-body text-[10px] text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Barre de progression */}
      <Card padding="sm" className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="font-body text-xs text-slate-600">Progression</span>
          <span className="font-body text-xs font-bold text-green-600">{pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full transition-all" style={{ width: `${(stats.ok / stats.total) * 100}%` }} />
          <div className="bg-red-400 h-full transition-all" style={{ width: `${(stats.ko / stats.total) * 100}%` }} />
          <div className="bg-orange-400 h-full transition-all" style={{ width: `${(stats.remarque / stats.total) * 100}%` }} />
        </div>
      </Card>

      {/* Filtre */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {(["tous", "non_teste", "ok", "ko", "remarque"] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${filterStatus === f ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            {f === "tous" ? "Tous" : f === "non_teste" ? "⏳ À tester" : f === "ok" ? "✅ OK" : f === "ko" ? "❌ KO" : "⚠️ Remarque"}
          </button>
        ))}
      </div>

      {/* Scénarios */}
      <div className="flex flex-col gap-4">
        {SCENARIOS.map(scenario => {
          const scenTests = scenario.tests.filter(t =>
            filterStatus === "tous" ? true :
            filterStatus === "non_teste" ? (!results[t.id] || results[t.id]?.status === "non_teste") :
            results[t.id]?.status === filterStatus
          );
          if (scenTests.length === 0) return null;

          const scenOk = scenario.tests.filter(t => results[t.id]?.status === "ok").length;
          const scenKo = scenario.tests.filter(t => results[t.id]?.status === "ko").length;
          const isOpen = expandedScenario.has(scenario.id);

          return (
            <div key={scenario.id}>
              {/* Header scénario */}
              <button
                onClick={() => toggleScenario(scenario.id)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-blue-500/8 shadow-sm cursor-pointer text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{scenario.emoji}</span>
                  <div>
                    <div className="font-display text-base font-bold text-blue-800">{scenario.titre}</div>
                    <div className="font-body text-xs text-slate-500">{scenario.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex gap-1">
                    {scenOk > 0 && <span className="font-body text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{scenOk}✅</span>}
                    {scenKo > 0 && <span className="font-body text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{scenKo}❌</span>}
                  </div>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                </div>
              </button>

              {/* Tests du scénario */}
              {isOpen && (
                <div className="mt-2 flex flex-col gap-2 pl-2">
                  {scenTests.map(t => {
                    const status = results[t.id]?.status || "non_teste";
                    const cfg = STATUS_CFG[status];
                    const isExpanded = expanded.has(t.id);
                    const isEditingNote = noteEditing === t.id;

                    return (
                      <div key={t.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
                        {/* En-tête test */}
                        <div className="flex items-start gap-3 p-3">
                          <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                            <span className="font-body text-[10px] font-bold text-slate-400">{t.id}</span>
                            <span className="text-sm">{PRIO_CFG[t.priorite]}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <button onClick={() => toggleTest(t.id)}
                              className="w-full text-left bg-transparent border-none cursor-pointer p-0">
                              <div className="font-body text-sm font-semibold text-blue-800">{t.titre}</div>
                              <div className="font-body text-xs text-slate-500 mt-0.5">{t.description}</div>
                            </button>

                            {/* Étapes */}
                            {isExpanded && (
                              <div className="mt-3 space-y-2">
                                {t.steps.map((step, i) => (
                                  <div key={i} className="flex gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-body text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                    <div>
                                      <div className="font-body text-xs text-slate-700">{step.action}</div>
                                      <div className="font-body text-[11px] text-green-600 mt-0.5">→ {step.attendu}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Note */}
                            {results[t.id]?.note && !isEditingNote && (
                              <div className="mt-1.5 font-body text-[11px] text-slate-600 bg-white/70 rounded-lg px-2 py-1">
                                💬 {results[t.id].note}
                              </div>
                            )}
                            {isEditingNote && (
                              <div className="mt-1.5 flex gap-1.5">
                                <input autoFocus value={noteInput} onChange={e => setNoteInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") saveNote(t.id); if (e.key === "Escape") setNoteEditing(null); }}
                                  placeholder="Note..."
                                  className="flex-1 font-body text-xs border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white"/>
                                <button onClick={() => saveNote(t.id)} className="font-body text-[11px] text-white bg-blue-500 px-2 py-1 rounded-lg border-none cursor-pointer">OK</button>
                                <button onClick={() => setNoteEditing(null)} className="font-body text-[11px] text-slate-500 bg-white px-2 py-1 rounded-lg border border-gray-200 cursor-pointer">✕</button>
                              </div>
                            )}
                          </div>

                          {/* Boutons statut */}
                          <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                            <div className="flex gap-1">
                              {(["ok", "ko", "remarque"] as Status[]).map(s => (
                                <button key={s} onClick={() => setStatus(t.id, s)}
                                  className={`font-body text-[11px] w-8 h-8 rounded-lg border-none cursor-pointer transition-all ${status === s ? STATUS_CFG[s].btn : "bg-white text-slate-400 hover:bg-gray-100"}`}>
                                  {STATUS_CFG[s].icon}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => toggleTest(t.id)}
                                className="font-body text-[9px] text-slate-500 bg-white px-2 py-1 rounded border border-gray-200 cursor-pointer">
                                {isExpanded ? "▲" : "▼"} Étapes
                              </button>
                              <button onClick={() => { setNoteEditing(t.id); setNoteInput(results[t.id]?.note || ""); }}
                                className="font-body text-[9px] text-slate-500 bg-white px-1.5 py-1 rounded border border-gray-200 cursor-pointer">
                                💬
                              </button>
                              {status !== "non_teste" && (
                                <button onClick={() => reset(t.id)}
                                  className="font-body text-[9px] text-red-400 bg-white px-1.5 py-1 rounded border border-gray-200 cursor-pointer">
                                  <RotateCcw size={9}/>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filterStatus !== "tous" && SCENARIOS.every(s =>
        s.tests.filter(t =>
          filterStatus === "non_teste" ? (!results[t.id] || results[t.id]?.status === "non_teste") :
          results[t.id]?.status === filterStatus
        ).length === 0
      ) && (
        <Card padding="lg" className="text-center mt-4">
          <div className="text-3xl mb-2">🎉</div>
          <p className="font-body text-sm text-slate-600">
            {filterStatus === "ok" ? "Aucun test validé pour l'instant." :
             filterStatus === "ko" ? "Aucun bug trouvé ! 🎉" :
             filterStatus === "non_teste" ? "Tous les tests ont été effectués !" :
             "Aucune remarque."}
          </p>
        </Card>
      )}
    </div>
  );
}
