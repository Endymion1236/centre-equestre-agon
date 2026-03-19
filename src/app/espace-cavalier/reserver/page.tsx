"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar, Clock, Users, MapPin, Filter, Loader2, ShoppingCart, ChevronLeft, ChevronRight, X, Check } from "lucide-react";

interface Creneau {
  id: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: any[];
  enrolledCount: number;
  priceHT: number;
  tvaTaux: number;
}

interface CartItem {
  creneauId: string;
  activityTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  childId: string;
  childName: string;
  priceTTC: number;
}

const typeLabels: Record<string, { label: string; emoji: string; color: string }> = {
  stage: { label: "Stage", emoji: "🏇", color: "#27ae60" },
  balade: { label: "Balade", emoji: "🌅", color: "#e67e22" },
  cours: { label: "Cours", emoji: "📅", color: "#2050A0" },
  competition: { label: "Compétition", emoji: "🏆", color: "#7c3aed" },
  anniversaire: { label: "Anniversaire", emoji: "🎂", color: "#D63031" },
  ponyride: { label: "Pony ride", emoji: "🐴", color: "#16a085" },
};

export default function ReserverPage() {
  const { user, family } = useAuth();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCreneau, setSelectedCreneau] = useState<Creneau | null>(null);
  const [selectedChild, setSelectedChild] = useState("");
  const [paying, setPaying] = useState(false);
  const [showCart, setShowCart] = useState(false);

  const children = family?.children || [];

  // Get 2 weeks of dates starting from current week + offset
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 14);
    return d;
  }, [weekOffset]);

  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 13);
    return d;
  }, [startDate]);

  const fmtDate = (d: Date) => d.toISOString().split("T")[0];

  useEffect(() => {
    const fetchCreneaux = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "creneaux"),
            where("date", ">=", fmtDate(startDate)),
            where("date", "<=", fmtDate(endDate)),
          )
        );
        setCreneaux(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchCreneaux();
  }, [weekOffset]);

  const filteredCreneaux = useMemo(() => {
    let result = creneaux.filter((c) => {
      const enrolled = c.enrolled || [];
      return enrolled.length < c.maxPlaces; // Only show available
    });
    if (filter !== "all") result = result.filter((c) => c.activityType === filter);
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [creneaux, filter]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Creneau[]> = {};
    filteredCreneaux.forEach((c) => {
      if (!groups[c.date]) groups[c.date] = [];
      groups[c.date].push(c);
    });
    return groups;
  }, [filteredCreneaux]);

  const addToCart = () => {
    if (!selectedCreneau || !selectedChild) return;
    const child = children.find((c: any) => c.id === selectedChild);
    if (!child) return;
    // Check not already in cart
    if (cart.some((i) => i.creneauId === selectedCreneau.id && i.childId === selectedChild)) return;

    const priceTTC = (selectedCreneau.priceHT || 0) * (1 + (selectedCreneau.tvaTaux || 5.5) / 100);

    setCart([...cart, {
      creneauId: selectedCreneau.id,
      activityTitle: selectedCreneau.activityTitle,
      date: selectedCreneau.date,
      startTime: selectedCreneau.startTime,
      endTime: selectedCreneau.endTime,
      childId: selectedChild,
      childName: (child as any).firstName,
      priceTTC: Math.round(priceTTC * 100) / 100,
    }]);
    setSelectedCreneau(null);
    setSelectedChild("");
    setShowCart(true);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  const cartTotal = cart.reduce((s, i) => s + i.priceTTC, 0);

  const handlePay = async () => {
    if (cart.length === 0 || !family || !user) return;
    setPaying(true);
    try {
      // 1. Save reservations in Firestore
      for (const item of cart) {
        // Create reservation
        await addDoc(collection(db, "reservations"), {
          familyId: user.uid,
          familyName: family.parentName,
          childId: item.childId,
          childName: item.childName,
          activityTitle: item.activityTitle,
          activityType: creneaux.find(c => c.id === item.creneauId)?.activityType || "",
          creneauId: item.creneauId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
          priceTTC: item.priceTTC,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });

        // 2. Enroll child in creneau
        const creneau = creneaux.find(c => c.id === item.creneauId);
        if (creneau) {
          const enrolled = [...(creneau.enrolled || []), {
            childId: item.childId,
            childName: item.childName,
            familyId: user.uid,
            familyName: family.parentName,
            enrolledAt: new Date().toISOString(),
          }];
          await updateDoc(doc(db, "creneaux", item.creneauId), {
            enrolled,
            enrolledCount: enrolled.length,
          });
        }
      }

      // 3. Try Stripe payment
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: user.uid,
            familyEmail: family.parentEmail,
            familyName: family.parentName,
            items: cart.map((item) => ({
              name: `${item.activityTitle} — ${item.childName}`,
              description: `${new Date(item.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${item.startTime}–${item.endTime}`,
              priceInCents: Math.round(item.priceTTC * 100),
              quantity: 1,
            })),
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } catch (stripeErr) {
        console.error("Stripe error (non-bloquant):", stripeErr);
      }

      // If Stripe fails or no URL, redirect manually with success
      setCart([]);
      window.location.href = "/espace-cavalier/reservations?success=true";
    } catch (e) {
      console.error("Erreur réservation:", e);
      alert("Erreur lors de la réservation. Veuillez réessayer.");
    }
    setPaying(false);
  };

  const spotsLeft = (c: Creneau) => c.maxPlaces - (c.enrolled?.length || 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Réserver une activité</h1>
          <p className="font-body text-sm text-gray-400 mt-1">Choisissez vos créneaux et payez en ligne en toute sécurité.</p>
        </div>
        {cart.length > 0 && (
          <button onClick={() => setShowCart(!showCart)}
            className="relative flex items-center gap-2 font-body text-sm font-semibold text-white bg-gold-400 px-5 py-2.5 rounded-xl border-none cursor-pointer hover:bg-gold-300 transition-all">
            <ShoppingCart size={16} /> Panier
            <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {cart.length}
            </span>
          </button>
        )}
      </div>

      {/* No children alert */}
      {children.length === 0 && (
        <Card className="!bg-gold-50 !border-gold-400/15 mb-5" padding="sm">
          <div className="font-body text-sm text-blue-800">
            ⚠️ <strong>Profil incomplet</strong> — Ajoutez vos enfants dans{" "}
            <a href="/espace-cavalier/profil" className="text-blue-500 font-semibold no-underline">votre profil</a>{" "}
            avant de réserver.
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: "all", label: "Toutes", emoji: "" }, ...Object.entries(typeLabels).map(([id, t]) => ({ id, label: t.label, emoji: t.emoji }))].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full border font-body text-sm font-medium cursor-pointer transition-all
              ${filter === f.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"}`}>
            {f.emoji && <span className="mr-1">{f.emoji}</span>}{f.label}
          </button>
        ))}
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
          <ChevronLeft size={16} /> 2 semaines préc.
        </button>
        <div className="font-body text-sm font-semibold text-blue-800">
          {startDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — {endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </div>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
          2 semaines suiv. <ChevronRight size={16} />
        </button>
      </div>

      {/* Creneaux list */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-4xl block mb-3">📅</span>
          <p className="font-body text-sm text-gray-500 mb-2">Aucun créneau disponible sur cette période.</p>
          <p className="font-body text-xs text-gray-400">Essayez une autre période ou un autre type d&apos;activité.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groupedByDate).map(([date, creneauxForDay]) => (
            <div key={date}>
              <div className="font-body text-sm font-bold text-blue-800 mb-3 capitalize flex items-center gap-2">
                <Calendar size={14} />
                {new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {creneauxForDay.map((c) => {
                  const type = typeLabels[c.activityType] || { label: c.activityType, emoji: "📌", color: "#666" };
                  const spots = spotsLeft(c);
                  const priceTTC = (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);
                  const inCart = cart.some((i) => i.creneauId === c.id);

                  return (
                    <div key={c.id}
                      className={`card !p-0 overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${inCart ? "ring-2 ring-gold-400" : ""}`}
                      style={{ borderLeftWidth: 4, borderLeftColor: type.color }}>
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-body text-base font-semibold text-blue-800">
                              {type.emoji} {c.activityTitle}
                            </div>
                            <div className="flex items-center gap-3 mt-1 font-body text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Clock size={12} />{c.startTime} – {c.endTime}</span>
                              <span>{c.monitor}</span>
                            </div>
                          </div>
                          {priceTTC > 0 && (
                            <div className="font-body text-lg font-bold text-blue-500">
                              {priceTTC.toFixed(0)}€
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>
                            {spots > 0 ? `${spots} place${spots > 1 ? "s" : ""} restante${spots > 1 ? "s" : ""}` : "COMPLET"}
                          </Badge>
                          {inCart ? (
                            <Badge color="gold">✓ Dans le panier</Badge>
                          ) : spots > 0 && children.length > 0 ? (
                            <button onClick={() => { setSelectedCreneau(c); setSelectedChild(""); }}
                              className="font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-400 transition-colors">
                              Réserver
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Child Selection Modal ─── */}
      {selectedCreneau && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedCreneau(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-blue-800">{selectedCreneau.activityTitle}</h3>
                <p className="font-body text-xs text-gray-400 mt-1">
                  {new Date(selectedCreneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  {" · "}{selectedCreneau.startTime}–{selectedCreneau.endTime}
                </p>
              </div>
              <button onClick={() => setSelectedCreneau(null)} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>

            <div className="font-body text-sm font-semibold text-blue-800 mb-3">Pour quel cavalier ?</div>
            <div className="flex flex-col gap-2 mb-5">
              {children.map((c: any) => {
                const alreadyEnrolled = (selectedCreneau.enrolled || []).some((e: any) => e.childId === c.id);
                const alreadyInCart = cart.some((i) => i.creneauId === selectedCreneau.id && i.childId === c.id);
                const disabled = alreadyEnrolled || alreadyInCart;

                return (
                  <button key={c.id} onClick={() => !disabled && setSelectedChild(c.id)}
                    disabled={disabled}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left cursor-pointer transition-all
                      ${disabled ? "bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed" : selectedChild === c.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🧒</span>
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{c.firstName}</div>
                        <div className="font-body text-xs text-gray-400">{c.galopLevel && c.galopLevel !== "—" ? `Galop ${c.galopLevel}` : "Débutant"}</div>
                      </div>
                    </div>
                    {alreadyEnrolled && <Badge color="gray">Déjà inscrit</Badge>}
                    {alreadyInCart && <Badge color="gold">Dans le panier</Badge>}
                    {!disabled && selectedChild === c.id && <Check size={18} className="text-blue-500" />}
                  </button>
                );
              })}
            </div>

            <button onClick={addToCart} disabled={!selectedChild}
              className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all
                ${!selectedChild ? "bg-gray-200 text-gray-400" : "bg-gold-400 text-blue-800 hover:bg-gold-300"}`}>
              Ajouter au panier
            </button>
          </div>
        </div>
      )}

      {/* ─── Cart Sidebar ─── */}
      {showCart && cart.length > 0 && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex justify-end" onClick={() => setShowCart(false)}>
          <div className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Cart header */}
            <div className="p-5 border-b border-blue-500/8 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2">
                <ShoppingCart size={18} /> Mon panier
              </h3>
              <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-auto p-5">
              <div className="flex flex-col gap-3">
                {cart.map((item, i) => (
                  <div key={i} className="bg-sand rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{item.activityTitle}</div>
                        <div className="font-body text-xs text-gray-400 mt-0.5">
                          🧒 {item.childName}
                        </div>
                        <div className="font-body text-xs text-gray-400">
                          {new Date(item.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                          {" · "}{item.startTime}–{item.endTime}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-body text-base font-bold text-blue-500">{item.priceTTC.toFixed(2)}€</span>
                        <button onClick={() => removeFromCart(i)}
                          className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><X size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart footer */}
            <div className="p-5 border-t border-blue-500/8">
              <div className="flex justify-between items-center mb-4">
                <span className="font-body text-base font-bold text-blue-800">Total</span>
                <span className="font-body text-2xl font-bold text-blue-500">{cartTotal.toFixed(2)}€</span>
              </div>
              <button onClick={handlePay} disabled={paying}
                className="w-full py-4 rounded-xl font-body text-base font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300 transition-all flex items-center justify-center gap-2">
                {paying ? <Loader2 size={18} className="animate-spin" /> : <span>💳</span>}
                {paying ? "Redirection vers le paiement..." : "Payer par carte bancaire"}
              </button>
              <p className="font-body text-[11px] text-gray-400 text-center mt-3">
                Paiement sécurisé par Stripe. Annulation gratuite 72h avant.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
