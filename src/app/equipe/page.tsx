"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui";
import { EditableImage } from "@/components/ui/EditableImage";
import type { VitrineImageKey } from "@/hooks/useVitrineImages";
import { Award, Heart, Loader2, Sparkles, Users, Waves } from "lucide-react";

const team: Array<{
  name: string;
  role: string;
  imageKey: VitrineImageKey;
  initials: string;
  description: string;
  specialties: string[];
}> = [
  {
    name: "Nicolas",
    role: "Gérant du centre",
    imageKey: "equipe-nicolas",
    initials: "N",
    description: "Nicolas pilote le centre, imagine de nouvelles expériences pour les cavaliers et fait le lien entre la tradition familiale, le terrain et les outils numériques.",
    specialties: ["Gestion", "Pony Games", "Animation", "Innovation"],
  },
  {
    name: "Emmeline",
    role: "Monitrice BPJEPS",
    imageKey: "equipe-emmeline",
    initials: "E",
    description: "Emmeline accompagne les cavaliers du baby poney aux groupes confirmés. Son enseignement associe exigence technique, imagination et attention portée à chaque enfant.",
    specialties: ["Enseignement", "CSO", "Dressage", "Baby Poney"],
  },
];

const levelColors: Record<string, "green" | "blue" | "orange"> = {
  Débutant: "green",
  Intermédiaire: "blue",
  Confirmé: "orange",
  "Tous niveaux": "blue",
};

interface FeaturedPoney {
  id: string;
  name: string;
  type: string;
  niveauCavalier: string;
  publicDescription: string;
  photo: string;
}

