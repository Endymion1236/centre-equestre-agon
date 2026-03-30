import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Centre Équestre d'Agon-Coutainville",
  robots: { index: false },
};

export default function ConfidentialitePage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-3xl font-bold text-blue-800 mb-2">Politique de confidentialité</h1>
          <p className="font-body text-sm text-gray-400 mb-10">Dernière mise à jour : mars 2026 — Conforme au RGPD (Règlement UE 2016/679)</p>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">1. Responsable du traitement</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-1">
              <p><strong>EARL Centre Équestre Poney Club d'Agon-Coutainville</strong></p>
              <p>Représenté par Nicolas Richard, gérant</p>
              <p>56 Charrière du Commerce, 50230 Agon-Coutainville</p>
              <p>SIRET : 507 569 184 00017</p>
              <p>Contact DPO : ceagon@orange.fr</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">2. Données collectées</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed">
              <p className="mb-3">Nous collectons les données suivantes lors de votre inscription ou utilisation de l'espace cavalier :</p>
              <div className="bg-sand rounded-xl p-4 space-y-2">
                <div><strong>Données d'identité :</strong> nom, prénom, date de naissance</div>
                <div><strong>Données de contact :</strong> adresse e-mail, numéro de téléphone</div>
                <div><strong>Données du responsable légal</strong> (pour les mineurs) : nom, prénom, e-mail, téléphone</div>
                <div><strong>Données de paiement :</strong> traitées exclusivement par Stripe (nous ne stockons aucune coordonnée bancaire)</div>
                <div><strong>Données d'utilisation :</strong> historique des réservations, forfaits, présences</div>
                <div><strong>Données techniques :</strong> adresse IP, navigateur (via Firebase Authentication)</div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">3. Finalités et bases légales</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-3">
              <div className="bg-sand rounded-xl p-4">
                <p className="font-semibold mb-1">Gestion des inscriptions et réservations</p>
                <p>Base légale : exécution du contrat. Conservation : durée de la relation commerciale + 3 ans.</p>
              </div>
              <div className="bg-sand rounded-xl p-4">
                <p className="font-semibold mb-1">Traitement des paiements</p>
                <p>Base légale : exécution du contrat. Conservation : 10 ans (obligation comptable légale).</p>
              </div>
              <div className="bg-sand rounded-xl p-4">
                <p className="font-semibold mb-1">Communications liées à votre activité (rappels, confirmations)</p>
                <p>Base légale : intérêt légitime. Conservation : durée de la relation + 1 an.</p>
              </div>
              <div className="bg-sand rounded-xl p-4">
                <p className="font-semibold mb-1">Newsletters et communications commerciales</p>
                <p>Base légale : consentement. Vous pouvez vous désinscrire à tout moment via le lien présent dans chaque e-mail.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">4. Sous-traitants et transferts de données</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-2">
              <p>Nous faisons appel aux sous-traitants suivants, qui présentent des garanties suffisantes au sens du RGPD :</p>
              <div className="bg-sand rounded-xl p-4 space-y-2">
                <div><strong>Google Firebase</strong> (Google LLC) — authentification, base de données, stockage fichiers. Hébergement Europe (Belgique). <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">Politique de confidentialité</a></div>
                <div><strong>Stripe Inc.</strong> — traitement des paiements en ligne. Certifié PCI-DSS niveau 1. <a href="https://stripe.com/fr/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">Politique de confidentialité</a></div>
                <div><strong>Resend Inc.</strong> — envoi d'e-mails transactionnels. <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">Politique de confidentialité</a></div>
                <div><strong>Vercel Inc.</strong> — hébergement du site web. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">Politique de confidentialité</a></div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">5. Vos droits</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed">
              <p className="mb-3">Conformément au RGPD, vous disposez des droits suivants :</p>
              <div className="bg-sand rounded-xl p-4 space-y-2">
                <div>✅ <strong>Droit d'accès</strong> — obtenir une copie de vos données</div>
                <div>✅ <strong>Droit de rectification</strong> — corriger des données inexactes</div>
                <div>✅ <strong>Droit à l'effacement</strong> — demander la suppression de votre compte et données</div>
                <div>✅ <strong>Droit d'opposition</strong> — s'opposer à un traitement basé sur l'intérêt légitime</div>
                <div>✅ <strong>Droit à la portabilité</strong> — recevoir vos données dans un format structuré</div>
                <div>✅ <strong>Droit de retrait du consentement</strong> — à tout moment pour les traitements basés sur le consentement</div>
              </div>
              <p className="mt-3">
                Pour exercer ces droits : <strong>ceagon@orange.fr</strong> ou par courrier à l'adresse du centre.<br />
                Délai de réponse : 1 mois maximum. En cas de réponse insatisfaisante, vous pouvez saisir la{" "}
                <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">CNIL</a>.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">6. Sécurité des données</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Vos données sont protégées par des mesures techniques appropriées : connexions chiffrées (HTTPS/TLS), authentification sécurisée via Google Firebase, accès limité aux seules personnes habilitées, sauvegardes régulières. Les coordonnées bancaires ne transitent jamais par nos serveurs (traitement délégué à Stripe).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">7. Cookies</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Ce site utilise uniquement des cookies strictement nécessaires au fonctionnement (session d'authentification Firebase). Aucun cookie publicitaire, de profilage ou de traçage tiers n'est déposé. Ces cookies ne nécessitent pas de consentement préalable (Article 82 de la loi Informatique et Libertés).
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
