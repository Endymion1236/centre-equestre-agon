"use client";

/**
 * Admin › Cohérence — ce qui ne colle pas, sans avoir à le chercher.
 *
 * Les défauts de la journée du 1er septembre 2026 ont tous été découverts par
 * hasard : une famille qui appelle, un écran ouvert au bon moment. Cette page
 * les aurait montrés le matin même. Elle ne corrige rien d'elle-même — sauf
 * une réparation, « replacer au planning », qui rejoue la confirmation des
 * places d'une commande déjà encaissée.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, CalendarCheck, ExternalLink, Receipt } from "lucide-react";
import type { Anomalie, GraviteAnomalie } from "@/lib/coherence";

interface Groupe {
  code: string;
  titre: string;
  gravite: GraviteAnomalie;
  items: Anomalie[];
}

interface Rapport {
  analyseLe: string;
  fenetre: { du: string; au: string };
  examines: Record<string, number>;
  nb: number;
  nbBloquants: number;
  groupes: Groupe[];
}

const COULEURS: Record<GraviteAnomalie, { pastille: string; fond: string; bord: string; texte: string; libelle: string }> = {
  bloquant:  { pastille: "bg-red-500",    fond: "bg-red-50",    bord: "border-red-200",    texte: "text-red-700",    libelle: "À traiter" },
  attention: { pastille: "bg-orange-400", fond: "bg-orange-50", bord: "border-orange-200", texte: "text-orange-700", libelle: "À regarder" },
  info:      { pastille: "bg-slate-300",  fond: "bg-slate-50",  bord: "border-slate-200",  texte: "text-slate-600",  libelle: "Pour information" },
};

export default function CoherencePage() {
  const { isAdmin, user } = useAuth();
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [reparation, setReparation] = useState("");

  const analyser = useCallback(async () => {
    if (!user) return;
    setChargement(true); setErreur("");
    try {
      const res = await authFetch("/api/admin/coherence");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyse impossible");
      setRapport(json);
    } catch (e: any) {
      setErreur(e?.message || String(e));
    }
    setChargement(false);
  }, [user]);

  useEffect(() => { if (isAdmin && user) analyser(); }, [isAdmin, user, analyser]);

  const attribuerNumero = async (paymentId: string) => {
    setReparation(paymentId);
    try {
      const res = await authFetch("/api/admin/attribuer-numero-facture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Échec");
      alert(json?.deja
        ? `Cette commande portait déjà le numéro ${json.invoiceNumber}.`
        : `Numéro de facture attribué : ${json.invoiceNumber}.`);
      await analyser();
    } catch (e: any) {
      alert(`Échec : ${e?.message || e}`);
    }
    setReparation("");
  };

  const replacer = async (paymentId: string) => {
    setReparation(paymentId);
    try {
      const res = await authFetch("/api/admin/confirmer-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Échec");
      alert(
        Number(json?.reinscrites || 0) > 0
          ? `${json.reinscrites} place(s) rétablie(s) au planning.`
          : "Rien à replacer : les cavaliers sont déjà au planning.",
      );
      await analyser();
    } catch (e: any) {
      alert(`Échec : ${e?.message || e}`);
    }
    setReparation("");
  };

  if (!isAdmin) {
    return <div className="p-6 font-body text-slate-600">Accès réservé aux administrateurs.</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Cohérence</h1>
      <p className="font-body text-sm text-slate-600 mt-1 max-w-2xl">
        Ce que l&apos;application peut vérifier seule : de l&apos;argent encaissé sans inscription au
        planning, une commande soldée sans numéro de facture, un journal qui ne dit pas la même
        chose que la commande. Rien n&apos;est corrigé ici sans un geste de votre part.
      </p>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={analyser} disabled={chargement}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-body text-sm disabled:opacity-50 bg-white cursor-pointer">
          {chargement ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Analyser
        </button>
        {rapport && (
          <span className="font-body text-xs text-slate-500">
            {Object.entries(rapport.examines).map(([k, v]) => `${v} ${k}`).join(" · ")} — période {rapport.fenetre.du} → {rapport.fenetre.au}
          </span>
        )}
      </div>

      {erreur && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 font-body text-sm text-red-700 whitespace-pre-line">{erreur}</div>
      )}

      {chargement && !rapport && (
        <div className="mt-10 text-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto" /></div>
      )}

      {rapport && rapport.nb === 0 && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle2 size={28} className="text-green-600 mx-auto mb-2" />
          <p className="font-body text-sm font-semibold text-green-800">Rien à signaler.</p>
          <p className="font-body text-xs text-green-700 mt-1">
            Les commandes, le journal, le planning et les prélèvements disent la même chose.
          </p>
        </div>
      )}

      {rapport && rapport.nb > 0 && (
        <>
          <div className="mt-5 flex items-center gap-2 font-body text-sm">
            <AlertTriangle size={16} className={rapport.nbBloquants > 0 ? "text-red-500" : "text-orange-500"} />
            <span className="font-semibold text-slate-800">
              {rapport.nb} anomalie{rapport.nb > 1 ? "s" : ""}
            </span>
            {rapport.nbBloquants > 0 && (
              <span className="text-red-600">dont {rapport.nbBloquants} à traiter</span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {rapport.groupes.map(groupe => {
              const c = COULEURS[groupe.gravite];
              return (
                <div key={groupe.code} className={`rounded-xl border ${c.bord} ${c.fond} overflow-hidden`}>
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-black/5">
                    <span className={`w-2.5 h-2.5 rounded-full ${c.pastille}`} />
                    <span className={`font-body text-sm font-semibold ${c.texte}`}>{groupe.titre}</span>
                    <span className="font-body text-xs text-slate-500">
                      {groupe.items.length} cas · {c.libelle}
                    </span>
                  </div>
                  <div className="divide-y divide-black/5 bg-white/60">
                    {groupe.items.map((a, i) => (
                      <div key={`${a.code}-${a.paymentId || a.creneauId || i}`}
                        className="px-4 py-2.5 flex items-start justify-between gap-3">
                        <span className="font-body text-xs text-slate-700 flex-1">{a.detail}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {a.action === "replacer-au-planning" && a.paymentId && (
                            <button type="button" onClick={() => replacer(a.paymentId!)}
                              disabled={reparation === a.paymentId}
                              title="Rejouer la confirmation des places de cette commande"
                              className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-white bg-emerald-600 px-2 py-1 rounded-md border-none cursor-pointer hover:bg-emerald-500 disabled:opacity-50">
                              {reparation === a.paymentId
                                ? <Loader2 size={11} className="animate-spin" />
                                : <CalendarCheck size={11} />}
                              Replacer
                            </button>
                          )}
                          {a.action === "attribuer-numero" && a.paymentId && (
                            <button type="button" onClick={() => attribuerNumero(a.paymentId!)}
                              disabled={reparation === a.paymentId}
                              title="Attribuer le prochain numéro de la séquence à cette commande soldée"
                              className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-white bg-blue-600 px-2 py-1 rounded-md border-none cursor-pointer hover:bg-blue-500 disabled:opacity-50">
                              {reparation === a.paymentId
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Receipt size={11} />}
                              Attribuer le numéro
                            </button>
                          )}
                          {a.lien && (
                            <a href={a.lien} title="Ouvrir l'écran concerné"
                              className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md no-underline hover:bg-blue-100">
                              <ExternalLink size={11} /> Ouvrir
                            </a>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
