"use client";
/**
 * Essai de la plateforme agréée Super PDP (bac à sable) : connexion,
 * facture d'essai dans les deux sens, factures reçues et envoyées.
 * Burger Queen joue le club, Tricatel un fournisseur ; rien de réel ne part.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import type { FactureResumee, RoleSuperPdp } from "@/lib/superpdp-regles";

interface EtatRole { role: RoleSuperPdp; configure: boolean; ok?: boolean; entreprise?: string; mode?: string; erreur?: string }

const LIBELLE: Record<RoleSuperPdp, string> = { club: "Le club (Burger Queen)", fournisseur: "Le fournisseur (Tricatel)" };
const eur = (n: number | null) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

export default function SuperPdpPage() {
  const [etat, setEtat] = useState<EtatRole[] | null>(null);
  const [factures, setFactures] = useState<FactureResumee[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const charger = async () => {
    setBusy("charger"); setMessage("");
    try {
      const e = await (await authFetch("/api/admin/superpdp?action=etat")).json();
      setEtat(e.roles || []);
      const club = (e.roles || []).find((r: EtatRole) => r.role === "club");
      if (club?.ok) {
        const f = await (await authFetch("/api/admin/superpdp?action=factures&role=club")).json();
        if (f.error) setMessage(f.error); else setFactures(f.factures || []);
      }
    } catch (err: any) { setMessage(err?.message || "Erreur"); }
    setBusy("");
  };
  useEffect(() => { void charger(); }, []);

  const envoyer = async (de: RoleSuperPdp) => {
    setBusy(de); setMessage("");
    try {
      const r = await (await authFetch("/api/admin/superpdp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "envoyer-test", de }) })).json();
      if (r.error) setMessage(`❌ ${r.error}`);
      else {
        setMessage(de === "club" ? "✅ Facture d'essai envoyée par le club. Elle apparaît dans quelques secondes." : "✅ Facture d'essai envoyée par le fournisseur. Elle doit arriver dans les factures reçues du club.");
        setTimeout(() => void charger(), 4000);
      }
    } catch (err: any) { setMessage(`❌ ${err?.message || "Erreur"}`); }
    setBusy("");
  };

  const pret = (role: RoleSuperPdp) => !!etat?.find(r => r.role === role)?.ok;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-blue-800">Plateforme agréée — essai Super PDP</h1>
        <p className="font-body text-sm text-slate-600 mt-1">Bac à sable : deux entreprises fictives, aucune facture réelle n&apos;est envoyée.</p>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-body text-sm font-bold text-slate-700 uppercase tracking-wide">Connexion</h2>
          <button type="button" onClick={() => void charger()} disabled={!!busy} className="flex items-center gap-1.5 font-body text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
            {busy === "charger" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
          </button>
        </div>
        {!etat ? <p className="font-body text-sm text-slate-500">Vérification…</p> : etat.map(r => (
          <p key={r.role} className="font-body text-sm">
            <b>{LIBELLE[r.role]}</b> :{" "}
            {!r.configure ? <span className="text-amber-700">identifiants absents dans Vercel</span>
              : r.ok ? <span className="text-green-700">✅ connecté — {r.entreprise} (mode {r.mode})</span>
              : <span className="text-red-700">❌ {r.erreur}</span>}
          </p>
        ))}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h2 className="font-body text-sm font-bold text-slate-700 uppercase tracking-wide">Essais</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void envoyer("club")} disabled={!!busy || !pret("club")} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-blue-600 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
            {busy === "club" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Le club envoie une facture
          </button>
          <button type="button" onClick={() => void envoyer("fournisseur")} disabled={!!busy || !pret("fournisseur")} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-purple-600 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
            {busy === "fournisseur" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Un fournisseur envoie une facture au club
          </button>
        </div>
        {message && <p className="font-body text-sm">{message}</p>}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <h2 className="font-body text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Factures du club sur la plateforme</h2>
        {!factures ? <p className="font-body text-sm text-slate-500">—</p> : factures.length === 0 ? <p className="font-body text-sm text-slate-500">Aucune facture pour l&apos;instant.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead><tr className="text-left text-slate-500 text-xs"><th className="py-1 pr-3">Sens</th><th className="pr-3">N°</th><th className="pr-3">Date</th><th className="pr-3">Vendeur</th><th className="pr-3">Acheteur</th><th className="pr-3 text-right">TTC</th><th>Statut</th></tr></thead>
              <tbody>{factures.map(f => (
                <tr key={f.id} className="border-t border-gray-50">
                  <td className={`py-1.5 pr-3 font-semibold ${f.sens === "reçue" ? "text-purple-700" : "text-blue-700"}`}>{f.sens}</td>
                  <td className="pr-3">{f.numero}</td><td className="pr-3">{f.date}</td><td className="pr-3">{f.vendeur}</td><td className="pr-3">{f.acheteur}</td>
                  <td className="pr-3 text-right">{eur(f.ttc)}</td><td className="text-slate-600">{f.statut}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
