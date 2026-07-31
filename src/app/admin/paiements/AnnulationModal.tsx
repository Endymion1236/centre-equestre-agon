"use client";
import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  MODES_REMBOURSEMENT, repartitionParDefaut, resumeRepartition, validerRepartition,
  type ModeRemboursement,
} from "@/lib/remboursement";

/**
 * Repartition d'une annulation entre avoir et remboursement.
 *
 * Remplace le `confirm()` qui creait un avoir du montant total sans laisser
 * le choix. Les CGV prevoient trois issues distinctes ; le cas « certificat
 * medical » scinde la somme en deux, ce qu'aucun ecran ne permettait.
 *
 * ⚠️ Aucun argent n'est deplace ici. Le remboursement carte se fait dans le
 * back-office Worldline, le virement depuis la banque. On enregistre la
 * decision pour qu'elle apparaisse en comptabilite et au rapprochement.
 */

export type MotifAnnulation = "anticipee" | "certificat" | "tardive";

interface Props {
  familyName: string;
  encaisse: number;
  lignes: string[];
  onClose: () => void;
  onConfirm: (data: {
    avoir: number;
    rembourse: number;
    modeRemboursement: ModeRemboursement;
    motif: MotifAnnulation;
    commentaire: string;
  }) => Promise<void>;
}

const MOTIFS: { id: MotifAnnulation; titre: string; regle: string }[] = [
  { id: "anticipee", titre: "Plus de 3 semaines avant",
    regle: "Remboursement intégral, acompte compris." },
  { id: "certificat", titre: "Certificat médical ou force majeure",
    regle: "Acompte de 30 € en avoir, le reste remboursé." },
  { id: "tardive", titre: "Moins de 3 semaines, sans justificatif",
    regle: "Aucun remboursement." },
];

export default function AnnulationModal({ familyName, encaisse, lignes, onClose, onConfirm }: Props) {
  const [motif, setMotif] = useState<MotifAnnulation>("certificat");
  const [rep, setRep] = useState(() => repartitionParDefaut(encaisse, "certificat"));
  const [mode, setMode] = useState<ModeRemboursement>("cb");
  const [commentaire, setCommentaire] = useState("");
  const [enCours, setEnCours] = useState(false);

  // Changer de motif recalcule la proposition : les montants restent
  // modifiables ensuite, un cas particulier ne doit pas bloquer.
  const choisirMotif = (m: MotifAnnulation) => {
    setMotif(m);
    setRep(repartitionParDefaut(encaisse, m));
  };

  const validation = validerRepartition(rep);
  const aideMode = MODES_REMBOURSEMENT.find((m) => m.id === mode)?.aide;

  const confirmer = async () => {
    if (!validation.valide) return;
    setEnCours(true);
    try {
      await onConfirm({ avoir: rep.avoir, rembourse: rep.rembourse, modeRemboursement: mode, motif, commentaire });
    } finally {
      setEnCours(false);
    }
  };

  const champ = (label: string, valeur: number, set: (v: number) => void) => (
    <div className="flex-1 min-w-[130px]">
      <label className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
      <div className="relative">
        <input
          type="number" step="0.01" min="0" value={valeur}
          onChange={(e) => set(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full pl-3 pr-7 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-slate-400">€</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="font-display text-lg font-bold text-blue-800">Annuler l’inscription</div>
            <div className="font-body text-xs text-slate-500">{familyName} · {encaisse.toFixed(2)} € encaissés</div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 border-none cursor-pointer flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {lignes.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              {lignes.map((l, i) => (
                <div key={i} className="font-body text-xs text-slate-600">• {l}</div>
              ))}
              <div className="font-body text-[10px] text-slate-400 mt-1.5">
                Les cavaliers seront désinscrits.
              </div>
            </div>
          )}

          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Motif
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            {MOTIFS.map((m) => (
              <button key={m.id} type="button" onClick={() => choisirMotif(m.id)}
                className={`text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                  motif === m.id ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 hover:border-blue-200"}`}>
                <div className={`font-body text-sm ${motif === m.id ? "font-bold text-blue-800" : "font-semibold text-slate-700"}`}>
                  {m.titre}
                </div>
                <div className="font-body text-[11px] text-slate-500">{m.regle}</div>
              </button>
            ))}
          </div>

          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Répartition
          </div>
          <div className="flex gap-3 flex-wrap mb-2">
            {champ("Converti en avoir", rep.avoir, (v) => setRep((r) => ({ ...r, avoir: v })))}
            {champ("Remboursé", rep.rembourse, (v) => setRep((r) => ({ ...r, rembourse: v })))}
          </div>

          <div className={`rounded-lg px-3 py-2 mb-4 font-body text-xs ${
            validation.valide ? "bg-green-50 text-green-800 border border-green-100"
                              : "bg-red-50 text-red-700 border border-red-200"}`}>
            {validation.valide ? resumeRepartition(rep) : validation.erreur}
          </div>

          {rep.rembourse > 0 && (
            <>
              <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Moyen de remboursement
              </div>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {MODES_REMBOURSEMENT.map((m) => (
                  <button key={m.id} type="button" onClick={() => setMode(m.id)}
                    className={`px-3 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${
                      mode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="font-body text-[11px] text-amber-800">
                  <strong>Le virement n’est pas effectué par la plateforme.</strong> {aideMode}.
                  On enregistre seulement l’opération pour la comptabilité et le rapprochement bancaire.
                </div>
              </div>
            </>
          )}

          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Commentaire (facultatif)
          </div>
          <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ex : certificat reçu le 12/09"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none" />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-600 font-body text-sm font-semibold border-none cursor-pointer">
            Annuler
          </button>
          <button type="button" onClick={confirmer} disabled={!validation.valide || enCours}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-body text-sm font-bold border-none cursor-pointer disabled:opacity-50">
            {enCours && <Loader2 size={15} className="animate-spin" />}
            Confirmer l’annulation
          </button>
        </div>
      </div>
    </div>
  );
}
