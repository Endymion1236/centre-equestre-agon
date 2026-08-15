"use client";

/**
 * src/app/admin/boite/FicheNouvelleFamille.tsx
 *
 * Étape 4 — l'expéditeur est inconnu : fiche famille pré-remplie par l'IA à
 * partir du mail, à RELIRE et corriger, puis à créer d'un clic.
 *
 * Pourquoi séparé : ce bloc est le seul de l'écran qui crée des personnes en
 * base à partir d'un texte libre. Rien n'y est automatique et tout y est
 * éditable tant que la famille n'est pas créée ; une fois créée (`newFam`),
 * tous les champs passent en lecture seule pour qu'on ne croie pas modifier la
 * fiche en base en tapant dedans. Isolé, ce contrat « relu puis figé » se voit
 * d'un coup d'œil.
 *
 * `ageHint` n'est jamais envoyé : c'est l'âge mentionné dans le mail, gardé
 * uniquement comme aide à la saisie (infobulle et placeholder) pour retrouver
 * la vraie date de naissance.
 */

import { Loader2, Check, UserPlus } from "lucide-react";
import type { FicheFamille, NouvelleFamille, StatutAction } from "./types";

interface FicheNouvelleFamilleProps {
  famForm: FicheFamille;
  setFamForm: (v: FicheFamille) => void;
  newFam: NouvelleFamille | null;
  creatingFam: boolean;
  createFamily: () => void;
  famMsg: StatutAction | null;
}

export function FicheNouvelleFamille({
  famForm, setFamForm, newFam, creatingFam, createFamily, famMsg,
}: FicheNouvelleFamilleProps) {
  return (
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
  );
}
