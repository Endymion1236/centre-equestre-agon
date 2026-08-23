"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { BookUser, Loader2, Printer } from "lucide-react";
import type { Salarie } from "../types";

/**
 * Registre unique du personnel — document imprimable.
 *
 * Obligation légale (art. L1221-13 du Code du travail) : tout employeur tient
 * un registre des salariés dans l'ordre d'embauche, conservé 5 ans après le
 * départ. Les fiches se remplissent dans Équipe → Équipe (bouton registre de
 * chaque salarié) ; cette page les met en forme et s'imprime.
 *
 * Les salariés SORTIS restent au registre : c'est précisément son rôle. Seule
 * la suppression pure d'une fiche l'en retire — à éviter pour quelqu'un qui a
 * réellement travaillé ici.
 */

const dateFr = (iso?: string) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR") : "";

export default function RegistrePersonnelPage() {
  const { isAdmin } = useAuth();
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(query(collection(db, "salaries-management"), orderBy("nom")))
      .then(snap => {
        const liste = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Salarie));
        // Ordre du registre : l'ordre d'EMBAUCHE, pas l'alphabet. Les fiches
        // sans date d'entrée passent en fin, signalées incomplètes.
        liste.sort((a, b) => (a.dateEntree || "9999").localeCompare(b.dateEntree || "9999"));
        setSalaries(liste);
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  const incompletes = salaries.filter(s => !s.dateEntree || !s.typeContrat).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto print:p-0 print:max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <BookUser size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Registre unique du personnel</h1>
            <p className="font-body text-sm text-slate-500">
              Dans l&apos;ordre d&apos;embauche. Les fiches se complètent dans Équipe → Équipe.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/management"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Équipe
          </Link>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none px-3 py-2 rounded-lg cursor-pointer">
            <Printer size={14} /> Imprimer / PDF
          </button>
        </div>
      </div>

      {incompletes > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-body text-sm text-amber-800 print:hidden">
          {incompletes} fiche(s) sans date d&apos;entrée ou sans type de contrat — à compléter dans
          Équipe → Équipe (bouton registre) avant d&apos;imprimer un registre opposable.
        </div>
      )}

      {/* En-tête imprimé */}
      <div className="hidden print:block mb-4">
        <h1 style={{ fontFamily: "sans-serif", fontSize: 18, fontWeight: 800, color: "#1e3a5f", margin: 0 }}>
          Registre unique du personnel
        </h1>
        <p style={{ fontFamily: "sans-serif", fontSize: 10, color: "#475569", margin: "2px 0 0" }}>
          EARL Centre Équestre Poney Club d&apos;Agon-Coutainville — SIRET 507 569 184 00017 —
          édité le {new Date().toLocaleDateString("fr-FR")} (art. L1221-13 du Code du travail)
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto print:border-gray-400">
          <table className="w-full border-collapse font-body text-sm">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200 print:bg-white">
                {["Nom", "Prénom", "Emploi", "Contrat", "Heures/sem.", "Entrée", "Sortie"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salaries.map(s => (
                <tr key={s.id} className={`border-b border-gray-100 ${s.dateSortie ? "text-slate-400" : "text-slate-700"}`}>
                  <td className="px-3 py-2 font-semibold uppercase">{s.nomFamille || s.nom}</td>
                  <td className="px-3 py-2">{s.prenom || ""}</td>
                  <td className="px-3 py-2">{s.emploi || ""}</td>
                  <td className="px-3 py-2">{s.typeContrat || <span className="text-amber-600 print:text-black">à compléter</span>}</td>
                  <td className="px-3 py-2">{s.heuresContratSemaine != null ? `${s.heuresContratSemaine} h` : ""}</td>
                  <td className="px-3 py-2">{dateFr(s.dateEntree) || <span className="text-amber-600 print:text-black">à compléter</span>}</td>
                  <td className="px-3 py-2">{dateFr(s.dateSortie)}</td>
                </tr>
              ))}
              {salaries.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400 italic">Aucun salarié.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-body text-[11px] text-slate-400 mt-3 print:text-gray-600">
        Registre conservé 5 ans à compter du départ de chaque salarié. Un salarié sorti reste inscrit.
      </p>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          aside, nav, header { display: none !important; }
          @page { size: A4 landscape; margin: 1.2cm; }
        }
      `}</style>
    </div>
  );
}
