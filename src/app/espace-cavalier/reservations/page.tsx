"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Loader2, Calendar, Check, Clock, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface Reservation {
  id: string;
  familyId: string;
  activityTitle: string;
  activityType: string;
  childName: string;
  date: string;
  startTime: string;
  endTime: string;
  priceTTC: number;
  status: "confirmed" | "pending" | "cancelled";
  createdAt: any;
}

const statusConfig: Record<string, { label: string; color: "green" | "orange" | "red" | "gray"; icon: any }> = {
  confirmed: { label: "Confirmée", color: "green", icon: Check },
  pending: { label: "En attente de paiement", color: "orange", icon: Clock },
  pending_payment: { label: "Paiement non finalisé", color: "orange", icon: Clock },
  cancelled: { label: "Annulée", color: "red", icon: XCircle },
};

export default function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const deposit = searchParams.get("deposit");

  // Le paiement est confirmé par le webhook CAWL côté serveur
  // On affiche juste un message de confirmation sans modifier Firestore

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Réservations directes
      let own: Reservation[] = [];
      try {
        const ownSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
        own = ownSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Reservation[];
      } catch (e) { console.error("[reservations] own:", e); }

      // Réservations liées (sourceFamilyId) — optionnel, ne bloque pas si échoue
      let linked: Reservation[] = [];
      try {
        const linkedSnap = await getDocs(query(collection(db, "reservations"), where("sourceFamilyId", "==", user.uid)));
        linked = linkedSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Reservation[];
      } catch (e) { /* pas de réservations liées */ }

      // Dédupliquer par id
      const all = [...own, ...linked.filter(r => !own.some(o => o.id === r.id))];
      setReservations(all);
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Group by upcoming / past
  const today = new Date().toISOString().split("T")[0];
  const upcoming = reservations.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = reservations.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const pendingPayment = reservations.filter((r) => (r.status as string) === "pending_payment");

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Mes réservations</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Retrouvez ici toutes vos réservations passées et à venir.</p>

      {/* Bandeau paiement non finalisé */}
      {pendingPayment.length > 0 && (
        <Card className="!bg-orange-50 !border-orange-300 mb-5" padding="sm">
          <div className="flex items-start gap-3">
            <Clock size={20} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-body text-sm font-bold text-orange-800">
                {pendingPayment.length} réservation{pendingPayment.length > 1 ? "s" : ""} en attente de paiement
              </p>
              <p className="font-body text-xs text-orange-600 mt-0.5">
                Votre place est réservée mais le paiement n&apos;a pas été finalisé.
                Réglez votre inscription pour la confirmer définitivement.
              </p>
              <a href="/espace-cavalier/reserver">
                <button className="mt-2 font-body text-xs font-semibold text-white bg-orange-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-400">
                  Finaliser le paiement →
                </button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Bandeau paiement non finalisé */}
      {pendingPayment.length > 0 && (
        <Card className="!bg-orange-50 !border-orange-300 mb-5" padding="sm">
          <div className="flex items-start gap-3">
            <Clock size={20} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-body text-sm font-bold text-orange-800">
                {pendingPayment.length} réservation{pendingPayment.length > 1 ? "s" : ""} en attente de paiement
              </p>
              <p className="font-body text-xs text-orange-600 mt-0.5">
                Votre place est réservée mais le paiement n&apos;a pas été finalisé.
                Réglez votre inscription pour la confirmer définitivement.
              </p>
              <a href="/espace-cavalier/reserver">
                <button className="mt-2 font-body text-xs font-semibold text-white bg-orange-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-400">
                  Finaliser le paiement →
                </button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Success message */}
      {success === "true" && (
        <Card className="!bg-green-50 !border-green-200 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <Check size={20} className="text-green-600" />
            <div className="font-body text-sm text-green-800">
              <strong>Paiement confirmé !</strong> Votre réservation est enregistrée. À bientôt au centre équestre !
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : reservations.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-5xl block mb-4">📋</span>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-2">Aucune réservation</h2>
          <p className="font-body text-sm text-gray-600 mb-4">Vous n&apos;avez pas encore de réservation.</p>
          <a href="/espace-cavalier/reserver" className="font-body text-sm font-semibold text-blue-500 no-underline">
            Réserver une activité →
          </a>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="font-body text-sm font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Calendar size={14} /> À venir ({upcoming.length})
              </h2>
              <div className="flex flex-col gap-3">
                {upcoming.map((r) => {
                  const status = statusConfig[r.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  return (
                    <Card key={r.id} padding="md">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-xl bg-blue-50 flex flex-col items-center justify-center">
                            <div className="font-body text-xs font-bold text-blue-500">
                              {(() => { try { const d = (r as any).date?.seconds ? new Date((r as any).date.seconds * 1000) : new Date(r.date); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { weekday: "short" }); } catch { return "—"; }})()}
                            </div>
                            <div className="font-body text-lg font-bold text-blue-800">
                              {(() => { try { const d = (r as any).date?.seconds ? new Date((r as any).date.seconds * 1000) : new Date(r.date); return isNaN(d.getTime()) ? "—" : d.getDate(); } catch { return "—"; }})()}
                            </div>
                          </div>
                          <div>
                            <div className="font-body text-base font-semibold text-blue-800">{r.activityTitle}</div>
                            <div className="font-body text-xs text-gray-600">
                              🧒 {r.childName} · {r.startTime || ""}–{r.endTime || ""}
                            </div>
                            <div className="font-body text-xs text-gray-600">
                              {(() => { try { const d = (r as any).date?.seconds ? new Date((r as any).date.seconds * 1000) : new Date(r.date); return isNaN(d.getTime()) ? (typeof r.date === "string" ? r.date : "Date non disponible") : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return typeof r.date === "string" ? r.date : "—"; }})()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-body text-lg font-bold text-blue-500">{r.priceTTC?.toFixed(2)}€</span>
                          <Badge color={status.color}>{status.label}</Badge>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="font-body text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">
                Passées ({past.length})
              </h2>
              <div className="flex flex-col gap-2">
                {past.map((r) => (
                  <Card key={r.id} padding="sm" className="opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-body text-xs text-gray-600">
                          {(() => { try { const d = (r as any).date?.seconds ? new Date((r as any).date.seconds * 1000) : new Date(r.date); return isNaN(d.getTime()) ? (typeof r.date === "string" ? r.date : "—") : d.toLocaleDateString("fr-FR"); } catch { return "—"; }})()}
                        </span>
                        <span className="font-body text-sm text-gray-600">{r.activityTitle}</span>
                        <span className="font-body text-xs text-gray-600">🧒 {r.childName}</span>
                      </div>
                      <span className="font-body text-sm text-gray-600">{r.priceTTC?.toFixed(2)}€</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
