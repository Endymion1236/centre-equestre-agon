"use client";

/**
 * src/app/admin/paiements/ModaleEncaisser.tsx
 *
 * L'encaissement d'une commande impayée : le mode, le montant, la date, et
 * ce qui en découle — écriture au journal, échéancier SEPA, chèques différés,
 * consommation d'un avoir.
 *
 * La modale, ses onze états, ses chargements et le traitement lui-même
 * vivaient dispersés dans l'écran des paiements. Ils forment un tout : ce
 * qu'on saisit ici décide de ce qui part en base. Ils sont donc réunis.
 *
 * Rien du traitement n'a changé : mêmes écritures, mêmes garde-fous.
 */

import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";
import { createEncaissement } from "@/lib/compta-encaissement";
import { enregistrerEncaissement } from "@/lib/encaissement";
import { paymentModes } from "./types";
import { Loader2, X } from "lucide-react";
import { montantsEcheances, repartirEntreDeuxMandats } from "@/lib/sepa-remise";
import { maskIban } from "@/lib/sepa-validation";

export interface ModaleEncaisserProps {
  /** La commande à encaisser ; la modale n'est montée que si elle existe. */
  payment: any;
  onClose: () => void;
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  /**
   * Rechargement ciblé après écriture : quand on lui donne les identifiants
   * modifiés, il ne relit que ceux-là plutôt que toute la collection.
   */
  refreshAll: (changedPaymentIds?: string[]) => Promise<void>;
  toast: (message: string, type?: any) => void;
}

