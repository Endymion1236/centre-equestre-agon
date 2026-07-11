"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CalendarDays } from "lucide-react";

interface PublicSlot {
  id: string;
  activityTitle?: string;
  activityType?: string;
  date?: string;
  startTime?: string;
  maxPlaces?: number;
  enrolled?: unknown[];
  status?: string;
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string) {
  if (!value) return "prochainement";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function LiveHeroStatus() {
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "creneaux"),
            where("date", ">=", localDateString()),
            orderBy("date", "asc"),
            limit(30),
          ),
        );

        const next = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as PublicSlot))
          .filter((item) => item.status !== "closed" && item.status !== "cancelled")
          .find((item) => {
            const capacity = Number(item.maxPlaces || 0);
            const enrolled = Array.isArray(item.enrolled) ? item.enrolled.length : 0;
            return capacity === 0 || enrolled < capacity;
          });

        if (!cancelled) setSlot(next || null);
      } catch (error) {
        console.warn("Actualité du planning indisponible :", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const label = slot
    ? `${slot.activityTitle || "Prochaine activité"} · ${formatDate(slot.date)}${slot.startTime ? ` à ${slot.startTime}` : ""}`
    : loaded
      ? "Réservations ouvertes pour les activités de la saison"
      : "Recherche des prochaines disponibilités…";

  return (
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-gold-400/25 bg-slate-950/30 px-4 py-2 text-left shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md sm:px-5">
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-35" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
      </span>
      <CalendarDays size={14} className="flex-shrink-0 text-gold-300" />
      <span className="truncate font-body text-xs font-semibold text-white/90 sm:text-sm">{label}</span>
    </div>
  );
}
