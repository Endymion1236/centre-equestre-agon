"use client";

/**
 * Borne — tableau du jour.
 *
 * Un écran à laisser affiché à l'accueil les premières semaines : les cours
 * d'aujourd'hui, le prénom des cavaliers, le moniteur. Le cours en cours est
 * mis en avant, le suivant annoncé. Se rafraîchit toute seule chaque minute.
 *
 * Même exigence que la borne vocale : la tablette doit être connectée au
 * compte du club. Pour revenir à Câlin : bouton en bas de page.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import type { CarteTableau } from "@/lib/borne-tableau";

const RAFRAICHISSEMENT_MS = 60_000;

const ETIQUETTE: Record<CarteTableau["etat"], { texte: string; cls: string }> = {
  en_cours: { texte: "En cours", cls: "bg-green-500 text-white" },
  bientot: { texte: "Bientôt", cls: "bg-amber-400 text-blue-900" },
  a_venir: { texte: "Plus tard", cls: "bg-white/15 text-white/80" },
};

export default function BorneTableauPage() {
  const { user, loading: authLoading } = useAuth();
  const [cartes, setCartes] = useState<CarteTableau[] | null>(null);
  const [heure, setHeure] = useState("");
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    try {
      const r = await authFetch("/api/borne/tableau");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
      setCartes(d.cartes || []);
      setHeure(d.heure || "");
      setErreur("");
    } catch (e: any) {
      setErreur(e?.message || "Tableau indisponible");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void charger();
    const t = setInterval(() => void charger(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(t);
  }, [user, charger]);

  if (authLoading) {
    return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-3">Borne non connectée</h1>
          <p className="font-body text-sm text-gray-500 mb-6">Connectez cette tablette avec le compte du club pour afficher le tableau du jour.</p>
          <a href="/espace-cavalier" className="inline-block px-6 py-3 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold no-underline">Se connecter</a>
        </div>
      </div>
    );
  }

  const dateLongue = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="min-h-screen bg-[#0C1A2E] text-white px-6 py-8 md:px-10">
      <header className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <div className="font-body text-xs uppercase tracking-[0.2em] text-amber-300 mb-1">Centre Équestre d&apos;Agon-Coutainville</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">Bienvenue&nbsp;!</h1>
          <p className="font-body text-white/70 text-base mt-1 capitalize">{dateLongue}{heure ? ` · ${heure}` : ""}</p>
        </div>
        <p className="font-body text-sm text-white/60 max-w-xs">Retrouvez votre cours, votre prénom et votre poney ci-dessous. Parents : café et thé vous attendent dans la salle de club.</p>
      </header>

      {erreur && <p className="font-body text-sm text-red-300 mb-4">{erreur}</p>}
      {cartes === null && !erreur && <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-white/60" /></div>}
      {cartes && cartes.length === 0 && (
        <p className="font-body text-xl text-white/70 py-16 text-center">Plus de cours aujourd&apos;hui. À bientôt&nbsp;!</p>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(cartes || []).map((c) => {
          const e = ETIQUETTE[c.etat];
          const enCours = c.etat === "en_cours";
          return (
            <section key={c.id} className={`rounded-2xl p-5 border ${enCours ? "bg-white text-blue-900 border-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.35)]" : "bg-white/5 border-white/10"}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className={`font-display text-2xl font-bold leading-tight ${enCours ? "text-blue-900" : "text-white"}`}>{c.titre}</div>
                  <div className={`font-body text-base mt-0.5 ${enCours ? "text-blue-900/70" : "text-white/70"}`}>{c.horaire}{c.moniteur ? ` · avec ${c.moniteur}` : ""}</div>
                </div>
                <span className={`font-body text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${e.cls}`}>{e.texte}</span>
              </div>
              <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                {c.cavaliers.map((r) => (
                  <li key={`${r.prenom}|${r.poney}`} className={`font-body px-3 py-1.5 rounded-xl ${enCours ? "bg-amber-100 text-blue-900" : "bg-white/10 text-white"}`}>
                    <span className="text-lg font-semibold">{r.prenom}</span>
                    {r.poney
                      ? <span className={`ml-2 text-base ${enCours ? "text-blue-900/70" : "text-white/70"}`}>🐴 {r.poney}</span>
                      : <span className={`ml-2 text-sm italic ${enCours ? "text-blue-900/40" : "text-white/40"}`}>poney à venir</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-10 flex items-center justify-between gap-4 flex-wrap">
        <span className="font-body text-xs text-white/40">Mise à jour automatique chaque minute.</span>
        <a href="/borne" className="font-body text-sm text-white/70 no-underline border border-white/20 rounded-xl px-4 py-2 hover:bg-white/10">Revenir à l&apos;assistant Câlin</a>
      </footer>
    </main>
  );
}
