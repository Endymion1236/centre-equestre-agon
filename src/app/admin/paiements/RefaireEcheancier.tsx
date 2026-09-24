"use client";
import { useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import { MODES_ECHEANCIER, libelleMode, refaireEcheancier } from "./refaire-echeancier-utils";
import { todayIso } from "./echeances-utils";

/**
 * « Modifier l'échéancier » d'une famille : autre nombre d'échéances, autre
 * moyen de paiement, sans désinscrire l'enfant. Calcul dans
 * refaire-echeancier-utils.ts ; ici, l'aperçu et les écritures.
 */
export default function RefaireEcheancier({ echs, toast, refreshAll, onClose }: {
  echs: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
  onClose: () => void;
}) {
  const aujourdHui = todayIso();
  const prochaine = echs.find((e) => e.status !== "paid" && e.echeanceDate)?.echeanceDate;
  const [nombre, setNombre] = useState(10);
  const [mode, setMode] = useState("virement");
  const [dateDepart, setDateDepart] = useState(prochaine && prochaine > aujourdHui ? prochaine : aujourdHui);
  const [enCours, setEnCours] = useState(false);
  const plan = useMemo(() => refaireEcheancier(echs, { nombre, mode, dateDepart }), [echs, nombre, mode, dateDepart]);
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const jour = (iso: string) => iso.split("-").reverse().join("/");

  const enregistrer = async () => {
    if (!plan.possible) return;
    setEnCours(true);
    const premiere = echs.find((e) => e.status !== "paid");
    try {
      // Les nouvelles échéances d'abord : une coupure en route laisse l'ancien
      // échéancier complet, et relancer réécrit les mêmes identifiants.
      for (const c of plan.creations) {
        await setDoc(doc(db, "payments", c.id), { ...c.data, date: premiere?.date || serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      for (const m of plan.miseAJour) await updateDoc(doc(db, "payments", m.id), { ...m.data, updatedAt: serverTimestamp() });
      for (const a of plan.annulations) await updateDoc(doc(db, "payments", a.id), { ...a.data, cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
      // La fiche du forfait affiche son rythme de paiement.
      if (premiere?.familyId && premiere?.forfaitRef) {
        const forfaits = await getDocs(query(collection(db, "forfaits"), where("familyId", "==", premiere.familyId), where("slotKey", "==", premiere.forfaitRef)));
        for (const f of forfaits.docs) await updateDoc(f.ref, { paymentPlan: `${nombre}x`, updatedAt: serverTimestamp() });
      }
      toast(`✅ ${premiere?.familyName || "Échéancier"} : ${eur(plan.resteDu)} en ${nombre} fois par ${libelleMode(mode)}, à partir du ${jour(dateDepart)}.`, "success", 6000);
      await refreshAll();
      onClose();
    } catch (err: any) {
      toast(`Échéancier non modifié entièrement : ${err?.message || err}. Relancez : rien ne sera doublé.`, "error", 8000);
    } finally {
      setEnCours(false);
    }
  };

  const champ = "px-2 py-1.5 rounded-lg border border-blue-500/15 font-body text-xs bg-white";
  const premier = plan.apercu[0], dernier = plan.apercu[plan.apercu.length - 1];
  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="font-body text-xs font-semibold text-blue-800 mb-2">Modifier l'échéancier — l'inscription ne change pas</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">Reste dû en
          <input type="number" min={1} max={12} value={nombre} onChange={(e) => setNombre(Number(e.target.value))} className={`${champ} w-16`} /> fois
        </label>
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">par
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={champ}>
            {MODES_ECHEANCIER.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">1re échéance le
          <input type="date" value={dateDepart} onChange={(e) => e.target.value && setDateDepart(e.target.value)} className={champ} />
        </label>
      </div>

      {plan.possible ? (
        <div className="font-body text-xs text-slate-700 mt-2 space-y-1">
          <p>
            <strong>{eur(plan.resteDu)}</strong> en {nombre} échéance{nombre > 1 ? "s" : ""} d'environ <strong>{eur(premier.montant)}</strong>
            {nombre > 1 ? <>, du {jour(premier.date)} au {jour(dernier.date)}</> : <>, le {jour(premier.date)}</>}.
            {plan.conservees > 0 && <> {plan.conservees} échéance{plan.conservees > 1 ? "s" : ""} déjà payée{plan.conservees > 1 ? "s" : ""} conservée{plan.conservees > 1 ? "s" : ""}.</>}
          </p>
          {plan.annulations.length > 0 && <p className="text-slate-500">{plan.annulations.length} échéance{plan.annulations.length > 1 ? "s" : ""} en trop sera annulée{plan.annulations.length > 1 ? "s" : ""} (gardée{plan.annulations.length > 1 ? "s" : ""} dans l'historique).</p>}
          {plan.lienCbDejaOuvert && <p className="text-amber-800">⚠️ Un lien de paiement CB a déjà été ouvert pour cet échéancier : prévenez la famille de ne plus l'utiliser.</p>}
        </div>
      ) : (
        <p className="font-body text-xs text-red-600 mt-2">{plan.raison}</p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button type="button" disabled={!plan.possible || enCours} onClick={enregistrer}
          className="inline-flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
          {enCours && <Loader2 size={12} className="animate-spin" />} Enregistrer le nouvel échéancier
        </button>
        <button type="button" disabled={enCours} onClick={onClose} className="font-body text-xs text-blue-600 bg-transparent border-none cursor-pointer hover:underline">Fermer</button>
      </div>
    </div>
  );
}
