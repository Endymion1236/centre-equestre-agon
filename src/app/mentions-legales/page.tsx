import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales — Centre Équestre d'Agon-Coutainville",
  robots: { index: false },
};

export default function MentionsLegalesPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-3xl font-bold text-blue-800 mb-2">Mentions légales</h1>
          <p className="font-body text-sm text-gray-400 mb-10">Dernière mise à jour : mars 2026</p>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">1. Éditeur du site</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-1">
              <p><strong>Raison sociale :</strong> EARL Centre Équestre Poney Club d'Agon-Coutainville</p>
              <p><strong>Gérant :</strong> Nicolas Richard</p>
              <p><strong>Siège social :</strong> 56 Charrière du Commerce, 50230 Agon-Coutainville, France</p>
              <p><strong>SIRET :</strong> 507 569 184 00017</p>
              <p><strong>Téléphone :</strong> 02 44 84 99 96</p>
              <p><strong>E-mail :</strong> ceagon@orange.fr</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">2. Hébergement</h2>
            <div className="font-body text-sm text-gray-600 leading-relaxed space-y-1">
              <p><strong>Hébergeur :</strong> Vercel Inc.</p>
              <p><strong>Adresse :</strong> 340 Pine Street, Suite 701, San Francisco, CA 94104, États-Unis</p>
              <p><strong>Site :</strong> <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">vercel.com</a></p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">3. Propriété intellectuelle</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              L'ensemble des contenus présents sur ce site (textes, images, logos, vidéos) sont la propriété exclusive de l'EARL Centre Équestre Poney Club d'Agon-Coutainville ou font l'objet d'une autorisation d'utilisation. Toute reproduction, représentation ou diffusion, en tout ou partie, sur quelque support que ce soit, est interdite sans autorisation préalable écrite.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">4. Responsabilité</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              L'éditeur s'efforce d'assurer l'exactitude des informations publiées sur ce site, mais ne peut garantir l'exhaustivité ou l'absence d'erreur. Les informations sont susceptibles d'être modifiées à tout moment sans préavis. L'éditeur ne saurait être tenu responsable de l'utilisation faite de ces informations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">5. Données personnelles</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Le traitement des données personnelles collectées via ce site est détaillé dans notre{" "}
              <a href="/confidentialite" className="text-blue-500 no-underline hover:underline">Politique de confidentialité</a>.
              Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'opposition et d'effacement de vos données.
              Pour exercer ces droits, contactez-nous à ceagon@orange.fr.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">6. Cookies</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Ce site utilise des cookies techniques nécessaires à son fonctionnement (authentification, session). Aucun cookie publicitaire ou de traçage tiers n'est utilisé. En naviguant sur ce site, vous acceptez l'utilisation de ces cookies techniques.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-blue-700 mb-3">7. Litiges</h2>
            <p className="font-body text-sm text-gray-600 leading-relaxed">
              Le présent site est soumis au droit français. En cas de litige, les tribunaux français seront seuls compétents. En cas de réclamation, vous pouvez également recourir à la médiation de la consommation via la plateforme européenne de règlement en ligne des litiges :{" "}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline">ec.europa.eu/consumers/odr</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
