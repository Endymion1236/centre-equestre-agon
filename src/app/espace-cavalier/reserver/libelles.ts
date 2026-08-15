/**
 * src/app/espace-cavalier/reserver/libelles.ts
 *
 * Libellés et couleurs des types d'activité affichés côté famille.
 *
 * Sorti de `page.tsx` pour que la carte d'un cours (CarteCours) puisse lire la
 * même table que le reste de l'écran : la pastille de couleur d'un créneau est
 * un repère visuel que la famille retrouve d'un écran à l'autre, elle ne doit
 * pas être redéfinie au petit bonheur dans chaque composant.
 *
 * Le libellé est volontairement court (« Compet. », « Anniv. ») : il s'affiche
 * dans des cartes étroites sur mobile, où la page est majoritairement consultée.
 */

export const typeLabels: Record<string, { label: string; color: string }> = {
  stage: { label: "Stage", color: "#27ae60" }, stage_journee: { label: "Stage", color: "#16a085" },
  balade: { label: "Balade", color: "#e67e22" }, cours: { label: "Cours", color: "#2050A0" },
  competition: { label: "Compet.", color: "#7c3aed" }, anniversaire: { label: "Anniv.", color: "#D63031" },
};
