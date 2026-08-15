"use client";

/**
 * src/app/admin/boite/ListePrestations.tsx
 *
 * Les prestations proposées en réponse au mail : celles trouvées par
 * l'assistant, celles ajoutées à la main par l'admin depuis le catalogue, et
 * pour chacune le bouton d'inscription en 1 clic.
 *
 * Pourquoi séparé : c'est le bloc le plus dense de l'écran, et le seul où un
 * clic engage une place et une commande. Deux garde-fous s'y lisent
 * maintenant sans dérouler 200 lignes de page :
 *
 *  - le bouton « Inscrire » n'apparaît que si tout est réuni (créneau
 *    identifié, famille connue ou créée, enfant choisi) — sinon rien, plutôt
 *    qu'un bouton qui échouerait ;
 *  - une prestation déjà présente n'est jamais ajoutée deux fois par le
 *    sélecteur du catalogue.
 *
 * Le sélecteur de catalogue existe parce que l'IA ne propose pas toujours la
 * bonne chose : l'admin doit pouvoir compléter la liste avec une prestation
 * réellement disponible, marquée « ajout manuel » pour qu'on sache d'où elle
 * vient.
 */

import type { Dispatch, SetStateAction } from "react";
import { Loader2, Calendar, Check, UserPlus } from "lucide-react";
import type { EtatInscription, NouvelleFamille } from "./types";

interface ListePrestationsProps {
  res: any;
  manual: any[];
  setManual: Dispatch<SetStateAction<any[]>>;
  pickerValue: string;
  setPickerValue: Dispatch<SetStateAction<string>>;
  newFam: NouvelleFamille | null;
  chosenChild: Record<number, string>;
  setChosenChild: Dispatch<SetStateAction<Record<number, string>>>;
  enrollState: Record<number, EtatInscription>;
  enrollSuggestion: (s: any, i: number) => void;
  setDraft: Dispatch<SetStateAction<string>>;
}

export function ListePrestations({
  res, manual, setManual, pickerValue, setPickerValue,
  newFam, chosenChild, setChosenChild, enrollState, enrollSuggestion, setDraft,
}: ListePrestationsProps) {
  // Rien à montrer tant qu'il n'y a ni suggestion, ni ajout manuel, ni catalogue.
  if (!((Array.isArray(res.suggestions) && res.suggestions.length > 0) || manual.length > 0 || (Array.isArray(res.catalogue) && res.catalogue.length > 0))) {
    return null;
  }

  return (
    <div>
      <div className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Prestations disponibles proposées
      </div>
      <div className="space-y-2">
        {[...(res.suggestions || []), ...manual].map((s: any, i: number) => (
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
              {s.manual && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-body text-[10px] font-semibold text-slate-500">
                  ajout manuel
                </span>
              )}
              {s.manual && (
                <button
                  type="button"
                  onClick={() => {
                    const prixLbl =
                      typeof s.prixTTC === "number"
                        ? s.prixMode === "semaine"
                          ? `${s.prixTTC} € la semaine (${s.nbJours} jours)`
                          : `${s.prixTTC} €`
                        : "";
                    const ligne = `\n• ${s.titre} — ${s.periode || s.date}${s.horaire ? `, ${s.horaire}` : ""}${prixLbl ? ` (${prixLbl})` : ""}`;
                    setDraft((prev) => (prev ? `${prev}${ligne}` : ligne.trim()));
                  }}
                  className="rounded-full bg-blue-50 px-2 py-0.5 font-body text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
                  title="Ajouter cette prestation à la fin du brouillon de réponse"
                >
                  → brouillon
                </button>
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
              // Enfants sélectionnables : nouvelle famille créée OU famille connue (res.enfants)
              const famChildren: { id: string; firstName: string }[] = newFam
                ? newFam.children
                : (Array.isArray(res.enfants) ? res.enfants : [])
                    .filter((e: any) => e.childId)
                    .map((e: any) => ({ id: e.childId, firstName: e.prenom || "" }));
              const effChildId = s.childId || chosenChild[i] || famChildren[0]?.id || "";
              const effChildName =
                s.childName || famChildren.find((c) => c.id === effChildId)?.firstName || "";
              if (!s.actionable || !hasIds || !effFamilyId || !effChildId) return null;
              return (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Sélecteur d'enfant (suggestion sans enfant ciblé, plusieurs enfants) */}
                {!s.childId && famChildren.length > 1 && !enrollState[i]?.done && (
                  <select
                    value={chosenChild[i] || famChildren[0]?.id || ""}
                    onChange={(e) => setChosenChild((prev) => ({ ...prev, [i]: e.target.value }))}
                    className="rounded-md border border-blue-200 bg-white px-2 py-1 font-body text-[11px]"
                  >
                    {famChildren.map((c) => (
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
      {/* Ajout MANUEL d'une prestation du catalogue (l'admin complète l'IA) */}
      {Array.isArray(res.catalogue) && res.catalogue.length > 0 && (
        <div className="mt-2">
          <select
            value={pickerValue}
            onChange={(e) => {
              const key = e.target.value;
              if (!key) return;
              const entry = res.catalogue.find((c: any) => (c.groupId || c.creneauId) === key);
              const dejaPresent = [...(res.suggestions || []), ...manual].some(
                (s: any) => (s.groupId || s.creneauId) === key
              );
              if (entry && !dejaPresent) setManual((prev) => [...prev, entry]);
              setPickerValue("");
            }}
            className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5 font-body text-xs text-slate-600"
          >
            <option value="">+ Ajouter une prestation disponible…</option>
            {res.catalogue
              .filter((c: any) => ![...(res.suggestions || []), ...manual].some((s: any) => (s.groupId || s.creneauId) === (c.groupId || c.creneauId)))
              .map((c: any) => (
                <option key={c.groupId || c.creneauId} value={c.groupId || c.creneauId}>
                  {c.titre} — {c.periode || c.date}
                  {c.horaire ? ` · ${c.horaire}` : ""}
                  {typeof c.prixTTC === "number" ? ` · ${c.prixTTC} €${c.prixMode === "semaine" ? ` (${c.nbJours}j)` : ""}` : ""}
                  {c.places > 0 ? ` · ${c.places} pl.` : " · complet"}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
