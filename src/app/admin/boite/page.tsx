"use client";

/**
 * src/app/admin/boite/page.tsx
 *
 * Boîte de réception assistée : on choisit un mail Gmail, l'assistant le
 * classe, le résume, propose un brouillon de réponse et les prestations
 * réellement disponibles — puis, si besoin, crée la famille et inscrit
 * l'enfant en un clic.
 *
 * Cette page est l'ORCHESTRATEUR : elle détient tout l'état (le mail en cours,
 * le résultat d'analyse, la fiche famille, les sélections) et le distribue.
 * Ce qui appelle le réseau ou dessine un bloc vit à côté :
 *
 *   - types.ts               formes des états partagés (Gmail, fiche famille, inscriptions)
 *   - mail-utils.ts          libellés de classification, décodage HTML, détection d'un vocal
 *   - gmail-actions.ts       lister / paginer / connecter / corbeille / transfert / envoi
 *   - assistant-actions.ts   transcription vocale, création de famille, inscription 1-clic
 *   - PanneauGmail           liste des mails et état de la connexion
 *   - PanneauMailRecu        le mail en cours (éditable) et le bouton Analyser
 *   - FicheNouvelleFamille   fiche pré-remplie à relire puis créer
 *   - ListePrestations       suggestions + catalogue + inscription
 *   - BlocBrouillon          la réponse, son envoi et sa copie
 *
 * Pourquoi ce découpage : l'écran enchaîne des actions irréversibles sur des
 * systèmes différents (la boîte mail réelle, la base des familles, les
 * commandes). Chacune méritait d'être lisible seule, avec ses garde-fous, sans
 * être noyée dans 600 lignes de JSX.
 *
 * `analyser` est volontairement restée ici : elle ne fait pas qu'appeler
 * l'API, elle remet à zéro la moitié de l'état de la page (suggestions,
 * ajouts manuels, famille créée, enfants choisis). C'est le rôle de
 * l'orchestrateur, pas d'un module d'appel réseau.
 */

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2 } from "lucide-react";
import { CLASSIF, decodeHtml, estVocal } from "./mail-utils";
import type {
  ActionBoite, EtatGmail, EtatInscription, FicheFamille, NouvelleFamille, StatutAction,
} from "./types";
import {
  chargerGmail, connecterGmail, chargerPlusDeMessages,
  mettreALaCorbeilleSelection, mettreALaCorbeille, transfererMail, envoyerReponse,
} from "./gmail-actions";
import { transcrireVocal, creerFamille, inscrireSuggestion } from "./assistant-actions";
import { PanneauGmail } from "./PanneauGmail";
import { PanneauMailRecu } from "./PanneauMailRecu";
import { FicheNouvelleFamille } from "./FicheNouvelleFamille";
import { ListePrestations } from "./ListePrestations";
import { BlocBrouillon } from "./BlocBrouillon";

