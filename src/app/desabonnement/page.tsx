import { adminDb } from "@/lib/firebase-admin";
import { jetonValide } from "@/lib/desabonnement";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Désabonnement",
  robots: { index: false, follow: false },
};

/**
 * Désabonnement en un clic, sans connexion.
 *
 * Exiger un compte pour se désabonner reviendrait à ne pas offrir de moyen
 * simple — ce que la loi demande. Le lien porte donc une signature du
 * familyId, qui empêche de désabonner quelqu'un d'autre en devinant un
 * identifiant.
 */
export default async function DesabonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; t?: string }>;
}) {
  const { f: familyId = "", t: jeton = "" } = await searchParams;

  let etat: "ok" | "invalide" | "erreur" = "invalide";
  let nom = "";

  if (jetonValide(familyId, jeton)) {
    try {
      const ref = adminDb.collection("families").doc(familyId);
      const snap = await ref.get();
      if (snap.exists) {
        nom = (snap.data() as any)?.parentName || "";
        await ref.update({
          desabonneEmails: true,
          desabonneAt: new Date().toISOString(),
        });
        etat = "ok";
      } else {
        etat = "erreur";
      }
    } catch {
      etat = "erreur";
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center">
        <div className="text-4xl" aria-hidden="true">🐴</div>

        {etat === "ok" && (
          <>
            <h1 className="font-display text-xl font-bold text-slate-800 mt-3">
              C&apos;est noté{nom ? `, ${nom}` : ""}
            </h1>
            <p className="font-body text-sm text-slate-600 mt-3 leading-relaxed">
              Vous ne recevrez plus nos actualités ni nos offres.
            </p>
            <p className="font-body text-sm text-slate-600 mt-3 leading-relaxed">
              Vous continuerez en revanche à recevoir les messages liés à vos
              réservations : confirmations, factures, rappels d&apos;échéance et
              changements d&apos;horaire. Ils sont nécessaires au suivi de votre
              inscription.
            </p>
            <p className="font-body text-xs text-slate-400 mt-4">
              Un regret ? Écrivez-nous, nous vous réabonnerons.
            </p>
          </>
        )}

        {etat === "invalide" && (
          <>
            <h1 className="font-display text-xl font-bold text-slate-800 mt-3">
              Lien invalide
            </h1>
            <p className="font-body text-sm text-slate-600 mt-3 leading-relaxed">
              Ce lien de désabonnement n&apos;est pas valide ou a été tronqué par
              votre messagerie. Répondez simplement à l&apos;un de nos emails en
              demandant à ne plus recevoir nos actualités, nous nous en occuperons.
            </p>
          </>
        )}

        {etat === "erreur" && (
          <>
            <h1 className="font-display text-xl font-bold text-slate-800 mt-3">
              Une erreur est survenue
            </h1>
            <p className="font-body text-sm text-slate-600 mt-3 leading-relaxed">
              Nous n&apos;avons pas pu enregistrer votre demande. Répondez à
              l&apos;un de nos emails et nous la traiterons manuellement.
            </p>
          </>
        )}

        <p className="font-body text-xs text-slate-400 mt-6">
          Centre Équestre d&apos;Agon-Coutainville
        </p>
      </div>
    </div>
  );
}
