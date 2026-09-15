"use client";

/**
 * Borne — tableau du jour.
 *
 * Un écran à laisser affiché à l'accueil les premières semaines : les cours
 * d'aujourd'hui, le prénom des cavaliers, leur poney, le moniteur. Le cours
 * en cours est mis en avant, le suivant annoncé. Se rafraîchit toute seule
 * chaque minute. Le rendu, pensé pour des enfants, est dans
 * components/TableauDuJourVue.
 *
 * Même exigence que la borne vocale : la tablette doit être connectée au
 * compte du club. Pour revenir à Câlin : bouton en bas de page.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import type { CarteTableau } from "@/lib/borne-tableau";
import TableauDuJourVue from "@/components/TableauDuJourVue";

const RAFRAICHISSEMENT_MS = 60_000;

export default function BorneTableauPage() {
  const { user, loading: authLoading } = useAuth();
  const [cartes, setCartes] = useState<CarteTableau[] | null>(null);
  const [heure, setHeure] = useState("");
  const [erreur, setErreur] = useState("");
  // 403 : compte connecté, mais ni personnel du club ni compte de borne
  // déclaré (cf. lib/borne-acces). Un message, pas une erreur technique.
  const [refuse, setRefuse] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await authFetch("/api/borne/tableau");
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { setRefuse(true); return; }
      if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
      setRefuse(false);
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
  if (user && refuse) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-5xl mb-4">🐴</div>
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-3">Tableau réservé au club</h1>
          <p className="font-body text-sm text-gray-500 mb-6">
            Ce tableau nomme les cavaliers du jour : il ne s&apos;affiche que pour le personnel du club, ou sur la tablette dont le
            compte est déclaré dans Paramètres → Borne d&apos;accueil.
          </p>
          <a href="/borne" className="inline-block px-6 py-3 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold no-underline">Ouvrir l&apos;assistant Câlin</a>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-3">Borne non connectée</h1>
          <p className="font-body text-sm text-gray-500 mb-6">Connectez cette tablette avec un compte du club pour afficher le tableau du jour.</p>
          <a href="/espace-cavalier" className="inline-block px-6 py-3 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold no-underline">Se connecter</a>
        </div>
      </div>
    );
  }

  const dateLongue = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return <TableauDuJourVue cartes={cartes || []} dateLongue={dateLongue} heure={heure} erreur={erreur} chargement={cartes === null} />;
}
