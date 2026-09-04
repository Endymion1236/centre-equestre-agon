"use client";

/**
 * Encart « balade en petit comité » : le minimum de participants et les
 * trois issues (supplément, report, avoir) annoncés AVANT la réservation.
 * C'est ce qui rend le supplément opposable (cf. CGV_BALADES_PETIT_GROUPE).
 *
 * Il n'existait que sur la vue Liste de Réserver : une famille qui réservait
 * depuis la vue Planning ou depuis le code QR de la borne ne le voyait pas
 * avant de payer. Le même encart sert maintenant aux trois endroits.
 */
export function infoPetitComite(creneau: any, activities: any[]): { min: number; supplement: number } | null {
  if (!creneau || creneau.activityType !== "balade") return null;
  if (creneau.tarifForfaitaire) return null; // sortie vendue au groupe : exclue du mécanisme
  const act = (activities || []).find((a: any) => a.id === creneau.activityId);
  const min = act?.minParticipants;
  if (typeof min !== "number" || min < 2) return null;
  const supplement = typeof act?.supplementPetitGroupe === "number" && act.supplementPetitGroupe > 0 ? act.supplementPetitGroupe : 0;
  return { min, supplement };
}

export function NotePetitComite({ creneau, activities, className = "" }: { creneau: any; activities: any[]; className?: string }) {
  const info = infoPetitComite(creneau, activities);
  if (!info) return null;
  return (
    <div className={`rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 font-body text-xs text-amber-800 leading-relaxed ${className}`}>
      Balade maintenue à partir de <strong>{info.min} participants</strong>. En dessous, nous
      proposons au choix : maintien en petit comité{info.supplement > 0 ? ` (supplément de ${info.supplement}€/cavalier)` : ""}, report ou avoir.
    </div>
  );
}
