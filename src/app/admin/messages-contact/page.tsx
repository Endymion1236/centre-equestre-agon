"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Inbox, Mail, Phone, Loader2, RefreshCw, Check, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

/** Clé de passage vers l'assistant boîte : le message y arrive pré-rempli. */
const CLE_MESSAGE_BOITE = "ce_boite_message";

/**
 * Messages du formulaire de contact du site public.
 *
 * Filet de sécurité : chaque envoi est tracé en base avant l'email
 * (cf. /api/contact). Même si l'email se perd, le message est ici, avec le
 * statut d'envoi et le destinataire réellement utilisé.
 */

interface MessageContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  to: string;
  status: "recu" | "envoye" | "echec_envoi";
  erreur: string;
  traite: boolean;
  createdAt: string | null;
}

const dateFr = (iso: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export default function MessagesContactPage() {
  const { isAdmin, user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<MessageContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"a_traiter" | "tous">("a_traiter");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/messages-contact", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setMessages(d.messages || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const basculerTraite = async (m: MessageContact) => {
    // Optimiste : la liste reflète le clic tout de suite, l'API confirme.
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, traite: !m.traite } : x));
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/messages-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: m.id, traite: !m.traite }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, traite: m.traite } : x));
    }
  };

  /**
   * Ouvre le message dans l'assistant boîte, comme un mail Gmail : il est
   * classé, résumé, un brouillon est proposé à l'adresse du visiteur, et
   * les prestations demandées peuvent être inscrites en un clic. Le message
   * du formulaire n'avait que « Répondre » (client mail) : pas d'assistant.
   */
  const ouvrirDansAssistant = (m: MessageContact) => {
    const corps = [
      `Nom : ${m.firstName} ${m.lastName}`.trim(),
      `Email : ${m.email}`,
      m.phone ? `Téléphone : ${m.phone}` : "",
      "",
      m.message,
    ].filter((l, i) => l !== "" || i === 3).join("\n");
    try {
      sessionStorage.setItem(CLE_MESSAGE_BOITE, JSON.stringify({
        from: m.email, subject: m.subject, body: corps, sourceId: m.id,
      }));
    } catch { /* stockage indisponible : l'assistant s'ouvre vide */ }
    router.push("/admin/boite");
  };

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  const visibles = filtre === "a_traiter" ? messages.filter(m => !m.traite) : messages;
  const nbATraiter = messages.filter(m => !m.traite).length;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Inbox className="text-blue-500" /> Messages du site
          </h1>
          <p className="font-body text-sm text-slate-600">
            Tout ce que le formulaire de contact a reçu, même si l&apos;email s&apos;est perdu.
            Chaque message indique où son email est réellement parti.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="shrink-0 flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setFiltre("a_traiter")}
          className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${filtre === "a_traiter" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-700"}`}>
          À traiter ({nbATraiter})
        </button>
        <button type="button" onClick={() => setFiltre("tous")}
          className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${filtre === "tous" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-700"}`}>
          Tous ({messages.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-body text-sm text-green-700 flex items-center gap-2">
          <Check size={16} /> {filtre === "a_traiter" ? "Aucun message en attente." : "Aucun message reçu pour l'instant."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibles.map(m => (
            <div key={m.id} className={`rounded-xl border px-4 py-3 ${m.status === "echec_envoi" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"} ${m.traite ? "opacity-60" : ""}`}>
              <button type="button" onClick={() => setOuvert(ouvert === m.id ? null : m.id)}
                className="w-full flex items-start justify-between gap-3 bg-transparent border-none cursor-pointer p-0 text-left">
                <div className="min-w-0">
                  <div className="font-body font-semibold text-slate-800 truncate">
                    {m.firstName} {m.lastName}
                    <span className="font-normal text-slate-500"> · {m.subject}</span>
                  </div>
                  <div className="font-body text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-0.5">
                    <span>{dateFr(m.createdAt)}</span>
                    {m.status === "echec_envoi" && (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertTriangle size={11} /> email non parti
                      </span>
                    )}
                    {m.status === "envoye" && <span className="text-green-600">email envoyé à {m.to}</span>}
                    {m.traite && <span className="text-slate-400">traité</span>}
                  </div>
                </div>
                {ouvert === m.id ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
              </button>

              {ouvert === m.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="font-body text-sm text-slate-700 whitespace-pre-wrap m-0">{m.message}</p>
                  {m.erreur && (
                    <p className="font-body text-xs text-red-600 mt-2 m-0">Erreur d&apos;envoi : {m.erreur}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button type="button" onClick={() => ouvrirDansAssistant(m)}
                      className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                      <Sparkles size={13} /> Assistant IA
                    </button>
                    <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                      className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg no-underline">
                      <Mail size={13} /> Répondre ({m.email})
                    </a>
                    {m.phone && (
                      <a href={`tel:${m.phone}`}
                        className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg no-underline">
                        <Phone size={13} /> {m.phone}
                      </a>
                    )}
                    <button type="button" onClick={() => basculerTraite(m)}
                      className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg cursor-pointer ml-auto">
                      <Check size={13} /> {m.traite ? "Remettre à traiter" : "Marquer traité"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
