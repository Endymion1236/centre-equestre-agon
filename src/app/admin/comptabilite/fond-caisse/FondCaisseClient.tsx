"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, getDocs, addDoc, query, orderBy, limit, where, Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Banknote, Coins, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, Calculator,
} from "lucide-react";

// Dénominations euro (billets + pièces)
const BILLETS = [500, 200, 100, 50, 20, 10, 5] as const;
const PIECES = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01] as const;

interface FondDeCaisse {
  id: string;
  date: string;
  billets: Record<string, number>;
  pieces: Record<string, number>;
  totalCompte: number;
  soldeTheorique: number;
  ecart: number;
  motifEcart: string;
  par: string;
  createdAt: any;
}

export default function FondCaisseClient() {
  const { user } = useAuth();
  const { toast } = useToast();
  const todayStr = new Date().toISOString().split("T")[0];

  const [billets, setBillets] = useState<Record<number, number>>(
    Object.fromEntries(BILLETS.map(b => [b, 0]))
  );
  const [pieces, setPieces] = useState<Record<number, number>>(
    Object.fromEntries(PIECES.map(p => [p, 0]))
  );
  const [motifEcart, setMotifEcart] = useState("");
  const [soldeTheorique, setSoldeTheorique] = useState<number | null>(null);
  const [historique, setHistorique] = useState<FondDeCaisse[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      // 1. Solde théorique = somme cumulée de tous les encaissements espèces
      //    (toute l'histoire, pas juste le mois)
      const qEnc = query(collection(db, "encaissements"), where("mode", "==", "especes"));
      const encSnap = await getDocs(qEnc);
      const solde = encSnap.docs.reduce((s, d) => s + Number(d.data().montant || 0), 0);
      setSoldeTheorique(Math.round(solde * 100) / 100);

      // 2. Historique des fonds de caisse
      const qH = query(collection(db, "fondsDeCaisse"), orderBy("createdAt", "desc"), limit(30));
      const snap = await getDocs(qH);
      setHistorique(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      console.error(e);
      toast("Erreur de chargement.", "error");
    } finally {
      setLoading(false);
    }
  }

  const totalBillets = useMemo(
    () => BILLETS.reduce((s, b) => s + b * (billets[b] || 0), 0),
    [billets]
  );
  const totalPieces = useMemo(
    () => PIECES.reduce((s, p) => s + p * (pieces[p] || 0), 0),
    [pieces]
  );
  const totalCompte = useMemo(
    () => Math.round((totalBillets + totalPieces) * 100) / 100,
    [totalBillets, totalPieces]
  );
  const ecart = useMemo(
    () => soldeTheorique === null ? 0 : Math.round((totalCompte - soldeTheorique) * 100) / 100,
    [totalCompte, soldeTheorique]
  );

  const hasEcart = Math.abs(ecart) >= 0.01;

  async function handleSave() {
    if (hasEcart && !motifEcart.trim()) {
      toast("Un écart non nul nécessite un motif.", "warning");
      return;
    }
    if (!confirm(
      `Enregistrer le comptage ?\n\n` +
      `Total compté : ${totalCompte.toFixed(2)}€\n` +
      `Solde théorique : ${(soldeTheorique || 0).toFixed(2)}€\n` +
      `Écart : ${ecart >= 0 ? "+" : ""}${ecart.toFixed(2)}€\n\n` +
      `Cette écriture sera scellée définitivement.`
    )) return;

    setSaving(true);
    try {
      await addDoc(collection(db, "fondsDeCaisse"), {
        date: todayStr,
        billets,
        pieces,
        totalBillets,
        totalPieces,
        totalCompte,
        soldeTheorique: soldeTheorique || 0,
        ecart,
        motifEcart: motifEcart.trim(),
        parUid: user?.uid || "",
        par: user?.email || "",
        createdAt: serverTimestamp(),
      });
      toast("✅ Fond de caisse enregistré", "success");
      // Reset
      setBillets(Object.fromEntries(BILLETS.map(b => [b, 0])));
      setPieces(Object.fromEntries(PIECES.map(p => [p, 0])));
      setMotifEcart("");
      await fetchAll();
    } catch (e) {
      console.error(e);
      toast("Erreur.", "error");
    } finally {
      setSaving(false);
    }
  }

  const renderDenom = (val: number, count: number, onChange: (n: number) => void, isCoin: boolean) => (
    <div key={val} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className={`font-mono text-xs font-bold w-12 text-right ${isCoin ? "text-amber-600" : "text-green-700"}`}>
        {val < 1 ? `${(val * 100).toFixed(0)}ct` : `${val}€`}
      </div>
      <span className="text-slate-400 text-sm">×</span>
      <input
        type="number" min={0} step={1}
        value={count || ""}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        placeholder="0"
        className="font-body text-sm px-2 py-1 rounded border border-gray-200 w-20 text-center"
      />
      <span className="text-slate-400 text-xs">=</span>
      <span className="font-semibold text-blue-800 text-sm flex-1 text-right">
        {(val * count).toFixed(2)}€
      </span>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Calculator size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Fond de caisse</h1>
            <p className="font-body text-sm text-slate-500">Comptage physique des espèces et contrôle d'écart.</p>
          </div>
        </div>
        <Link href="/admin/comptabilite"
          className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
          ← Comptabilité
        </Link>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <ShieldCheck size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="font-body text-xs text-amber-900">
          <strong>Contrôle physique de caisse</strong> — Comptez billets et pièces dans le tiroir-caisse.
          Le système compare avec le solde théorique calculé à partir de tous les encaissements espèces.
          Tout écart non nul doit être justifié (arrondi, rendu de monnaie erroné, perte, etc.).
          Chaque comptage est scellé et consultable dans l'historique.
        </div>
      </div>

      {soldeTheorique !== null && (
        <Card padding="md" className="mb-4">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1">Solde théorique attendu (espèces cumulées)</div>
          <div className="font-display text-3xl font-bold text-blue-800">{soldeTheorique.toFixed(2)}€</div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Billets */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Banknote size={16} className="text-green-600" />
            <h2 className="font-display text-base font-bold text-blue-800">Billets</h2>
            <div className="ml-auto font-body text-sm font-semibold text-green-700">{totalBillets.toFixed(2)}€</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {BILLETS.map(b => renderDenom(b, billets[b] || 0, n => setBillets(v => ({ ...v, [b]: n })), false))}
          </div>
        </Card>

        {/* Pièces */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Coins size={16} className="text-amber-600" />
            <h2 className="font-display text-base font-bold text-blue-800">Pièces</h2>
            <div className="ml-auto font-body text-sm font-semibold text-amber-700">{totalPieces.toFixed(2)}€</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {PIECES.map(p => renderDenom(p, pieces[p] || 0, n => setPieces(v => ({ ...v, [p]: n })), true))}
          </div>
        </Card>
      </div>

      {/* Synthèse + bouton */}
      <Card padding="md" className="mb-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="font-body text-[10px] text-blue-600 uppercase tracking-wider mb-1">Total compté</div>
            <div className="font-display text-xl font-bold text-blue-800">{totalCompte.toFixed(2)}€</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="font-body text-[10px] text-slate-600 uppercase tracking-wider mb-1">Théorique</div>
            <div className="font-display text-xl font-bold text-slate-800">{(soldeTheorique || 0).toFixed(2)}€</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${hasEcart ? (ecart > 0 ? "bg-green-50" : "bg-red-50") : "bg-emerald-50"}`}>
            <div className={`font-body text-[10px] uppercase tracking-wider mb-1 ${hasEcart ? (ecart > 0 ? "text-green-700" : "text-red-700") : "text-emerald-700"}`}>
              Écart
            </div>
            <div className={`font-display text-xl font-bold ${hasEcart ? (ecart > 0 ? "text-green-800" : "text-red-800") : "text-emerald-800"}`}>
              {ecart >= 0 ? "+" : ""}{ecart.toFixed(2)}€
            </div>
          </div>
        </div>

        {hasEcart && (
          <div className="mb-3">
            <label className="font-body text-xs font-semibold text-red-700 flex items-center gap-1 mb-1">
              <AlertTriangle size={12} /> Motif de l'écart *
            </label>
            <input
              value={motifEcart} onChange={e => setMotifEcart(e.target.value)}
              placeholder="Ex: rendu de monnaie erroné, arrondi de caisse..."
              className="w-full font-body text-sm px-3 py-2 rounded-lg border border-red-200 bg-red-50/50"
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || loading || soldeTheorique === null}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-body text-sm font-semibold border-none cursor-pointer">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {saving ? "Enregistrement..." : "Valider le comptage"}
        </button>
      </Card>

      {/* Historique */}
      <Card padding="md">
        <h3 className="font-display text-base font-bold text-blue-800 mb-3">Historique des comptages</h3>
        {historique.length === 0 ? (
          <p className="font-body text-xs text-slate-400 italic py-2">Aucun comptage enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-600">Compté</th>
                  <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-600">Théorique</th>
                  <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-600">Écart</th>
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Motif</th>
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Par</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(f => (
                  <tr key={f.id} className="border-b border-gray-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-700">{new Date(f.date).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right text-blue-800">{(f.totalCompte || 0).toFixed(2)}€</td>
                    <td className="px-3 py-2 text-right text-slate-600">{(f.soldeTheorique || 0).toFixed(2)}€</td>
                    <td className={`px-3 py-2 text-right font-semibold ${Math.abs(f.ecart || 0) < 0.01 ? "text-emerald-700" : (f.ecart > 0 ? "text-green-700" : "text-red-700")}`}>
                      {f.ecart >= 0 ? "+" : ""}{(f.ecart || 0).toFixed(2)}€
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 italic truncate max-w-[200px]">{f.motifEcart || "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[160px]">{f.par}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
