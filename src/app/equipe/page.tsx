"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader, Card, Badge } from "@/components/ui";
import { EditableImage } from "@/components/ui/EditableImage";
import type { VitrineImageKey } from "@/hooks/useVitrineImages";
import { Users, GraduationCap, Loader2 } from "lucide-react";




const team: { name: string; role: string; initials: string; imageKey: VitrineImageKey; description: string; specialties: string[] }[] = [
  {
    name: "Nicolas",
    role: "Gérant",
    initials: "N",
    imageKey: "equipe-nicolas",
    description: "Passionné d'équitation et d'innovation, Nicolas gère le centre depuis plusieurs années. Il conçoit des activités ludiques et immersives pour les cavaliers de tous âges.",
    specialties: ["Gestion", "Pony Games", "Innovation", "LaserBay"],
  },
  {
    name: "Emmeline",
    role: "Instructrice BPJEPS",
    initials: "E",
    imageKey: "equipe-emmeline",
    description: "Emmeline est notre instructrice diplômée BPJEPS. Pédagogue et bienveillante, elle accompagne chaque cavalier dans sa progression avec passion et exigence.",
    specialties: ["Enseignement", "CSO", "Dressage", "Baby Poney"],
  },
];

const levelColors: Record<string, "green" | "blue" | "orange"> = {
  "Débutant": "green",
  "Intermédiaire": "blue",
  "Confirmé": "orange",
  "Tous niveaux": "blue",
};

// Type minimal pour l'affichage public (sous-ensemble de Equide Firestore)
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
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "equides"), where("featured", "==", true))
        );
        if (cancelled) return;
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          // Filtrage côté client : actif + photo présente
          .filter(e => e.status === "actif" && e.photo && typeof e.photo === "string" && e.photo.trim() !== "")
          .map(e => ({
            id: e.id,
            name: (e.surnom || e.name || "").trim(),
            type: e.type === "shetland" ? "Shetland" : e.type === "cheval" ? "Cheval" : e.type === "ane" ? "Âne" : "Poney",
            niveauCavalier: e.niveauCavalier || "Tous niveaux",
            publicDescription: e.publicDescription || "",
            photo: e.photo,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setFeaturedPoneys(items);
      } catch (e) {
        console.error("Erreur chargement poneys vedettes :", e);
        setFeaturedPoneys([]);
      } finally {
        if (!cancelled) setLoadingPoneys(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4"><Users size={32} className="text-white/80" /></div>
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
                <EditableImage
                  imageKey={member.imageKey}
                  mode="img"
                  label={`Photo ${member.name}`}
                  alt={member.name}
                  className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0"
                  style={{ minHeight: "64px" }}
                >
                  {/* Fallback initiale si pas de photo */}
                  <div className="w-full h-full bg-blue-500 flex items-center justify-center absolute inset-0 -z-10">
                    <span className="font-display text-xl font-bold text-white">{member.initials}</span>
                  </div>
                </EditableImage>
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
      {(loadingPoneys || featuredPoneys.length > 0) && (
        <section className="py-16 px-6 bg-sand">
          <div className="max-w-[900px] mx-auto">
            <SectionHeader tag="La cavalerie" title="Nos poneys" subtitle="Chaque poney a sa personnalité et ses spécialités. On les affecte en fonction du niveau et des objectifs de chaque cavalier." />

            {loadingPoneys ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {featuredPoneys.map((p) => (
                  <Card key={p.id} padding="md" className="!p-0 overflow-hidden">
                    {/* Photo carrée en haut */}
                    <div className="aspect-square w-full bg-blue-50 overflow-hidden">
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    {/* Infos */}
                    <div className="p-5">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-display text-xl font-bold text-blue-800">{p.name}</h3>
                        <Badge color="gray">{p.type}</Badge>
                        <Badge color={levelColors[p.niveauCavalier] || "blue"}>{p.niveauCavalier}</Badge>
                      </div>
                      {p.publicDescription && (
                        <p className="font-body text-sm text-gray-500 leading-relaxed">{p.publicDescription}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
