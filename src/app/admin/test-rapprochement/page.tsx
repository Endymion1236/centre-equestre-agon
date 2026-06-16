"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE DE TEST DU RAPPROCHEMENT BANCAIRE  —  ENVIRONNEMENT TEST UNIQUEMENT
//
//  But : valider le smart matching du rapprochement CSV sans rejouer une vraie
//  semaine. On crée un jeu d'encaissements cohérent (CB terminal, chèques,
//  espèces, virement) PUIS on génère le CSV bancaire qui correspond, avec les
//  cas pièges réels :
//    - remise CB groupée (plusieurs CB terminal = une ligne bancaire)
//    - remise CB avec une transaction refusée (la banque remet un peu moins)
//    - chèques déposés en lot
//    - virement nominatif
//    - une ligne bancaire SANS encaissement correspondant (doit rester non rapproché)
//
//  Usage : 1) "Créer les encaissements de test"  2) "Télécharger le CSV"
//          3) Compta → Rapprochement → importer le CSV  4) observer le matching
//
//  Tout est daté sur une semaine témoin (lundi à dimanche de la semaine passée).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { createEncaissement } from "@/lib/compta-encaissement";

// Lundi de la semaine dernière → dimanche
function semaineTemoin() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = lundi
  const lundi = new Date(now); lundi.setDate(now.getDate() - day - 7); lundi.setHours(10, 0, 0, 0);
  const d = (offset: number) => { const x = new Date(lundi); x.setDate(lundi.getDate() + offset); return x; };
  return { lundi, mardi: d(1), mercredi: d(2), jeudi: d(3), vendredi: d(4) };
}

const fmtFR = (dt: Date) => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;

// Jeu de test : familles fictives + montants + modes, répartis sur la semaine.
function jeuTest() {
  const s = semaineTemoin();
  // CB terminal du lundi : 3 transactions → la banque remet le total (remise groupée)
  const cbLundi = [
    { familyName: "TEST Dupont", montant: 45, activityTitle: "Cours collectif" },
    { familyName: "TEST Martin", montant: 26, activityTitle: "Galop d'argent" },
    { familyName: "TEST Bernard", montant: 52, activityTitle: "Stage poney" },
  ];
  // CB terminal du mardi : 2 saisies mais 1 refusée → la banque remet seulement la valide
  const cbMardi = [
    { familyName: "TEST Petit", montant: 30, activityTitle: "Baby poney" },
    { familyName: "TEST Refus", montant: 99, activityTitle: "Transaction refusée (ne sera pas remise)" },
  ];
  // Chèques déposés en lot le jeudi
  const cheques = [
    { familyName: "TEST Robert", montant: 175, activityTitle: "Forfait trimestre" },
    { familyName: "TEST Richard", montant: 165, activityTitle: "Stage galop d'or" },
  ];
  // Virement nominatif vendredi
  const virement = { familyName: "TEST Moreau", montant: 220, activityTitle: "Forfait annuel" };
  // Espèces vendredi (pas dans le CSV : les espèces ne passent pas par la banque ici)
  const especes = { familyName: "TEST Simon", montant: 40, activityTitle: "Balade" };
  return { s, cbLundi, cbMardi, cheques, virement, especes };
}

