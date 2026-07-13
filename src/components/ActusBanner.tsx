"use client";
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Megaphone } from "lucide-react";

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
    const unsubscribe = onSnapshot(
      doc(db, "settings", "actus"),
      (snapshot) => {
        const data = snapshot.data();
        const rawItems = Array.isArray(data?.items) ? data.items as Actu[] : [];
        const visibleItems = rawItems
          .filter((item) => item.active === true && typeof item.title === "string" && item.title.trim())
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .slice(0, 3);

        setActus(visibleItems);
      },
      (error) => {
        console.error("Impossible de charger les actualités :", error);
        setActus([]);
      },
    );

    return unsubscribe;
  }, []);

  if (actus.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };

  // Récent = à venir ou publié il y a moins de 21 jours → pastille "Nouveau".
  const isRecent = (d: string) => {
    const t = new Date(d + "T12:00:00").getTime();
    return !isNaN(t) && t >= Date.now() - 21 * 86400000;
  };

  return (
    <section className="py-14 px-6 bg-gradient-to-b from-gold-50/40 via-cream to-white">
      <div className="max-w-[1000px] mx-auto">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600 bg-gold-100/70 px-3 py-1 rounded-full">
            <Megaphone size={13} /> À la une
          </span>
          <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-blue-800">Actualités &amp; événements</h2>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gradient-to-r from-gold-400 to-gold-500" />
        </div>

        <div className={`grid gap-4 ${actus.length === 1 ? "grid-cols-1 max-w-[600px] mx-auto" : actus.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {actus.slice(0, 3).map((actu) => (
            <div key={actu.id}
              className="group relative bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              {/* Accent top bar */}
              <div className={`h-1.5 ${actu.type === "event" ? "bg-gradient-to-r from-gold-400 to-gold-500" : "bg-gradient-to-r from-blue-400 to-blue-500"}`} />

              <div className="p-6">
                {/* Type + date */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-body text-[10px] font-semibold uppercase tracking-wider ${actu.type === "event" ? "text-gold-500" : "text-blue-500"}`}>
                      {actu.type === "event" ? "Événement" : "Actualité"}
                    </span>
                    {isRecent(actu.date) && (
                      <span className="font-body text-[9px] font-bold uppercase tracking-wide text-white bg-gradient-to-r from-gold-400 to-gold-500 px-1.5 py-0.5 rounded-full">Nouveau</span>
                    )}
                  </div>
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
