"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Users, Loader2, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

/**
 * Consultation des disponibilités SANS COMPTE.
 *
 * Jusqu'ici, « Voir les places disponibles » menait droit dans l'espace
 * cavalier, protégé par l'écran de connexion : un vacancier qui voulait
 * simplement savoir s'il restait une balade mercredi soir tombait sur un
 * formulaire d'inscription avant d'avoir vu la moindre place. Cette page
 * inverse l'ordre : on regarde d'abord, on crée un compte au moment de
 * réserver — et seulement à ce moment-là.
 *
 * Elle s'appuie sur /api/public/planning, qui ne renvoie que des données
 * publiques : intitulé, horaires, moniteur, places restantes, tarif. Aucun
 * nom de famille, aucune donnée de cavalier.
 */

interface Slot {
  id: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  priceTTC?: number;
  allowDayBooking?: boolean;
  priceTTCDay?: number;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function isoJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function libelleJour(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** Regroupe les familles d'activités pour un filtre lisible par un parent. */
function familleDe(slot: Slot): "stage" | "cours" | "balade" | "autre" {
  const t = (slot.activityType || "").toLowerCase();
  const titre = (slot.activityTitle || "").toLowerCase();
  if (t.includes("stage")) return "stage";
  if (titre.includes("promenade") || titre.includes("balade")) return "balade";
  if (t.includes("cours") || titre.includes("cours")) return "cours";
  return "autre";
}

export default function DisponibilitesPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtre, setFiltre] = useState<"tout" | "stage" | "cours" | "balade">("tout");
  const [semaine, setSemaine] = useState(0); // décalage en semaines

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/planning");
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        setSlots(Array.isArray(data?.slots) ? data.slots : []);
      } catch (e: any) {
        setErreur(e?.message || "Planning temporairement indisponible");
      }
      setLoading(false);
    })();
  }, []);

  // Fenêtre de 7 jours à partir d'aujourd'hui, décalable
  const { debut, fin } = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + semaine * 7);
    const f = new Date(d);
    f.setDate(f.getDate() + 6);
    return { debut: isoJour(d), fin: isoJour(f) };
  }, [semaine]);

  const parJour = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      if (s.date < debut || s.date > fin) continue;
      if (filtre !== "tout" && familleDe(s) !== filtre) continue;
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    for (const liste of map.values()) liste.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots, debut, fin, filtre]);

  const FILTRES: { id: typeof filtre; label: string }[] = [
    { id: "tout", label: "Tout voir" },
    { id: "stage", label: "Stages" },
    { id: "cours", label: "Cours" },
    { id: "balade", label: "Balades" },
  ];

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
          Les places disponibles
        </h1>
        <p className="font-body text-slate-600 mt-2">
          Regardez ce qu&apos;il reste, sans créer de compte. Vous ne vous
          identifierez qu&apos;au moment de réserver.
        </p>

        {/* Filtres */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTRES.map(f => (
            <button key={f.id} onClick={() => setFiltre(f.id)}
              className={`px-4 py-2 rounded-xl font-body text-sm font-semibold border cursor-pointer ${
                filtre === f.id
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Navigation par semaine */}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => setSemaine(s => Math.max(0, s - 1))} disabled={semaine === 0}
            className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <span className="font-body text-sm text-slate-600 flex items-center gap-1.5">
            <CalendarDays size={14} />
            {semaine === 0 ? "Les 7 prochains jours" : `${libelleJour(debut)} → ${libelleJour(fin)}`}
          </span>
          <button onClick={() => setSemaine(s => s + 1)}
            className="p-2 rounded-lg border border-slate-200 bg-white cursor-pointer">
            <ChevronRight size={16} />
          </button>
        </div>

        {loading && (
          <div className="mt-10 flex items-center gap-2 font-body text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement du planning…
          </div>
        )}

        {erreur && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 font-body text-sm text-amber-800">
            {erreur} — vous pouvez nous appeler, nous vous renseignerons directement.
          </div>
        )}

        {!loading && !erreur && parJour.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-body text-slate-500">
              Aucune activité sur cette période.
            </p>
            <button onClick={() => setSemaine(s => s + 1)}
              className="mt-3 font-body text-sm font-semibold text-blue-700 bg-transparent border-none cursor-pointer hover:underline">
              Voir la semaine suivante →
            </button>
          </div>
        )}

        {/* Planning */}
        <div className="mt-6 space-y-6">
          {parJour.map(([jour, liste]) => (
            <div key={jour}>
              <h2 className="font-display text-lg font-bold text-slate-800 capitalize">
                {libelleJour(jour)}
              </h2>
              <div className="mt-2 space-y-2">
                {liste.map(s => {
                  const restantes = Math.max(0, (s.maxPlaces || 0) - (s.enrolledCount || 0));
                  const complet = restantes === 0;
                  return (
                    <div key={s.id}
                      className={`rounded-xl border p-3 sm:p-4 bg-white ${
                        complet ? "border-slate-200 opacity-70" : "border-slate-200"
                      }`}>
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                        <span className="font-body font-semibold text-slate-900">
                          {s.activityTitle}
                        </span>
                        {typeof s.priceTTC === "number" && s.priceTTC > 0 && (
                          <span className="ml-auto font-display font-bold text-blue-800">
                            {s.priceTTC}&nbsp;€
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />{s.startTime}–{s.endTime}
                        </span>
                        {s.monitor && <span>avec {s.monitor}</span>}
                        <span className={`inline-flex items-center gap-1 font-semibold ${
                          complet ? "text-rose-600" : restantes <= 2 ? "text-amber-600" : "text-emerald-700"
                        }`}>
                          <Users size={12} />
                          {complet ? "Complet" : `${restantes} place${restantes > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Passage à la réservation : c'est ICI qu'on demande un compte */}
        {!loading && parJour.length > 0 && (
          <div className="mt-8 rounded-2xl bg-blue-800 text-white p-5 sm:p-6">
            <p className="font-display text-lg font-bold">Une place vous intéresse ?</p>
            <p className="font-body text-sm text-blue-100 mt-1">
              La réservation se fait depuis votre espace famille. La création du
              compte prend une minute.
            </p>
            <Link href="/espace-cavalier/reserver"
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-blue-800 font-body font-bold no-underline hover:bg-blue-50">
              Réserver <ArrowRight size={16} />
            </Link>
          </div>
        )}

        <p className="mt-8 font-body text-xs text-slate-400">
          Les places affichées évoluent en temps réel. Un doute sur le niveau ou
          l&apos;âge&nbsp;? Appelez-nous, on vous orientera.
        </p>
      </div>
    </div>
  );
}
