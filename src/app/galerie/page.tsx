"use client";

import { Camera } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader } from "@/components/ui";
import { EditableImage } from "@/components/ui/EditableImage";
import type { VitrineImageKey } from "@/hooks/useVitrineImages";

const categories: { id: string; key: VitrineImageKey; label: string }[] = [
  { id: "balades",      key: "galerie-balades",      label: "Balades plage" },
  { id: "stages",       key: "galerie-stages",        label: "Stages" },
  { id: "competitions", key: "galerie-competitions",  label: "Compétitions" },
  { id: "miniferme",    key: "galerie-miniferme",     label: "Mini-ferme" },
  { id: "club",         key: "galerie-club",          label: "Vie du club" },
];

export default function GaleriePage() {
  return (
    <>
      <Navbar />

      <EditableImage
        imageKey="hero-plage"
        mode="background"
        label="Changer le fond"
        className="relative pt-32 pb-20 px-6 text-center overflow-hidden"
        style={{ minHeight: "280px" }}
      >
        <div className="absolute inset-0 bg-blue-900/50 pointer-events-none" />
        <svg className="absolute bottom-0 left-0 w-full h-12 pointer-events-none" viewBox="0 0 1440 50" preserveAspectRatio="none">
          <path d="M0,30 C480,50 960,10 1440,35 L1440,50 L0,50Z" className="fill-cream" />
        </svg>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Camera size={32} className="text-white/80" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Galerie photos
          </h1>
          <p className="font-body text-lg text-white/65">
            Les plus beaux moments du centre en images.
          </p>
        </div>
      </EditableImage>

      <section className="py-16 px-6 max-w-[1000px] mx-auto">
        <SectionHeader
          tag="Albums"
          title="Parcourez nos albums"
          subtitle="Balades, stages, compétitions, mini-ferme... revivez l'ambiance du club."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => (
            <div key={cat.id} className="card !p-0 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all">
              <EditableImage imageKey={cat.key} mode="img" label={`Photo ${cat.label}`} className="h-44" alt={cat.label} />
              <div className="p-5 text-center">
                <h3 className="font-display text-lg font-bold text-blue-800 mb-1">{cat.label}</h3>
                <p className="font-body text-sm text-gray-400">Photos à venir</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center bg-gold-50 rounded-2xl p-8 border border-gold-400/15">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4"><Camera size={28} className="text-blue-300" /></div>
          <h3 className="font-display text-xl font-bold text-blue-800 mb-3">Galerie en cours de construction</h3>
          <p className="font-body text-sm text-gray-500 leading-relaxed max-w-lg mx-auto mb-4">
            Nous préparons une belle galerie photos pour vous montrer l&apos;ambiance unique du centre.
          </p>
          <div className="flex gap-3 justify-center">
            <a href="https://www.facebook.com/ceagon50230" target="_blank" rel="noopener noreferrer"
              className="font-body text-sm font-semibold text-white bg-[#1877F2] px-6 py-2.5 rounded-lg no-underline">Facebook</a>
            <a href="#" className="font-body text-sm font-semibold text-white bg-[#E4405F] px-6 py-2.5 rounded-lg no-underline">Instagram</a>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