export default function EquipePage() {
  const [featuredPoneys, setFeaturedPoneys] = useState<FeaturedPoney[]>([]);
  const [loadingPoneys, setLoadingPoneys] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, "equides"), where("featured", "==", true)));
        if (cancelled) return;
        setFeaturedPoneys(snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as any))
          .filter((horse) => horse.status === "actif" && typeof horse.photo === "string" && horse.photo.trim())
          .map((horse) => ({
            id: horse.id,
            name: String(horse.surnom || horse.name || "").trim(),
            type: horse.type === "shetland" ? "Shetland" : horse.type === "cheval" ? "Cheval" : horse.type === "ane" ? "Âne" : "Poney",
            niveauCavalier: horse.niveauCavalier || "Tous niveaux",
            publicDescription: horse.publicDescription || "",
            photo: horse.photo,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error("Erreur chargement poneys vedettes :", error);
      } finally {
        if (!cancelled) setLoadingPoneys(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Navbar />
      <main className="bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#12346b_58%,#2050a0_100%)] px-6 pb-24 pt-36 text-white sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute -right-36 -top-52 h-[540px] w-[540px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="relative mx-auto max-w-[1120px]">
            <div className="max-w-3xl">
              <div className="mb-4 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Une histoire familiale depuis 1976</div>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">Les humains et les poneys qui font vivre le club</h1>
              <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/65 sm:text-lg">Derrière chaque cours, chaque stage et chaque balade, il y a une équipe, une cavalerie suivie au quotidien et près de cinquante ans de souvenirs à Agon-Coutainville.</p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Users, value: "Familial", text: "une relation directe avec les cavaliers" },
                { icon: Waves, value: "Littoral", text: "un centre à 800 m de la plage" },
                { icon: Heart, value: "Bien-être", text: "des poneys connus et suivis individuellement" },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.value} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300"><Icon size={19} /></div><div><div className="font-display text-lg font-bold text-white">{item.value}</div><div className="mt-1 font-body text-xs leading-relaxed text-white/45">{item.text}</div></div></div>;
              })}
            </div>
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Notre histoire</div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-blue-950 sm:text-4xl">Un club construit autour des enfants, du jeu et du grand air</h2>
              <p className="mt-5 font-body text-base leading-relaxed text-slate-600">Créé en 1976 par William et Marianne Richard, le centre a accompagné plusieurs générations de cavaliers. Le poney y a toujours été un formidable outil d’apprentissage, de confiance et d’aventure.</p>
              <p className="mt-4 font-body text-base leading-relaxed text-slate-600">Pony Games, horse-ball, stages scénarisés, promenades sur la plage puis outils numériques : le club évolue, mais conserve la même envie de proposer une équitation vivante et accessible.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { year: "1976", title: "Création du centre", text: "William et Marianne Richard s’installent à Agon-Coutainville." },
                { year: "Années 80", title: "Le poney en mouvement", text: "Développement des jeux, du horse-ball et des premières équipes de Pony Games." },
                { year: "Aujourd’hui", title: "Une offre pour tous", text: "Baby poney, stages, cours, plage, compétition et mini-ferme." },
                { year: "Demain", title: "Innover sans perdre l’âme", text: "Une gestion plus simple pour les familles et toujours plus de temps sur le terrain." },
              ].map((step) => (
                <div key={step.year} className="rounded-[22px] border border-blue-500/[0.08] bg-white p-5 shadow-[0_10px_35px_rgba(12,26,46,0.035)]">
                  <div className="font-display text-2xl font-bold text-gold-500">{step.year}</div>
                  <div className="mt-3 font-display text-lg font-bold text-blue-950">{step.title}</div>
                  <p className="mt-2 font-body text-sm leading-relaxed text-slate-500">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1000px]">
            <div className="mx-auto mb-10 max-w-2xl text-center"><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">L’équipe</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Des interlocuteurs que vous connaissez</h2><p className="mt-4 font-body text-base leading-relaxed text-slate-500">Une petite équipe permet de suivre les cavaliers dans le temps et de garder un échange simple avec les familles.</p></div>
            <div className="grid gap-6 md:grid-cols-2">
              {team.map((member) => (
                <article key={member.name} className="overflow-hidden rounded-[26px] border border-blue-500/[0.08] bg-cream shadow-[0_16px_48px_rgba(12,26,46,0.055)]">
                  <div className="flex items-center gap-5 p-6 pb-4">
                    <EditableImage imageKey={member.imageKey} mode="img" label={`Photo ${member.name}`} alt={member.name} className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl">
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-700"><span className="font-display text-2xl font-bold text-white">{member.initials}</span></div>
                    </EditableImage>
                    <div><h3 className="font-display text-2xl font-bold text-blue-950">{member.name}</h3><div className="mt-1 font-body text-sm font-bold text-gold-600">{member.role}</div></div>
                  </div>
                  <div className="px-6 pb-6"><p className="font-body text-sm leading-relaxed text-slate-600">{member.description}</p><div className="mt-5 flex flex-wrap gap-2">{member.specialties.map((specialty) => <span key={specialty} className="rounded-full bg-white px-3 py-1.5 font-body text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">{specialty}</span>)}</div></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-sand px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1120px]">
            <div className="mx-auto mb-10 max-w-2xl text-center"><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">La cavalerie</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Les poneys vedettes du centre</h2><p className="mt-4 font-body text-base leading-relaxed text-slate-500">Chaque poney a son caractère, ses qualités et les cavaliers avec lesquels il se sent le mieux.</p></div>

            {loadingPoneys ? (
              <div className="flex justify-center py-14"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            ) : featuredPoneys.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featuredPoneys.map((poney) => (
                  <article key={poney.id} className="group overflow-hidden rounded-[24px] border border-blue-500/[0.08] bg-white shadow-[0_12px_38px_rgba(12,26,46,0.045)] transition-all hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(12,26,46,0.1)]">
                    <div className="aspect-[4/3] overflow-hidden bg-blue-50"><img src={poney.photo} alt={poney.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" /></div>
                    <div className="p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-bold text-blue-950">{poney.name}</h3><Badge color="gray">{poney.type}</Badge><Badge color={levelColors[poney.niveauCavalier] || "blue"}>{poney.niveauCavalier}</Badge></div>{poney.publicDescription && <p className="mt-3 font-body text-sm leading-relaxed text-slate-500">{poney.publicDescription}</p>}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-blue-200 bg-white px-6 py-14 text-center"><Sparkles size={27} className="mx-auto text-blue-300" /><h3 className="mt-4 font-display text-xl font-bold text-blue-950">Les portraits arrivent bientôt</h3><p className="mt-2 font-body text-sm text-slate-500">La cavalerie est déjà au travail pendant que les photos se préparent.</p></div>
            )}
          </div>
        </section>

        <section className="bg-cream px-6 py-20 text-center">
          <Award size={29} className="mx-auto text-gold-500" />
          <h2 className="mt-4 font-display text-3xl font-bold text-blue-950">Venez rencontrer l’équipe sur place</h2>
          <p className="mx-auto mt-4 max-w-lg font-body text-sm leading-relaxed text-slate-500">Une question sur un groupe, un niveau ou un poney ? Le meilleur point de départ reste souvent une discussion.</p>
          <a href="/contact" className="mt-7 inline-flex rounded-xl bg-blue-700 px-6 py-3.5 font-body text-sm font-bold text-white no-underline shadow-lg">Nous contacter</a>
        </section>
      </main>
      <Footer />
    </>
  );
}
