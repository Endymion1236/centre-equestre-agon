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

interface Apercu {
  id: number;
  piece: { fournisseur: string; numero: string; date: string; ht: number | null; tva: number | null; ttc: number | null; devise?: string };
  alertes: string[];
  compteFournisseur: { compte: string; libelle: string; collectif: boolean };
  compteCharge: { compte: string; libelle: string; note?: string };
  debits: { id: string; fournisseur: string; montant: number; dateOperation?: string; raisons: string[] }[];
  dejaLa: boolean;
}

interface EtatRole { role: RoleSuperPdp; configure: boolean; ok?: boolean; entreprise?: string; mode?: string; erreur?: string; reception?: { ok: boolean; raison?: string } }

const LIBELLE: Record<RoleSuperPdp, string> = { club: "Le club", fournisseur: "Le fournisseur d'essai (bac à sable)" };
const eur = (n: number | null) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

export default function SuperPdpPage() {
  const [etat, setEtat] = useState<EtatRole[] | null>(null);
  const [factures, setFactures] = useState<FactureResumee[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [apercus, setApercus] = useState<Apercu[] | null>(null);

  const voirApercu = async () => {
    setBusy("apercu"); setMessage("");
    try {
      const r = await (await authFetch("/api/admin/superpdp?action=apercu-depenses")).json();
      if (r.error) setMessage(`❌ ${r.error}`); else setApercus(r.apercus || []);
    } catch (err: any) { setMessage(`❌ ${err?.message || "Erreur"}`); }
    setBusy("");
  };

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
  const reception = etat?.find(r => r.role === "club")?.reception;
  const production = etat?.find(r => r.role === "club")?.mode === "production";

  const importer = async () => {
    setBusy("importer"); setMessage("");
    try {
      const r = await (await authFetch("/api/admin/superpdp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "importer" }) })).json();
      if (!r.ok) setMessage(`❌ ${r.raison || r.error || "Import impossible"}`);
      else setMessage([
        r.importees.length ? `✅ ${r.importees.length} facture(s) ajoutée(s) aux pièces de Dépenses : ${r.importees.join(" · ")}` : "✅ Rien de nouveau : toutes les factures reçues sont déjà dans Dépenses.",
        r.restantes ? `${r.restantes} autre(s) à importer : relancez.` : "",
        r.erreurs.length ? `⚠️ ${r.erreurs.join(" · ")}` : "",
      ].filter(Boolean).join("\n"));
      void charger();
    } catch (err: any) { setMessage(`❌ ${err?.message || "Erreur"}`); }
    setBusy("");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-blue-800">Plateforme agréée — Super PDP</h1>
        <p className="font-body text-sm text-slate-600 mt-1">{production ? "Compte réel du club." : "Bac à sable : deux entreprises fictives, aucune facture réelle n'est envoyée."}</p>
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

      <section className={`rounded-xl border p-4 space-y-2 ${reception?.ok ? "bg-green-50 border-green-200" : "bg-white border-gray-100"}`}>
        <h2 className="font-body text-sm font-bold text-slate-700 uppercase tracking-wide">Réception des factures fournisseurs (réel)</h2>
        {!etat ? null : reception?.ok ? (
          <>
            <p className="font-body text-sm text-green-800">Compte de production du club branché. Chaque matin, les factures reçues entrent toutes seules dans les pièces de Dépenses (montants lus dans la facture électronique, sans IA) ; « Rapprocher automatiquement les pièces » les rattache ensuite aux débits du relevé.</p>
            <button type="button" onClick={() => void importer()} disabled={!!busy} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-green-700 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
              {busy === "importer" ? <Loader2 size={14} className="animate-spin" /> : null} Importer maintenant les factures reçues
            </button>
          </>
        ) : (
          <p className="font-body text-sm text-slate-600">Pas encore active : {reception?.raison || "compte du club non connecté."}</p>
        )}
        {message && production && <p className="font-body text-sm whitespace-pre-line">{message}</p>}
      </section>

      {!production && <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
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
      </section>}

      {!production && <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-body text-sm font-bold text-slate-700 uppercase tracking-wide">Factures reçues → Dépenses (aperçu)</h2>
          <button type="button" onClick={() => void voirApercu()} disabled={!!busy || !pret("club")} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-emerald-600 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
            {busy === "apercu" ? <Loader2 size={14} className="animate-spin" /> : null} Voir comment elles arriveraient dans Dépenses
          </button>
        </div>
        <p className="font-body text-xs text-slate-500">Lecture seule : rien n&apos;est enregistré dans vos dépenses. Mêmes règles que pour vos factures réelles (contrôles, compte du fournisseur, compte de charge, débit du relevé).</p>
        {apercus && apercus.length === 0 && <p className="font-body text-sm text-slate-500">Aucune facture reçue pour l&apos;instant.</p>}
        {apercus?.map(a => (
          <div key={a.id} className="rounded-lg border border-gray-200 p-3 font-body text-sm space-y-1">
            <p><b>{a.piece.fournisseur || "Fournisseur ?"}</b> · facture {a.piece.numero || "?"} du {a.piece.date || "?"}</p>
            <p>HT {eur(a.piece.ht)} · TVA {eur(a.piece.tva)} · <b>TTC {eur(a.piece.ttc)}</b> {a.piece.devise && a.piece.devise !== "EUR" ? `(${a.piece.devise})` : ""} — <span className="text-green-700">lus dans la facture électronique, sans IA</span></p>
            <p>Compte fournisseur : <b>{a.compteFournisseur.compte}</b> {a.compteFournisseur.libelle}{a.compteFournisseur.collectif ? " (fournisseur occasionnel)" : ""}</p>
            <p>Compte de charge : {a.compteCharge.compte ? <><b>{a.compteCharge.compte}</b> {a.compteCharge.libelle}</> : <span className="text-amber-700">à choisir à l&apos;arrivée (catégorie de la dépense){a.compteCharge.note ? ` — ${a.compteCharge.note}` : ""}</span>}</p>
            <p>Débit du relevé : {a.dejaLa ? <span className="text-slate-600">déjà rattachée à un débit</span> : a.debits.length ? a.debits.map(d => `${d.fournisseur} · ${eur(d.montant)} · ${d.dateOperation || "?"} (${d.raisons.join(", ")})`).join(" ; ") : <span className="text-slate-600">aucun débit correspondant trouvé (normal pour une facture fictive)</span>}</p>
            {a.alertes.length > 0 && <p className="text-amber-800">⚠️ {a.alertes.join(" ")}</p>}
          </div>
        ))}
      </section>}

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