export default function ModaleEncaisser({
  payment, onClose, payments, encaissements, avoirs, refreshAll, toast,
}: ModaleEncaisserProps) {
  const [quickMode, setQuickMode] = useState("cheque");
  const [quickMontant, setQuickMontant] = useState("");
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [quickRef, setQuickRef] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickMandatActif, setQuickMandatActif] = useState<boolean | null>(null);
  const [quickMandats, setQuickMandats] = useState<any[]>([]);
  const [quickMandatId, setQuickMandatId] = useState<string>("");
  // Répartition entre deux mandats (compte du père, compte de la mère) :
  // le second porte le montant saisi, le premier le reste. Les échéances des
  // deux restent rattachées à la commande.
  const [quickRepartir, setQuickRepartir] = useState(false);
  const [quickMandatId2, setQuickMandatId2] = useState<string>("");
  const [quickMontant2, setQuickMontant2] = useState<string>("");
  const [quickChequesDiffres, setQuickChequesDiffres] = useState<
    { numero: string; banque: string; montant: string; dateEncaissementPrevue: string }[]
  >([{ numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] }]);

  // Ouvrir la modale sur une commande la remet à son état de départ : le
  // montant dû, la date du jour, aucune référence, le chèque par défaut.
  // Les onglets qui l'ouvrent n'ont plus à le faire pour elle.
  useEffect(() => {
    const du = Math.max(0, Math.round(((payment?.totalTTC || 0) - (payment?.paidAmount || 0)) * 100) / 100);
    setQuickMontant(du > 0 ? du.toFixed(2) : "");
    setQuickDate(new Date().toISOString().split("T")[0]);
    setQuickRef("");
    setQuickMode("cheque");
  }, [payment?.id]);

  // ═══ ENCAISSEMENT RAPIDE DEPUIS L'ONGLET IMPAYÉS ═══
  // Charger le mandat SEPA dès que la modale s'ouvre
  useEffect(() => {
    
    setQuickMandatActif(null);
    setQuickMandats([]); setQuickMandatId("");
    setQuickRepartir(false); setQuickMandatId2(""); setQuickMontant2("");
    getDocs(query(collection(db, "mandats-sepa"),
      where("familyId", "==", payment.familyId),
      where("status", "==", "active")
    )).then(snap => {
      // Le plus récent d'abord : c'est le choix par défaut le plus sûr quand
      // un RIB vient d'être renouvelé.
      const liste = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setQuickMandats(liste);
      setQuickMandatId(liste[0]?.id || "");
      setQuickMandatActif(liste.length > 0);
    }).catch(() => setQuickMandatActif(false));
  }, [payment?.id]);

  // ── Avoirs actifs de la famille (pour permettre encaissement par avoir) ──
  // Affichés dans la modale "Encaisser" comme un mode de paiement supplementaire
  // si la famille a un solde d'avoir disponible (status='actif' et remainingAmount>0).
  const [quickAvoirs, setQuickAvoirs] = useState<any[]>([]);
  useEffect(() => {
    
    getDocs(query(collection(db, "avoirs"),
      where("familyId", "==", payment.familyId)
    )).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as any)
        .filter(a => a.status === "actif" && (a.remainingAmount || 0) > 0);
      setQuickAvoirs(list);
    }).catch(() => setQuickAvoirs([]));
  }, [payment?.id]);

  // Pré-remplir la grille de chèques différés avec le montant dû quand la modale s'ouvre
  useEffect(() => {
    
    const p = payment;
    const du = Math.max(0, Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100);
    setQuickChequesDiffres([{
      numero: "", banque: "",
      montant: du > 0 ? du.toFixed(2) : "",
      dateEncaissementPrevue: new Date().toISOString().split("T")[0],
    }]);
  }, [payment?.id]);
  const quickRepartirEnParts = (total: number, n: number): number[] => {
    if (n <= 0) return [];
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / n);
    const reste = cents - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < reste ? 1 : 0)) / 100);
  };

  const handleQuickEncaisser = async () => {
    
    const p = payment;
    const montant = parseFloat(quickMontant) || ((p.totalTTC || 0) - (p.paidAmount || 0));
    if (montant <= 0) return;
    setQuickSaving(true);
    try {
      // ── Mode chèques différés : pas d'encaissement immédiat ──
      // On convertit l'impayé : on passe le payment en paymentMode "cheque_differe"
      // et on crée N documents cheques-differes. Chaque chèque sera encaissé
      // individuellement le jour venu via l'onglet "Chèques différés".
      if (quickMode === "cheque_differe") {
        const chqsValides = quickChequesDiffres.filter(
          c => safeNumber(c.montant) > 0 && c.dateEncaissementPrevue
        );
        if (chqsValides.length === 0) {
          toast("Ajoutez au moins un chèque avec un montant et une date", "warning");
          setQuickSaving(false);
          return;
        }
        const totalChq = chqsValides.reduce((s, c) => s + safeNumber(c.montant), 0);
        if (Math.abs(totalChq - montant) > 0.01) {
          if (!confirm(
            `Le total des chèques (${totalChq.toFixed(2)}€) ne correspond pas au montant à encaisser (${montant.toFixed(2)}€).\n\nÉcart : ${(totalChq - montant).toFixed(2)}€.\n\nContinuer quand même ?`
          )) {
            setQuickSaving(false);
            return;
          }
        }

        // Créer un document par chèque dans cheques-differes
        for (const chq of chqsValides) {
          await addDoc(collection(db, "cheques-differes"), {
            paymentId: p.id,
            familyId: p.familyId,
            familyName: p.familyName,
            numero: chq.numero.trim(),
            banque: chq.banque.trim(),
            montant: safeNumber(chq.montant),
            dateEncaissementPrevue: chq.dateEncaissementPrevue,
            status: "pending",
            createdAt: serverTimestamp(),
          });
        }

        // Mettre à jour le payment : mode cheque_differe, ref synthétique
        // Statut conservé en "pending" car aucun chèque n'a encore été déposé.
        // L'onglet "Chèques différés" marquera le payment "paid" quand tous
        // les chèques seront déposés.
        await updateDoc(doc(db, "payments", p.id), {
          paymentMode: "cheque_differe",
          paymentRef: `${chqsValides.length} chèque(s) différé(s)`,
          updatedAt: serverTimestamp(),
        });

        toast(
          `✅ ${chqsValides.length} chèque(s) différé(s) enregistré(s) pour ${p.familyName} — ${totalChq.toFixed(2)}€`,
          "success"
        );
        onClose();
        setQuickMontant(""); setQuickRef("");
        setQuickDate(new Date().toISOString().split("T")[0]);
        setQuickChequesDiffres([{ numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] }]);
        await refreshAll();
        setQuickSaving(false);
        return;
      }

      // ── Mode SEPA : créer les échéances au lieu d'encaisser directement ──
      if (quickMode === "prelevement_sepa") {
        // Le nombre d'échéances transite par quickRef (le même champ que la
        // référence) : on le borne, plutôt que de risquer un NaN qui créerait
        // ZÉRO échéance tout en marquant la facture comme planifiée.
        const nbEch = Math.min(36, Math.max(1, parseInt(quickRef || "10") || 10));
        const startDate = new Date(quickDate || new Date().toISOString().split("T")[0]);

        // Échéances déjà créées pour cette facture ? Sans ce contrôle, un
        // second passage produisait un second échéancier — donc un double
        // prélèvement sur le compte de la famille.
        const dejaSnap = await getDocs(query(
          collection(db, "echeances-sepa"),
          where("paymentId", "==", p.id)
        ));
        if (!dejaSnap.empty) {
          const enAttente = dejaSnap.docs.filter(d => d.data().status === "pending").length;
          toast(
            `Cette facture a déjà ${dejaSnap.size} échéance(s) SEPA (${enAttente} en attente). Gérez-les dans Prélèvements SEPA plutôt que d'en créer de nouvelles.`,
            "warning",
          );
          setQuickSaving(false);
          return;
        }

        // Mandat retenu : celui choisi dans la modale (le plus récent par
        // défaut). Sans ce choix explicite, une famille à deux mandats se
        // faisait prélever sur un compte tiré au hasard.
        const mandatSnap = await getDocs(query(
          collection(db, "mandats-sepa"),
          where("familyId", "==", p.familyId),
          where("status", "==", "active"),
        ));
        const mandat = mandatSnap.docs.find(d => d.id === quickMandatId) || mandatSnap.docs[0];
        if (!mandat) {
          toast("⚠️ Aucun mandat SEPA actif pour cette famille. Créez-en un dans Prélèvements SEPA.", "error");
          setQuickSaving(false);
          return;
        }
        const mandatData = mandat.data();

        // Répartition sur deux mandats : le second porte le montant saisi,
        // le premier le reste. Chaque mandat a son propre échéancier, tous
        // deux rattachés à la commande.
        const plans: { mandat: any; montant: number }[] = [];
        if (quickRepartir) {
          const mandat2 = mandatSnap.docs.find(d => d.id === quickMandatId2);
          if (!mandat2 || mandat2.id === mandat.id) {
            toast("Choisissez un second mandat différent du premier.", "error");
            setQuickSaving(false);
            return;
          }
          const rep = repartirEntreDeuxMandats({ montantTotal: montant, montantMandat2: parseFloat(quickMontant2) });
          if (!rep.ok) { toast(rep.raison, "error"); setQuickSaving(false); return; }
          plans.push({ mandat: mandatData, montant: rep.montant1 }, { mandat: mandat2.data(), montant: rep.montant2 });
        } else {
          plans.push({ mandat: mandatData, montant });
        }

        // Créer les échéances
        const desc = (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Forfait";
        for (const plan of plans) {
          const montants = montantsEcheances(plan.montant, nbEch);
          const qui = plans.length > 1 ? ` (${plan.mandat.libelle || plan.mandat.titulaire || plan.mandat.mandatId})` : "";
          for (let i = 0; i < nbEch; i++) {
            const d = new Date(startDate);
            d.setMonth(d.getMonth() + i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            await addDoc(collection(db, "echeances-sepa"), {
              familyId: p.familyId,
              familyName: p.familyName,
              mandatId: plan.mandat.mandatId,
              montant: montants[i],
              dateEcheance: dateStr,
              reference: `Paiement ${p.id}`,
              description: `${desc} — ${i + 1}/${nbEch}${qui}`,
              status: "pending",
              remiseId: null,
              paymentId: p.id,
              echeance: i + 1,
              echeancesTotal: nbEch,
              createdAt: serverTimestamp(),
            });
          }
        }

        // Marquer le paiement comme SEPA (mais pas payé — il sera payé quand la
        // remise passera). Le statut « sepa_scheduled » est ce qui sort la
        // facture des Impayés : sans lui, elle y restait et pouvait être
        // planifiée une seconde fois — double prélèvement à la clé.
        await updateDoc(doc(db, "payments", p.id), {
          paymentMode: "prelevement_sepa",
          status: "sepa_scheduled",
          paymentRef: `${nbEch}× SEPA · ${plans.map(pl => pl.mandat.mandatId).join(" + ")}`,
          updatedAt: serverTimestamp(),
        });

        // Prévenir la famille : montant, date, mandat. Sans cet envoi, elle
        // en restait au message « réglez quand vous le souhaitez » de la
        // commande différée, et découvrait le prélèvement sur son relevé.
        // Les règles SEPA imposent d'ailleurs cette pré-notification.
        let prevenue = false;
        try {
          const r = await authFetch("/api/admin/sepa-prenotification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId: p.id }),
          });
          prevenue = !!(await r.json().catch(() => null))?.sent;
        } catch (e) { console.warn("[sepa] pré-notification:", e); }

        toast(
          `✅ ${nbEch} échéance${nbEch > 1 ? "s" : ""} SEPA créée${nbEch > 1 ? "s" : ""} pour ${p.familyName} (${montant.toFixed(2)}€)`
          + (prevenue ? " — famille prévenue par email" : " — ⚠️ email de pré-notification non envoyé"),
          prevenue ? "success" : "warning",
        );
        onClose();
        setQuickMontant(""); setQuickRef("");
        setQuickDate(new Date().toISOString().split("T")[0]);
        await refreshAll([p.id]);
        setQuickSaving(false);
        return;
      }

      // ── Mode AVOIR : consommer l'avoir au lieu d'encaisser de l'argent ──
      // Deduit le montant des avoirs actifs de la famille (FIFO : le plus ancien
      // d'abord). Cree un encaissement de mode 'avoir' (montant positif, mais
      // mode='avoir' pour distinguer) puis decremente le remainingAmount sur
      // chaque avoir consomme.
      if (quickMode === "avoir") {
        const totalAvoirDispo = quickAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
        if (montant > totalAvoirDispo + 0.005) {
          toast(`Avoir insuffisant : ${totalAvoirDispo.toFixed(2)}€ disponible, ${montant.toFixed(2)}€ demandé`, "warning");
          setQuickSaving(false);
          return;
        }
        let restant = montant;
        const sortedAvoirs = [...quickAvoirs].sort((a, b) => {
          // Plus ancien d'abord (FIFO)
          const da = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
          const db_ = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
          return da - db_;
        });
        const refsUsed: string[] = [];
        for (const a of sortedAvoirs) {
          if (restant <= 0.005) break;
          const dispo = a.remainingAmount || 0;
          const utilise = Math.min(dispo, restant);
          const newRemaining = Math.round((dispo - utilise) * 100) / 100;
          const newUsed = Math.round((a.usedAmount || 0) * 100) / 100 + utilise;
          const newStatus = newRemaining <= 0.005 ? "utilise" : "actif";
          await updateDoc(doc(db, "avoirs", a.id), {
            usedAmount: Math.round(newUsed * 100) / 100,
            remainingAmount: newRemaining,
            status: newStatus,
            usageHistory: [...(a.usageHistory || []), {
              date: new Date().toISOString(),
              paymentId: p.id,
              montant: utilise,
            }],
            updatedAt: serverTimestamp(),
          });
          refsUsed.push(a.reference || a.id.slice(-6));
          restant = Math.round((restant - utilise) * 100) / 100;
        }
        // Mettre a jour le payment (paidAmount + status)
        const newPaid = Math.round(((p.paidAmount || 0) + montant) * 100) / 100;
        const newStatus = newPaid >= (p.totalTTC || 0) ? "paid" : "partial";
        await updateDoc(doc(db, "payments", p.id), {
          paidAmount: newPaid,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
        // Trace dans le journal des encaissements
        await createEncaissement({
          paymentId: p.id,
          familyId: p.familyId,
          familyName: p.familyName,
          montant: montant,
          mode: "avoir",
          modeLabel: `Avoir (${refsUsed.join(", ")})`,
          ref: refsUsed.join(", "),
          activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", "),
          isAvoir: true,
        });
        toast(`✅ ${montant.toFixed(2)}€ payé par avoir (${refsUsed.join(", ")}) pour ${p.familyName}${newStatus === "paid" ? " — Tout réglé !" : ""}`, "success");
        onClose();
        setQuickMontant(""); setQuickRef("");
        setQuickDate(new Date().toISOString().split("T")[0]);
        await refreshAll([p.id]);
        setQuickSaving(false);
        return;
      }

      // ── Encaissement normal (CB, chèque, espèces, etc.) ──
      // Utiliser la fonction centralisée qui gère points fidélité + invoiceNumber
      await enregistrerEncaissement(
        p.id!, p, montant, quickMode, quickRef,
        (p.items || []).map((i: any) => i.activityTitle).join(", "),
        quickDate,
      );
      const encSnap2 = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", p.id)));
      const totalEncaisse2 = Math.round(encSnap2.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0) * 100) / 100;
      const totalTTC2 = safeNumber(p.totalTTC);
      toast(`✅ ${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === quickMode)?.label}) pour ${p.familyName}${totalEncaisse2 >= totalTTC2 ? " — Tout réglé !" : ` — Reste : ${(totalTTC2 - totalEncaisse2).toFixed(2)}€`}`, "success");
      onClose();
      setQuickMontant(""); setQuickRef("");
      setQuickDate(new Date().toISOString().split("T")[0]);
      await refreshAll([p.id]);
    } catch (e) { console.error(e); toast("Erreur encaissement", "error"); }
    setQuickSaving(false);
  };

  return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => onClose()}>
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800">Encaisser</h2>
              <p className="font-body text-xs text-slate-500 mt-0.5">{payment.familyName}</p>
            </div>
            <button type="button" onClick={() => onClose()} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
          <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
            {/* Montant */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Montant (€)</label>
              <input type="number" min="0" step="0.01" value={quickMontant}
                onChange={e => setQuickMontant(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-right text-lg font-semibold"/>
              <p className="font-body text-[10px] text-slate-400 mt-1">Dû : {((payment.totalTTC||0)-(payment.paidAmount||0)).toFixed(2)}€</p>
            </div>
            {/* Mode */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Mode de paiement</label>
              {quickAvoirs.length > 0 && (() => {
                const totalAvoir = quickAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                return (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 mb-2">
                    <button type="button"
                      onClick={() => setQuickMode("avoir")}
                      className={`w-full text-left font-body text-sm font-semibold cursor-pointer border-none bg-transparent ${
                        quickMode === "avoir" ? "text-purple-700" : "text-purple-600"
                      }`}>
                      💜 Utiliser l'avoir ({totalAvoir.toFixed(2)}€ disponible) {quickMode === "avoir" && "✓"}
                    </button>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cheque", label: "Chèque", icon: "📝" },
                  { id: "especes", label: "Espèces", icon: "💵" },
                  { id: "virement", label: "Virement", icon: "🏦" },
                  { id: "cb_terminal", label: "CB", icon: "💳" },
                  { id: "cheque_vacances", label: "Chèques vacances", icon: "🏖️" },
                  { id: "pass_sport", label: "Pass'Sport", icon: "🤸" },
                  { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
                  { id: "cheque_differe", label: "Chèques différés", icon: "📅" },
                ].map(m => {
                  const isSepa = m.id === "prelevement_sepa";
                  const sepaBlocked = isSepa && quickMandatActif === false;
                  return (
                    <button type="button" key={m.id}
                      onClick={() => !sepaBlocked && setQuickMode(m.id)}
                      disabled={sepaBlocked}
                      title={sepaBlocked ? "Aucun mandat SEPA actif pour cette famille" : undefined}
                      className={`py-2.5 rounded-xl font-body text-sm font-semibold border transition-all
                        ${sepaBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60" :
                          quickMode === m.id ? "bg-blue-500 text-white border-blue-500 cursor-pointer" :
                          "bg-white text-slate-600 border-gray-200 hover:border-blue-300 cursor-pointer"}`}>
                      {m.icon} {m.label}
                      {sepaBlocked && <span className="block text-[9px] text-red-400 mt-0.5">Pas de mandat</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Compte à débiter — affiché dès qu'un mandat existe, et
                OBLIGATOIREMENT choisi quand la famille en a plusieurs
                (compte du père / de la mère, ou RIB renouvelé). */}
            {quickMode === "prelevement_sepa" && quickMandats.length > 0 && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">
                  Compte à débiter {quickMandats.length > 1 && <span className="text-orange-600">({quickMandats.length} mandats actifs)</span>}
                </label>
                {quickMandats.length > 1 ? (
                  <>
                    <select value={quickMandatId} onChange={e => setQuickMandatId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none">
                      {quickMandats.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.libelle ? `${m.libelle} — ` : ""}{m.titulaire} · {maskIban(m.iban || "")} · {m.mandatId}
                        </option>
                      ))}
                    </select>
                    {/* Deux parents, deux comptes : chacun sa part, même
                        nombre d'échéances, mêmes dates. */}
                    <label className="mt-2 flex items-center gap-2 font-body text-xs text-blue-800 cursor-pointer">
                      <input type="checkbox" checked={quickRepartir}
                        onChange={e => { setQuickRepartir(e.target.checked); if (e.target.checked && !quickMandatId2) setQuickMandatId2(quickMandats.find(m => m.id !== quickMandatId)?.id || ""); }}
                        className="accent-blue-600 w-4 h-4" />
                      Répartir sur deux mandats (père / mère)
                    </label>
                    {quickRepartir && (() => {
                      const total = parseFloat(quickMontant) || 0;
                      const m2 = parseFloat(quickMontant2) || 0;
                      const m1 = Math.max(0, Math.round((total - m2) * 100) / 100);
                      return (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="font-body text-[10px] text-gray-400 block mb-1">Second compte</label>
                            <select value={quickMandatId2} onChange={e => setQuickMandatId2(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white">
                              {quickMandats.filter(m => m.id !== quickMandatId).map(m => (
                                <option key={m.id} value={m.id}>{m.libelle ? `${m.libelle} — ` : ""}{m.titulaire} · {maskIban(m.iban || "")}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="font-body text-[10px] text-gray-400 block mb-1">Montant sur le second compte (€)</label>
                            <input type="number" step="0.01" min="0" value={quickMontant2} onChange={e => setQuickMontant2(e.target.value)}
                              placeholder={total > 0 ? (total / 2).toFixed(2) : ""}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                          </div>
                          {total > 0 && m2 > 0 && (
                            <div className="sm:col-span-2 font-body text-xs text-blue-700">
                              Premier compte : <strong>{m1.toFixed(2)} €</strong> · Second compte : <strong>{m2.toFixed(2)} €</strong> · Total {total.toFixed(2)} €
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="font-body text-xs text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5">
                    {quickMandats[0].titulaire} · <span className="font-mono">{maskIban(quickMandats[0].iban || "")}</span> · {quickMandats[0].mandatId}
                  </div>
                )}
              </div>
            )}
            {/* Échéancier SEPA */}
            {quickMandatActif === false && quickMode === "prelevement_sepa" && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <span className="text-red-500 text-base">⚠️</span>
                <div>
                  <p className="font-body text-xs font-semibold text-red-600">Aucun mandat SEPA actif pour cette famille</p>
                  <p className="font-body text-[10px] text-red-400 mt-0.5">Créez un mandat dans <strong>Prélèvements SEPA</strong> avant d'utiliser ce mode.</p>
                </div>
              </div>
            )}
            {quickMandatActif === null && quickMode === "prelevement_sepa" && (
              <div className="font-body text-xs text-slate-400 flex items-center gap-2">
                <span className="animate-spin inline-block">⏳</span> Vérification du mandat...
              </div>
            )}
            {quickMode === "prelevement_sepa" && (
              <div className="bg-blue-50 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-body text-xs font-semibold text-blue-800">Échéancier SEPA</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-body text-[10px] text-gray-400 block mb-1">Nb échéances</label>
                    <select value={quickRef || "10"} onChange={e => setQuickRef(e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}×</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-gray-400 block mb-1">1ère échéance</label>
                    <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm"/>
                  </div>
                </div>
                {quickMontant && (
                  <div className="font-body text-xs text-blue-600">
                    💡 {quickRef || "10"} × {(parseFloat(quickMontant) / parseInt(quickRef || "10")).toFixed(2)}€ = {parseFloat(quickMontant).toFixed(2)}€
                  </div>
                )}
                <div className="font-body text-[10px] text-gray-400">
                  Un mandat SEPA doit exister pour cette famille. Les échéances seront créées dans le module Prélèvements SEPA.
                </div>
              </div>
            )}
            {/* Saisie multi-chèques (mode cheque_differe) */}
            {quickMode === "cheque_differe" && (() => {
              const totalChq = quickChequesDiffres.reduce((s, c) => s + safeNumber(c.montant), 0);
              const montantCible = parseFloat(quickMontant) || ((payment.totalTTC || 0) - (payment.paidAmount || 0));
              const ecart = Math.round((totalChq - montantCible) * 100) / 100;
              const ecartAbs = Math.abs(ecart);
              return (
                <div className="border border-orange-200 rounded-xl p-3 bg-orange-50 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="font-body text-xs font-semibold text-orange-800">
                      📅 Chèques ({quickChequesDiffres.length})
                    </div>
                    <div className="font-body text-xs text-orange-700">
                      <span className="font-bold">{totalChq.toFixed(2)}€</span> / {montantCible.toFixed(2)}€
                      {ecartAbs > 0.01 && (
                        <span className="ml-1 text-red-600">
                          ({ecart > 0 ? "+" : ""}{ecart.toFixed(2)}€)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {quickChequesDiffres.map((chq, idx) => (
                      <div key={idx} className="flex flex-col gap-1 bg-white rounded-lg p-2 border border-orange-100">
                        <div className="flex gap-1.5 items-center">
                          <input
                            value={chq.numero}
                            onChange={e => {
                              const u = [...quickChequesDiffres]; u[idx].numero = e.target.value; setQuickChequesDiffres(u);
                            }}
                            placeholder="N°"
                            className="w-20 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                          />
                          <input
                            value={chq.banque}
                            onChange={e => {
                              const u = [...quickChequesDiffres]; u[idx].banque = e.target.value; setQuickChequesDiffres(u);
                            }}
                            placeholder="Banque"
                            className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                          />
                          {quickChequesDiffres.length > 1 && (
                            <button type="button"
                              onClick={() => setQuickChequesDiffres(quickChequesDiffres.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"
                              title="Supprimer ce chèque">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <input
                            value={chq.montant}
                            onChange={e => {
                              const u = [...quickChequesDiffres]; u[idx].montant = e.target.value; setQuickChequesDiffres(u);
                            }}
                            type="number" step="0.01" placeholder="Montant"
                            className="w-24 px-2 py-1 rounded border border-gray-200 font-body text-xs text-right focus:outline-none focus:border-orange-400"
                          />
                          <input
                            value={chq.dateEncaissementPrevue}
                            onChange={e => {
                              const u = [...quickChequesDiffres]; u[idx].dateEncaissementPrevue = e.target.value; setQuickChequesDiffres(u);
                            }}
                            type="date"
                            className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button"
                      onClick={() => {
                        const reste = Math.max(0, Math.round((montantCible - totalChq) * 100) / 100);
                        const lastDate = quickChequesDiffres[quickChequesDiffres.length - 1]?.dateEncaissementPrevue;
                        let nextDate = new Date().toISOString().split("T")[0];
                        if (lastDate) {
                          const d = new Date(lastDate);
                          d.setMonth(d.getMonth() + 1);
                          nextDate = d.toISOString().split("T")[0];
                        }
                        setQuickChequesDiffres([...quickChequesDiffres, { numero: "", banque: "", montant: reste > 0 ? reste.toFixed(2) : "", dateEncaissementPrevue: nextDate }]);
                      }}
                      className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-orange-100">
                      + Ajouter
                    </button>
                    {quickChequesDiffres.length > 0 && (
                      <button type="button"
                        onClick={() => {
                          const n = quickChequesDiffres.length;
                          if (n === 0) return;
                          const baseDate = quickChequesDiffres[0]?.dateEncaissementPrevue || new Date().toISOString().split("T")[0];
                          const parts = quickRepartirEnParts(montantCible, n);
                          const updated = quickChequesDiffres.map((c, i) => {
                            const d = new Date(baseDate);
                            d.setMonth(d.getMonth() + i);
                            return {
                              ...c,
                              montant: parts[i].toFixed(2),
                              dateEncaissementPrevue: d.toISOString().split("T")[0],
                            };
                          });
                          setQuickChequesDiffres(updated);
                        }}
                        className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-orange-100">
                        ⚖️ Répartir en {quickChequesDiffres.length}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* Date (masquée en mode cheque_differe : chaque chèque a sa propre date) */}
            {quickMode !== "cheque_differe" && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Date d'encaissement</label>
                <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
                <p className="font-body text-[10px] text-slate-400 mt-1">Modifiable si encaissement différé</p>
              </div>
            )}
            {/* Référence — masquée en mode cheque_differe (le N° se saisit par
                chèque) ET en mode SEPA, où ce même champ porte le NOMBRE
                d'échéances : y écrire un texte libre effaçait le compte et
                ne créait alors aucune échéance. */}
            {quickMode !== "cheque_differe" && quickMode !== "prelevement_sepa" && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Référence (optionnel)</label>
                <input value={quickRef} onChange={e => setQuickRef(e.target.value)}
                  placeholder="N° chèque, virement..."
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => onClose()} className="px-5 py-3 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
              <button type="button" onClick={handleQuickEncaisser} disabled={quickSaving || !quickMontant || (quickMode === "prelevement_sepa" && quickMandatActif !== true)}
                className="flex-1 py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-700 border-none cursor-pointer disabled:opacity-50">
                {quickSaving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : (quickMode === "cheque_differe" ? "📅 " : "💶 ")}
                {quickMode === "cheque_differe"
                  ? `Enregistrer ${quickChequesDiffres.length} chèque${quickChequesDiffres.length > 1 ? "s" : ""}`
                  : `Confirmer ${quickMontant ? `${parseFloat(quickMontant).toFixed(2)}€` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
