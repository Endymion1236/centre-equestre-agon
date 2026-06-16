"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE DE TEST DU RAPPROCHEMENT BANCAIRE  —  ENVIRONNEMENT TEST UNIQUEMENT
//
//  Reproduit le VRAI workflow de septembre :
//    • chèques, espèces et virements → matchés automatiquement à l'import CSV
//    • remises CB (REMISE CARTE) → arrivent en "À traiter", on colle le DÉTAIL CA
//      (copié depuis le site Crédit Agricole) via le bouton "Détail CA"
//
//  Cette page génère donc DEUX choses :
//    1. le CSV bancaire (Latin1) à importer dans Compta → Rapprochement
//    2. le TEXTE "Détail CA" de chaque remise CB, à coller dans la modale Détail CA
//
//  Le bouton "Créer" efface d'abord les anciens encaissements TEST (préfixe
//  "TEST ") via /api/admin/clear-test-encaissements, puis recrée le jeu.
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
type Enc = { familyName: string; montant: number; activityTitle: string; mode: string; modeLabel: string; jour: Jour; refuse?: boolean };

// Heure aléatoire de transaction CB (format site CA : HH:MM:SS)
const heureCB = () => `${String(rand(9, 18)).padStart(2, "0")}:${String(rand(0, 59)).padStart(2, "0")}:${String(rand(0, 59)).padStart(2, "0")}`;

function jeuFixe() {
  const cbLundi: [string, number, string][] = [["Dupont", 45, "Cours collectif"], ["Martin", 26, "Galop d'argent"], ["Bernard", 52, "Stage poney"]];
  // Le 3e CB du mardi est REFUSÉ : saisi au TPE mais non remis par la banque.
  // → le total de la remise du mardi ne tombera pas juste → "À traiter" → on
  //   doit utiliser Détail CA. C'est LE cas à valider absolument.
  const cbMardi: [string, number, string, boolean?][] = [["Petit", 30, "Baby poney"], ["Robert", 38, "Cours particulier"], ["Mercier", 55, "Transaction refusée", true]];
  const cheques: [string, number, string][] = [["Richard", 175, "Forfait trimestre"], ["Moreau", 165, "Stage galop d'or"]];
  const mkCB = (arr: [string, number, string, boolean?][], jour: Jour): Enc[] =>
    arr.map(([n, m, a, refuse]) => ({ familyName: `TEST ${n}`, montant: m, activityTitle: a, mode: "cb_terminal", modeLabel: "CB (terminal)", jour, refuse }));
  const encs: Enc[] = [
    ...mkCB(cbLundi, "lundi"),
    ...mkCB(cbMardi, "mardi"),
    ...cheques.map(([n, m, a]): Enc => ({ familyName: `TEST ${n}`, montant: m, activityTitle: a, mode: "cheque", modeLabel: "Chèque", jour: "jeudi" })),
    { familyName: "TEST Simon", montant: 220, activityTitle: "Forfait annuel", mode: "virement", modeLabel: "Virement", jour: "vendredi" },
    { familyName: "TEST Laurent", montant: 40, activityTitle: "Balade", mode: "especes", modeLabel: "Espèces", jour: "vendredi" },
  ];
  return encs;
}

function jeuAleatoire() {
  const used = new Set<string>();
  const nom = () => { let n: string; do { n = pick(NOMS); } while (used.has(n) && used.size < NOMS.length); used.add(n); return `TEST ${n}`; };
  const mk = (mode: string, modeLabel: string, jour: Jour): Enc => ({ familyName: nom(), montant: rand(20, 200), activityTitle: pick(ACTS), mode, modeLabel, jour });
  return [
    ...Array.from({ length: rand(2, 5) }, () => mk("cb_terminal", "CB (terminal)", "lundi")),
    ...(() => {
      const cbMardi = Array.from({ length: rand(2, 4) }, () => mk("cb_terminal", "CB (terminal)", "mardi"));
      // 60% du temps, une transaction du mardi est refusée (non remise)
      if (Math.random() < 0.6 && cbMardi.length > 0) cbMardi[rand(0, cbMardi.length - 1)].refuse = true;
      return cbMardi;
    })(),
    ...Array.from({ length: rand(1, 3) }, () => mk("cheque", "Chèque", "jeudi")),
    mk("virement", "Virement", "vendredi"),
    mk("especes", "Espèces", "vendredi"),
  ];
}

