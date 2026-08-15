/**
 * src/app/admin/boite/gmail-actions.ts
 *
 * Tous les appels à la boîte Gmail depuis l'écran : lister les messages,
 * charger la page suivante, (re)connecter le compte, mettre à la corbeille,
 * transférer, répondre.
 *
 * Pourquoi hors du composant : ces sept fonctions ont un point commun — elles
 * agissent sur la VRAIE boîte mail du centre. Un mail mis à la corbeille ou
 * une réponse envoyée ne se rattrapent pas. Réunies ici, on voit d'un coup
 * d'œil que chacune est protégée par une confirmation ou un garde-fou
 * (`mailboxBusy` empêche le double-clic, `confirm()` précède toute
 * suppression) et qu'aucune n'est déclenchée par un rendu.
 *
 * Les dépendances sont toutes explicites : la page passe ce qu'elle a en
 * mémoire et les `setState` à mettre à jour. Aucune de ces fonctions ne lit
 * l'état de React directement.
 */

import type { Dispatch, SetStateAction } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { ActionBoite, EtatGmail, StatutAction } from "./types";

/** Charge (ou recharge) la première page de messages. */
export const chargerGmail = async (setGmail: Dispatch<SetStateAction<EtatGmail>>) => {
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
      email: d.email ?? null,
      nextPageToken: d.nextPageToken ?? null,
    });
  } catch {
    setGmail((g) => ({ ...g, loading: false, error: "Erreur réseau" }));
  }
};

/** Lance (ou relance) l'autorisation Google — quitte la page si tout va bien. */
export const connecterGmail = async (deps: {
  setGmail: Dispatch<SetStateAction<EtatGmail>>;
  setConnecting: Dispatch<SetStateAction<boolean>>;
}) => {
  const { setGmail, setConnecting } = deps;
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

/** Page suivante de la liste Gmail (bouton « Charger plus de messages »). */
export const chargerPlusDeMessages = async (deps: {
  gmail: EtatGmail;
  loadingMore: boolean;
  setGmail: Dispatch<SetStateAction<EtatGmail>>;
  setLoadingMore: Dispatch<SetStateAction<boolean>>;
}) => {
  const { gmail, loadingMore, setGmail, setLoadingMore } = deps;
  if (!gmail.nextPageToken || loadingMore) return;
  setLoadingMore(true);
  try {
    const r = await authFetch(`/api/admin/gmail/messages?pageToken=${encodeURIComponent(gmail.nextPageToken)}`);
    const d = await r.json();
    if (r.ok && Array.isArray(d.messages)) {
      setGmail((g) => {
        // Dédoublonnage : une page peut chevaucher si la boîte a bougé.
        const vus = new Set(g.messages.map((m: any) => m.id));
        const nouveaux = d.messages.filter((m: any) => !vus.has(m.id));
        return { ...g, messages: [...g.messages, ...nouveaux], nextPageToken: d.nextPageToken || null };
      });
    }
  } catch {
    /* silencieux : le bouton reste disponible pour réessayer */
  }
  setLoadingMore(false);
};

/**
 * Corbeille en lot (mails cochés dans la liste).
 *
 * Le retour de l'API est traité comme partiellement réussi : on retire de la
 * liste ce qui a réellement été supprimé (`d.trashed`) et on annonce le nombre
 * d'échecs, plutôt que de faire comme si rien ne s'était passé.
 */
export const mettreALaCorbeilleSelection = async (deps: {
  selectedIds: string[];
  selectedId: string;
  mailboxBusy: ActionBoite;
  setMailboxBusy: Dispatch<SetStateAction<ActionBoite>>;
  setMailboxMsg: Dispatch<SetStateAction<StatutAction | null>>;
  setGmail: Dispatch<SetStateAction<EtatGmail>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  viderMailSelectionne: () => void;
}) => {
  const {
    selectedIds, selectedId, mailboxBusy,
    setMailboxBusy, setMailboxMsg, setGmail, setSelectedIds, viderMailSelectionne,
  } = deps;

  if (selectedIds.length === 0 || mailboxBusy) return;
  const n = selectedIds.length;
  if (!confirm(`Mettre ${n} mail${n > 1 ? "s" : ""} à la corbeille Gmail ?`)) return;
  setMailboxBusy("trash");
  setMailboxMsg(null);
  try {
    const r = await authFetch("/api/admin/gmail/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const d = await r.json();
    if (r.ok || (d.trashed && d.trashed.length)) {
      const trashed: string[] = d.trashed || selectedIds;
      setGmail((g) => ({ ...g, messages: g.messages.filter((m: any) => !trashed.includes(m.id)) }));
      if (trashed.includes(selectedId)) {
        viderMailSelectionne();
      }
      setSelectedIds((prev) => prev.filter((x) => !trashed.includes(x)));
      const nFailed = (d.failed || []).length;
      setMailboxMsg({
        ok: nFailed === 0,
        text: nFailed === 0
          ? `${trashed.length} mail${trashed.length > 1 ? "s" : ""} à la corbeille ✓`
          : `${trashed.length} supprimé(s), ${nFailed} en échec`,
      });
    } else {
      setMailboxMsg({ ok: false, text: d.error || "Échec de la suppression" });
    }
  } catch {
    setMailboxMsg({ ok: false, text: "Erreur réseau" });
  }
  setMailboxBusy("");
};

/** Corbeille du seul mail ouvert dans le panneau de gauche. */
export const mettreALaCorbeille = async (deps: {
  selectedId: string;
  mailboxBusy: ActionBoite;
  setMailboxBusy: Dispatch<SetStateAction<ActionBoite>>;
  setMailboxMsg: Dispatch<SetStateAction<StatutAction | null>>;
  setGmail: Dispatch<SetStateAction<EtatGmail>>;
  viderMailSelectionne: () => void;
}) => {
  const { selectedId, mailboxBusy, setMailboxBusy, setMailboxMsg, setGmail, viderMailSelectionne } = deps;

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
      viderMailSelectionne();
      setMailboxMsg({ ok: true, text: "Mail mis à la corbeille ✓" });
    } else {
      setMailboxMsg({ ok: false, text: d.error || "Échec de la suppression" });
    }
  } catch {
    setMailboxMsg({ ok: false, text: "Erreur réseau" });
  }
  setMailboxBusy("");
};

