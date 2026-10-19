"use client";
/**
 * Diagnostic famille — « où est passé le dossier de cette famille ? »
 *
 * Octobre 2026, COSTEGROSSE : le bureau avait tout (inscriptions,
 * règlements), la famille voyait ses cavaliers mais ni inscription ni
 * paiement, et l'écran Doublons ne trouvait rien. Deux fiches, deux adresses
 * différentes : le compte que la famille s'était créé, et la fiche saisie
 * par le bureau. Cet écran cherche par le NOM, montre chaque fiche avec ce
 * qu'elle porte, et rattache la fiche du bureau au compte en un clic
 * (/api/admin/doublons-merge, aperçu puis confirmation).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, GitMerge, KeyRound, Building2, Baby, Mail, Phone, CalendarDays, Receipt, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/components/ui/Toast";

interface Fiche {
  docId: string; parentName: string | null; parentEmail: string | null; parentPhone: string | null;
  authUid: string | null; authProvider: string | null; estCompte: boolean;
  enfants: string[]; nbEnfants: number; status: string | null; mergedInto: string | null;
  commandes: number; commandesVivantes: number; totalCommandes: number; totalRegle: number; inscriptionsAVenir: number;
}
interface Diagnostic {
  fiches: Fiche[];
  inscriptionsPlanning: { creneauId: string; date: string; activite: string; enfant: string; familyId: string; enAttente: boolean }[];
  lecture: Record<string, string | null>;
}

const eur = (n: number) => `${(Math.round((n || 0) * 100) / 100).toFixed(2).replace(".", ",")} €`;
const dateFr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

export default function DiagFamillePage() {
  const params = useSearchParams();
  const { toast } = useToast();
  const [q, setQ] = useState(params.get("q") || "");
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  // Rattachement : fiche conservée (le compte) et fiche absorbée.
  const [fusion, setFusion] = useState<{ keepId: string; mergeId: string } | null>(null);
  const [apercu, setApercu] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const chercher = useCallback(async (texte: string) => {
    const t = texte.trim();
    if (t.length < 2) return;
    setLoading(true); setErreur(""); setDiag(null);
    try {
      const cle = t.includes("@") ? `email=${encodeURIComponent(t.toLowerCase())}` : `q=${encodeURIComponent(t)}`;
      const res = await authFetch(`/api/admin/diag-famille?${cle}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setDiag(d);
    } catch (e: any) { setErreur(e?.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (q) chercher(q); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const lancerFusion = async (dryRun: boolean) => {
    if (!fusion) return;
    setBusy(true);
    try {
      const res = await authFetch("/api/admin/doublons-merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fusion, dryRun, confirm: !dryRun }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      if (dryRun) setApercu(d.apercu);
      else {
        toast("✅ Fiche rattachée au compte : la famille retrouve ses inscriptions et ses paiements dans son espace.", "success", 8000);
        setFusion(null); setApercu(null);
        await chercher(q);
      }
    } catch (e: any) { toast(e?.message || String(e), "error", 8000); }
    finally { setBusy(false); }
  };

  const vivantes = (diag?.fiches || []).filter(f => f.status !== "merged");
  const compte = vivantes.find(f => f.estCompte) || null;
  const nomDe = (id: string) => diag?.fiches.find(f => f.docId === id)?.parentName || id;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-900 mb-1">Diagnostic famille</h1>
      <p className="font-body text-sm text-slate-500 mb-4">
        Une famille ne voit pas ses inscriptions ou ses paiements dans son espace ? Cherchez-la par son <strong>nom</strong> (ou une adresse) :
        l&apos;écran montre toutes ses fiches, ce que chacune porte, et rattache la fiche du bureau à son compte.
      </p>

      <form className="flex gap-2 mb-5" onSubmit={e => { e.preventDefault(); chercher(q); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom de famille, prénom d'un cavalier ou adresse email"
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400" />
        <button type="submit" disabled={loading || q.trim().length < 2}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-body text-sm font-semibold text-white disabled:opacity-50 cursor-pointer border-none">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Chercher
        </button>
      </form>

      {erreur && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 font-body text-sm text-rose-700 mb-4">{erreur}</div>}

      {diag && diag.fiches.length === 0 && (
        <p className="font-body text-sm text-slate-500 italic py-6 text-center">Aucune fiche ne correspond à « {q} ».</p>
      )}

      {diag && Object.values(diag.lecture).some(Boolean) && (
        <div className="space-y-2 mb-4">
          {Object.entries(diag.lecture).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-body text-sm text-amber-900">{v}</div>
          ))}
        </div>
      )}

      {diag && diag.fiches.length > 0 && (
        <div className="space-y-3">
          {diag.fiches.map(f => {
            const absorbee = f.status === "merged";
            const porteLeDossier = f.commandesVivantes > 0 || f.inscriptionsAVenir > 0;
            return (
              <div key={f.docId} className={`rounded-2xl border p-4 bg-white ${absorbee ? "opacity-60 border-slate-200" : f.estCompte ? "border-blue-300" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-body text-base font-bold text-slate-800">{f.parentName || "— sans nom —"}</span>
                  {absorbee ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-body text-[11px] font-semibold text-slate-500">Absorbée{f.mergedInto ? ` par « ${nomDe(f.mergedInto)} »` : ""}</span>
                  ) : f.estCompte ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-body text-[11px] font-semibold text-blue-700"><KeyRound size={11} /> Compte de connexion de la famille</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-body text-[11px] font-semibold text-amber-700"><Building2 size={11} /> Fiche du bureau (sans connexion)</span>
                  )}
                  {porteLeDossier && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-body text-[11px] font-semibold text-emerald-700">Porte le dossier</span>}
                </div>
                <div className="font-body text-xs text-slate-500 flex flex-col gap-0.5">
                  {f.parentEmail && <span className="inline-flex items-center gap-1"><Mail size={11} />{f.parentEmail}</span>}
                  {f.parentPhone && <span className="inline-flex items-center gap-1"><Phone size={11} />{f.parentPhone}</span>}
                  <span className="inline-flex items-center gap-1"><Baby size={11} />{f.enfants.length ? f.enfants.join(", ") : "aucun cavalier"}</span>
                  <span className="inline-flex items-center gap-1"><Receipt size={11} />{f.commandesVivantes} commande{f.commandesVivantes > 1 ? "s" : ""} · {eur(f.totalCommandes)} dont {eur(f.totalRegle)} réglés{f.commandes > f.commandesVivantes ? ` (+${f.commandes - f.commandesVivantes} annulée${f.commandes - f.commandesVivantes > 1 ? "s" : ""})` : ""}</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays size={11} />{f.inscriptionsAVenir} inscription{f.inscriptionsAVenir > 1 ? "s" : ""} à venir au planning</span>
                  <span className="text-[10px] text-slate-400">identifiant {f.docId}{f.authProvider ? ` · connexion ${f.authProvider}` : ""}</span>
                </div>
                {!absorbee && compte && !f.estCompte && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                    <button type="button" onClick={() => { setFusion({ keepId: compte.docId, mergeId: f.docId }); setApercu(null); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-body text-xs font-semibold text-white cursor-pointer border-none hover:bg-blue-500">
                      <GitMerge size={13} /> Rattacher cette fiche au compte « {compte.parentName || compte.docId} »
                    </button>
                  </div>
                )}
                {!absorbee && !compte && vivantes.length > 1 && !porteLeDossier && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                    {vivantes.filter(v => v.docId !== f.docId && (v.commandesVivantes > 0 || v.inscriptionsAVenir > 0)).slice(0, 1).map(v => (
                      <button key={v.docId} type="button" onClick={() => { setFusion({ keepId: v.docId, mergeId: f.docId }); setApercu(null); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-body text-xs font-semibold text-blue-700 cursor-pointer hover:bg-blue-50">
                        <GitMerge size={13} /> Absorber dans « {v.parentName || v.docId} »
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {diag.inscriptionsPlanning.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Inscriptions au planning ({diag.inscriptionsPlanning.length})</div>
              <div className="flex flex-col gap-1">
                {diag.inscriptionsPlanning.slice(0, 40).map((i, k) => (
                  <div key={k} className="font-body text-xs text-slate-600">
                    {dateFr(i.date)} · {i.activite} · <strong>{i.enfant}</strong>{i.enAttente ? " · place tenue" : ""}
                    <span className="text-slate-400"> · fiche « {nomDe(i.familyId)} »</span>
                  </div>
                ))}
                {diag.inscriptionsPlanning.length > 40 && <div className="font-body text-xs text-slate-400">… et {diag.inscriptionsPlanning.length - 40} autres</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {fusion && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setFusion(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-slate-900">Rattacher la fiche au compte</h2>
              <button type="button" onClick={() => setFusion(null)} disabled={busy} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
            </div>
            <p className="font-body text-sm text-slate-600 mb-3">
              « {nomDe(fusion.mergeId)} » sera absorbée par « {nomDe(fusion.keepId)} » : cavaliers, commandes, inscriptions au planning, réservations, cartes, avoirs et mandats passent sur le compte.
              Les encaissements ne bougent pas. La fiche absorbée reste en mémoire, masquée.
            </p>
            {apercu && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 font-body text-xs text-slate-700 space-y-1">
                <div><strong>Cavaliers conservés :</strong> {apercu.enfantsConserves?.join(", ") || "—"}</div>
                {apercu.enfantsFusionnes?.length > 0 && <div><strong>Reconnus comme les mêmes :</strong> {apercu.enfantsFusionnes.map((e: any) => `${e.de} → ${e.vers}`).join(", ")}</div>}
                {apercu.enfantsDeplaces?.length > 0 && <div><strong>Ajoutés au compte :</strong> {apercu.enfantsDeplaces.join(", ")}</div>}
                <div><strong>Documents repointés :</strong> {Object.entries(apercu.reassign || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "aucun"}</div>
                <div><strong>Créneaux touchés :</strong> {apercu.creneauxTouches ?? 0}</div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFusion(null)} disabled={busy} className="font-body text-sm text-slate-600 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer">Annuler</button>
              {!apercu ? (
                <button type="button" onClick={() => lancerFusion(true)} disabled={busy}
                  className="inline-flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-600 rounded-lg px-4 py-2 cursor-pointer border-none disabled:opacity-50">
                  {busy && <Loader2 size={14} className="animate-spin" />} Voir ce qui va bouger
                </button>
              ) : (
                <button type="button" onClick={() => lancerFusion(false)} disabled={busy}
                  className="inline-flex items-center gap-2 font-body text-sm font-semibold text-white bg-emerald-600 rounded-lg px-4 py-2 cursor-pointer border-none disabled:opacity-50">
                  {busy && <Loader2 size={14} className="animate-spin" />} Confirmer le rattachement
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
