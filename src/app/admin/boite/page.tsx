"use client";
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Mail, Sparkles, Calendar, Copy, Check, Inbox, RefreshCw, Send, Trash2, Forward, UserPlus } from "lucide-react";

const CLASSIF: Record<string, { label: string; cls: string }> = {
  inscription: { label: "Demande d'inscription", cls: "bg-green-50 text-green-700" },
  info: { label: "Demande d'info", cls: "bg-blue-50 text-blue-700" },
  administratif: { label: "Administratif", cls: "bg-amber-50 text-amber-700" },
  autre: { label: "Autre", cls: "bg-slate-100 text-slate-600" },
};

// Décode les entités HTML (d&#39;Agon → d'Agon) pour un affichage propre.
function decodeHtml(s: string): string {
  if (!s) return "";
  if (typeof document === "undefined") return s;
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

export default function BoiteAssistantPage() {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  // Suivi de l'inscription 1-clic par suggestion (index → état)
  const [enrollState, setEnrollState] = useState<Record<number, { busy?: boolean; done?: boolean; error?: string; orderMsg?: string; orderWarn?: string }>>({});

  // ── Gmail ──
  const [gmail, setGmail] = useState<{
    loading: boolean;
    configured: boolean;
    connected: boolean;
    messages: any[];
    error: string;
  }>({ loading: true, configured: false, connected: false, messages: [], error: "" });
  const [connecting, setConnecting] = useState(false);
  const [replyMeta, setReplyMeta] = useState<{ threadId: string; messageId: string }>({ threadId: "", messageId: "" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [mailboxBusy, setMailboxBusy] = useState<"" | "trash" | "forward">("");
  const [mailboxMsg, setMailboxMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const deleteMail = async () => {
    if (!selectedId || mailboxBusy) return;
    if (!confirm("Mettre ce mail à la corbeille Gmail ?")) return;
    setMailboxBusy("trash");
    setMailboxMsg(null);
    try {
      const r = await authFetch("/api/admin/gmail/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId }),
      });
      const d = await r.json();
      if (r.ok) {
        setGmail((g) => ({ ...g, messages: g.messages.filter((m: any) => m.id !== selectedId) }));
        setFrom("");
        setSubject("");
        setBody("");
        setSelectedId("");
        setRes(null);
        setMailboxMsg({ ok: true, text: "Mail mis à la corbeille ✓" });
      } else {
        setMailboxMsg({ ok: false, text: d.error || "Échec de la suppression" });
      }
    } catch {
      setMailboxMsg({ ok: false, text: "Erreur réseau" });
    }
    setMailboxBusy("");
  };

  const forwardMail = async () => {
    if (mailboxBusy) return;
    const dest = window.prompt("Transférer ce mail à quelle adresse ?");
    if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest.trim())) {
      if (dest !== null) setMailboxMsg({ ok: false, text: "Adresse invalide" });
      return;
    }
    setMailboxBusy("forward");
    setMailboxMsg(null);
    try {
      const fwdBody = `---------- Message transféré ----------\nDe : ${from}\nObjet : ${subject}\n\n${body}`;
      const r = await authFetch("/api/admin/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: dest.trim(), subject: `Fwd: ${subject}`, body: fwdBody }),
      });
      const d = await r.json();
      setMailboxMsg(r.ok ? { ok: true, text: `Transféré à ${dest.trim()} ✓` } : { ok: false, text: d.error || "Échec du transfert" });
    } catch {
      setMailboxMsg({ ok: false, text: "Erreur réseau" });
    }
    setMailboxBusy("");
  };
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sendReply = async () => {
    if (!from.trim() || !draft.trim() || sending) return;
    if (!confirm(`Envoyer cette réponse à ${from} ?`)) return;
    setSending(true);
    setSendMsg(null);
    try {
      const r = await authFetch("/api/admin/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: from,
          subject,
          body: draft,
          threadId: replyMeta.threadId || undefined,
          inReplyTo: replyMeta.messageId || undefined,
        }),
      });
      const d = await r.json();
      setSendMsg(r.ok ? { ok: true, text: "Réponse envoyée ✓" } : { ok: false, text: d.error || "Échec de l'envoi" });
    } catch {
      setSendMsg({ ok: false, text: "Erreur réseau" });
    }
    setSending(false);
  };

  const loadGmail = async () => {
    setGmail((g) => ({ ...g, loading: true, error: "" }));
    try {
      const r = await authFetch("/api/admin/gmail/messages");
      const d = await r.json();
      setGmail({
        loading: false,
        configured: !!d.configured,
        connected: !!d.connected,
        messages: Array.isArray(d.messages) ? d.messages : [],
        error: d.error || "",
      });
    } catch {
      setGmail((g) => ({ ...g, loading: false, error: "Erreur réseau" }));
    }
  };

  useEffect(() => {
    loadGmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGmail = async () => {
    setConnecting(true);
    try {
      const r = await authFetch("/api/auth/gmail");
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else {
        setGmail((g) => ({ ...g, error: d.error || "Impossible de démarrer la connexion" }));
        setConnecting(false);
      }
    } catch {
      setConnecting(false);
    }
  };

  const pickMessage = (m: any) => {
    setFrom(decodeHtml(m.from || ""));
    setSubject(decodeHtml(m.subject || ""));
    setBody(decodeHtml(m.body || m.snippet || ""));
    setReplyMeta({ threadId: m.threadId || "", messageId: m.messageId || "" });
    setSelectedId(m.id || "");
    setMailboxMsg(null);
    setRes(null);
    setErr("");
    setSendMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const analyser = async () => {
    if (!body.trim() && !subject.trim()) return;
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const r = await authFetch("/api/admin/inbox-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, subject, body }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Erreur");
      } else {
        setRes(d);
        setDraft(d.brouillon || "");
        setEnrollState({});
      }
    } catch {
      setErr("Erreur réseau");
    }
    setLoading(false);
  };

  const copyDraft = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Inscription 1-clic (étape 2) : le serveur re-vérifie tout ──
  // Un stage semaine = tous ses creneauIds (inscription tout-ou-rien côté serveur).
  const enrollSuggestion = async (s: any, i: number) => {
    const ids: string[] = Array.isArray(s?.creneauIds) && s.creneauIds.length > 0 ? s.creneauIds : s?.creneauId ? [s.creneauId] : [];
    if (ids.length === 0 || !s?.childId || !res?.familyId) return;
    setEnrollState((prev) => ({ ...prev, [i]: { busy: true } }));
    try {
      const r = await authFetch("/api/admin/inbox-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creneauIds: ids, childId: s.childId, familyId: res.familyId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setEnrollState((prev) => ({ ...prev, [i]: { error: d.error || "Échec de l'inscription" } }));
      } else {
        const orderMsg = d.order
          ? d.order.merged
            ? `Ajouté à la commande ${d.order.orderId} — total ${d.order.totalTTC} €`
            : `Commande ${d.order.orderId} créée — ${d.order.totalTTC} €`
          : d.status === "already"
          ? "Déjà inscrit — commande inchangée"
          : "";
        setEnrollState((prev) => ({ ...prev, [i]: { done: true, orderMsg, orderWarn: d.orderError || "" } }));
      }
    } catch {
      setEnrollState((prev) => ({ ...prev, [i]: { error: "Erreur réseau" } }));
    }
  };

  const c = res ? CLASSIF[res.classification] || CLASSIF.autre : null;

  return (
    <div className="pb-10">
      <div className="mb-6">
        <div className="mb-1 font-body text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Assistant email</div>
        <h1 className="font-display text-2xl font-bold text-blue-800 md:text-3xl">Boîte de réception</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-gray-500">
          Choisis un mail dans la liste Gmail ci-dessous : l'assistant le classe, le résume, propose un brouillon de
          réponse et les prestations réellement disponibles. Rien n'est envoyé sans ton clic sur « Envoyer ».
        </p>
      </div>

      {/* ── Panneau Gmail ── */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold text-slate-700">
            <Inbox size={16} className="flex-shrink-0 text-blue-500" /> <span className="truncate">Gmail — ceagon50@gmail.com</span>
          </div>
          {gmail.connected && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={connectGmail}
                disabled={connecting}
                title="Redemander l'autorisation Google (nécessaire pour activer l'envoi)"
                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-body text-[11px] font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
              >
                {connecting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Reconnecter
              </button>
              <button
                onClick={loadGmail}
                disabled={gmail.loading}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-body text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <RefreshCw size={12} className={gmail.loading ? "animate-spin" : ""} /> Actualiser
              </button>
            </div>
          )}
        </div>

        {gmail.loading && (
          <div className="flex items-center gap-2 font-body text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </div>
        )}

        {!gmail.loading && !gmail.configured && (
          <p className="font-body text-xs text-amber-600">
            Connexion Gmail non configurée : ajoute d'abord les variables <code>GMAIL_OAUTH_CLIENT_ID</code> et{" "}
            <code>GMAIL_OAUTH_CLIENT_SECRET</code> dans Vercel. En attendant, tu peux coller un mail à la main ci-dessous.
          </p>
        )}

        {!gmail.loading && gmail.configured && !gmail.connected && (
          <button
            onClick={connectGmail}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-body text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Connecter Gmail
          </button>
        )}

        {!gmail.loading && gmail.connected && (
          <div>
            {gmail.error && <p className="mb-2 font-body text-xs text-red-500">{gmail.error}</p>}
            {gmail.messages.length === 0 && !gmail.error && (
              <p className="font-body text-xs text-slate-400">Aucun mail récent.</p>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {gmail.messages.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => pickMessage(m)}
                  className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-blue-100 hover:bg-blue-50/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-body text-xs font-semibold text-slate-700">{decodeHtml(m.from)}</span>
                  </div>
                  <div className="truncate font-body text-sm text-slate-800">{decodeHtml(m.subject) || "(sans objet)"}</div>
                  <div className="truncate font-body text-[11px] text-slate-400">{decodeHtml(m.snippet)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Entrée */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-body text-sm font-semibold text-slate-700">
              <Mail size={16} className="text-blue-500" /> Mail reçu
            </div>
            {selectedId && (
              <div className="flex items-center gap-2">
                <button
                  onClick={forwardMail}
                  disabled={!!mailboxBusy}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-body text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  {mailboxBusy === "forward" ? <Loader2 size={12} className="animate-spin" /> : <Forward size={12} />} Transférer
                </button>
                <button
                  onClick={deleteMail}
                  disabled={!!mailboxBusy}
                  className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 font-body text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {mailboxBusy === "trash" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Supprimer
                </button>
              </div>
            )}
          </div>
          {mailboxMsg && (
            <p className={`mb-2 font-body text-xs font-semibold ${mailboxMsg.ok ? "text-green-600" : "text-red-500"}`}>
              {mailboxMsg.text}
            </p>
          )}
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Expéditeur (email)"
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-body text-sm focus:border-blue-400 focus:outline-none"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Objet"
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-body text-sm focus:border-blue-400 focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Corps du message…"
            rows={9}
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-body text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={analyser}
            disabled={loading || (!body.trim() && !subject.trim())}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Analyser
          </button>
          {err && <p className="mt-2 font-body text-xs text-red-500">{err}</p>}
        </div>

        {/* Sortie */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          {!res && !loading && (
            <p className="font-body text-sm text-slate-400">Le résultat de l'analyse s'affichera ici.</p>
          )}
          {loading && (
            <div className="flex items-center gap-2 font-body text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Analyse en cours…
            </div>
          )}
          {res && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {c && (
                  <span className={`rounded-full px-2.5 py-1 font-body text-[11px] font-bold uppercase tracking-wide ${c.cls}`}>
                    {c.label}
                  </span>
                )}
                {res.familleConnue && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-body text-[11px] font-semibold text-blue-600">
                    Famille connue
                  </span>
                )}
              </div>

              {res.resume && (
                <div>
                  <div className="mb-1 font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">Résumé</div>
                  <p className="font-body text-sm text-slate-700">{res.resume}</p>
                </div>
              )}

              {Array.isArray(res.suggestions) && res.suggestions.length > 0 && (
                <div>
                  <div className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Prestations disponibles proposées
                  </div>
                  <div className="space-y-2">
                    {res.suggestions.map((s: any, i: number) => (
                      <div key={i} className={`rounded-lg border p-3 ${s.actionable ? "border-green-100 bg-green-50/40" : "border-gray-100 bg-slate-50/60"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-body text-sm font-semibold text-slate-800">
                            <Calendar size={13} className="text-blue-400" /> {s.titre || "(créneau)"}
                          </div>
                          {typeof s.places === "number" && s.places > 0 && (
                            <span className="whitespace-nowrap font-body text-[11px] font-semibold text-green-600">
                              {s.places} place{s.places > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-body text-xs text-slate-500">
                          {[
                            s.periode || s.date,
                            s.horaire,
                            typeof s.prixTTC === "number"
                              ? s.prixMode === "semaine"
                                ? `${s.prixTTC} € la semaine (${s.nbJours} jour${s.nbJours > 1 ? "s" : ""})`
                                : `${s.prixTTC} €`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {s.prixMode === "semaine" && typeof s.prixJour === "number" && (
                            <span className="text-slate-400"> · journée possible : {s.prixJour} €/jour</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {s.childName && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-body text-[10px] font-semibold text-blue-600">
                              pour {s.childName}
                            </span>
                          )}
                          {s.actionable ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-body text-[10px] font-semibold text-green-700">
                              <Check size={10} /> Vérifié · place dispo
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-body text-[10px] font-semibold text-amber-600">
                              {s.note || "non disponible"}
                            </span>
                          )}
                        </div>
                        {s.pourquoi && <div className="mt-1 font-body text-[11px] italic text-slate-400">{s.pourquoi}</div>}
                        {/* Étape 2 — inscription 1-clic (uniquement si actionnable + enfant identifié) */}
                        {s.actionable && s.childId && res.familyId && (Array.isArray(s.creneauIds) ? s.creneauIds.length > 0 : !!s.creneauId) && (
                          <div className="mt-2">
                            {enrollState[i]?.done ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 font-body text-[11px] font-semibold text-white">
                                <Check size={12} /> Inscrit{s.childName ? ` · ${s.childName}` : ""}
                                {s.prixMode === "semaine" && s.nbJours > 1 ? ` · ${s.nbJours} jours` : ""}
                              </span>
                            ) : (
                              <button
                                onClick={() => enrollSuggestion(s, i)}
                                disabled={enrollState[i]?.busy}
                                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 font-body text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {enrollState[i]?.busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                                {enrollState[i]?.busy
                                  ? "Inscription…"
                                  : `Inscrire${s.childName ? ` ${s.childName}` : ""}${s.prixMode === "semaine" && s.nbJours > 1 ? ` · semaine complète (${s.nbJours} j)` : ""}`}
                              </button>
                            )}
                            {enrollState[i]?.error && (
                              <span className="ml-2 font-body text-[11px] font-semibold text-red-600">{enrollState[i]?.error}</span>
                            )}
                            {enrollState[i]?.done && enrollState[i]?.orderWarn && (
                              <span className="ml-2 font-body text-[11px] font-semibold text-amber-600">{enrollState[i]?.orderWarn}</span>
                            )}
                            {enrollState[i]?.done && !enrollState[i]?.orderWarn && enrollState[i]?.orderMsg && (
                              <span className="ml-2 font-body text-[11px] text-slate-500">
                                {enrollState[i]?.orderMsg} · à régler dans Paiements (aucun lien envoyé)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Brouillon de réponse
                  </div>
                  <div className="flex items-center gap-2">
                    {gmail.connected && (
                      <button
                        onClick={sendReply}
                        disabled={sending || !from.trim() || !draft.trim()}
                        className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 font-body text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Envoyer
                      </button>
                    )}
                    <button
                      onClick={copyDraft}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-body text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copié" : "Copier"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-body text-sm focus:border-blue-400 focus:outline-none"
                />
                {sendMsg && (
                  <p className={`mt-1.5 font-body text-xs font-semibold ${sendMsg.ok ? "text-green-600" : "text-red-500"}`}>
                    {sendMsg.text}
                  </p>
                )}
                <p className="mt-1.5 font-body text-[11px] text-slate-400">
                  {gmail.connected
                    ? "« Envoyer » répond directement dans le fil Gmail (à ton clic). Sinon, copie et envoie depuis Gmail."
                    : "Relis, ajuste, puis envoie toi-même depuis Gmail. Aucune action automatique."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