export default function TestRapprochementPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const add = (m: string) => setLog(prev => [...prev, m]);

  const creerEncaissements = async () => {
    setBusy(true); setLog([]); setDone(false);
    const { s, cbLundi, cbMardi, cheques, virement, especes } = jeuTest();
    try {
      for (const e of cbLundi) {
        await createEncaissement({ ...e, mode: "cb_terminal", modeLabel: "CB (terminal)", explicitDate: s.lundi });
        add(`✓ CB ${e.familyName} — ${e.montant}€ (lundi ${fmtFR(s.lundi)})`);
      }
      // Le "refusé" est créé comme encaissement (saisi au TPE) mais la banque ne le remettra pas
      for (const e of cbMardi) {
        await createEncaissement({ ...e, mode: "cb_terminal", modeLabel: "CB (terminal)", explicitDate: s.mardi });
        add(`✓ CB ${e.familyName} — ${e.montant}€ (mardi ${fmtFR(s.mardi)})`);
      }
      for (const e of cheques) {
        await createEncaissement({ ...e, mode: "cheque", modeLabel: "Chèque", explicitDate: s.jeudi });
        add(`✓ Chèque ${e.familyName} — ${e.montant}€ (jeudi ${fmtFR(s.jeudi)})`);
      }
      await createEncaissement({ ...virement, mode: "virement", modeLabel: "Virement", explicitDate: s.vendredi });
      add(`✓ Virement ${virement.familyName} — ${virement.montant}€ (vendredi ${fmtFR(s.vendredi)})`);
      await createEncaissement({ ...especes, mode: "especes", modeLabel: "Espèces", explicitDate: s.vendredi });
      add(`✓ Espèces ${especes.familyName} — ${especes.montant}€ (vendredi, hors CSV)`);
      add("");
      add("✅ Encaissements créés. Télécharge le CSV puis importe-le dans Compta → Rapprochement.");
      setDone(true);
    } catch (e: any) {
      add(`❌ Erreur : ${e.message || e}`);
    }
    setBusy(false);
  };

  const telechargerCSV = () => {
    const { s, cbLundi, cbMardi, cheques, virement } = jeuTest();
    const totalCbLundi = cbLundi.reduce((a, e) => a + e.montant, 0);
    // Mardi : seule la transaction valide est remise (le "refusé" 99€ exclu)
    const cbMardiValide = cbMardi.filter(e => e.montant !== 99).reduce((a, e) => a + e.montant, 0);
    const totalCheques = cheques.reduce((a, e) => a + e.montant, 0);
    const eur = (n: number) => n.toFixed(2).replace(".", ",");

    // Format Crédit Agricole simplifié : en-tête période + Date;Libellé;Débit;Crédit
    const lignes = [
      `Compte de test - operations entre le ${fmtFR(s.lundi)} et le ${fmtFR(s.vendredi)}`,
      "Date;Libellé;Débit euros;Crédit euros",
      // Remise CB terminal groupée du lundi (= les 3 CB)
      `${fmtFR(s.lundi)};REMISE CARTE BANCAIRE TPE;;${eur(totalCbLundi)}`,
      // Remise CB mardi : montant réduit (transaction refusée non remise)
      `${fmtFR(s.mardi)};REMISE CB TPE;;${eur(cbMardiValide)}`,
      // Chèques déposés en lot jeudi
      `${fmtFR(s.jeudi)};REMISE CHEQUES;;${eur(totalCheques)}`,
      // Virement nominatif vendredi
      `${fmtFR(s.vendredi)};VIR RECU TEST MOREAU;;${eur(virement.montant)}`,
      // Ligne SANS encaissement correspondant → doit rester NON rapprochée
      `${fmtFR(s.vendredi)};VIR RECU INCONNU REMBOURSEMENT;;${eur(83.50)}`,
      // Un débit (doit être ignoré par le rapprochement)
      `${fmtFR(s.vendredi)};PRLV ASSURANCE MATERIEL;120,00;`,
    ];
    const blob = new Blob([lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `releve-test-${fmtFR(s.lundi).replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { s } = jeuTest();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Test du rapprochement bancaire</h1>
      <p className="font-body text-sm text-slate-500 mb-1">Environnement de test uniquement — valide le smart matching CSV.</p>
      <p className="font-body text-xs text-slate-400 mb-6">Semaine témoin : {fmtFR(s.lundi)} → {fmtFR(s.vendredi)}</p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
        <p className="font-body text-sm text-amber-800 font-semibold mb-2">Cas testés (résultat attendu) :</p>
        <ul className="font-body text-xs text-amber-700 space-y-1 list-disc pl-4">
          <li><strong>Remise CB groupée</strong> (lundi, 123€) → rapproche 3 CB d'un coup</li>
          <li><strong>Remise CB avec refus</strong> (mardi, 30€) → trouve le sous-ensemble qui colle (le 99€ refusé reste seul)</li>
          <li><strong>Remise chèques en lot</strong> (jeudi, 340€) → rapproche 2 chèques</li>
          <li><strong>Virement nominatif</strong> (vendredi, 220€) → rapproche TEST Moreau</li>
          <li><strong>Virement inconnu</strong> (83,50€) → doit rester <em>non rapproché</em></li>
          <li><strong>Débit assurance</strong> → doit être <em>ignoré</em> (sortie d'argent)</li>
        </ul>
      </div>

      <div className="flex gap-3 flex-wrap mb-5">
        <button onClick={creerEncaissements} disabled={busy}
          className="font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 px-4 py-2.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
          {busy ? "Création…" : "1. Créer les encaissements de test"}
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

      <p className="font-body text-xs text-slate-400 mt-5">
        Après import : vérifie que tout est rapproché sauf le virement inconnu (83,50€), et que le débit assurance n'apparaît pas.
        Reset possible via Admin → Réinitialisation (données de test).
      </p>
    </div>
  );
}
