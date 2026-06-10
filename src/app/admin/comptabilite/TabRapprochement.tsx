"use client";

// Onglet "rapprochement" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { AlertTriangle, Loader2, Sparkles, Upload } from "lucide-react";
import { Badge, Card } from "@/components/ui";

export default function TabRapprochement(props: any) {
  const { analyserRapprochement, bankLines, db, doc, encaissementsCompta, expandedBankLine, fetchData, getDoc, handleCSVImport, iaAnalysis, iaLoading, iaStats, nbIgnores, payments, remises, saveBankLinesByMonth, serverTimestamp, setBankLines, setCaDetailPreview, setCaDetailText, setExpandedBankLine, setManualSearch, setShowCADetailModal, setShowManualMatch, syncVersementsEspeces, updateAndSaveBankLines, updateDoc } = props;
  return (
(
        <div className="flex flex-col gap-5">

          {/* ── Dashboard rapprochement ────────────────────────────────── */}
          {(() => {
            // Virements en attente depuis > 7 jours
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const virAttendus = payments.filter((p: any) =>
              p.paymentMode === "virement" &&
              (p.status === "pending" || p.status === "partial") &&
              p.date?.seconds && new Date(p.date.seconds * 1000) < sevenDaysAgo
            );
            // Stats bankLines
            const nbMatched = bankLines.filter((b: any) => b.matched).length;
            const nbPending = bankLines.filter((b: any) => !b.matched).length;
            const montantPending = bankLines.filter((b: any) => !b.matched).reduce((s: any, b: any) => s + b.amount, 0);

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
              Importez votre relevé bancaire au format CSV pour rapprocher les mouvements avec vos encaissements. Les virements sont également matchés par nom de famille dans le libellé. Cliquez sur "Pointer" pour les lignes non rapprochées.
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
              {bankLines.length > 0 && bankLines.some((b: any) => b.matched) && (
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
              {bankLines.length > 0 && bankLines.some((b: any) => b.matched) && (
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
                      const cleanedLines = bankLines.map((bl: any) => ({ ...bl, matchedEncs: bl.matchedEncs ? [...bl.matchedEncs] : undefined }));

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
            {bankLines.length > 0 && bankLines.some((b: any) => b.matched) && (
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
                .map((bl: any, i: any) => ({ bl, i }))
                .filter(({ bl }: any) => bl.matchType !== "Ignoré") // les ignorées sont dans l'onglet dédié
                .map(({ bl, i }: any) => {
                  // Détecter une remise CB partiellement matchée via Détail CA
                  // (X/Y transactions trouvées avec N manquantes). On stocke
                  // missingAmounts[] depuis le commit Détail CA pour pouvoir les
                  // afficher au survol et signaler visuellement la ligne.
                  const hasMissing = !!(bl.missingAmounts && bl.missingAmounts.length > 0);
                  const missingTooltip = hasMissing
                    ? `${bl.missingAmounts!.length} transaction(s) non retrouvée(s) :\n` +
                      bl.missingAmounts!.map((a: any) => `• ${a.toFixed(2)}€`).join("\n") +
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
                    {bl.matched && bl.matchType !== "Ignoré" && (
                      <button onClick={async () => {
                        const updated = [...bankLines];
                        updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "", matchedEncs: undefined, manualPaymentId: undefined, uncertain: false };
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
                          {bl.matchedEncs.map((enc: any, j: any) => (
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
                  {bankLines.filter((b: any) => b.matchType !== "Ignoré").length} lignes affichées
                  {nbIgnores > 0 && (
                    <span className="text-slate-500 font-normal ml-2">
                      ({nbIgnores} ignorée{nbIgnores > 1 ? "s" : ""} dans l'onglet dédié)
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-green-600 font-semibold">
                    {bankLines.filter((b: any) => b.matched && b.matchType !== "Ignoré").length} rapprochées
                  </span>
                  {" · "}
                  <span className="text-orange-500 font-semibold">
                    {bankLines.filter((b: any) => !b.matched).length} à traiter
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
      )
  );
}
