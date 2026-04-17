"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

interface StageImapye {
  paymentId: string;
  familyName: string;
  familyEmail: string;
  activityTitle: string;
  childName: string;
  startDate: string;
  totalTTC: number;
  joursRestants: number;
}

export default function StagesImpayesAlert() {
  const [alerts, setAlerts] = useState<StageImapye[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const snap = await getDocs(query(
          collection(db, "payments"),
          where("status", "==", "pending")
        ));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const found: StageImapye[] = [];

        snap.docs.forEach(doc => {
          const p = doc.data();
          const items = p.items || [];

          items.forEach((item: any) => {
            if (!item.stageDates || item.stageDates.length === 0) return;

            // Date de début = première date du stage
            const firstDate = item.stageDates
              .map((d: any) => d.date)
              .sort()[0];
            if (!firstDate) return;

            const startDate = new Date(firstDate);
            startDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            // Fenêtre d'alerte : entre 0 et 15 jours
            if (diffDays >= 0 && diffDays <= 15) {
              found.push({
                paymentId: doc.id,
                familyName: p.familyName || "—",
                familyEmail: p.familyEmail || "",
                activityTitle: item.activityTitle || "Stage",
                childName: item.childName || "—",
                startDate: firstDate,
                totalTTC: p.totalTTC || 0,
                joursRestants: diffDays,
              });
            }
          });
        });

        // Trier par urgence
        found.sort((a, b) => a.joursRestants - b.joursRestants);
        setAlerts(found);
      } catch (e) {
        console.error("[StagesImpayesAlert]", e);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  if (loading || alerts.length === 0 || dismissed) return null;

  const urgents = alerts.filter(a => a.joursRestants <= 7);
  const isUrgent = urgents.length > 0;

  return (
    <div className={`mb-6 rounded-xl border-2 overflow-hidden ${
      isUrgent ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isUrgent ? "bg-red-100" : "bg-amber-100"
      }`}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-3 flex-1 bg-transparent border-none cursor-pointer text-left"
        >
          <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
            isUrgent ? "bg-red-500" : "bg-amber-500"
          }`}>
            <AlertTriangle size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <span className={`font-body text-sm font-bold ${
              isUrgent ? "text-red-800" : "text-amber-800"
            }`}>
              {alerts.length} stage{alerts.length > 1 ? "s" : ""} impayé{alerts.length > 1 ? "s" : ""}
              {isUrgent && ` — ${urgents.length} urgent${urgents.length > 1 ? "s" : ""} (≤ J-7)`}
            </span>
            <p className={`font-body text-xs ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
              Aucun paiement reçu · Relance nécessaire avant le début du stage
            </p>
          </div>
          {expanded
            ? <ChevronUp size={16} className={isUrgent ? "text-red-500" : "text-amber-500"} />
            : <ChevronDown size={16} className={isUrgent ? "text-red-500" : "text-amber-500"} />
          }
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="ml-3 bg-transparent border-none cursor-pointer p-1 rounded hover:bg-black/10"
          title="Masquer jusqu'au prochain chargement"
        >
          <X size={16} className={isUrgent ? "text-red-400" : "text-amber-400"} />
        </button>
      </div>

      {/* Liste */}
      {expanded && (
        <div className="divide-y divide-black/5">
          {alerts.map(alert => (
            <div key={`${alert.paymentId}-${alert.childName}`}
              className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-black/[0.02]">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Badge J-X */}
                <div className={`shrink-0 w-12 text-center px-2 py-1.5 rounded-lg font-body text-xs font-bold ${
                  alert.joursRestants <= 7
                    ? "bg-red-500 text-white"
                    : "bg-amber-500 text-white"
                }`}>
                  J-{alert.joursRestants}
                </div>
                <div className="min-w-0">
                  <p className="font-body text-sm font-semibold text-gray-800 truncate">
                    {alert.activityTitle} — {alert.childName}
                  </p>
                  <p className="font-body text-xs text-gray-500">
                    {alert.familyName}
                    {alert.familyEmail && (
                      <span className="text-gray-400"> · {alert.familyEmail}</span>
                    )}
                  </p>
                  <p className="font-body text-xs text-gray-400">
                    Début le {new Date(alert.startDate).toLocaleDateString("fr-FR", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric"
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`font-body text-sm font-bold ${
                  alert.joursRestants <= 7 ? "text-red-600" : "text-amber-600"
                }`}>
                  {alert.totalTTC.toFixed(2)}€
                </span>
                <Link href={`/admin/paiements?famille=${encodeURIComponent(alert.familyName)}`}>
                  <button className="font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
                    Voir
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {expanded && (
        <div className={`px-4 py-2 flex items-center justify-between border-t border-black/5 ${
          isUrgent ? "bg-red-100/50" : "bg-amber-100/50"
        }`}>
          <p className={`font-body text-xs ${isUrgent ? "text-red-500" : "text-amber-500"}`}>
            {isUrgent
              ? `⚡ ${urgents.length} stage${urgents.length > 1 ? "s" : ""} à relancer d'urgence (≤ 7 jours avant début)`
              : `⏰ Stages à relancer dans les 15 jours`
            }
          </p>
          <Link href="/admin/paiements">
            <button className={`font-body text-xs font-semibold border-none cursor-pointer bg-transparent hover:underline ${
              isUrgent ? "text-red-600" : "text-amber-600"
            }`}>
              Voir tous les paiements →
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
