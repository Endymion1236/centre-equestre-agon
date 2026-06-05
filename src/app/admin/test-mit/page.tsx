"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, FlaskConical, AlertTriangle, Play, Eye } from "lucide-react";

type Pay = { id: string; familyName?: string; label?: string; totalTTC?: number; paidAmount?: number; cofToken?: string; cofInitialPaymentId?: string; stageDate?: string; status?: string };

export default function TestMitPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Pay[]>([]);
  const [busyId, setBusyId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [resultFor, setResultFor] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "payments"), where("status", "==", "partial"), limit(80)));
        const rows: Pay[] = [];
        snap.forEach(d => {
          const p = d.data() as any;
          const solde = Number(p.totalTTC || 0) - Number(p.paidAmount || 0);
          if (p.cofToken && solde > 0.009) rows.push({ id: d.id, ...p });
        });
        setPayments(rows);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const run = async (p: Pay, dryRun: boolean) => {
    if (!dryRun && !confirm(`Lancer le DÉBIT RÉEL du solde de ${p.familyName || p.id} ?\n\nEn preprod, cela appelle réellement CAWL.`)) return;
    setBusyId(p.id + (dryRun ? "-dry" : "-real"));
    setResult(null); setResultFor(p.id);
    try {
      const res = await authFetch("/api/admin/test-mit-charge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id, dryRun }),
      });
      setResult(await res.json());
    } catch (e: any) { setResult({ error: e?.message || "Erreur réseau" }); }
    finally { setBusyId(""); }
  };

  const solde = (p: Pay) => (Number(p.totalTTC || 0) - Number(p.paidAmount || 0)).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="text-blue-500" size={20} />
        <h1 className="font-display text-2xl font-bold text-blue-800">Test prélèvement du solde (MIT)</h1>
      </div>
      <p className="font-body text-sm text-slate-500 mb-4">
        Pour un paiement de stage dont l'acompte a été payé et tokenisé, simule ou lance le prélèvement automatique du solde (SubsequentPayment / delayedCharge).
      </p>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="font-body text-xs text-amber-800">
          <strong>Simuler</strong> ne débite rien (aperçu de la requête). <strong>Débiter</strong> n'effectue un appel réel que si <code>CAWL_MIT_ENABLED=true</code> et que les identifiants CAWL (preprod sur l'environnement test) sont configurés — sinon le débit reste en simulation côté serveur.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 font-body text-sm"><Loader2 className="animate-spin" size={16} /> Chargement des paiements éligibles…</div>
      ) : payments.length === 0 ? (
        <p className="font-body text-sm text-slate-400 italic">
          Aucun paiement éligible (il faut un stage avec acompte payé + carte tokenisée + solde restant). Fais d'abord un acompte de test sur l'espace cavalier.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between flex-wrap gap-2 bg-sand rounded-lg px-4 py-3">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{p.familyName || "(sans nom)"}</div>
                  <div className="font-body text-xs text-slate-400">
                    {p.label || "Stage"}{p.stageDate ? ` · stage le ${p.stageDate}` : ""} · solde <strong>{solde(p)}€</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => run(p, true)} disabled={!!busyId}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {busyId === p.id + "-dry" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Simuler
                  </button>
                  <button onClick={() => run(p, false)} disabled={!!busyId}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-400 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {busyId === p.id + "-real" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Débiter
                  </button>
                </div>
              </div>
              {resultFor === p.id && result && (
                <pre className="font-mono text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
