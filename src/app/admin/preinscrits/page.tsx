"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Send, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Ligne { childName: string; activite: string; date: string; horaire: string; annuel: boolean }
interface Famille { familyId: string; familyName: string; email: string; lignes: Ligne[] }

const MESSAGE_DEFAUT = `La rentrée approche et nous voulions faire le point avec vous.

Votre place est bien retenue, mais votre inscription n'est pas encore définitive : il nous manque votre dossier complet (et le mandat de prélèvement si vous avez choisi ce mode de règlement).

Merci de nous recontacter rapidement pour finaliser, afin que nous puissions confirmer la place à votre enfant.`;

export default function PreinscritsPage() {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState<{ nbFamilles: number; nbPlaces: number; sansEmail: number; familles: Famille[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("Votre pré-inscription au centre équestre");
  const [message, setMessage] = useState(MESSAGE_DEFAUT);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<any>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/preinscrits-notifier", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json);
      setSelection(new Set((json.familles || []).filter((f: Famille) => f.email).map((f: Famille) => f.familyId)));
    } catch { /* rien */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const envoyer = async () => {
    if (!user || selection.size === 0) return;
    if (!confirm(`Envoyer ce message à ${selection.size} famille(s) ?`)) return;
    setEnvoi(true); setResultat(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/preinscrits-notifier", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, familyIds: [...selection] }),
      });
      setResultat(await res.json());
    } catch (e: any) {
      setResultat({ error: e?.message || String(e) });
    }
    setEnvoi(false);
  };

  if (!isAdmin) return <div className="p-6 font-body text-slate-600">Accès réservé aux administrateurs.</div>;

  const familles = data?.familles || [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Pré-inscrits</h1>
      <p className="font-body text-sm text-slate-600 mt-1">
        Familles dont une place est retenue sans inscription définitive. Les réponses
        à ce message arriveront dans votre boîte.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-body text-sm disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Actualiser
        </button>
        {data && (
          <span className="font-body text-sm text-slate-500">
            {data.nbFamilles} famille(s) · {data.nbPlaces} place(s)
          </span>
        )}
      </div>

      {data && data.sansEmail > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 font-body text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          {data.sansEmail} famille(s) sans adresse email : à contacter par téléphone.
        </div>
      )}

      {!loading && familles.length === 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center font-body text-slate-500">
          Aucune pré-inscription en cours.
        </div>
      )}

      {familles.length > 0 && (
        <>
          <div className="mt-5 space-y-2">
            {familles.map(f => (
              <label key={f.familyId}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                  f.email ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-70"}`}>
                <input type="checkbox" disabled={!f.email}
                  checked={selection.has(f.familyId)}
                  onChange={e => {
                    const s = new Set(selection);
                    e.target.checked ? s.add(f.familyId) : s.delete(f.familyId);
                    setSelection(s);
                  }}
                  className="mt-1 cursor-pointer" />
                <div className="min-w-0">
                  <div className="font-body font-semibold text-slate-800">{f.familyName || "—"}</div>
                  <div className="font-body text-xs text-slate-500">{f.email || "aucune adresse email"}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.lignes.map((l, i) => (
                      <span key={i} className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 font-body text-[11px] text-indigo-800">
                        {l.childName} · {l.activite}{l.annuel ? " (année)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <label className="font-body text-xs font-semibold text-slate-600">Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-body text-sm" />
            <label className="mt-3 block font-body text-xs font-semibold text-slate-600">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={8}
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-body text-sm" />
            <p className="mt-1 font-body text-[11px] text-slate-400">
              La liste des places retenues est ajoutée automatiquement sous votre message.
            </p>
            <button onClick={envoyer} disabled={envoi || selection.size === 0}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-body text-sm font-bold text-white border-none cursor-pointer hover:bg-indigo-700 disabled:opacity-50">
              {envoi ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Envoyer à {selection.size} famille(s)
            </button>
          </div>
        </>
      )}

      {resultat && (
        <div className={`mt-4 rounded-xl border p-4 font-body text-sm ${
          resultat.error ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {resultat.error ? resultat.error : (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              {resultat.envoyes} envoyé(s)
              {resultat.bloques > 0 && ` · ${resultat.bloques} bloqué(s) par le mode email restreint`}
              {resultat.erreurs > 0 && ` · ${resultat.erreurs} en échec`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
