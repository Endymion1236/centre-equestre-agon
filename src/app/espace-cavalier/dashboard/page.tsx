"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import Link from "next/link";
import { Calendar, Receipt, Users, Star, CreditCard, Wallet, Bell, BellOff } from "lucide-react";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function DashboardPage() {
  const { user, family } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Bonjour";
  const [stats, setStats] = useState({ reservations: 0, resteDu: 0, avoir: 0, totalPaye: 0 });
  const { permission, loading, requestPermission } = usePushNotifications(user?.uid || null);
  const [cards, setCards] = useState<any[]>([]);
  const [fidelite, setFidelite] = useState<any>(null);
  const [fideliteSettings, setFideliteSettings] = useState<{ taux: number; minPoints: number; enabled: boolean } | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [convertingPoints, setConvertingPoints] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        // Réservations à venir
        const today = new Date().toISOString().split("T")[0];
        let resCount = 0;
        try {
          const resSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
          resCount = resSnap.docs.filter(d => (d.data().date || "") >= today && d.data().status !== "cancelled").length;
        } catch { /* index manquant */ }

        // Paiements
        let resteDu = 0, totalPaye = 0;
        try {
          const paySnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", user.uid)));
          paySnap.docs.forEach(d => {
            const p = d.data();
            if (p.status === "cancelled") return;
            totalPaye += p.paidAmount || 0;
            resteDu += (p.totalTTC || 0) - (p.paidAmount || 0);
          });
        } catch { /* index manquant */ }

        // Avoirs
        let avoir = 0;
        try {
          const avSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
          avSnap.docs.forEach(d => { const a = d.data(); if (a.status === "actif") avoir += a.remainingAmount || 0; });
        } catch { /* index manquant */ }

        setStats({ reservations: resCount, resteDu: Math.max(0, Math.round(resteDu * 100) / 100), avoir: Math.round(avoir * 100) / 100, totalPaye: Math.round(totalPaye * 100) / 100 });

        // Cartes de séances
        try {
          let cSnap = await getDocs(query(collection(db, "cartes"), where("familyId", "==", user.uid)));
          if (cSnap.empty) {
            cSnap = await getDocs(collection(db, "cartes"));
            const familyCards = cSnap.docs.filter(d => {
              const data = d.data();
              return data.familyId === user.uid || (family?.children || []).some((c: any) => c.id === data.childId);
            });
            setCards(familyCards.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.status !== "used" && c.remainingSessions > 0));
          } else {
            setCards(cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.status !== "used" && c.remainingSessions > 0));
          }
        } catch { setCards([]); }

        // Fidélité
        try {
          const [fDoc, sDoc] = await Promise.all([
            getDoc(doc(db, "fidelite", user.uid)),
            getDoc(doc(db, "settings", "fidelite")),
          ]);
          if (fDoc.exists()) setFidelite(fDoc.data());
          if (sDoc.exists()) setFideliteSettings(sDoc.data() as any);
        } catch {}

      } catch (e) { console.error(e); }
    };
    load();
  }, [user]);

  const hasIncompleteChildren = family?.children?.some(
    (c) => !c.sanitaryForm
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">
        Bonjour {firstName} 👋
      </h1>
      <p className="font-body text-sm text-gray-600 mb-8">
        Voici un résumé de l&apos;activité de votre famille.
      </p>

      {/* Bannière activation notifications push */}
      {permission === "default" && (
        <Card className="!bg-blue-50 !border-blue-200 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Bell size={20} className="text-blue-500"/>
            </div>
            <div className="flex-1">
              <div className="font-body text-sm font-semibold text-blue-800">Activez les notifications</div>
              <div className="font-body text-xs text-blue-600">Rappels de cours, confirmations d'inscription, alertes de place disponible.</div>
            </div>
            <button onClick={requestPermission} disabled={loading}
              className="font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg border-none cursor-pointer flex-shrink-0 disabled:opacity-50">
              {loading ? "..." : "Activer"}
            </button>
          </div>
        </Card>
      )}
      {permission === "granted" && (
        <Card className="!bg-green-50 !border-green-200 mb-5" padding="sm">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-green-600"/>
            <span className="font-body text-xs text-green-700 font-semibold">Notifications activées ✓</span>
          </div>
        </Card>
      )}

      {/* Alert: incomplete profile */}
      {family && family.children.length === 0 && (
        <Card className="!bg-gold-50 !border-gold-400/15 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div className="font-body text-sm text-blue-800">
              <strong>Profil incomplet</strong> — Ajoutez vos enfants pour
              pouvoir réserver.{" "}
              <Link
                href="/espace-cavalier/profil"
                className="text-blue-500 font-semibold no-underline"
              >
                Compléter maintenant →
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Calendar size={20} className="text-blue-500" /></div>
            <div>
              <div className="font-body text-xl font-bold text-blue-500">{stats.reservations}</div>
              <div className="font-body text-xs text-gray-600">Réservations</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className={stats.resteDu > 0 ? "bg-red-50" : "bg-green-50"}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.resteDu > 0 ? "bg-red-100" : "bg-green-100"}`}><CreditCard size={20} className={stats.resteDu > 0 ? "text-red-500" : "text-green-600"} /></div>
            <div>
              <div className={`font-body text-xl font-bold ${stats.resteDu > 0 ? "text-red-500" : "text-green-600"}`}>{stats.resteDu.toFixed(0)}€</div>
              <div className="font-body text-xs text-gray-600">{stats.resteDu > 0 ? "Reste dû" : "À jour"}</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className="bg-green-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Receipt size={20} className="text-green-600" /></div>
            <div>
              <div className="font-body text-xl font-bold text-green-600">{stats.totalPaye.toFixed(0)}€</div>
              <div className="font-body text-xs text-gray-600">Payé</div>
            </div>
          </div>
        </Card>
        {stats.avoir > 0 && (
          <Card padding="sm" className="bg-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Wallet size={20} className="text-purple-600" /></div>
              <div>
                <div className="font-body text-xl font-bold text-purple-600">{stats.avoir.toFixed(0)}€</div>
                <div className="font-body text-xs text-gray-600">Avoir</div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ─── Cartes de séances ─── */}
      {cards.length > 0 && (
        <>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4">Mes cartes</h2>
          <div className="flex flex-col gap-3 mb-8">
            {cards.map(card => {
              const pct = card.totalSessions > 0 ? (card.remainingSessions / card.totalSessions) * 100 : 0;
              const expired = card.dateFin && new Date(card.dateFin) < new Date();
              if (expired) return null;
              const isOpen = openCardId === card.id;
              return (
                <Card key={card.id} padding="md">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: card.familiale ? "linear-gradient(135deg,#FFF8E8,#FAECC0)" : "#FFF8E8" }}>
                        {card.familiale ? "👨‍👩‍👧" : "🎟️"}
                      </div>
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">
                          Carte {card.totalSessions} séances · {card.activityType === "balade" ? "Balades" : "Cours"}
                        </div>
                        <div className="font-body text-xs text-gray-600">
                          {card.familiale ? "Carte familiale" : card.childName}
                        </div>
                      </div>
                    </div>
                    <Badge color={card.remainingSessions > 2 ? "green" : "orange"}>
                      {card.remainingSessions}/{card.totalSessions}
                    </Badge>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-body text-[10px] text-gray-600">{card.usedSessions} utilisée{card.usedSessions > 1 ? "s" : ""}</span>
                    <span className="font-body text-[10px] font-semibold text-gold-500">{card.remainingSessions} restante{card.remainingSessions > 1 ? "s" : ""}</span>
                  </div>
                  {(card.history || []).length > 0 && (
                    <button onClick={() => setOpenCardId(isOpen ? null : card.id)}
                      className="w-full font-body text-[10px] text-gray-500 bg-transparent border-none cursor-pointer pt-2 hover:text-blue-500">
                      {isOpen ? "▲ Masquer" : `▼ Historique (${(card.history || []).filter((h: any) => !h.credit && h.presence !== "absent").length})`}
                    </button>
                  )}
                  {isOpen && (
                    <div className="flex flex-col gap-1 mt-2">
                      {[...(card.history || [])].reverse().slice(0, 5).map((h: any, i: number) => (
                        <div key={i} className={`flex items-center justify-between px-2 py-1 rounded text-[10px] font-body ${h.credit ? "bg-green-50" : "bg-sand"}`}>
                          <span className="text-blue-800">{h.activityTitle || "Séance"} · {h.date ? new Date(h.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span>
                          <span className={h.credit ? "text-green-500 font-semibold" : "text-gold-500"}>{h.credit ? "+1" : "✓"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Fidélité ─── */}
      {fideliteSettings?.enabled && (
        <>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4">🏆 Fidélité</h2>
          <div className="flex flex-col gap-3 mb-8">
            <Card padding="md" className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-yellow-400 flex items-center justify-center text-2xl flex-shrink-0">🏆</div>
                <div className="flex-1">
                  <div className="font-body text-[10px] text-yellow-600 uppercase font-semibold tracking-wider">Solde de points</div>
                  <div className="font-display text-3xl font-bold text-yellow-700">{fidelite?.points || 0}</div>
                  <div className="font-body text-[10px] text-yellow-600">
                    = {((fidelite?.points || 0) / (fideliteSettings.taux || 50)).toFixed(2)}€ de réduction
                  </div>
                </div>
              </div>
            </Card>

            {(fidelite?.points || 0) >= (fideliteSettings.minPoints || 500) ? (
              <Card padding="md">
                <button
                  disabled={convertingPoints}
                  onClick={async () => {
                    if (!user || !fidelite) return;
                    const taux = fideliteSettings.taux || 50;
                    const montant = Math.floor(fidelite.points / taux * 100) / 100;
                    const pts = Math.floor(montant * taux);
                    if (!confirm(`Convertir ${pts} points en ${montant.toFixed(2)}€ d'avoir ?`)) return;
                    setConvertingPoints(true);
                    try {
                      const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
                      await addDoc(collection(db, "avoirs"), {
                        familyId: user.uid, familyName: fidelite.familyName || "", type: "avoir",
                        amount: montant, usedAmount: 0, remainingAmount: montant,
                        reason: `Conversion fidélité (${pts} pts)`, reference: `FID-${Date.now().toString(36).toUpperCase()}`,
                        sourceType: "fidelite", status: "actif", expiryDate: expiry, usageHistory: [], createdAt: serverTimestamp(),
                      });
                      const newPts = (fidelite.points || 0) - pts;
                      await updateDoc(doc(db, "fidelite", user.uid), {
                        points: newPts,
                        history: [...(fidelite.history || []), { date: new Date().toISOString(), points: -pts, type: "conversion", label: `Avoir ${montant.toFixed(2)}€` }],
                        updatedAt: serverTimestamp(),
                      });
                      setFidelite({ ...fidelite, points: newPts });
                      alert(`✅ ${montant.toFixed(2)}€ d'avoir créé !`);
                    } catch (e) { console.error(e); alert("Erreur."); }
                    setConvertingPoints(false);
                  }}
                  className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-yellow-500 border-none cursor-pointer hover:bg-yellow-600 disabled:opacity-50">
                  {convertingPoints ? "..." : `Convertir en avoir — ${((fidelite?.points || 0) / (fideliteSettings.taux || 50)).toFixed(2)}€`}
                </button>
              </Card>
            ) : (
              <Card padding="sm">
                <div className="font-body text-xs text-gray-500 mb-2">
                  Encore <strong>{(fideliteSettings.minPoints || 500) - (fidelite?.points || 0)} pts</strong> avant conversion
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-yellow-400" style={{ width: `${Math.min(100, ((fidelite?.points || 0) / (fideliteSettings.minPoints || 500)) * 100)}%` }} />
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Quick actions */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4">
        Actions rapides
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/espace-cavalier/reserver", icon: "📅", label: "Réserver une activité" },
          { href: "/espace-cavalier/reserver?filter=balade", icon: "🌅", label: "Réserver une balade" },
          { href: "/espace-cavalier/inscription-annuelle", icon: "📋", label: "Inscription annuelle" },
          { href: "/espace-cavalier/factures", icon: "🧾", label: "Mes factures" },
          { href: "/espace-cavalier/profil", icon: "👨‍👩‍👧‍👦", label: "Ma famille" },
        ].map((action, i) => (
          <Link key={i} href={action.href} className="no-underline">
            <Card
              hover
              padding="sm"
              className="text-center !py-5"
            >
              <span className="text-2xl block mb-2">{action.icon}</span>
              <span className="font-body text-xs font-semibold text-blue-800">
                {action.label}
              </span>
            </Card>
          </Link>
        ))}
      </div>

      {/* Family members */}
      {family && family.children.length > 0 && (
        <>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4 mt-10">
            Vos cavaliers
          </h2>
          <div className="flex flex-col gap-3">
            {family.children.map((child) => (
              <Card key={child.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">
                      🧒
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">
                        {child.firstName}
                      </div>
                      <div className="font-body text-xs text-gray-600">
                        Niveau : {child.galopLevel || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                      {child.galopLevel && child.galopLevel !== "—"
                        ? `Galop ${child.galopLevel}`
                        : "Débutant"}
                    </Badge>
                    {child.sanitaryForm ? (
                      <Badge color="green">Fiche OK</Badge>
                    ) : (
                      <Badge color="red">Fiche manquante</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
