"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock, Mail, Trash2,
} from "lucide-react";

interface Place {
  creneauId: string;
  date: string;
  startTime: string;
  endTime: string;
  activityTitle: string;
  pending: boolean;
}
interface Impaye {
  paymentId: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  totalTTC: number;
  status: string;
  source: string;
  creeLe: string | null;
  enfants: string[];
  activites: string[];
  places: Place[];
  toutesTenues: boolean;
  declaration: { mode: string; declareLe: string | null } | null;
}

const LIBELLE_MODE: Record<string, string> = {
  cheque: "chèque", especes: "espèces", virement: "virement",
  ancv: "chèques vacances", avoir: "avoir",
};

function jolieDate(d: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return d || "—";
  const [a, m, j] = d.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

export default function InscriptionsImpayeesPage() {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState<{ nb: number; montantTotal: number; impayes: Impaye[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liberation, setLiberation] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/inscriptions-impayees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erreur");
      setData(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const liberer = async (imp: Impaye) => {
    if (!user) return;
    const ok = confirm(
      `Libérer les places de ${imp.familyName || "cette famille"} ?\n\n` +
      `${imp.enfants.join(", ")}\n` +
      `${imp.places.length} place(s) sur : ${imp.activites.join(", ")}\n\n` +
      `Le cavalier sera retiré du planning. Le paiement (${imp.totalTTC.toFixed(2)} €, jamais encaissé) ` +
      `passera en annulé mais restera consultable.`
    );
    if (!ok) return;
    setLiberation(imp.paymentId);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/inscriptions-impayees", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: imp.paymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erreur");
      await load();
    } catch (e: any) {
      alert(`Échec : ${e?.message || e}`);
    }
    setLiberation("");
  };

  if (!isAdmin) {
    return <div className="p-6 font-body text-slate-600">Accès réservé aux administrateurs.</div>;
  }

  const declares = (data?.impayes || []).filter(i => i.declaration);
  const abandons = (data?.impayes || []).filter(i => !i.declaration);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Inscriptions non payées</h1>
      <p className="font-body text-sm text-slate-600 mt-1">
        Cavaliers occupant une place sur un créneau à venir sans qu&apos;un seul euro
        ait été encaissé. Typiquement, un paiement abandonné en cours de route.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-body text-sm disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Actualiser
        </button>
        {data && (
          <span className="font-body text-sm text-slate-500">
            {abandons.length} abandon{abandons.length > 1 ? "s" : ""}
            {declares.length > 0 && ` · ${declares.length} règlement${declares.length > 1 ? "s" : ""} déclaré${declares.length > 1 ? "s" : ""}`}
            {" · "}{data.montantTotal.toFixed(2)} € non encaissés
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 font-body text-sm text-rose-700">{error}</div>
      )}

      {loading && !data && (
        <div className="mt-8 flex items-center gap-2 font-body text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Analyse en cours…
        </div>
      )}

      {data && abandons.length === 0 && declares.length === 0 && (
        <div className="mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 font-body text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={18} /> Aucune place occupée sans paiement.
        </div>
      )}

      {/* Déclarations en attente : dossiers à encaisser, pas à libérer */}
      {declares.length > 0 && (
        <div className="mt-5">
          <h2 className="font-display text-lg font-bold text-slate-800">
            Règlements déclarés, en attente de réception
          </h2>
          <p className="font-body text-xs text-slate-500 mt-0.5">
            Ces familles se sont engagées à régler sur place. Leur place est ferme —
            confirmez la réception dans Paiements › Déclarations.
          </p>
          <div className="mt-3 space-y-2">
            {declares.map(imp => (
              <div key={imp.paymentId} className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-body font-semibold text-slate-800">
                    {imp.familyName || "—"}
                  </span>
                  <span className="font-body text-sm text-slate-600">{imp.enfants.join(", ")}</span>
                  <span className="font-body text-xs px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-semibold">
                    {LIBELLE_MODE[imp.declaration!.mode] || imp.declaration!.mode || "règlement différé"}
                  </span>
                  <span className="ml-auto font-body text-sm font-bold text-sky-900">
                    {imp.totalTTC.toFixed(2)} €
                  </span>
                </div>
                <div className="mt-1 font-body text-xs text-slate-500">
                  déclaré le {imp.declaration!.declareLe ? jolieDate(imp.declaration!.declareLe) : "—"}
                  {" · "}{imp.activites.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {abandons.length > 0 && (
        <h2 className="mt-6 font-display text-lg font-bold text-slate-800">
          Paiements abandonnés
        </h2>
      )}
      <div className="mt-3 space-y-3">
        {abandons.map(imp => (
          <div key={imp.paymentId} className="rounded-xl border border-amber-300 bg-amber-50/50 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display font-bold text-slate-800">
                {imp.familyName || "— famille sans nom —"}
              </span>
              <span className="font-body text-sm text-slate-600">{imp.enfants.join(", ")}</span>
              <span className="ml-auto font-body text-sm font-bold text-amber-800">
                {imp.totalTTC.toFixed(2)} € dus
              </span>
            </div>

            <div className="mt-1 font-body text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              {imp.familyEmail && (
                <span className="inline-flex items-center gap-1"><Mail size={11} />{imp.familyEmail}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />créé le {imp.creeLe ? jolieDate(imp.creeLe) : "—"}
              </span>
              <span>statut « {imp.status} » · {imp.source || "?"}</span>
            </div>

            {imp.toutesTenues && (
              <div className="mt-2 font-body text-xs text-slate-600 bg-white/70 border border-slate-200 rounded-lg px-2.5 py-1.5">
                Place tenue par le mécanisme actuel : elle se libérera toute seule si le
                paiement n&apos;aboutit pas. Inutile d&apos;intervenir.
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {imp.places.map(pl => (
                <span key={pl.creneauId}
                  className="rounded-md bg-white border border-amber-200 px-2 py-1 font-body text-xs text-slate-700">
                  <span className="font-semibold">{pl.activityTitle}</span>{" "}
                  {jolieDate(pl.date)} · {pl.startTime}–{pl.endTime}
                  {pl.pending && <span className="ml-1 text-slate-400">(tenue)</span>}
                </span>
              ))}
            </div>

            <button type="button" onClick={() => liberer(imp)} disabled={liberation === imp.paymentId}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-body text-xs font-semibold border-none cursor-pointer disabled:opacity-50">
              {liberation === imp.paymentId
                ? <Loader2 size={13} className="animate-spin" />
                : <Trash2 size={13} />}
              Libérer {imp.places.length} place{imp.places.length > 1 ? "s" : ""}
            </button>
          </div>
        ))}
      </div>

      {abandons.length > 0 && (
        <div className="mt-5 p-3 rounded-lg bg-slate-50 border border-slate-200 font-body text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-slate-400" />
          <span>
            Avant de libérer, vérifiez qu&apos;il ne s&apos;agit pas d&apos;une famille qui
            comptait régler sur place. Libérer retire le cavalier du planning — c&apos;est
            réversible en le réinscrivant, mais il ne sera pas prévenu.
          </span>
        </div>
      )}
    </div>
  );
}
