"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, Minus, Search, Loader2, Ticket, X, Check, History } from "lucide-react";
import type { Family } from "@/types";

interface Card10 {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  activityType: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  priceHT: number;
  tvaTaux: number;
  priceTTC: number;
  status: string;
  history: { date: string; activityTitle: string; deductedAt: string }[];
  createdAt: any;
}

const cardTemplates = [
  { sessions: 5, label: "Carte 5 séances", discount: 0 },
  { sessions: 10, label: "Carte 10 séances", discount: 5 },
  { sessions: 20, label: "Carte 20 séances", discount: 10 },
];

const payModes = [
  { id: "cb_terminal", label: "CB Terminal", icon: "💳" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💶" },
  { id: "cb_online", label: "Stripe", icon: "🌐" },
];

export default function CartesPage() {
  const { setAgentContext } = useAgentContext("cartes");

  useEffect(() => {
    setAgentContext({ module_actif: "cartes", description: "cartes de séances actives et historique" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<"active" | "create" | "history">("active");
  const [cards, setCards] = useState<Card10[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Create form
  const [selFamily, setSelFamily] = useState("");
  const [selChild, setSelChild] = useState("");
  const [selTemplate, setSelTemplate] = useState(1); // index
  const [unitPriceHT, setUnitPriceHT] = useState("15");
  const [payMode, setPayMode] = useState("cb_terminal");
  const [selActivityType, setSelActivityType] = useState<"cours" | "balade">("cours");
  const [carteFamiliale, setCarteFamiliale] = useState(false);
  const [creating, setCreating] = useState(false);
  const [familySearch, setFamilySearch] = useState("");
  // Dates de validité
  const defaultDateDebut = new Date().toISOString().slice(0, 10);
  const defaultDateFin = (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 10); })();
  const [dateDebut, setDateDebut] = useState(defaultDateDebut);
  const [dateFin, setDateFin] = useState(defaultDateFin);

  // Debit
  const [debitCardId, setDebitCardId] = useState<string | null>(null);
  const [debitActivity, setDebitActivity] = useState("");
  const [debiting, setDebiting] = useState(false);

  const fetchData = async () => {
    try {
      const [cSnap, fSnap] = await Promise.all([
        getDocs(collection(db, "cartes")),
        getDocs(collection(db, "families")),
      ]);
      setCards(cSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Card10[]);
      setFamilies(fSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const family = families.find(f => f.firestoreId === selFamily);
  const children = family?.children || [];
  const template = cardTemplates[selTemplate];
  const unitPrice = Number.isFinite(Number(unitPriceHT)) ? Number(unitPriceHT) : 0;
  const totalHT = unitPrice * template.sessions * (1 - template.discount / 100);
  const totalTTC = totalHT * 1.055;

  const filteredFamilies = familySearch
    ? families.filter(f => f.parentName?.toLowerCase().includes(familySearch.toLowerCase()) || (f.children || []).some((c: any) => `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(familySearch.toLowerCase()) || `${c.lastName || ""} ${c.firstName || ""}`.toLowerCase().includes(familySearch.toLowerCase())))
    : families;

  const activeCards = cards.filter(c => c.status === "active" && c.remainingSessions > 0);
  const filteredCards = search
    ? activeCards.filter(c => c.childName.toLowerCase().includes(search.toLowerCase()) || c.familyName.toLowerCase().includes(search.toLowerCase()))
    : activeCards;

  const handleCreate = async () => {
    if (!selFamily || !family) return;
    if (!carteFamiliale && !selChild) return; // enfant requis si pas familiale
    setCreating(true);
    const child = children.find((c: any) => c.id === selChild);

    const cardRef = await addDoc(collection(db, "cartes"), {
      familyId: selFamily,
      familyName: family.parentName || "—",
      childId: carteFamiliale ? null : selChild,
      childName: carteFamiliale ? "Toute la famille" : ((child as any)?.firstName || "—"),
      familiale: carteFamiliale,
      activityType: selActivityType,
      totalSessions: template.sessions,
      usedSessions: 0,
      remainingSessions: template.sessions,
      priceHT: Math.round(totalHT * 100) / 100,
      tvaTaux: 5.5,
      priceTTC: Math.round(totalTTC * 100) / 100,
      status: "active",
      history: [],
      dateDebut,
      dateFin,
      createdAt: serverTimestamp(),
    });

    // Créer paiement avec lien carte
    const payRef = await addDoc(collection(db, "payments"), {
      familyId: selFamily,
      familyName: family.parentName || "—",
      items: [{
        activityTitle: `${template.label} — ${(child as any)?.firstName}`,
        childId: selChild,
        childName: (child as any)?.firstName || "—",
        cardId: cardRef.id,
        priceHT: Math.round(totalHT * 100) / 100,
        tva: 5.5,
        priceTTC: Math.round(totalTTC * 100) / 100,
      }],
      totalTTC: Math.round(totalTTC * 100) / 100,
      paymentMode: payMode,
      paymentRef: "",
      status: "paid",
      paidAmount: Math.round(totalTTC * 100) / 100,
      cardId: cardRef.id,
      date: serverTimestamp(),
    });

    // Créer l'encaissement dans le journal
    await addDoc(collection(db, "encaissements"), {
      paymentId: payRef.id,
      familyId: selFamily,
      familyName: family.parentName || "—",
      montant: Math.round(totalTTC * 100) / 100,
      mode: payMode,
      modeLabel: payMode === "cb_terminal" ? "CB (terminal)" : payMode === "especes" ? "Espèces" : payMode === "cheque" ? "Chèque" : payMode,
      ref: "",
      activityTitle: `${template.label} — ${(child as any)?.firstName}`,
      date: serverTimestamp(),
    });

    setSelFamily(""); setSelChild(""); setCreating(false);
    setTab("active");
    fetchData();
  };

  const handleDebit = async (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card || card.remainingSessions <= 0) return;
    setDebiting(true);

    const newHistory = [...(card.history || []), {
      date: new Date().toISOString().split("T")[0],
      activityTitle: debitActivity || "Séance",
      deductedAt: new Date().toISOString(),
    }];

    await updateDoc(doc(db, "cartes", cardId), {
      usedSessions: card.usedSessions + 1,
      remainingSessions: card.remainingSessions - 1,
      history: newHistory,
      status: card.remainingSessions - 1 <= 0 ? "used" : "active",
    });

    setDebitCardId(null); setDebitActivity(""); setDebiting(false);
    fetchData();
  };

  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6 flex items-center gap-3"><Ticket size={24} /> Cartes & tickets</h1>

      <div className="flex gap-2 mb-6">
        {([["active", "Cartes actives", Ticket], ["create", "Nouvelle carte", Plus], ["history", "Historique", History]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ─── Active cards ─── */}
      {tab === "active" && (
        <div>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher prénom, nom ou famille..."
              className={`${inp} !pl-9`} />
          </div>

          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          filteredCards.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Ticket size={28} className="text-blue-300" /></div>
              <p className="font-body text-sm text-slate-600 mb-3">{search ? "Aucune carte trouvée." : "Aucune carte active."}</p>
              <button onClick={() => setTab("create")} className="font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer">+ Créer une carte</button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCards.map(card => {
                const pct = (card.remainingSessions / card.totalSessions) * 100;
                return (
                  <Card key={card.id} padding="md">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center text-2xl">🎟️</div>
                        <div>
                          <div className="font-body text-base font-semibold text-blue-800">{card.childName} <span className="font-normal text-slate-500 text-sm">· {card.familyName}</span></div>
                          <div className="font-body text-xs text-slate-500">{card.familyName} · {card.activityType === "balade" ? "Balades" : "Cours"}{(card as any).familiale ? " · 👨‍👩‍👧 Familiale" : ""}</div>
                          {(card as any).dateDebut && (card as any).dateFin && (
                            <div className="font-body text-[10px] text-slate-500 mt-0.5">
                              {new Date((card as any).dateDebut).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}
                              {" → "}
                              {new Date((card as any).dateFin).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}
                              {new Date((card as any).dateFin) < new Date() && <span className="text-red-400 ml-1">· Expirée</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge color={card.remainingSessions > 2 ? "green" : card.remainingSessions > 0 ? "orange" : "red"}>
                        {card.remainingSessions}/{card.totalSessions}
                      </Badge>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-2.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all"
                          style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-body text-[10px] text-slate-500">{card.usedSessions} utilisée{card.usedSessions > 1 ? "s" : ""}</span>
                        <span className="font-body text-[10px] font-semibold text-gold-500">{card.remainingSessions} restante{card.remainingSessions > 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    {/* Debit button */}
                    {card.remainingSessions > 0 && (
                      debitCardId === card.id ? (
                        <div className="flex gap-2">
                          <input value={debitActivity} onChange={e => setDebitActivity(e.target.value)}
                            placeholder="Activité (optionnel)" className={`${inp} flex-1 !text-xs`} />
                          <button onClick={() => handleDebit(card.id)} disabled={debiting}
                            className="px-4 py-2 rounded-lg font-body text-xs font-semibold text-white bg-gold-400 border-none cursor-pointer hover:bg-gold-300">
                            {debiting ? "..." : "−1"}
                          </button>
                          <button onClick={() => setDebitCardId(null)}
                            className="px-2 py-2 rounded-lg text-slate-500 bg-transparent border border-gray-200 cursor-pointer">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDebitCardId(card.id)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold text-gold-500 bg-gold-50 border border-gold-400/20 cursor-pointer hover:bg-gold-100 transition-colors">
                          <Minus size={14} /> Débiter une séance
                        </button>
                      )
                    )}

                    {/* Bouton détail + historique replié */}
                    <button onClick={() => setOpenCardId(openCardId === card.id ? null : card.id)}
                      className="w-full flex items-center justify-between mt-2 pt-2 border-t border-gray-100 font-body text-xs text-slate-500 hover:text-blue-500 bg-transparent border-none cursor-pointer px-0 pb-0">
                      <span>{(card.history || []).filter((h:any) => !h.credit && h.presence !== "absent").length} séance{(card.history || []).filter((h:any) => !h.credit && h.presence !== "absent").length > 1 ? "s" : ""} utilisée{(card.history || []).filter((h:any) => !h.credit && h.presence !== "absent").length > 1 ? "s" : ""}</span>
                      <span>{openCardId === card.id ? "▲ Masquer" : "▼ Voir le détail"}</span>
                    </button>

                    {/* Historique détaillé — visible uniquement si ouvert */}
                    {openCardId === card.id && (card.history || []).length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {[...(card.history as any[])].reverse().map((h: any, i: number) => (
                          <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-body ${h.credit ? "bg-green-50" : h.presence === "absent" ? "bg-red-50 opacity-60" : "bg-sand"}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.credit ? "bg-green-400" : h.presence === "absent" ? "bg-red-400" : "bg-gold-400"}`} />
                              <div className="min-w-0">
                                <div className="text-blue-800 font-semibold truncate">{h.activityTitle || "Séance"}</div>
                                <div className="text-slate-500 text-[10px]">
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
                    {openCardId === card.id && (card.history || []).length === 0 && (
                      <p className="font-body text-xs text-slate-500 text-center py-2 mt-1">Aucune séance utilisée</p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Create card ─── */}
      {tab === "create" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Créer une carte de séances</h3>
          <div className="flex flex-col gap-4">
            {/* Family search + select */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Famille</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={familySearch} onChange={e => setFamilySearch(e.target.value)} placeholder="Rechercher..." className={`${inp} !pl-9`} />
              </div>
              <select value={selFamily} onChange={e => { setSelFamily(e.target.value); setSelChild(""); }} className={inp}>
                <option value="">Choisir...</option>
                {filteredFamilies.map(f => {
                  const names = (f.children || []).map((c: any) => c.firstName).join(", ");
                  return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {names ? `(${names})` : ""}</option>;
                })}
              </select>
            </div>

            {/* Child select */}
            {family && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Cavalier(s)</label>
                {/* Toggle familiale */}
                <div className="flex items-center justify-between p-3 bg-sand rounded-xl mb-3">
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">Carte familiale</div>
                    <div className="font-body text-xs text-slate-500 mt-0.5">Utilisable par tous les enfants de la famille</div>
                  </div>
                  <button onClick={() => { setCarteFamiliale(!carteFamiliale); setSelChild(""); }}
                    className={`w-12 h-6 rounded-full transition-all border-none cursor-pointer flex-shrink-0 ${carteFamiliale ? "bg-blue-500" : "bg-gray-200"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-all mx-0.5 ${carteFamiliale ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
                {/* Sélecteur enfant si pas familiale */}
                {!carteFamiliale && (
                  <div className="flex flex-wrap gap-2">
                    {children.map((c: any) => (
                      <button key={c.id} onClick={() => setSelChild(c.id)}
                        className={`px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                        🧒 {c.firstName}
                      </button>
                    ))}
                  </div>
                )}
                {carteFamiliale && (
                  <div className="flex flex-wrap gap-2">
                    {children.map((c: any) => (
                      <div key={c.id} className="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 font-body text-sm text-blue-600">
                        🧒 {c.firstName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Type d'activité valable */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Valable pour</label>
              <div className="flex gap-2">
                {([["cours", "🐴 Cours"], ["balade", "🌿 Balades"]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setSelActivityType(val)}
                    className={`flex-1 py-2.5 rounded-lg border font-body text-sm cursor-pointer transition-all ${selActivityType === val ? "border-blue-500 bg-blue-50 text-blue-800 font-semibold" : "border-gray-200 bg-white text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Card template */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Type de carte</label>
              <div className="flex gap-3">
                {cardTemplates.map((t, i) => (
                  <button key={i} onClick={() => setSelTemplate(i)}
                    className={`flex-1 p-4 rounded-xl border text-center cursor-pointer transition-all ${selTemplate === i ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-2xl font-bold text-blue-800">{t.sessions}</div>
                    <div className="font-body text-xs text-slate-600">séances</div>
                    {t.discount > 0 && <div className="font-body text-xs font-semibold text-green-600 mt-1">-{t.discount}%</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates de validité */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Début de validité</label>
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className={inp} />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Fin de validité</label>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className={inp} />
              </div>
            </div>

            {/* Unit price */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix unitaire HT (€/séance)</label>
                <input type="number" step="0.01" value={unitPriceHT} onChange={e => setUnitPriceHT(e.target.value)} className={inp} />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Mode de paiement</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)} className={inp}>
                  {payModes.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
                </select>
              </div>
            </div>

            {/* Price summary */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex justify-between mb-1">
                <span className="font-body text-sm text-slate-600">{template.sessions} × {unitPrice.toFixed(2)}€ HT</span>
                <span className="font-body text-sm text-slate-600">{(unitPrice * template.sessions).toFixed(2)}€</span>
              </div>
              {template.discount > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="font-body text-sm text-green-600">Réduction carte {template.sessions} séances</span>
                  <span className="font-body text-sm text-green-600">-{template.discount}%</span>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span className="font-body text-sm text-slate-600">Total HT</span>
                <span className="font-body text-sm font-semibold text-gray-700">{totalHT.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-500/8">
                <span className="font-body text-base font-bold text-blue-800">Total TTC (5.5%)</span>
                <span className="font-body text-xl font-bold text-blue-500">{totalTTC.toFixed(2)}€</span>
              </div>
            </div>

            <button onClick={handleCreate} disabled={!selFamily || (!carteFamiliale && !selChild) || creating}
              className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                ${!selFamily || !selChild || creating ? "bg-gray-200 text-slate-500" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
              {creating ? "Création..." : `Créer la carte ${template.sessions} séances + Encaisser ${totalTTC.toFixed(2)}€`}
            </button>
          </div>
        </Card>
      )}

      {/* ─── History ─── */}
      {tab === "history" && (
        <div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          cards.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="font-body text-sm text-slate-600">Aucune carte créée.</p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className="flex-1">Cavalier</span>
                <span className="w-24">Famille</span>
                <span className="w-16 text-center">Type</span>
                <span className="w-20 text-center">Utilisées</span>
                <span className="w-20 text-right">Prix TTC</span>
                <span className="w-20 text-center">Statut</span>
              </div>
              {cards.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(card => (
                <div key={card.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30">
                  <span className="flex-1 font-body text-sm font-semibold text-blue-800">🧒 {card.childName}</span>
                  <span className="w-24 font-body text-xs text-slate-600">{card.familyName}</span>
                  <span className="w-16 text-center font-body text-xs font-semibold text-blue-500">{card.totalSessions} séances</span>
                  <span className="w-20 text-center font-body text-sm font-semibold text-blue-800">{card.usedSessions}/{card.totalSessions}</span>
                  <span className="w-20 text-right font-body text-sm text-slate-600">{card.priceTTC?.toFixed(2)}€</span>
                  <span className="w-20 text-center">
                    <Badge color={card.status === "active" ? "green" : card.status === "used" ? "gray" : "red"}>
                      {card.status === "active" ? "Active" : card.status === "used" ? "Épuisée" : "Expirée"}
                    </Badge>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
