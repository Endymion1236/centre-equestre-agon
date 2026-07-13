import Link from "next/link";
import {
  ArrowRight,
  CircleDot,
  Flame,
  GraduationCap,
  Heart,
  House,
  Ruler,
  ShieldCheck,
  Sparkles,
  Trees,
  Warehouse,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const facilities = [
  {
    icon: Warehouse,
    value: "3",
    title: "manèges couverts",
    text: "Trois espaces pour travailler confortablement toute l’année, quelle que soit la météo.",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    icon: CircleDot,
    value: "1",
    title: "manège circulaire",
    text: "Un espace à taille de poney, spécialement adapté aux séances des plus jeunes.",
    tone: "bg-pink-50 text-pink-700",
  },
  {
    icon: Ruler,
    value: "80 × 45 m",
    title: "grande carrière",
    text: "Une vaste carrière en sable de Fontainebleau pour évoluer avec espace et confort.",
    tone: "bg-amber-50 text-amber-700",
  },
];

export default function InstallationsPage() {
  return (
    <>
      <Navbar />
      <main className="bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#14376e_55%,#2050a0_100%)] px-6 pb-24 pt-36 text-white sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute -right-40 -top-48 h-[560px] w-[560px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="pointer-events-none absolute bottom-0 left-[12%] h-32 w-72 rounded-t-[140px] border border-white/[0.06] bg-white/[0.025]" />
          <div className="relative mx-auto max-w-[1120px]">
            <div className="max-w-3xl">
              <div className="mb-4 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Le centre et ses installations</div>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">De l’espace pour apprendre, du confort pour se retrouver</h1>
              <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/68 sm:text-lg">
                Des équipements adaptés à chaque âge, des espaces couverts pour monter toute l’année et une organisation attentive aux besoins naturels des chevaux.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {facilities.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm">
                    <Icon size={21} className="mb-5 text-gold-300" />
                    <div className="font-display text-2xl font-bold text-white">{item.value}</div>
                    <div className="mt-1 font-body text-xs font-semibold text-white/52">{item.title}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1120px]">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Monter toute l’année</div>
              <h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Des espaces pour chaque pratique</h2>
              <p className="mt-4 font-body text-base leading-relaxed text-slate-500">Du Baby Poney au travail sportif, chaque groupe bénéficie d’un espace cohérent avec son âge, son niveau et l’objectif de la séance.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {facilities.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-[26px] border border-blue-500/[0.08] bg-white p-7 shadow-[0_14px_42px_rgba(12,26,46,0.05)]">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${item.tone}`}><Icon size={27} /></div>
                    <div className="mt-7 font-display text-3xl font-bold text-blue-950">{item.value}</div>
                    <h3 className="mt-1 font-display text-xl font-bold text-blue-900">{item.title}</h3>
                    <p className="mt-4 font-body text-sm leading-relaxed text-slate-500">{item.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1080px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#3a1f12_0%,#73391d_52%,#c56a27_100%)] p-8 text-white shadow-[0_24px_65px_rgba(91,45,20,0.2)] sm:p-10">
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-orange-300/10 blur-2xl" />
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-300/15 text-orange-200 ring-1 ring-orange-200/20"><Flame size={31} /></div>
                <div className="mt-10 font-body text-xs font-bold uppercase tracking-[0.18em] text-orange-200">Le club-house</div>
                <h2 className="mt-3 font-display text-3xl font-bold text-white">Un endroit chaleureux, surtout quand le feu crépite</h2>
                <p className="mt-5 font-body text-sm leading-relaxed text-white/68">Cavaliers, parents et accompagnants peuvent s’y retrouver, patienter ou simplement partager un moment après la séance. En hiver, le feu en fait le cœur chaleureux du centre.</p>
              </div>
            </div>
            <div>
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Plus qu’un lieu de pratique</div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-blue-950 sm:text-4xl">Un club où l’on se sent bien</h2>
              <p className="mt-5 font-body text-base leading-relaxed text-slate-600">Un centre équestre vit aussi autour des reprises : les échanges avec l’équipe, les retrouvailles entre familles et les souvenirs racontés après avoir dessellé.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-2xl bg-cream p-4"><House size={20} className="mt-0.5 flex-shrink-0 text-blue-600" /><div><div className="font-body text-sm font-bold text-blue-950">Accueil des familles</div><div className="mt-1 font-body text-xs leading-relaxed text-slate-500">Un espace pour attendre et échanger.</div></div></div>
                <div className="flex gap-3 rounded-2xl bg-cream p-4"><Flame size={20} className="mt-0.5 flex-shrink-0 text-orange-500" /><div><div className="font-body text-sm font-bold text-blue-950">Chaleur en hiver</div><div className="mt-1 font-body text-xs leading-relaxed text-slate-500">Le plaisir simple de se retrouver autour du feu.</div></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-[linear-gradient(135deg,#061f17_0%,#0d4934_52%,#14734f_100%)] px-6 py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-[1100px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.18em] text-emerald-300"><Heart size={15} /> Bien-être de la cavalerie</div>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-white sm:text-4xl">Vivre dehors, bouger et rester en contact</h2>
              <p className="mt-5 font-body text-base leading-relaxed text-white/68">Pour rester au plus près de leurs besoins naturels, nos chevaux et poneys vivent la majeure partie du temps en extérieur. Ils peuvent se déplacer, observer leur environnement et entretenir des contacts sociaux.</p>
              <p className="mt-4 font-body text-sm leading-relaxed text-white/55">Lorsque les conditions météorologiques l’exigent, ils sont bien sûr abrités ou rentrés. Leur confort, leur état physique, leur alimentation et leur charge de travail font l’objet d’une attention quotidienne.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Trees, title: "Vie en extérieur", text: "De l’espace et du mouvement au quotidien." },
                { icon: Heart, title: "Contacts sociaux", text: "Une vie organisée au plus près de leurs besoins." },
                { icon: ShieldCheck, title: "Protection météo", text: "Des chevaux abrités ou rentrés lorsque nécessaire." },
                { icon: Sparkles, title: "Suivi quotidien", text: "Confort, alimentation, état physique et rythme de travail." },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><Icon size={22} className="text-emerald-300" /><h3 className="mt-5 font-display text-lg font-bold text-white">{item.title}</h3><p className="mt-2 font-body text-xs leading-relaxed text-white/48">{item.text}</p></div>;
              })}
            </div>
          </div>
        </section>

        <section className="bg-cream px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1050px]">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Pédagogie</div>
              <h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Du matériel qui aide vraiment à comprendre</h2>
              <p className="mt-4 font-body text-base leading-relaxed text-slate-500">Un équipement adapté rend les consignes plus concrètes et permet aux cavaliers de gagner en autonomie dès les premières séances.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <article className="rounded-[26px] border border-blue-500/[0.08] bg-white p-7 shadow-[0_14px_42px_rgba(12,26,46,0.045)]">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><GraduationCap size={25} /></div>
                <h3 className="mt-6 font-display text-2xl font-bold text-blue-950">Selles Gigantins</h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-slate-500">Un matériel pédagogique pensé pour offrir aux jeunes cavaliers des repères simples et une position plus facile à construire.</p>
              </article>
              <article className="rounded-[26px] border border-blue-500/[0.08] bg-white p-7 shadow-[0_14px_42px_rgba(12,26,46,0.045)]">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Sparkles size={25} /></div>
                <h3 className="mt-6 font-display text-2xl font-bold text-blue-950">Rênes pédagogiques Equidrive</h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-slate-500">Des repères visuels qui aident à placer les mains, doser ses actions et mieux comprendre le contact avec le poney.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 text-center">
          <Warehouse size={30} className="mx-auto text-gold-500" />
          <h2 className="mt-4 font-display text-3xl font-bold text-blue-950">Venez découvrir le centre</h2>
          <p className="mx-auto mt-4 max-w-xl font-body text-sm leading-relaxed text-slate-500">Une question sur nos installations, nos groupes ou le matériel utilisé ? Nous vous répondrons avec plaisir.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3.5 font-body text-sm font-bold text-white no-underline shadow-lg">Nous contacter <ArrowRight size={15} /></Link>
            <Link href="/activites" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3.5 font-body text-sm font-bold text-blue-700 no-underline">Découvrir les activités</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
