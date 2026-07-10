"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Calendar, ChevronRight, CreditCard, Bell, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { todayLocalString } from "@/lib/date-local";

type UpcomingReservation = {
  id: string;
  activityTitle?: string;
  childName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  monitor?: string;
  status?: string;
};

type SessionCard = {
  id: string;
  childName?: string;
  familiale?: boolean;
  activityType?: string;
  totalSessions?: number;
  remainingSessions?: number;
  status?: string;
  dateFin?: string;
};

export default function DashboardPage() {
  const { user, family } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || family?.parentName?.split(" ").slice(-1)[0] || "";
  const { permission, loading: pushLoading, error: pushError, requestPermission } = usePushNotifications(user?.uid || null);

  const [stats, setStats] = useState({ upcoming: 0, due: 0, credit: 0 });
  const [nextReservation, setNextReservation] = useState<UpcomingReservation | null>(null);
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [fidelity, setFidelity] = useState<{ points: number; rate: number; enabled: boolean } | null>(null);
  const [waCommunity, setWaCommunity] = useState("");
  const [waGroups, setWaGroups] = useState<{ key: string; label: string; url: string }[]>([]);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const today = todayLocalString();

      try {
        const reservationsSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
        const upcoming = reservationsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as UpcomingReservation))
          .filter((r) => (r.date || "") >= today && r.status !== "cancelled")
          .sort((a, b) => `${a.date || ""} ${a.startTime || ""}`.localeCompare(`${b.date || ""} ${b.startTime || ""}`));
        setNextReservation(upcoming[0] || null);
        setStats((s) => ({ ...s, upcoming: upcoming.length }));
      } catch (e) {
        console.warn("Dashboard reservations:", e);
      }

      try {
        const paymentsSnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", user.uid)));
        const due = paymentsSnap.docs.reduce((sum, d) => {
          const p = d.data();
          if (p.status === "cancelled") return sum;
          return sum + Math.max(0, (p.totalTTC || 0) - (p.paidAmount || 0));
        }, 0);
        setStats((s) => ({ ...s, due: Math.round(due * 100) / 100 }));
      } catch (e) {
        console.warn("Dashboard payments:", e);
      }

      try {
        const creditsSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
        const credit = creditsSnap.docs.reduce((sum, d) => {
          const a = d.data();
          return a.status === "actif" ? sum + (a.remainingAmount || 0) : sum;
        }, 0);
        setStats((s) => ({ ...s, credit: Math.round(credit * 100) / 100 }));
      } catch (e) {
        console.warn("Dashboard credits:", e);
      }

      try {
        const cardsSnap = await getDocs(query(collection(db, "cartes"), where("familyId", "==", user.uid)));
        const activeCards = cardsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SessionCard))
          .filter((c) => c.status !== "used" && (c.remainingSessions || 0) > 0 && (!c.dateFin || new Date(c.dateFin) >= new Date()));
        setCards(activeCards);
      } catch (e) {
        console.warn("Dashboard cards:", e);
      }

      try {
        const settingsSnap = await getDoc(doc(db, "settings", "fidelite"));
        const settings = settingsSnap.exists() ? settingsSnap.data() : {};
        let fidelitySnap = await getDoc(doc(db, "fidelite", user.uid));
        if (!fidelitySnap.exists()) {
          const q = await getDocs(query(collection(db, "fidelite"), where("familyId", "==", user.uid)));
          if (!q.empty) fidelitySnap = q.docs[0] as any;
        }
        setFidelity({
          points: fidelitySnap.exists() ? (fidelitySnap.data()?.points || 0) : 0,
          rate: settings.taux || 50,
          enabled: settings.enabled !== false,
        });
      } catch (e) {
        console.warn("Dashboard fidelity:", e);
      }
    };

    load();
  }, [user]);

  useEffect(() => {
    if (!user?.uid || !family) return;

    const loadWhatsApp = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "whatsapp"));
        const settings = settingsSnap.exists() ? settingsSnap.data() : {};
        setWaCommunity(settings.communityUrl || "");

        const urls: Record<string, string> = settings.reprises || {};
        if (Object.keys(urls).length === 0) return;

        const childIds = new Set((family.children || []).map((c: any) => c.id));
        const today = todayLocalString();
        const end = new Date();
        end.setDate(end.getDate() + 28);
        const endString = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const slotsSnap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", today), where("date", "<=", endString)));
        const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
        const found: Record<string, { label: string; url: string }> = {};

        slotsSnap.docs.forEach((d) => {
          const c = d.data() as any;
          if (!c.activityId || c.activityType === "stage" || c.activityType === "stage_journee") return;
          const member = (c.enrolled || []).some((e: any) => childIds.has(e.childId) && e.paymentSource === "forfait");
          if (!member) return;
          const dayIndex = (new Date(c.date).getDay() + 6) % 7;
          const key = `${c.activityId}-${dayIndex}-${c.startTime}`;
          if (urls[key] && !found[key]) found[key] = { label: `${c.activityTitle} · ${days[dayIndex]} · ${c.startTime}`, url: urls[key] };
        });
        setWaGroups(Object.entries(found).map(([key, value]) => ({ key, ...value })));
      } catch (e) {
        console.warn("Dashboard WhatsApp:", e);
      }
    };

    loadWhatsApp();
  }, [user, family]);

  const profileIssues = useMemo(() => {
    if (!family) return [] as string[];
    const issues: string[] = [];
    if (!family.children?.length) issues.push("Ajoutez vos cavaliers pour pouvoir réserver.");
    const missingSanitary = (family.children || []).filter((c: any) => !c.sanitaryForm).map((c: any) => c.firstName).filter(Boolean);
    if (missingSanitary.length) issues.push(`Attestation sanitaire à compléter pour ${missingSanitary.join(", ")}.`);
    return issues;
  }, [family]);

  const formattedNextDate = nextReservation?.date
    ? new Date(`${nextReservation.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const hasWhatsApp = Boolean(waCommunity || waGroups.length);
  const fidelityValue = fidelity ? fidelity.points / fidelity.rate : 0;

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Bonjour {firstName} 👋</h1>
        <p className="font-body text-sm text-gray-600">Voici l’essentiel pour votre famille.</p>
      </div>

      {/* 1. Prochaine activité */}
      {nextReservation ? (
        <Card padding="md" className="mb-4 !bg-gradient-to-br !from-blue-800 !to-blue-600 !border-blue-700 text-white overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-body text-xs uppercase tracking-wider text-blue-100 font-semibold mb-2">Prochaine activité</div>
              <div className="font-display text-xl font-bold text-white truncate">{nextReservation.activityTitle || "Activité équestre"}</div>
              <div className="font-body text-sm text-blue-50 mt-1">{nextReservation.childName || "Votre cavalier"}</div>
              <div className="font-body text-sm text-blue-100 mt-3 capitalize">
                {formattedNextDate}{nextReservation.startTime ? ` · ${nextReservation.startTime}${nextReservation.endTime ? `–${nextReservation.endTime}` : ""}` : ""}
              </div>
              {nextReservation.monitor && <div className="font-body text-xs text-blue-200 mt-1">Avec {nextReservation.monitor}</div>}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Calendar size={24} />
            </div>
          </div>
          <Link href="/espace-cavalier/reservations" className="mt-4 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-white no-underline bg-white/15 hover:bg-white/20 px-3 py-2 rounded-lg">
            Voir le détail <ChevronRight size={15} />
          </Link>
        </Card>
      ) : (
        <Card padding="md" className="mb-4 !bg-blue-50 !border-blue-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-body text-sm font-bold text-blue-800">Aucune activité à venir</div>
              <div className="font-body text-xs text-gray-600 mt-1">Découvrez les prochains stages, cours et balades.</div>
            </div>
            <Calendar size={24} className="text-blue-400" />
          </div>
        </Card>
      )}

      {/* 2. Actions principales */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link href="/espace-cavalier/reserver" className="no-underline">
          <Card hover padding="md" className="h-full !bg-blue-500 !border-blue-500 text-white">
            <div className="text-2xl mb-3">📅</div>
            <div className="font-body text-sm font-bold text-white">Réserver une activité</div>
            <div className="font-body text-xs text-blue-100 mt-1">Stages, cours et balades</div>
          </Card>
        </Link>
        <Link href="/espace-cavalier/reservations" className="no-underline">
          <Card hover padding="md" className="h-full">
            <div className="text-2xl mb-3">📋</div>
            <div className="font-body text-sm font-bold text-blue-800">Mes réservations</div>
            <div className="font-body text-xs text-gray-600 mt-1">Voir les activités à venir</div>
          </Card>
        </Link>
      </div>

      {/* 3. Indicateurs utiles seulement */}
      <div className={`grid gap-3 mb-5 ${stats.credit > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-blue-500">{stats.upcoming}</div>
          <div className="font-body text-xs text-gray-600">À venir</div>
        </Card>
        <Link href="/espace-cavalier/factures" className="no-underline">
          <Card padding="sm" className={stats.due > 0 ? "!bg-red-50 !border-red-100" : "!bg-green-50 !border-green-100"}>
            <div className={`font-body text-xl font-bold ${stats.due > 0 ? "text-red-500" : "text-green-600"}`}>{stats.due > 0 ? `${stats.due.toFixed(0)}€` : "✓"}</div>
            <div className="font-body text-xs text-gray-600">{stats.due > 0 ? "À régler" : "Paiements à jour"}</div>
          </Card>
        </Link>
        {stats.credit > 0 && (
          <Link href="/espace-cavalier/factures" className="no-underline">
            <Card padding="sm" className="!bg-amber-50 !border-amber-100">
              <div className="font-body text-xl font-bold text-amber-600">{stats.credit.toFixed(0)}€</div>
              <div className="font-body text-xs text-gray-600">D’avoir</div>
            </Card>
          </Link>
        )}
      </div>

      {/* 4. Actions nécessaires regroupées */}
      {(profileIssues.length > 0 || stats.due > 0 || permission === "default" || pushError) && (
        <Card padding="md" className="mb-5 !bg-orange-50 !border-orange-200">
          <div className="font-body text-sm font-bold text-orange-800 mb-3">À faire</div>
          <div className="flex flex-col gap-3">
            {stats.due > 0 && (
              <Link href="/espace-cavalier/factures" className="flex items-center justify-between gap-3 no-underline">
                <div className="flex items-center gap-2 font-body text-sm text-orange-800"><CreditCard size={16} /> Régler {stats.due.toFixed(2)}€</div>
                <ChevronRight size={16} className="text-orange-500" />
              </Link>
            )}
            {profileIssues.slice(0, 2).map((issue) => (
              <Link key={issue} href="/espace-cavalier/profil" className="flex items-center justify-between gap-3 no-underline">
                <div className="font-body text-sm text-orange-800">⚠️ {issue}</div>
                <ChevronRight size={16} className="text-orange-500 flex-shrink-0" />
              </Link>
            ))}
            {permission === "default" && (
              <button onClick={requestPermission} disabled={pushLoading} className="w-full flex items-center justify-between gap-3 bg-transparent border-none p-0 cursor-pointer text-left">
                <div className="flex items-center gap-2 font-body text-sm text-orange-800"><Bell size={16} /> Activer les rappels et alertes</div>
                <span className="font-body text-xs font-semibold text-orange-600">{pushLoading ? "..." : "Activer"}</span>
              </button>
            )}
            {pushError && <div className="font-body text-xs text-red-600">Notifications : {pushError}</div>}
          </div>
        </Card>
      )}

      {/* 5. WhatsApp compact */}
      {hasWhatsApp && (
        <Card padding="sm" className="mb-5">
          <button onClick={() => setShowWhatsApp((v) => !v)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">💬</div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Communauté et groupes WhatsApp</div>
                <div className="font-body text-xs text-gray-600">Les liens utiles du centre</div>
              </div>
            </div>
            <ChevronRight size={18} className={`text-gray-400 transition-transform ${showWhatsApp ? "rotate-90" : ""}`} />
          </button>
          {showWhatsApp && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
              {waCommunity && <a href={waCommunity} target="_blank" rel="noopener noreferrer" className="font-body text-sm font-semibold text-green-700 no-underline bg-green-50 px-3 py-2.5 rounded-lg">Rejoindre la communauté du centre</a>}
              {waGroups.map((g) => <a key={g.key} href={g.url} target="_blank" rel="noopener noreferrer" className="font-body text-sm text-green-800 no-underline bg-green-50/60 px-3 py-2.5 rounded-lg">{g.label}</a>)}
            </div>
          )}
        </Card>
      )}

      {/* 6. Cartes + fidélité regroupées */}
      {(cards.length > 0 || fidelity?.enabled) && (
        <div className="mb-5">
          <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Mes avantages</h2>
          <Card padding="md">
            <div className="flex flex-col divide-y divide-gray-100">
              {cards.slice(0, 2).map((card) => (
                <div key={card.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center">🎟️</div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">Carte {card.totalSessions || ""} séances</div>
                      <div className="font-body text-xs text-gray-600">{card.familiale ? "Carte familiale" : card.childName || "Carte de séances"}</div>
                    </div>
                  </div>
                  <div className="font-body text-sm font-bold text-gold-600">{card.remainingSessions || 0} restantes</div>
                </div>
              ))}
              {cards.length > 2 && <div className="font-body text-xs text-gray-500 py-2">+ {cards.length - 2} autre{cards.length > 3 ? "s" : ""} carte{cards.length > 3 ? "s" : ""}</div>}
              {fidelity?.enabled && (
                <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center"><Sparkles size={19} className="text-yellow-600" /></div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">Fidélité</div>
                      <div className="font-body text-xs text-gray-600">{fidelity.points} points</div>
                    </div>
                  </div>
                  <div className="font-body text-sm font-bold text-yellow-700">{fidelityValue.toFixed(2)}€</div>
                </div>
              )}
            </div>
            <Link href="/espace-cavalier/factures" className="mt-4 flex items-center justify-center gap-1.5 font-body text-sm font-semibold text-blue-500 no-underline bg-blue-50 py-2.5 rounded-lg">
              Voir mes cartes et avantages <ChevronRight size={15} />
            </Link>
          </Card>
        </div>
      )}

      {/* Raccourcis secondaires, volontairement discrets */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/espace-cavalier/inscription-annuelle" className="no-underline">
          <Card hover padding="sm"><div className="font-body text-sm font-semibold text-blue-800">📋 Inscription annuelle</div></Card>
        </Link>
        <Link href="/espace-cavalier/profil" className="no-underline">
          <Card hover padding="sm"><div className="font-body text-sm font-semibold text-blue-800">👨‍👩‍👧‍👦 Ma famille</div></Card>
        </Link>
      </div>
    </div>
  );
}
