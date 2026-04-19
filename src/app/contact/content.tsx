"use client";

import { Phone } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SCHEDULE } from "@/lib/config";
import { ContactForm } from "./form";
import { useVitrine } from "@/lib/use-vitrine";

/**
 * Parse l'adresse stockée dans vitrine.infos.adresse pour extraire :
 *   - la rue (partie avant la virgule)
 *   - le code postal + ville (partie après la virgule)
 *
 * Exemples acceptés :
 *   "56 Charrière du Commerce, 50230 Agon-Coutainville"
 *   "Route de la Côte, 50230 Agon-Coutainville"
 *
 * Fallback : on renvoie toute la chaîne en street.
 */
function parseAddress(full: string): { street: string; zipCity: string } {
  const parts = full.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return { street: parts[0], zipCity: parts.slice(1).join(", ") };
  }
  return { street: full, zipCity: "" };
}

export function ContactPageContent() {
  const { vitrine } = useVitrine();
  const { street, zipCity } = parseAddress(vitrine.infos.adresse);
  const tel = vitrine.infos.telephone;
  const tel2 = (vitrine.infos as any).telephone_secondaire || "";
  const email = vitrine.infos.email;

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative bg-hero pt-32 pb-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_30%,rgba(240,160,16,0.08)_0%,transparent_50%)]" />
        <svg className="absolute bottom-0 left-0 w-full h-12" viewBox="0 0 1440 50" preserveAspectRatio="none">
          <path d="M0,30 C480,50 960,10 1440,35 L1440,50 L0,50Z" className="fill-cream" />
        </svg>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Phone size={32} className="text-white/80" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Nous contacter
          </h1>
          <p className="font-body text-lg text-white/65">
            Une question ? Une réservation ? On est là pour vous !
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="py-16 px-6 max-w-[1100px] mx-auto">
        <div className="flex flex-wrap gap-10">
          {/* Left — Info */}
          <div className="flex-1 min-w-[320px]">
            <h2 className="font-display text-2xl font-bold text-blue-800 mb-6">
              Venez nous voir !
            </h2>

            {/* Info cards */}
            <div className="divide-y divide-blue-500/8">
              <div className="flex gap-4 py-5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">
                  📍
                </div>
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800 mb-1">Adresse</div>
                  <div className="font-body text-sm text-gray-500 whitespace-pre-line leading-relaxed">
                    {street}
                    {zipCity && <>{"\n"}{zipCity}</>}
                  </div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">À 800m de la plage</div>
                </div>
              </div>

              <div className="flex gap-4 py-5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">
                  📞
                </div>
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800 mb-1">Téléphone</div>
                  <div className="font-body text-sm text-gray-500 whitespace-pre-line leading-relaxed">
                    {tel}
                    {tel2 && <>{"\n"}{tel2}</>}
                  </div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Du lundi au samedi</div>
                </div>
              </div>

              <div className="flex gap-4 py-5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">
                  ✉️
                </div>
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800 mb-1">Email</div>
                  <div className="font-body text-sm text-gray-500 leading-relaxed">
                    <a href={`mailto:${email}`} className="text-gray-500 hover:text-blue-500 no-underline">
                      {email}
                    </a>
                  </div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Réponse sous 24h</div>
                </div>
              </div>
            </div>

            {/* Horaires */}
            <div className="mt-8">
              <h3 className="font-display text-lg font-bold text-blue-800 mb-4">
                Horaires d&apos;ouverture
              </h3>
              <div className="bg-sand rounded-2xl p-5">
                {Object.values(SCHEDULE).map((h, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-2.5 flex-wrap gap-1 ${
                      i < 3 ? "border-b border-dashed border-blue-500/8" : ""
                    }`}
                  >
                    <div>
                      <span className="font-body text-sm font-semibold text-blue-800">{h.period}</span>
                    </div>
                    <span
                      className={`font-body text-sm font-semibold ${
                        h.days === "Fermé" ? "text-red-500" : "text-blue-500"
                      }`}
                    >
                      {h.days} · {h.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social */}
            <div className="mt-8 flex gap-3">
              <a
                href="https://www.facebook.com/ceagon50230"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm font-semibold text-white bg-[#1877F2] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
              >
                Facebook
              </a>
              <a
                href="#"
                className="font-body text-sm font-semibold text-white bg-[#E4405F] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
              >
                Instagram
              </a>
            </div>
          </div>

          {/* Right — Form */}
          <div className="flex-1 min-w-[380px]">
            <ContactForm />
          </div>
        </div>

        {/* Map placeholder */}
        <div className="mt-12 rounded-2xl overflow-hidden h-72 relative bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-lg">📍</span>
            </div>
            <div className="font-body text-sm font-semibold text-blue-800">
              Centre Équestre d&apos;Agon-Coutainville
            </div>
            <div className="font-body text-xs text-gray-400">
              {street}{zipCity ? `, ${zipCity}` : ""}
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${street} ${zipCity}`.trim()
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm font-semibold text-blue-500 bg-white px-5 py-2.5 rounded-lg shadow-sm no-underline hover:shadow-md transition-shadow"
            >
              📍 Ouvrir dans Google Maps
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
