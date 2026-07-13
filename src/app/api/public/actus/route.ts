import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type PublicActu = {
  id: string;
  type: "event" | "news";
  title: string;
  date: string;
  description: string;
  emoji: string;
  active: boolean;
};

export async function GET() {
  try {
    const snapshot = await adminDb.doc("settings/actus").get();
    const rawItems = snapshot.exists ? snapshot.data()?.items : [];

    const items: PublicActu[] = (Array.isArray(rawItems) ? rawItems : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => item.active === true && typeof item.title === "string" && item.title.trim().length > 0)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        type: item.type === "news" ? "news" : "event",
        title: String(item.title).trim(),
        date: typeof item.date === "string" ? item.date : "",
        description: typeof item.description === "string" ? item.description : "",
        emoji: typeof item.emoji === "string" && item.emoji.trim() ? item.emoji : "📣",
        active: true,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Erreur chargement actualités publiques :", error);
    return NextResponse.json(
      { items: [], error: "Actualités temporairement indisponibles" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
