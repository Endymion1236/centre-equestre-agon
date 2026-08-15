"use client";

/**
 * src/app/admin/boite/PanneauGmail.tsx
 *
 * Le panneau du haut : état de la connexion Gmail et liste des mails récents,
 * avec sélection multiple pour la corbeille et pagination.
 *
 * Pourquoi séparé : c'est le seul bloc de l'écran qui parle de la BOÎTE (est-ce
 * qu'on est connecté, à quelle adresse, quels messages) et non du mail en
 * cours de traitement. Il affiche aussi les trois messages d'aide selon l'état
 * (non configuré / non connecté / connecté), qui n'ont d'intérêt qu'ici.
 *
 * L'adresse affichée vient toujours de l'API (`gmail.email`) : on ne devine
 * jamais depuis quel compte on travaille, sous peine de répondre depuis la
 * mauvaise boîte sans s'en rendre compte.
 */

import type { Dispatch, SetStateAction } from "react";
import { Loader2, Mail, Inbox, RefreshCw, Trash2, Phone } from "lucide-react";
import { decodeHtml, estVocal } from "./mail-utils";
import type { ActionBoite, EtatGmail } from "./types";

interface PanneauGmailProps {
  gmail: EtatGmail;
  connecting: boolean;
  connectGmail: () => void;
  loadGmail: () => void;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  deleteSelected: () => void;
  mailboxBusy: ActionBoite;
  loadMore: () => void;
  loadingMore: boolean;
  pickMessage: (m: any) => void;
}

export function PanneauGmail({
  gmail, connecting, connectGmail, loadGmail,
  selectedIds, setSelectedIds, deleteSelected, mailboxBusy,
  loadMore, loadingMore, pickMessage,
}: PanneauGmailProps) {
  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold text-slate-700">
          <Inbox size={16} className="flex-shrink-0 text-blue-500" /> <span className="truncate">Gmail{gmail.email ? ` — ${gmail.email}` : gmail.connected ? " — compte inconnu" : ""}</span>
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
          {selectedIds.length > 0 && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
              <span className="font-body text-xs font-semibold text-red-700">
                {selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds([])}
                  className="font-body text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Annuler
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={mailboxBusy === "trash"}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 font-body text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {mailboxBusy === "trash" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Corbeille
                </button>
              </div>
            </div>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {gmail.messages.map((m: any) => (
              <div
                key={m.id}
                className={`flex items-start gap-2 rounded-lg border px-2 py-2 transition-colors ${
                  selectedIds.includes(m.id)
                    ? "border-red-200 bg-red-50/40"
                    : "border-transparent hover:border-blue-100 hover:bg-blue-50/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={(e) => {
                    setSelectedIds((prev) =>
                      e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)
                    );
                  }}
                  className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-red-600"
                  aria-label="Sélectionner ce mail"
                />
                <button onClick={() => pickMessage(m)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-body text-xs font-semibold text-slate-700">
                      {estVocal(m) ? "Répondeur téléphonique" : decodeHtml(m.from)}
                    </span>
                    {estVocal(m) && (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-body text-[10px] font-semibold text-amber-700">
                        <Phone size={10} /> Vocal
                      </span>
                    )}
                  </div>
                  <div className="truncate font-body text-sm text-slate-800">{decodeHtml(m.subject) || "(sans objet)"}</div>
                  <div className="truncate font-body text-[11px] text-slate-400">{decodeHtml(m.snippet)}</div>
                </button>
              </div>
            ))}
          </div>
          {gmail.nextPageToken && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 font-body text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Charger plus de messages
            </button>
          )}
        </div>
      )}
    </div>
  );
}
