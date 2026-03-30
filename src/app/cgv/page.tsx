import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales de Vente — Centre Équestre d'Agon-Coutainville",
  robots: { index: false },
};

export default function CGVPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-3xl font-bold text-blue-800 mb-2">Conditions Générales de Vente</h1>
          <p className="font-body text-sm text-gray-400 mb-10">Dernière mise à jour : mars 2026</p>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">1. Identification du vendeur</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-1">
              <p><strong>EARL Centre Équestre Poney Club d'Agon-Coutainville</strong></p>
              <p>56 Charrière du Commerce, 50230 Agon-Coutainville</p>
              <p>SIRET : 507 569 184 00017 — Téléphone : 02 44 84 99 96</p>
              <p>E-mail : ceagon@orange.fr</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">2. Champ d'application</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Les présentes CGV s'appliquent à toutes les prestations proposées par le Centre Équestre d'Agon-Coutainville : cours d'équitation, stages, balades, séances ponctuelles, forfaits annuels, et toute activité réservée via ce site ou en personne.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">3. Inscription et réservation</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Toute inscription est définitive après paiement (total ou acompte selon la formule choisie) et validation par le centre. Pour les mineurs, l'inscription doit être effectuée par le représentant légal, qui certifie l'exactitude des informations fournies. Une fiche sanitaire doit être complétée avant la première activité.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">4. Tarifs et paiement</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-2">
              <p>Les tarifs en vigueur sont ceux affichés sur le site au moment de la réservation. Ils sont exprimés en euros TTC.</p>
              <p>Modes de paiement acceptés : carte bancaire (en ligne via Stripe ou sur terminal), chèque, espèces, chèques-vacances ANCV, Pass Sport.</p>
              <p>Pour les forfaits annuels, un paiement en plusieurs fois peut être proposé selon les modalités convenues avec le centre.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">5. Annulation et remboursement</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-2">
              <p><strong>Stages :</strong> Annulation jusqu'à 72h avant le début = remboursement intégral (hors frais bancaires). Annulation moins de 72h avant = 50% retenus sauf cas de force majeure ou certificat médical.</p>
              <p><strong>Cours annuels (forfait) :</strong> Toute séance non effectuée sans prévenir 24h à l'avance est due. En cas de maladie du cavalier (certificat médical), un report peut être accordé.</p>
              <p><strong>Balades :</strong> Annulation jusqu'à 24h avant = remboursement intégral. En deçà, aucun remboursement sauf certificat médical.</p>
              <p><strong>Annulation par le centre</strong> (météo, force majeure) : report proposé ou remboursement intégral.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">6. Obligations du cavalier</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-2">
              <p>Le cavalier s'engage à respecter les consignes de sécurité données par l'encadrement, à porter une bombe aux normes (prêt possible sur place), et à se présenter dans une tenue adaptée.</p>
              <p>Le centre se réserve le droit de refuser l'accès à toute personne dont le comportement serait dangereux pour elle-même, les autres cavaliers ou les animaux.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">7. Responsabilité et assurance</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-2">
              <p>Le centre est assuré en responsabilité civile professionnelle. L'adhésion à la FFE (Fédération Française d'Équitation) est recommandée pour tout cavalier en cours annuel — elle inclut une assurance individuelle.</p>
              <p>La pratique de l'équitation comporte des risques inhérents. Le client déclare en avoir été informé et accepte ces risques dans le cadre normal de la pratique encadrée.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">8. Droit applicable et litiges</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Les présentes CGV sont soumises au droit français. En cas de litige, une solution amiable sera recherchée en priorité. À défaut, les tribunaux compétents seront ceux du ressort du siège social de l'EARL. Le client consommateur peut également recourir au médiateur de la consommation.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
