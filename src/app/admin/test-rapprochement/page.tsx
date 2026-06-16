"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE DE TEST DU RAPPROCHEMENT BANCAIRE  —  ENVIRONNEMENT TEST UNIQUEMENT
//
//  Valide le smart matching du rapprochement CSV sans rejouer une vraie semaine.
//  Deux modes :
//    • Jeu FIXE      : scénario reproductible avec cas pièges connus
//    • Jeu ALÉATOIRE : montants/nombre de transactions/refus variables
//
//  Le bouton "Créer" efface d'abord les anciens encaissements de test (préfixe
//  "TEST ") via /api/admin/clear-test-encaissements, puis recrée le jeu courant.
//
//  Usage : 1) Créer  2) Télécharger le CSV  3) Compta → Rapprochement → importer
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { createEncaissement } from "@/lib/compta-encaissement";
import { authFetch } from "@/lib/auth-fetch";

function semaineTemoin() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const lundi = new Date(now); lundi.setDate(now.getDate() - day - 7); lundi.setHours(10, 0, 0, 0);
  const d = (o: number) => { const x = new Date(lundi); x.setDate(lundi.getDate() + o); return x; };
  return { lundi, mardi: d(1), mercredi: d(2), jeudi: d(3), vendredi: d(4) };
}
const fmtFR = (dt: Date) => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
const eur = (n: number) => n.toFixed(2).replace(".", ",");
const NOMS = ["Dupont", "Martin", "Bernard", "Petit", "Robert", "Richard", "Moreau", "Simon", "Laurent", "Lefebvre", "Roux", "Girard", "Fournier", "Dubois", "Mercier"];
const ACTS = ["Cours collectif", "Galop d'argent", "Stage poney", "Baby poney", "Forfait trimestre", "Stage galop d'or", "Forfait annuel", "Balade", "Cours particulier", "Pony games"];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

type Jour = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi";
type Enc = { familyName: string; montant: number; activityTitle: string; mode: string; modeLabel: string; jour: Jour };

function jeuFixe() {
  const cbLundi: [string, number, string][] = [["Dupont", 45, "Cours collectif"], ["Martin", 26, "Galop d'argent"], ["Bernard", 52, "Stage poney"]];
  const cbMardi: [string, number, string][] = [["Petit", 30, "Baby poney"], ["Refus", 99, "Transaction refusée"]];
  const cheques: [string, number, string][] = [["Robert", 175, "Forfait trimestre"], ["Richard", 165, "Stage galop d'or"]];
  const encs: Enc[] = [
    ...cbLundi.map(([n, m, a]): Enc => ({ familyName: `TEST ${n}`, montant: m, activityTitle: a, mode: "cb_terminal", modeLabel: "CB (terminal)", jour: "lundi" })),
    ...cbMardi.map(([n, m, a]): Enc => ({ familyName: `TEST ${n}`, montant: m, activityTitle: a, mode: "cb_terminal", modeLabel: "CB (terminal)", jour: "mardi" })),
    ...cheques.map(([n, m, a]): Enc => ({ familyName: `TEST ${n}`, montant: m, activityTitle: a, mode: "cheque", modeLabel: "Chèque", jour: "jeudi" })),
    { familyName: "TEST Moreau", montant: 220, activityTitle: "Forfait annuel", mode: "virement", modeLabel: "Virement", jour: "vendredi" },
    { familyName: "TEST Simon", montant: 40, activityTitle: "Balade", mode: "especes", modeLabel: "Espèces", jour: "vendredi" },
  ];
  return { encs, cbLundiTotal: 123, cbMardiValide: 30, chequesTotal: 340, virement: 220, virName: "Moreau" };
}

function jeuAleatoire() {
  const used = new Set<string>();
  const nom = () => { let n: string; do { n = pick(NOMS); } while (used.has(n) && used.size < NOMS.length); used.add(n); return `TEST ${n}`; };
  const mk = (mode: string, modeLabel: string, jour: Jour): Enc => ({ familyName: nom(), montant: rand(20, 200), activityTitle: pick(ACTS), mode, modeLabel, jour });
  const cbLundi = Array.from({ length: rand(2, 5) }, () => mk("cb_terminal", "CB (terminal)", "lundi"));
  const cbMardi = Array.from({ length: rand(2, 4) }, () => mk("cb_terminal", "CB (terminal)", "mardi"));
  const refusIdx = Math.random() < 0.6 ? rand(0, cbMardi.length - 1) : -1;
  const cheques = Array.from({ length: rand(1, 3) }, () => mk("cheque", "Chèque", "jeudi"));
  const vir = mk("virement", "Virement", "vendredi");
  const esp = mk("especes", "Espèces", "vendredi");
  const encs = [...cbLundi, ...cbMardi, ...cheques, vir, esp];
  return {
    encs,
    cbLundiTotal: cbLundi.reduce((a, e) => a + e.montant, 0),
    cbMardiValide: cbMardi.filter((_, i) => i !== refusIdx).reduce((a, e) => a + e.montant, 0),
    chequesTotal: cheques.reduce((a, e) => a + e.montant, 0),
    virement: vir.montant,
    virName: vir.familyName.replace("TEST ", ""),
  };
}

