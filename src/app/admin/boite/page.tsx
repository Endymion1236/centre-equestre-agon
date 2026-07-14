"use client";
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Mail, Sparkles, Calendar, Copy, Check, Inbox, RefreshCw, Send } from "lucide-react";

const CLASSIF: Record<string, { label: string; cls: string }> = {
  inscription: { label: "Demande d'inscription", cls: "bg-green-50 text-green-700" },
  info: { label: "Demande d'info", cls: "bg-blue-50 text-blue-700" },
  administratif: { label: "Administratif", cls: "bg-amber-50 text-amber-700" },
  autre: { label: "Autre", cls: "bg-slate-100 text-slate-600" },
};

export default function BoiteAssistantPage() {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

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
    setFrom(m.from || "");
    setSubject(m.subject || "");
    setBody(m.body || m.snippet || "");
    setReplyMeta({ threadId: m.threadId || "", messageId: m.messageId || "" });
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

  const c = res ? CLASSIF[res.classification] || CLASSIF.autre : null;

  return (
    <div className="pb-10">
      <div className="mb-6">
        <div className="mb-1 font-body text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Assistant email</div>
        <h1 className="font-display text-2xl font-bold text-blue-800 md:text-3xl">Boîte de réception</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-gray-500">
          Colle un mail reçu : l'assistant le classe, le résume, propose un brouillon de réponse et les prestations
          réellement disponibles. Rien n'est envoyé ni inscrit — tu gardes la main. (Le branchement Gmail remplira
          le mail automatiquement une fois configuré.)
        </p>
      </div>

      {/* ── Panneau Gmail ── */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-body text-sm font-semibold text-slate-700">
            <Inbox size={16} className="text-blue-500" /> Gmail — ceagon50@gmail.com
          </div>
          {gmail.connected && (
            <div className="flex items-center gap-2">
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
                    <span className="truncate font-body text-xs font-semibold text-slate-700">{m.from}</span>
                  </div>
                  <div className="truncate font-body text-sm text-slate-800">{m.subject || "(sans objet)"}</div>
                  <div className="truncate font-body text-[11px] text-slate-400">{m.snippet}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Entrée */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 font-body text-sm font-semibold text-slate-700">
            <Mail size={16} className="text-blue-500" /> Mail reçu
          </div>
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
                      <div key={i} className="rounded-lg border border-gray-100 bg-slate-50/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-body text-sm font-semibold text-slate-800">
                            <Calendar size={13} className="text-blue-400" /> {s.titre}
                          </div>
                          {typeof s.places === "number" && (
                            <span className="whitespace-nowrap font-body text-[11px] font-semibold text-green-600">
                              {s.places} place{s.places > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-body text-xs text-slate-500">
                          {[s.date, s.horaire, typeof s.prixTTC === "number" ? `${s.prixTTC} €` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {s.pourquoi && <div className="mt-1 font-body text-[11px] italic text-slate-400">{s.pourquoi}</div>}
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
