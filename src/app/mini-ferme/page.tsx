import { TreePine } from "lucide-react";
import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "La mini-ferme pédagogique",
  description:
    "Découvrez notre mini-ferme pédagogique : cochons Kune Kune, chèvres, poules et nos poneys stars. Un espace de sensibilisation au monde animal.",
};

const animals = [
  {
    icon: "heart",
    name: "Pépita",
    type: "Cochon Kune Kune",
    color: "Roux",
    description:
      "Notre petite cochonne adorable au caractère doux. Les enfants l'adorent ! Elle est arrivée au club en 2024 et s'est vite fait adopter par toute l'équipe.",
    gradient: "from-pink-300 to-pink-200",
  },
  {
    icon: "heart",
    name: "Ronron",
    type: "Cochon Kune Kune",
    color: "Blanc",
    description:
      "Le compagnon de Pépita, aussi calme que son nom l'indique. Il adore se faire gratter le ventre et les caresses des enfants.",
    gradient: "from-gray-200 to-gray-100",
  },
  {
    icon: "heart",
    name: "Les chèvres",
    type: "Chèvres naines",
    color: "",
    description:
      "Nos chèvres sont de vraies acrobates ! Toujours curieuses, elles viennent à la rencontre des visiteurs et adorent grimper partout.",
    gradient: "from-amber-200 to-amber-100",
  },
  {
    icon: "heart",
    name: "Les poules",
    type: "Poules pondeuses",
    color: "",
    description:
      "Nos poules se promènent librement dans l'enclos de la mini-ferme. Les enfants peuvent ramasser les œufs le matin !",
    gradient: "from-orange-200 to-orange-100",
  },
];

const poneyStars = [
  { name: "Sircee", type: "Poney", specialty: "Pony Games & CSO", icon: "heart" },
  { name: "Batz", type: "Poney", specialty: "Baby Poney & débutants", icon: "heart" },
  { name: "Ultim", type: "Poney", specialty: "Compétition CSO", icon: "heart" },
  { name: "Rose", type: "Poney", specialty: "Stages tous niveaux", icon: "heart" },
  { name: "Gucci", type: "Poney", specialty: "Pony Games", icon: "heart" },
  { name: "Galaxy", type: "Poney", specialty: "Balades & compétition", icon: "heart" },
  { name: "Caramel", type: "Shetland", specialty: "Baby Poney", icon: "heart" },
  { name: "Java", type: "Poney", specialty: "Débutants", icon: "heart" },
  { name: "Joy", type: "Shetland", specialty: "Baby Poney", icon: "heart" },
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

      {/* Animals */}
      <section className="py-16 px-6 max-w-[1000px] mx-auto">
        <SectionHeader
          tag="Nos pensionnaires"
          title="Les animaux de la ferme"
          subtitle="Venez les rencontrer pendant votre visite au centre équestre !"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {animals.map((animal, i) => (
            <Card key={i} hover className="!p-0 overflow-hidden">
              <div
                className={`h-40 bg-gradient-to-br ${animal.gradient} flex items-center justify-center`}
              >
                <span className="text-7xl opacity-70"><Heart size={24} className="text-pink-400" /></span>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-display text-lg font-bold text-blue-800">
                    {animal.name}
                  </h3>
                  <span className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-0.5 rounded-full">
                    {animal.type}
                  </span>
                </div>
                {animal.color && (
                  <div className="font-body text-xs text-gray-400 mb-2">
                    Couleur : {animal.color}
                  </div>
                )}
                <p className="font-body text-sm text-gray-500 leading-relaxed">
                  {animal.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
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
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
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
