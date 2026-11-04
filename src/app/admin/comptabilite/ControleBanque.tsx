"use client";
/**
 * Contrôle de banque du mois : le relevé face au compte 512 du FEC
 * (lib/controle-banque, route api/admin/controle-banque). Lecture seule.
 * Le « solde de banque à valider chaque fin de mois » du cabinet, prêt à
 * copier pour la comptable.
 */
import { useState } from "react";
import { Landmark, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

const eur = (n: number) => `${(Number(n) || 0).toFixed(2).replace(".", ",")} €`;
const dateFr = (iso: string) => String(iso || "").split("-").reverse().join("/");

export function BoutonControleBanque({ period }: { period: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [res, setRes] = useState<any | null>(null);
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState(false);

  const lancer = async () => {
    setOuvert(true); setChargement(true); setErreur(""); setRes(null); setCopie(false);
    try {
      const r = await authFetch(`/api/admin/controle-banque?mois=${period}`);
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) throw new Error(d?.error || `erreur ${r.status}`);
      setRes(d);
    } catch (e: any) { setErreur(e?.message || String(e)); }
    setChargement(false);
  };

  return (
    <>
      <button type="button" onClick={lancer}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-body text-sm font-semibold border border-blue-200 cursor-pointer bg-white text-blue-700 hover:bg-blue-50 mt-2">
        <Landmark size={16} /> Contrôle de banque — {period}
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOuvert(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold text-blue-800">Contrôle de banque — {period}</div>
                <div className="font-body text-xs text-slate-500 mt-1">Chaque mouvement du relevé face à sa ligne de banque (512) dans le FEC du mois.</div>
              </div>
              <button type="button" onClick={() => setOuvert(false)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-4 font-body text-sm text-slate-700">
              {chargement && <div className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Comparaison en cours…</div>}
              {erreur && <div className="text-red-700 bg-red-50 rounded-lg p-3">{erreur}</div>}
              {res && (
                <>
                  {(res.releveImporte?.debits === 0 || res.releveImporte?.credits === 0 || res.tableauIncomplet) && (
                    <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                      {res.releveImporte?.debits === 0 && "Aucun débit du relevé pour ce mois dans Dépenses. "}
                      {res.releveImporte?.credits === 0 && "Aucun crédit du relevé pour ce mois dans le rapprochement. "}
                      {res.tableauIncomplet && "Le tableau des opérations n'a pas pu être lu en entier. "}
                      Importez le relevé complet du mois avant de conclure.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Mouvements du relevé</div><div className="text-lg font-semibold">{eur(res.totalReleve)}</div></div>
                    <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Compte 512 du FEC</div><div className="text-lg font-semibold">{eur(res.totalFec)}</div></div>
                    <div className={`rounded-xl p-3 ${Math.abs(res.ecart) < 0.01 ? "bg-green-50" : "bg-red-50"}`}>
                      <div className="text-xs text-slate-500">Écart (FEC − relevé)</div>
                      <div className={`text-lg font-semibold ${Math.abs(res.ecart) < 0.01 ? "text-green-700" : "text-red-700"}`}>{eur(res.ecart)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {res.apparies} mouvement(s) rapproché(s). {Math.abs(res.ecart) >= 0.01 && (res.ecart > 0
                      ? "Le FEC compte plus d'argent en banque que le relevé : un encaissement en double ou jamais reçu, ou un débit du relevé absent du FEC."
                      : "Le FEC compte moins d'argent en banque que le relevé : une sortie comptée deux fois, ou un crédit du relevé absent du FEC.")}
                  </div>

                  {res.releveSeul?.length > 0 && (
                    <div>
                      <div className="font-semibold text-red-700 mb-1">Au relevé, absent du FEC ({res.releveSeul.length})</div>
                      {res.releveSeul.map((r: any) => (
                        <div key={r.id} className="flex justify-between gap-3 py-1 border-b border-gray-50 text-xs">
                          <span>{dateFr(r.date)} · {r.libelle}{r.note ? <span className="text-amber-700"> — {r.note}</span> : null}</span>
                          <span className="font-semibold whitespace-nowrap">{eur(r.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {res.fecSeul?.length > 0 && (
                    <div>
                      <div className="font-semibold text-red-700 mb-1">Dans le FEC, absent du relevé ({res.fecSeul.length})</div>
                      {res.fecSeul.map((f: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 py-1 border-b border-gray-50 text-xs">
                          <span>{dateFr(f.date)} · {f.journal} n° {f.numero} · {f.libelle}</span>
                          <span className="font-semibold whitespace-nowrap">{eur(f.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {res.decales?.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-600 mb-1">Même montant, dates différentes ({res.decales.length}) — décalage, sans écart d&apos;argent</div>
                      {res.decales.map((x: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 py-1 border-b border-gray-50 text-xs text-slate-600">
                          <span>relevé {dateFr(x.releve.date)} · FEC {dateFr(x.fec.date)} ({x.jours} j) · {x.releve.libelle}</span>
                          <span className="whitespace-nowrap">{eur(x.releve.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!res.releveSeul?.length && !res.fecSeul?.length && Math.abs(res.ecart) < 0.01 && (
                    <div className="text-green-700 bg-green-50 rounded-lg p-3">Le relevé et la banque du FEC concordent pour ce mois.</div>
                  )}
                </>
              )}
            </div>
            {res && (
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button type="button" onClick={() => { navigator.clipboard?.writeText(res.texte || "").then(() => setCopie(true)).catch(() => {}); }}
                  className="font-body text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">{copie ? "Copié ✓" : "Copier pour la comptable"}</button>
                <button type="button" onClick={() => setOuvert(false)} className="font-body text-sm font-semibold text-white bg-blue-800 px-4 py-2 rounded-lg border-none cursor-pointer">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
