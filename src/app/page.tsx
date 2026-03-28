import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button, SectionHeader, Card } from "@/components/ui";
import { SITE_CONFIG } from "@/lib/config";
import Link from "next/link";
import {
  Waves, Baby, Trophy, TreePine,
  Star, Compass, CalendarDays, PartyPopper,
  Award, Medal, Crown,
  MapPin, Phone, Clock,
  Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen flex items-center bg-hero overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-800/50 via-blue-500/20 to-blue-600/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(240,160,16,0.1)_0%,transparent_50%)]" />
        {/* Animated dots */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-gold-400/30" style={{
              width: 4 + i * 2, height: 4 + i * 2,
              top: `${20 + i * 15}%`, left: `${70 + i * 5}%`,
              animation: `float ${3 + i}s ease-in-out infinite alternate`,
            }} />
          ))}
        </div>
        <style>{`@keyframes float{0%{transform:translateY(0)}100%{transform:translateY(-20px)}}`}</style>

        <svg className="absolute bottom-0 left-0 w-full h-20" viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path d="M0,40 C360,75 720,10 1440,50 L1440,80 L0,80Z" className="fill-cream/40" />
          <path d="M0,55 C480,25 960,70 1440,40 L1440,80 L0,80Z" className="fill-cream" />
        </svg>

        <div className="relative z-10 max-w-[1180px] mx-auto px-6 pt-36 pb-28 w-full">
          <div className="inline-flex items-center gap-2.5 bg-gold-400/15 border border-gold-400/25 rounded-full px-5 py-2 mb-7 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]" />
            <span className="font-body text-sm font-medium text-white/90">Réservations ouvertes — Stages Pâques 2026</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-none tracking-tighter max-w-3xl mb-6 animate-fade-in-up animate-delay-100 [text-shadow:0_2px_40px_rgba(0,0,0,0.3)]">
            L&apos;équitation<br />
            <span className="text-gradient-gold">les pieds dans le sable</span>
          </h1>

          <p className="font-body text-lg md:text-xl text-white/75 leading-relaxed max-w-xl mb-10 animate-fade-in-up animate-delay-200">
            Stages, balades au coucher du soleil, cours toute l&apos;année et mini-ferme pédagogique. À {SITE_CONFIG.distanceToBeach} de la mer.
          </p>

          <div className="flex gap-4 flex-wrap animate-fade-in-up animate-delay-300">
            <Link href="/espace-cavalier/reserver"><Button variant="primary" size="lg">Réserver une activité</Button></Link>
            <Link href="/activites"><button className="glass px-10 py-4 rounded-xl font-body text-base font-medium text-white hover:bg-white/18 transition-all cursor-pointer border-none">Découvrir nos activités</button></Link>
          </div>

          <div className="flex gap-12 mt-16 flex-wrap animate-fade-in-up animate-delay-400">
            {[
              { value: `Depuis ${SITE_CONFIG.since}`, label: "au service des cavaliers" },
              { value: SITE_CONFIG.distanceToBeach, label: "de la plage" },
              { value: "3 – 77 ans", label: "pour tous les âges" },
            ].map((stat, i) => (
              <div key={i}>
                <div className="font-display text-xl font-bold text-gold-300 [text-shadow:0_1px_10px_rgba(0,0,0,0.2)]">{stat.value}</div>
                <div className="font-body text-sm text-white/45">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ POURQUOI NOUS CHOISIR ═══ */}
      <section className="py-20 px-6 bg-cream">
        <div className="max-w-[1180px] mx-auto">
          <SectionHeader
            tag="Pourquoi nous choisir"
            title="Un centre unique en Normandie"
            subtitle="Entre terre et mer, notre centre offre un cadre naturel exceptionnel pour apprendre et se perfectionner."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Waves, color: "text-blue-500", bg: "bg-blue-50", title: "À 800m de la plage", desc: "Galops sur le sable, couchers de soleil à cheval... un cadre unique classé Natura 2000." },
              { icon: Baby, color: "text-pink-500", bg: "bg-pink-50", title: "Dès 3 ans", desc: "Du Baby Poney pour les tout-petits au perfectionnement pour les confirmés." },
              { icon: Trophy, color: "text-amber-500", bg: "bg-amber-50", title: "Compétition FFE", desc: "Pony Games, CSO, Équifun — préparation aux championnats de France à Lamotte-Beuvron." },
              { icon: TreePine, color: "text-green-600", bg: "bg-green-50", title: "Mini-ferme", desc: "Cochons Kune Kune, chèvres, poules — un espace pédagogique qui émerveille les enfants." },
            ].map((item, i) => (
              <div key={i} className="text-center p-6">
                {(() => { const Icon = item.icon; return <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center mx-auto mb-4`}><Icon size={28} className={item.color} /></div>; })()}
                <h3 className="font-display text-base font-bold text-blue-800 mb-2">{item.title}</h3>
                <p className="font-body text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ NOS ACTIVITÉS ═══ */}
      <section className="py-24 px-6 max-w-[1180px] mx-auto">
        <SectionHeader
          tag="Nos activités"
          title="Une aventure pour chaque cavalier"
          subtitle="Du baby poney dès 3 ans aux balades au galop sur la plage."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: Star, title: "Stages vacances", desc: "Baby Poney, Galop de Bronze, d'Argent, d'Or... Semaines thématiques inoubliables.", age: "Dès 3 ans", price: "175", gradient: "from-blue-500 to-blue-400", href: "/activites" },
            { icon: Compass, title: "Balades plage", desc: "2h entre dunes, estuaire et plage. Au coucher du soleil, c'est magique.", age: "Dès 12 ans", price: "53", gradient: "from-orange-500 to-orange-400", href: "/activites" },
            { icon: CalendarDays, title: "Cours réguliers", desc: "Forfaits annuels, 1 ou 2 cours par semaine. Progressez toute l'année.", age: "Tous niveaux", gradient: "from-gold-400 to-gold-300", href: "/activites" },
            { icon: PartyPopper, title: "Anniversaires", desc: "Une fête au milieu des poneys ! Jeux, balade et goûter inclus.", age: "Dès 4 ans", gradient: "from-red-400 to-orange-400", href: "/contact" },
          ].map((activity, i) => (
            <Link key={i} href={activity.href} className="no-underline">
              <Card hover className="overflow-hidden !p-0 h-full">
                <div className={`h-44 bg-gradient-to-br ${activity.gradient} relative flex items-center justify-center`}>
                  {(() => { const Icon = activity.icon; return <Icon size={64} className="text-white/25" strokeWidth={1} />; })()}
                  {activity.price && (
                    <div className="absolute top-3 right-3 bg-white/95 rounded-lg px-3 py-1 font-body text-xs font-bold text-blue-500 shadow-sm">dès {activity.price}€</div>
                  )}
                  <div className="absolute bottom-3 left-3 font-body text-xs font-semibold text-white bg-blue-500/75 backdrop-blur-sm px-3 py-1 rounded-md">{activity.age}</div>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold text-blue-800 mb-2">{activity.title}</h3>
                  <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">{activity.desc}</p>
                  <span className="font-body text-sm font-semibold text-blue-500 inline-flex items-center gap-1">En savoir plus <span>→</span></span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ STAGES VACANCES — CTA ═══ */}
      <section className="py-20 px-6 bg-blue-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(240,160,16,0.08)_0%,transparent_50%)]" />
        <div className="max-w-[900px] mx-auto relative z-10 flex flex-wrap items-center gap-12">
          <div className="flex-1 min-w-[300px]">
            <span className="font-body text-xs font-bold text-gold-400 uppercase tracking-widest mb-3 block">Stages Pâques 2026</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white leading-tight mb-4">Les inscriptions<br />sont ouvertes !</h2>
            <p className="font-body text-base text-white/60 leading-relaxed mb-6">
              Semaines du 14 au 18 et du 21 au 25 avril. Baby Poney, Galop de Bronze, d&apos;Argent et d&apos;Or.
              Places limitées à 6-8 cavaliers par groupe.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link href="/espace-cavalier/reserver"><Button variant="primary" size="lg">Réserver maintenant</Button></Link>
              <Link href="/tarifs" className="no-underline"><button className="glass px-8 py-4 rounded-xl font-body text-base font-medium text-white hover:bg-white/18 transition-all cursor-pointer border-none">Voir les tarifs</button></Link>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] flex justify-center">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Baby, color: "text-pink-500", label: "Baby Poney", sub: "3-5 ans" },
                { icon: Award, color: "text-amber-700", label: "Galop Bronze", sub: "6-8 ans" },
                { icon: Medal, color: "text-gray-400", label: "Galop Argent", sub: "8-10 ans" },
                { icon: Crown, color: "text-amber-500", label: "Galop d'Or", sub: "8+ ans" },
              ].map((s, i) => (
                <div key={i} className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
                  {(() => { const Icon = s.icon; return <Icon size={24} className={`${s.color} mx-auto mb-1`} />; })()}
                  <div className="font-body text-xs font-semibold text-white">{s.label}</div>
                  <div className="font-body text-[10px] text-white/40">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MINI-FERME TEASER ═══ */}
      <section className="py-24 px-6 bg-cream">
        <div className="max-w-[1000px] mx-auto flex flex-wrap items-center gap-12">
          <div className="flex-1 min-w-[300px]">
            <SectionHeader
              tag="Mini-ferme pédagogique"
              title="Rencontrez nos pensionnaires"
              subtitle="Pépita et Ronron les cochons Kune Kune, des chèvres acrobates et des poules pondeuses. Un espace de découverte intégré à tous nos stages."
              className="!text-left !mb-6"
            />
            <Link href="/mini-ferme"><Button variant="outline">Découvrir la mini-ferme →</Button></Link>
          </div>
          <div className="flex-1 min-w-[250px]">
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Heart, color: "text-pink-400", name: "Pépita", type: "Kune Kune roux" },
                { icon: Heart, color: "text-pink-400", name: "Ronron", type: "Kune Kune blanc" },
                { icon: Heart, color: "text-amber-500", name: "Les chèvres", type: "Chèvres naines" },
                { icon: Heart, color: "text-orange-400", name: "Les poules", type: "Pondeuses" },
              ].map((a, i) => (
                <Card key={i} hover padding="sm" className="text-center !py-5">
                  {(() => { const Icon = a.icon; return <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2"><Icon size={20} className={a.color} /></div>; })()}
                  <div className="font-body text-sm font-semibold text-blue-800">{a.name}</div>
                  <div className="font-body text-xs text-gray-400">{a.type}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TÉMOIGNAGES ═══ */}
      <section className="py-24 px-6 bg-sand">
        <div className="max-w-[1000px] mx-auto">
          <SectionHeader
            tag="Témoignages"
            title="Ce que disent nos familles"
            subtitle="Des avis qui réchauffent le cœur."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Sophie M.", stars: 5, text: "Emma a adoré ! L'équipe est top, les poneys bien soignés. On revient aux prochaines vacances.", activity: "Stage Galop d'Argent" },
              { name: "Claire P.", stars: 5, text: "Magique ! Les dunes au coucher du soleil c'est inoubliable. Hugo était aux anges.", activity: "Balade coucher de soleil" },
              { name: "Lucie M.", stars: 5, text: "Antoine ne veut plus rentrer à la maison ! L'approche multi-disciplines est géniale.", activity: "Stage Galop d'Or" },
            ].map((t, i) => (
              <Card key={i} padding="md" className="relative">
                <div className="font-body text-gold-400 text-sm mb-3">{"★".repeat(t.stars)}</div>
                <p className="font-body text-sm text-gray-500 leading-relaxed italic mb-4">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{t.name}</div>
                    <div className="font-body text-xs text-gray-400">{t.activity}</div>
                  </div>
                  <div className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded">Google</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ NOS PONEYS STARS ═══ */}
      <section className="py-20 px-6 bg-cream">
        <div className="max-w-[1000px] mx-auto">
          <SectionHeader
            tag="Notre cavalerie"
            title="Nos poneys stars"
          />
          <div className="flex flex-wrap gap-4 justify-center">
            {["Sircee", "Batz", "Ultim", "Rose", "Gucci", "Galaxy", "Caramel", "Java", "Joy"].map((name) => (
              <div key={name} className="bg-white rounded-xl px-5 py-3 border border-blue-500/8 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <Heart size={18} className="text-blue-400" />
                <span className="font-body text-sm font-semibold text-blue-800">{name}</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/mini-ferme" className="font-body text-sm font-semibold text-blue-500 no-underline">Découvrir toute la cavalerie →</Link>
          </div>
        </div>
      </section>

      {/* ═══ INFOS PRATIQUES ═══ */}
      <section className="py-20 px-6 bg-sand">
        <div className="max-w-[1000px] mx-auto">
          <SectionHeader
            tag="Infos pratiques"
            title="Venir au centre"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card padding="md" className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><MapPin size={24} className="text-blue-500" /></div>
              <h3 className="font-display text-base font-bold text-blue-800 mb-2">Adresse</h3>
              <p className="font-body text-sm text-gray-500">{SITE_CONFIG.address.street}<br />{SITE_CONFIG.address.zip} {SITE_CONFIG.address.city}</p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SITE_CONFIG.address.street} ${SITE_CONFIG.address.zip} ${SITE_CONFIG.address.city}`)}`}
                target="_blank" rel="noopener noreferrer" className="font-body text-xs font-semibold text-blue-500 no-underline mt-3 inline-block">Ouvrir dans Maps →</a>
            </Card>
            <Card padding="md" className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Phone size={24} className="text-blue-500" /></div>
              <h3 className="font-display text-base font-bold text-blue-800 mb-2">Contact</h3>
              <p className="font-body text-sm text-gray-500">{SITE_CONFIG.contact.phone}<br />{SITE_CONFIG.contact.email}</p>
              <Link href="/contact" className="font-body text-xs font-semibold text-blue-500 no-underline mt-3 inline-block">Formulaire de contact →</Link>
            </Card>
            <Card padding="md" className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Clock size={24} className="text-blue-500" /></div>
              <h3 className="font-display text-base font-bold text-blue-800 mb-2">Horaires</h3>
              <p className="font-body text-sm text-gray-500">
                Juil–Août : Lun–Sam 9h–19h<br />
                Vacances : Lun–Ven 9h–18h<br />
                Scolaire : Mer, Sam 9h–18h
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="py-24 px-6 text-center bg-cream relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(32,80,160,0.04)_0%,transparent_50%)]" />
        <div className="max-w-lg mx-auto relative z-10">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-blue-800 leading-tight mb-5">
            Prêt à vivre<br />l&apos;aventure équestre ?
          </h2>
          <p className="font-body text-lg text-gray-500 leading-relaxed mb-9">
            Réservez en ligne, paiement sécurisé, confirmation immédiate.
          </p>
          <Link href="/espace-cavalier/reserver"><Button variant="primary" size="lg">Réserver maintenant</Button></Link>
        </div>
      </section>

      <Footer />
    </>
  );
}
