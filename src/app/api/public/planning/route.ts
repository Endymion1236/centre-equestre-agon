import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toParisDateString } from "@/lib/date-local";
import {
  addCalendarDays,
  calendarDaysBetween,
  comparePublicPlanningSlots,
  isCalendarDate,
  toPublicPlanningSlot,
  type PublicPlanningSlot,
} from "@/lib/public-planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RANGE_DAYS = 42;
const MAX_RANGE_DAYS = 190;

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

    return NextResponse.json(
      { slots, start, end },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("[api/public/planning]", error);
    return NextResponse.json({ error: "Planning temporairement indisponible" }, { status: 500 });
  }
}
