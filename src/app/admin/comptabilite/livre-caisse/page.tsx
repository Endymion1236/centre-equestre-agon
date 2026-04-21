"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Banknote, Download, ChevronLeft, ChevronRight, Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";

interface EncaissementEspeces {
  id: string;
  date: Date;
  montant: number;
  familyName: string;
  activityTitle: string;
  raison?: string;
  correctionDe?: string;
  ref?: string;
  modeLabel?: string;
  isReversal: boolean; // montant < 0 (contre-passation)
}

export default function LivreCaissePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [encaissements, setEncaissements] = useState<EncaissementEspeces[]>([]);
  const [loading, setLoading] = useState(true);
  const [soldeInitial, setSoldeInitial] = useState<number>(0); // solde reporté du mois précédent

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const debutMois = new Date(year, month, 1, 0, 0, 0, 0);
        const finMois = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // 1. Encaissements espèces du mois
        const qCurrent = query(
          collection(db, "encaissements"),
          where("mode", "==", "especes"),
          where("date", ">=", Timestamp.fromDate(debutMois)),
          where("date", "<=", Timestamp.fromDate(finMois)),
          orderBy("date", "asc")
        );
        const snap = await getDocs(qCurrent);
        const list: EncaissementEspeces[] = snap.docs.map(d => {
          const data = d.data() as any;
          const dt = data.date?.seconds
            ? new Date(data.date.seconds * 1000)
            : new Date();
          const montant = Number(data.montant || 0);
          return {
            id: d.id,
            date: dt,
            montant,
            familyName: data.familyName || "—",
            activityTitle: data.activityTitle || "",
            raison: data.raison,
            correctionDe: data.correctionDe,
            ref: data.ref,
            modeLabel: data.modeLabel,
            isReversal: montant < 0,
          };
        });
        setEncaissements(list);

        // 2. Solde cumulé depuis le début (pour avoir le solde d'ouverture du mois)
        const qHistorique = query(
          collection(db, "encaissements"),
          where("mode", "==", "especes"),
          where("date", "<", Timestamp.fromDate(debutMois)),
        );
        const snapHist = await getDocs(qHistorique);
        const soldeAvant = snapHist.docs.reduce((s, d) => s + Number(d.data().montant || 0), 0);
        setSoldeInitial(Math.round(soldeAvant * 100) / 100);
      } catch (e) {
        console.error("Erreur chargement livre de caisse:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [year, month]);

  // Calculs avec solde cumulé ligne par ligne
  const lignes = useMemo(() => {
    let solde = soldeInitial;
    return encaissements.map(e => {
      solde = Math.round((solde + e.montant) * 100) / 100;
      return { ...e, soldeApres: solde };
    });
  }, [encaissements, soldeInitial]);

  const totalEntrees = useMemo(() =>
    Math.round(encaissements.filter(e => e.montant > 0).reduce((s, e) => s + e.montant, 0) * 100) / 100,
    [encaissements]
  );
  const totalSorties = useMemo(() =>
    Math.round(encaissements.filter(e => e.montant < 0).reduce((s, e) => s + Math.abs(e.montant), 0) * 100) / 100,
    [encaissements]
  );
  const soldeFinal = useMemo(() =>
    lignes.length > 0 ? lignes[lignes.length - 1].soldeApres : soldeInitial,
    [lignes, soldeInitial]
  );

  const monthLabel = new Date(year, month, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const exportPDF = () => {
    // Impression native (le navigateur propose "enregistrer en PDF")
    window.print();
  };

  return (
    <div className="px-4 sm:px-6 py-6 print:p-0">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <Banknote size={20} className="text-green-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Livre de caisse espèces</h1>
            <p className="font-body text-sm text-slate-500">Journal chronologique inaltérable des mouvements d'espèces.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none px-3 py-2 rounded-lg cursor-pointer">
            <Printer size={14} /> Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Bandeau légal (affiché aussi à l'impression) */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2 print:bg-white print:border-gray-300">
        <ShieldCheck size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="font-body text-xs text-amber-800">
          <strong>Livre de caisse conforme à l'art. 286-I-3° bis du CGI</strong> — Les écritures sont inaltérables
          depuis leur enregistrement. Toute correction fait l'objet d'une contre-passation identifiable.
          Ce document est archivé et conservé 6 ans.
        </div>
      </div>

      {/* Navigation mois + stats */}
      <Card padding="md" className="mb-4 print:shadow-none">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={prevMonth} className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <ChevronLeft size={14} />
            </button>
            <div className="font-display text-lg font-bold text-blue-800 capitalize min-w-[180px] text-center">{monthLabel}</div>
            <button onClick={nextMonth} className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="hidden print:block">
            <h2 className="font-display text-xl font-bold text-black capitalize m-0">Période : {monthLabel}</h2>
            <p className="font-body text-xs text-gray-700 m-0">Document généré le {today.toLocaleDateString("fr-FR")} à {today.toLocaleTimeString("fr-FR")}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="gray" className="print:border print:border-gray-400">Solde d'ouverture : <strong className="ml-1">{soldeInitial.toFixed(2)}€</strong></Badge>
            <Badge color="green" className="print:border print:border-gray-400">Entrées : <strong className="ml-1">+{totalEntrees.toFixed(2)}€</strong></Badge>
            <Badge color="orange" className="print:border print:border-gray-400">Sorties : <strong className="ml-1">-{totalSorties.toFixed(2)}€</strong></Badge>
            <Badge color={soldeFinal >= 0 ? "blue" : "red"} className="print:border print:border-gray-400">Solde final : <strong className="ml-1">{soldeFinal.toFixed(2)}€</strong></Badge>
          </div>
        </div>
      </Card>

      {/* Tableau chronologique */}
      <Card padding="sm" className="overflow-x-auto !p-0 print:shadow-none print:border print:border-gray-400">
        <table className="w-full border-collapse font-body text-sm">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200 print:bg-white">
              <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600 w-[110px]">Date & heure</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Libellé</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Famille</th>
              <th className="px-3 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-green-600 w-[100px]">Entrée (+)</th>
              <th className="px-3 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-orange-600 w-[100px]">Sortie (-)</th>
              <th className="px-3 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-blue-600 w-[110px]">Solde</th>
            </tr>
          </thead>
          <tbody>
            {/* Ligne "Solde d'ouverture" */}
            <tr className="bg-blue-50/50 border-b border-gray-100">
              <td className="px-3 py-2 text-slate-500 italic text-xs">1er {monthLabel}</td>
              <td className="px-3 py-2 text-blue-800 font-semibold">Solde d'ouverture</td>
              <td className="px-3 py-2 text-slate-400">—</td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
              <td className="px-3 py-2 text-right font-semibold text-blue-800">{soldeInitial.toFixed(2)}€</td>
            </tr>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400 italic">Chargement...</td></tr>
            ) : lignes.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400 italic">Aucun mouvement d'espèces pour ce mois.</td></tr>
            ) : lignes.map((l) => (
              <tr key={l.id} className={`border-b border-gray-100 hover:bg-slate-50/50 print:hover:bg-white ${l.isReversal ? "bg-red-50/30" : ""}`}>
                <td className="px-3 py-2 text-slate-700 text-xs">
                  {l.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                  <span className="text-slate-400"> {l.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                </td>
                <td className="px-3 py-2 text-slate-800">
                  <div className="font-medium">{l.activityTitle || l.modeLabel || "—"}</div>
                  {l.raison && <div className="text-[11px] text-red-600 italic">{l.raison}</div>}
                  {l.ref && <div className="text-[11px] text-slate-400">Réf : {l.ref}</div>}
                  {l.correctionDe && (
                    <Badge color="red" className="mt-0.5 text-[9px] print:border print:border-red-300">↺ Contre-passation</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 text-xs">{l.familyName}</td>
                <td className="px-3 py-2 text-right text-green-700 font-semibold">
                  {l.montant > 0 ? `+${l.montant.toFixed(2)}€` : ""}
                </td>
                <td className="px-3 py-2 text-right text-orange-700 font-semibold">
                  {l.montant < 0 ? `-${Math.abs(l.montant).toFixed(2)}€` : ""}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-blue-800">{l.soldeApres.toFixed(2)}€</td>
              </tr>
            ))}
            {/* Ligne "Totaux" */}
            {lignes.length > 0 && (
              <tr className="bg-blue-500 text-white font-bold border-t-2 border-blue-700 print:bg-gray-100 print:text-black print:border-t-2 print:border-black">
                <td colSpan={3} className="px-3 py-2.5 text-right uppercase text-xs tracking-wider">Totaux du mois :</td>
                <td className="px-3 py-2.5 text-right">+{totalEntrees.toFixed(2)}€</td>
                <td className="px-3 py-2.5 text-right">-{totalSorties.toFixed(2)}€</td>
                <td className="px-3 py-2.5 text-right">{soldeFinal.toFixed(2)}€</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Pied de page impression */}
      <div className="hidden print:block mt-8 pt-4 border-t border-gray-400">
        <div className="flex justify-between items-start text-xs text-gray-700">
          <div>
            <p className="m-0"><strong>EARL Centre Équestre Poney Club d'Agon-Coutainville</strong></p>
            <p className="m-0">SIRET : 507 569 184 00017 — TVA intra : FR12507569184</p>
            <p className="m-0">56 Charrière du Commerce — 50230 Agon-Coutainville</p>
          </div>
          <div className="text-right">
            <p className="m-0 font-semibold">Signature du gérant :</p>
            <div className="mt-8 border-t border-gray-400 w-40"></div>
            <p className="m-0 text-[10px] text-gray-500 mt-1">Nicolas Richard</p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          aside, nav, header { display: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          @page {
            size: A4 portrait;
            margin: 1.5cm 1cm;
          }
        }
      `}</style>
    </div>
  );
}
