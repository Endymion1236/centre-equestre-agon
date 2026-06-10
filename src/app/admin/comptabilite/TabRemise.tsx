"use client";

// Onglet "remise" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { Printer } from "lucide-react";
import { Badge, Card } from "@/components/ui";

export default function TabRemise(props: any) {
  const { aRemettreDateFrom, aRemettreDateTo, addDoc, collection, db, deleteDoc, doc, editingRemiseId, editingRemiseSearch, encaissementsCompta, fetchData, getDocs, openRemiseId, payments, pointageDate, pointageMontantReel, pointageNote, pointageRemiseId, query, remiseDateFrom, remiseDateTo, remiseModeFilter, remiseModeView, remises, selectedForRemise, serverTimestamp, setARemettreDateFrom, setARemettreDateTo, setEditingRemiseId, setEditingRemiseSearch, setOpenRemiseId, setPointageDate, setPointageMontantReel, setPointageNote, setPointageRemiseId, setRemiseDateFrom, setRemiseDateTo, setRemiseModeFilter, setRemiseModeView, setSelectedForRemise, updateDoc, where } = props;
  return (
(() => {
        // ──────────────────────────────────────────────────────────────────
        // Travail au niveau ENCAISSEMENT (pas payment) pour gérer les
        // paiements mixtes : un payment mixte a plusieurs encaissements avec
        // des modes différents, chacun doit pouvoir être remis séparément.
        // ──────────────────────────────────────────────────────────────────
        const remisEncaissementIds = new Set(
          (remises || []).flatMap((r: any) => r.encaissementIds || [])
        );

        // ──────────────────────────────────────────────────────────────────
        // Contre-passations neutralisées :
        // Si un encaissement A (positif) a une contre-passation B (négatif,
        // montant opposé), alors A et B s'annulent mutuellement et doivent
        // disparaître de la liste "Encaissements à remettre".
        // ──────────────────────────────────────────────────────────────────
        const neutralizedEncIds = new Set<string>();
        const reversals = (encaissementsCompta || []).filter((e: any) => e.correctionDe && (e.montant || 0) < 0);
        for (const rev of reversals) {
          const original = (encaissementsCompta || []).find((e: any) => e.id === rev.correctionDe);
          if (!original) continue;
          // Vérifier que les montants s'annulent exactement
          if (Math.abs((original.montant || 0) + (rev.montant || 0)) < 0.02) {
            neutralizedEncIds.add(original.id);
            neutralizedEncIds.add(rev.id);
          }
        }

        // Legacy : certaines remises anciennes n'ont que paymentIds (pas
        // encaissementIds). Dans ce cas on considère qu'elles concernent
        // TOUS les encaissements de ces payments DONT LE MODE CORRESPOND
        // à celui de la remise.
        // BUG HISTORIQUE (corrigé ici) : avant, on excluait tous les
        // encaissements d'un paymentId dès qu'une remise le mentionnait,
        // même si la remise était pour un autre mode. Résultat : pour un
        // paiement mixte chèque + espèces, quand on remettait le chèque
        // en banque, l'encaissement espèces du même paiement disparaissait
        // aussi des "à remettre" → écart visible dans le diag-espèces.
        const remisPaymentModeLegacy = new Map<string, Set<string>>();
        (remises || []).forEach((r: any) => {
          // On ne prend en compte le legacy QUE si la remise n'a pas déjà
          // encaissementIds (sinon doublon avec le chemin moderne).
          if ((r.encaissementIds || []).length > 0) return;
          const mode = r.paymentMode || "autre";
          (r.paymentIds || []).forEach((pid: string) => {
            if (!remisPaymentModeLegacy.has(pid)) {
              remisPaymentModeLegacy.set(pid, new Set());
            }
            remisPaymentModeLegacy.get(pid)!.add(mode);
          });
        });

        const nonRemisEnc = (encaissementsCompta || []).filter((e: any) => {
          // Modes exclus des remises physiques
          if (["virement", "prelevement_sepa", "cb_online", "avoir"].includes(e.mode)) return false;
          // Montant positif uniquement (pas de remboursements)
          if ((e.montant || 0) <= 0) return false;
          // Neutralisé par une contre-passation de montant opposé
          if (neutralizedEncIds.has(e.id)) return false;
          // Déjà remis : soit marqué directement, soit via encaissementIds
          if (e.remiseId) return false;
          if (remisEncaissementIds.has(e.id)) return false;
          // Déjà rapproché directement par la banque (CB terminal, etc.)
          // → pas besoin de passer par un bordereau de remise physique
          if (e.reconciledByBank) return false;
          // Legacy : la remise ne mentionne que paymentIds, on compare aussi le mode
          if (e.paymentId && remisPaymentModeLegacy.get(e.paymentId)?.has(e.mode)) return false;
          // Legacy mixte : remise.paymentMode === 'mixte' + paymentId matche → déjà remis
          // (on ne peut pas distinguer les modes, on suppose que toute la
          // commande est remise, comportement historique)
          if (e.paymentId && remisPaymentModeLegacy.get(e.paymentId)?.has("mixte")) return false;
          return true;
        });

        const nonRemisByModeEnc: Record<string, typeof nonRemisEnc> = {};
        nonRemisEnc.forEach((e: any) => {
          const m = e.mode || "autre";
          if (!nonRemisByModeEnc[m]) nonRemisByModeEnc[m] = [];
          nonRemisByModeEnc[m].push(e);
        });
        const totalNonRemisEnc = nonRemisEnc.reduce((s: number, e: any) => s + (e.montant || 0), 0);

        // Alias pour le code plus bas (compat), mais désormais vide car on ne
        // travaille plus au niveau payment ici
        const nonRemis: any[] = [];
        const nonRemisByMode: Record<string, any[]> = {};
        const totalNonRemis = 0;

        // Filtre date sur l'historique des remises
        const remisesFiltrees = (remises || []).filter((r: any) => {
          const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
          if (!d) return true;
          if (remiseDateFrom && d < new Date(remiseDateFrom)) return false;
          if (remiseDateTo && d > new Date(remiseDateTo + "T23:59:59")) return false;
          if (remiseModeFilter && r.paymentMode !== remiseModeFilter) return false;
          return true;
        }).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        const editingRemise = editingRemiseId ? remises.find((r: any) => r.id === editingRemiseId) : null;

        return (
        <div className="flex flex-col gap-5">

          {/* À remettre */}
          <Card padding="md" className={totalNonRemisEnc > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800">Encaissements à remettre</h3>
                <p className="font-body text-xs text-slate-500">{nonRemisEnc.length} encaissement{nonRemisEnc.length > 1 ? "s" : ""} non encore inclus dans une remise <span className="text-slate-400">(virements et CB en ligne exclus — rapprochement direct)</span></p>
              </div>
              {nonRemisEnc.length > 0 && <span className="font-body text-xl font-bold text-orange-500">{totalNonRemisEnc.toFixed(2)}€</span>}
            </div>
            {nonRemisEnc.length === 0 ? (
              <p className="font-body text-sm text-green-600">✓ Tous les encaissements ont été remis en banque.</p>
            ) : (
              <>
                {/* Filtre par date */}
                <div className="flex flex-wrap gap-2 mb-3 items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Du</span>
                  <input
                    type="date"
                    value={aRemettreDateFrom}
                    onChange={e => setARemettreDateFrom(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
                  />
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">au</span>
                  <input
                    type="date"
                    value={aRemettreDateTo}
                    onChange={e => setARemettreDateTo(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
                  />
                  {(aRemettreDateFrom || aRemettreDateTo) && (
                    <button
                      onClick={() => { setARemettreDateFrom(""); setARemettreDateTo(""); }}
                      className="font-body text-[11px] text-slate-500 bg-white border border-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-slate-100">
                      ✕ Réinitialiser
                    </button>
                  )}
                  {/* Boutons raccourcis */}
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => {
                        const t = new Date();
                        const iso = t.toISOString().slice(0, 10);
                        setARemettreDateFrom(iso); setARemettreDateTo(iso);
                      }}
                      className="font-body text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded cursor-pointer hover:bg-blue-100">
                      Aujourd'hui
                    </button>
                    <button
                      onClick={() => {
                        const t = new Date();
                        const weekAgo = new Date(t.getTime() - 7 * 24 * 60 * 60 * 1000);
                        setARemettreDateFrom(weekAgo.toISOString().slice(0, 10));
                        setARemettreDateTo(t.toISOString().slice(0, 10));
                      }}
                      className="font-body text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded cursor-pointer hover:bg-blue-100">
                      7 derniers jours
                    </button>
                  </div>
                </div>

                {/* Filtre d'affichage par mode */}
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                  <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Afficher :</span>
                  {[
                    { id: "", label: "Tous" },
                    { id: "cb_terminal", label: "CB" },
                    { id: "cheque", label: "Chèques" },
                    { id: "especes", label: "Espèces" },
                  ].map(m => {
                    const count = m.id ? (nonRemisByModeEnc[m.id]?.length || 0) : nonRemisEnc.length;
                    const total = m.id
                      ? (nonRemisByModeEnc[m.id] || []).reduce((s: number, e: any) => s + (e.montant || 0), 0)
                      : totalNonRemisEnc;
                    if (m.id && count === 0) return null;
                    const isActive = remiseModeView === m.id;
                    return (
                      <button
                        key={m.id || "all"}
                        onClick={() => setRemiseModeView(m.id)}
                        className={`font-body text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          isActive
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50"
                        }`}>
                        {m.label} · {total.toFixed(2)}€ ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Liste des encaissements filtrée par mode ET par date */}
                <div className="flex flex-col gap-1 mb-4 max-h-[300px] overflow-y-auto">
                  {nonRemisEnc
                    .filter((e: any) => !remiseModeView || e.mode === remiseModeView)
                    .filter((e: any) => {
                      // Filtre par date
                      if (!aRemettreDateFrom && !aRemettreDateTo) return true;
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      if (!d) return false;
                      if (aRemettreDateFrom) {
                        const from = new Date(aRemettreDateFrom + "T00:00:00");
                        if (d < from) return false;
                      }
                      if (aRemettreDateTo) {
                        const to = new Date(aRemettreDateTo + "T23:59:59");
                        if (d > to) return false;
                      }
                      return true;
                    })
                    .sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
                    .map((e: any) => {
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      const isChecked = selectedForRemise.has(e.id!);
                      // Infos du payment associé pour contexte
                      const pay = payments.find((p: any) => p.id === e.paymentId);
                      const activityLabel = e.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                      const isFromMixed = pay && pay.paymentMode === "mixte";
                      return (
                        <label key={e.id} className={`flex items-center justify-between font-body text-xs py-1.5 px-3 rounded-lg cursor-pointer ${isChecked ? "bg-blue-50 border border-blue-200" : "bg-white hover:bg-slate-50"}`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedForRemise((prev: any) => {
                                  const next = new Set(prev);
                                  if (next.has(e.id!)) next.delete(e.id!); else next.add(e.id!);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                            />
                            <span className="text-slate-500 min-w-[65px]">{d ? d.toLocaleDateString("fr-FR") : "—"}</span>
                            <Badge color="gray">{modeLabels[e.mode] || e.mode}</Badge>
                            <span className="text-blue-800 font-semibold truncate">{e.familyName || pay?.familyName || "—"}</span>
                            <span className="text-slate-500 truncate">{(activityLabel || "").slice(0, 40)}</span>
                            {isFromMixed && (
                              <span className="font-body text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded flex-shrink-0" title="Partie d'un paiement mixte">mixte</span>
                            )}
                            {e.ref && (
                              <span className="font-body text-[10px] text-slate-400 flex-shrink-0">n°{e.ref}</span>
                            )}
                          </div>
                          <span className="font-semibold text-blue-500 flex-shrink-0 ml-2">{(e.montant || 0).toFixed(2)}€</span>
                        </label>
                      );
                    })}
                </div>

                {/* Barre d'aide à la sélection */}
                {(() => {
                  const selectedEncs = nonRemisEnc.filter((e: any) => selectedForRemise.has(e.id!));
                  const selectedTotal = selectedEncs.reduce((s: number, e: any) => s + (e.montant || 0), 0);
                  const selectedModes = new Set(selectedEncs.map((e: any) => e.mode));
                  const selectedModeLabel = selectedModes.size === 1
                    ? (modeLabels[selectedEncs[0]?.mode] || selectedEncs[0]?.mode)
                    : "mixte";
                  // Dans la vue filtrée uniquement : quels encaissements sont affichés ?
                  // On applique LE MÊME filtre que la liste visible (mode + date)
                  const visibleEncs = nonRemisEnc
                    .filter((e: any) => !remiseModeView || e.mode === remiseModeView)
                    .filter((e: any) => {
                      if (!aRemettreDateFrom && !aRemettreDateTo) return true;
                      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      if (!d) return false;
                      if (aRemettreDateFrom) {
                        const from = new Date(aRemettreDateFrom + "T00:00:00");
                        if (d < from) return false;
                      }
                      if (aRemettreDateTo) {
                        const to = new Date(aRemettreDateTo + "T23:59:59");
                        if (d > to) return false;
                      }
                      return true;
                    });
                  const allVisibleSelected = visibleEncs.length > 0 && visibleEncs.every((e: any) => selectedForRemise.has(e.id!));
                  return (
                    <>
                      {/* Boutons de cochage rapide sur la vue filtrée */}
                      <div className="flex gap-2 flex-wrap mb-2 items-center">
                        <span className="font-body text-[11px] text-slate-500 uppercase tracking-wider">Cocher :</span>
                        <button
                          onClick={() => {
                            setSelectedForRemise((prev: any) => {
                              const next = new Set(prev);
                              if (allVisibleSelected) {
                                visibleEncs.forEach((e: any) => next.delete(e.id!));
                              } else {
                                visibleEncs.forEach((e: any) => next.add(e.id!));
                              }
                              return next;
                            });
                          }}
                          className="font-body text-[11px] text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-slate-200">
                          {allVisibleSelected ? "Tout décocher" : "Tout cocher"} ({visibleEncs.length})
                        </button>
                        {selectedForRemise.size > 0 && (
                          <button
                            onClick={() => setSelectedForRemise(new Set())}
                            className="font-body text-[11px] text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100 ml-auto">
                            Vider la sélection ({selectedForRemise.size})
                          </button>
                        )}
                      </div>

                      {/* Bouton créer bordereau avec la sélection */}
                      {selectedForRemise.size > 0 && (
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200">
                          <div className="font-body text-sm">
                            <span className="font-semibold text-blue-800">{selectedForRemise.size} encaissement{selectedForRemise.size > 1 ? "s" : ""} sélectionné{selectedForRemise.size > 1 ? "s" : ""}</span>
                            <span className="text-slate-500"> · {selectedModeLabel}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-body text-lg font-bold text-green-600">{selectedTotal.toFixed(2)}€</span>
                            <button
                              onClick={async () => {
                                if (!confirm(`Créer un bordereau de remise ?\n\n${selectedEncs.length} encaissement(s) — ${selectedTotal.toFixed(2)}€\nMode : ${selectedModeLabel}`)) return;
                                try {
                                  // Regrouper les paymentIds concernés (pour l'historique/affichage)
                                  const affectedPaymentIds = [...new Set(selectedEncs.map((e: any) => e.paymentId).filter(Boolean))];

                                  const remiseRef = await addDoc(collection(db, "remises"), {
                                    date: serverTimestamp(),
                                    encaissementIds: selectedEncs.map((e: any) => e.id), // nouveau : lien fin
                                    paymentIds: affectedPaymentIds, // compat affichage historique
                                    paymentMode: selectedModes.size === 1 ? [...selectedModes][0] : "mixte",
                                    total: selectedTotal,
                                    nbPaiements: selectedEncs.length,
                                    status: "created",
                                    pointee: false,
                                    createdAt: serverTimestamp(),
                                  });

                                  // Marquer chaque encaissement comme remis
                                  for (const e of selectedEncs) {
                                    await updateDoc(doc(db, "encaissements", e.id!), { remiseId: remiseRef.id });
                                  }

                                  // Marquer le payment comme entièrement remis UNIQUEMENT si tous
                                  // ses encaissements éligibles sont dans cette remise (ou déjà remis)
                                  for (const payId of affectedPaymentIds) {
                                    const allEncsOfPayment = (encaissementsCompta || []).filter(
                                      (x: any) => x.paymentId === payId
                                      && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(x.mode)
                                      && (x.montant || 0) > 0
                                    );
                                    const allRemis = allEncsOfPayment.every((x: any) =>
                                      selectedEncs.some((s: any) => s.id === x.id) || x.remiseId || remisEncaissementIds.has(x.id)
                                    );
                                    if (allRemis) {
                                      await updateDoc(doc(db, "payments", payId), { remiseId: remiseRef.id });
                                    }
                                  }

                                  setSelectedForRemise(new Set());
                                  fetchData();
                                } catch (e) { console.error(e); alert("Erreur lors de la création du bordereau."); }
                              }}
                              className="font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg border-none cursor-pointer">
                              Créer le bordereau
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </Card>

          {/* Historique + filtres */}
          {(remises || []).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <h3 className="font-body text-base font-semibold text-blue-800">Historique des remises</h3>
                {/* ── Filtres ── */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="font-body text-xs text-slate-500">Du</span>
                    <input type="date" value={remiseDateFrom} onChange={e => setRemiseDateFrom(e.target.value)}
                      className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-body text-xs text-slate-500">au</span>
                    <input type="date" value={remiseDateTo} onChange={e => setRemiseDateTo(e.target.value)}
                      className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <select value={remiseModeFilter} onChange={e => setRemiseModeFilter(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400">
                    <option value="">Tous modes</option>
                    <option value="cb_terminal">CB</option>
                    <option value="cheque">Chèques</option>
                    <option value="especes">Espèces</option>
                    <option value="virement">Virements</option>
                    <option value="mixte">Mixte</option>
                  </select>
                  {(remiseDateFrom || remiseDateTo || remiseModeFilter) && (
                    <button onClick={() => { setRemiseDateFrom(""); setRemiseDateTo(""); setRemiseModeFilter(""); }}
                      className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-red-500">✕ Effacer</button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {remisesFiltrees.map((r: any) => {
                  const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();

                  // ─── Résolution des encaissements de cette remise ───
                  // Nouveau format : r.encaissementIds (liste précise des flux)
                  // Ancien format : r.paymentIds (on reconstitue tous les encaissements des payments)
                  let rEncaissements: any[] = [];
                  if (Array.isArray(r.encaissementIds) && r.encaissementIds.length > 0) {
                    const idSet = new Set(r.encaissementIds);
                    rEncaissements = (encaissementsCompta || []).filter((e: any) => idSet.has(e.id));
                  } else if (Array.isArray(r.paymentIds) && r.paymentIds.length > 0) {
                    // Compat : pour les anciennes remises, afficher tous les encaissements
                    // des payments inclus (exclusion des modes non-physiques)
                    const payIdSet = new Set(r.paymentIds);
                    rEncaissements = (encaissementsCompta || []).filter((e: any) =>
                      payIdSet.has(e.paymentId)
                      && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(e.mode)
                      && (e.montant || 0) > 0
                    );
                  }
                  // Tri chronologique
                  rEncaissements = [...rEncaissements].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));

                  const isEditing = editingRemiseId === r.id;
                  const isPointing = pointageRemiseId === r.id;

                  // Encaissements éligibles à ajouter (non remis, filtrés par recherche)
                  const addableEncs = nonRemisEnc.filter((e: any) => {
                    if (editingRemiseSearch) {
                      const q = editingRemiseSearch.toLowerCase();
                      const pay = payments.find((p: any) => p.id === e.paymentId);
                      const label = (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                      return (e.familyName || "").toLowerCase().includes(q)
                        || (pay?.familyName || "").toLowerCase().includes(q)
                        || label.toLowerCase().includes(q);
                    }
                    return true;
                  }).slice(0, 20);

                  // Helpers pour retrait / ajout au niveau encaissement
                  const retirerEncaissement = async (enc: any) => {
                    if (!confirm(`Retirer ${enc.familyName || "cet encaissement"} (${(enc.montant || 0).toFixed(2)}€ ${modeLabels[enc.mode] || enc.mode}) de cette remise ?`)) return;
                    // Retirer l'id de r.encaissementIds
                    const oldEncIds = Array.isArray(r.encaissementIds) ? r.encaissementIds : [];
                    const newEncIds = oldEncIds.filter((id: string) => id !== enc.id);
                    // Recalculer le total à partir des encaissements restants
                    const remainingEncs = (encaissementsCompta || []).filter((x: any) => newEncIds.includes(x.id));
                    const newTotal = remainingEncs.reduce((s: number, x: any) => s + (x.montant || 0), 0);

                    // Recalculer les modes et paymentIds affectés
                    const modes = new Set(remainingEncs.map((x: any) => x.mode));
                    const paymentIds = [...new Set(remainingEncs.map((x: any) => x.paymentId).filter(Boolean))];

                    await updateDoc(doc(db, "remises", r.id), {
                      encaissementIds: newEncIds,
                      paymentIds,
                      total: Math.round(newTotal * 100) / 100,
                      nbPaiements: newEncIds.length,
                      paymentMode: modes.size === 1 ? [...modes][0] : (modes.size > 1 ? "mixte" : r.paymentMode),
                      updatedAt: serverTimestamp(),
                    });

                    // Libérer l'encaissement (remiseId: null)
                    await updateDoc(doc(db, "encaissements", enc.id!), { remiseId: null });

                    // Retirer aussi le payment.remiseId SI ce payment n'a plus aucun encaissement dans la remise
                    if (enc.paymentId) {
                      const stillInRemise = remainingEncs.some((x: any) => x.paymentId === enc.paymentId);
                      if (!stillInRemise) {
                        try {
                          await updateDoc(doc(db, "payments", enc.paymentId), { remiseId: null });
                        } catch (err) {
                          console.error("[remises] libération payment échouée:", err);
                        }
                      }
                    }

                    fetchData();
                  };

                  const ajouterEncaissement = async (enc: any) => {
                    const oldEncIds = Array.isArray(r.encaissementIds) ? r.encaissementIds : [];
                    const newEncIds = [...oldEncIds, enc.id];
                    const newEncs = (encaissementsCompta || []).filter((x: any) => newEncIds.includes(x.id));
                    const newTotal = newEncs.reduce((s: number, x: any) => s + (x.montant || 0), 0);
                    const modes = new Set(newEncs.map((x: any) => x.mode));
                    const paymentIds = [...new Set(newEncs.map((x: any) => x.paymentId).filter(Boolean))];

                    await updateDoc(doc(db, "remises", r.id), {
                      encaissementIds: newEncIds,
                      paymentIds,
                      total: Math.round(newTotal * 100) / 100,
                      nbPaiements: newEncIds.length,
                      paymentMode: modes.size === 1 ? [...modes][0] : "mixte",
                      updatedAt: serverTimestamp(),
                    });

                    await updateDoc(doc(db, "encaissements", enc.id!), { remiseId: r.id });

                    // Marquer aussi le payment si tous ses encaissements éligibles sont remis
                    if (enc.paymentId) {
                      const allEncsOfPayment = (encaissementsCompta || []).filter(
                        (x: any) => x.paymentId === enc.paymentId
                        && !["virement", "prelevement_sepa", "cb_online", "avoir"].includes(x.mode)
                        && (x.montant || 0) > 0
                      );
                      const allNowRemis = allEncsOfPayment.every((x: any) => x.id === enc.id || x.remiseId);
                      if (allNowRemis) {
                        try {
                          await updateDoc(doc(db, "payments", enc.paymentId), { remiseId: r.id });
                        } catch {}
                      }
                    }

                    fetchData();
                  };

                  return (
                    <Card key={r.id} padding="md" className={r.pointee ? "border-green-200" : ""}>
                      {/* ── En-tête cliquable ── */}
                      <div className="flex justify-between items-center cursor-pointer select-none"
                        onClick={() => setOpenRemiseId(openRemiseId === r.id ? null : r.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-body text-sm font-semibold text-blue-800">
                              Remise du {rDate.toLocaleDateString("fr-FR")}
                            </div>
                            {r.pointee
                              ? <Badge color="green">✓ Pointée</Badge>
                              : <Badge color="orange">Non pointée</Badge>}
                            <span className="font-body text-xs text-slate-500">{rEncaissements.length} encaissement{rEncaissements.length > 1 ? "s" : ""} · {modeLabels[r.paymentMode] || r.paymentMode || "Mixte"}</span>
                          </div>
                          {r.pointeeNote && <div className="font-body text-[10px] text-slate-500 mt-0.5 italic truncate">{r.pointeeNote}</div>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="font-body text-base font-bold text-blue-500">{(r.total || 0).toFixed(2)}€</span>
                          <span className="font-body text-xs text-slate-500 w-4">{openRemiseId === r.id ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* ── Contenu déroulant ── */}
                      {openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          {/* Boutons d'action */}
                          <div className="flex gap-2 flex-wrap mb-3">
                            <button onClick={e => {
                              e.stopPropagation();
                              const opening = !isPointing;
                              setPointageRemiseId(opening ? r.id : null);
                              setPointageNote(r.pointeeNote || "");
                              // Pré-remplir la date avec aujourd'hui à chaque ouverture
                              if (opening) {
                                setPointageDate(new Date().toISOString().slice(0, 10));
                              }
                            }}
                              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer flex items-center gap-1 ${r.pointee ? "bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}>
                              {r.pointee ? "✓ Dépointer" : "◎ Pointer"}
                            </button>
                            <button onClick={e => { e.stopPropagation(); setEditingRemiseId(isEditing ? null : r.id); setEditingRemiseSearch(""); }}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                              ✏️ Modifier
                            </button>
                            <button onClick={e => { e.stopPropagation();
                              const html = `<html><head><meta charset="utf-8"><title>Bordereau de remise</title><style>body{font-family:Arial;max-width:600px;margin:30px auto}h1{font-size:18px;color:#2050A0;border-bottom:2px solid #2050A0;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:left}th{font-size:11px;color:#999;text-transform:uppercase}.total{font-size:16px;font-weight:bold;color:#2050A0;text-align:right;margin-top:12px}.status{font-size:12px;color:${r.pointee?"#16a34a":"#d97706"};margin-top:4px;text-align:right}.footer{font-size:11px;color:#999;margin-top:30px}</style></head><body><h1>Bordereau de remise — ${rDate.toLocaleDateString("fr-FR")}</h1><p style="font-size:12px;color:#666">Centre Equestre d'Agon-Coutainville</p><table><thead><tr><th>Date</th><th>Client</th><th>Prestation</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead><tbody>${rEncaissements.map((enc: any) => { const pay = payments.find((p: any) => p.id === enc.paymentId); const pd = enc.date?.seconds ? new Date(enc.date.seconds * 1000).toLocaleDateString("fr-FR") : "—"; const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ") || "—"; const ref = enc.ref ? ` (n°${enc.ref})` : ""; return `<tr><td>${pd}</td><td>${enc.familyName || pay?.familyName || "—"}</td><td>${label}${ref}</td><td>${modeLabels[enc.mode] || enc.mode}</td><td style="text-align:right">${(enc.montant || 0).toFixed(2)}€</td></tr>`; }).join("")}</tbody></table><div class="total">Total : ${(r.total || 0).toFixed(2)}€</div><div class="status">${r.pointee ? "✓ Remise pointée" : "Non pointée"}</div>${r.pointeeNote?`<div style="font-size:11px;color:#666;text-align:right">${r.pointeeNote}</div>`:""}<div class="footer">Imprimé le ${new Date().toLocaleDateString("fr-FR")} — Signature : _______________</div></body></html>`;
                              const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
                            }} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                              <Printer size={12} /> Imprimer
                            </button>
                          </div>

                      {/* ── Pointage manuel ── */}
                      {isPointing && openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100 bg-sand rounded-xl p-4 flex flex-col gap-3">
                          <div className="font-body text-sm font-semibold text-blue-800">
                            {r.pointee ? "Dépointer la remise" : "Pointer la remise manuellement"}
                          </div>
                          <p className="font-body text-xs text-slate-600">
                            {r.pointee
                              ? "Cette remise sera marquée comme non vérifiée."
                              : "Confirmez que vous avez vérifié cette remise avec votre relevé bancaire."}
                          </p>
                          {!r.pointee && (
                            <div>
                              <label className="font-body text-xs text-slate-600 block mb-1">Date de pointage bancaire</label>
                              <input
                                type="date"
                                value={pointageDate}
                                onChange={e => setPointageDate(e.target.value)}
                                className="font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                              />
                              <p className="font-body text-[11px] text-slate-500 mt-1">
                                Par défaut, aujourd'hui. Tu peux choisir la date effective d'encaissement en banque.
                              </p>
                            </div>
                          )}
                          {/* Montant réellement encaissé (si espèces et écart possible) */}
                          {!r.pointee && r.paymentMode === "especes" && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                              <label className="font-body text-xs font-semibold text-orange-800 block mb-1">
                                🏦 Versement livre de caisse
                              </label>
                              <p className="font-body text-[11px] text-orange-700 mb-2">
                                Montant réellement accepté par la banque (si un billet a été refusé, indique le vrai montant crédité) :
                              </p>
                              <div className="relative inline-block">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={pointageMontantReel || (r.total || 0).toFixed(2).replace(".", ",")}
                                  onChange={e => setPointageMontantReel(e.target.value)}
                                  className="font-body text-sm border border-orange-300 rounded-lg px-3 py-2 pr-8 bg-white focus:outline-none focus:border-orange-500 w-32"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-slate-400">€</span>
                              </div>
                              <p className="font-body text-[10px] text-orange-600 mt-2">
                                Un versement (sortie d'espèces) sera créé automatiquement dans le livre de caisse à hauteur de ce montant.
                              </p>
                            </div>
                          )}
                          <div>
                            <label className="font-body text-xs text-slate-600 block mb-1">Note de rapprochement (optionnel)</label>
                            <input value={pointageNote} onChange={e => setPointageNote(e.target.value)}
                              placeholder="Ex: Vérifiée relevé BNP 15/03/2026, réf. VIR-12345..."
                              className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              // Si l'utilisateur a choisi une date, on l'utilise ; sinon aujourd'hui
                              const pointeeDate = !r.pointee
                                ? (pointageDate
                                    ? new Date(pointageDate + "T12:00:00").toISOString()
                                    : new Date().toISOString())
                                : null;
                              await updateDoc(doc(db, "remises", r.id), {
                                pointee: !r.pointee,
                                pointeeDate,
                                pointeeNote: pointageNote.trim() || null,
                                updatedAt: serverTimestamp(),
                              });

                              // Si pointage d'une remise ESPÈCES → créer la sortie dans le livre de caisse
                              if (!r.pointee && r.paymentMode === "especes") {
                                const montantReel = parseFloat((pointageMontantReel || String(r.total || 0)).replace(",", "."));
                                if (!isNaN(montantReel) && montantReel > 0) {
                                  const dateVers = pointeeDate ? new Date(pointeeDate) : new Date();
                                  await addDoc(collection(db, "encaissements"), {
                                    mode: "especes",
                                    modeLabel: "Versement banque",
                                    montant: -Math.abs(montantReel),
                                    date: dateVers,
                                    familyName: "—",
                                    activityTitle: "Versement en banque",
                                    raison: `Versement auto pour remise du ${new Date(r.date.seconds * 1000).toLocaleDateString("fr-FR")}`
                                      + (Math.abs(montantReel - (r.total || 0)) > 0.01 ? ` (écart ${(montantReel - (r.total || 0)).toFixed(2)}€)` : ""),
                                    ref: `VERS-REM-${r.id}`,
                                    isVersementBanque: true,
                                    remiseId: r.id, // lien vers la remise pour dépointage
                                    createdAt: serverTimestamp(),
                                  });
                                  console.log(`[pointage] Versement livre de caisse créé : -${montantReel.toFixed(2)}€`);
                                }
                              }

                              // Si dépointage d'une remise ESPÈCES → supprimer la sortie créée
                              if (r.pointee && r.paymentMode === "especes") {
                                try {
                                  const versSnap = await getDocs(query(
                                    collection(db, "encaissements"),
                                    where("remiseId", "==", r.id),
                                    where("isVersementBanque", "==", true)
                                  ));
                                  const dels: Promise<any>[] = [];
                                  versSnap.docs.forEach((d: any) => dels.push(deleteDoc(doc(db, "encaissements", d.id))));
                                  await Promise.all(dels);
                                  if (dels.length > 0) console.log(`[dépointage] ${dels.length} versement(s) livre de caisse supprimé(s)`);
                                } catch (e) {
                                  console.error("[dépointage] Erreur suppression versements:", e);
                                }
                              }

                              setPointageRemiseId(null);
                              setPointageDate("");
                              setPointageNote("");
                              setPointageMontantReel("");
                              fetchData();
                            }} className={`font-body text-xs font-semibold px-4 py-2 rounded-lg border-none cursor-pointer text-white ${r.pointee ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}>
                              {r.pointee ? "Confirmer le dépointage" : "✓ Confirmer le pointage"}
                            </button>
                            <button onClick={() => { setPointageRemiseId(null); setPointageDate(""); setPointageNote(""); setPointageMontantReel(""); }}
                              className="font-body text-xs text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                          </div>
                        </div>
                      )}

                      {/* ── Édition remise ── */}
                      {isEditing && openRemiseId === r.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="font-body text-xs font-semibold text-blue-800 mb-2">Modifier la remise</div>

                          {/* Retirer des encaissements */}
                          {rEncaissements.length > 0 && (
                            <div className="mb-3">
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Encaissements inclus — cliquer pour retirer</div>
                              <div className="flex flex-col gap-1">
                                {rEncaissements.map((enc: any) => {
                                  const pay = payments.find((p: any) => p.id === enc.paymentId);
                                  const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                                  const isFromMixed = pay && pay.paymentMode === "mixte";
                                  return (
                                    <div key={enc.id} className="flex items-center justify-between px-3 py-1.5 bg-sand rounded-lg">
                                      <div className="flex items-center gap-2 font-body text-xs min-w-0 flex-1">
                                        <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                        <span className="text-blue-800 font-semibold truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                        <span className="text-slate-500 truncate">{(label || "").slice(0, 35)}</span>
                                        {isFromMixed && <span className="font-body text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded flex-shrink-0">mixte</span>}
                                        {enc.ref && <span className="font-body text-[10px] text-slate-400 flex-shrink-0">n°{enc.ref}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="font-body text-xs font-semibold text-blue-500">{(enc.montant || 0).toFixed(2)}€</span>
                                        <button onClick={() => retirerEncaissement(enc)}
                                          className="font-body text-[10px] text-red-400 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100">
                                          − Retirer
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Ajouter des encaissements */}
                          {nonRemisEnc.length > 0 && (
                            <div>
                              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ajouter un encaissement non remis</div>
                              <input value={editingRemiseSearch} onChange={e => setEditingRemiseSearch(e.target.value)}
                                placeholder="Rechercher une famille ou activité..."
                                className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2 mb-2 bg-white focus:outline-none focus:border-blue-400" />
                              <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                                {addableEncs.map((enc: any) => {
                                  const pay = payments.find((p: any) => p.id === enc.paymentId);
                                  const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                                  return (
                                    <div key={enc.id} className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-100 rounded-lg">
                                      <div className="flex items-center gap-2 font-body text-xs min-w-0 flex-1">
                                        <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                        <span className="text-blue-800 font-semibold truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                        <span className="text-slate-500 truncate">{(label || "").slice(0, 35)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="font-body text-xs font-semibold text-blue-500">{(enc.montant || 0).toFixed(2)}€</span>
                                        <button onClick={() => ajouterEncaissement(enc)}
                                          className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-green-100">
                                          + Ajouter
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <button onClick={() => setEditingRemiseId(null)}
                            className="mt-3 font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
                            ✓ Terminer la modification
                          </button>
                        </div>
                      )}

                      {/* Détail encaissements (masqué si en édition) */}
                      {!isEditing && openRemiseId === r.id && (
                        <div className="mt-2">
                          {rEncaissements.map((enc: any) => {
                            const pay = payments.find((p: any) => p.id === enc.paymentId);
                            const pd = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                            const label = enc.activityTitle || (pay?.items || []).map((i: any) => i.activityTitle).join(", ");
                            return (
                              <div key={enc.id} className="flex justify-between py-1 font-body text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-slate-500">{pd ? pd.toLocaleDateString("fr-FR") : "—"}</span>
                                  <Badge color="gray">{modeLabels[enc.mode] || enc.mode}</Badge>
                                  <span className="text-blue-800 truncate">{enc.familyName || pay?.familyName || "—"}</span>
                                  <span className="text-slate-500 truncate hidden sm:inline">{(label || "").slice(0, 30)}</span>
                                  {enc.ref && <span className="text-slate-400 flex-shrink-0">n°{enc.ref}</span>}
                                </div>
                                <span className="text-blue-500 font-semibold flex-shrink-0">{(enc.montant || 0).toFixed(2)}€</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                        </div>
                      )} {/* fin bloc déroulant */}
                    </Card>
                  );
                })}
                {remisesFiltrees.length === 0 && (remiseDateFrom || remiseDateTo || remiseModeFilter) && (
                  <p className="font-body text-sm text-slate-500 text-center py-4">Aucune remise sur cette période.</p>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })()
  );
}