export default function TestRapprochementPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"fixe" | "aleatoire">("fixe");
  const [scenario, setScenario] = useState<any>(null);

  const add = (m: string) => setLog(prev => [...prev, m]);

  const creer = async () => {
    setBusy(true); setLog([]); setDone(false);
    const s = semaineTemoin();
    try {
      add("🧹 Nettoyage des encaissements de test précédents…");
      const clr = await authFetch("/api/admin/clear-test-encaissements", { method: "POST" });
      const clrData = await clr.json();
      if (!clr.ok) throw new Error(clrData.error || "Nettoyage impossible");
      add(`   ${clrData.deleted} ancien(s) encaissement(s) TEST supprimé(s).`);

      const data = mode === "fixe" ? jeuFixe() : jeuAleatoire();
      for (const e of data.encs) {
        await createEncaissement({
          familyName: e.familyName, montant: e.montant, mode: e.mode,
          modeLabel: e.modeLabel, activityTitle: e.activityTitle, explicitDate: s[e.jour],
        });
        add(`✓ ${e.modeLabel} ${e.familyName} — ${e.montant}€ (${e.jour})`);
      }
      setScenario(data);
      add("");
      add("✅ Encaissements créés. Télécharge le CSV puis importe-le dans Compta → Rapprochement.");
      setDone(true);
    } catch (e: any) {
      add(`❌ Erreur : ${e.message || e}`);
    }
    setBusy(false);
  };

  const telechargerCSV = () => {
    if (!scenario) return;
    const s = semaineTemoin();
    const lignes = [
      `Compte de test - operations entre le ${fmtFR(s.lundi)} et le ${fmtFR(s.vendredi)}`,
      "Date;Libellé;Débit euros;Crédit euros",
      `${fmtFR(s.lundi)};REMISE CARTE BANCAIRE TPE;;${eur(scenario.cbLundiTotal)}`,
      `${fmtFR(s.mardi)};REMISE CB TPE;;${eur(scenario.cbMardiValide)}`,
      `${fmtFR(s.jeudi)};REMISE CHEQUES;;${eur(scenario.chequesTotal)}`,
      `${fmtFR(s.vendredi)};VIR RECU TEST ${(scenario.virName || "MOREAU").toUpperCase()};;${eur(scenario.virement)}`,
      `${fmtFR(s.vendredi)};VIR RECU INCONNU REMBOURSEMENT;;${eur(83.50)}`,
      `${fmtFR(s.vendredi)};PRLV ASSURANCE MATERIEL;120,00;`,
    ];
    const blob = new Blob([lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `releve-test-${fmtFR(s.lundi).replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = semaineTemoin();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Test du rapprochement bancaire</h1>
      <p className="font-body text-sm text-slate-500 mb-1">Environnement de test uniquement — valide le smart matching CSV.</p>
      <p className="font-body text-xs text-slate-400 mb-5">Semaine témoin : {fmtFR(s.lundi)} → {fmtFR(s.vendredi)}</p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setMode("fixe"); setDone(false); setScenario(null); }}
          className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${mode === "fixe" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
          📌 Jeu fixe (reproductible)
        </button>
        <button onClick={() => { setMode("aleatoire"); setDone(false); setScenario(null); }}
          className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${mode === "aleatoire" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
          🎲 Jeu aléatoire (varie les cas)
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
        <p className="font-body text-sm text-amber-800 font-semibold mb-2">Résultat attendu après import :</p>
        <ul className="font-body text-xs text-amber-700 space-y-1 list-disc pl-4">
          <li><strong>Remise CB groupée</strong> → rapproche tous les CB du lundi d'un coup</li>
          <li><strong>Remise CB mardi</strong> → {mode === "fixe" ? "sous-ensemble (le 99€ refusé reste seul)" : "combinaison qui colle (refus éventuel exclu)"}</li>
          <li><strong>Remise chèques en lot</strong> → rapproche les chèques du jeudi</li>
          <li><strong>Virement nominatif</strong> → rapproché à la bonne famille</li>
          <li><strong>Virement inconnu (83,50€)</strong> → doit rester <em>non rapproché</em></li>
          <li><strong>Débit assurance</strong> → doit être <em>ignoré</em></li>
        </ul>
      </div>

      <div className="flex gap-3 flex-wrap mb-5">
        <button onClick={creer} disabled={busy}
          className="font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 px-4 py-2.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
          {busy ? "En cours…" : "1. Nettoyer + créer les encaissements"}
        </button>
        <button onClick={telechargerCSV} disabled={!done}
          className="font-body text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2.5 rounded-lg border border-blue-200 cursor-pointer disabled:opacity-40">
          2. Télécharger le CSV
        </button>
      </div>

      {log.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-600 whitespace-pre-wrap">
          {log.join("\n")}
        </div>
      )}
    </div>
  );
}
