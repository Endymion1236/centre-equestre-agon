import { TreePine, Heart } from "lucide-react";
import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader, Card } from "@/components/ui";
import MiniFermeAnimals from "./MiniFermeAnimals";

export const metadata: Metadata = {
  title: "La mini-ferme pédagogique",
  description:
    "Découvrez notre mini-ferme pédagogique : cochons Kune Kune, chèvres, poules et nos poneys stars. Un espace de sensibilisation au monde animal.",
};

const poneyStars = [
  { name: "Sircee", type: "Poney", specialty: "Pony Games & CSO" },
  { name: "Batz", type: "Poney", specialty: "Baby Poney & débutants" },
  { name: "Ultim", type: "Poney", specialty: "Compétition CSO" },
  { name: "Rose", type: "Poney", specialty: "Stages tous niveaux" },
  { name: "Gucci", type: "Poney", specialty: "Pony Games" },
  { name: "Galaxy", type: "Poney", specialty: "Balades & compétition" },
  { name: "Caramel", type: "Shetland", specialty: "Baby Poney" },
  { name: "Java", type: "Poney", specialty: "Débutants" },
  { name: "Joy", type: "Shetland", specialty: "Baby Poney" },
];

export default function MiniFermePage() {
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
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4"><TreePine size={32} className="text-white/80" /></div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            La mini-ferme pédagogique
          </h1>
          <p className="font-body text-lg text-white/65">
            Un espace de découverte et de sensibilisation au monde animal,
            pensé pour émerveiller les petits comme les grands.
          </p>
        </div>
      </section>

      {/* Animals — chargés depuis Firestore */}
      <section className="py-16 px-6 max-w-[1000px] mx-auto">
        <SectionHeader
          tag="Nos pensionnaires"
          title="Les animaux de la ferme"
          subtitle="Venez les rencontrer pendant votre visite au centre équestre !"
        />
        <MiniFermeAnimals />
      </section>

      {/* Poneys stars */}
      <section className="py-16 px-6 bg-blue-50">
        <div className="max-w-[1000px] mx-auto">
          <SectionHeader
            tag="Notre cavalerie"
            title="Les poneys stars du club"
            subtitle="Nos fidèles compagnons qui font le bonheur des cavaliers toute l'année."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {poneyStars.map((poney, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-5 border border-blue-500/8 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Heart size={18} className="text-blue-400" />
                </div>
                <div>
                  <div className="font-body text-base font-semibold text-blue-800">
                    {poney.name}
                  </div>
                  <div className="font-body text-xs text-gray-400">
                    {poney.type} · {poney.specialty}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="font-body text-sm text-gray-400 italic">
              Et aussi Joey, Joystar et LPP — nos jeunes poneys en formation
              pour les prochaines saisons !
            </p>
          </div>
        </div>
      </section>

      {/* Pédagogie */}
      <section className="py-16 px-6 max-w-[700px] mx-auto text-center">
        <h2 className="font-display text-3xl font-bold text-blue-800 mb-4">
          Une approche pédagogique
        </h2>
        <p className="font-body text-base text-gray-500 leading-relaxed mb-6">
          La mini-ferme fait partie intégrante de nos stages et activités. Les
          enfants apprennent à respecter les animaux, comprendre leurs besoins
          et développer leur sens des responsabilités. C&apos;est aussi un
          espace de calme et de découverte sensorielle, particulièrement
          apprécié des tout-petits du programme Baby Poney.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Respect du vivant",
            "Sens des responsabilités",
            "Découverte sensorielle",
            "Patience et douceur",
            "Confiance en soi",
          ].map((value) => (
            <span
              key={value}
              className="font-body text-sm font-medium text-blue-500 bg-blue-50 px-4 py-2 rounded-full"
            >
              {value}
            </span>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
