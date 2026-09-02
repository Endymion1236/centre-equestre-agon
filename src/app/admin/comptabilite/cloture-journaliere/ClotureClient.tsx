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
import {
  MODE_LABELS,
  calculerSyntheseCloture,
  cloturePourDate,
  cloturePrecedente,
  numeroZ,
  prochainNumeroCloture,
} from "./cloture-utils";

interface Cloture {
  id: string;
  date: string;
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

  const clotureExistante = useMemo(
    () => cloturePourDate(historique, date),
    [historique, date]
  );
  const prochainNumero = useMemo(() => prochainNumeroCloture(historique), [historique]);
  const precedente = useMemo(() => cloturePrecedente(historique), [historique]);
  const {
    recettesDuJour,
    mouvementsTresorerie,
    totalTresorerie,
    totauxParMode,
    totalGeneral,
  } = useMemo(() => calculerSyntheseCloture(dayEnc), [dayEnc]);

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
      `${recettesDuJour.length} recette(s) — Total : ${totalGeneral.toFixed(2)}€\n` +
      (mouvementsTresorerie.length > 0
        ? `${mouvementsTresorerie.length} mouvement(s) de trésorerie (apport / versement) : ${totalTresorerie >= 0 ? "+" : ""}${totalTresorerie.toFixed(2)}€ — hors recettes\n`
        : "") +
      `\n` +
      `Cette action est IRRÉVERSIBLE. Confirmer ?`
    )) return;

    setClosing(true);
    try {
      const numero = prochainNumero;

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

      const previousClotureHash = precedente?.hash || null;
      const clotureHash = await hashCloture({
        date,
        numero,
        encaissementHashes,
        totauxParMode,
        totalGeneral,
        previousClotureHash: previousClotureHash || undefined,
      });

      await addDoc(collection(db, "cloturesJournalieres"), {
        date,
        numero,
        totauxParMode,
        totalGeneral,
        nbOperations: recettesDuJour.length,
        nbMouvementsTresorerie: mouvementsTresorerie.length,
        totalTresorerie,
        encaissementIds: dayEnc.map(e => e.id),
        encaissementHashes,
        hash: clotureHash,
        previousClotureHash,
        clotureParUid: user?.uid || "",
        clotureParEmail: user?.email || "",
        createdAt: serverTimestamp(),
      });

      toast(`✅ Clôture ${numeroZ(numero)} scellée`, "success");
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

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <ShieldCheck size={16} className="text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="font-body text-xs text-purple-900">
          <strong>Clôture journalière (Z de caisse)</strong> — Une fois clôturée, la journée est
          scellée définitivement par un hash SHA-256. Ce hash intègre tous les encaissements du
          jour ET celui de la clôture précédente (chaînage inaltérable). Toute tentative de
          modification d&apos;un encaissement invalidera la chaîne, ce qui sera détectable.
        </div>
      </div>

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
                {numeroZ(clotureExistante.numero)} scellée
              </Badge>
            ) : (
              <Badge color="orange">À clôturer</Badge>
            )}
          </div>
        </div>
      </Card>

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
                {recettesDuJour.length} recette{recettesDuJour.length > 1 ? "s" : ""}
              </div>
              <div className="font-display text-xl font-bold text-blue-800">
                Total : {totalGeneral.toFixed(2)}€
              </div>
            </div>

            {mouvementsTresorerie.length > 0 && (
              <div className="mt-2 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="font-body text-xs font-semibold text-amber-800">
                    {mouvementsTresorerie.length} mouvement{mouvementsTresorerie.length > 1 ? "s" : ""} de
                    trésorerie — hors recettes
                  </div>
                  <div className="font-body text-sm font-bold text-amber-800">
                    {totalTresorerie >= 0 ? "+" : ""}{totalTresorerie.toFixed(2)}€
                  </div>
                </div>
                <div className="font-body text-[11px] text-amber-700 mt-1">
                  Apport de fonds de caisse ou versement en banque : l&apos;argent se déplace, il n&apos;est
                  pas gagné. Ces écritures sont scellées avec la journée mais ne figurent pas au total Z.
                </div>
              </div>
            )}
          </>
        )}
      </Card>

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
          <button type="button"
            onClick={handleCloturer}
            disabled={closing || loading || !!clotureExistante}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-body text-sm font-semibold border-none cursor-pointer">
            {closing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {closing ? "Scellage en cours..." : `Clôturer (${numeroZ(prochainNumero)})`}
          </button>
        </Card>
      )}

      {clotureExistante && (
        <Card padding="md" className="mb-4 bg-green-50/30 border border-green-200">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-green-600" />
            <h3 className="font-display text-base font-bold text-green-800">
              Clôture {numeroZ(clotureExistante.numero)} — scellée
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-body">
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5">Nombre d&apos;opérations</div>
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
            <button type="button" onClick={() => window.print()}
              className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 border-none px-3 py-1.5 rounded-lg cursor-pointer">
              <Printer size={12} /> Imprimer le ticket Z
            </button>
          </div>
        </Card>
      )}

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
                    <td className="px-3 py-2 font-mono font-semibold text-purple-700">{numeroZ(c.numero)}</td>
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