export default function BoiteAssistantPage() {
  const [vocal, setVocal] = useState<any>(null);
  const [vocalLoading, setVocalLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  // Suivi de l'inscription 1-clic par suggestion (index → état)
  const [enrollState, setEnrollState] = useState<Record<number, EtatInscription>>({});
  // Étape 4 — nouvelle famille (expéditeur inconnu) : fiche pré-remplie par
  // l'IA, RELUE par l'admin, créée au clic. Puis les inscriptions se font
  // sur cette famille fraîchement créée.
  const [famForm, setFamForm] = useState<FicheFamille | null>(null);
  const [newFam, setNewFam] = useState<NouvelleFamille | null>(null);
  const [creatingFam, setCreatingFam] = useState(false);
  const [famMsg, setFamMsg] = useState<StatutAction | null>(null);
  const [chosenChild, setChosenChild] = useState<Record<number, string>>({});
  // Ajouts MANUELS de prestations par l'admin (depuis res.catalogue)
  const [manual, setManual] = useState<any[]>([]);
  const [pickerValue, setPickerValue] = useState("");

  // ── Gmail ──
  const [gmail, setGmail] = useState<EtatGmail>({ loading: true, configured: false, connected: false, messages: [], error: "", email: null, nextPageToken: null });
  const [connecting, setConnecting] = useState(false);
  const [replyMeta, setReplyMeta] = useState<{ threadId: string; messageId: string }>({ threadId: "", messageId: "" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [mailboxBusy, setMailboxBusy] = useState<ActionBoite>("");
  const [mailboxMsg, setMailboxMsg] = useState<StatutAction | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<StatutAction | null>(null);

  /** Le mail affiché vient de disparaître (corbeille) : on vide le panneau. */
  const viderMailSelectionne = () => {
    setFrom("");
    setSubject("");
    setBody("");
    setSelectedId("");
    setRes(null);
  };

  const deleteSelected = () => mettreALaCorbeilleSelection({
    selectedIds, selectedId, mailboxBusy,
    setMailboxBusy, setMailboxMsg, setGmail, setSelectedIds, viderMailSelectionne,
  });

  const loadMore = () => chargerPlusDeMessages({ gmail, loadingMore, setGmail, setLoadingMore });

  const deleteMail = () => mettreALaCorbeille({
    selectedId, mailboxBusy, setMailboxBusy, setMailboxMsg, setGmail, viderMailSelectionne,
  });

  const forwardMail = () => transfererMail({ from, subject, body, mailboxBusy, setMailboxBusy, setMailboxMsg });

  const sendReply = () => envoyerReponse({ from, subject, draft, replyMeta, sending, setSending, setSendMsg });

  const loadGmail = () => chargerGmail(setGmail);

  useEffect(() => {
    loadGmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGmail = () => connecterGmail({ setGmail, setConnecting });

  const pickMessage = async (m: any) => {
    setFrom(decodeHtml(m.from || ""));
    setSubject(decodeHtml(m.subject || ""));
    setBody(decodeHtml(m.body || m.snippet || ""));
    setReplyMeta({ threadId: m.threadId || "", messageId: m.messageId || "" });
    setSelectedId(m.id || "");
    setMailboxMsg(null);
    setRes(null);
    setErr("");
    setSendMsg(null);
    setVocal(null);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Message du répondeur → on remplace le mail de notification par la
    // TRANSCRIPTION du message vocal. Le reste de la page (analyse, brouillon,
    // création de famille) fonctionne ensuite à l'identique.
    if (estVocal(m)) {
      await transcrireVocal({ message: m, setVocalLoading, setErr, setFrom, setSubject, setBody, setVocal });
    }
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
        setManual([]);
        setPickerValue("");
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

  const createFamily = () => creerFamille({ famForm, setCreatingFam, setFamMsg, setNewFam });

  const enrollSuggestion = (s: any, i: number) => inscrireSuggestion(s, i, { res, newFam, chosenChild, setEnrollState });

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
      <PanneauGmail
        gmail={gmail}
        connecting={connecting}
        connectGmail={connectGmail}
        loadGmail={loadGmail}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        deleteSelected={deleteSelected}
        mailboxBusy={mailboxBusy}
        loadMore={loadMore}
        loadingMore={loadingMore}
        pickMessage={pickMessage}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Entrée */}
        <PanneauMailRecu
          selectedId={selectedId}
          mailboxBusy={mailboxBusy}
          forwardMail={forwardMail}
          deleteMail={deleteMail}
          vocalLoading={vocalLoading}
          vocal={vocal}
          mailboxMsg={mailboxMsg}
          from={from}
          setFrom={setFrom}
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          analyser={analyser}
          loading={loading}
          err={err}
        />

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
                <FicheNouvelleFamille
                  famForm={famForm}
                  setFamForm={setFamForm}
                  newFam={newFam}
                  creatingFam={creatingFam}
                  createFamily={createFamily}
                  famMsg={famMsg}
                />
              )}

              <ListePrestations
                res={res}
                manual={manual}
                setManual={setManual}
                pickerValue={pickerValue}
                setPickerValue={setPickerValue}
                newFam={newFam}
                chosenChild={chosenChild}
                setChosenChild={setChosenChild}
                enrollState={enrollState}
                enrollSuggestion={enrollSuggestion}
                setDraft={setDraft}
              />

              <BlocBrouillon
                draft={draft}
                setDraft={setDraft}
                gmailConnected={gmail.connected}
                sending={sending}
                sendReply={sendReply}
                sendMsg={sendMsg}
                from={from}
                copied={copied}
                copyDraft={copyDraft}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
