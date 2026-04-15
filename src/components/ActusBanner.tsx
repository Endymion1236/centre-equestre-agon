"use client";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Actu {
  id: string;
  type: "event" | "news";
  title: string;
  date: string;
  description: string;
  emoji: string;
  active: boolean;
}

export default function ActusBanner() {
  const [actus, setActus] = useState<Actu[]>([]);

  useEffect(() => {
    getDoc(doc(db, "settings", "actus")).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.items) {
          // Filtrer les actives et trier par date décroissante
          const items = (data.items as Actu[])
            .filter(a => a.active && a.title)
            .sort((a, b) => b.date.localeCompare(a.date));
          setActus(items);
        }
      }
    });
  }, []);

  if (actus.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <section className="py-12 px-6 bg-gradient-to-b from-cream to-white">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />
          <span className="font-body text-xs font-semibold text-gold-500 uppercase tracking-[0.2em]">Actualités & événements</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />
        </div>

        <div className={`grid gap-4 ${actus.length === 1 ? "grid-cols-1 max-w-[600px] mx-auto" : actus.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {actus.slice(0, 3).map((actu) => (
            <div key={actu.id}
              className="group relative bg-white rounded-2xl border border-blue-500/8 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              {/* Accent top bar */}
              <div className={`h-1 ${actu.type === "event" ? "bg-gradient-to-r from-gold-400 to-gold-500" : "bg-gradient-to-r from-blue-400 to-blue-500"}`} />

              <div className="p-6">
                {/* Type + date */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-body text-[10px] font-semibold uppercase tracking-wider ${actu.type === "event" ? "text-gold-500" : "text-blue-500"}`}>
                    {actu.type === "event" ? "Événement" : "Actualité"}
                  </span>
                  <span className="font-body text-[10px] text-slate-400">
                    {formatDate(actu.date)}
                  </span>
                </div>

                {/* Emoji + title */}
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{actu.emoji}</span>
                  <h3 className="font-display text-base font-bold text-blue-800 leading-tight group-hover:text-blue-600 transition-colors">
                    {actu.title}
                  </h3>
                </div>

                {/* Description */}
                {actu.description && (
                  <p className="font-body text-sm text-gray-500 leading-relaxed line-clamp-3">
                    {actu.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
