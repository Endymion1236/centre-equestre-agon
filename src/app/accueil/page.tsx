import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button, SectionHeader, Card } from "@/components/ui";
import { HeroEditable } from "@/components/ui/HeroEditable";
import LiveHeroStatus from "@/components/public/LiveHeroStatus";
import HomeActivityFinder from "@/components/public/HomeActivityFinder";
import { SITE_CONFIG } from "@/lib/config";
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Clock,
  Heart,
  MapPin,
  Phone,
  ShieldCheck,
  Target,
  TreePine,
  Trophy,
  Users,
  Waves,
} from "lucide-react";
import ActusBanner from "@/components/ActusBanner";
import { NextStagesBanner } from "./NextStagesBanner";

const strengths = [
  {
    icon: Waves,
    title: "La plage à cheval",
    description: "Dunes, estuaire et grands espaces à seulement 800 m du centre.",
    tone: "bg-blue-50 text-blue-600",
  },
  {
    icon: Baby,
    title: "Dès 3 ans",
    description: "Des groupes adaptés à l’âge, au niveau et au rythme de chaque enfant.",
    tone: "bg-pink-50 text-pink-600",
  },
  {
    icon: Users,
    title: "À taille humaine",
    description: "Une équipe proche des familles et des groupes pensés pour bien accompagner.",
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Trophy,
    title: "Du loisir au sport",
    description: "Pony Games, CSO, Équifun et progression FFE pour ceux qui veulent aller plus loin.",
    tone: "bg-amber-50 text-amber-600",
  },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      <HeroEditable>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.78)_0%,rgba(12,26,46,0.54)_47%,rgba(12,26,46,0.14)_100%)]" style={{ zIndex: 1 }} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_20%,rgba(240,160,16,0.14)_0%,transparent_45%)]" style={{ zIndex: 2 }} />
        <svg className="absolute bottom-0 left-0 z-[3] h-20 w-full" viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path d="M0,40 C360,75 720,10 1440,50 L1440,80 L0,80Z" className="fill-cream/45" />
          <path d="M0,55 C480,25 960,70 1440,40 L1440,80 L0,80Z" className="fill-cream" />
        </svg>

        <div className="relative z-10 mx-auto w-full max-w-[1180px] px-6 pb-28 pt-36 sm:pb-32 sm:pt-40">
          <div className="mb-7 animate-fade-in-up">
            <LiveHeroStatus />
          </div>

          <h1 className="max-w-4xl animate-fade-in-up font-display text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.35)] sm:text-6xl md:text-7xl lg:text-[88px]">
            L&apos;équitation<br />
            <span className="text-gradient-gold">les pieds dans le sable</span>
          </h1>

          <p className="mt-7 max-w-2xl animate-fade-in-up font-body text-lg leading-relaxed text-white/78 sm:text-xl">
            Stages dès 3 ans, cours toute l&apos;année et balades sur la plage à Agon-Coutainville. Un centre familial, vivant et tourné vers le plaisir de progresser.
          </p>

          <div className="mt-9 flex animate-fade-in-up flex-wrap gap-3">
            <Link href="/espace-cavalier/reserver" className="no-underline">
              <Button variant="primary" size="lg">Voir les places disponibles</Button>
            </Link>
            <Link href="/activites" className="group inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 py-4 font-body text-sm font-bold text-white no-underline backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/16">
              Trouver mon activité <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-14 flex flex-wrap gap-x-10 gap-y-5 border-t border-white/12 pt-6">
            {[
              { value: `Depuis ${SITE_CONFIG.since}`, label: "une histoire familiale" },
              { value: SITE_CONFIG.distanceToBeach, label: "de la plage" },
              { value: "Dès 3 ans", label: "pour tous les niveaux" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="font-display text-xl font-bold text-gold-300">{stat.value}</div>
                <div className="mt-0.5 font-body text-xs text-white/50">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </HeroEditable>

      <HomeActivityFinder />

      <ActusBanner />

      <section className="bg-cream px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-[1180px]">
          <SectionHeader
            tag="Pourquoi venir à Agon"
            title="Un centre entre terre et mer"
            subtitle="Un cadre rare, une équipe proche des familles et une équitation qui garde le plaisir au centre."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {strengths.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[22px] border border-blue-500/[0.07] bg-white p-6 shadow-[0_10px_35px_rgba(12,26,46,0.035)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(12,26,46,0.08)]">
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                    <Icon size={24} />
                  </div>
                  <h3 className="font-display text-lg font-bold text-blue-900">{item.title}</h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-gray-500">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <NextStagesBanner />

      <section className="bg-blue-950 px-6 py-20 text-white sm:py-24">
        <div className="mx-auto grid max-w-[1100px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-3 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Le club depuis 1976</div>
            <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">Une histoire de poneys, de plage et de transmission</h2>
            <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-white/65">
              Créé par la famille Richard, le centre a grandi avec une idée simple : faire découvrir l&apos;équitation dans une ambiance accessible, inventive et exigeante sur le bien-être des poneys.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/equipe" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-body text-sm font-bold text-blue-950 no-underline transition-transform hover:-translate-y-0.5">
                Rencontrer l&apos;équipe <ArrowRight size={15} />
              </Link>
              <Link href="/galerie" className="inline-flex items-center gap-2 rounded-xl border border-white/18 bg-white/5 px-5 py-3 font-body text-sm font-bold text-white no-underline hover:bg-white/10">
                Voir la vie du club
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, value: "Diplômés", label: "encadrement professionnel" },
              { icon: Heart, value: "Bien-être", label: "une cavalerie suivie au quotidien" },
              { icon: TreePine, value: "Nature", label: "plage, dunes et mini-ferme" },
              { icon: Users, value: "Familles", label: "une relation simple et directe" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.value} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
                  <Icon size={21} className="mb-5 text-gold-300" />
                  <div className="font-display text-lg font-bold text-white">{item.value}</div>
                  <div className="mt-1 font-body text-xs leading-relaxed text-white/48">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-cream px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1050px] gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionHeader
              tag="Mini-ferme pédagogique"
              title="Les animaux font partie de l’aventure"
              subtitle="Pépita et Ronron les cochons Kune Kune, les chèvres et les poules accompagnent la découverte, notamment pendant les stages enfants."
              className="!mb-6 !text-left"
            />
            <Link href="/mini-ferme" className="group inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 font-body text-sm font-bold text-blue-700 no-underline shadow-sm hover:border-blue-300">
              Découvrir la mini-ferme <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["Pépita", "Ronron", "Les chèvres", "Les poules"].map((name, index) => (
              <Card key={name} hover padding="md" className="!rounded-2xl text-center">
                <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${index < 2 ? "bg-pink-50 text-pink-500" : "bg-amber-50 text-amber-500"}`}>
                  <Heart size={20} />
                </div>
                <div className="font-body text-sm font-bold text-blue-900">{name}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1100px] overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#06130e_0%,#0a3324_48%,#0f6846_100%)] shadow-[0_25px_70px_rgba(5,35,24,0.18)] lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="p-7 sm:p-10">
            <div className="mb-3 flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Target size={15} /> Aussi à Agon-Coutainville
            </div>
            <h2 className="font-display text-3xl font-bold text-white">LaserBay, l’aventure laser en plein air</h2>
            <p className="mt-4 max-w-2xl font-body text-sm leading-relaxed text-white/60">Une activité sans projectile, en extérieur, pour les familles, anniversaires et groupes qui veulent changer de monture pour une mission futuriste.</p>
          </div>
          <a href="https://laserbay.net" target="_blank" rel="noopener noreferrer" className="group m-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 py-4 font-body text-sm font-bold text-emerald-950 no-underline shadow-lg transition-transform hover:-translate-y-0.5 lg:m-10">
            Découvrir LaserBay <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </section>

      <section className="bg-sand px-6 py-20">
        <div className="mx-auto max-w-[1000px]">
          <SectionHeader tag="Infos pratiques" title="Venir au centre" subtitle="Tout ce qu’il faut pour préparer votre visite à Agon-Coutainville." />
          <div className="grid gap-4 md:grid-cols-3">
            <Card padding="md" className="!rounded-2xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><MapPin size={23} className="text-blue-600" /></div>
              <h3 className="font-display text-base font-bold text-blue-900">Adresse</h3>
              <p className="mt-2 font-body text-sm text-gray-500">{SITE_CONFIG.address.street}<br />{SITE_CONFIG.address.zip} {SITE_CONFIG.address.city}</p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SITE_CONFIG.address.street} ${SITE_CONFIG.address.zip} ${SITE_CONFIG.address.city}`)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-body text-xs font-bold text-blue-600 no-underline">Ouvrir l’itinéraire →</a>
            </Card>
            <Card padding="md" className="!rounded-2xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><Phone size={23} className="text-blue-600" /></div>
              <h3 className="font-display text-base font-bold text-blue-900">Nous joindre</h3>
              <p className="mt-2 font-body text-sm text-gray-500">{SITE_CONFIG.contact.phone}<br />{SITE_CONFIG.contact.email}</p>
              <Link href="/contact" className="mt-3 inline-block font-body text-xs font-bold text-blue-600 no-underline">Poser une question →</Link>
            </Card>
            <Card padding="md" className="!rounded-2xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><Clock size={23} className="text-blue-600" /></div>
              <h3 className="font-display text-base font-bold text-blue-900">Horaires</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-gray-500">Juillet–août : lun–sam<br />Vacances : lun–ven<br />Période scolaire : mer & sam</p>
              <Link href="/contact" className="mt-3 inline-block font-body text-xs font-bold text-blue-600 no-underline">Voir les horaires →</Link>
            </Card>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-cream px-6 py-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(32,80,160,0.06)_0%,transparent_52%)]" />
        <div className="relative z-10 mx-auto max-w-2xl">
          <div className="mb-4 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-500">Votre prochaine aventure</div>
          <h2 className="font-display text-3xl font-bold leading-tight text-blue-900 sm:text-4xl">Prêt à monter à cheval à Agon ?</h2>
          <p className="mx-auto mt-5 max-w-lg font-body text-base leading-relaxed text-gray-500">Consultez les créneaux, ajoutez vos cavaliers et réservez directement depuis votre espace famille.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/espace-cavalier/reserver" className="no-underline"><Button variant="primary" size="lg">Réserver maintenant</Button></Link>
            <Link href="/planning" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-4 font-body text-sm font-bold text-blue-700 no-underline hover:border-blue-300">Voir le planning <ArrowRight size={15} /></Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
