"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import {
  AlertTriangle, Download, Trash2, ShieldAlert, CheckCircle2, Loader2,
  RefreshCw, Eye, ArrowLeft,
} from "lucide-react";

// Groupage visuel des collections (cohérent avec l'API)
const GROUPS = [
  {
    id: "financier",
    label: "Financier & comptable",
    description: "Encaissements, paiements, avoirs, clôtures Z, fonds de caisse...",
    tone: "red" as const,
    collections: [
      "encaissements", "payments", "cloturesJournalieres", "fondsDeCaisse",
      "remises", "avoirs", "payment_declarations", "cheques-differes", "devis",
      "sepa_mandats", "sepa_remises", "sepa_echeances",
    ],
  },
  {
    id: "inscriptions",
    label: "Inscriptions & réservations",
    description: "Réservations, listes d'attente, rattrapages, cartes/carnets, forfaits",
    tone: "orange" as const,
    collections: ["reservations", "waitlist", "rattrapages", "cards", "forfaits", "fidelite_transactions"],
  },
  {
    id: "communications",
    label: "Communications",
    description: "Logs d'emails envoyés (journal + emails de reprise)",
    tone: "orange" as const,
    collections: ["emailsSent", "emailsReprise"],
  },
  {
    id: "metier",
    label: "⚠️ Données métier (prudence)",
    description: "Créneaux planning, familles, équidés, activités, soins",
    tone: "red" as const,
    collections: ["creneaux", "indispos", "soins", "families", "equides", "activities"],
  },
];

const COLLECTION_LABELS: Record<string, string> = {
  encaissements: "Encaissements (journal des ventes)",
  payments: "Commandes / paiements",
  cloturesJournalieres: "Clôtures journalières (Z)",
  fondsDeCaisse: "Fonds de caisse (comptages espèces)",
  remises: "Bordereaux de remise en banque",
  waitlist: "Listes d'attente",
  reservations: "Réservations",
  avoirs: "Avoirs et avances",
  emailsSent: "Journal emails envoyés",
  emailsReprise: "Emails de reprise (groupés)",
  payment_declarations: "Déclarations de paiement (espace client)",
  "cheques-differes": "Chèques différés",
  fidelite_transactions: "Points de fidélité (mouvements)",
  rattrapages: "Rattrapages",
  devis: "Devis",
  cards: "Cartes / carnets",
  sepa_mandats: "Mandats SEPA",
  sepa_remises: "Remises SEPA",
  sepa_echeances: "Échéances SEPA",
  forfaits: "Forfaits annuels",
  creneaux: "Créneaux du planning",
  indispos: "Indisponibilités équidés",
  soins: "Soins équidés",
  families: "Familles (et enfants)",
  equides: "Équidés",
  activities: "Catalogue d'activités",
};

