/**
 * src/app/admin/boite/assistant-actions.ts
 *
 * Les trois actions qui vont au-delà de la lecture d'un mail : transcrire un
 * message du répondeur, créer la famille pré-remplie par l'IA, inscrire un
 * enfant en 1 clic.
 *
 * Pourquoi hors du composant : ce sont les seules qui ÉCRIVENT dans la base du
 * centre à partir d'un texte rédigé par quelqu'un d'autre (un parent, une
 * transcription automatique). Chacune est donc précédée d'une relecture
 * humaine — la fiche famille est éditable avant création, l'inscription
 * demande un clic explicite par prestation — et le serveur revérifie tout de
 * son côté. Sorties du JSX, ces garde-fous restent visibles.
 *
 * Dépendances explicites : la page passe son état courant et les `setState`
 * concernés, ces fonctions ne lisent rien d'elles-mêmes.
 */

import type { Dispatch, SetStateAction } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { EtatInscription, FicheFamille, NouvelleFamille, StatutAction } from "./types";

/**
 * Transcrit la pièce jointe audio d'un message du répondeur et remplace le
 * mail de notification par son contenu (expéditeur, objet, corps).
 *
 * En cas d'échec on n'écrase rien : le mail d'origine reste affiché et
 * l'erreur est annoncée — mieux vaut un mail de notification illisible qu'un
 * champ vidé sans qu'on sache pourquoi.
 */
export const transcrireVocal = async (deps: {
  message: any;
  setVocalLoading: Dispatch<SetStateAction<boolean>>;
  setErr: Dispatch<SetStateAction<string>>;
  setFrom: Dispatch<SetStateAction<string>>;
  setSubject: Dispatch<SetStateAction<string>>;
  setBody: Dispatch<SetStateAction<string>>;
  setVocal: Dispatch<SetStateAction<any>>;
}) => {
  const { message: m, setVocalLoading, setErr, setFrom, setSubject, setBody, setVocal } = deps;

  setVocalLoading(true);
  try {
    const r = await authFetch("/api/admin/gmail/voicemail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: m.id,
        attachmentId: m.audioAttachmentId,
        subject: m.subject,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error || "Transcription impossible");
    } else {
      setFrom(d.from || "");
      setSubject(d.subject || "");
      setBody(d.body || "");
      setVocal(d);
    }
  } catch {
    setErr("Transcription impossible");
  }
  setVocalLoading(false);
};

// ── Création de la nouvelle famille (étape 4) — jamais automatique ──
export const creerFamille = async (deps: {
  famForm: FicheFamille | null;
  setCreatingFam: Dispatch<SetStateAction<boolean>>;
  setFamMsg: Dispatch<SetStateAction<StatutAction | null>>;
  setNewFam: Dispatch<SetStateAction<NouvelleFamille | null>>;
}) => {
  const { famForm, setCreatingFam, setFamMsg, setNewFam } = deps;

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
export const inscrireSuggestion = async (
  s: any,
  i: number,
  deps: {
    res: any;
    newFam: NouvelleFamille | null;
    chosenChild: Record<number, string>;
    setEnrollState: Dispatch<SetStateAction<Record<number, EtatInscription>>>;
  },
) => {
  const { res, newFam, chosenChild, setEnrollState } = deps;

  const ids: string[] = Array.isArray(s?.creneauIds) && s.creneauIds.length > 0 ? s.creneauIds : s?.creneauId ? [s.creneauId] : [];
  const effFamilyId = res?.familyId || newFam?.familyId || "";
  const famChildren: { id: string; firstName: string }[] = newFam
    ? newFam.children
    : (Array.isArray(res?.enfants) ? res.enfants : [])
        .filter((e: any) => e.childId)
        .map((e: any) => ({ id: e.childId, firstName: e.prenom || "" }));
  const effChildId = s?.childId || chosenChild[i] || famChildren[0]?.id || "";
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
