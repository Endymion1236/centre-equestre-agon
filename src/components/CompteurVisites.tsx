"use client";

/**
 * Signale une page vue au compteur de fréquentation.
 *
 * Posé dans la mise en page racine, il suit les changements d'URL : le site
 * étant une application à navigation interne, une visite de cinq pages ne
 * provoque qu'un seul chargement, et un compteur branché sur le chargement
 * n'en verrait qu'une.
 *
 * ── Ce qui n'est pas compté ──────────────────────────────────────────────
 *
 *   - l'administration, l'espace famille, l'espace moniteur et la borne :
 *     ce sont vos propres écrans. Les compter reviendrait à mesurer votre
 *     usage du logiciel, pas la fréquentation du site ;
 *   - les robots, écartés côté serveur (cf. lib/robots) ;
 *   - les pages vues par un visiteur déjà compté dans la même session : il
 *     compte pour une visite, et pour autant de pages vues qu'il en lit.
 *
 * ── Ce qui est stocké dans le navigateur ─────────────────────────────────
 *
 * Un unique marqueur dans `sessionStorage`, effacé à la fermeture de
 * l'onglet, qui dit seulement « ce visiteur a déjà été compté aujourd'hui ».
 * Pas de cookie, pas d'identifiant, rien qui permette de reconnaître
 * quelqu'un d'une visite à l'autre.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Écrans du club : ce sont des outils de travail, pas de la fréquentation. */
const PRIVES = ["/admin", "/espace-cavalier", "/espace-moniteur", "/borne"];

const MARQUEUR = "visite-comptee";

export default function CompteurVisites() {
  const chemin = usePathname();

  useEffect(() => {
    if (!chemin || PRIVES.some((p) => chemin.startsWith(p))) return;

    // Première page de la session ? Le serveur en fait un visiteur de plus.
    // sessionStorage lève dans certains contextes (navigation privée
    // verrouillée, site data bloqué) : on compte alors la page vue sans
    // prétendre savoir si le visiteur est nouveau.
    let premiere = false;
    try {
      premiere = !sessionStorage.getItem(MARQUEUR);
      if (premiere) sessionStorage.setItem(MARQUEUR, "1");
    } catch { /* le comptage des pages vues reste valable */ }

    const corps = JSON.stringify({ chemin, premiere });

    // sendBeacon survit à la fermeture de l'onglet et n'attend pas de
    // réponse : le compteur ne retarde jamais l'affichage. fetch en secours
    // pour les navigateurs qui ne l'ont pas, avec keepalive pour la même
    // raison.
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/visites", new Blob([corps], { type: "application/json" }));
      } else {
        void fetch("/api/visites", {
          method: "POST", body: corps, keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      }
    } catch { /* une statistique n'a pas à casser une page */ }
  }, [chemin]);

  return null;
}
