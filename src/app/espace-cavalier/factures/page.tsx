"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Loader2, Receipt, CreditCard, Ticket, Download } from "lucide-react";

interface Payment {
  id: string;
  familyId: string;
  familyName: string;
  items: { activityTitle: string; priceHT: number; tva: number; priceTTC: number }[];
  totalTTC: number;
  paymentMode: string;
  paidAmount: number;
  status: string;
  date: any;
}

interface Reservation {
  id: string;
  familyId: string;
  activityTitle: string;
  childName: string;
  date: string;
  startTime: string;
  endTime: string;
  priceTTC: number;
  status: string;
  source: string;
  createdAt: any;
}

interface Card10 {
  id: string;
  familyId: string;
  childName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  priceTTC: number;
  status: string;
  activityType?: string;
  dateDebut?: string;
  dateFin?: string;
  history?: any[];
  createdAt: any;
}

const modeLabels: Record<string, string> = {
  cb_terminal: "CB", cb_online: "Stripe", cheque: "Chèque", especes: "Espèces",
  cheque_vacances: "Chq. Vac.", pass_sport: "Pass'Sport", ancv: "ANCV",
  virement: "Virement", avoir: "Avoir", carte: "Carte", prelevement_sepa: "🏦 SEPA",
};

export default function FacturesPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cards, setCards] = useState<Card10[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOnline, setPayingOnline] = useState<string | null>(null);
  const [declaringPayment, setDeclaringPayment] = useState<Payment | null>(null); // modal déclaration
  const [declareMode, setDeclareMode] = useState<"cheque" | "especes">("cheque");
  const [declareMontant, setDeclareMontant] = useState("");
  const [declareNote, setDeclareNote] = useState("");
  const [declareSending, setDeclareSending] = useState(false);
  const [declareSuccess, setDeclareSuccess] = useState(false); // paymentId en cours
  const [tab, setTab] = useState<"factures" | "reservations" | "cartes" | "fidelite">("factures");
  const [clientAvoirs, setClientAvoirs] = useState<any[]>([]);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [fidelite, setFidelite] = useState<any>(null);
  const [fideliteSettings, setFideliteSettings] = useState<{ taux: number; minPoints: number; enabled: boolean } | null>(null);
  const [convertingPoints, setConvertingPoints] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      // Payments - try with familyId filter, fallback to loading all
      try {
        const pSnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", user.uid)));
        setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Payment[]);
      } catch {
        try {
          // Fallback: load all and filter client-side
          const pSnap = await getDocs(collection(db, "payments"));
          setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)).filter(p => p.familyId === user.uid));
        } catch { setPayments([]); }
      }

      // Reservations
      try {
        const rSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
        setReservations(rSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Reservation[]);
      } catch {
        try {
          const rSnap = await getDocs(collection(db, "reservations"));
          setReservations(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation)).filter(r => r.familyId === user.uid));
        } catch { setReservations([]); }
      }

      // Cards
      try {
        const cSnap = await getDocs(query(collection(db, "cartes"), where("familyId", "==", user.uid)));
        setCards(cSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Card10[]);
      } catch {
        try {
          const cSnap = await getDocs(collection(db, "cartes"));
          setCards(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Card10)).filter(c => c.familyId === user.uid));
        } catch { setCards([]); }
      }

      // Avoirs
      try {
        const aSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
        setClientAvoirs(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        try {
          const aSnap = await getDocs(collection(db, "avoirs"));
          setClientAvoirs(aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.familyId === user.uid));
        } catch { setClientAvoirs([]); }
      }

      // Fidélité
      try {
        const [fidSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, "fidelite", user.uid)),
          getDoc(doc(db, "settings", "fidelite")),
        ]);
        if (fidSnap.exists()) setFidelite({ id: fidSnap.id, ...fidSnap.data() });
        if (settingsSnap.exists()) setFideliteSettings(settingsSnap.data() as any);
      } catch { /* pas de fidélité */ }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
  const sortedPayments = [...payments].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  const sortedReservations = [...reservations].sort((a, b) => b.date?.localeCompare(a.date) || 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Mes factures & paiements</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Retrouvez l&apos;historique de tous vos paiements et réservations.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {([["factures", "Paiements", Receipt], ["reservations", "Réservations", CreditCard]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all whitespace-nowrap
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
            {id === "factures" && payments.length > 0 && <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full">{payments.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* ─── Paiements ─── */}
          {tab === "factures" && (
            <div>
              {/* Mon compte — résumé financier */}
              {(() => {
                const activePayments = payments.filter(p => p.status !== "cancelled");
                const totalFacture = activePayments.reduce((s, p) => s + (p.totalTTC || 0), 0);
                const totalPaye = activePayments.reduce((s, p) => s + (p.paidAmount || 0), 0);
                const resteDu = totalFacture - totalPaye;
                const totalAvoir = clientAvoirs.filter((a: any) => a.status === "actif").reduce((s: number, a: any) => s + (a.remainingAmount || 0), 0);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <Card padding="sm" className="text-center">
                      <div className="font-body text-xl font-bold text-blue-500">{totalFacture.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-gray-600 uppercase">Total facturé</div>
                    </Card>
                    <Card padding="sm" className="text-center bg-green-50">
                      <div className="font-body text-xl font-bold text-green-600">{totalPaye.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-gray-600 uppercase">Payé</div>
                    </Card>
                    <Card padding="sm" className={`text-center ${resteDu > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <div className={`font-body text-xl font-bold ${resteDu > 0 ? "text-red-500" : "text-green-600"}`}>{resteDu.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-gray-600 uppercase">Reste dû</div>
                    </Card>
                    {totalAvoir > 0 && (
                      <Card padding="sm" className="text-center bg-purple-50">
                        <div className="font-body text-xl font-bold text-purple-600">{totalAvoir.toFixed(2)}€</div>
                        <div className="font-body text-[10px] text-purple-500 uppercase">Avoir</div>
                      </Card>
                    )}
                  </div>
                );
              })()}

              {sortedPayments.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Receipt size={28} className="text-blue-300" /></div>
                  <p className="font-body text-sm text-gray-500">Aucun paiement enregistré.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedPayments.map(p => {
                    const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                    return (
                      <Card key={p.id} padding="md">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center">
                              <div className="font-body text-[10px] font-bold text-blue-500">{d.toLocaleDateString("fr-FR", { month: "short" })}</div>
                              <div className="font-body text-lg font-bold text-blue-800">{d.getDate()}</div>
                            </div>
                            <div>
                              <div className="font-body text-sm font-semibold text-blue-800">
                                {(p.items || []).map(i => i.activityTitle).join(", ") || "Paiement"}
                              </div>
                              <div className="font-body text-xs text-gray-600">
                                {d.toLocaleDateString("fr-FR")} · {modeLabels[p.paymentMode] || p.paymentMode}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-body text-lg font-bold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                            <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "gray"}>
                              {p.status === "paid" ? "Payé" : p.status === "partial" ? "Partiel" : "En attente"}
                            </Badge>
                            {(p.status === "pending" || p.status === "partial") && (
                              <>
                                <button
                                  disabled={payingOnline === p.id}
                                  onClick={async () => {
                                    setPayingOnline(p.id!);
                                    try {
                                      const restant = (p.totalTTC || 0) - (p.paidAmount || 0);
                                      const res = await fetch("/api/stripe/checkout", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          familyId: user?.uid,
                                          familyEmail: user?.email,
                                          familyName: p.familyName,
                                          paymentId: p.id,
                                          items: [{
                                            name: (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation",
                                            priceInCents: Math.round(restant * 100),
                                            quantity: 1,
                                          }],
                                        }),
                                      });
                                      const data = await res.json();
                                      if (data.url) window.location.href = data.url;
                                    } catch (e) { console.error(e); }
                                    setPayingOnline(null);
                                  }}
                                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                                  {payingOnline === p.id ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                                  CB
                                </button>
                                <button
                                  onClick={() => {
                                    setDeclaringPayment(p);
                                    setDeclareMontant(((p.totalTTC || 0) - (p.paidAmount || 0)).toFixed(2));
                                    setDeclareMode("cheque");
                                    setDeclareNote("");
                                    setDeclareSuccess(false);
                                  }}
                                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                                  ✉️ Déclarer
                                </button>
                              </>
                            )}
                            <button onClick={async () => {
                              const d2 = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                              const items = p.items || [];
                              const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                              const totalTTC = p.totalTTC || 0;
                              const totalTVA = totalTTC - totalHT;
                              const invoiceNumber = (p as any).orderId || `F-${d2.getFullYear()}${String(d2.getMonth()+1).padStart(2,"0")}-${(p.id || "").slice(-4).toUpperCase()}`;
                              try {
                                const res = await fetch("/api/invoice", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    invoiceNumber,
                                    date: d2.toLocaleDateString("fr-FR"),
                                    familyName: p.familyName,
                                    familyEmail: "",
                                    items: items.map((i: any) => ({ ...i, childName: i.childName || "" })),
                                    totalHT, totalTVA, totalTTC,
                                    paidAmount: p.paidAmount || 0,
                                    paymentMode: modeLabels[p.paymentMode] || p.paymentMode || "",
                                    paymentDate: p.paidAmount > 0 ? d2.toLocaleDateString("fr-FR") : "",
                                  }),
                                });
                                const data = await res.json();
                                if (data.html) {
                                  const w = window.open("", "_blank");
                                  if (w) { w.document.write(data.html); w.document.close(); w.print(); }
                                }
                              } catch (e) { console.error(e); }
                            }}
                              className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none"
                              title="Télécharger le reçu">
                              <Download size={14} />
                            </button>
                          </div>
                        </div>
                        {/* Detail items */}
                        {(p.items || []).length > 1 && (
                          <div className="mt-3 pt-3 border-t border-blue-500/8">
                            {(p.items || []).map((item, i) => (
                              <div key={i} className="flex justify-between font-body text-xs text-gray-500 py-1">
                                <span>{item.activityTitle}</span>
                                <span>{item.priceTTC?.toFixed(2)}€</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Réservations ─── */}
          {tab === "reservations" && (
            <div>
              {sortedReservations.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <span className="text-4xl block mb-3">📋</span>
                  <p className="font-body text-sm text-gray-500 mb-3">Aucune réservation.</p>
                  <a href="/espace-cavalier/reserver" className="font-body text-sm font-semibold text-blue-500 no-underline">Réserver une activité →</a>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedReservations.map(r => (
                    <Card key={r.id} padding="md">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center">
                            <div className="font-body text-[10px] font-bold text-blue-500">
                              {r.date ? new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short" }) : ""}
                            </div>
                            <div className="font-body text-lg font-bold text-blue-800">
                              {r.date ? new Date(r.date).getDate() : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">{r.activityTitle}</div>
                            <div className="font-body text-xs text-gray-600">
                              🧒 {r.childName} · {r.startTime}–{r.endTime} · {r.date ? new Date(r.date).toLocaleDateString("fr-FR") : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {r.priceTTC > 0 && <span className="font-body text-base font-bold text-blue-500">{r.priceTTC?.toFixed(2)}€</span>}
                          <Badge color={r.status === "confirmed" ? "green" : r.status === "cancelled" ? "red" : "orange"}>
                            {r.status === "confirmed" ? "Confirmée" : r.status === "cancelled" ? "Annulée" : "En attente"}
                          </Badge>
                          {r.source === "admin" && <Badge color="gray">Inscrit par le centre</Badge>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Cartes ─── */}
          {tab === "cartes" && (
            <div>
              {cards.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <span className="text-4xl block mb-3">🎟️</span>
                  <p className="font-body text-sm text-gray-500">Aucune carte de séances. Renseignez-vous au secrétariat !</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  {cards.map(card => {
                    const pct = card.totalSessions > 0 ? (card.remainingSessions / card.totalSessions) * 100 : 0;
                    const expired = (card as any).dateFin && new Date((card as any).dateFin) < new Date();
                    const isOpen = openCardId === card.id;
                    const seancesUtilisees = (card.history || []).filter((h: any) => !h.credit && h.presence !== "absent");
                    return (
                      <Card key={card.id} padding="md">
                        {/* En-tête */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                              style={{ background: (card as any).familiale ? "linear-gradient(135deg,#FFF8E8,#FAECC0)" : "#FFF8E8" }}>
                              {(card as any).familiale ? "👨‍👩‍👧" : "🎟️"}
                            </div>
                            <div>
                              <div className="font-body text-base font-semibold text-blue-800">
                                Carte {card.totalSessions} séances · {(card as any).activityType === "balade" ? "Balades" : "Cours"}
                              </div>
                              {(card as any).familiale ? (
                                <div className="font-body text-xs font-semibold mt-0.5" style={{ color: "#F0A010" }}>
                                  👨‍👩‍👧 Carte familiale — valable pour tous vos cavaliers
                                </div>
                              ) : (
                                <div className="font-body text-xs text-gray-600">🧒 {card.childName}</div>
                              )}
                              {(card as any).dateDebut && (card as any).dateFin && (
                                <div className="font-body text-[10px] text-gray-600 mt-0.5">
                                  {new Date((card as any).dateDebut).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}
                                  {" → "}
                                  {new Date((card as any).dateFin).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}
                                  {expired && <span className="text-red-400 ml-1">· Expirée</span>}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge color={expired || card.status === "used" ? "gray" : card.remainingSessions > 2 ? "green" : "orange"}>
                            {card.remainingSessions}/{card.totalSessions}
                          </Badge>
                        </div>

                        {/* Barre de progression */}
                        <div className="mb-3">
                          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-3 rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="font-body text-xs text-gray-600">{card.usedSessions} utilisée{card.usedSessions > 1 ? "s" : ""}</span>
                            <span className="font-body text-xs font-semibold text-gold-500">{card.remainingSessions} restante{card.remainingSessions > 1 ? "s" : ""}</span>
                          </div>
                        </div>

                        {/* Historique déroulant */}
                        {(card.history || []).length > 0 && (
                          <div className="pt-2 border-t border-gray-100">
                            <button
                              onClick={() => setOpenCardId(isOpen ? null : card.id)}
                              className="w-full flex items-center justify-between font-body text-xs text-gray-600 bg-transparent border-none cursor-pointer py-1 hover:text-blue-500">
                              <span>Historique ({seancesUtilisees.length} séance{seancesUtilisees.length > 1 ? "s" : ""})</span>
                              <span>{isOpen ? "▲ Masquer" : "▼ Voir le détail"}</span>
                            </button>
                            {isOpen && (
                              <div className="flex flex-col gap-1.5 mt-2">
                                {[...(card.history as any[])].reverse().map((h: any, i: number) => (
                                  <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-body ${h.credit ? "bg-green-50" : h.presence === "absent" ? "bg-red-50 opacity-60" : "bg-sand"}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.credit ? "bg-green-400" : h.presence === "absent" ? "bg-red-400" : "bg-gold-400"}`} />
                                      <div className="min-w-0">
                                        <div className="text-blue-800 font-semibold truncate">{h.activityTitle || "Séance"}</div>
                                        <div className="text-gray-600 text-[10px]">
                                          {h.date ? new Date(h.date).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" }) : ""}
                                          {h.horseName ? ` · ${h.horseName}` : ""}
                                          {h.credit ? " · Recrédit" : ""}
                                        </div>
                                      </div>
                                    </div>
                                    <span className={`font-semibold flex-shrink-0 ml-2 ${h.credit ? "text-green-500" : h.presence === "absent" ? "text-red-400" : "text-gold-500"}`}>
                                      {h.credit ? "+1" : h.presence === "absent" ? "Absent" : "Vérifié"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* ─── Fidélité ─── */}
          {tab === "fidelite" && fideliteSettings?.enabled && (
            <div className="flex flex-col gap-4">
              {/* Solde points */}
              <Card padding="md" className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-yellow-400 flex items-center justify-center text-3xl flex-shrink-0">🏆</div>
                  <div className="flex-1">
                    <div className="font-body text-xs text-yellow-600 uppercase font-semibold tracking-wider mb-1">Solde de points</div>
                    <div className="font-display text-4xl font-bold text-yellow-700">{fidelite?.points || 0}</div>
                    <div className="font-body text-xs text-yellow-600 mt-0.5">
                      = {((fidelite?.points || 0) / fideliteSettings.taux).toFixed(2)}€ de réduction disponible
                    </div>
                  </div>
                </div>
              </Card>

              {/* Convertir les points */}
              {(fidelite?.points || 0) >= fideliteSettings.minPoints ? (
                <Card padding="md">
                  <div className="font-body text-sm font-semibold text-blue-800 mb-2">Utiliser mes points</div>
                  <div className="font-body text-xs text-gray-500 mb-4">
                    Vous avez <strong>{fidelite.points} points</strong> soit <strong>{(fidelite.points / fideliteSettings.taux).toFixed(2)}€</strong> de réduction à utiliser sur votre prochaine facture.
                  </div>
                  <button
                    disabled={convertingPoints}
                    onClick={async () => {
                      if (!user) return;
                      if (!confirm(`Convertir ${fidelite.points} points en ${(fidelite.points / fideliteSettings.taux).toFixed(2)}€ d'avoir ?\n\nUn avoir sera ajouté à votre compte.`)) return;
                      setConvertingPoints(true);
                      try {
                        const montantAvoir = Math.floor(fidelite.points / fideliteSettings.taux * 100) / 100;
                        const pointsUtilises = Math.floor(montantAvoir * fideliteSettings.taux);
                        const expiry = new Date();
                        expiry.setFullYear(expiry.getFullYear() + 1);
                        // Créer l'avoir
                        await addDoc(collection(db, "avoirs"), {
                          familyId: user.uid,
                          familyName: fidelite.familyName || "",
                          type: "avoir",
                          amount: montantAvoir,
                          usedAmount: 0,
                          remainingAmount: montantAvoir,
                          reason: `Conversion points fidélité (${pointsUtilises} pts)`,
                          reference: `FIDELITE-${Date.now().toString(36).toUpperCase()}`,
                          sourceType: "fidelite",
                          status: "actif",
                          expiryDate: expiry,
                          usageHistory: [],
                          createdAt: serverTimestamp(),
                        });
                        // Déduire les points
                        const newPoints = (fidelite.points || 0) - pointsUtilises;
                        await updateDoc(doc(db, "fidelite", user.uid), {
                          points: newPoints,
                          history: [...(fidelite.history || []), {
                            date: new Date().toISOString(),
                            points: -pointsUtilises,
                            type: "conversion",
                            label: `Conversion en avoir (${montantAvoir.toFixed(2)}€)`,
                          }],
                          updatedAt: serverTimestamp(),
                        });
                        setFidelite({ ...fidelite, points: newPoints });
                        alert(`✅ ${montantAvoir.toFixed(2)}€ d'avoir créé ! Il apparaît dans vos paiements.`);
                      } catch (e) { console.error(e); alert("Erreur lors de la conversion."); }
                      setConvertingPoints(false);
                    }}
                    className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-yellow-500 border-none cursor-pointer hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    {convertingPoints ? "Conversion en cours..." : `Convertir en avoir — ${(fidelite.points / fideliteSettings.taux).toFixed(2)}€`}
                  </button>
                </Card>
              ) : (
                <Card padding="md" className="text-center">
                  <div className="font-body text-sm text-gray-500 mb-1">
                    Encore <strong className="text-blue-800">{fideliteSettings.minPoints - (fidelite?.points || 0)} points</strong> avant de pouvoir utiliser vos points
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mt-3">
                    <div className="h-full rounded-full bg-yellow-400 transition-all"
                      style={{ width: `${Math.min(100, ((fidelite?.points || 0) / fideliteSettings.minPoints) * 100)}%` }} />
                  </div>
                  <div className="flex justify-between font-body text-[10px] text-gray-600 mt-1">
                    <span>{fidelite?.points || 0} pts</span>
                    <span>{fideliteSettings.minPoints} pts requis</span>
                  </div>
                </Card>
              )}

              {/* Historique des points */}
              {(fidelite?.history || []).length > 0 && (
                <Card padding="md">
                  <div className="font-body text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Historique des points</div>
                  <div className="flex flex-col gap-2">
                    {[...(fidelite.history || [])].reverse().slice(0, 20).map((h: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div>
                          <div className="font-body text-xs font-semibold text-blue-800">{h.label}</div>
                          <div className="font-body text-[10px] text-gray-600">
                            {h.date ? new Date(h.date).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : ""}
                            {h.expiry && h.type === "gain" ? ` · expire le ${new Date(h.expiry).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}` : ""}
                          </div>
                        </div>
                        <span className={`font-body text-sm font-bold ${h.points > 0 ? "text-yellow-500" : "text-gray-600"}`}>
                          {h.points > 0 ? "+" : ""}{h.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal déclaration paiement chèque/espèces ── */}
      {declaringPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !declareSending && setDeclaringPayment(null)}>
          <div className="bg-white rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Déclarer un paiement</h2>
              <p className="font-body text-xs text-slate-500 mt-1">
                {(declaringPayment.items || []).map((i: any) => i.activityTitle).join(", ")}
              </p>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {declareSuccess ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-body text-base font-semibold text-green-700">Déclaration envoyée !</p>
                  <p className="font-body text-xs text-slate-500 mt-1">
                    Le centre équestre va confirmer réception de votre {declareMode === "cheque" ? "chèque" : "règlement en espèces"}.
                  </p>
                  <button onClick={() => setDeclaringPayment(null)}
                    className="mt-4 font-body text-sm text-blue-500 bg-transparent border-none cursor-pointer underline">
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  {/* Mode */}
                  <div>
                    <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Mode de paiement</label>
                    <div className="flex gap-2">
                      {([["cheque", "📝 Chèque"], ["especes", "💵 Espèces"]] as const).map(([mode, label]) => (
                        <button key={mode} onClick={() => setDeclareMode(mode)}
                          className={`flex-1 py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${declareMode === mode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Montant */}
                  <div>
                    <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Montant (€)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={declareMontant}
                      onChange={e => setDeclareMontant(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-base text-blue-800 font-bold focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Note optionnelle */}
                  <div>
                    <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Note (optionnel)</label>
                    <input
                      type="text"
                      value={declareNote}
                      onChange={e => setDeclareNote(e.target.value)}
                      placeholder={declareMode === "cheque" ? "Ex: chèque n°1234567" : "Ex: remis en main propre"}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setDeclaringPayment(null)}
                      className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                      Annuler
                    </button>
                    <button
                      disabled={declareSending || !declareMontant || parseFloat(declareMontant) <= 0}
                      onClick={async () => {
                        setDeclareSending(true);
                        try {
                          const montant = parseFloat(declareMontant);
                          // Créer une notification dans Firestore
                          await addDoc(collection(db, "payment_declarations"), {
                            paymentId: declaringPayment.id,
                            familyId: user?.uid,
                            familyName: declaringPayment.familyName,
                            familyEmail: user?.email || "",
                            montant,
                            mode: declareMode,
                            note: declareNote || "",
                            activityTitle: (declaringPayment.items || []).map((i: any) => i.activityTitle).join(", "),
                            status: "pending_confirmation", // admin doit confirmer
                            createdAt: serverTimestamp(),
                          });
                          // Notifier l'admin par email
                          fetch("/api/send-email", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              to: process.env.NEXT_PUBLIC_OWNER_EMAIL || "nicolasrichard16@hotmail.com",
                              subject: `💰 Déclaration paiement — ${declaringPayment.familyName}`,
                              html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                                <p><strong>${declaringPayment.familyName}</strong> déclare un paiement :</p>
                                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                                  <p style="margin:0;font-weight:600;color:#166534;">💰 ${montant.toFixed(2)}€ en ${declareMode === "cheque" ? "chèque" : "espèces"}</p>
                                  <p style="margin:8px 0 0;color:#555;font-size:13px;">📋 ${(declaringPayment.items || []).map((i: any) => i.activityTitle).join(", ")}</p>
                                  ${declareNote ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">📝 ${declareNote}</p>` : ""}
                                </div>
                                <p style="font-size:13px;color:#555;">Confirmez la réception dans l'admin → Paiements.</p>
                              </div>`,
                            }),
                          }).catch(() => {});
                          setDeclareSuccess(true);
                        } catch (e) { console.error(e); alert("Erreur. Réessayez."); }
                        setDeclareSending(false);
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-2 ${declareSending || !declareMontant ? "bg-gray-200 text-slate-600" : "bg-blue-500 text-white hover:bg-blue-600"}`}>
                      {declareSending ? <Loader2 size={14} className="animate-spin" /> : "Envoyer la déclaration"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
