"use client";

// ═══════════════════════════════════════════════════════════════════
// src/components/admin/LastUpdated.tsx
// ───────────────────────────────────────────────────────────────────
// Affiche "Dernière modif : il y a X" avec tooltip date/heure exacte.
//
// Props :
//   - timestamp: Firestore Timestamp, Date, ou number (millisecondes)
//   - prefix: texte avant (par défaut "Modifié")
//   - className: style additionnel
//
// Usage :
//   <LastUpdated timestamp={family.updatedAt} />
//   → "Modifié il y a 3 jours" (tooltip : "15 avril 2026 à 14:23")
// ═══════════════════════════════════════════════════════════════════

import { Clock } from "lucide-react";

/** Convertit divers formats de timestamp en Date. Retourne null si invalide. */
function parseTimestamp(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") return new Date(ts);
  // Firestore Timestamp : { seconds: number, nanoseconds: number }
  if (typeof ts === "object" && typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000);
  }
  // Firestore Timestamp avec méthode toDate()
  if (typeof ts === "object" && typeof ts.toDate === "function") {
    try { return ts.toDate(); } catch { return null; }
  }
  // ISO string
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Format "il y a X" en français. */
function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (diff < 0) return "à l'instant"; // futur — anomalie
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  if (minutes === 1) return "il y a 1 min";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours === 1) return "il y a 1 h";
  if (hours < 24) return `il y a ${hours} h`;
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  if (weeks === 1) return "il y a 1 semaine";
  if (weeks < 5) return `il y a ${weeks} semaines`;
  if (months === 1) return "il y a 1 mois";
  if (months < 12) return `il y a ${months} mois`;
  if (years === 1) return "il y a 1 an";
  return `il y a ${years} ans`;
}

/** Format date/heure complète en français. */
function formatFull(date: Date): string {
  return date.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LastUpdated({
  timestamp,
  prefix = "Modifié",
  className = "",
  showIcon = true,
}: {
  timestamp: any;
  prefix?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const date = parseTimestamp(timestamp);
  if (!date) return null;

  const relative = timeAgo(date);
  const full = formatFull(date);

  return (
    <span
      className={`inline-flex items-center gap-1 font-body text-[11px] text-slate-400 ${className}`}
      title={full}>
      {showIcon && <Clock size={11} className="flex-shrink-0" />}
      <span>{prefix} {relative}</span>
    </span>
  );
}