/** Transfert du mail affiché vers une adresse saisie à la volée. */
export const transfererMail = async (deps: {
  from: string;
  subject: string;
  body: string;
  mailboxBusy: ActionBoite;
  setMailboxBusy: Dispatch<SetStateAction<ActionBoite>>;
  setMailboxMsg: Dispatch<SetStateAction<StatutAction | null>>;
}) => {
  const { from, subject, body, mailboxBusy, setMailboxBusy, setMailboxMsg } = deps;

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
    setMailboxMsg(r.ok
      ? { ok: true, text: `Transféré à ${dest.trim()} depuis ${d.account || "la boîte connectée"} ✓` }
      : { ok: false, text: d.error || "Échec du transfert" });
  } catch {
    setMailboxMsg({ ok: false, text: "Erreur réseau" });
  }
  setMailboxBusy("");
};

/** Envoi du brouillon dans le fil Gmail d'origine, après confirmation. */
export const envoyerReponse = async (deps: {
  from: string;
  subject: string;
  draft: string;
  replyMeta: { threadId: string; messageId: string };
  sending: boolean;
  setSending: Dispatch<SetStateAction<boolean>>;
  setSendMsg: Dispatch<SetStateAction<StatutAction | null>>;
}) => {
  const { from, subject, draft, replyMeta, sending, setSending, setSendMsg } = deps;

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
    // On precise DEPUIS QUEL compte le message est parti : c'est dans les
    // « Envoyes » de celui-ci qu'il se range, et nulle part ailleurs.
    setSendMsg(r.ok
      ? { ok: true, text: d.account ? `Réponse envoyée depuis ${d.account} ✓` : "Réponse envoyée ✓" }
      : { ok: false, text: d.error || "Échec de l'envoi" });
  } catch {
    setSendMsg({ ok: false, text: "Erreur réseau" });
  }
  setSending(false);
};
