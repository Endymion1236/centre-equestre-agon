"use client";

import { Camera, Facebook, Images, Sparkles } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { EditableImage } from "@/components/ui/EditableImage";
import GalerieCategoryCard from "@/components/GalerieCategoryCard";
import type { VitrineImageKey } from "@/hooks/useVitrineImages";
import { SITE_CONFIG } from "@/lib/config";

const categories: Array<{ id: string; key: VitrineImageKey; label: string; description: string }> = [
  { id: "balades", key: "galerie-balades", label: "Balades plage", description: "Dunes, estuaire et lumière du soir" },
  { id: "stages", key: "galerie-stages", label: "Stages", description: "Les aventures des vacances" },
  { id: "competitions", key: "galerie-competitions", label: "Compétitions", description: "CSO, Pony Games et défis du club" },
  { id: "miniferme", key: "galerie-miniferme", label: "Mini-ferme", description: "Les animaux et les découvertes" },
  { id: "club", key: "galerie-club", label: "Vie du club", description: "Fêtes, rencontres et souvenirs" },
];

export default function GaleriePage() {
  return (
    <>
      <Navbar />
      <main className="bg-cream">
        <EditableImage imageKey="hero-plage" mode="background" label="Changer le fond" className="relative overflow-hidden px-6 pb-24 pt-36 text-center sm:pb-28 sm:pt-40" style={{ minHeight: "500px" }}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.38),rgba(7,17,31,0.78))]" />
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-gold-300 backdrop-blur-md"><Camera size={27} /></div>
            <div className="mt-6 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-300">La vie du centre en images</div>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">Des souvenirs qui sentent le sable, les poneys et les vacances</h1>
            <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/68 sm:text-lg">Parcourez les albums du centre et découvrez l’ambiance des stages, des balades, des compétitions et de la mini-ferme.</p>
          </div>
        </EditableImage>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1080px]">
            <div className="mx-auto mb-10 max-w-2xl text-center"><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Albums</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Choisissez un univers</h2><p className="mt-4 font-body text-base leading-relaxed text-slate-500">Chaque album est alimenté depuis l’administration du site afin de faire remonter les images les plus récentes.</p></div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <div key={category.id} className="group overflow-hidden rounded-[24px] border border-blue-500/[0.08] bg-white shadow-[0_12px_38px_rgba(12,26,46,0.045)] transition-all hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(12,26,46,0.1)]">
                  <GalerieCategoryCard category={category.id} label={category.label} fallbackKey={category.key} />
                  <div className="border-t border-slate-100 px-5 py-4"><div className="font-body text-xs leading-relaxed text-slate-400">{category.description}</div></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto grid max-w-[1000px] overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#07111f,#12346b)] text-white shadow-[0_22px_60px_rgba(12,26,46,0.14)] md:grid-cols-[1fr_auto] md:items-center">
            <div className="p-7 sm:p-9"><div className="flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-gold-300"><Images size={15} /> Encore plus d’images</div><h2 className="mt-3 font-display text-2xl font-bold text-white">Suivez les actualités du centre sur Facebook</h2><p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-white/55">Photos de la semaine, informations pratiques, résultats et coulisses du club y sont publiés régulièrement.</p></div>
            <div className="p-7 pt-0 md:p-9"><a href={SITE_CONFIG.social.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-6 py-3.5 font-body text-sm font-bold text-white no-underline shadow-lg transition-transform hover:-translate-y-0.5"><Facebook size={17} /> Ouvrir Facebook</a></div>
          </div>
        </section>

        <section className="bg-cream px-6 py-16 text-center"><Sparkles size={25} className="mx-auto text-gold-500" /><h2 className="mt-4 font-display text-2xl font-bold text-blue-950">Venez créer les prochains souvenirs</h2><a href="/espace-cavalier/reserver" className="mt-6 inline-flex rounded-xl bg-blue-700 px-6 py-3.5 font-body text-sm font-bold text-white no-underline">Voir les activités disponibles</a></section>
      </main>
      <Footer />
    </>
  );
}
