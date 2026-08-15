/**
 * src/app/admin/boite/mail-utils.ts
 *
 * Les libellés de classification d'un mail, et les deux petites fonctions qui
 * décident de la manière de l'afficher.
 *
 * Pourquoi séparé : ces trois éléments sont utilisés à la fois par la page et
 * par la liste des messages. `estVocal` en particulier porte une règle métier
 * qu'il ne faut pas laisser se dupliquer dans un coin de JSX — c'est elle qui
 * déclenche (ou non) une transcription payante.
 *
 * Fonctions pures : aucun état d'écran, aucun appel réseau.
 */

/** Étiquettes et couleurs des classes renvoyées par l'assistant. */
export const CLASSIF: Record<string, { label: string; cls: string }> = {
  inscription: { label: "Demande d'inscription", cls: "bg-green-50 text-green-700" },
  info: { label: "Demande d'info", cls: "bg-blue-50 text-blue-700" },
  administratif: { label: "Administratif", cls: "bg-amber-50 text-amber-700" },
  autre: { label: "Autre", cls: "bg-slate-100 text-slate-600" },
};

// Décode les entités HTML (d&#39;Agon → d'Agon) pour un affichage propre.
export function decodeHtml(s: string): string {
  if (!s) return "";
  if (typeof document === "undefined") return s;
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

/**
 * Un mail est un message du répondeur s'il vient de StandardFacile ET porte
 * une pièce jointe audio. Les deux conditions : un mail de facturation
 * StandardFacile ne doit pas déclencher de transcription.
 */
export function estVocal(m: any): boolean {
  const from = String(m?.from || "").toLowerCase();
  return (
    !!m?.audioAttachmentId &&
    (from.includes("monstandardfacile.com") || from.includes("standardfacile.com"))
  );
}
