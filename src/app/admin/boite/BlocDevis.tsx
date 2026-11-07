"use client";
/**
 * Boîte mail → module devis : devis déjà établis pour l'expéditeur, et devis
 * proposé par l'assistant, ouvert pré-rempli dans le module devis
 * (lib/devis-depuis-mail). Rien n'est créé ici : le devis s'enregistre dans
 * le module, après relecture.
 */
import { FileText } from "lucide-react";
import { lienDevis, type DevisPropose } from "@/lib/devis-depuis-mail";

const STATUTS: Record<string, string> = { draft: "brouillon", sent: "envoyé", accepted: "accepté", refused: "refusé", converted: "transformé en commande" };
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default function BlocDevis({ familyId, devisPropose, devisExistants, sujet }: {
  familyId: string | null;
  devisPropose: DevisPropose | null;
  devisExistants: { id: string; numero: string; status: string; totalTTC: number; date: string | null }[];
  sujet: string;
}) {
  if (!devisPropose && devisExistants.length === 0) return null;
  const ouvrir = () => {
    if (!familyId) return;
    window.open(lienDevis({ familyId, objet: devisPropose?.objet || sujet, lignes: devisPropose?.lignes || [], source: sujet }), "_blank", "noopener");
  };
  const total = (devisPropose?.lignes || []).reduce((t, l) => t + l.qty * l.priceTTC, 0);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5 font-body text-[13px] sm:text-[11px] font-bold uppercase tracking-wide text-amber-700"><FileText size={13} /> Devis</div>
      {devisExistants.length > 0 && (
        <div className="font-body text-xs text-slate-700">
          Déjà établis pour cette famille :{" "}
          {devisExistants.map((d) => (
            <a key={d.id} href="/admin/devis" target="_blank" rel="noopener noreferrer" className="mr-2 underline">
              {d.numero || "devis"} · {eur(d.totalTTC)} · {STATUTS[d.status] || d.status}{d.date ? ` · ${d.date.split("-").reverse().join("/")}` : ""}
            </a>
          ))}
        </div>
      )}
      {devisPropose && (
        <div className="font-body text-xs text-slate-700 space-y-1">
          <div><b>Proposé par l&apos;assistant :</b> {devisPropose.objet}</div>
          <ul className="m-0 pl-4">
            {devisPropose.lignes.map((l, i) => (
              <li key={i}>{l.qty} × {l.label} — {l.aCompleter ? <span className="text-amber-700 font-semibold">prix à compléter</span> : eur(l.priceTTC)}</li>
            ))}
          </ul>
          <div>Total connu : <b>{eur(total)}</b>{devisPropose.lignes.some((l) => l.aCompleter) ? " (hors lignes à compléter)" : ""}</div>
        </div>
      )}
      {familyId ? (
        <button type="button" onClick={ouvrir}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-body text-xs font-semibold text-white hover:bg-amber-600 border-none cursor-pointer">
          <FileText size={12} /> {devisPropose ? "Ouvrir ce devis dans le module Devis" : "Préparer un nouveau devis"}
        </button>
      ) : (
        <p className="font-body text-[11px] text-amber-800">Créez d&apos;abord la fiche de cette famille (bloc violet) : un devis est toujours rattaché à une fiche.</p>
      )}
      <p className="font-body text-[11px] text-slate-500">Le devis s&apos;ouvre pré-rempli dans un nouvel onglet ; relisez, complétez les prix, puis enregistrez et envoyez-le depuis le module Devis.</p>
    </div>
  );
}
