"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { UserMinus, Mail, Phone, Award, Wallet, Star, AlertTriangle, Clock, Loader2 } from "lucide-react";

interface Cavalier {
  childId: string; childName: string; familyId: string; familyName: string;
  statut: string; email: string; phone: string; moniteurs: string[];
  galop: string; anciennete: number; avoirEur: number; fidelite: number;
  avisAnnuel?: { note: number; commentaire: string; recommande?: boolean } | null;
}
interface Data {
  saison: number; prochaine: number; rentree: string; today: string; apresRentree: boolean;
  totalN: number; reinscrits: number; nonReinscritsCount: number; partisCount: number;
  retentionPct: number | null; nonReinscrits: Cavalier[]; partis: Cavalier[];
  diag?: { creneauxSaisonN: number; coursSaisonN: number; inscritsCoursN: number; creneauxSaisonN1: number; coursSaisonN1: number; inscritsCoursN1: number; nbForfaits: number };
}

const STATUT_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  pas_encore: { label: "Pas encore réinscrit", cls: "bg-slate-100 text-slate-600", icon: Clock },
  a_risque: { label: "À risque", cls: "bg-rose-100 text-rose-700", icon: AlertTriangle },
  parti: { label: "Parti en cours", cls: "bg-amber-100 text-amber-700", icon: UserMinus },
};