export default function TestRapprochementPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"fixe" | "aleatoire">("fixe");
  const [encsCrees, setEncsCrees] = useState<Enc[]>([]);

  const add = (m: string) => setLog(prev => [...prev, m]);

  const creer = async () => {
    setBusy(true); setLog([]); setDone(false); setEncsCrees([]);
    const s = semaineTemoin();
    try {
      add("🧹 Nettoyage des encaissements de test précédents…");
      const clr = await authFetch("/api/admin/clear-test-encaissements", { method: "POST" });
      const clrData = await clr.json();
      if (!clr.ok) throw new Error(clrData.error || "Nettoyage impossible");
      add(`   ${clrData.deleted} ancien(s) encaissement(s) TEST supprimé(s).`);
      if (clrData.bankLinesRemoved > 0) add(`   ${clrData.bankLinesRemoved} ancienne(s) ligne(s) de rapprochement de test purgée(s).`);

      const encs = mode === "fixe" ? jeuFixe() : jeuAleatoire();
      for (const e of encs) {
        await createEncaissement({
          familyName: e.familyName, montant: e.montant, mode: e.mode,
          modeLabel: e.modeLabel, activityTitle: e.activityTitle, explicitDate: s[e.jour],
        });
        add(`✓ ${e.modeLabel} ${e.familyName} — ${e.montant}€ (${e.jour})${e.refuse ? "  ⚠️ REFUSÉ (non remis par la banque)" : ""}`);
      }
      setEncsCrees(encs);
      add("");
      add("✅ Encaissements créés.");
      add("→ 1) Télécharge le CSV et importe-le dans Compta → Rapprochement.");
      add("→ 2) Les chèques/virement se rapprochent seuls.");
      add("→ 3) Sur chaque ligne REMISE CARTE (« À traiter »), clique « Détail CA »");
      add("     et colle le texte correspondant (bouton « Copier détail CA » ci-dessous).");
      setDone(true);
    } catch (e: any) {
      add(`❌ Erreur : ${e.message || e}`);
    }
    setBusy(false);
  };

  // CB groupés par jour → une remise CARTE par jour dans le CSV
  const cbParJour = () => {
    const grp: Record<string, Enc[]> = {};
    for (const e of encsCrees) {
      if (e.mode !== "cb_terminal") continue;
      (grp[e.jour] ||= []).push(e);
    }
    return grp;
  };

  const telechargerCSV = () => {
    if (encsCrees.length === 0) return;
    const s = semaineTemoin();
    const grp = cbParJour();
    const totalCheques = encsCrees.filter(e => e.mode === "cheque").reduce((a, e) => a + e.montant, 0);
    const vir = encsCrees.find(e => e.mode === "virement");

    const lignes: string[] = [
      `Compte de test - operations entre le ${fmtFR(s.lundi)} et le ${fmtFR(s.vendredi)}`,
      "Date;Libellé;Débit euros;Crédit euros",
    ];
    // Une remise CARTE par jour de CB. La banque ne remet QUE les transactions
    // acceptées → le total exclut les CB refusés. Si une journée a un refus, le
    // total ne tombera pas sur la somme de tous les CB du jour → "À traiter".
    for (const jour of Object.keys(grp)) {
      const remis = grp[jour].filter(e => !e.refuse);
      if (remis.length === 0) continue;
      const total = remis.reduce((a, e) => a + e.montant, 0);
      const dt = s[jour as Jour];
      lignes.push(`${fmtFR(dt)};REMISE CARTE BANCAIRE;;${eur(total)}`);
    }
    if (totalCheques > 0) lignes.push(`${fmtFR(s.jeudi)};REMISE CHEQUES;;${eur(totalCheques)}`);
    if (vir) lignes.push(`${fmtFR(s.vendredi)};VIR RECU ${vir.familyName.toUpperCase()};;${eur(vir.montant)}`);
    // Pièges : virement inconnu (non rapproché) + débit (ignoré)
    lignes.push(`${fmtFR(s.vendredi)};VIR RECU INCONNU REMBOURSEMENT;;${eur(83.50)}`);
    lignes.push(`${fmtFR(s.vendredi)};PRLV ASSURANCE MATERIEL;120,00;`);

    // Encodage Latin1 (comme un vrai relevé CA)
    const texte = lignes.join("\r\n");
    const latin1 = new Uint8Array(texte.length);
    for (let i = 0; i < texte.length; i++) {
      const code = texte.charCodeAt(i);
      latin1[i] = code <= 0xff ? code : 0x3f;
    }
    const blob = new Blob([latin1], { type: "text/csv;charset=iso-8859-1" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `releve-test-${fmtFR(s.lundi).replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Texte "Détail CA" d'une journée de CB (format site Crédit Agricole)
  const detailCAduJour = (jour: string, encs: Enc[]) => {
    // Le site CA ne montre que les transactions effectivement remises (acceptées)
    const lignes = encs.filter(e => !e.refuse).map(e => `${heureCB()} ${eur(e.montant)} EUR`);
    return lignes.join("\n");
  };

  const copierDetail = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); } catch {}
  };

  const s = semaineTemoin();
  const grp = cbParJour();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Test du rapprochement bancaire</h1>
      <p className="font-body text-sm text-slate-500 mb-1">Environnement de test — reproduit le workflow réel (CSV + Détail CA).</p>
      <p className="font-body text-xs text-slate-400 mb-5">Semaine témoin : {fmtFR(s.lundi)} → {fmtFR(s.vendredi)}</p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setMode("fixe"); setDone(false); setEncsCrees([]); }}
          className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${mode === "fixe" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
          📌 Jeu fixe
        </button>
        <button onClick={() => { setMode("aleatoire"); setDone(false); setEncsCrees([]); }}
          className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${mode === "aleatoire" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
          🎲 Jeu aléatoire
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
        <p className="font-body text-sm text-amber-800 font-semibold mb-2">Workflow testé (comme en vrai) :</p>
        <ul className="font-body text-xs text-amber-700 space-y-1 list-disc pl-4">
          <li><strong>Chèques / virement</strong> → rapprochés automatiquement à l'import CSV</li>
          <li><strong>Remises CARTE</strong> → arrivent en « À traiter » → bouton « Détail CA » + coller le texte</li>
          <li><strong>Virement inconnu (83,50€)</strong> → doit rester non rapproché</li>
          <li><strong>Débit assurance</strong> → doit être ignoré</li>
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

      {/* Boutons "Copier détail CA" par remise CB */}
      {done && Object.keys(grp).length > 0 && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 mb-5">
          <p className="font-body text-sm font-semibold text-blue-800 mb-3">3. Détail CA à coller sur chaque remise CARTE</p>
          <div className="flex flex-col gap-3">
            {Object.entries(grp).map(([jour, encs]) => {
              const remis = encs.filter(e => !e.refuse);
              const nbRefus = encs.length - remis.length;
              const total = remis.reduce((a, e) => a + e.montant, 0);
              const dt = s[jour as Jour];
              const detail = detailCAduJour(jour, encs);
              return (
                <div key={jour} className="bg-cream rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-body text-xs font-semibold text-slate-700">
                      Remise du {fmtFR(dt)} — {remis.length} CB remis = {total.toFixed(2)}€
                      {nbRefus > 0 && <span className="text-orange-600"> · {nbRefus} refusé(s) → matching auto impossible, Détail CA requis</span>}
                    </span>
                    <button onClick={() => copierDetail(detail)}
                      className="font-body text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-blue-100">
                      📋 Copier détail CA
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] text-slate-500 whitespace-pre-wrap m-0">{detail}</pre>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-600 whitespace-pre-wrap">
          {log.join("\n")}
        </div>
      )}
    </div>
  );
}
