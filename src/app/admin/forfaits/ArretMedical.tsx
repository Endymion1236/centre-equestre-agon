"use client";
/**
 * Arrêt médical d'un cavalier au forfait (novembre 2026) : les séances de
 * l'arrêt (3 semaines minimum) sont retirées du forfait au prorata à la
 * séance, sur les échéances à venir — commandes et prélèvements SEPA encore
 * en attente. Ce qui est payé, facturé ou déjà dans une remise ne bouge pas.
 * Règles : lib/arret-medical.ts (testé).
 */
import { useEffect, useMemo, useState } from "react";
import { arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { commandeDuForfait } from "@/lib/forfaits";
import {
  ARRET_MEDICAL_MIN_JOURS, commandeModifiable, estSeanceDuForfait, joursArret, planArretMedical,
  prelevementModifiable, prixSeanceForfait, type CommandeArret, type PrelevementArret,
} from "@/lib/arret-medical";

interface ForfaitArret {
  id: string; familyId: string; childId: string; childName: string;
  activityTitle: string; startTime: string; slotKey?: string; slotKeysAnterieurs?: string[];
  totalSessions: number; forfaitPriceTTC: number;
}

const fmt = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const fmtDate = (d?: string) => (d ? d.split("-").reverse().join("/") : "");

export default function ArretMedical({ forfait, payments, onClose, onDone }: {
  forfait: ForfaitArret; payments: any[]; onClose: () => void; onDone: () => void;
}) {
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [certificat, setCertificat] = useState("");
  const [seances, setSeances] = useState<{ id: string; date: string }[]>([]);
  const [nbSeances, setNbSeances] = useState<number | "">("");
  const [prelevements, setPrelevements] = useState<PrelevementArret[]>([]);
  const commandes = useMemo(() => payments.filter((p) => commandeDuForfait(p, forfait as any)), [payments, forfait]);
  const prixDefaut = useMemo(() => prixSeanceForfait(commandes, forfait.childId, forfait.totalSessions || 0, forfait.forfaitPriceTTC), [commandes, forfait]);
  const [prixSeance, setPrixSeance] = useState<number | "">(prixDefaut || "");
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, "echeances-sepa"), where("familyId", "==", forfait.familyId)))
      .then((s) => setPrelevements(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(console.error);
  }, [forfait.familyId]);

  // Séances du forfait pendant l'arrêt, lues sur le planning.
  useEffect(() => {
    if (!debut || !fin || fin < debut) { setSeances([]); return; }
    getDocs(query(collection(db, "creneaux"), where("date", ">=", debut), where("date", "<=", fin)))
      .then((s) => {
        const l = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((c) => estSeanceDuForfait(c, forfait))
          .map((c) => ({ id: c.id, date: c.date as string }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setSeances(l);
        setNbSeances(l.length);
      })
      .catch(console.error);
  }, [debut, fin, forfait]);

  const plan = useMemo(() => planArretMedical({
    debut, fin, seancesManquees: Number(nbSeances) || 0, prixSeance: Number(prixSeance) || 0,
    commandes: commandes as CommandeArret[], prelevements,
  }), [debut, fin, nbSeances, prixSeance, commandes, prelevements]);
  const jours = joursArret(debut, fin);

  const appliquer = async () => {
    if (!plan.possible || busy) return;
    if (!confirm(`Retirer ${plan.reduction.toFixed(2)} € (${nbSeances} séances) des échéances à venir de ${forfait.childName} ?`)) return;
    setBusy(true);
    try {
      const libelle = `Réduction arrêt médical du ${fmtDate(debut)} au ${fmtDate(fin)} (${nbSeances} séance${Number(nbSeances) > 1 ? "s" : ""})`;
      const ignores: string[] = [];
      // 1. Prélèvements : relus, baissés seulement s'ils sont toujours en attente hors remise.
      const partsAppliquees = new Map<string, number>();
      for (const pr of plan.prelevements) {
        const snap = await getDoc(doc(db, "echeances-sepa", pr.id));
        const d = snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
        if (!d || !prelevementModifiable(d)) { ignores.push(`prélèvement du ${fmtDate(pr.date)}`); continue; }
        await updateDoc(doc(db, "echeances-sepa", pr.id), {
          montant: Math.round(((Number(d.montant) || 0) - pr.part) * 100) / 100,
          arretMedical: { debut, fin, reduction: pr.part }, updatedAt: serverTimestamp(),
        });
        partsAppliquees.set(pr.paymentId, Math.round(((partsAppliquees.get(pr.paymentId) || 0) + pr.part) * 100) / 100);
      }
      // 2. Commandes : une ligne négative, total et reste SEPA baissés d'autant.
      for (const c of plan.commandes) {
        const r = c.enSepa ? (partsAppliquees.get(c.paymentId) || 0) : c.reduction;
        if (r <= 0) continue;
        const snap = await getDoc(doc(db, "payments", c.paymentId));
        const p = snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
        if (!p || !commandeModifiable(p) || (!c.enSepa && (Number(p.paidAmount) || 0) > 0)) { ignores.push(`commande ${c.echeance ? `échéance ${c.echeance}` : c.paymentId}`); continue; }
        const ligneCours = (p.items || []).find((i: any) => i?.childId === forfait.childId && Number(i?.tva) >= 0);
        const tva = Number(ligneCours?.tva ?? 5.5);
        const items = [...(p.items || []), {
          activityTitle: libelle, childId: forfait.childId, childName: forfait.childName,
          priceTTC: -r, priceHT: -Math.round((r / (1 + tva / 100)) * 100) / 100, tva, arretMedical: true,
        }];
        const nouveauTotal = Math.round(((Number(p.totalTTC) || 0) - r) * 100) / 100;
        await updateDoc(doc(db, "payments", c.paymentId), {
          items, totalTTC: nouveauTotal,
          ...(typeof p.sepaRestant === "number" ? { sepaRestant: Math.max(0, Math.round((p.sepaRestant - r) * 100) / 100) } : {}),
          ...(c.enSepa ? { prenotificationSepa: "a_verifier" } : {}),
          updatedAt: serverTimestamp(),
        });
      }
      // 3. Séances de l'arrêt : absent « arrêt médical » (pas de rattrapage au montoir).
      for (const s of seances) {
        const snap = await getDoc(doc(db, "creneaux", s.id));
        if (!snap.exists()) continue;
        const enrolled = ((snap.data() as any).enrolled || []).map((e: any) =>
          e.childId === forfait.childId ? { ...e, presence: "absent", arretMedical: true, absenceMotif: "Arrêt médical" } : e);
        await updateDoc(doc(db, "creneaux", s.id), { enrolled });
      }
      // 4. Trace sur la fiche forfait.
      await updateDoc(doc(db, "forfaits", forfait.id), {
        arretsMedicaux: arrayUnion({ debut, fin, seances: Number(nbSeances), prixSeance: Number(prixSeance), reduction: plan.reduction, nonImpute: plan.nonImpute, certificat: certificat.trim(), le: new Date().toISOString() }),
        updatedAt: serverTimestamp(),
      });
      const lignes = [`✅ ${fmt(plan.reduction - plan.nonImpute)} retirés des échéances à venir.`];
      if (plan.nonImpute > 0) lignes.push(`⚠️ ${fmt(plan.nonImpute)} n'ont pas d'échéance à venir où se déduire : faites un avoir de ce montant (écran Avoirs).`);
      if (ignores.length) lignes.push(`⚠️ Non modifiés (payés ou remis entre-temps) : ${ignores.join(", ")}. Vérifiez et complétez par un avoir si besoin.`);
      if (plan.commandes.some((c) => c.enSepa)) lignes.push("📧 Le nouvel échéancier est à envoyer à la famille : bandeau « Pré-notification SEPA à vérifier » (Prélèvements SEPA).");
      setResultat(lignes.join("\n"));
      onDone();
    } catch (e: any) {
      console.error(e);
      alert(`Erreur : ${e?.message || e}`);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-blue-800 mb-1">🩺 Arrêt médical — {forfait.childName}</h3>
        <p className="font-body text-xs text-slate-500 mb-4">
          {forfait.activityTitle} {forfait.startTime}. À partir de 3 semaines d'arrêt avec certificat : les séances manquées
          sont retirées des échéances à venir, au prix de la séance. Ce qui est payé, facturé ou déjà remis à la banque ne change pas.
        </p>
        {resultat ? (
          <>
            <pre className="font-body text-sm whitespace-pre-wrap bg-green-50 rounded-lg p-3 mb-4">{resultat}</pre>
            <button type="button" onClick={onClose} className="font-body text-sm bg-blue-500 text-white px-4 py-2 rounded-lg border-none cursor-pointer">Fermer</button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="font-body text-xs text-slate-600">Début de l'arrêt
                <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 mt-1" />
              </label>
              <label className="font-body text-xs text-slate-600">Fin de l'arrêt
                <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 mt-1" />
              </label>
            </div>
            {debut && fin && (
              <p className={`font-body text-xs mb-3 ${jours >= ARRET_MEDICAL_MIN_JOURS ? "text-slate-600" : "text-orange-600"}`}>
                {jours} jours d'arrêt. {seances.length} séance{seances.length > 1 ? "s" : ""} au planning pendant l'arrêt
                {seances.length > 0 && ` : ${seances.map((s) => fmtDate(s.date).slice(0, 5)).join(", ")}`}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="font-body text-xs text-slate-600">Séances à retirer
                <input type="number" min={0} value={nbSeances} onChange={(e) => setNbSeances(e.target.value === "" ? "" : Number(e.target.value))} className="w-full border rounded-lg px-2 py-1.5 mt-1" />
              </label>
              <label className="font-body text-xs text-slate-600">Prix d'une séance (€)
                <input type="number" step="0.01" min={0} value={prixSeance} onChange={(e) => setPrixSeance(e.target.value === "" ? "" : Number(e.target.value))} className="w-full border rounded-lg px-2 py-1.5 mt-1" />
              </label>
            </div>
            <p className="font-body text-[11px] text-slate-500 mb-3">Prix de la séance = part « cours » du forfait (hors adhésion et licence) ÷ {forfait.totalSessions || "?"} séances.</p>
            <label className="font-body text-xs text-slate-600 block mb-3">Certificat médical (date, médecin…)
              <input type="text" value={certificat} onChange={(e) => setCertificat(e.target.value)} placeholder="ex. certificat du Dr X du 30/10/2026" className="w-full border rounded-lg px-2 py-1.5 mt-1" />
            </label>

            {debut && fin && (plan.possible ? (
              <div className="bg-blue-50 rounded-lg p-3 mb-3 font-body text-sm">
                <div className="font-semibold text-blue-800 mb-1">Réduction : {fmt(plan.reduction)}</div>
                {plan.prelevements.map((p) => (
                  <div key={p.id} className="text-xs text-slate-600">Prélèvement du {fmtDate(p.date)} : −{fmt(p.part)} → {fmt(p.nouveauMontant)}</div>
                ))}
                {plan.commandes.filter((c) => !c.enSepa).map((c) => (
                  <div key={c.paymentId} className="text-xs text-slate-600">Échéance {c.echeance ?? ""} : −{fmt(c.reduction)} → {fmt(c.nouveauTotal)}</div>
                ))}
                {plan.nonImpute > 0 && (
                  <div className="text-xs text-orange-700 mt-1">⚠️ {fmt(plan.nonImpute)} sans échéance à venir : à rendre par un avoir (écran Avoirs) après validation.</div>
                )}
              </div>
            ) : (
              <p className="font-body text-sm text-orange-700 bg-orange-50 rounded-lg p-3 mb-3">{plan.raison}</p>
            ))}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="font-body text-sm text-slate-600 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
              <button type="button" onClick={appliquer} disabled={!plan.possible || busy}
                className="font-body text-sm text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
                {busy ? "Enregistrement…" : "Appliquer la réduction"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
