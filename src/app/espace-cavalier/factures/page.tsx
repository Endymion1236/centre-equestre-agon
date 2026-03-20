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
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card padding="sm">
                  <div className="font-body text-2xl font-bold text-blue-500">{totalPaid.toFixed(2)}€</div>
                  <div className="font-body text-xs text-gray-400">Total payé</div>
                </Card>
                <Card padding="sm">
                  <div className="font-body text-2xl font-bold text-green-600">{payments.filter(p => p.status === "paid").length}</div>
                  <div className="font-body text-xs text-gray-400">Paiements confirmés</div>
                </Card>
                <Card padding="sm">
                  <div className="font-body text-2xl font-bold text-orange-500">{payments.filter(p => p.status === "partial").length}</div>
                  <div className="font-body text-xs text-gray-400">Paiements partiels</div>
                </Card>
              </div>

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
                            <button onClick={() => {
                              const d2 = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu</title><style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#333}h1{color:#2050A0;font-size:20px;border-bottom:2px solid #2050A0;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #eee}th{font-size:11px;text-transform:uppercase;color:#999}td{font-size:13px}.total{font-size:18px;font-weight:bold;color:#2050A0;text-align:right;margin-top:20px}.footer{margin-top:40px;font-size:11px;color:#999;text-align:center}</style></head><body><h1>Centre Équestre d'Agon-Coutainville</h1><p style="font-size:12px;color:#666">56 Charrière du Commerce — 50230 Agon-Coutainville<br>Tél : 02 44 84 99 96 — ceagon@orange.fr</p><p><strong>Reçu de paiement</strong><br>Date : ${d2.toLocaleDateString("fr-FR")}<br>Client : ${p.familyName}</p><table><thead><tr><th>Prestation</th><th style="text-align:right">HT</th><th style="text-align:right">TVA</th><th style="text-align:right">TTC</th></tr></thead><tbody>${(p.items||[]).map((i: any) => `<tr><td>${i.activityTitle}</td><td style="text-align:right">${(i.priceHT||0).toFixed(2)}€</td><td style="text-align:right">${((i.priceTTC||0)-(i.priceHT||0)).toFixed(2)}€</td><td style="text-align:right">${(i.priceTTC||0).toFixed(2)}€</td></tr>`).join("")}</tbody></table><div class="total">Total TTC : ${(p.totalTTC||0).toFixed(2)}€</div><p style="font-size:12px;margin-top:10px">Mode de paiement : ${modeLabels[p.paymentMode]||p.paymentMode}</p><div class="footer">Centre Équestre Poney Club d'Agon-Coutainville — SIRET : [à compléter]</div></body></html>`;
                              const w = window.open("", "_blank");
                              if (w) { w.document.write(html); w.document.close(); w.print(); }
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cards.map(card => {
                    const pct = card.totalSessions > 0 ? (card.remainingSessions / card.totalSessions) * 100 : 0;
                    return (
                      <Card key={card.id} padding="md">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center text-2xl">🎟️</div>
                            <div>
                              <div className="font-body text-base font-semibold text-blue-800">Carte {card.totalSessions} séances</div>
                              <div className="font-body text-xs text-gray-400">🧒 {card.childName}</div>
                            </div>
                          </div>
                          <Badge color={card.status === "active" ? "green" : card.status === "used" ? "gray" : "red"}>
                            {card.status === "active" ? "Active" : card.status === "used" ? "Épuisée" : "Expirée"}
                          </Badge>
                        </div>
                        <div className="mb-2">
                          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-3 rounded-full bg-gradient-to-r from-gold-400 to-gold-300" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="font-body text-xs text-gray-400">{card.usedSessions} utilisée{card.usedSessions > 1 ? "s" : ""}</span>
                            <span className="font-body text-xs font-semibold text-gold-500">{card.remainingSessions} restante{card.remainingSessions > 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <div className="font-body text-xs text-gray-400">Valeur : {card.priceTTC?.toFixed(2)}€ TTC</div>
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
