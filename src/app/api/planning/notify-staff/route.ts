import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ChangeAction = "created" | "updated" | "deleted" | "duplicated";

interface PlanningChangePayload {
  action: ChangeAction;
  activityTitle?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  previousStartTime?: string;
  previousEndTime?: string;
  monitor?: string;
  count?: number;
}

function formatDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function clean(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function buildBody(payload: PlanningChangePayload) {
  const title = clean(payload.activityTitle) || "Créneau";
  const date = formatDate(payload.date);
  const time = [clean(payload.startTime, 5), clean(payload.endTime, 5)].filter(Boolean).join("–");
  const previousTime = [clean(payload.previousStartTime, 5), clean(payload.previousEndTime, 5)].filter(Boolean).join("–");
  const monitor = clean(payload.monitor);
  const details = [title, date, time, monitor].filter(Boolean).join(" · ");
  const count = Math.max(1, Math.min(Number(payload.count) || 1, 200));

  if (payload.action === "created") {
    return count > 1 ? `${count} nouveaux créneaux ont été ajoutés au planning.` : `Ajout : ${details}`;
  }
  if (payload.action === "deleted") {
    return count > 1 ? `${count} créneaux ont été supprimés du planning.` : `Suppression : ${details}`;
  }
  if (payload.action === "duplicated") {
    return `${count} créneau${count > 1 ? "x" : ""} ajouté${count > 1 ? "s" : ""} par duplication.`;
  }

  const timeChange = previousTime && time && previousTime !== time ? ` · ${previousTime} → ${time}` : "";
  return `Modification : ${[title, date, monitor].filter(Boolean).join(" · ")}${timeChange || (time ? ` · ${time}` : "")}`;
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json() as PlanningChangePayload;
    if (!["created", "updated", "deleted", "duplicated"].includes(payload.action)) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    // ── MISE EN FILE (plus d'envoi immédiat) ──────────────────────────
    // Chaque modification de créneau déclenchait un push instantané : en
    // construisant un planning, les moniteurs recevaient des dizaines de
    // notifications d'affilée. Les changements sont désormais empilés ici
    // et regroupés en UN SEUL récapitulatif, envoyé par le cron push-digest
    // à 13h30 et 18h (heure de Paris).
    //
    // Les destinataires sont résolus au moment de l'ENVOI, pas ici : les
    // tokens peuvent changer entre-temps, et il faut connaître l'ensemble
    // des auteurs de la période pour ne pas notifier quelqu'un de ses
    // propres modifications.
    await adminDb.collection("push_queue").add({
      type: "planning",
      action: payload.action,
      authorUid: auth.uid,
      activityTitle: clean(payload.activityTitle),
      date: clean(payload.date, 10),
      startTime: clean(payload.startTime, 5),
      endTime: clean(payload.endTime, 5),
      previousStartTime: clean(payload.previousStartTime, 5),
      previousEndTime: clean(payload.previousEndTime, 5),
      monitor: clean(payload.monitor),
      count: Math.max(1, Math.min(Number(payload.count) || 1, 200)),
      body: buildBody(payload),
      createdAt: new Date(),
      sentAt: null,
    });

    return NextResponse.json({ queued: true });
  } catch (error) {
    console.error("Notification changement planning :", error);
    return NextResponse.json({ error: "Mise en file impossible" }, { status: 500 });
  }
}
