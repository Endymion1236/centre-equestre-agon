import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { sendPushBatch } from "@/lib/push";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set([
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
]);

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

    const tokenSnapshot = await adminDb.collection("push_tokens").get();
    const recipients = await Promise.all(tokenSnapshot.docs.map(async (tokenDocument) => {
      if (tokenDocument.id === auth.uid) return null;
      const token = clean(tokenDocument.data().token, 4096);
      if (!token) return null;

      try {
        const user = await adminAuth.getUser(tokenDocument.id);
        const claims = user.customClaims || {};
        const isStaff = claims.admin === true || claims.moniteur === true || ADMIN_EMAILS.has(user.email || "");
        return isStaff ? token : null;
      } catch {
        return null;
      }
    }));

    const tokens = [...new Set(recipients.filter((token): token is string => Boolean(token)))];
    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, message: "Aucun moniteur n’a encore activé les notifications" });
    }

    const date = clean(payload.date, 10);
    const url = date ? `/admin/planning?date=${encodeURIComponent(date)}` : "/admin/planning";
    const result = await sendPushBatch(tokens, "📅 Planning modifié", buildBody(payload), url);

    return NextResponse.json({ ...result, recipients: tokens.length });
  } catch (error) {
    console.error("Notification changement planning :", error);
    return NextResponse.json({ error: "Envoi impossible" }, { status: 500 });
  }
}
