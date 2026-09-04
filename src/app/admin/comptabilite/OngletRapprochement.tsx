"use client";

/**
 * src/app/admin/comptabilite/OngletRapprochement.tsx
 *
 * L'écran du rapprochement bancaire : le relevé importé face aux
 * encaissements, le pointage manuel des lignes que la machine n'a pas su
 * rapprocher, la saisie du détail d'une remise Crédit Agricole, et la liste
 * des lignes volontairement écartées.
 *
 * Le calcul vit dans useRapprochement ; ce fichier n'en montre que le
 * résultat et recueille les décisions prises à la main.
 */

import { useState } from "react";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Upload, Search, Sparkles, AlertTriangle, EyeOff, RefreshCw } from "lucide-react";
import { modeLabels } from "./libelles-modes";
import { encaissementEnDetail, encaissementsDeRemiseSepa, parserDetailCa } from "./rapprochement-utils";
import type { LigneBancaire } from "./useRapprochement";

export interface OngletRapprochementProps {
  tab: string;
  loading: boolean;
  bankLines: LigneBancaire[];
  payments: any[];
  remises: any[];
  /** Remises de prélèvements SEPA (collection remises-sepa). */
  remisesSepa: any[];
  encaissementsCompta: any[];
  filteredPayments: any[];
  handleCSVImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Rejoue le rapprochement automatique sur le relevé déjà importé. */
  relancerRapprochement: () => Promise<{ avant: number; apres: number }>;
  updateAndSaveBankLines: (lignes: LigneBancaire[]) => Promise<void> | void;
  setBankLines: (lignes: LigneBancaire[]) => void;
  saveBankLinesByMonth: (lignes: LigneBancaire[], mode?: "user-update" | "csv-import") => Promise<void> | void;
  syncVersementsEspeces: (lignes: LigneBancaire[]) => Promise<void> | void;
  fetchData: () => void;
  /** Analyse du relevé par l'assistant, partagée avec le panneau flottant. */
  analyserRapprochement: () => void | Promise<void>;
  iaLoading: boolean;
  iaAnalysis: string | null;
  iaStats: any;
}

