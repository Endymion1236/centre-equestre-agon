import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader, Card, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "L'équipe & la cavalerie",
  description: "Découvrez l'équipe du Centre Équestre d'Agon-Coutainville et nos poneys stars.",
};

const team = [
  {
    name: "Nicolas",
    role: "Gérant",
    emoji: "👨‍💼",
    description: "Passionné d'équitation et d'innovation, Nicolas gère le centre depuis plusieurs années. Il conçoit des activités ludiques et immersives pour les cavaliers de tous âges.",
    specialties: ["Gestion", "Pony Games", "Innovation", "LaserBay"],
  },
  {
    name: "Emmeline",
    role: "Instructrice BPJEPS",
    emoji: "👩‍🏫",
    description: "Emmeline est notre instructrice diplômée BPJEPS. Pédagogue et bienveillante, elle accompagne chaque cavalier dans sa progression avec passion et exigence.",
    specialties: ["Enseignement", "CSO", "Dressage", "Baby Poney"],
  },
];

const poneys = [
  { name: "Sircee", type: "Poney", age: "", specialty: "Pony Games & CSO — polyvalente et vive, une vraie championne", level: "Confirmé" },
  { name: "Batz", type: "Poney", age: "", specialty: "Baby Poney & débutants — doux et patient, le préféré des petits", level: "Débutant" },
  { name: "Ultim", type: "Poney", age: "", specialty: "Compétition CSO — généreux et courageux sur les barres", level: "Confirmé" },
  { name: "Rose", type: "Poney", age: "", specialty: "Stages tous niveaux — calme et rassurante, parfaite pour progresser", level: "Intermédiaire" },
  { name: "Gucci", type: "Poney", age: "", specialty: "Pony Games — rapide et agile, idéale pour les jeux d'équipe", level: "Intermédiaire" },
  { name: "Galaxy", type: "Poney", age: "", specialty: "Balades & compétition — endurant et fiable en extérieur", level: "Confirmé" },
  { name: "Caramel", type: "Shetland", age: "", specialty: "Baby Poney — tout petit et tout doux, parfait pour les 3-5 ans", level: "Débutant" },
  { name: "Java", type: "Poney", age: "", specialty: "Débutants — docile et prévisible, met en confiance rapidement", level: "Débutant" },
  { name: "Joy", type: "Shetland", age: "", specialty: "Baby Poney — joyeuse et câline, les enfants l'adorent", level: "Débutant" },
];

const youngPoneys = [
  { name: "Joey", status: "En formation" },
  { name: "Joystar", status: "En formation" },
  { name: "LPP", status: "En formation" },
];

const levelColors: Record<string, "green" | "blue" | "orange"> = {
  "Débutant": "green",
  "Intermédiaire": "blue",
  "Confirmé": "orange",
};

export default function EquipePage() {
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
          <span className="text-5xl mb-4 block">🤝</span>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">L&apos;équipe & la cavalerie</h1>
          <p className="font-body text-lg text-white/65">Les humains et les poneys qui font vivre le centre au quotidien.</p>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 px-6 max-w-[900px] mx-auto">
        <SectionHeader tag="L'équipe" title="Qui sommes-nous ?" />
        <div className="flex flex-wrap gap-6 justify-center">
          {team.map((member, i) => (
            <Card key={i} padding="lg" className="flex-1 min-w-[320px] max-w-[420px]">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl">{member.emoji}</div>
                <div>
                  <h3 className="font-display text-xl font-bold text-blue-800">{member.name}</h3>
                  <div className="font-body text-sm text-gold-400 font-semibold">{member.role}</div>
                </div>
              </div>
              <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">{member.description}</p>
              <div className="flex flex-wrap gap-2">
                {member.specialties.map((s) => (
                  <span key={s} className="font-body text-xs font-medium text-blue-500 bg-blue-50 px-3 py-1 rounded-full">{s}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Cavalerie */}
      <section className="py-16 px-6 bg-sand">
        <div className="max-w-[900px] mx-auto">
          <SectionHeader tag="La cavalerie" title="Nos poneys" subtitle="Chaque poney a sa personnalité et ses spécialités. On les affecte en fonction du niveau et des objectifs de chaque cavalier." />
          <div className="flex flex-col gap-4">
            {poneys.map((p, i) => (
              <Card key={i} padding="md">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-3xl flex-shrink-0">🐴</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-display text-lg font-bold text-blue-800">{p.name}</h3>
                      <Badge color="gray">{p.type}</Badge>
                      <Badge color={levelColors[p.level] || "blue"}>{p.level}</Badge>
                    </div>
                    <p className="font-body text-sm text-gray-500">{p.specialty}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Young poneys */}
          <div className="mt-8">
            <h3 className="font-display text-lg font-bold text-blue-800 mb-4">🌟 La relève</h3>
            <div className="flex gap-4 flex-wrap">
              {youngPoneys.map((p, i) => (
                <Card key={i} padding="sm" className="flex items-center gap-3">
                  <span className="text-xl">🐎</span>
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{p.name}</div>
                    <div className="font-body text-xs text-gold-400">{p.status}</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
