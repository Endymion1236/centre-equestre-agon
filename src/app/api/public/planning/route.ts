import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toParisDateString } from "@/lib/date-local";
import {
  addCalendarDays,
  calendarDaysBetween,
  comparePublicPlanningSlots,
  detailsActivitePublique,
  isCalendarDate,
  toPublicPlanningSlot,
  type PublicPlanningSlot,
} from "@/lib/public-planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RANGE_DAYS = 42;
const MAX_RANGE_DAYS = 190;
/** Fiches activité lues au plus pour une requête : borne de sécurité, jamais atteinte en pratique. */
const MAX_FICHES = 120;

export async function GET(request: NextRequest) {
  const today = toParisDateString();
  const start = request.nextUrl.searchParams.get("start") || today;
  const end = request.nextUrl.searchParams.get("end") || addCalendarDays(start, DEFAULT_RANGE_DAYS);

  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    return NextResponse.json({ error: "Dates invalides (format attendu : YYYY-MM-DD)" }, { status: 400 });
  }

  const rangeDays = calendarDaysBetween(start, end);
  if (rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `La période doit être comprise entre 0 et ${MAX_RANGE_DAYS} jours` }, { status: 400 });
  }

  try {
    const snapshot = await adminDb
      .collection("creneaux")
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get();

    const slots = snapshot.docs
      .map((document) => toPublicPlanningSlot(document.id, document.data()))
      .filter((slot): slot is PublicPlanningSlot => slot !== null)
      .sort(comparePublicPlanningSlots);

    // « En savoir plus sur cette activité » : la description que le club a
    // écrite dans son catalogue (Admin → Activités), jointe ici plutôt que
    // renvoyée vers la page générale des activités. Une lecture par fiche
    // distincte, pas par créneau : une semaine de planning ne coûte que
    // quelques lectures de plus. Les seuls champs publics sont repris
    // (cf. detailsActivitePublique) ; une fiche absente ne bloque rien.
    const fiches = Array.from(new Set(slots.map((slot) => slot.activityId).filter((id): id is string => !!id))).slice(0, MAX_FICHES);
    if (fiches.length > 0) {
      try {
        const docs = await adminDb.getAll(...fiches.map((id) => adminDb.collection("activities").doc(id)));
        const parId = new Map<string, ReturnType<typeof detailsActivitePublique>>();
        for (const d of docs) if (d.exists) parId.set(d.id, detailsActivitePublique(d.data() as Record<string, unknown>));
        for (const slot of slots) {
          const details = slot.activityId ? parId.get(slot.activityId) : undefined;
          if (details) slot.details = details;
        }
      } catch (e) {
        console.error("[api/public/planning] fiches activités non jointes :", e);
      }
    }

    return NextResponse.json(
      { slots, start, end },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("[api/public/planning]", error);
    return NextResponse.json({ error: "Planning temporairement indisponible" }, { status: 500 });
  }
}
