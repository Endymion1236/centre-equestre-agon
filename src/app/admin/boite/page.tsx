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
  // Étape 4 — nouvelle famille (expéditeur inconnu) : fiche pré-remplie par
  // l'IA, RELUE par l'admin, créée au clic. Puis les inscriptions se font
  // sur cette famille fraîchement créée.
  const [famForm, setFamForm] = useState<{ parentName: string; parentEmail: string; parentPhone: string; flechage: string; children: { firstName: string; lastName: string; birthDate: string; galopLevel: string; ageHint: number | null }[] } | null>(null);
  const [newFam, setNewFam] = useState<{ familyId: string; familyName: string; children: { id: string; firstName: string }[] } | null>(null);
  const [creatingFam, setCreatingFam] = useState(false);
  const [famMsg, setFamMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chosenChild, setChosenChild] = useState<Record<number, string>>({});

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
        body: JSON.stringify({ from, subject, body, threadId: replyMeta.threadId || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Erreur");
      } else {
        setRes(d);
        setDraft(d.brouillon || "");
        setEnrollState({});
        setNewFam(null);
        setFamMsg(null);
        setChosenChild({});
        // Expéditeur inconnu + demande de prestation → fiche pré-remplie à relire
        if (!d.familleConnue && d.nouvelleFamille) {
          const nf = d.nouvelleFamille;
          setFamForm({
            parentName: nf.parentName || "",
            parentEmail: from.trim(),
            parentPhone: "",
            flechage: "stage",
            children: (Array.isArray(nf.enfants) ? nf.enfants : []).slice(0, 8).map((e: any) => ({
              firstName: e?.prenom || "",
              lastName: e?.nom || "",
              birthDate: "",
              galopLevel: e?.galop || "",
              ageHint: typeof e?.age === "number" ? e.age : null,
            })),
          });
        } else {
          setFamForm(null);
        }
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

  // ── Création de la nouvelle famille (étape 4) — jamais automatique ──
  const createFamily = async () => {
    if (!famForm) return;
    setCreatingFam(true);
    setFamMsg(null);
    try {
      const r = await authFetch("/api/admin/inbox-create-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: famForm.parentName,
          parentEmail: famForm.parentEmail,
          parentPhone: famForm.parentPhone,
          flechage: famForm.flechage,
          children: famForm.children
            .filter((c) => c.firstName.trim())
            .map((c) => ({ firstName: c.firstName, lastName: c.lastName, birthDate: c.birthDate, galopLevel: c.galopLevel })),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.status === "exists") {
          setFamMsg({ ok: false, text: `Une famille existe déjà avec cet email (${d.familyName || d.familyId}) — corrige l'email ou relance l'analyse.` });
        } else {
          setFamMsg({ ok: false, text: d.error || "Échec de la création" });
        }
      } else {
        setNewFam({ familyId: d.familyId, familyName: d.familyName, children: d.children || [] });
        setFamMsg({ ok: true, text: `Famille "${d.familyName}" créée (${(d.children || []).length} enfant(s)). Tu peux maintenant inscrire.` });
      }
    } catch {
      setFamMsg({ ok: false, text: "Erreur réseau" });
    }
    setCreatingFam(false);
  };

  // ── Inscription 1-clic (étape 2) : le serveur re-vérifie tout ──
  // Un stage semaine = tous ses creneauIds (inscription tout-ou-rien côté serveur).
  // Famille : celle du mail (connue) OU la nouvelle famille créée à l'instant.
  const enrollSuggestion = async (s: any, i: number) => {
    const ids: string[] = Array.isArray(s?.creneauIds) && s.creneauIds.length > 0 ? s.creneauIds : s?.creneauId ? [s.creneauId] : [];
    const effFamilyId = res?.familyId || newFam?.familyId || "";
    const effChildId = s?.childId || (newFam ? chosenChild[i] || newFam.children[0]?.id || "" : "");
    if (ids.length === 0 || !effChildId || !effFamilyId) return;
    setEnrollState((prev) => ({ ...prev, [i]: { busy: true } }));
    try {
      const r = await authFetch("/api/admin/inbox-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creneauIds: ids, childId: effChildId, familyId: effFamilyId }),
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

              {/* ── Étape 4 : nouvelle famille détectée (expéditeur inconnu) ── */}
              {famForm && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-body text-[11px] font-bold uppercase tracking-wide text-violet-500">
                      Nouvelle famille détectée — fiche pré-remplie, à relire avant création
                    </div>
                    {newFam && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-body text-[10px] font-semibold text-green-700">
                        <Check size={10} /> Créée
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      value={famForm.parentName}
                      onChange={(e) => setFamForm({ ...famForm, parentName: e.target.value })}
                      placeholder="Nom du parent"
                      disabled={!!newFam}
                      className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                    />
                    <input
                      value={famForm.parentEmail}
                      onChange={(e) => setFamForm({ ...famForm, parentEmail: e.target.value })}
                      placeholder="Email"
                      disabled={!!newFam}
                      className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                    />
                    <input
                      value={famForm.parentPhone}
                      onChange={(e) => setFamForm({ ...famForm, parentPhone: e.target.value })}
                      placeholder="Téléphone (optionnel)"
                      disabled={!!newFam}
                      className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="font-body text-[10px] font-semibold uppercase text-violet-400">Fléchage :</span>
                    {[
                      { id: "cavalier_annee", label: "À l'année" },
                      { id: "stage", label: "Stages" },
                      { id: "passage", label: "Passage" },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!!newFam}
                        onClick={() => setFamForm({ ...famForm, flechage: o.id })}
                        className={`rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold disabled:opacity-60 ${
                          famForm.flechage === o.id ? "bg-violet-600 text-white" : "bg-white text-violet-600 border border-violet-200"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {famForm.children.map((c, ci) => (
                      <div key={ci} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <input
                          value={c.firstName}
                          onChange={(e) => setFamForm({ ...famForm, children: famForm.children.map((x, xi) => (xi === ci ? { ...x, firstName: e.target.value } : x)) })}
                          placeholder="Prénom enfant"
                          disabled={!!newFam}
                          className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                        />
                        <input
                          value={c.lastName}
                          onChange={(e) => setFamForm({ ...famForm, children: famForm.children.map((x, xi) => (xi === ci ? { ...x, lastName: e.target.value } : x)) })}
                          placeholder="Nom"
                          disabled={!!newFam}
                          className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                        />
                        <input
                          type="date"
                          value={c.birthDate}
                          onChange={(e) => setFamForm({ ...famForm, children: famForm.children.map((x, xi) => (xi === ci ? { ...x, birthDate: e.target.value } : x)) })}
                          disabled={!!newFam}
                          title={c.ageHint !== null ? `Âge indiqué dans le mail : ${c.ageHint} ans` : "Date de naissance"}
                          className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                        />
                        <input
                          value={c.galopLevel}
                          onChange={(e) => setFamForm({ ...famForm, children: famForm.children.map((x, xi) => (xi === ci ? { ...x, galopLevel: e.target.value } : x)) })}
                          placeholder={c.ageHint !== null ? `Galop (${c.ageHint} ans indiqué)` : "Galop (optionnel)"}
                          disabled={!!newFam}
                          className="rounded-md border border-violet-200 bg-white px-2.5 py-1.5 font-body text-xs disabled:opacity-60"
                        />
                      </div>
                    ))}
                    {!newFam && (
                      <button
                        type="button"
                        onClick={() => setFamForm({ ...famForm, children: [...famForm.children, { firstName: "", lastName: "", birthDate: "", galopLevel: "", ageHint: null }] })}
                        className="font-body text-[11px] font-semibold text-violet-500 hover:text-violet-700"
                      >
                        + Ajouter un enfant
                      </button>
                    )}
                  </div>
                  {!newFam && (
                    <div className="mt-2.5">
                      <button
                        onClick={createFamily}
                        disabled={creatingFam || !famForm.parentEmail.trim() || !famForm.children.some((c) => c.firstName.trim())}
                        className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 font-body text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {creatingFam ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        {creatingFam ? "Création…" : "Créer la famille"}
                      </button>
                      <span className="ml-2 font-body text-[10px] text-slate-400">Aucun email envoyé à la famille.</span>
                    </div>
                  )}
                  {famMsg && (
                    <div className={`mt-1.5 font-body text-[11px] font-semibold ${famMsg.ok ? "text-green-600" : "text-red-600"}`}>{famMsg.text}</div>
                  )}
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
                                : s.prixMode === "jours"
                                ? `${s.prixTTC} € les ${s.nbJours} jour${s.nbJours > 1 ? "s" : ""} (sur ${s.nbJoursSemaine} du stage)`
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
                            s.childId ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-body text-[10px] font-semibold text-green-700">
                                <Check size={10} /> Vérifié · place dispo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-body text-[10px] font-semibold text-sky-600">
                                <Check size={10} /> Place dispo · éligibilité à confirmer
                              </span>
                            )
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-body text-[10px] font-semibold text-amber-600">
                              {s.note || "non disponible"}
                            </span>
                          )}
                        </div>
                        {s.pourquoi && <div className="mt-1 font-body text-[11px] italic text-slate-400">{s.pourquoi}</div>}
                        {/* Étape 2 — inscription 1-clic (famille connue OU nouvelle famille créée) */}
                        {(() => {
                          const hasIds = Array.isArray(s.creneauIds) ? s.creneauIds.length > 0 : !!s.creneauId;
                          const effFamilyId = res.familyId || newFam?.familyId || "";
                          const effChildId = s.childId || (newFam ? chosenChild[i] || newFam.children[0]?.id || "" : "");
                          const effChildName = s.childName || (newFam ? newFam.children.find((c) => c.id === effChildId)?.firstName || "" : "");
                          if (!s.actionable || !hasIds || !effFamilyId || !effChildId) return null;
                          return (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {/* Sélecteur d'enfant (nouvelle famille, plusieurs enfants) */}
                            {!s.childId && newFam && newFam.children.length > 1 && !enrollState[i]?.done && (
                              <select
                                value={chosenChild[i] || newFam.children[0]?.id || ""}
                                onChange={(e) => setChosenChild((prev) => ({ ...prev, [i]: e.target.value }))}
                                className="rounded-md border border-blue-200 bg-white px-2 py-1 font-body text-[11px]"
                              >
                                {newFam.children.map((c) => (
                                  <option key={c.id} value={c.id}>{c.firstName}</option>
                                ))}
                              </select>
                            )}
                            {enrollState[i]?.done ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 font-body text-[11px] font-semibold text-white">
                                <Check size={12} /> Inscrit{effChildName ? ` · ${effChildName}` : ""}
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
                                  : `Inscrire${effChildName ? ` ${effChildName}` : ""}${
                                      s.prixMode === "semaine" && s.nbJours > 1
                                        ? ` · semaine complète (${s.nbJours} j)`
                                        : s.prixMode === "jours"
                                        ? ` · ${s.nbJours} jour${s.nbJours > 1 ? "s" : ""} seulement`
                                        : ""
                                    }`}
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
                          );
                        })()}
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
