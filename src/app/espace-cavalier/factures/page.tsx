"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
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
  virement: "Virement", avoir: "Avoir", carte: "Carte",
};

export default function FacturesPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cards, setCards] = useState<Card10[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"factures" | "reservations" | "cartes">("factures");
  const [clientAvoirs, setClientAvoirs] = useState<any[]>([]);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

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
      <p className="font-body text-sm text-gray-400 mb-6">Retrouvez l&apos;historique de tous vos paiements et réservations.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([["factures", "Paiements", Receipt], ["reservations", "Réservations", CreditCard], ["cartes", "Cartes", Ticket]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
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
                      <div className="font-body text-[10px] text-gray-400 uppercase">Total facturé</div>
                    </Card>
                    <Card padding="sm" className="text-center bg-green-50">
                      <div className="font-body text-xl font-bold text-green-600">{totalPaye.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-gray-400 uppercase">Payé</div>
                    </Card>
                    <Card padding="sm" className={`text-center ${resteDu > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <div className={`font-body text-xl font-bold ${resteDu > 0 ? "text-red-500" : "text-green-600"}`}>{resteDu.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-gray-400 uppercase">Reste dû</div>
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
                              <div className="font-body text-xs text-gray-400">
                                {d.toLocaleDateString("fr-FR")} · {modeLabels[p.paymentMode] || p.paymentMode}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-body text-lg font-bold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                            <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "gray"}>
                              {p.status === "paid" ? "Payé" : p.status === "partial" ? "Partiel" : "En attente"}
                            </Badge>
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
                              className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none"
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
                            <div className="font-body text-xs text-gray-400">
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
                            <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center text-2xl">🎟️</div>
                            <div>
                              <div className="font-body text-base font-semibold text-blue-800">
                                Carte {card.totalSessions} séances · {(card as any).activityType === "balade" ? "Balades" : "Cours"}
                              </div>
                              <div className="font-body text-xs text-gray-400">🧒 {card.childName}</div>
                              {(card as any).dateDebut && (card as any).dateFin && (
                                <div className="font-body text-[10px] text-gray-400 mt-0.5">
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
                            <span className="font-body text-xs text-gray-400">{card.usedSessions} utilisée{card.usedSessions > 1 ? "s" : ""}</span>
                            <span className="font-body text-xs font-semibold text-gold-500">{card.remainingSessions} restante{card.remainingSessions > 1 ? "s" : ""}</span>
                          </div>
                        </div>

                        {/* Historique déroulant */}
                        {(card.history || []).length > 0 && (
                          <div className="pt-2 border-t border-gray-100">
                            <button
                              onClick={() => setOpenCardId(isOpen ? null : card.id)}
                              className="w-full flex items-center justify-between font-body text-xs text-gray-400 bg-transparent border-none cursor-pointer py-1 hover:text-blue-500">
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
                                        <div className="text-gray-400 text-[10px]">
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
        </>
      )}
    </div>
  );
}
