"use client";

/**
 * src/app/admin/parametres/SectionStages.tsx
 *
 * Le déroulé type d'un stage, en deux séquences. Réglage unique partagé par
 * tous les stages, repris dans les emails de confirmation et de rappel.
 *
 * Tant qu'il est vide, aucun bloc n'apparaît dans les emails : on n'annonce
 * jamais un déroulé qu'on n'a pas saisi.
 */

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { STAGE_DEROULE_VIDE, derouleEstRempli, renderDerouleTexte, type StageDeroule } from "@/lib/stage-deroule";

export default function SectionStages() {

  // ─── Déroulé des stages (2 séquences) ────────────────────────────────────
  // Réglage unique partagé par tous les stages. Repris dans les emails de
  // confirmation ET de rappel. Tant qu'il est vide, aucun bloc n'apparaît
  // dans les emails : on n'annonce jamais un déroulé qu'on n'a pas saisi.
  const [deroule, setDeroule] = useState<StageDeroule>(STAGE_DEROULE_VIDE);
  const [derouleSaved, setDerouleSaved] = useState(false);
  useEffect(() => {
    getDoc(doc(db, "settings", "stageDeroule")).then(snap => {
      if (snap.exists()) setDeroule(prev => ({ ...prev, ...(snap.data() as any) }));
    });
  }, []);
  const saveDeroule = async () => {
    await setDoc(doc(db, "settings", "stageDeroule"), {
      sequence1Titre: deroule.sequence1Titre.trim(),
      sequence1Detail: deroule.sequence1Detail.trim(),
      sequence2Titre: deroule.sequence2Titre.trim(),
      sequence2Detail: deroule.sequence2Detail.trim(),
      note: (deroule.note || "").trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setDerouleSaved(true);
    setTimeout(() => setDerouleSaved(false), 2000);
  };

  return (
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="font-display text-lg font-bold text-blue-800 mb-1">🐴 Déroulé d’une séance de stage</h2>
        <p className="font-body text-sm text-slate-500 mb-5 leading-relaxed">
          Ce texte est repris dans l’email de <strong>confirmation d’inscription</strong> et dans celui de
          <strong> rappel avant le stage</strong>. Il évite qu’une famille lise « 10h–12h » et comprenne
          deux heures à cheval. Réglage unique, valable pour tous les stages.
        </p>

        {[1, 2].map((n) => {
          const kt = (n === 1 ? "sequence1Titre" : "sequence2Titre") as keyof StageDeroule;
          const kd = (n === 1 ? "sequence1Detail" : "sequence2Detail") as keyof StageDeroule;
          return (
            <div key={n} className="mb-4 pb-4 border-b border-gray-100 last:border-b-0">
              <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Séquence {n}
              </div>
              <input
                value={(deroule[kt] as string) || ""}
                onChange={(e) => setDeroule((d) => ({ ...d, [kt]: e.target.value }))}
                placeholder={n === 1 ? "Ex : 1re heure — Équitation montée" : "Ex : 2e heure — Atelier à pied"}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none mb-2"
              />
              <input
                value={(deroule[kd] as string) || ""}
                onChange={(e) => setDeroule((d) => ({ ...d, [kd]: e.target.value }))}
                placeholder={n === 1 ? "Ex : travail en carrière, jeux et parcours à poney" : "Ex : pansage, soins et connaissance du poney"}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"
              />
              <p className="font-body text-[10px] text-slate-400 mt-1">
                Titre obligatoire, détail facultatif.
              </p>
            </div>
          );
        })}

        <div className="mb-4">
          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Note complémentaire (facultatif)
          </div>
          <input
            value={deroule.note || ""}
            onChange={(e) => setDeroule((d) => ({ ...d, note: e.target.value }))}
            placeholder="Ex : l’ordre des deux séquences peut être inversé selon les groupes."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"
          />
        </div>

        {/* Aperçu — ce que la famille lira réellement */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="font-body text-[10px] font-semibold text-amber-800 uppercase tracking-wider mb-2">
            Aperçu dans l’email
          </div>
          {derouleEstRempli(deroule) ? (
            <pre className="font-body text-xs text-slate-700 whitespace-pre-wrap m-0">{renderDerouleTexte(deroule)}</pre>
          ) : (
            <p className="font-body text-xs text-amber-700 m-0">
              Les deux titres doivent être renseignés. Tant qu’ils sont vides, <strong>aucun bloc
              n’est ajouté aux emails</strong> — ils partent comme aujourd’hui.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveDeroule}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold border-none cursor-pointer"
          >
            Enregistrer
          </button>
          {derouleSaved && <span className="font-body text-sm text-green-600">Enregistré ✓</span>}
        </div>
      </div>
  );
}
