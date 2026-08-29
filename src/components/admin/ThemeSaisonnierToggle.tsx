"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Sparkles } from "lucide-react";
import { THEMES_LISTE, THEMES, type ThemeId } from "@/lib/themes-saisonniers";

/**
 * Choix du thème saisonnier du site vitrine.
 *
 * Activation manuelle : pas de déclenchement par date, pour ne pas voir
 * apparaître des citrouilles un matin sans l'avoir décidé.
 */
export default function ThemeSaisonnierToggle() {
  const [themeId, setThemeId] = useState<ThemeId>("aucun");
  const [message, setMessage] = useState("");
  const [lien, setLien] = useState("");
  const [saving, setSaving] = useState(false);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "theme"))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data() as any;
          setThemeId((d.themeId || "aucun") as ThemeId);
          setMessage(d.message || "");
          setLien(d.lien || "");
        }
      })
      .finally(() => setCharge(true));
  }, []);

  const enregistrer = async (champs: Record<string, any>) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "theme"),
        { themeId, message, lien, actif: true, ...champs, updatedAt: serverTimestamp() },
        { merge: true });
    } catch { /* noop */ }
    setSaving(false);
  };

  const actuel = THEMES[themeId];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-50">
          <Sparkles size={17} className="text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-sm font-semibold text-slate-800">Thème saisonnier du site</div>
          <div className="mt-0.5 font-body text-xs text-slate-500">
            Ajoute un bandeau d&apos;annonce et quelques décorations sur le site public.
            Les couleurs du centre ne changent pas.
          </div>

          {!charge ? (
            <div className="mt-3 flex items-center gap-2 font-body text-xs text-slate-400">
              <Loader2 size={13} className="animate-spin" /> Chargement…
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {THEMES_LISTE.map(t => (
                  <button type="button" key={t.id}
                    onClick={() => {
                      setThemeId(t.id);
                      const msg = t.id === "aucun" ? "" : (message || t.messageDefaut);
                      setMessage(msg);
                      enregistrer({ themeId: t.id, message: msg });
                    }}
                    disabled={saving}
                    className={`rounded-xl border px-3 py-2 font-body text-xs font-semibold cursor-pointer ${
                      themeId === t.id
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-slate-600 border-gray-200 hover:border-violet-300"
                    }`}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>

              {themeId !== "aucun" && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <label className="font-body text-xs font-semibold text-slate-600">
                    Message du bandeau
                  </label>
                  <input value={message} onChange={e => setMessage(e.target.value)}
                    onBlur={() => enregistrer({ message })}
                    placeholder={actuel.messageDefaut}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-body text-sm" />

                  <label className="font-body text-xs font-semibold text-slate-600">
                    Lien au clic (facultatif)
                  </label>
                  <input value={lien} onChange={e => setLien(e.target.value)}
                    onBlur={() => enregistrer({ lien })}
                    placeholder="/planning ou /activites/animation-halloween"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-body text-sm" />

                  <div className="mt-2 rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 font-body text-[11px] text-slate-500 leading-relaxed">
                    Ce thème remplace aussi le titre d&apos;accueil par «&nbsp;{actuel.emoji} {actuel.heroTitre} {actuel.heroSousTitre}&nbsp;»,
                    teinte la photo d&apos;accueil et ajoute des décorations sur tout le site public.
                    Le logo et la charte du centre restent inchangés.
                  </div>

                  {/* Aperçu : évite d'aller vérifier sur le site public */}
                  <div className="mt-2">
                    <div className="font-body text-[11px] text-slate-400 mb-1">Aperçu</div>
                    <div className="rounded-lg px-4 py-2.5 text-center font-body text-sm font-semibold"
                      style={{ background: actuel.bandeauFond, color: actuel.bandeauTexte, borderBottom: `2px solid ${actuel.bandeauBordure}` }}>
                      {actuel.emoji} {message || actuel.messageDefaut}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
