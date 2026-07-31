"use client";
import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

/**
 * Assistant de rédaction IA pour un champ texte.
 *
 * Principe non negociable : la proposition n'ecrase JAMAIS le champ
 * automatiquement. Elle s'affiche en apercu, et seul un clic explicite
 * l'applique — un texte travaille ne doit pas disparaitre a cause d'une
 * generation ratee.
 *
 * Utilise pour les descriptions d'activites (admin) et les fiches du site
 * vitrine (Contenu). Une seule implementation pour les deux.
 */

export type ChampRedaction = "description" | "intro" | "features" | "practical";

interface Props {
  /** Champ vise : determine la forme attendue (paragraphe ou lignes). */
  champ: ChampRedaction;
  /** Valeur actuelle. Pour les listes, une ligne par element. */
  valeur: string;
  /** Appele quand l'utilisateur accepte la proposition. */
  onApply: (texte: string) => void;
  /** Contexte de l'activite, pour que le texte soit juste. */
  contexte: {
    titre?: string;
    typeActivite?: string;
    ageMin?: number;
    ageMax?: number;
    dureeMinutes?: number;
    /** Horaires, tarif affiche… tout ce qui aide sans etre un champ dedie. */
    contexteLibre?: string;
  };
  /** Exemple de consigne, adapte au champ. */
  placeholder?: string;
}

const LIBELLES: Record<ChampRedaction, string> = {
  description: "la description",
  intro: "l’introduction",
  features: "les points forts",
  practical: "les infos pratiques",
};

export default function AssistantRedaction({ champ, valeur, onApply, contexte, placeholder }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [proposition, setProposition] = useState("");
  const [erreur, setErreur] = useState("");

  const generer = async () => {
    setEnCours(true);
    setErreur("");
    setProposition("");
    try {
      const r = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "description_activite",
          champ,
          currentText: valeur || "",
          userPrompt: prompt,
          ...contexte,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.description) {
        setErreur(d?.error || "La génération a échoué. Réessayez.");
      } else {
        setProposition(String(d.description).trim());
      }
    } catch {
      setErreur("Erreur réseau.");
    }
    setEnCours(false);
  };

  const appliquer = () => {
    onApply(proposition);
    setProposition("");
    setOuvert(false);
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-lg px-2.5 py-1 cursor-pointer transition-colors"
      >
        <Sparkles size={11} /> {ouvert ? "Fermer l’assistant" : `Rédiger ${LIBELLES[champ]} avec l’IA`}
      </button>

      {ouvert && (
        <div className="mt-2 rounded-xl border border-purple-100 bg-purple-50/60 p-3">
          <label className="font-body text-[10px] font-semibold text-purple-800 uppercase tracking-wider block mb-1.5">
            Consigne (facultative)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder={placeholder || "Ex : ton rassurant, insiste sur l’autonomie et les jeux"}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-purple-400 focus:outline-none resize-y"
          />
          <p className="font-body text-[10px] text-slate-500 mt-1">
            {valeur?.trim()
              ? "Le texte actuel sera amélioré en gardant son intention."
              : "Aucun texte pour l’instant : il sera rédigé entièrement."}
          </p>

          <button
            type="button"
            onClick={generer}
            disabled={enCours}
            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 text-white font-body text-xs font-semibold border-none cursor-pointer disabled:opacity-50"
          >
            {enCours ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {enCours ? "Rédaction…" : "Générer une proposition"}
          </button>

          {erreur && <p className="font-body text-[11px] text-red-600 mt-2">{erreur}</p>}

          {proposition && (
            <div className="mt-3">
              <div className="font-body text-[10px] font-semibold text-purple-800 uppercase tracking-wider mb-1.5">
                Proposition
              </div>
              <div className="bg-white border border-purple-100 rounded-lg p-3 font-body text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                {proposition}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={appliquer}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white font-body text-xs font-semibold border-none cursor-pointer"
                >
                  <Check size={12} /> Utiliser ce texte
                </button>
                <button
                  type="button"
                  onClick={generer}
                  disabled={enCours}
                  className="px-3 py-1.5 rounded-lg bg-white text-purple-700 border border-purple-200 font-body text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Autre proposition
                </button>
                <button
                  type="button"
                  onClick={() => setProposition("")}
                  className="px-3 py-1.5 rounded-lg bg-transparent text-slate-500 border-none font-body text-xs cursor-pointer"
                >
                  Ignorer
                </button>
              </div>
              <p className="font-body text-[10px] text-slate-400 mt-1.5">
                Rien n’est modifié tant que vous n’avez pas cliqué sur « Utiliser ce texte ».
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