function CavalierRow({ c, onRelance }: { c: Cavalier; onRelance: (c: Cavalier) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="min-w-[160px]">
        <div className="font-body font-semibold text-slate-800">{c.childName || "—"}</div>
        <div className="font-body text-xs text-slate-400">{c.familyName}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-slate-600">
        {c.galop && <span className="inline-flex items-center gap-1"><Award size={12} className="text-slate-400" />{c.galop}</span>}
        {c.anciennete > 0 && <span>{c.anciennete} saison{c.anciennete > 1 ? "s" : ""}</span>}
        {c.avoirEur > 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><Wallet size={12} />{c.avoirEur.toFixed(2)} €</span>}
        {c.fidelite > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Star size={12} />{c.fidelite} pts</span>}
        {c.avisAnnuel && c.avisAnnuel.note > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.avisAnnuel.note >= 4 ? "bg-emerald-100 text-emerald-700" : c.avisAnnuel.note >= 3 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`} title={c.avisAnnuel.commentaire || ""}>
            Avis année <Star size={11} className="fill-current" />{c.avisAnnuel.note}/5{c.avisAnnuel.recommande === false ? " · ne recommande pas" : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto font-body text-xs">
        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Mail size={12} />{c.email}</a>}
        {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-slate-500"><Phone size={12} />{c.phone}</a>}
        {c.email && (
          <button onClick={() => onRelance(c)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500">
            <Mail size={12} /> Relancer
          </button>
        )}
      </div>
    </div>
  );
}

function RelanceModal({ c, prochaine, user, onClose }: { c: Cavalier; prochaine: number; user: any; onClose: () => void }) {
  const saison = `${prochaine}–${prochaine + 1}`;
  const prenom = (c.childName || "").split(" ")[0] || c.childName || "";
  const [subject, setSubject] = useState(`${prenom} : réinscription pour la saison ${saison} 🐴`);
  const [body, setBody] = useState(
    `Bonjour,\n\nNous espérons que ${prenom} a passé une belle saison à cheval au Centre Équestre d'Agon !\n\n` +
    `Les inscriptions pour la saison ${saison} sont ouvertes, et ce serait un plaisir de retrouver ${prenom} parmi nos cavaliers.\n` +
    (c.avoirEur > 0 ? `\nBonne nouvelle : il vous reste ${c.avoirEur.toFixed(2)} € d'avoir à utiliser pour la réinscription.\n` : "") +
    (c.fidelite > 0 ? `Vous avez également ${c.fidelite} points de fidélité.\n` : "") +
    `\nPour réinscrire ${prenom}, répondez simplement à ce message ou contactez-nous directement.\n\nÀ très bientôt,\nL'équipe du Centre Équestre d'Agon`
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/reinscriptions/relance", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: c.email, subject, body, familyId: c.familyId, childName: c.childName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      if (d.blocked) setMsg({ ok: false, text: d.message || "Envoi bloqué (mode restreint : seuls les admins reçoivent)." });
      else setMsg({ ok: true, text: "Email envoyé ✅" });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || String(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold text-slate-900">Relancer {prenom}</h2>
          <button onClick={onClose} disabled={busy} className="text-slate-400 text-xl leading-none">×</button>
        </div>
        <div className="font-body text-xs text-slate-500 mb-3">Destinataire : <span className="text-slate-700 font-medium">{c.email}</span></div>
        <label className="font-body text-[11px] font-semibold text-slate-500 block mb-1">Objet</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-body text-sm mb-3" />
        <label className="font-body text-[11px] font-semibold text-slate-500 block mb-1">Message (modifiable)</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-body text-sm mb-3 resize-y" />
        {msg && <div className={`rounded-lg p-2 font-body text-xs mb-3 ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>{msg.text}</div>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 bg-white font-body text-xs font-semibold text-slate-600">Fermer</button>
          {!(msg && msg.ok) && (
            <button onClick={send} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white font-body text-xs font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Envoyer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReinscriptionsPage() {
  const { isAdmin, user } = useAuth();
  const [relanceCav, setRelanceCav] = useState<Cavalier | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saison, setSaison] = useState<number | "">("");

  const load = useCallback(async (s?: number) => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const q = s ? `?saison=${s}` : "";
      const res = await fetch(`/api/admin/reinscriptions${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setData(d);
      if (saison === "") setSaison(d.saison);
    } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  }, [user, saison]);

  useEffect(() => { if (isAdmin && user) load(); /* eslint-disable-next-line */ }, [isAdmin, user]);

  // Non-réinscrits groupés par moniteur
  const parMoniteur = useMemo(() => {
    const groups = new Map<string, Cavalier[]>();
    (data?.nonReinscrits || []).forEach(c => {
      const key = c.moniteurs[0] || "Sans moniteur identifié";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (!isAdmin) {
    return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;
  }

  const annees = [];
  const yNow = new Date().getFullYear();
  for (let y = yNow + 1; y >= yNow - 4; y--) annees.push(y);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <UserMinus className="text-rose-500" /> Réinscriptions
        </h1>
        <p className="font-body text-sm text-slate-600">
          Cavaliers d'une saison qui n'ont pas (encore) repris la saison suivante.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="font-body text-sm text-slate-600">Saison de référence :</label>
        <select value={saison} onChange={e => { const s = Number(e.target.value); setSaison(s); load(s); }}
          className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white">
          {annees.map(y => <option key={y} value={y}>{y}–{y + 1}</option>)}
        </select>
        {data && <span className="font-body text-xs text-slate-400">→ comparée à {data.prochaine}–{data.prochaine + 1} (rentrée {new Date(data.rentree).toLocaleDateString("fr-FR")})</span>}
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin text-slate-400 inline" size={28} /></div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 font-body text-sm text-rose-700">{error}</div>
      ) : data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-emerald-700 uppercase tracking-wider mb-1">Rétention</div>
              <div className="font-display text-3xl font-bold text-emerald-600">{data.retentionPct ?? "—"}<span className="text-lg">%</span></div>
              <div className="font-body text-[11px] text-emerald-700/70 mt-1">{data.reinscrits}/{data.totalN} réinscrits</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Non réinscrits</div>
              <div className="font-display text-3xl font-bold text-slate-800">{data.nonReinscritsCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Partis en cours</div>
              <div className="font-display text-3xl font-bold text-amber-600">{data.partisCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Effectif {data.saison}</div>
              <div className="font-display text-3xl font-bold text-slate-800">{data.totalN}</div>
            </div>
          </div>

          {data.diag && (
            <div className="font-body text-[11px] text-slate-400 mb-4">
              Données : {data.diag.coursSaisonN} cours en {data.saison}–{data.saison + 1} ({data.diag.inscritsCoursN} inscrits) ·
              {" "}{data.diag.coursSaisonN1} cours en {data.prochaine}–{data.prochaine + 1} ({data.diag.inscritsCoursN1} inscrits) ·
              {" "}{data.diag.nbForfaits} forfait{data.diag.nbForfaits > 1 ? "s" : ""}
            </div>
          )}

          {!data.apresRentree && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5 font-body text-xs text-blue-800">
              La rentrée {data.prochaine} n'a pas encore eu lieu ({new Date(data.rentree).toLocaleDateString("fr-FR")}) : les non-réinscrits sont marqués « pas encore » — c'est normal à ce stade. Ils passeront « à risque » après la rentrée.
            </div>
          )}

          {/* Non réinscrits par moniteur */}
          {parMoniteur.length === 0 ? (
            <div className="text-center py-8 font-body text-slate-400">Aucun non-réinscrit 🎉</div>
          ) : (
            <div className="space-y-5 mb-8">
              {parMoniteur.map(([mon, list]) => (
                <div key={mon}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-display text-lg font-bold text-slate-800">{mon}</h2>
                    <span className="font-body text-xs text-slate-400">{list.length} cavalier{list.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map(c => (
                      <div key={c.childId} className="relative">
                        <div className="absolute -left-2 top-3">
                          {(() => { const b = STATUT_BADGE[c.statut]; const I = b?.icon; return I ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.cls}`}><I size={10} />{b.label}</span> : null; })()}
                        </div>
                        <div className="pt-5"><CavalierRow c={c} onRelance={setRelanceCav} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Partis en cours de saison */}
          {data.partis.length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-amber-700 mb-2 flex items-center gap-2"><UserMinus size={18} /> Partis en cours de saison {data.saison}</h2>
              <p className="font-body text-xs text-slate-500 mb-2">Forfait annulé avant la fin de la saison — signal différent d'une simple non-réinscription.</p>
              <div className="space-y-2">{data.partis.map(c => <CavalierRow key={c.childId} c={c} onRelance={setRelanceCav} />)}</div>
            </div>
          )}
        </>
      )}

      {relanceCav && data && (
        <RelanceModal c={relanceCav} prochaine={data.prochaine} user={user} onClose={() => setRelanceCav(null)} />
      )}
    </div>
  );
}
