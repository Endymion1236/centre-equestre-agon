"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Calendar, Clock, Users, Loader2, ShoppingCart, ChevronLeft, ChevronRight, X, Check, CreditCard } from "lucide-react";

interface Creneau { id: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; enrolledCount: number; priceHT: number; priceTTC?: number; tvaTaux: number; }

interface CartItem { creneauIds: string[]; activityTitle: string; dates: string; childId: string; childName: string; prixBase: number; remiseEuros: number; rang: number; prixFinal: number; isStage: boolean; }

const typeLabels: Record<string, { label: string; color: string }> = {
  stage: { label: "Stage", color: "#27ae60" }, stage_journee: { label: "Stage", color: "#16a085" },
  balade: { label: "Balade", color: "#e67e22" }, cours: { label: "Cours", color: "#2050A0" },
  competition: { label: "Compet.", color: "#7c3aed" }, anniversaire: { label: "Anniv.", color: "#D63031" },
};

export default function ReserverPage() {
  const { user, family } = useAuth();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCreneau, setSelectedCreneau] = useState<Creneau | null>(null);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [depositMode, setDepositMode] = useState<"full" | "deposit">("full");
  const [success, setSuccess] = useState(false);

  const children = family?.children || [];
  const familyId = user?.uid || "";

  const startDate = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7); return d; }, [weekOffset]);
  const endDate = useMemo(() => { const d = new Date(startDate); d.setDate(d.getDate() + 27); return d; }, [startDate]); // 4 semaines
  const fmtDate = (d: Date) => d.toISOString().split("T")[0];

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", fmtDate(startDate)), where("date", "<=", fmtDate(endDate))));
        setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetch();
  }, [weekOffset]);

  // Créneaux disponibles filtrés
  const available = useMemo(() => {
    const now = new Date(); const todayStr = fmtDate(now);
    let result = creneaux.filter(c => {
      if (c.date < todayStr) return false;
      return (c.enrolled?.length || 0) < c.maxPlaces;
    });
    if (filter !== "all") result = result.filter(c => c.activityType === filter);
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [creneaux, filter]);

  // Grouper les stages par titre + semaine
  const stageGroups = useMemo(() => {
    const stages = available.filter(c => c.activityType === "stage" || c.activityType === "stage_journee");
    const groups: Record<string, Creneau[]> = {};
    stages.forEach(c => {
      const d = new Date(c.date);
      const mon = new Date(d); mon.setDate(mon.getDate() - ((d.getDay() + 6) % 7));
      const key = `${c.activityTitle}_${fmtDate(mon)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [available]);

  // Cours (non-stage)
  const coursCreneaux = useMemo(() => available.filter(c => c.activityType !== "stage" && c.activityType !== "stage_journee"), [available]);
  const coursByDate = useMemo(() => {
    const g: Record<string, Creneau[]> = {};
    coursCreneaux.forEach(c => { if (!g[c.date]) g[c.date] = []; g[c.date].push(c); });
    return g;
  }, [coursCreneaux]);

  // Compteur d'inscriptions stage famille (pour réductions)
  const existingStageCount = useMemo(() => {
    // Compter les inscriptions UNIQUES (enfant + titre stage) pour cette famille
    const uniqueInscriptions = new Set<string>();
    creneaux.filter(c => c.activityType === "stage" || c.activityType === "stage_journee").forEach(c => {
      (c.enrolled || []).filter((e: any) => e.familyId === familyId).forEach((e: any) => {
        uniqueInscriptions.add(`${e.childId}_${c.activityTitle}`);
      });
    });
    // Ajouter les items stage dans le panier (déjà uniques par enfant+stage)
    cart.filter(i => i.isStage).forEach(i => {
      uniqueInscriptions.add(`${i.childId}_${i.activityTitle}`);
    });
    return uniqueInscriptions.size;
  }, [creneaux, familyId, cart]);

  const isStage = (c: Creneau) => c.activityType === "stage" || c.activityType === "stage_journee";

  // Ajouter au panier (stage = multi-enfants, cours = 1 enfant)
  const addStageToCart = (stageCreneaux: Creneau[]) => {
    if (selectedChildren.length === 0) return;
    const first = stageCreneaux[0];
    const prixBase = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
    const dates = stageCreneaux.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short" })).join(", ");

    const newItems: CartItem[] = selectedChildren.map((childId, idx) => {
      const child = children.find((c: any) => c.id === childId);
      const rang = existingStageCount + idx;
      const remise = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
      return {
        creneauIds: stageCreneaux.map(c => c.id),
        activityTitle: first.activityTitle,
        dates: `${stageCreneaux.length} jours (${dates})`,
        childId,
        childName: (child as any)?.firstName || "?",
        prixBase: Math.round(prixBase * 100) / 100,
        remiseEuros: remise,
        rang: rang + 1,
        prixFinal: Math.max(0, Math.round((prixBase - remise) * 100) / 100),
        isStage: true,
      };
    });

    setCart([...cart, ...newItems]);
    setSelectedChildren([]);
    setSelectedCreneau(null);
    setShowCart(true);
  };

  const addCoursToCart = (creneau: Creneau, childId: string) => {
    const child = children.find((c: any) => c.id === childId);
    const priceTTC = (creneau as any).priceTTC || creneau.priceHT * (1 + (creneau.tvaTaux || 5.5) / 100);
    setCart([...cart, {
      creneauIds: [creneau.id],
      activityTitle: creneau.activityTitle,
      dates: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      childId,
      childName: (child as any)?.firstName || "?",
      prixBase: Math.round(priceTTC * 100) / 100,
      remiseEuros: 0,
      rang: 0,
      prixFinal: Math.round(priceTTC * 100) / 100,
      isStage: false,
    }]);
    setSelectedCreneau(null);
    setSelectedChildren([]);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  const cartTotal = cart.reduce((s, i) => s + i.prixFinal, 0);
  const cartTotalReductions = cart.reduce((s, i) => s + i.remiseEuros, 0);

  // Paiement
  const handlePay = async () => {
    if (cart.length === 0 || !family || !user) return;
    setPaying(true);
    try {
      // 1. Inscrire chaque enfant dans chaque créneau
      for (const item of cart) {
        for (const cid of item.creneauIds) {
          const creneau = creneaux.find(c => c.id === cid);
          if (!creneau) continue;
          const enrolled = creneau.enrolled || [];
          if (enrolled.some((e: any) => e.childId === item.childId)) continue;
          await updateDoc(doc(db, "creneaux", cid), {
            enrolled: [...enrolled, { childId: item.childId, childName: item.childName, familyId: user.uid, familyName: family.parentName, enrolledAt: new Date().toISOString() }],
            enrolledCount: enrolled.length + 1,
          });
        }
        // Réservation
        await addDoc(collection(db, "reservations"), {
          familyId: user.uid, familyName: family.parentName,
          childId: item.childId, childName: item.childName,
          activityTitle: item.activityTitle, activityType: item.isStage ? "stage" : "cours",
          creneauId: item.creneauIds[0], date: item.dates,
          priceTTC: item.prixFinal, status: "confirmed", source: "client",
          createdAt: serverTimestamp(),
        });
      }

      // 2. Créer le paiement pending
      await addDoc(collection(db, "payments"), {
        familyId: user.uid, familyName: family.parentName,
        items: cart.map(i => ({
          activityTitle: `${i.activityTitle} — ${i.childName}${i.remiseEuros > 0 ? ` (-${i.remiseEuros}€)` : ""}`,
          childId: i.childId,
          childName: i.childName,
          creneauId: i.creneauIds[0],
          stageKey: i.isStage ? `${i.activityTitle}_${i.dates}` : undefined,
          activityType: i.isStage ? "stage" : "cours",
          priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
        })),
        totalTTC: cartTotal,
        paymentMode: "", paymentRef: "",
        status: "pending", paidAmount: 0,
        source: "client",
        date: serverTimestamp(),
      });

      // 3. Stripe checkout (paiement unique ou acompte)
      const hasStage = cart.some(i => i.isStage);
      const isDeposit = hasStage && depositMode === "deposit";
      const stageDate = hasStage ? cart.find(i => i.isStage)?.dates || "" : "";
      
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: user.uid,
            familyEmail: family.parentEmail || user.email,
            familyName: family.parentName,
            depositPercent: isDeposit ? 30 : undefined,
            stageDate,
            items: cart.map(i => ({
              name: `${i.activityTitle} — ${i.childName}`,
              description: i.dates || undefined,
              priceInCents: Math.round(i.prixFinal * 100),
              quantity: 1,
            })),
          }),
        });
        const data = await res.json();
        if (data.url) { window.location.href = data.url; return; }
      } catch (e) { console.error("Stripe error:", e); }

      // Fallback sans Stripe
      setCart([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (e) { console.error(e); alert("Erreur. Veuillez réessayer."); }
    setPaying(false);
  };

  const spotsLeft = (c: Creneau) => c.maxPlaces - (c.enrolled?.length || 0);

  if (!user || !family) return (
    <div className="text-center py-20">
      <Card padding="lg"><p className="font-body text-sm text-gray-500">Connectez-vous et complétez votre profil pour réserver.</p></Card>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Réserver</h1>
          <p className="font-body text-xs text-gray-400">Stages, cours ponctuels et activités</p>
        </div>
        <button onClick={() => setShowCart(true)} className="relative flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <ShoppingCart size={16} /> Panier
          {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{cart.length}</span>}
        </button>
      </div>

      {success && <Card padding="md" className="mb-4 bg-green-50 border-green-200"><p className="font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> Inscription confirmée ! Rendez-vous au centre équestre.</p></Card>}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["all", "Tout"], ["stage", "Stages"], ["cours", "Cours"], ["balade", "Balades"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-4 py-2 rounded-lg border font-body text-xs font-semibold cursor-pointer ${filter === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{label}</button>
        ))}
      </div>

      {/* Navigation semaines */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setWeekOffset(w => w - 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /></button>
        <div className="text-center">
          <div className="font-body text-sm font-semibold text-blue-800">{startDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — {endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronRight size={16} /></button>
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <div className="flex flex-col gap-6">
          {/* STAGES */}
          {(filter === "all" || filter === "stage") && Object.entries(stageGroups).length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-green-700 mb-3">Stages</h2>
              <div className="flex flex-col gap-3">
                {Object.entries(stageGroups).map(([key, stageCreneaux]) => {
                  const first = stageCreneaux[0];
                  const prix = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
                  const spots = Math.min(...stageCreneaux.map(spotsLeft));
                  const jours = stageCreneaux.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })).join(", ");
                  const isSelected = selectedCreneau?.id === first.id;

                  return (
                    <Card key={key} padding="md" className={isSelected ? "ring-2 ring-green-500" : ""}>
                      <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedCreneau(isSelected ? null : first); setSelectedChildren([]); }}>
                        <div>
                          <div className="font-body text-base font-semibold text-blue-800">{first.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400 mt-1">
                            <Calendar size={12} className="inline mr-1" />{jours}
                            <span className="ml-3"><Clock size={12} className="inline mr-1" />{first.startTime}–{first.endTime}</span>
                            <span className="ml-3"><Users size={12} className="inline mr-1" />{first.monitor}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-body text-lg font-bold text-green-600">{prix.toFixed(0)}€</div>
                          <div className="font-body text-[10px] text-gray-400">{stageCreneaux.length} jours</div>
                          <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots} place{spots > 1 ? "s" : ""}</Badge>
                        </div>
                      </div>

                      {/* Sélection enfants pour ce stage */}
                      {isSelected && spots > 0 && (
                        <div className="mt-4 pt-4 border-t border-green-200">
                          <div className="font-body text-xs font-semibold text-green-700 mb-2">Inscrire vos enfants :</div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {children.filter((c: any) => !(first.enrolled || []).some((e: any) => e.childId === c.id)).map((c: any) => {
                              const sel = selectedChildren.includes(c.id);
                              return (
                                <button key={c.id} onClick={(e) => { e.stopPropagation(); setSelectedChildren(sel ? selectedChildren.filter(x => x !== c.id) : [...selectedChildren, c.id]); }}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200"}`}>
                                  {sel ? <Check size={14} /> : <Users size={14} />} {c.firstName}
                                </button>
                              );
                            })}
                          </div>
                          {/* Récap avec réductions */}
                          {selectedChildren.length > 0 && (
                            <div className="bg-green-50 rounded-lg p-3 mb-3">
                              {selectedChildren.map((childId, idx) => {
                                const child = children.find((c: any) => c.id === childId);
                                const rang = existingStageCount + idx;
                                const remise = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
                                const prixFinal = Math.max(0, prix - remise);
                                return (
                                  <div key={childId} className="flex justify-between font-body text-sm py-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-blue-800 font-semibold">{(child as any)?.firstName}</span>
                                      <span className="text-green-600 text-xs">-{remise}€</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400 line-through text-xs mr-1">{prix.toFixed(0)}€</span>
                                      <span className="font-bold text-green-600">{prixFinal.toFixed(0)}€</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {selectedChildren.length > 0 && (
                            <button onClick={(e) => { e.stopPropagation(); addStageToCart(stageCreneaux); }}
                              className="w-full py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500">
                              Ajouter au panier ({selectedChildren.length} enfant{selectedChildren.length > 1 ? "s" : ""})
                            </button>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* COURS / BALADES */}
          {(filter === "all" || filter === "cours" || filter === "balade") && Object.entries(coursByDate).length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Cours & activités</h2>
              {Object.entries(coursByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, cs]) => (
                <div key={date} className="mb-4">
                  <div className="font-body text-xs font-semibold text-gray-400 uppercase mb-2">{new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
                  <div className="flex flex-col gap-2">
                    {cs.map(c => {
                      const prix = (c as any).priceTTC || c.priceHT * (1 + (c.tvaTaux || 5.5) / 100);
                      const spots = spotsLeft(c);
                      const tl = typeLabels[c.activityType] || { label: c.activityType, color: "#666" };
                      const isSelected = selectedCreneau?.id === c.id;
                      return (
                        <Card key={c.id} padding="sm" className={`cursor-pointer ${isSelected ? "ring-2 ring-blue-500" : ""}`} onClick={() => { setSelectedCreneau(isSelected ? null : c); setSelectedChildren([]); }}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-1 h-10 rounded-full" style={{ backgroundColor: tl.color }} />
                              <div>
                                <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                                <div className="font-body text-xs text-gray-400">{c.startTime}–{c.endTime} · {c.monitor}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-body text-sm font-bold text-blue-500">{prix.toFixed(0)}€</div>
                              <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots} pl.</Badge>
                            </div>
                          </div>
                          {isSelected && spots > 0 && (
                            <div className="mt-3 pt-3 border-t border-blue-100">
                              <div className="font-body text-xs text-gray-400 mb-2">Pour quel enfant ?</div>
                              <div className="flex flex-wrap gap-2">
                                {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                  <button key={ch.id} onClick={(e) => { e.stopPropagation(); addCoursToCart(c, ch.id); }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 font-body text-xs text-blue-800 cursor-pointer hover:bg-blue-100">
                                    <Users size={12} /> {ch.firstName}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {available.length === 0 && <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucune activité disponible sur cette période.</p></Card>}
        </div>
      )}

      {/* PANIER MODAL */}
      {showCart && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-display text-lg font-bold text-blue-800"><ShoppingCart size={18} className="inline mr-2" />Mon panier</h2>
              <button onClick={() => setShowCart(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>
            <div className="p-5">
              {cart.length === 0 ? (
                <p className="font-body text-sm text-gray-400 text-center py-8">Votre panier est vide.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 mb-4">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-sand rounded-lg px-3 py-2.5">
                        <div className="flex-1">
                          <div className="font-body text-sm font-semibold text-blue-800">{item.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400">{item.childName} · {item.dates}</div>
                          {item.remiseEuros > 0 && <div className="font-body text-[10px] text-green-600">Reduction : -{item.remiseEuros}€</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            {item.remiseEuros > 0 && <div className="font-body text-[10px] text-gray-400 line-through">{item.prixBase.toFixed(0)}€</div>}
                            <div className="font-body text-sm font-bold text-blue-500">{item.prixFinal.toFixed(2)}€</div>
                          </div>
                          <button onClick={() => removeFromCart(idx)} className="text-red-400 bg-transparent border-none cursor-pointer p-1 hover:text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totaux */}
                  {cartTotalReductions > 0 && (
                    <div className="flex justify-between font-body text-xs text-green-600 mb-1 px-1">
                      <span>Reductions</span><span>-{cartTotalReductions.toFixed(2)}€</span>
                    </div>
                  )}
                  <div className="flex justify-between font-body text-base font-bold text-blue-800 px-1 mb-4 pt-2 border-t border-gray-200">
                    <span>Total</span><span className="text-green-600">{cartTotal.toFixed(2)}€</span>
                  </div>

                  {/* Choix acompte si stages dans le panier */}
                  {cart.some(i => i.isStage) && (
                    <div className="bg-blue-50 rounded-lg p-3 mb-4">
                      <div className="font-body text-xs font-semibold text-blue-800 mb-2">Mode de paiement</div>
                      <div className="flex gap-2">
                        <button onClick={() => setDepositMode("full")}
                          className={`flex-1 py-2 px-3 rounded-lg font-body text-xs font-semibold border cursor-pointer ${depositMode === "full" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200"}`}>
                          Payer tout ({cartTotal.toFixed(0)}€)
                        </button>
                        <button onClick={() => setDepositMode("deposit")}
                          className={`flex-1 py-2 px-3 rounded-lg font-body text-xs font-semibold border cursor-pointer ${depositMode === "deposit" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-500 border-gray-200"}`}>
                          Acompte 30% ({(cartTotal * 0.3).toFixed(0)}€)
                        </button>
                      </div>
                      {depositMode === "deposit" && (
                        <div className="font-body text-[10px] text-orange-600 mt-2">
                          Le solde de {(cartTotal * 0.7).toFixed(0)}€ sera prélevé automatiquement 3 jours avant le stage sur la même carte.
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={handlePay} disabled={paying}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer ${paying ? "bg-gray-200 text-gray-400" : depositMode === "deposit" ? "bg-orange-500 text-white hover:bg-orange-400" : "bg-green-600 text-white hover:bg-green-500"}`}>
                    {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                    {paying ? "Paiement en cours..." : depositMode === "deposit" ? `Payer l'acompte ${(cartTotal * 0.3).toFixed(2)}€` : `Payer ${cartTotal.toFixed(2)}€`}
                  </button>
                  <p className="font-body text-[10px] text-gray-400 text-center mt-2">Paiement securise par Stripe</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
