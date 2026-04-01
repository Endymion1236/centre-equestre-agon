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

const statusConfig = {
  confirmed: { label: "Confirmée", color: "green" as const, icon: Check },
  pending: { label: "En attente de paiement", color: "orange" as const, icon: Clock },
  cancelled: { label: "Annulée", color: "red" as const, icon: XCircle },
};

export default function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const deposit = searchParams.get("deposit");

  // Le paiement est confirmé par le webhook Stripe côté serveur
  // On affiche juste un message de confirmation sans modifier Firestore

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        // Charger les réservations directes + celles faites par d'autres familles pour nos enfants (ex: grands-parents)
        const [ownSnap, linkedSnap] = await Promise.all([
          getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid))),
          getDocs(query(collection(db, "reservations"), where("sourceFamilyId", "==", user.uid))),
        ]);
        const own = ownSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Reservation[];
        const linked = linkedSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Reservation[];
        // Dédupliquer par id
        const all = [...own, ...linked.filter(r => !own.some(o => o.id === r.id))];
        setReservations(all);
      } catch (e) {
        // Fallback client-side
        try {
          const snap = await getDocs(collection(db, "reservations"));
          setReservations(
            snap.docs
              .map(d => ({ id: d.id, ...d.data() } as Reservation))
              .filter(r => r.familyId === user.uid || (r as any).sourceFamilyId === user.uid)
          );
        } catch (e2) { console.error(e2); }
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Group by upcoming / past
  const today = new Date().toISOString().split("T")[0];
  const upcoming = reservations.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = reservations.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Mes réservations</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Retrouvez ici toutes vos réservations passées et à venir.</p>

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
