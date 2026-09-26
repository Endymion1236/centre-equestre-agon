"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, X } from "lucide-react";
import { commandesDeLInscription } from "./types";
import { analyserMontantInscription, planifierMontantInscription, type LigneMontant } from "./montant-inscription-utils";

/**
 * « 💶 Montant » d'un inscrit : corriger les lignes de sa commande depuis le
 * panneau du planning. Règles dans montant-inscription-utils.ts.
 */
export default function ModaleMontantInscription({ inscrit, payments, creneau, toast, onClose, onDone, onPrenotification }: {
  inscrit: any;
  payments: any[];
  creneau: { id?: string; activityTitle: string };
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  /** Prélèvement SEPA modifié : proposer la pré-notification du nouveau montant. */
  onPrenotification?: (paymentId: string, familyName: string) => void;
}) {
  const commandes = useMemo(() => commandesDeLInscription(inscrit, payments, creneau), [inscrit, payments, creneau]);
  const [prelevements, setPrelevements] = useState<any[] | null>(null);
  const [saisie, setSaisie] = useState<string[] | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Prélèvements SEPA de la commande, s'il y en a : lus avant l'analyse.
  useEffect(() => {
    let actif = true;
    (async () => {
      const sepa = commandes.filter((p) => p.status === "sepa_scheduled" || p.paymentMode === "prelevement_sepa");
      const lus: any[] = [];
      for (const p of sepa) {
        const reqs = [getDocs(query(collection(db, "echeances-sepa"), where("paymentId", "==", p.id)))];
        if (p.orderId) reqs.push(getDocs(query(collection(db, "echeances-sepa"), where("orderId", "==", p.orderId))));
        for (const snap of await Promise.all(reqs)) snap.docs.forEach((d) => { if (!lus.some((x) => x.id === d.id)) lus.push({ id: d.id, ...d.data() }); });
      }
      if (actif) setPrelevements(lus);
    })().catch((e) => { console.error(e); if (actif) setPrelevements([]); });
    return () => { actif = false; };
  }, [commandes]);

  const analyse = useMemo(() => prelevements ? analyserMontantInscription(commandes, prelevements) : null, [commandes, prelevements]);
  useEffect(() => { if (analyse?.possible && saisie === null) setSaisie(analyse.lignes.map((l) => l.priceTTC.toFixed(2))); }, [analyse, saisie]);

  const lignesSaisies: LigneMontant[] = analyse && saisie ? analyse.lignes.map((l, i) => ({ ...l, priceTTC: Number(String(saisie[i] ?? "").replace(",", ".")) })) : [];
  const plan = analyse && saisie ? planifierMontantInscription(analyse, commandes, lignesSaisies, prelevements || []) : null;
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const change = plan?.possible && analyse ? Math.abs(plan.nouveauTotal - analyse.total) >= 0.005 : false;

  const enregistrer = async () => {
    if (!plan?.possible || !change) return;
    setEnCours(true);
    try {
      // Créations d'abord : une coupure laisse l'ancien échéancier entier.
      const premiere = commandes.find((p) => p.status !== "paid");
      for (const cr of plan.creations) await setDoc(doc(db, "payments", cr.id), { ...cr.data, date: premiere?.date || serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      for (const m of plan.miseAJour) await updateDoc(doc(db, "payments", m.id), { ...m.data, updatedAt: serverTimestamp() });
      for (const a of plan.annulations) await updateDoc(doc(db, "payments", a.id), { ...a.data, cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
      for (const pr of plan.prelevements) await updateDoc(doc(db, "echeances-sepa", pr.id), { montant: pr.montant, updatedAt: serverTimestamp() });
      toast(`Montant corrigé : ${eur(analyse!.total)} → ${eur(plan.nouveauTotal)}${plan.prelevements.length ? `, ${plan.prelevements.length} prélèvements recalculés` : ""}.`, "success", 6000);
      if (plan.prenotificationARevoir && premiere) onPrenotification?.(premiere.id, premiere.familyName || inscrit.familyName || "");
      await onDone();
      onClose();
    } catch (e: any) {
      toast(`Correction interrompue : ${e?.message || e}. Relancez-la.`, "error", 8000);
    } finally { setEnCours(false); }
  };

  const explication = analyse?.forme === "sepa"
    ? `Prélèvement SEPA : les ${prelevements?.filter((x) => x.status === "pending").length || 0} prélèvements à venir seront recalculés sur le nouveau total, aux mêmes dates et sur le même mandat. La famille devra recevoir la pré-notification du nouveau montant.`
    : analyse?.forme === "echeances"
      ? `Paiement en plusieurs fois : le reste dû${analyse.paye > 0 ? ` (déjà payé : ${eur(analyse.paye)})` : ""} sera redécoupé sur les mêmes échéances.`
      : "Commande en un règlement : les lignes et le total sont corrigés.";

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="font-body text-sm font-semibold text-blue-800">💶 Montant — {inscrit.childName}</div>
          <button type="button" onClick={onClose} className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4 font-body text-sm">
          {!analyse ? (
            <p className="text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Lecture de la commande…</p>
          ) : !analyse.possible ? (
            <p className="text-red-700">{analyse.raison}</p>
          ) : (
            <>
              <p className="text-xs text-slate-600 mb-3">{explication}</p>
              <div className="flex flex-col gap-2">
                {analyse.lignes.map((l, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-slate-700" title={l.activityTitle}>{l.activityTitle}</span>
                    <span className="text-[10px] text-slate-400">TVA {String(l.tva).replace(".", ",")} %</span>
                    <input value={saisie?.[i] ?? ""} inputMode="decimal"
                      onChange={(ev) => setSaisie((prev) => (prev || []).map((v, j) => (j === i ? ev.target.value : v)))}
                      className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-right" />
                    <span className="text-xs text-slate-500">€</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-slate-500">Total</span>
                <span>
                  {change && <span className="text-slate-400 line-through mr-2">{eur(analyse.total)}</span>}
                  <strong className="text-blue-800">{plan?.possible ? eur(plan.nouveauTotal) : eur(analyse.total)}</strong>
                </span>
              </div>
              {plan && !plan.possible && <p className="mt-2 text-xs text-red-700">{plan.raison}</p>}
              {plan?.possible && plan.prelevements.length > 0 && change && (
                <p className="mt-2 text-xs text-slate-600">Nouveaux prélèvements : {plan.prelevements.length} × environ {eur(plan.prelevements[0].montant)}.</p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button type="button" disabled={!plan?.possible || !change || enCours} onClick={enregistrer}
                  className="inline-flex items-center gap-1 font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
                  {enCours && <Loader2 size={14} className="animate-spin" />} Enregistrer
                </button>
                <button type="button" onClick={onClose} className="text-blue-600 bg-transparent border-none cursor-pointer hover:underline">Annuler</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
