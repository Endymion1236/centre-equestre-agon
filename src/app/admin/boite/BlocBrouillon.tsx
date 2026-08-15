"use client";

/**
 * src/app/admin/boite/BlocBrouillon.tsx
 *
 * Le brouillon de réponse : texte modifiable, envoi dans le fil Gmail, copie
 * dans le presse-papier.
 *
 * Pourquoi séparé : c'est le point de sortie de tout l'écran — le seul endroit
 * d'où un message part chez une famille. Le bouton « Envoyer » n'est proposé
 * que si un compte Gmail est connecté ; sinon la phrase du bas rappelle
 * explicitement que rien ne partira tout seul et qu'il faut copier-coller.
 * Cette règle « aucune action automatique » est la promesse faite en haut de
 * la page, elle méritait de tenir dans un fichier qu'on peut relire en entier.
 */

import type { Dispatch, SetStateAction } from "react";
import { Loader2, Copy, Check, Send } from "lucide-react";
import type { StatutAction } from "./types";

interface BlocBrouillonProps {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  gmailConnected: boolean;
  sending: boolean;
  sendReply: () => void;
  sendMsg: StatutAction | null;
  from: string;
  copied: boolean;
  copyDraft: () => void;
}

export function BlocBrouillon({
  draft, setDraft, gmailConnected, sending, sendReply, sendMsg, from, copied, copyDraft,
}: BlocBrouillonProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Brouillon de réponse
        </div>
        <div className="flex items-center gap-2">
          {gmailConnected && (
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
        {gmailConnected
          ? "« Envoyer » répond directement dans le fil Gmail (à ton clic). Sinon, copie et envoie depuis Gmail."
          : "Relis, ajuste, puis envoie toi-même depuis Gmail. Aucune action automatique."}
      </p>
    </div>
  );
}
