"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page admin : Satisfaction
// ─────────────────────────────────────────────────────────────────────────
// Affiche tous les avis de satisfaction laisses par les familles depuis
// l'espace cavalier (collection 'avis-satisfaction'). Note moyenne globale,
// moyenne par aspect, filtres par activite et par note, liste detaillee.

import { useEffect, useState, useMemo, Fragment } from "react";
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Star, MessageSquare, TrendingUp, Filter, Users, Link2, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { bilanParEnseignant, type AvisStage } from "@/lib/satisfaction/types";

const ASPECTS = [
  { id: "moniteur", label: "Moniteur / encadrement" },
  { id: "poneys", label: "Poneys & chevaux" },
  { id: "infrastructures", label: "Infrastructures" },
  { id: "ambiance", label: "Ambiance générale" },
];

interface Avis {
  id: string;
  familyName?: string;
  activityTitle?: string;
  globalNote: number;
  aspects?: Record<string, number>;
  commentaire?: string;
  createdAt?: any;
  // Champs spécifiques aux avis post-stage :
  source?: string;
  stageLabel?: string;
  moniteurs?: Array<{ nom: string; note: number }>;
  recommande?: boolean;
}

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= n ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300"}
        />
      ))}
    </span>
  );
}

export default function SatisfactionPage() {
  const { isAdmin, user } = useAuth();
  const [avis, setAvis] = useState<Avis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActivite, setFilterActivite] = useState<string>("");
  const [filterNote, setFilterNote] = useState<number>(0);
  const [view, setView] = useState<"global" | "enseignant">("global");
  const [filterPeriode, setFilterPeriode] = useState<string>("");
  const [expandedEns, setExpandedEns] = useState<string | null>(null);
  // Générateur de lien de test
  const [genStage, setGenStage] = useState("");
  const [genChild, setGenChild] = useState("");
  const [genMoniteurs, setGenMoniteurs] = useState("");
  const [genLink, setGenLink] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  // Test du cron d'envoi
  const [testDate, setTestDate] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testLinks, setTestLinks] = useState<Array<{ url: string; childName: string; stageLabel: string }>>([]);
  const [anneeSaison, setAnneeSaison] = useState<number>(() => { const n = new Date(); return n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1; });
  const [anneeBusy, setAnneeBusy] = useState(false);
  const [anneeResult, setAnneeResult] = useState("");
  const [anneeLinks, setAnneeLinks] = useState<Array<{ url: string; childName: string; stageLabel: string }>>([]);

  const lancerCron = async (envoyer: boolean) => {
    if (!user) return;
    setTestBusy(true); setTestResult("");
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams();
      if (testDate) params.set("date", testDate);
      if (envoyer && user.email) { params.set("to", user.email); params.set("limit", "2"); } else params.set("dry", "1");
      const res = await fetch(`/api/admin/satisfaction-stages?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
      const crees = Array.isArray(data?.crees) ? data.crees : [];
      setTestLinks(crees.map((c: any) => ({ url: `${window.location.origin}/satisfaction/${c.token}`, childName: c.childName || "", stageLabel: c.stageLabel || "" })));
    } catch (e: any) {
      setTestResult("Erreur : " + (e?.message || e));
    } finally { setTestBusy(false); }
  };

  const lancerAnnee = async (envoyer: boolean) => {
    if (!user) return;
    setAnneeBusy(true); setAnneeResult("");
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams();
      params.set("saison", String(anneeSaison));
      if (envoyer && user.email) { params.set("to", user.email); params.set("limit", "2"); } else params.set("dry", "1");
      const res = await fetch(`/api/admin/satisfaction-annee?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAnneeResult(JSON.stringify(data, null, 2));
      const crees = Array.isArray(data?.crees) ? data.crees : [];
      setAnneeLinks(crees.map((c: any) => ({ url: `${window.location.origin}/satisfaction/${c.token}`, childName: c.childName || "", stageLabel: c.stageLabel || "" })));
    } catch (e: any) { setAnneeResult("Erreur : " + (e?.message || e)); } finally { setAnneeBusy(false); }
  };

  // Envoi RÉEL du questionnaire de fin de saison à TOUTES les familles annuelles.
  // Ni dry, ni to, ni limit → la route envoie à tout le monde (sous garde-fou email).
  const envoyerAnneeTous = async () => {
    if (!user) return;
    const ok = window.confirm(
      `Envoi RÉEL du questionnaire de fin de saison ${anneeSaison}–${anneeSaison + 1} à TOUTES les familles annuelles.\n\n` +
      `⚠️ À faire AVANT :\n` +
      `• remplir les emails manquants (page « Renseigner les emails »),\n` +
      `• mettre EMAIL_RESTRICTED_MODE=off dans Vercel (sinon les familles sont bloquées).\n\n` +
      `Continuer ?`
    );
    if (!ok) return;
    const mot = window.prompt("Pour confirmer l'envoi réel à TOUTES les familles, tapez : ENVOYER-TOUS");
    if (mot !== "ENVOYER-TOUS") { setAnneeResult("Envoi annulé (mot-clé incorrect)."); return; }
    setAnneeBusy(true); setAnneeResult("");
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams();
      params.set("saison", String(anneeSaison));
      const res = await fetch(`/api/admin/satisfaction-annee?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAnneeResult(JSON.stringify(data, null, 2));
      const crees = Array.isArray(data?.crees) ? data.crees : [];
      setAnneeLinks(crees.map((c: any) => ({ url: `${window.location.origin}/satisfaction/${c.token}`, childName: c.childName || "", stageLabel: c.stageLabel || "" })));
    } catch (e: any) { setAnneeResult("Erreur : " + (e?.message || e)); } finally { setAnneeBusy(false); }
  };

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        let snap;
        try {
          snap = await getDocs(query(collection(db, "avis-satisfaction"), orderBy("createdAt", "desc")));
        } catch {
          // Fallback sans orderBy si index manquant
          snap = await getDocs(collection(db, "avis-satisfaction"));
        }
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Avis));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAvis(list);
      } catch (e) {
        console.error("Chargement avis:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  // Liste des activites distinctes pour le filtre
  const activites = useMemo(() => {
    const set = new Set<string>();
    avis.forEach(a => a.activityTitle && set.add(a.activityTitle));
    return Array.from(set).sort();
  }, [avis]);

  // Avis filtres
  const filtered = useMemo(() => {
    return avis.filter(a =>
      (!filterActivite || a.activityTitle === filterActivite) &&
      (!filterNote || a.globalNote === filterNote)
    );
  }, [avis, filterActivite, filterNote]);

  // Stats sur les avis filtres
  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    const moyenne = filtered.reduce((s, a) => s + (a.globalNote || 0), 0) / filtered.length;
    const parAspect: Record<string, { sum: number; count: number }> = {};
    filtered.forEach(a => {
      if (a.aspects) {
        for (const [k, v] of Object.entries(a.aspects)) {
          if (!parAspect[k]) parAspect[k] = { sum: 0, count: 0 };
          parAspect[k].sum += Number(v) || 0;
          parAspect[k].count += 1;
        }
      }
    });
    // Distribution des notes 1-5
    const distrib = [1, 2, 3, 4, 5].map(n => ({
      note: n,
      count: filtered.filter(a => a.globalNote === n).length,
    }));
    return { moyenne, parAspect, distrib, total: filtered.length };
  }, [filtered]);

  // Mois (YYYY-MM) d'un avis de stage : dateFin > semaine > createdAt
  const moisDeAvis = (a: Avis): string => {
    const d = (a as any).dateFin || (a as any).semaine;
    if (typeof d === "string" && /^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
    if (a.createdAt?.seconds) { const dt = new Date(a.createdAt.seconds * 1000); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; }
    return "";
  };
  const labelPeriode = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  const stageAvis = useMemo(
    () => avis.filter(a => a.source === "stage" && Array.isArray(a.moniteurs)),
    [avis]
  );
  const periodesStage = useMemo(() => {
    const set = new Set<string>();
    stageAvis.forEach(a => { const m = moisDeAvis(a); if (m) set.add(m); });
    return Array.from(set).sort().reverse();
  }, [stageAvis]);

  // Bilan par enseignant (avis post-stage, filtrés par période éventuelle)
  const bilan = useMemo(() => {
    const list = (filterPeriode ? stageAvis.filter(a => moisDeAvis(a) === filterPeriode) : stageAvis) as unknown as AvisStage[];
    return bilanParEnseignant(list);
  }, [stageAvis, filterPeriode]);

  const genererLienTest = async () => {
    const moniteurs = genMoniteurs.split(",").map(s => s.trim()).filter(Boolean);
    if (!genStage.trim() || moniteurs.length === 0) return;
    setGenBusy(true); setGenLink("");
    try {
      const ref = await addDoc(collection(db, "satisfaction-invitations"), {
        stageLabel: genStage.trim(),
        childName: genChild.trim(),
        moniteurs,
        repondu: false,
        test: true,
        createdAt: serverTimestamp(),
      });
      setGenLink(`${window.location.origin}/satisfaction/${ref.id}`);
    } catch (e) {
      console.error(e);
      alert("Impossible de créer le lien de test (règles Firestore ?).");
    } finally { setGenBusy(false); }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl">Accès refusé</h1>
        <p className="font-body text-slate-600 mt-2">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <MessageSquare className="text-amber-500" /> Satisfaction
        </h1>
        <p className="font-body text-sm text-slate-600">
          Avis laissés par les familles depuis leur espace cavalier.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setView("global")}
          className={`px-4 py-2 rounded-xl font-body text-sm font-semibold ${view === "global" ? "bg-[#1e3a5f] text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
          Vue d'ensemble
        </button>
        <button onClick={() => setView("enseignant")}
          className={`px-4 py-2 rounded-xl font-body text-sm font-semibold inline-flex items-center gap-1.5 ${view === "enseignant" ? "bg-[#1e3a5f] text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
          <Users size={15} /> Par enseignant
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "enseignant" ? (
        <>
          {/* Filtre période */}
          {periodesStage.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Filter size={14} className="text-slate-400" />
              <select value={filterPeriode} onChange={e => setFilterPeriode(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white capitalize">
                <option value="">Toute la saison</option>
                {periodesStage.map(p => <option key={p} value={p}>{labelPeriode(p)}</option>)}
              </select>
              {filterPeriode && (
                <button onClick={() => setFilterPeriode("")} className="font-body text-xs text-blue-500 hover:underline">Réinitialiser</button>
              )}
            </div>
          )}
          {/* Tableau par enseignant */}
          {bilan.length === 0 ? (
            <div className="text-center py-10 font-body text-slate-500">
              Aucun retour de stage avec moniteur nommé pour l'instant. Génère un lien de test ci-dessous pour essayer.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-body text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Enseignant</th>
                    <th className="px-3 py-3">Encadrement</th>
                    <th className="px-3 py-3">Note stage</th>
                    <th className="px-3 py-3">Recommande</th>
                    <th className="px-3 py-3">Avis</th>
                  </tr>
                </thead>
                <tbody>
                  {bilan.map(b => {
                    const open = expandedEns === b.nom;
                    return (
                      <Fragment key={b.nom}>
                        <tr className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedEns(open ? null : b.nom)}>
                          <td className="px-4 py-3 font-body font-semibold text-slate-800">
                            <span className="inline-flex items-center gap-1.5">
                              {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                              {b.nom}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <Stars n={Math.round(b.moyenneEncadrement || 0)} />
                              <span className="font-body text-xs font-semibold text-slate-500">{b.moyenneEncadrement?.toFixed(1) ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-body text-slate-600">{b.moyenneGlobaleStage?.toFixed(1) ?? "—"}</td>
                          <td className="px-3 py-3 text-center font-body text-slate-600">{b.recommandePct === null ? "—" : `${b.recommandePct}%`}</td>
                          <td className="px-3 py-3 text-center font-body text-slate-500">{b.nbNotes}</td>
                        </tr>
                        {open && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex flex-col gap-2">
                                {b.details.map((d, i) => {
                                  const bas = d.noteEncadrement > 0 && d.noteEncadrement <= 3;
                                  return (
                                    <div key={i} className={`rounded-lg border p-3 ${bas ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="font-body text-sm">
                                          <span className="font-semibold text-slate-800">{d.childName || "Enfant"}</span>
                                          <span className="text-slate-400"> · {d.stageLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-3 font-body text-xs text-slate-500">
                                          <span className="inline-flex items-center gap-1">Encadr. <Stars n={d.noteEncadrement} /> <span className={bas ? "text-rose-600 font-bold" : "font-semibold"}>{d.noteEncadrement || "—"}</span></span>
                                          <span>Stage {d.globalNote || "—"}/5</span>
                                          {d.recommande === false && <span className="text-rose-600 font-semibold">ne recommande pas</span>}
                                        </div>
                                      </div>
                                      {d.commentaire && (
                                        <p className="font-body text-sm text-slate-700 italic mt-2">« {d.commentaire} »</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Générateur de lien de test */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
            <div className="font-body text-sm font-semibold text-blue-900 mb-3 flex items-center gap-1.5"><Link2 size={15} /> Générer un lien de test</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input value={genStage} onChange={e => setGenStage(e.target.value)} placeholder="Libellé du stage" className="px-3 py-2 rounded-lg border border-slate-200 font-body text-sm bg-white" />
              <input value={genChild} onChange={e => setGenChild(e.target.value)} placeholder="Prénom de l'enfant" className="px-3 py-2 rounded-lg border border-slate-200 font-body text-sm bg-white" />
              <input value={genMoniteurs} onChange={e => setGenMoniteurs(e.target.value)} placeholder="Moniteurs (séparés par ,)" className="px-3 py-2 rounded-lg border border-slate-200 font-body text-sm bg-white" />
            </div>
            <button onClick={genererLienTest} disabled={genBusy}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold disabled:opacity-50">
              {genBusy ? "Création…" : "Créer le lien"}
            </button>
            {genLink && (
              <div className="mt-3 flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                <a href={genLink} target="_blank" rel="noreferrer" className="font-body text-xs text-blue-600 truncate flex-1">{genLink}</a>
                <button onClick={() => navigator.clipboard?.writeText(genLink)} className="text-slate-400 hover:text-slate-700" title="Copier"><Copy size={14} /></button>
              </div>
            )}
          </div>

          {/* Test du cron d'envoi automatique */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-4">
            <div className="font-body text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5"><MessageSquare size={15} /> Cron d'envoi (stages terminés la veille)</div>
            <p className="font-body text-xs text-slate-500 mb-3">
              « Aperçu » liste ce qui serait envoyé, sans rien créer ni envoyer. « M'envoyer un test » redirige tous les mails vers ton adresse ({user?.email}).
              Laisse la date vide pour traiter <strong>hier</strong>, ou choisis le dernier jour d'un stage passé.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 font-body text-sm bg-white" />
              <button onClick={() => lancerCron(false)} disabled={testBusy}
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-body text-sm font-semibold disabled:opacity-50">Aperçu</button>
              <button onClick={() => lancerCron(true)} disabled={testBusy}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-body text-sm font-semibold disabled:opacity-50">M'envoyer un test</button>
            </div>
            {testLinks.length > 0 && (
              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
                <div className="font-body text-xs font-semibold text-slate-600 mb-2">Liens créés — ouvre-les pour tester le formulaire :</div>
                <div className="flex flex-col gap-1.5">
                  {testLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="font-body text-xs text-blue-600 hover:underline truncate">
                      {l.childName || "Enfant"} · {l.stageLabel} →
                    </a>
                  ))}
                </div>
              </div>
            )}
            {testResult && (
              <pre className="mt-3 bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] overflow-auto max-h-64 whitespace-pre-wrap">{testResult}</pre>
            )}
          </div>

          {/* Questionnaire de fin de saison */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mt-4">
            <div className="font-body text-sm font-semibold text-indigo-800 mb-1 flex items-center gap-1.5"><MessageSquare size={15} /> Questionnaire de fin de saison</div>
            <p className="font-body text-xs text-indigo-700/80 mb-3">
              Envoie un avis « bilan de l'année » à chaque cavalier ayant monté en cours pendant la saison, avec ses moniteurs de l'année. Les réponses alimentent la colonne « avis annuel » dans Réinscriptions. « Aperçu » ne crée rien ; « M'envoyer un test » t'envoie 2 mails.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={anneeSaison} onChange={e => setAnneeSaison(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-slate-200 font-body text-sm bg-white">
                {(() => { const y = new Date().getFullYear(); const arr = []; for (let s = y; s >= y - 4; s--) arr.push(s); return arr.map(s => <option key={s} value={s}>Saison {s}–{s + 1}</option>); })()}
              </select>
              <button onClick={() => lancerAnnee(false)} disabled={anneeBusy}
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-body text-sm font-semibold disabled:opacity-50">Aperçu</button>
              <button onClick={() => lancerAnnee(true)} disabled={anneeBusy}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white font-body text-sm font-semibold disabled:opacity-50">M'envoyer un test</button>
              <button onClick={envoyerAnneeTous} disabled={anneeBusy}
                className="px-3 py-2 rounded-lg bg-rose-600 text-white font-body text-sm font-semibold disabled:opacity-50">Envoyer à toutes les familles</button>
            </div>
            {anneeLinks.length > 0 && (
              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
                <div className="font-body text-xs font-semibold text-slate-600 mb-2">Liens créés — ouvre-les pour tester le formulaire :</div>
                <div className="flex flex-col gap-1.5">
                  {anneeLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="font-body text-xs text-blue-600 hover:underline truncate">
                      {l.childName || "Enfant"} · {l.stageLabel} →
                    </a>
                  ))}
                </div>
              </div>
            )}
            {anneeResult && (
              <pre className="mt-3 bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] overflow-auto max-h-64 whitespace-pre-wrap">{anneeResult}</pre>
            )}
          </div>
        </>
      ) : avis.length === 0 ? (
        <div className="text-center py-12 font-body text-slate-500">
          Aucun avis pour le moment.
        </div>
      ) : (
        <>
          {/* Stats globales */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <div className="font-body text-xs text-amber-700 uppercase tracking-wider mb-1">Note moyenne</div>
                <div className="font-display text-3xl font-bold text-amber-600">{stats.moyenne.toFixed(1)}<span className="text-lg text-amber-400">/5</span></div>
                <div className="mt-1"><Stars n={Math.round(stats.moyenne)} size={16} /></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Nombre d'avis</div>
                <div className="font-display text-3xl font-bold text-slate-800">{stats.total}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-2">Répartition</div>
                {stats.distrib.slice().reverse().map(d => (
                  <div key={d.note} className="flex items-center gap-2 mb-0.5">
                    <span className="font-body text-[10px] text-slate-400 w-3">{d.note}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: stats.total ? `${(d.count / stats.total) * 100}%` : "0%" }} />
                    </div>
                    <span className="font-body text-[10px] text-slate-400 w-4 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Moyennes par aspect */}
          {stats && Object.keys(stats.parAspect).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <TrendingUp size={12} /> Détail par aspect
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ASPECTS.map(asp => {
                  const data = stats.parAspect[asp.id];
                  if (!data) return null;
                  const moy = data.sum / data.count;
                  return (
                    <div key={asp.id} className="flex items-center justify-between gap-2">
                      <span className="font-body text-sm text-slate-700">{asp.label}</span>
                      <span className="flex items-center gap-2">
                        <Stars n={Math.round(moy)} />
                        <span className="font-body text-xs font-semibold text-slate-500">{moy.toFixed(1)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter size={14} className="text-slate-400" />
            <select
              value={filterActivite}
              onChange={e => setFilterActivite(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white"
            >
              <option value="">Toutes les activités</option>
              {activites.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={filterNote}
              onChange={e => setFilterNote(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white"
            >
              <option value={0}>Toutes les notes</option>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} étoile{n > 1 ? "s" : ""}</option>)}
            </select>
            {(filterActivite || filterNote > 0) && (
              <button
                onClick={() => { setFilterActivite(""); setFilterNote(0); }}
                className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Liste des avis */}
          <div className="space-y-3">
            {filtered.map(a => {
              const date = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : null;
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-body font-semibold text-slate-900">{a.familyName || "Famille"}</div>
                      <div className="font-body text-xs text-slate-400">
                        {a.activityTitle || "Général"}
                        {date && ` · ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
                      </div>
                    </div>
                    <Stars n={a.globalNote} size={16} />
                  </div>
                  {a.commentaire && (
                    <p className="font-body text-sm text-slate-700 italic bg-slate-50 rounded-lg p-3 mt-2">
                      « {a.commentaire} »
                    </p>
                  )}
                  {a.aspects && Object.keys(a.aspects).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {ASPECTS.map(asp => {
                        const v = a.aspects?.[asp.id];
                        if (!v) return null;
                        return (
                          <span key={asp.id} className="font-body text-[11px] text-slate-500">
                            {asp.label} : <span className="text-amber-500">{"★".repeat(v)}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-8 font-body text-slate-400">
                Aucun avis ne correspond aux filtres.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