export default function ResetBasePage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmation, setConfirmation] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("SUPPRIMER-DONNEES-TEST");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);
  const [backupDone, setBackupDone] = useState(false);

  useEffect(() => { fetchCounts(); /* eslint-disable-next-line */ }, []);

  async function fetchCounts() {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/reset-base");
      if (!res.ok) throw new Error("Erreur chargement");
      const data = await res.json();
      setCounts(data.counts || {});
      if (data.confirmationPhrase) setConfirmationPhrase(data.confirmationPhrase);
    } catch (e) {
      console.error(e);
      toast("Impossible de charger le comptage.", "error");
    } finally {
      setLoading(false);
    }
  }

  const toggle = (coll: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(coll)) next.delete(coll);
      else next.add(coll);
      return next;
    });
  };

  const toggleGroup = (group: typeof GROUPS[number]) => {
    const allSelected = group.collections.every(c => selected.has(c));
    setSelected(prev => {
      const next = new Set(prev);
      group.collections.forEach(c => {
        if (allSelected) next.delete(c);
        else next.add(c);
      });
      return next;
    });
  };

  const totalToDelete = Array.from(selected).reduce((s, c) => s + (counts[c] || 0), 0);

  async function handleBackup() {
    try {
      toast("📦 Export en cours...", "info");
      const res = await authFetch("/api/admin/backup-json");
      if (!res.ok) throw new Error("Erreur export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-centre-equestre-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupDone(true);
      toast("✅ Sauvegarde téléchargée", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur export sauvegarde.", "error");
    }
  }

  async function handleDryRun() {
    if (selected.size === 0) { toast("Sélectionnez au moins une collection.", "warning"); return; }
    setWorking(true);
    setDryRunResult(null);
    try {
      const res = await authFetch("/api/admin/reset-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: Array.from(selected),
          dryRun: true,
          confirmation: confirmationPhrase, // la dry run n'exige pas mais ça ne coûte rien
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setDryRunResult(data);
      toast("Simulation terminée.", "success");
    } catch (e: any) {
      toast(`Erreur simulation : ${e.message}`, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleReset() {
    if (!finalConfirm) return;
    if (confirmation !== confirmationPhrase) {
      toast(`Tapez exactement : ${confirmationPhrase}`, "warning");
      return;
    }
    if (!backupDone) {
      if (!confirm("Vous n'avez pas téléchargé de sauvegarde. Continuer quand même ?")) return;
    }
    setWorking(true);
    try {
      const res = await authFetch("/api/admin/reset-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: Array.from(selected),
          confirmation,
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResetResult(data);
      toast(`✅ ${data.totalDeleted} documents supprimés`, "success");
      // Recharge les comptages
      await fetchCounts();
      setSelected(new Set());
      setConfirmation("");
      setFinalConfirm(false);
      setDryRunResult(null);
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    } finally {
      setWorking(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="px-4 py-8 text-center">
        <ShieldAlert size={32} className="text-red-500 mx-auto mb-2" />
        <p className="font-body text-slate-600">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-red-800">Réinitialisation de la base</h1>
            <p className="font-body text-sm text-slate-500">Outil avancé — à utiliser avant la mise en production officielle.</p>
          </div>
        </div>
        <Link href="/admin/dashboard"
          className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50 flex items-center gap-1.5">
          <ArrowLeft size={12} /> Retour
        </Link>
      </div>

      {/* Avertissement */}
      <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-5 flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div className="font-body text-sm text-red-900">
          <strong>Action irréversible.</strong> Les documents supprimés ne pourront pas être récupérés
          (sauf via la sauvegarde JSON que tu peux télécharger ci-dessous).
          Les règles d'inaltérabilité des encaissements sont contournées uniquement par cette route API
          administrative, et chaque opération est tracée dans un log d'audit.
          <br/><br/>
          Rappel contexte : la comptabilité officielle jusqu'en août 2026 est sur Celeris.
          Cette base Firebase est en test/double jusqu'à la bascule prod en septembre 2026.
        </div>
      </div>

      {/* Étape 1 : Sauvegarde */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-bold text-xs flex items-center justify-center">1</span>
          <h2 className="font-display text-base font-bold text-blue-800">Télécharger une sauvegarde (recommandé)</h2>
        </div>
        <p className="font-body text-xs text-slate-600 mb-3">
          Exporte toutes les collections de la base au format JSON. Fichier téléchargé localement sur ton ordinateur, à conserver en cas de besoin de restauration.
        </p>
        <button onClick={handleBackup} disabled={working}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-body text-sm font-semibold px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
          <Download size={14} />
          Télécharger la sauvegarde JSON complète
        </button>
        {backupDone && (
          <Badge color="green" className="ml-2 mt-2">✓ Sauvegarde téléchargée</Badge>
        )}
      </Card>

      {/* Étape 2 : Sélection */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-bold text-xs flex items-center justify-center">2</span>
            <h2 className="font-display text-base font-bold text-blue-800">Sélectionner les collections à effacer</h2>
          </div>
          <button onClick={fetchCounts} disabled={loading}
            className="flex items-center gap-1 text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Actualiser les comptages
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center">
            <Loader2 size={18} className="animate-spin mx-auto text-slate-400" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {GROUPS.map(group => {
              const groupCount = group.collections.reduce((s, c) => s + (counts[c] || 0), 0);
              const allSelected = group.collections.every(c => selected.has(c));
              const someSelected = group.collections.some(c => selected.has(c));
              return (
                <div key={group.id} className={`border rounded-lg overflow-hidden ${group.tone === "red" ? "border-red-200" : "border-orange-200"}`}>
                  <div className={`px-3 py-2 flex items-center justify-between ${group.tone === "red" ? "bg-red-50" : "bg-orange-50"}`}>
                    <div>
                      <div className={`font-body text-sm font-semibold ${group.tone === "red" ? "text-red-800" : "text-orange-800"}`}>{group.label}</div>
                      <div className="font-body text-[11px] text-slate-600 mt-0.5">{group.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-body text-xs text-slate-500">{groupCount} doc{groupCount > 1 ? "s" : ""}</span>
                      <button onClick={() => toggleGroup(group)}
                        className="font-body text-[11px] bg-white border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded cursor-pointer">
                        {allSelected ? "Tout décocher" : someSelected ? "Tout cocher" : "Tout cocher"}
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.collections.map(coll => (
                      <label key={coll} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selected.has(coll)} onChange={() => toggle(coll)}
                          className="cursor-pointer" />
                        <span className="font-body text-sm text-slate-700 flex-1">{COLLECTION_LABELS[coll] || coll}</span>
                        <code className="font-mono text-[10px] text-slate-400">{coll}</code>
                        <Badge color={counts[coll] > 0 ? "blue" : "gray"}>
                          {counts[coll] || 0}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between flex-wrap gap-2">
            <div className="font-body text-sm text-blue-900">
              <strong>{selected.size}</strong> collection{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""} →
              <strong className="ml-1">{totalToDelete}</strong> document{totalToDelete > 1 ? "s" : ""} à supprimer
            </div>
            <button onClick={handleDryRun} disabled={working}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-blue-300 text-blue-800 font-body text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50">
              <Eye size={12} />
              Simuler (sans rien supprimer)
            </button>
          </div>
        )}
      </Card>

      {/* Résultat dry run */}
      {dryRunResult && (
        <Card padding="md" className="mb-4 bg-blue-50/30 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Eye size={16} className="text-blue-600" />
            <h3 className="font-display text-sm font-bold text-blue-800">Simulation (aucune suppression effectuée)</h3>
          </div>
          <div className="space-y-1 font-body text-xs">
            {Object.entries(dryRunResult.results || {}).map(([coll, r]: [string, any]) => (
              <div key={coll} className="flex justify-between">
                <span className="text-slate-700">{COLLECTION_LABELS[coll] || coll}</span>
                <span className="font-semibold text-blue-800">{r.countBefore} document{r.countBefore > 1 ? "s" : ""} serai{r.countBefore > 1 ? "ent" : "t"} supprimé{r.countBefore > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Étape 3 : Confirmation + exécution */}
      {selected.size > 0 && (
        <Card padding="md" className="mb-4 border-2 border-red-300">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-red-500 text-white font-bold text-xs flex items-center justify-center">3</span>
            <h2 className="font-display text-base font-bold text-red-800">Confirmer la suppression</h2>
          </div>

          <p className="font-body text-xs text-slate-700 mb-3">
            Pour confirmer, tape exactement la phrase suivante dans le champ :
          </p>
          <div className="mb-3">
            <code className="inline-block bg-slate-100 px-3 py-1.5 rounded font-mono text-sm text-red-700 font-bold select-all">
              {confirmationPhrase}
            </code>
          </div>
          <input
            type="text"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            placeholder="Tape la phrase ci-dessus..."
            className={`w-full font-mono text-sm px-3 py-2 rounded-lg border mb-3 ${
              confirmation === confirmationPhrase ? "border-green-400 bg-green-50/30" : "border-gray-200 bg-white"
            }`}
          />

          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={finalConfirm} onChange={e => setFinalConfirm(e.target.checked)}
              className="mt-0.5 cursor-pointer" />
            <span className="font-body text-xs text-slate-700">
              Je comprends que cette action est <strong>irréversible</strong> et qu'elle supprimera
              définitivement les <strong>{totalToDelete} documents</strong> sélectionnés.
              {!backupDone && <span className="text-red-600"> (Je n'ai pas téléchargé de sauvegarde, je prends le risque.)</span>}
            </span>
          </label>

          <button
            onClick={handleReset}
            disabled={working || !finalConfirm || confirmation !== confirmationPhrase || selected.size === 0}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-body text-sm font-bold px-4 py-3 rounded-lg border-none cursor-pointer">
            {working ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {working ? "Suppression en cours..." : `Supprimer définitivement ${totalToDelete} document${totalToDelete > 1 ? "s" : ""}`}
          </button>
        </Card>
      )}

      {/* Résultat */}
      {resetResult && (
        <Card padding="md" className="mb-4 bg-green-50/50 border-2 border-green-300">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-green-600" />
            <h3 className="font-display text-base font-bold text-green-800">Suppression effectuée</h3>
          </div>
          <div className="space-y-1 font-body text-xs mb-3">
            {Object.entries(resetResult.results || {}).map(([coll, r]: [string, any]) => (
              <div key={coll} className="flex justify-between">
                <span className="text-slate-700">{COLLECTION_LABELS[coll] || coll}</span>
                <span className="font-semibold text-green-800">{r.deleted} supprimé{r.deleted > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-600 pt-2 border-t border-green-200">
            Total : <strong>{resetResult.totalDeleted}</strong> documents en {(resetResult.durationMs / 1000).toFixed(1)}s.
            L'opération a été journalisée dans la collection <code className="font-mono bg-white px-1 rounded">resetLogs</code>.
          </div>
        </Card>
      )}
    </div>
  );
}
