"use client";
/**
 * src/app/admin/planning/BandeauImpayes.tsx
 *
 * Bandeau collé en bas du panneau : ce que doivent, TOUTES prestations
 * confondues, les familles des cavaliers inscrits sur ce créneau.
 *
 * Il est là pour une raison très concrète : le moment où l'on a la famille en
 * face de soi (ou au téléphone) est le seul moment où l'on peut réclamer un
 * impayé sans relance écrite. Le bandeau ne s'affiche que s'il reste vraiment
 * quelque chose à encaisser (total > déjà payé) et renvoie directement sur la
 * page Paiements pré-filtrée.
 */

export default function BandeauImpayes({ creneau, payments }: { creneau: any; payments: any[] }) {
          // Collecter les familyIds des inscrits dans ce créneau
          const enrolledFamilyIds = [...new Set((creneau.enrolled || []).map((e: any) => e.familyId))];
          const pendingPayments = payments.filter((p: any) =>
            enrolledFamilyIds.includes(p.familyId) &&
            (p.status === "pending" || p.status === "partial") &&
            p.totalTTC > (p.paidAmount || 0)
          );
          if (pendingPayments.length === 0) return null;
          const totalDu = pendingPayments.reduce((s: number, p: any) => s + (p.totalTTC || 0) - (p.paidAmount || 0), 0);
          const familyNames = [...new Set(pendingPayments.map((p: any) => p.familyName))].join(", ");
          return (
            <div className="border-t border-orange-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3 rounded-b-2xl flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg flex-shrink-0">💰</span>
                  <div className="min-w-0">
                    <div className="font-body text-sm font-semibold text-orange-800 truncate">
                      {pendingPayments.length} paiement{pendingPayments.length > 1 ? "s" : ""} en attente · {totalDu.toFixed(0)}€
                    </div>
                    <div className="font-body text-[10px] text-orange-600 truncate">{familyNames}</div>
                  </div>
                </div>
                <a href={`/admin/paiements?search=${encodeURIComponent(familyNames.split(",")[0].trim())}`}
                  className="flex-shrink-0 font-body text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-lg no-underline transition-colors">
                  Encaisser →
                </a>
              </div>
            </div>
          );
}
