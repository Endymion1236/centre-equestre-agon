"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Badge, Card } from "@/components/ui";
import { todayLocalString } from "@/lib/date-local";

interface Reservation {
  id: string;
  familyId: string;
  activityTitle: string;
  activityType: string;
  childName: string;
  date: any;
  startTime: string;
  endTime: string;
  priceTTC: number;
  status: "confirmed" | "pending" | "pending_payment" | "pending_validation" | "cancelled";
  createdAt: any;
  type?: string;
  dayLabel?: string;
  totalSessions?: number;
}

const statusConfig: Record<string, { label: string; color: "green" | "orange" | "red" | "gray" }> = {
  confirmed: { label: "Confirmée", color: "green" },
  pending: { label: "En attente de paiement", color: "orange" },
  pending_payment: { label: "Paiement à finaliser", color: "orange" },
  pending_validation: { label: "En attente de validation", color: "orange" },
  cancelled: { label: "Annulée", color: "red" },
};

function reservationDate(value: any): Date | null {
  if (!value) return null;
  try {
    const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function fullDate(value: any) {
  const date = reservationDate(value);
  return date
    ? date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "Date à confirmer";
}

function shortDate(value: any) {
  const date = reservationDate(value);
  return date ? date.toLocaleDateString("fr-FR") : "Date à confirmer";
}

function dateTile(value: any) {
  const date = reservationDate(value);
  if (!date) return { day: "—", number: "—" };
  return {
    day: date.toLocaleDateString("fr-FR", { weekday: "short" }),
    number: String(date.getDate()),
  };
}

export default function ReservationsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [cancellingWaitlist, setCancellingWaitlist] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      let own: Reservation[] = [];
      try {
        const ownSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
        own = ownSnap.docs.map((item) => ({ id: item.id, ...item.data() })) as Reservation[];
      } catch (error) {
        console.error("[reservations] own:", error);
      }

      let linked: Reservation[] = [];
      try {
        const linkedSnap = await getDocs(query(collection(db, "reservations"), where("sourceFamilyId", "==", user.uid)));
        linked = linkedSnap.docs.map((item) => ({ id: item.id, ...item.data() })) as Reservation[];
      } catch {
        // Les réservations liées sont optionnelles.
      }

      try {
        const waitlistSnap = await getDocs(query(collection(db, "waitlist"), where("familyId", "==", user.uid)));
        const today = todayLocalString();
        const entries = waitlistSnap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((entry: any) =>
            (entry.status === "waiting" || entry.status === "notified") && (!entry.date || entry.date >= today),
          )
          .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
        // Une entrée « notifiée » ne vaut PAS une place disponible : le
        // créneau a pu être rempli entre-temps (inscription admin, autre
        // famille). Sans cette vérification, on annonçait « Place
        // disponible » et « Réserver cette place » sur un stage complet.
        // Pour un stage, la semaine ENTIÈRE doit avoir de la place.
        const aVerifier = entries.filter((e: any) => e.status === "notified");
        const dispo = await Promise.all(aVerifier.map(async (e: any) => {
          const ids: string[] = Array.isArray(e.creneauIds) && e.creneauIds.length
            ? e.creneauIds
            : e.creneauId ? [e.creneauId] : [];
          if (ids.length === 0) return [e.id, false] as const;
          try {
            const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, "creneaux", id))));
            const libre = snaps.every((sn) => {
              if (!sn.exists()) return false;
              const d = sn.data() as any;
              // La place tenue pour CETTE famille reste comptée comme libre.
              const pris = (d.enrolled || []).length;
              return (d.maxPlaces || 0) - pris > 0;
            });
            return [e.id, libre] as const;
          } catch { return [e.id, false] as const; }
        }));
        const dispoMap = new Map(dispo);
        setWaitlistEntries(entries.map((e: any) =>
          e.status === "notified" ? { ...e, placeReellementLibre: dispoMap.get(e.id) === true } : e
        ));
      } catch (error) {
        console.error("[reservations] waitlist:", error);
      }

      setReservations([...own, ...linked.filter((item) => !own.some((ownItem) => ownItem.id === item.id))]);
      setLoading(false);
    };

    load();
  }, [user]);

  const cancelWaitlist = async (entry: any) => {
    if (!confirm(`Retirer ${entry.childName} de la liste d'attente pour « ${entry.activityTitle} » ?`)) return;
    setCancellingWaitlist(entry.id);
    try {
      await deleteDoc(doc(db, "waitlist", entry.id));
      setWaitlistEntries((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      console.error("[waitlist] annulation:", error);
      alert("Impossible d'annuler pour le moment. Réessayez ou contactez le centre.");
    }
    setCancellingWaitlist(null);
  };

  const isAnnual = (reservation: Reservation) => reservation.type === "annual" || !reservation.date;
  const annual = reservations.filter(isAnnual).filter((reservation) => reservation.status !== "cancelled");
  const punctual = reservations.filter((reservation) => !isAnnual(reservation));

  const today = new Date(`${todayLocalString()}T00:00:00`);
  const upcoming = punctual
    .filter((reservation) => {
      const date = reservationDate(reservation.date);
      return date && date >= today && reservation.status !== "cancelled";
    })
    .sort((a, b) => {
      const aDate = reservationDate(a.date)?.getTime() || 0;
      const bDate = reservationDate(b.date)?.getTime() || 0;
      if (aDate !== bDate) return aDate - bDate;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

  const past = punctual
    .filter((reservation) => {
      const date = reservationDate(reservation.date);
      return Boolean(date && date < today);
    })
    .sort((a, b) => (reservationDate(b.date)?.getTime() || 0) - (reservationDate(a.date)?.getTime() || 0));

  const pendingPayment = reservations.filter((reservation) => reservation.status === "pending_payment");
  const nextReservation = upcoming[0] || null;
  const laterReservations = upcoming.slice(1);
  const urgentWaitlist = waitlistEntries.filter((entry) =>
    entry.status === "notified"
    && entry.holdUntil && new Date(entry.holdUntil).getTime() > Date.now()
    && entry.placeReellementLibre === true,
  );
  const quietWaitlist = waitlistEntries.filter((entry) => !urgentWaitlist.some((urgent) => urgent.id === entry.id));

  const renderWaitlistCard = (entry: any, urgent = false) => {
    const holdStillValid = urgent && entry.holdUntil && new Date(entry.holdUntil).getTime() > Date.now();
    return (
      <Card key={entry.id} padding="md" className={urgent ? "!border-green-300 !bg-green-50" : ""}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="font-body text-sm font-bold text-blue-800">{entry.activityTitle}</div>
            <div className="font-body text-xs text-gray-600 mt-1">
              {entry.childName}
              {entry.date && <> · {fullDate(entry.date)}</>}
              {entry.startTime && <> · {entry.startTime}–{entry.endTime}</>}
            </div>
            {holdStillValid ? (
              <div className="font-body text-xs text-green-700 font-semibold mt-2">
                🎉 Une place vous est réservée jusqu’au {new Date(entry.holdUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
              </div>
            ) : (
              <div className="font-body text-xs text-gray-500 mt-2">Vous serez prévenu si une place se libère.</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge color={urgent ? "green" : "orange"}>{urgent ? "Place disponible" : "En attente"}</Badge>
            <button
              type="button"
              onClick={() => cancelWaitlist(entry)}
              disabled={cancellingWaitlist === entry.id}
              className="flex items-center gap-1 font-body text-xs text-gray-500 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-red-300 hover:text-red-500 disabled:opacity-50"
            >
              {cancellingWaitlist === entry.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Retirer
            </button>
          </div>
        </div>
        {holdStillValid && (
          <Link href="/espace-cavalier/reserver" className="mt-3 flex items-center justify-center gap-1.5 font-body text-sm font-bold text-white bg-green-600 px-4 py-2.5 rounded-xl no-underline">
            Réserver cette place <ChevronRight size={15} />
          </Link>
        )}
      </Card>
    );
  };

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Mes réservations</h1>
        <p className="font-body text-sm text-gray-600">Vos prochaines activités, vos inscriptions à l’année et votre historique.</p>
      </div>

      {success === "true" && (
        <Card className="!bg-green-50 !border-green-200 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <Check size={20} className="text-green-600" />
            <div className="font-body text-sm text-green-800">
              <strong>Paiement confirmé.</strong> Votre réservation est bien enregistrée.
            </div>
          </div>
        </Card>
      )}

      {pendingPayment.length > 0 && (
        <Card className="!bg-orange-50 !border-orange-200 mb-5" padding="md">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Clock size={20} className="text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="font-body text-sm font-bold text-orange-800">Paiement à finaliser</div>
              <p className="font-body text-xs text-orange-700 mt-1 mb-3">
                {pendingPayment.length} réservation{pendingPayment.length > 1 ? "s sont" : " est"} en attente de règlement.
              </p>
              <Link href="/espace-cavalier/factures" className="inline-flex items-center gap-1.5 font-body text-sm font-bold text-white bg-orange-500 px-4 py-2 rounded-lg no-underline">
                Voir et régler <ChevronRight size={15} />
              </Link>
            </div>
          </div>
        </Card>
      )}

      {urgentWaitlist.length > 0 && (
        <section className="mb-6">
          <div className="font-body text-xs font-bold uppercase tracking-wider text-green-700 mb-2 flex items-center gap-2">
            <Bell size={14} /> Une place s’est libérée
          </div>
          <div className="flex flex-col gap-3">{urgentWaitlist.map((entry) => renderWaitlistCard(entry, true))}</div>
        </section>
      )}

      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        </div>
      ) : reservations.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-5xl block mb-4">📋</span>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-2">Aucune réservation</h2>
          <p className="font-body text-sm text-gray-600 mb-4">Découvrez les prochains stages, cours et balades.</p>
          <Link href="/espace-cavalier/reserver" className="inline-flex items-center gap-1.5 font-body text-sm font-bold text-white bg-blue-500 px-5 py-2.5 rounded-xl no-underline">
            Réserver une activité <ChevronRight size={15} />
          </Link>
        </Card>
      ) : (
        <>
          {/* Prochaine activité */}
          {nextReservation && (() => {
            const tile = dateTile(nextReservation.date);
            const status = statusConfig[nextReservation.status] || statusConfig.pending;
            return (
              <section className="mb-7">
                <div className="font-body text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Prochaine activité</div>
                <Card padding="md" className="!bg-gradient-to-br !from-blue-800 !to-blue-600 !border-blue-700 text-white">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="font-body text-xs font-bold uppercase text-blue-100">{tile.day}</span>
                      <span className="font-display text-xl font-bold text-white">{tile.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-xl font-bold text-white">{nextReservation.activityTitle}</div>
                      <div className="font-body text-sm text-blue-50 mt-1">🐴 {nextReservation.childName}</div>
                      <div className="font-body text-sm text-blue-100 mt-2 capitalize">
                        {fullDate(nextReservation.date)}
                        {nextReservation.startTime && ` · ${nextReservation.startTime}${nextReservation.endTime ? `–${nextReservation.endTime}` : ""}`}
                      </div>
                    </div>
                    <Badge color={status.color}>{status.label}</Badge>
                  </div>
                </Card>
              </section>
            );
          })()}

          {/* Activités suivantes */}
          {laterReservations.length > 0 && (
            <section className="mb-7">
              <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Ensuite</h2>
              <div className="flex flex-col gap-3">
                {laterReservations.map((reservation) => {
                  const tile = dateTile(reservation.date);
                  const status = statusConfig[reservation.status] || statusConfig.pending;
                  return (
                    <Card key={reservation.id} padding="md">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                            <span className="font-body text-xs font-bold text-blue-500 uppercase">{tile.day}</span>
                            <span className="font-display text-lg font-bold text-blue-800">{tile.number}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-body text-sm font-bold text-blue-800">{reservation.activityTitle}</div>
                            <div className="font-body text-xs text-gray-600 mt-0.5">
                              {reservation.childName} · {reservation.startTime || ""}{reservation.endTime ? `–${reservation.endTime}` : ""}
                            </div>
                            <div className="font-body text-xs text-gray-400 mt-0.5 capitalize">{fullDate(reservation.date)}</div>
                          </div>
                        </div>
                        <Badge color={status.color}>{status.label}</Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Inscriptions annuelles */}
          {annual.length > 0 && (
            <section className="mb-7">
              <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Cours à l’année</h2>
              <div className="flex flex-col gap-3">
                {annual.map((reservation) => {
                  const status = statusConfig[reservation.status] || statusConfig.pending;
                  return (
                    <Card key={reservation.id} padding="md">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-gold-50 flex items-center justify-center text-xl">🐴</div>
                          <div>
                            <div className="font-body text-sm font-bold text-blue-800">{reservation.activityTitle}</div>
                            <div className="font-body text-xs text-gray-600 mt-0.5">
                              {reservation.childName}
                              {reservation.dayLabel ? ` · tous les ${reservation.dayLabel.toLowerCase()}` : ""}
                              {reservation.startTime ? ` · ${reservation.startTime}${reservation.endTime ? `–${reservation.endTime}` : ""}` : ""}
                            </div>
                            {reservation.totalSessions ? (
                              <div className="font-body text-xs text-gray-400 mt-0.5">{reservation.totalSessions} séances sur l’année</div>
                            ) : null}
                          </div>
                        </div>
                        <Badge color={status.color}>{status.label}</Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Liste d’attente repliable */}
          {quietWaitlist.length > 0 && (
            <section className="mb-7">
              <button
                type="button"
                onClick={() => setShowWaitlist((value) => !value)}
                className="w-full flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center"><Bell size={17} className="text-orange-600" /></div>
                  <div>
                    <div className="font-body text-sm font-bold text-blue-800">Liste d’attente</div>
                    <div className="font-body text-xs text-gray-600">{quietWaitlist.length} demande{quietWaitlist.length > 1 ? "s" : ""} en cours</div>
                  </div>
                </div>
                <ChevronDown size={18} className={`text-gray-400 transition-transform ${showWaitlist ? "rotate-180" : ""}`} />
              </button>
              {showWaitlist && <div className="flex flex-col gap-3 mt-3">{quietWaitlist.map((entry) => renderWaitlistCard(entry))}</div>}
            </section>
          )}

          {/* Historique repliable */}
          {past.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                className="w-full flex items-center justify-between gap-3 bg-transparent border-none px-0 py-2 cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <History size={17} className="text-gray-400" />
                  <span className="font-body text-sm font-bold text-gray-600">Historique</span>
                  <span className="font-body text-xs text-gray-400">{past.length} activité{past.length > 1 ? "s" : ""}</span>
                </div>
                <ChevronDown size={18} className={`text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>

              {showHistory && (
                <div className="flex flex-col gap-2 mt-2">
                  {past.map((reservation) => (
                    <Card key={reservation.id} padding="sm" className="opacity-75">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-body text-sm font-semibold text-gray-700">{reservation.activityTitle}</div>
                          <div className="font-body text-xs text-gray-500 mt-0.5">{reservation.childName} · {shortDate(reservation.date)}</div>
                        </div>
                        {reservation.status === "cancelled" && <Badge color="red"><XCircle size={10} className="inline mr-1" />Annulée</Badge>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

          <Link href="/espace-cavalier/reserver" className="mt-8 flex items-center justify-center gap-1.5 font-body text-sm font-bold text-blue-500 bg-blue-50 py-3 rounded-xl no-underline">
            Réserver une nouvelle activité <ChevronRight size={15} />
          </Link>
        </>
      )}
    </div>
  );
}
