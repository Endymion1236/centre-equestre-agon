"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, updateDoc } from "firebase/firestore";
import { Calendar, ChevronRight, CreditCard, Bell, Wallet, Sparkles, AlertTriangle, Check, Ticket, Users, MessageCircle, Repeat } from "lucide-react";
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
  // Inscriptions en liste d'attente : visibles des l'accueil, sinon la
  // famille oublie qu'elle est en file (elles ne vivaient que dans un bloc
  // replie de Mes reservations).
  const [waitlist, setWaitlist] = useState<{ enFile: number; placeReservee: number }>({ enFile: 0, placeReservee: 0 });
  const [nextReservation, setNextReservation] = useState<UpcomingReservation | null>(null);
  // La séance qui suit : une ligne sous la prochaine activité suffit à
  // répondre à « et après ? » sans ouvrir Mes réservations.
  const [suivante, setSuivante] = useState<UpcomingReservation | null>(null);
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
        setSuivante(upcoming[1] || null);
        setStats((s) => ({ ...s, upcoming: upcoming.length }));

        // Attentes actives : « place reservee » (notifiee, hold en cours)
        // compte a part — c'est celle qui appelle une action rapide.
        try {
          const wSnap = await getDocs(query(collection(db, "waitlist"), where("familyId", "==", user.uid)));
          let enFile = 0, placeReservee = 0;
          wSnap.docs.forEach((d) => {
            const w = d.data() as any;
            if (w.date && w.date < today) return;
            if (w.status === "notified" && w.holdUntil && new Date(w.holdUntil).getTime() > Date.now()) placeReservee++;
            else if ((w.status || "waiting") === "waiting") enFile++;
          });
          setWaitlist({ enFile, placeReservee });
        } catch (e) { console.warn("Dashboard waitlist:", e); }
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
        // 45 jours : a la rentree, les familles doivent pouvoir rejoindre le
        // groupe de leur reprise bien avant la premiere seance. 28 jours
        // masquait le lien jusqu'a fin aout pour un cours reprenant le
        // 26 septembre.
        end.setDate(end.getDate() + 45);
        const endString = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const slotsSnap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", today), where("date", "<=", endString)));
        const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
        const found: Record<string, { label: string; url: string }> = {};

        slotsSnap.docs.forEach((d) => {
          const c = d.data() as any;
          if (!c.activityId || c.activityType === "stage" || c.activityType === "stage_journee") return;
          // Appartenance au groupe : le lien s'affiche pour toute inscription
          // au cours, pas seulement celles couvertes par un forfait annuel.
          // Une pré-inscription (place retenue avant signature du mandat) ou
          // une inscription réglée autrement n'ont pas de paymentSource
          // "forfait" : ces familles se retrouvaient sans lien vers le groupe
          // de leur reprise, alors qu'elles y ont bien leur place.
          const member = (c.enrolled || []).some((e: any) => childIds.has(e.childId));
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

  // Un stage de vacances court sur toute une semaine (`dateFin`, `nbJours`).
  // N'afficher que le premier jour laissait croire à une séance unique.
  const formattedNextDate = (() => {
    const r: any = nextReservation;
    if (!r?.date) return "";
    const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
    const debut = new Date(`${r.date}T12:00:00`).toLocaleDateString("fr-FR", opts);
    if ((r.nbJours || 1) <= 1 || !r.dateFin || r.dateFin <= r.date) return debut;
    const fin = new Date(`${r.dateFin}T12:00:00`).toLocaleDateString("fr-FR", opts);
    return `Du ${debut} au ${fin} · ${r.nbJours} jours`;
  })();

  const hasWhatsApp = Boolean(waCommunity || waGroups.length);
  const [rejointLocal, setRejointLocal] = useState(false);
  const groupesRejoints = Boolean((family as any)?.whatsappRejoint) || rejointLocal;
  const relanceGroupes = waGroups.length > 0 && !groupesRejoints;

  const marquerRejoint = async () => {
    if (!user?.uid) return;
    try {
      setRejointLocal(true);
      await updateDoc(doc(db, "families", user.uid), { whatsappRejoint: true });
    } catch { /* sans effet : la banniere reste, ce n'est pas bloquant */ }
  };
  const fidelityValue = fidelity ? fidelity.points / fidelity.rate : 0;

  // Ligne « Puis … » sous la prochaine activité : jour court + heure.
  const suivanteLibelle = (() => {
    const r: any = suivante;
    if (!r?.date) return "";
    const jour = new Date(`${r.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return `${jour}${r.startTime ? ` · ${r.startTime}` : ""}`;
  })();

  const aFaire = (profileIssues.length > 0 || stats.due > 0 || waitlist.placeReservee > 0 || permission === "default" || pushError);
  const nbAFaire = profileIssues.length + (stats.due > 0 ? 1 : 0) + (waitlist.placeReservee > 0 ? 1 : 0) + (permission === "default" ? 1 : 0);
  const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  // Une ligne du bloc « Ma situation » : icône, titre, sous-titre, valeur à droite.
  const ligneSituation = (opts: { href: string; icone: React.ReactNode; fond: string; titre: string; sous: string; droite?: React.ReactNode; premiere?: boolean }) => (
    <Link href={opts.href} className={`flex items-center justify-between gap-3 no-underline py-3 ${opts.premiere ? "" : "border-t border-gray-100"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${opts.fond}`}>{opts.icone}</div>
        <div className="min-w-0">
          <div className="font-body text-sm font-semibold text-blue-800">{opts.titre}</div>
          <div className="font-body text-xs text-gray-600">{opts.sous}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
        {opts.droite}
        <ChevronRight size={16} className="text-gray-300" />
      </div>
    </Link>
  );

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Bonjour {firstName} 👋</h1>
        <p className="font-body text-sm text-gray-600">Voici l’essentiel pour votre famille.</p>
      </div>

      {/* 1. À faire — le seul bloc coloré de la page : tout ce qui attend une
          action de la famille est ici, et nulle part ailleurs. */}
      {aFaire && (
        <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-5 pt-4 pb-1.5">
          <div className="font-body text-[11px] font-bold uppercase tracking-wider text-orange-700 mb-1">À faire{nbAFaire > 1 ? ` · ${nbAFaire}` : ""}</div>
          <div className="flex flex-col divide-y divide-orange-900/10">
            {waitlist.placeReservee > 0 && (
              <Link href="/espace-cavalier/reserver" className="flex items-center justify-between gap-3 no-underline py-2.5">
                <div className="flex items-center gap-2.5 font-body text-sm text-orange-800"><Bell size={16} className="text-orange-600 flex-shrink-0" /><span>{waitlist.placeReservee > 1 ? `${waitlist.placeReservee} places vous sont réservées` : "Une place vous est réservée"} — à confirmer sous 24 h</span></div>
                <span className="flex items-center font-body text-xs font-bold text-orange-600 whitespace-nowrap">Réserver <ChevronRight size={14} /></span>
              </Link>
            )}
            {stats.due > 0 && (
              <Link href="/espace-cavalier/factures" className="flex items-center justify-between gap-3 no-underline py-2.5">
                <div className="flex items-center gap-2.5 font-body text-sm text-orange-800"><CreditCard size={16} className="text-orange-600 flex-shrink-0" /><span>Un règlement de <strong>{euros(stats.due)}</strong> est attendu</span></div>
                <span className="flex items-center font-body text-xs font-bold text-orange-600 whitespace-nowrap">Régler <ChevronRight size={14} /></span>
              </Link>
            )}
            {profileIssues.map((issue) => (
              <Link key={issue} href="/espace-cavalier/profil" className="flex items-center justify-between gap-3 no-underline py-2.5">
                <div className="flex items-center gap-2.5 font-body text-sm text-orange-800"><AlertTriangle size={16} className="text-orange-600 flex-shrink-0" /><span>{issue}</span></div>
                <span className="flex items-center font-body text-xs font-bold text-orange-600 whitespace-nowrap">Ma famille <ChevronRight size={14} /></span>
              </Link>
            ))}
            {permission === "default" && (
              <button type="button" onClick={requestPermission} disabled={pushLoading} className="w-full flex items-center justify-between gap-3 bg-transparent border-none p-0 py-2.5 cursor-pointer text-left">
                <div className="flex items-center gap-2.5 font-body text-sm text-orange-800"><Bell size={16} className="text-orange-600 flex-shrink-0" /><span>Activer les rappels de séance sur cet appareil</span></div>
                <span className="flex items-center font-body text-xs font-bold text-orange-600 whitespace-nowrap">{pushLoading ? "..." : "Activer"} <ChevronRight size={14} /></span>
              </button>
            )}
            {pushError && <div className="font-body text-xs text-red-600 py-2">Notifications : {pushError}</div>}
          </div>
        </div>
      )}

      {/* Groupe WhatsApp de la reprise : relance jusqu'à ce que la famille
          l'ait rejoint. Conservé tel quel, c'est un rappel, pas une alerte. */}
      {relanceGroupes && (
        <div className="mb-5 rounded-2xl border-2 border-green-500 bg-green-50 p-4">
          <div className="font-body text-sm font-bold text-green-900">Rejoignez le groupe WhatsApp de votre reprise</div>
          <div className="mt-1 font-body text-xs text-green-800 leading-relaxed">
            C&apos;est par là que passent les infos de dernière minute : météo,
            changement d&apos;horaire, séance annulée. Un seul clic, une seule fois.
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {waGroups.map((g) => (
              <a key={g.key} href={g.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl bg-green-600 px-4 py-3 font-body text-sm font-bold text-white no-underline hover:bg-green-700">
                <span>{g.label}</span>
                <ChevronRight size={16} />
              </a>
            ))}
          </div>
          <button type="button" onClick={marquerRejoint}
            className="mt-2 font-body text-xs text-green-700 bg-transparent border-none cursor-pointer hover:underline p-0">
            C&apos;est fait, ne plus afficher
          </button>
        </div>
      )}

      {/* 2. Prochaine activité — une carte blanche compacte, la suivante en
          dessous. Le détail complet vit dans Mes réservations. */}
      <div className="font-body text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Prochaine activité</div>
      {nextReservation ? (
        <Card padding="sm" className="mb-5 !p-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
              <span className="font-body text-[11px] font-bold uppercase text-blue-500 leading-none">{new Date(`${nextReservation.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
              <span className="font-display text-lg font-bold text-blue-800 leading-tight">{new Date(`${nextReservation.date}T12:00:00`).getDate()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg font-bold text-blue-800 truncate">{nextReservation.activityTitle || "Activité équestre"}</div>
              <div className="font-body text-sm text-gray-600">
                {nextReservation.childName || "Votre cavalier"}
                {nextReservation.startTime ? ` · ${nextReservation.startTime}${nextReservation.endTime ? `–${nextReservation.endTime}` : ""}` : ""}
                {nextReservation.monitor ? ` · avec ${nextReservation.monitor}` : ""}
              </div>
              <div className="font-body text-xs text-gray-400 first-letter:uppercase">{formattedNextDate}</div>
            </div>
            {nextReservation.status === "confirmed" && <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-xs font-semibold text-green-700 bg-green-50 whitespace-nowrap">Confirmée</span>}
          </div>
          <div className="mt-3.5 pt-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="font-body text-[13px] text-gray-500">
              {suivante ? <>Puis <strong className="text-gray-700">{suivante.activityTitle}</strong> · {suivanteLibelle}</> : "Rien d’autre de prévu pour l’instant."}
            </div>
            <Link href="/espace-cavalier/reservations" className="inline-flex items-center gap-1 font-body text-[13px] font-bold text-blue-500 no-underline whitespace-nowrap">
              {stats.upcoming > 1 ? `Mes ${stats.upcoming} réservations` : "Mes réservations"} <ChevronRight size={14} />
            </Link>
          </div>
        </Card>
      ) : (
        <Card padding="sm" className="mb-5 !p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-body text-sm font-bold text-blue-800">Aucune activité à venir</div>
              <div className="font-body text-xs text-gray-600 mt-0.5">Découvrez les prochains stages, cours et balades.</div>
            </div>
            <Calendar size={22} className="text-blue-300 flex-shrink-0" />
          </div>
        </Card>
      )}

      {/* 3. Les deux façons de s'inscrire, côte à côte */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link href="/espace-cavalier/reserver" className="no-underline">
          <Card hover padding="sm" className="h-full !p-5 !bg-blue-500 !border-blue-500 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-2.5"><Calendar size={20} /></div>
            <div className="font-body text-base font-bold text-white">Réserver une activité</div>
            <div className="font-body text-xs text-blue-100 mt-0.5">Stages, cours et balades</div>
          </Card>
        </Link>
        <Link href="/espace-cavalier/inscription-annuelle" className="no-underline">
          <Card hover padding="sm" className="h-full !p-5">
            <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center mb-2.5"><Repeat size={20} className="text-gold-600" /></div>
            <div className="font-body text-base font-bold text-blue-800">Inscription à l’année</div>
            <div className="font-body text-xs text-gray-600 mt-0.5">Forfaits et cours réguliers</div>
          </Card>
        </Link>
      </div>

      {/* 4. Ma situation — paiements, avoir, fidélité, cartes, famille :
          des lignes de texte, pas des compteurs. */}
      <div className="font-body text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Ma situation</div>
      <Card padding="sm" className="mb-5 !px-5 !py-2">
        {ligneSituation({
          href: "/espace-cavalier/factures", premiere: true,
          icone: stats.due > 0 ? <CreditCard size={19} className="text-orange-600" /> : <Check size={19} className="text-green-600" />,
          fond: stats.due > 0 ? "bg-orange-50" : "bg-green-50",
          titre: stats.due > 0 ? `Reste à régler : ${euros(stats.due)}` : "Paiements à jour",
          sous: stats.due > 0 ? "Règlement en ligne ou au bureau" : "Aucun règlement attendu",
        })}
        {stats.credit > 0 && ligneSituation({
          href: "/espace-cavalier/factures",
          icone: <Wallet size={19} className="text-gold-600" />, fond: "bg-gold-50",
          titre: "Avoir disponible", sous: "Utilisable sur une prochaine réservation",
          droite: <span className="font-body text-sm font-bold text-gold-600">{euros(stats.credit)}</span>,
        })}
        {fidelity?.enabled && ligneSituation({
          href: "/espace-cavalier/factures",
          icone: <Sparkles size={19} className="text-gold-600" />, fond: "bg-gold-50",
          titre: `Fidélité : ${fidelity.points} points`,
          sous: fidelityValue > 0 ? `Soit ${euros(fidelityValue)} de réduction sur une prochaine réservation` : "Chaque règlement rapporte des points",
          droite: fidelityValue > 0 ? <span className="font-body text-sm font-bold text-gold-600">{euros(fidelityValue)}</span> : undefined,
        })}
        {cards.slice(0, 2).map((card) => ligneSituation({
          href: "/espace-cavalier/factures",
          icone: <Ticket size={19} className="text-blue-500" />, fond: "bg-blue-50",
          titre: `Carte ${card.totalSessions || ""} séances${card.familiale ? " · Familiale" : card.childName ? ` · ${card.childName}` : ""}`,
          sous: card.dateFin ? `Valable jusqu’au ${new Date(card.dateFin).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "Carte de séances",
          droite: <span className="font-body text-sm font-bold text-blue-800">{card.remainingSessions || 0} restante{(card.remainingSessions || 0) > 1 ? "s" : ""}</span>,
        }))}
        {ligneSituation({
          href: "/espace-cavalier/profil",
          icone: <Users size={19} className="text-blue-500" />, fond: "bg-blue-50",
          titre: `Ma famille${family?.children?.length ? ` · ${family.children.length} cavalier${family.children.length > 1 ? "s" : ""}` : ""}`,
          sous: (family?.children || []).map((c: any) => c.firstName).filter(Boolean).join(", ") || "Ajoutez vos cavaliers",
        })}
      </Card>

      {/* 5. WhatsApp — une ligne, dépliable */}
      {hasWhatsApp && (
        <Card padding="sm">
          <button type="button" onClick={() => setShowWhatsApp((v) => !v)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center"><MessageCircle size={17} className="text-green-700" /></div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">{waGroups.length === 1 ? "Groupe WhatsApp de la reprise" : "Communauté et groupes WhatsApp"}</div>
                <div className="font-body text-xs text-gray-600">{waGroups.length === 1 ? `${waGroups[0].label} — infos de dernière minute` : "Les liens utiles du centre"}</div>
              </div>
            </div>
            <ChevronRight size={18} className={`text-gray-300 transition-transform ${showWhatsApp ? "rotate-90" : ""}`} />
          </button>
          {showWhatsApp && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
              {waCommunity && <a href={waCommunity} target="_blank" rel="noopener noreferrer" className="font-body text-sm font-semibold text-green-700 no-underline bg-green-50 px-3 py-2.5 rounded-lg">Rejoindre la communauté du centre</a>}
              {waGroups.map((g) => <a key={g.key} href={g.url} target="_blank" rel="noopener noreferrer" className="font-body text-sm text-green-800 no-underline bg-green-50/60 px-3 py-2.5 rounded-lg">{g.label}</a>)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
