"use client";

/**
 * src/app/admin/boite/PanneauMailRecu.tsx
 *
 * Colonne de gauche : le mail en cours (expéditeur, objet, corps), ses deux
 * actions Gmail (transférer, supprimer) et le bouton « Analyser ».
 *
 * Pourquoi séparé : les trois champs sont ÉDITABLES à la main. C'est
 * volontaire — on peut coller un mail reçu ailleurs, corriger une
 * transcription vocale approximative, ou retirer une signature avant de faire
 * analyser. Ce panneau est donc autant une zone de saisie qu'un affichage, et
 * c'est ce texte-là, pas le mail d'origine, qui part à l'assistant.
 *
 * Le bandeau vocal (numéro, durée, famille reconnue) s'affiche ici parce qu'il
 * qualifie ce qui est dans les champs : sans lui, l'admin ne saurait pas que
 * le texte qu'il relit vient d'une transcription automatique.
 */

import type { Dispatch, SetStateAction } from "react";
import { Loader2, Mail, Sparkles, Trash2, Forward, Phone } from "lucide-react";
import type { ActionBoite, StatutAction } from "./types";

interface PanneauMailRecuProps {
  selectedId: string;
  mailboxBusy: ActionBoite;
  forwardMail: () => void;
  deleteMail: () => void;
  vocalLoading: boolean;
  vocal: any;
  mailboxMsg: StatutAction | null;
  from: string;
  setFrom: Dispatch<SetStateAction<string>>;
  subject: string;
  setSubject: Dispatch<SetStateAction<string>>;
  body: string;
  setBody: Dispatch<SetStateAction<string>>;
  analyser: () => void;
  loading: boolean;
  err: string;
}

export function PanneauMailRecu({
  selectedId, mailboxBusy, forwardMail, deleteMail,
  vocalLoading, vocal, mailboxMsg,
  from, setFrom, subject, setSubject, body, setBody,
  analyser, loading, err,
}: PanneauMailRecuProps) {
  return (
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
      {vocalLoading && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 font-body text-xs font-semibold text-amber-700">
          <Loader2 size={14} className="animate-spin" /> Transcription du message vocal…
        </div>
      )}
      {vocal && !vocalLoading && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 font-body text-xs font-semibold text-amber-800">
            <Phone size={13} />
            {vocal.numeroLisible || "Numéro masqué"}
            <span className="font-normal text-amber-600">· {vocal.dureeSec}s</span>
          </div>
          <div className="mt-1 font-body text-[11px] text-amber-700">
            {vocal.famille ? (
              <>
                Famille reconnue : <strong>{vocal.famille.parentName}</strong>
                {vocal.famille.children?.length > 0 && (
                  <> — {vocal.famille.children.map((c: any) => c.firstName).join(", ")}</>
                )}
              </>
            ) : vocal.vide ? (
              "Message vide."
            ) : (
              "Numéro inconnu de la base — l'analyse proposera une création de famille."
            )}
          </div>
        </div>
      )}
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
  );
}