export default function OngletRapprochement({
  tab, loading, bankLines, payments, remises, remisesSepa, encaissementsCompta, filteredPayments,
  handleCSVImport, relancerRapprochement, updateAndSaveBankLines, setBankLines, saveBankLinesByMonth,
  syncVersementsEspeces, fetchData,
  analyserRapprochement, iaLoading, iaAnalysis, iaStats,
}: OngletRapprochementProps) {
  // Pointage manuel d'une ligne bancaire
  const [showManualMatch, setShowManualMatch] = useState<number | null>(null);
  const [expandedBankLine, setExpandedBankLine] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState("");
  const [relanceEnCours, setRelanceEnCours] = useState(false);
  // Saisie du détail d'une remise collé depuis le site Crédit Agricole
  const [showCADetailModal, setShowCADetailModal] = useState<number | null>(null);
  const [caDetailText, setCaDetailText] = useState("");
  const [caDetailPreview, setCaDetailPreview] = useState<{ found: any[]; missing: number[]; total: number } | null>(null);

  // Lignes volontairement écartées du rapprochement : leur nombre sert à la
  // fois d'onglet et de rappel en tête de liste.
  const nbIgnores = bankLines.filter(b => b.matched && b.matchType === "Ignoré").length;

  return (
    <>
      {!loading && tab === "rapprochement" && (
        <div className="flex flex-col gap-5">

          {/* ── Dashboard rapprochement ────────────────────────────────── */}
          {(() => {
            // Virements en attente depuis > 7 jours
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const virAttendus = payments.filter(p =>
              p.paymentMode === "virement" &&
              (p.status === "pending" || p.status === "partial") &&
              p.date?.seconds && new Date(p.date.seconds * 1000) < sevenDaysAgo
            );
            // Stats bankLines
            const nbMatched = bankLines.filter(b => b.matched).length;
            const nbPending = bankLines.filter(b => !b.matched).length;
            const montantPending = bankLines.filter(b => !b.matched).reduce((s, b) => s + b.amount, 0);

            return (
              <>
                {/* KPIs rapprochement */}
                {bankLines.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-green-600">{nbMatched}</div>
                      <div className="font-body text-[11px] text-slate-500">✅ Rapprochées</div>
                    </Card>
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-orange-500">{nbPending}</div>
                      <div className="font-body text-[11px] text-slate-500">⏳ À traiter</div>
                      {nbPending > 0 && <div className="font-body text-[10px] text-orange-400">{montantPending.toFixed(0)}€</div>}
                    </Card>
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-blue-500">
                        {bankLines.length > 0 ? Math.round((nbMatched / bankLines.length) * 100) : 0}%
                      </div>
                      <div className="font-body text-[11px] text-slate-500">Taux match</div>
                    </Card>
                  </div>
                )}

                {/* Alertes virements attendus non reçus */}
                {virAttendus.length > 0 && (
                  <Card padding="md" className="border-orange-200 bg-orange-50">
                    <div className="font-body text-sm font-semibold text-orange-700 mb-2">
                      ⚠️ {virAttendus.length} virement{virAttendus.length > 1 ? "s" : ""} attendu{virAttendus.length > 1 ? "s" : ""} depuis plus de 7 jours
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {virAttendus.map((p: any) => {
                        const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                        const joursAttente = d ? Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)) : "?";
                        return (
                          <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                            <div>
                              <span className="font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                              <span className="font-body text-xs text-slate-500 ml-2">
                                {(p.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 40)}
                              </span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-body text-sm font-bold text-orange-600">{(p.totalTTC || 0).toFixed(2)}€</div>
                              <div className="font-body text-[10px] text-slate-400">J+{joursAttente}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="font-body text-xs text-orange-600 mt-2">
                      Total attendu : <strong>{virAttendus.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0).toFixed(2)}€</strong>
                    </div>
                  </Card>
                )}
              </>
            );
          })()}

          <Card padding="md" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              Importez votre relevé bancaire au format CSV pour rapprocher les mouvements avec vos encaissements. Les virements sont également matchés par nom de famille dans le libellé, et les prélèvements SEPA par le total de la remise. Cliquez sur "Pointer" pour les lignes non rapprochées : la fenêtre propose les factures en attente de règlement, les remises SEPA et les factures du mois.
              <br />
              Une facture en attente pointée sur un virement est <b>encaissée</b> (écriture au journal, numéro de facture) à la date du relevé. Si tu as créé une facture ou déposé une remise après l'import, "Relancer le rapprochement" refait le calcul sans réimporter le CSV.
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-3">Importer un relevé bancaire</h3>
            <p className="font-body text-xs text-slate-500 mb-2">Compatible Crédit Agricole, LCL, BNP, Société Générale (CSV avec séparateur point-virgule)</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="font-body text-xs text-amber-900">
                <b>Remises CB :</b> le matching automatique par "sous-ensemble" est désactivé pour éviter les associations erronées. Les remises <code className="bg-amber-100 px-1 rounded">REMISE CARTE</code> arrivent en "À traiter" — utilise le bouton <b>Détail CA</b> sur chaque remise pour coller le détail des transactions copié depuis le site Crédit Agricole.
                <br />
                Les chèques, espèces et virements continuent d'être matchés automatiquement.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-2 font-body text-sm font-semibold text-blue-500 bg-white px-5 py-3 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors inline-flex">
                <Upload size={16} /> Importer CSV
                <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
              </label>
              {bankLines.some(b => !b.matched) && (
                <button
                  disabled={relanceEnCours}
                  onClick={async () => {
                    setRelanceEnCours(true);
                    try {
                      const { avant, apres } = await relancerRapprochement();
                      const gain = apres - avant;
                      alert(gain > 0
                        ? `✅ ${gain} ligne${gain > 1 ? "s" : ""} supplémentaire${gain > 1 ? "s" : ""} rapprochée${gain > 1 ? "s" : ""} (${apres} au total).`
                        : gain < 0
                          ? `⚠️ ${-gain} ligne${-gain > 1 ? "s" : ""} auparavant rapprochée${-gain > 1 ? "s" : ""} automatiquement ne trouve${-gain > 1 ? "nt" : ""} plus de correspondance (${apres} rapprochée${apres > 1 ? "s" : ""}). Les pointages faits à la main sont conservés.`
                          : `Aucune nouvelle correspondance : ${apres} ligne${apres > 1 ? "s" : ""} rapprochée${apres > 1 ? "s" : ""}, les autres restent à pointer à la main.`);
                    } catch (e: any) {
                      console.error("[relancer-rapprochement]", e);
                      alert(`Erreur : ${e?.message || e}`);
                    }
                    setRelanceEnCours(false);
                  }}
                  title="Refaire le rapprochement automatique avec les factures, encaissements et remises actuels, sans réimporter le relevé"
                  className="flex items-center gap-2 font-body text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-4 py-3 rounded-lg border border-green-200 cursor-pointer disabled:opacity-50">
                  {relanceEnCours ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Relancer le rapprochement
                </button>
              )}
              {/* Mois de transition : les factures d'août 2026 sont dans l'ancien
                  logiciel, aucune ligne du relevé ne peut se rapprocher. Plutôt
                  que d'ignorer 80 lignes une par une, on les écarte d'un coup,
                  avec le motif — elles restent consultables et restaurables
                  d'un coup dans l'onglet Ignorées. */}
              {bankLines.some(b => !b.matched) && (
                <button
                  onClick={async () => {
                    const aTraiter = bankLines.filter(b => !b.matched);
                    const motif = window.prompt(
                      `Écarter d'un coup les ${aTraiter.length} ligne${aTraiter.length > 1 ? "s" : ""} à traiter de ce mois ?\n\n`
                      + `Elles passeront dans l'onglet Ignorées avec ce motif, et pourront être restaurées d'un coup.\n\n`
                      + `Motif :`,
                      "Mois de transition — factures sur l'ancien logiciel",
                    );
                    if (motif === null) return;
                    const detail = `Ignoré en bloc : ${motif.trim() || "sans motif"}`;
                    const updated = bankLines.map(b => b.matched ? b : { ...b, matched: true, matchType: "Ignoré", matchDetail: detail });
                    await updateAndSaveBankLines(updated);
                  }}
                  title="Écarter toutes les lignes encore à traiter, avec un motif (mois de transition, ancien logiciel…)"
                  className="flex items-center gap-2 font-body text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 px-4 py-3 rounded-lg border border-slate-200 cursor-pointer">
                  <EyeOff size={16} />
                  Ignorer les {bankLines.filter(b => !b.matched).length} lignes à traiter
                </button>
              )}
              {bankLines.length > 0 && bankLines.some(b => b.matched) && (
                <button
                  onClick={async () => {
                    if (!confirm("Synchroniser les encaissements et remises avec les lignes bancaires actuellement matchées ?\n\n• Les encaissements reliés seront marqués 'rapprochés' (donc retirés de 'à remettre').\n• Les remises dont tous les encaissements sont rapprochés seront pointées automatiquement.")) return;
                    try {
                      // 1. Reconstruire usedEncIds à partir des bankLines matchées
                      //    Via matchedEncs on a (familyName, montant, date, activityTitle)
                      //    → on retrouve les encaissements correspondants
                      const targetEncIds = new Set<string>();
                      const targetRemiseIds = new Set<string>();
                      const targetPaymentIds = new Set<string>();

                      for (const bl of bankLines) {
                        if (!bl.matched) continue;
                        if (bl.matchType === "Ignoré") continue;

                        // Paiement virement : via manualPaymentId
                        if (bl.manualPaymentId) targetPaymentIds.add(bl.manualPaymentId);

                        // Encaissements individuels : via matchedEncs
                        // Déduplication multi-set : plusieurs encs peuvent partager
                        // le même triplet (familyName, montant, date) — typique des
                        // remises "Sous-ensemble CB Terminal" qui regroupent N
                        // promenades du même jour à 25€ pour la même famille.
                        // On exclut les ids déjà consommés pour qu'à chaque enc
                        // de matchedEncs corresponde un enc Firestore distinct.
                        for (const enc of (bl.matchedEncs || [])) {
                          const candidate = encaissementsCompta.find((e: any) => {
                            if (targetEncIds.has(e.id)) return false; // déjà consommé
                            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                            return (e.familyName || "") === enc.familyName
                              && Math.abs((e.montant || 0) - enc.montant) < 0.02
                              && d === enc.date;
                          });
                          if (candidate) targetEncIds.add(candidate.id);
                        }

                        // Remises bancaires : détection via matchType "Chèques" / "Espèces"
                        // + montant exact → on cherche un bordereau existant
                        if (bl.matchType === "Chèques" || bl.matchType === "Espèces") {
                          const remiseMatch = (remises || []).find((r: any) =>
                            Math.abs((r.total || 0) - bl.amount) < 0.02 &&
                            (r.paymentMode === (bl.matchType === "Chèques" ? "cheque" : "especes") || r.paymentMode === "mixte")
                          );
                          if (remiseMatch) targetRemiseIds.add(remiseMatch.id);
                        }
                      }

                      // 1.bis. Détection indirecte des remises via leurs encaissements
                      //        Si tous les encs d'une remise sont dans targetEncIds, on pointe la remise.
                      for (const r of (remises || [])) {
                        if (targetRemiseIds.has(r.id)) continue;
                        const encIds = r.encaissementIds || [];
                        if (encIds.length === 0) continue;
                        const allConsumed = encIds.every((id: string) => targetEncIds.has(id));
                        if (allConsumed) {
                          targetRemiseIds.add(r.id);
                          console.log(`[resync] Remise ${r.id} détectée indirectement via encs`);
                        }
                      }

                      // 2. Marquer les encaissements
                      const encUpdates: Promise<any>[] = [];
                      for (const encId of targetEncIds) {
                        encUpdates.push(updateDoc(doc(db, "encaissements", encId), {
                          reconciledByBank: true,
                          reconciledAt: serverTimestamp(),
                        }));
                      }

                      // 3. Marquer les remises comme pointées
                      const remiseUpdates: Promise<any>[] = [];
                      for (const rid of targetRemiseIds) {
                        remiseUpdates.push(updateDoc(doc(db, "remises", rid), {
                          pointee: true,
                          pointeeDate: new Date().toISOString(),
                          pointeeNote: "Synchronisation rétroactive depuis le rapprochement bancaire",
                          updatedAt: serverTimestamp(),
                        }));
                      }

                      // 4. Marquer les paiements virement comme payés
                      const paymentUpdates: Promise<any>[] = [];
                      for (const pid of targetPaymentIds) {
                        const pSnap = await getDoc(doc(db, "payments", pid));
                        if (!pSnap.exists()) continue;
                        const p = pSnap.data() as any;
                        if (p.status === "paid") continue;
                        paymentUpdates.push(updateDoc(doc(db, "payments", pid), {
                          status: "paid",
                          paidAmount: p.totalTTC || p.paidAmount || 0,
                          paidAt: serverTimestamp(),
                          reconciledByBank: true,
                        }));
                      }

                      await Promise.all([...encUpdates, ...remiseUpdates, ...paymentUpdates]);

                      // 5. Créer les versements espèces manquants (sync livre de caisse)
                      await syncVersementsEspeces(bankLines);

                      alert(`✅ Synchronisation terminée\n\n• ${encUpdates.length} encaissement(s) marqués rapprochés\n• ${remiseUpdates.length} remise(s) pointée(s)\n• ${paymentUpdates.length} paiement(s) virement marqué(s) payés`);
                      fetchData();
                    } catch (e: any) {
                      console.error("Erreur sync rétroactive:", e);
                      alert(`Erreur : ${e.message || e}`);
                    }
                  }}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-3 rounded-lg border border-purple-200 cursor-pointer">
                  🔄 Resynchroniser
                </button>
              )}
              {bankLines.length > 0 && bankLines.some(b => b.matched) && (
                <button
                  onClick={async () => {
                    // ─────────────────────────────────────────────────────────
                    // NETTOYAGE DES DOUBLONS matchedEncs
                    //
                    // Bug historique : l'algo de matching a parfois inscrit
                    // le même triplet (famille, montant, date) dans matchedEncs
                    // de plusieurs bankLines, alors qu'il n'existe qu'UN seul
                    // encaissement Firestore correspondant. Conséquence : le
                    // compteur "à remettre" reste élevé car les bankLines
                    // suivantes n'ont pas de cible réelle.
                    //
                    // Ce bouton :
                    //   1. Parcourt les bankLines dans l'ordre
                    //   2. Pour chaque entrée matchedEncs, cherche un enc
                    //      Firestore non encore consommé (triplet exact)
                    //   3. Les entrées orphelines (déjà consommées) sont
                    //      retirées
                    //   4. Si une bankLine perd toutes ses entrées → on la
                    //      dé-matche
                    //   5. Affiche un rapport, demande confirmation, écrit
                    // ─────────────────────────────────────────────────────────
                    try {
                      const claimedEncIds = new Set<string>();
                      const cleanedLines = bankLines.map(bl => ({ ...bl, matchedEncs: bl.matchedEncs ? [...bl.matchedEncs] : undefined }));

                      let totalOrphans = 0;
                      let linesEmptied = 0;
                      const reportSamples: string[] = [];

                      for (let i = 0; i < cleanedLines.length; i++) {
                        const bl = cleanedLines[i];
                        if (!bl.matched) continue;
                        if (bl.matchType === "Ignoré") continue;
                        if (!bl.matchedEncs || bl.matchedEncs.length === 0) continue;

                        const kept: typeof bl.matchedEncs = [];
                        const orphans: typeof bl.matchedEncs = [];

                        for (const enc of bl.matchedEncs) {
                          // Cherche un enc Firestore non encore consommé
                          const candidate = encaissementsCompta.find((e: any) => {
                            if (claimedEncIds.has(e.id)) return false;
                            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
                            return (e.familyName || "") === enc.familyName
                              && Math.abs((e.montant || 0) - enc.montant) < 0.02
                              && d === enc.date;
                          });
                          if (candidate) {
                            claimedEncIds.add(candidate.id);
                            kept.push(enc);
                          } else {
                            orphans.push(enc);
                          }
                        }

                        if (orphans.length > 0) {
                          totalOrphans += orphans.length;
                          if (reportSamples.length < 5) {
                            reportSamples.push(`Ligne ${bl.date} (${bl.amount}€) : ${orphans.length} orphelin(s) — ex: ${orphans[0].familyName} ${orphans[0].montant}€`);
                          }
                          cleanedLines[i].matchedEncs = kept;
                          if (kept.length === 0) {
                            // Toutes les entrées étaient orphelines → on dé-matche
                            // SAUF si c'est un type qui ne dépend pas de matchedEncs
                            // (Virement avec manualPaymentId, Chèques/Espèces remises…)
                            const hasOtherAnchor = bl.manualPaymentId
                              || bl.matchType === "Chèques"
                              || bl.matchType === "Espèces";
                            if (!hasOtherAnchor) {
                              cleanedLines[i] = {
                                ...cleanedLines[i],
                                matched: false,
                                matchType: "",
                                matchDetail: "",
                                matchedEncs: undefined,
                              };
                              linesEmptied++;
                            }
                          }
                        }
                      }

                      if (totalOrphans === 0) {
                        alert("✅ Aucun doublon détecté.\n\nToutes les entrées matchedEncs correspondent à un encaissement Firestore distinct.");
                        return;
                      }

                      const message = `🧹 Rapport de nettoyage\n\n`
                        + `• ${totalOrphans} entrée(s) orpheline(s) à retirer\n`
                        + `• ${linesEmptied} ligne(s) bancaire(s) à dé-matcher (devenues vides)\n\n`
                        + `Exemples :\n${reportSamples.map(s => `  ${s}`).join("\n")}\n\n`
                        + `Confirmer l'écriture en base ?`;

                      if (!confirm(message)) return;

                      await saveBankLinesByMonth(cleanedLines);

                      setBankLines(cleanedLines);
                      alert(`✅ Nettoyage terminé\n\n• ${totalOrphans} doublon(s) retiré(s)\n• ${linesEmptied} ligne(s) dé-matchée(s)\n\nClique maintenant sur "Resynchroniser" pour mettre à jour les encaissements.`);
                    } catch (e: any) {
                      console.error("[clean-duplicates] Erreur:", e);
                      alert(`Erreur : ${e.message || e}`);
                    }
                  }}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-3 rounded-lg border border-amber-200 cursor-pointer">
                  🧹 Nettoyer doublons
                </button>
              )}
            </div>
            {bankLines.length > 0 && bankLines.some(b => b.matched) && (
              <p className="font-body text-[11px] text-slate-500 mt-2">
                "Resynchroniser" marque tous les encaissements/remises/paiements correspondant aux rapprochements actuels. "Nettoyer doublons" retire les entrées matchedEncs qui pointent vers un encaissement déjà revendiqué par une autre ligne bancaire.
              </p>
            )}
          </Card>

          {bankLines.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className="w-24">Date</span>
                <span className="flex-1">Libellé bancaire</span>
                <span className="w-24 text-right">Montant</span>
                <span className="w-28 text-center">Rapprochement</span>
                <span className="w-20 text-center">Statut</span>
                <span className="w-20 text-center">Action</span>
              </div>
              {bankLines
                .map((bl, i) => ({ bl, i }))
                .filter(({ bl }) => bl.matchType !== "Ignoré") // les ignorées sont dans l'onglet dédié
                .map(({ bl, i }) => {
                  // Détecter une remise CB partiellement matchée via Détail CA
                  // (X/Y transactions trouvées avec N manquantes). On stocke
                  // missingAmounts[] depuis le commit Détail CA pour pouvoir les
                  // afficher au survol et signaler visuellement la ligne.
                  const hasMissing = !!(bl.missingAmounts && bl.missingAmounts.length > 0);
                  const missingTooltip = hasMissing
                    ? `${bl.missingAmounts!.length} transaction(s) non retrouvée(s) :\n` +
                      bl.missingAmounts!.map(a => `• ${a.toFixed(2)}€`).join("\n") +
                      `\n\nCela signifie que ces montants apparaissent dans le détail Crédit Agricole de cette remise mais qu'aucun encaissement CB Terminal n'a été enregistré dans Claude pour ces montants. Vérifie le TPE ou ajoute les paiements manquants.`
                    : undefined;
                return (
                <div key={i}>
                <div title={missingTooltip}
                  className={`px-5 py-3 border-b border-blue-500/8 flex items-center ${
                    bl.matched
                      ? hasMissing
                        ? "bg-amber-50 border-l-4 border-l-amber-500" // surlignage : remise CB partielle
                        : ""
                      : "bg-orange-50"
                  }`}>
                  <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                  <div className="flex-1">
                    <div className="font-body text-sm text-blue-800 flex items-center gap-1.5">
                      {bl.label}
                      {hasMissing && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-900 cursor-help">
                          ⚠ {bl.missingAmounts!.length} manquant{bl.missingAmounts!.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {bl.matched && bl.matchDetail && (
                      <div className="font-body text-xs text-green-600 mt-0.5 flex items-center gap-1">
                        {bl.matchedEncs && bl.matchedEncs.length > 1 ? (
                          <button onClick={() => setExpandedBankLine(expandedBankLine === i ? null : i)}
                            className="flex items-center gap-1 text-green-600 bg-transparent border-none cursor-pointer p-0 font-body text-xs hover:text-green-800">
                            <span className={`inline-block transition-transform ${expandedBankLine === i ? "rotate-90" : ""}`}>▶</span>
                            ↳ {bl.matchDetail}
                          </button>
                        ) : (
                          <span>↳ {bl.matchDetail}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="w-24 text-right font-body text-sm font-semibold text-green-600">{bl.amount.toFixed(2)}€</span>
                  <span className="w-28 text-center">
                    {bl.matched && bl.matchType && (
                      <Badge color={
                        bl.matchType === "Ignoré" ? "gray"
                        : bl.uncertain ? "yellow"
                        : bl.matchType === "Manuel" ? "orange"
                        : "blue"
                      }>
                        {bl.uncertain ? "⚠️ " : ""}{bl.matchType}
                      </Badge>
                    )}
                  </span>
                  <span className="w-20 text-center">
                    <Badge color={bl.matched ? (bl.uncertain ? "yellow" : "green") : "orange"}>
                      {bl.matched ? (bl.uncertain ? "À vérifier" : "OK") : "À traiter"}
                    </Badge>
                  </span>
                  <span className="w-20 text-center">
                    {!bl.matched && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setShowManualMatch(i); setManualSearch(""); }}
                          className="font-body text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-blue-100">
                          Pointer
                        </button>
                        {/* Bouton Détail CA : uniquement pour les remises CB */}
                        {(bl.label.toUpperCase().includes("REMISE") && (bl.label.toUpperCase().includes("CARTE") || bl.label.toUpperCase().includes("CB") || bl.label.toUpperCase().includes("TPE"))) && (
                          <button onClick={() => { setShowCADetailModal(i); setCaDetailText(""); setCaDetailPreview(null); }}
                            className="font-body text-[10px] text-purple-600 bg-purple-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-purple-100"
                            title="Coller le détail de la remise depuis le site Crédit Agricole">
                            📋 Détail CA
                          </button>
                        )}
                        <button onClick={() => {
                          const updated = [...bankLines];
                          updated[i] = { ...updated[i], matched: true, matchType: "Ignoré", matchDetail: "Ignoré manuellement" };
                          updateAndSaveBankLines(updated);
                        }}
                          className="font-body text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-slate-100">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {bl.matched && bl.matchType === "Ignoré" && (
                      <button onClick={() => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "" };
                        updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">
                        Restaurer
                      </button>
                    )}
                    {/* Bouton "Dé-pointer" universel pour tout match hors Ignoré.
                        La sync auto dans updateAndSaveBankLines se charge de repasser
                        les encs à reconciledByBank=false et les payments virement à pending. */}
                    {/* Une correspondance « à vérifier » n'a rien écrit : confirmer
                        lève le doute et, s'il s'agit d'une facture en attente,
                        déclenche son encaissement au journal. */}
                    {bl.matched && bl.uncertain && bl.matchType !== "Ignoré" && (
                      <button onClick={async () => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], uncertain: false, matchDetail: bl.matchDetail.replace(/ ⚠️ montant:.*$/, "") };
                        await updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-green-100 mb-1"
                        title="Confirmer cette correspondance">
                        Confirmer
                      </button>
                    )}
                    {bl.matched && bl.matchType !== "Ignoré" && (
                      <button onClick={async () => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "", matchedEncs: undefined, manualPaymentId: undefined, remiseSepaId: undefined, uncertain: false };
                        await updateAndSaveBankLines(updated);
                      }}
                        className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100"
                        title="Annuler ce rapprochement et remettre l'encaissement dans 'à remettre'">
                        Dé-pointer
                      </button>
                    )}
                  </span>
                </div>
                {/* Accordéon détail des encaissements */}
                {expandedBankLine === i && bl.matchedEncs && bl.matchedEncs.length > 1 && (
                  <div className="px-5 py-2 bg-green-50 border-b border-green-200">
                    <div className="ml-24">
                      <table className="w-full" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr className="font-body text-[10px] text-slate-400 uppercase">
                            <th className="text-left py-1 pr-3">Date</th>
                            <th className="text-left py-1 pr-3">Famille</th>
                            <th className="text-left py-1 pr-3">Activité</th>
                            <th className="text-right py-1">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bl.matchedEncs.map((enc, j) => (
                            <tr key={j} className="font-body text-xs border-t border-green-100">
                              <td className="py-1.5 pr-3 text-slate-500">{enc.date}</td>
                              <td className="py-1.5 pr-3 text-blue-800 font-semibold">{enc.familyName}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{enc.activityTitle}</td>
                              <td className="py-1.5 text-right text-green-700 font-semibold">{enc.montant.toFixed(2)}€</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                </div>
              )})}
              <div className="px-5 py-3 bg-sand flex justify-between font-body text-sm">
                <span className="font-semibold text-blue-800">
                  {bankLines.filter(b => b.matchType !== "Ignoré").length} lignes affichées
                  {nbIgnores > 0 && (
                    <span className="text-slate-500 font-normal ml-2">
                      ({nbIgnores} ignorée{nbIgnores > 1 ? "s" : ""} dans l'onglet dédié)
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-green-600 font-semibold">
                    {bankLines.filter((b) => b.matched && b.matchType !== "Ignoré").length} rapprochées
                  </span>
                  {" · "}
                  <span className="text-orange-500 font-semibold">
                    {bankLines.filter((b) => !b.matched).length} à traiter
                  </span>
                </span>
              </div>
            </Card>
          )}

          {/* ── Bouton IA + analyse ── */}
          {bankLines.length > 0 && (
            <div className="flex flex-col gap-4">
              <button onClick={analyserRapprochement} disabled={iaLoading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
                {iaLoading
                  ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours...</>
                  : <><Sparkles size={16} /> Analyser avec l'IA</>}
              </button>

              {iaStats && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total relevé", value: `${iaStats.totalBanque}€`, color: "text-blue-800" },
                    { label: "Total encaissé", value: `${iaStats.totalEnc}€`, color: "text-green-600" },
                    { label: "Écart", value: `${iaStats.ecart}€`, color: parseFloat(iaStats.ecart) === 0 ? "text-green-600" : "text-orange-500" },
                  ].map(s => (
                    <div key={s.label} className="bg-sand rounded-xl p-3 text-center">
                      <div className={`font-body text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="font-body text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {iaAnalysis && (
                <Card padding="md" className="border-purple-200 bg-purple-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <span className="font-body text-sm font-semibold text-blue-800">Analyse IA</span>
                    <Badge color="blue">{iaStats?.tauxRapprochement}% rapproché</Badge>
                  </div>
                  <div className="font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">
                    {iaAnalysis}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Modal : Pointage manuel ─── */}
      {showManualMatch !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowManualMatch(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Pointer manuellement</h2>
                <p className="font-body text-xs text-slate-500">
                  Mouvement : {bankLines[showManualMatch]?.label} — {bankLines[showManualMatch]?.amount.toFixed(2)}€
                </p>
              </div>
              <button onClick={() => setShowManualMatch(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Filtrer par client, montant…" value={manualSearch} onChange={e => setManualSearch(e.target.value)}
                  className="w-full font-body text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {(() => {
                const ligne = bankLines[showManualMatch];
                if (!ligne) return null;
                const q = manualSearch.toLowerCase();
                const montantProche = (m: number) => Math.abs((m || 0) - ligne.amount) < 0.02;

                // 1. Factures en attente de règlement (toutes périodes) : c'est
                //    là que se trouve la facture créée pour un virement attendu.
                //    Elles étaient absentes de cette liste — filtrées avec les
                //    « pending » — et un virement ne pouvait donc jamais être
                //    relié à sa facture.
                const idsDuMois = new Set(filteredPayments.map((p: any) => p.id));
                const enAttente = payments
                  .filter((p: any) => (p.status === "pending" || p.status === "partial") && !idsDuMois.has(p.id))
                  .filter((p: any) => {
                    if (!q) return true;
                    return p.familyName?.toLowerCase().includes(q)
                      || (p.totalTTC || 0).toFixed(2).includes(q)
                      || (p.invoiceNumber || "").toLowerCase().includes(q);
                  })
                  .sort((a: any, b: any) => {
                    const ea = montantProche(a.totalTTC - (a.paidAmount || 0)) ? 0 : 1;
                    const eb = montantProche(b.totalTTC - (b.paidAmount || 0)) ? 0 : 1;
                    if (ea !== eb) return ea - eb;
                    return (b.date?.seconds || 0) - (a.date?.seconds || 0);
                  })
                  .slice(0, 30);

                // 2. Remises de prélèvements SEPA : une ligne bancaire pour 1
                //    ou 40 prélèvements, son montant est le total de la remise.
                const remisesCandidates = (remisesSepa || [])
                  .filter((r: any) => {
                    if (!q) return true;
                    return String(r.numero || "").includes(q)
                      || (r.montantTotal || 0).toFixed(2).includes(q)
                      || (r.datePrelevement || "").includes(q)
                      || "sepa".includes(q) || "prélèvement".includes(q);
                  })
                  .sort((a: any, b: any) => {
                    const ea = montantProche(a.montantTotal) ? 0 : 1;
                    const eb = montantProche(b.montantTotal) ? 0 : 1;
                    if (ea !== eb) return ea - eb;
                    return (b.datePrelevement || "").localeCompare(a.datePrelevement || "");
                  })
                  .slice(0, 20);

                // 3. Factures du mois (réglées ou partielles) — la liste d'origine.
                const duMois = filteredPayments
                  .filter((p: any) => {
                    if (!q) return true;
                    return p.familyName?.toLowerCase().includes(q) ||
                      (p.totalTTC || 0).toFixed(2).includes(q) ||
                      (modeLabels[p.paymentMode] || "").toLowerCase().includes(q);
                  })
                  .slice(0, 50);

                const pointerFacture = async (p: any) => {
                  const restant = Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100;
                  const enAttenteDeReglement = p.status === "pending" || p.status === "partial";
                  if (enAttenteDeReglement && !montantProche(restant)) {
                    const ok = window.confirm(
                      `Le virement fait ${ligne.amount.toFixed(2)}€ et il reste ${restant.toFixed(2)}€ à régler sur cette facture.\n\n`
                      + `Encaisser quand même ${ligne.amount.toFixed(2)}€ sur la facture de ${p.familyName} ?`,
                    );
                    if (!ok) return;
                  }
                  const updated = [...bankLines];
                  updated[showManualMatch!] = {
                    ...updated[showManualMatch!],
                    matched: true,
                    matchType: "Manuel",
                    matchDetail: enAttenteDeReglement
                      ? `Virement ${p.familyName} — facture ${p.invoiceNumber || "en attente"} encaissée (${ligne.amount.toFixed(2)}€)`
                      : `${p.familyName} — ${(p.totalTTC || 0).toFixed(2)}€ (${modeLabels[p.paymentMode] || p.paymentMode})`,
                    manualPaymentId: p.id,
                    remiseSepaId: undefined,
                    uncertain: false,
                  };
                  // L'encaissement au journal (facture en attente) est fait par
                  // la synchronisation, cf. encaisserPaiementsPointes.
                  await updateAndSaveBankLines(updated);
                  setShowManualMatch(null);
                };

                const pointerRemiseSepa = async (r: any) => {
                  if (!montantProche(r.montantTotal)) {
                    const ok = window.confirm(
                      `La ligne bancaire fait ${ligne.amount.toFixed(2)}€ et la remise n°${r.numero} totalise ${(r.montantTotal || 0).toFixed(2)}€ (un prélèvement rejeté ?).\n\nPointer quand même ?`,
                    );
                    if (!ok) return;
                  }
                  const encs = encaissementsDeRemiseSepa(r, encaissementsCompta);
                  const updated = [...bankLines];
                  updated[showManualMatch!] = {
                    ...updated[showManualMatch!],
                    matched: true,
                    matchType: "Manuel",
                    matchDetail: `Remise SEPA n°${r.numero} du ${r.datePrelevement || "?"} — ${r.nbTransactions || encs.length} prélèvement(s) = ${(r.montantTotal || 0).toFixed(2)}€`,
                    matchedEncs: encs.length > 0 ? encs.map(encaissementEnDetail) : undefined,
                    manualPaymentId: undefined,
                    remiseSepaId: r.id,
                    uncertain: false,
                  };
                  await updateAndSaveBankLines(updated);
                  setShowManualMatch(null);
                };

                const titre = (t: string) => (
                  <div className="font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-3 mb-1.5 first:mt-0">{t}</div>
                );

                return (
                  <div className="flex flex-col gap-1.5">
                    {enAttente.length > 0 && titre(`Factures en attente de règlement (${enAttente.length})`)}
                    {enAttente.map((p: any) => {
                      const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                      const restant = Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100;
                      const amountMatch = montantProche(restant);
                      return (
                        <div key={p.id}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:border-blue-300 ${amountMatch ? "border-green-300 bg-green-50/30" : "border-gray-100"}`}
                          onClick={() => pointerFacture(p)}>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">{p.familyName || "—"}</div>
                            <div className="font-body text-xs text-slate-500">
                              {d?.toLocaleDateString("fr-FR")} · {(p.items || []).map((i: any) => i.activityTitle).join(", ") || p.label || "—"} · {p.status === "partial" ? "partiellement réglée" : "en attente"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-body text-sm font-bold ${amountMatch ? "text-green-600" : "text-orange-500"}`}>{restant.toFixed(2)}€</div>
                            {amountMatch
                              ? <div className="font-body text-[10px] text-green-500">Montant exact · sera encaissée</div>
                              : <div className="font-body text-[10px] text-slate-400">reste dû</div>}
                          </div>
                        </div>
                      );
                    })}

                    {remisesCandidates.length > 0 && titre(`Remises de prélèvements SEPA (${remisesCandidates.length})`)}
                    {remisesCandidates.map((r: any) => {
                      const amountMatch = montantProche(r.montantTotal);
                      const nbEncs = encaissementsDeRemiseSepa(r, encaissementsCompta).length;
                      return (
                        <div key={r.id}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:border-blue-300 ${amountMatch ? "border-green-300 bg-green-50/30" : "border-gray-100"}`}
                          onClick={() => pointerRemiseSepa(r)}>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">🏦 Remise SEPA n°{r.numero}</div>
                            <div className="font-body text-xs text-slate-500">
                              Prélèvement du {r.datePrelevement || "?"} · {r.nbTransactions || "?"} prélèvement(s) · {r.status === "deposited" ? `${nbEncs} au journal` : "pas encore déposée"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-body text-sm font-bold ${amountMatch ? "text-green-600" : "text-blue-500"}`}>{(r.montantTotal || 0).toFixed(2)}€</div>
                            {amountMatch && <div className="font-body text-[10px] text-green-500">Montant exact</div>}
                          </div>
                        </div>
                      );
                    })}

                    {duMois.length > 0 && titre(`Factures du mois (${duMois.length})`)}
                    {duMois.map((p: any) => {
                      const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                      const amountMatch = montantProche(p.totalTTC);
                      return (
                        <div key={p.id}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:border-blue-300 ${amountMatch ? "border-green-300 bg-green-50/30" : "border-gray-100"}`}
                          onClick={() => pointerFacture(p)}>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">{p.familyName || "—"}</div>
                            <div className="font-body text-xs text-slate-500">
                              {d?.toLocaleDateString("fr-FR")} · {(p.items || []).map((i: any) => i.activityTitle).join(", ") || "—"} · {modeLabels[p.paymentMode] || p.paymentMode}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-body text-sm font-bold ${amountMatch ? "text-green-600" : "text-blue-500"}`}>{(p.totalTTC || 0).toFixed(2)}€</div>
                            {amountMatch && <div className="font-body text-[10px] text-green-500">Montant exact</div>}
                          </div>
                        </div>
                      );
                    })}

                    {enAttente.length === 0 && remisesCandidates.length === 0 && duMois.length === 0 && (
                      <div className="font-body text-sm text-slate-500 text-center py-6">Aucune facture ni remise ne correspond à cette recherche.</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal : Saisie détail remise CA (Option A) ─── */}
      {showCADetailModal !== null && (() => {
        const bl = bankLines[showCADetailModal];
        if (!bl) return null;

        // Parse les montants depuis le texte copié depuis le site CA.
        // Le site CA affiche chaque transaction avec : Date + Heure + Montant + N°Carte + N°Ticket.
        //
        // DIFFICULTÉ : les numéros de ticket ou de carte peuvent contenir des chiffres qui,
        // collés au montant (sans séparateur propre), causent des faux positifs.
        // Exemple : "13:59:09 175,00 EUR" où la regex gloutonne capture "09 175,00" = 9175 €.
        //
        // STRATÉGIE : on s'ancre TOUJOURS sur le pattern "HH:MM[:SS]" qui précède le montant.
        // C'est l'ancre la plus fiable car toutes les tx CB ont une heure d'horodatage.
        // Fallback : parsing ligne par ligne avec regex stricte (sans ancre heure) si aucune
        // tx détectée avec heure (ex: l'utilisateur a copié juste les montants).
        //
        // Limites : montants 0.01 € à 50 000 € ; exclusion des lignes "total"/"somme".
        // Essai de matching : on cherche parmi les CB terminal NON CONSOMMÉS ceux
        // dont le montant correspond aux montants parsés (dans une fenêtre ±3j)
        const tryMatch = (text: string) => {
          const amounts = parserDetailCa(text);
          if (amounts.length === 0) { setCaDetailPreview(null); return; }

          // Date bancaire (pour la fenêtre)
          const bankDateParsed = (() => {
            const p1 = bl.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (p1) return new Date(`${p1[3]}-${p1[2].padStart(2,"0")}-${p1[1].padStart(2,"0")}`);
            return null;
          })();

          // ───────────────────────────────────────────────────────────────────
          // Anti-fuite : construire un compteur des triplets (famille|montant|date)
          // déjà revendiqués par d'AUTRES bankLines matchées. On exclut ensuite
          // de cbPool les encs dont le triplet est déjà "consommé" autant de fois
          // qu'il apparaît ailleurs.
          //
          // Sans ça, valider Détail CA sur la bankLine du 24/04 puis sur celle
          // du 25/04 pouvait réinjecter les mêmes encs dans les 2 matchedEncs,
          // créant des références fantômes qui pourrissent le compteur
          // "Encaissements à remettre".
          // ───────────────────────────────────────────────────────────────────
          const triplet = (e: any) => {
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
            return `${e.familyName || ""}|${(e.montant || 0).toFixed(2)}|${d}`;
          };
          const claimedTripletCount = new Map<string, number>();
          for (let blIdx = 0; blIdx < bankLines.length; blIdx++) {
            if (blIdx === showCADetailModal) continue; // on ignore la bankLine en cours
            const otherBl = bankLines[blIdx];
            if (!otherBl.matched) continue;
            if (otherBl.matchType === "Ignoré") continue;
            for (const enc of (otherBl.matchedEncs || [])) {
              const k = `${enc.familyName || ""}|${(enc.montant || 0).toFixed(2)}|${enc.date || ""}`;
              claimedTripletCount.set(k, (claimedTripletCount.get(k) || 0) + 1);
            }
          }

          // Encaissements CB terminal libres dans la fenêtre ±7j (large pour ne rien rater)
          // On accumule les "consommations" de triplets au fur et à mesure pour
          // exclure correctement les encs en surplus quand il y a des doublons légitimes.
          const tripletConsumed = new Map<string, number>();
          const cbPool = encaissementsCompta.filter(e => {
            if (e.mode !== "cb_terminal") return false;
            if (e.remiseId) return false; // déjà dans une remise
            const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
            if (!d) return false;
            if (bankDateParsed) {
              const diff = Math.abs(bankDateParsed.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
              if (diff > 7) return false;
            }
            // Filtre anti-fuite : ce triplet est-il revendiqué par une autre bankLine ?
            const k = triplet(e);
            const claimed = claimedTripletCount.get(k) || 0;
            const consumed = tripletConsumed.get(k) || 0;
            if (consumed < claimed) {
              tripletConsumed.set(k, consumed + 1);
              return false; // exclu : un autre rapprochement le revendique déjà
            }
            return true;
          });

          // Pour chaque montant, trouve le meilleur candidat (sans réutilisation)
          const used = new Set<string>();
          const found: any[] = [];
          const missing: number[] = [];
          for (const amount of amounts) {
            const candidate = cbPool.find(e => !used.has(e.id) && Math.abs((e.montant || 0) - amount) < 0.02);
            if (candidate) {
              used.add(candidate.id);
              found.push({ ...candidate, _amount: amount });
            } else {
              missing.push(amount);
            }
          }
          const total = amounts.reduce((s, a) => s + a, 0);
          setCaDetailPreview({ found, missing, total });
        };

        const blAmount = bl.amount;
        const parsed = caDetailText ? parserDetailCa(caDetailText) : [];
        const parsedTotal = parsed.reduce((s, a) => s + a, 0);
        const totalMatches = Math.abs(parsedTotal - blAmount) < 0.02;

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCADetailModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Détail remise Crédit Agricole</h2>
                  <p className="font-body text-xs text-slate-500">
                    Mouvement : {bl.label} — <strong>{bl.amount.toFixed(2)}€</strong>
                  </p>
                </div>
                <button onClick={() => setShowCADetailModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="font-body text-xs text-blue-800 leading-relaxed">
                    <strong>Mode d'emploi :</strong><br />
                    1. Connectez-vous au site Crédit Agricole → Comptes → Cliquer sur la remise CB<br />
                    2. Sélectionner tout le tableau des transactions (ou juste la colonne "Montant")<br />
                    3. Copier puis coller ci-dessous. Le système extrait automatiquement les montants en EUR.
                  </p>
                </div>

                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Coller le détail copié depuis le site CA :</label>
                <textarea
                  value={caDetailText}
                  onChange={e => { setCaDetailText(e.target.value); tryMatch(e.target.value); }}
                  placeholder="20/04/2026 17:02:34  95,00 EUR  497711******5900  ...&#10;20/04/2026 16:24:00  105,00 EUR  ..."
                  rows={6}
                  className="w-full font-mono text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-purple-400 resize-none"
                />

                {parsed.length > 0 && (
                  <div className="mt-3 bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between font-body text-xs">
                      <span className="text-slate-600">
                        <strong>{parsed.length}</strong> montant(s) extrait(s) — Total : <strong>{parsedTotal.toFixed(2)}€</strong>
                      </span>
                      <span className={totalMatches ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"}>
                        {totalMatches ? "✓ correspond au mouvement" : `⚠ écart de ${(parsedTotal - blAmount).toFixed(2)}€`}
                      </span>
                    </div>
                    {caDetailPreview && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="font-body text-xs font-semibold text-green-700 mb-1">✓ Trouvés ({caDetailPreview.found.length})</div>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {caDetailPreview.found.map((e, idx) => (
                              <div key={idx} className="bg-green-50 rounded px-2 py-1 font-body text-[11px]">
                                <strong>{(e.montant || 0).toFixed(2)}€</strong> — {e.familyName || "?"} ({e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?"})
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="font-body text-xs font-semibold text-orange-700 mb-1">⚠ Manquants ({caDetailPreview.missing.length})</div>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {caDetailPreview.missing.map((amount, idx) => (
                              <div key={idx} className="bg-orange-50 rounded px-2 py-1 font-body text-[11px]">
                                <strong>{amount.toFixed(2)}€</strong> — pas d'encaissement CB correspondant
                              </div>
                            ))}
                            {caDetailPreview.missing.length === 0 && (
                              <div className="font-body text-[11px] text-slate-400 italic">Tous les montants matchent !</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
                <button onClick={() => setShowCADetailModal(null)}
                  className="font-body text-sm text-slate-600 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!caDetailPreview || caDetailPreview.found.length === 0}
                  onClick={() => {
                    if (!caDetailPreview || caDetailPreview.found.length === 0) return;
                    const updated = [...bankLines];
                    const foundSum = caDetailPreview.found.reduce((s, e) => s + (e.montant || 0), 0);
                    updated[showCADetailModal!] = {
                      ...updated[showCADetailModal!],
                      matched: true,
                      matchType: "Manuel",
                      matchDetail: `Détail CA : ${caDetailPreview.found.length}/${parsed.length} transactions trouvées = ${foundSum.toFixed(2)}€${caDetailPreview.missing.length > 0 ? ` (${caDetailPreview.missing.length} manquant(s))` : ""}`,
                      matchedEncs: caDetailPreview.found.map((e: any) => ({
                        familyName: e.familyName || "",
                        montant: e.montant || 0,
                        date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
                        activityTitle: e.activityTitle || "",
                        mode: "CB Terminal",
                      })),
                      // Stocker les manquants pour les afficher au survol sur l'écran principal
                      missingAmounts: caDetailPreview.missing.length > 0 ? caDetailPreview.missing : undefined,
                    };
                    updateAndSaveBankLines(updated);
                    setShowCADetailModal(null);
                  }}
                  className="font-body text-sm text-white border-none rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
                  Valider le rapprochement
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Onglet Ignorées : lignes bancaires volontairement écartées ─── */}
      {/* L'utilisateur a cliqué "Ignorer" sur ces lignes (commission, frais,
          virement personnel...). Elles ne polluent plus l'onglet rapprochement
          principal mais restent consultables et restaurables ici. */}
      {!loading && tab === "rapprochement_ignores" && (
        <div className="flex flex-col gap-5">
          <Card padding="md" className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <EyeOff className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Lignes bancaires ignorées</h3>
                <p className="font-body text-sm text-slate-600">
                  Ces lignes ont été marquées comme volontairement écartées du rapprochement
                  (commissions, frais bancaires, virements personnels…). Elles restent stockées
                  pour traçabilité mais n'apparaissent plus dans l'onglet principal.
                </p>
                <p className="font-body text-xs text-slate-500 mt-2">
                  Cliquer sur <b>Restaurer</b> remet la ligne dans la liste des lignes à traiter.
                </p>
              </div>
            </div>
          </Card>

          {bankLines.filter(b => b.matchType === "Ignoré").length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="font-body text-sm text-slate-500 italic">
                Aucune ligne ignorée pour le moment.
              </p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="bg-blue-500/8 px-5 py-3 border-b border-blue-500/8 flex items-center font-body text-xs font-semibold text-blue-800 uppercase tracking-wide">
                    <span className="w-24">Date</span>
                    <span className="flex-1">Libellé bancaire</span>
                    <span className="w-24 text-right">Montant</span>
                    <span className="w-32 text-center">Action</span>
                  </div>
                  {bankLines
                    .map((bl, i) => ({ bl, i }))
                    .filter(({ bl }) => bl.matchType === "Ignoré")
                    .map(({ bl, i }) => (
                      <div key={i} className="px-5 py-3 border-b border-blue-500/8 flex items-center bg-slate-50/50">
                        <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                        <div className="flex-1">
                          <div className="font-body text-sm text-slate-700">{bl.label}</div>
                          {bl.matchDetail && (
                            <div className="font-body text-xs text-slate-500 mt-0.5">
                              ↳ {bl.matchDetail}
                            </div>
                          )}
                        </div>
                        <span className="w-24 text-right font-body text-sm font-semibold text-slate-600">
                          {bl.amount.toFixed(2)}€
                        </span>
                        <span className="w-32 text-center">
                          <button
                            onClick={() => {
                              const updated = [...bankLines];
                              updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "" };
                              updateAndSaveBankLines(updated);
                            }}
                            className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
                            Restaurer
                          </button>
                        </span>
                      </div>
                    ))}
                  <div className="px-5 py-3 bg-sand flex justify-between items-center font-body text-sm">
                    <span className="font-semibold text-slate-600 flex items-center gap-3">
                      {nbIgnores} ligne{nbIgnores > 1 ? "s" : ""} ignorée{nbIgnores > 1 ? "s" : ""}
                      {bankLines.some(b => b.matchType === "Ignoré" && (b.matchDetail || "").startsWith("Ignoré en bloc")) && (
                        <button
                          onClick={async () => {
                            const enBloc = bankLines.filter(b => b.matchType === "Ignoré" && (b.matchDetail || "").startsWith("Ignoré en bloc"));
                            if (!confirm(`Restaurer les ${enBloc.length} ligne${enBloc.length > 1 ? "s" : ""} ignorée${enBloc.length > 1 ? "s" : ""} en bloc ? Elles reviendront « à traiter ».`)) return;
                            const updated = bankLines.map(b =>
                              b.matchType === "Ignoré" && (b.matchDetail || "").startsWith("Ignoré en bloc")
                                ? { ...b, matched: false, matchType: "", matchDetail: "" }
                                : b);
                            await updateAndSaveBankLines(updated);
                          }}
                          className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border-none cursor-pointer">
                          Restaurer celles ignorées en bloc
                        </button>
                      )}
                    </span>
                    <span className="text-slate-500">
                      Total : {bankLines.filter(b => b.matchType === "Ignoré").reduce((s, b) => s + b.amount, 0).toFixed(2)}€
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── Export FEC ─── */}
    </>
  );
}
