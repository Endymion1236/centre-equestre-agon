"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, getDocs, addDoc, query, where, orderBy, Timestamp, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Lock, ShieldCheck, Calendar, Printer, AlertTriangle, CheckCircle2, Loader2, Hash,
} from "lucide-react";
import { hashEncaissement, hashCloture } from "@/lib/compta-hash";

interface Cloture {
  id: string;
  date: string; // YYYY-MM-DD
  numero: number;
  totauxParMode: Record<string, number>;
  totalGeneral: number;
  nbOperations: number;
  encaissementIds: string[];
  hash: string;
  previousClotureHash: string | null;
  clotureParUid: string;
  clotureParEmail: string;
  createdAt: any;
}

export default function ClotureJournaliereClient() {
  const { user } = useAuth();
  const { toast } = useToast();
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(todayStr);
  const [historique, setHistorique] = useState<Cloture[]>([]);
  const [dayEnc, setDayEnc] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [date]);

  async function fetchAll() {
    setLoading(true);
    try {
      // 1. Encaissements de la journée
      const debutJour = new Date(`${date}T00:00:00`);
      const finJour = new Date(`${date}T23:59:59.999`);
      const qEnc = query(
        collection(db, "encaissements"),
        where("date", ">=", Timestamp.fromDate(debutJour)),
        where("date", "<=", Timestamp.fromDate(finJour)),
        orderBy("date", "asc")
      );
      const snap = await getDocs(qEnc);
      setDayEnc(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      // 2. Historique des clôtures (dernières 50, pour stats)
      const qHist = query(
        collection(db, "cloturesJournalieres"),
        orderBy("numero", "desc"),
        limit(50)
      );
      const histSnap = await getDocs(qHist);
      setHistorique(histSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      console.error("Erreur chargement clôture:", e);
      toast("Erreur chargement.", "error");
    } finally {
      setLoading(false);
    }
  }

  // Clôture déjà faite pour ce jour ?
  const clotureExistante = useMemo(
    () => historique.find(c => c.date === date),
    [historique, date]
  );

  // Totaux par mode pour le jour
  const totauxParMode = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of dayEnc) {
      const mode = e.mode || "inconnu";
      t[mode] = (t[mode] || 0) + Number(e.montant || 0);
    }
    // Arrondir chaque total
    Object.keys(t).forEach(k => { t[k] = Math.round(t[k] * 100) / 100; });
    return t;
  }, [dayEnc]);

  const totalGeneral = useMemo(
    () => Math.round(Object.values(totauxParMode).reduce((s, v) => s + v, 0) * 100) / 100,
    [totauxParMode]
  );

  const MODE_LABELS: Record<string, string> = {
    cb_terminal: "CB terminal",
    cb_online: "CB en ligne",
    cheque: "Chèque",
    cheque_differe: "Chèque différé",
    especes: "Espèces",
    virement: "Virement",
    prelevement_sepa: "Prélèvement SEPA",
    avoir: "Avoir",
    offert: "Offert",
    inconnu: "Inconnu",
  };

  async function handleCloturer() {
    if (clotureExistante) {
      toast("La clôture de ce jour est déjà effectuée.", "warning");
      return;
    }
    if (dayEnc.length === 0) {
      if (!confirm("Aucun encaissement ce jour. Effectuer quand même une clôture à zéro ?")) return;
    }
    if (!confirm(
      `Vous allez clôturer définitivement la journée du ${new Date(date).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long", year:"numeric"})}.\n\n` +
      `${dayEnc.length} opération(s) — Total : ${totalGeneral.toFixed(2)}€\n\n` +
      `Cette action est IRRÉVERSIBLE. Confirmer ?`
    )) return;

    setClosing(true);
    try {
      // 1. Numéro de clôture séquentiel
      const prevNum = historique.length > 0 ? Math.max(...historique.map(c => c.numero)) : 0;
      const numero = prevNum + 1;

      // 2. Hash de chaque encaissement du jour (pour blindage)
      const encaissementHashes: string[] = [];
      for (const enc of dayEnc) {
        const dt: Date = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : new Date();
        const h = await hashEncaissement({
          paymentId: enc.paymentId,
          familyId: enc.familyId,
          familyName: enc.familyName,
          montant: Number(enc.montant || 0),
          mode: enc.mode,
          modeLabel: enc.modeLabel,
          ref: enc.ref,
          activityTitle: enc.activityTitle,
          raison: enc.raison,
          correctionDe: enc.correctionDe,
          dateIso: dt.toISOString(),
        });
        encaissementHashes.push(h);
      }

      // 3. Hash de la clôture, chaîné à la précédente
      const previousClotureHash = historique.length > 0 ? historique[0].hash : null;
      const clotureHash = await hashCloture({
        date,
        numero,
        encaissementHashes,
        totauxParMode,
        totalGeneral,
        previousClotureHash: previousClotureHash || undefined,
      });

      // 4. Écriture en base
      await addDoc(collection(db, "cloturesJournalieres"), {
        date,
        numero,
        totauxParMode,
        totalGeneral,
        nbOperations: dayEnc.length,
        encaissementIds: dayEnc.map(e => e.id),
        encaissementHashes,
        hash: clotureHash,
        previousClotureHash,
        clotureParUid: user?.uid || "",
        clotureParEmail: user?.email || "",
        createdAt: serverTimestamp(),
      });

      toast(`✅ Clôture Z${String(numero).padStart(4, "0")} scellée`, "success");
      await fetchAll();
    } catch (e) {
      console.error(e);
      toast("Erreur lors de la clôture.", "error");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 print:p-0">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Lock size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Clôture journalière</h1>
            <p className="font-body text-sm text-slate-500">Sceller les encaissements du jour avec un hash cryptographique.</p>
          </div>
        </div>
        <Link href="/admin/comptabilite"
          className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
          ← Comptabilité
        </Link>
      </div>

      {/* Bandeau légal */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <ShieldCheck size={16} className="text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="font-body text-xs text-purple-900">
          <strong>Clôture journalière (Z de caisse)</strong> — Une fois clôturée, la journée est
          scellée définitivement par un hash SHA-256. Ce hash intègre tous les encaissements du
          jour ET celui de la clôture précédente (chaînage inaltérable). Toute tentative de
          modification d'un encaissement invalidera la chaîne, ce qui sera détectable.
        </div>
      </div>

      {/* Sélecteur de date */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-500" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayStr}
              className="font-body text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            {clotureExistante ? (
              <Badge color="green">
                <Lock size={11} className="mr-1 inline" />
                Z{String(clotureExistante.numero).padStart(4, "0")} scellée
              </Badge>
            ) : (
              <Badge color="orange">À clôturer</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Détail du jour */}
      <Card padding="md" className="mb-4">
        <h2 className="font-display text-base font-bold text-blue-800 mb-3">
          Mouvements du {new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h2>

        {loading ? (
          <div className="py-8 text-center text-slate-400">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" />
            <p className="font-body text-xs">Chargement...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {Object.entries(totauxParMode).map(([mode, montant]) => (
                <div key={mode} className="bg-slate-50 rounded-lg p-3">
                  <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">{MODE_LABELS[mode] || mode}</div>
                  <div className={`font-display text-lg font-bold ${montant < 0 ? "text-red-600" : "text-blue-800"}`}>
                    {montant.toFixed(2)}€
                  </div>
                </div>
              ))}
              {Object.keys(totauxParMode).length === 0 && (
                <div className="col-span-full bg-slate-50 rounded-lg p-6 text-center text-slate-400 font-body text-sm italic">
                  Aucun encaissement ce jour
                </div>
              )}
            </div>

            <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3 border border-blue-100">
              <div className="font-body text-sm font-semibold text-blue-800">
                {dayEnc.length} opération{dayEnc.length > 1 ? "s" : ""}
              </div>
              <div className="font-display text-xl font-bold text-blue-800">
                Total : {totalGeneral.toFixed(2)}€
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Action clôture */}
      {!clotureExistante && !loading && (
        <Card padding="md" className="mb-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-body text-sm font-semibold text-blue-800">Clôturer cette journée</h3>
              <p className="font-body text-xs text-slate-600 mt-1">
                Après clôture, aucune modification rétroactive ne sera plus possible sans laisser
                de trace. Vérifiez que tous les encaissements du jour ont bien été saisis.
              </p>
            </div>
          </div>
          <button
            onClick={handleCloturer}
            disabled={closing || loading || !!clotureExistante}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-body text-sm font-semibold border-none cursor-pointer">
            {closing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {closing ? "Scellage en cours..." : `Clôturer (Z${String((historique[0]?.numero || 0) + 1).padStart(4, "0")})`}
          </button>
        </Card>
      )}

      {/* Détails clôture existante */}
      {clotureExistante && (
        <Card padding="md" className="mb-4 bg-green-50/30 border border-green-200">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-green-600" />
            <h3 className="font-display text-base font-bold text-green-800">
              Clôture Z{String(clotureExistante.numero).padStart(4, "0")} — scellée
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-body">
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5">Nombre d'opérations</div>
              <div className="font-semibold text-blue-800">{clotureExistante.nbOperations}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5">Total</div>
              <div className="font-semibold text-blue-800">{clotureExistante.totalGeneral.toFixed(2)}€</div>
            </div>
            <div className="col-span-2">
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5 flex items-center gap-1">
                <Hash size={10} /> Hash de scellage (SHA-256)
              </div>
              <div className="font-mono text-[10px] bg-white border border-gray-200 rounded px-2 py-1 break-all">
                {clotureExistante.hash}
              </div>
            </div>
            {clotureExistante.previousClotureHash && (
              <div className="col-span-2">
                <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5">Hash clôture précédente (chaînage)</div>
                <div className="font-mono text-[9px] text-slate-500 bg-white border border-gray-100 rounded px-2 py-1 break-all">
                  {clotureExistante.previousClotureHash}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-between">
            <div className="font-body text-[10px] text-slate-600">
              Par {clotureExistante.clotureParEmail}
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 border-none px-3 py-1.5 rounded-lg cursor-pointer">
              <Printer size={12} /> Imprimer le ticket Z
            </button>
          </div>
        </Card>
      )}

      {/* Historique */}
      <Card padding="md">
        <h3 className="font-display text-base font-bold text-blue-800 mb-3">Historique des clôtures</h3>
        {historique.length === 0 ? (
          <p className="font-body text-xs text-slate-400 italic py-2">Aucune clôture enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Z</th>
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-600">Ops</th>
                  <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-600">Total</th>
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Par</th>
                  <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Hash (début)</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => setDate(c.date)}>
                    <td className="px-3 py-2 font-mono font-semibold text-purple-700">Z{String(c.numero).padStart(4, "0")}</td>
                    <td className="px-3 py-2 text-slate-700">{new Date(c.date).toLocaleDateString("fr-FR", {day:"2-digit", month:"2-digit", year:"numeric"})}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{c.nbOperations}</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-800">{c.totalGeneral.toFixed(2)}€</td>
                    <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[160px]">{c.clotureParEmail}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{c.hash.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          aside, nav, header { display: none !important; }
          @page { size: A4 portrait; margin: 1.5cm 1cm; }
        }
      `}</style>
    </div>
  );
}
