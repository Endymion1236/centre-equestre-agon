"use client";
import { useState } from "react";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui";
import { Receipt, Wallet, UserPlus, X, Trash2, CalendarDays } from "lucide-react";
import { openHtmlInTab } from "@/lib/open-html-tab";

const TABS = [
  { id: "cavaliers", label: "👥 Cavaliers" },
  { id: "reservations", label: "📅 Réservations" },
  { id: "paiements", label: "💳 Paiements" },
  { id: "divers", label: "🗂 Divers" },
  { id: "notes", label: "📝 Notes" },
] as const;
type TabId = typeof TABS[number]["id"];

const modeLabels: Record<string, string> = {
  cb_terminal: "CB", cb_online: "Stripe", cheque: "Chèque",
  especes: "Espèces", cheque_vacances: "Chq. Vac.", pass_sport: "Pass'Sport",
  ancv: "ANCV", virement: "Virement", avoir: "Avoir", carte: "Carte",
};

export default function FamilyDetailTabs({ family, children, allReservations, allPayments, allAvoirs, allCartes, allMandats, allFidelite, fetchFamilies }: {
  family: any;
  children: any[];
  allReservations: any[];
  allPayments: any[];
  allAvoirs: any[];
  allCartes: any[];
  allMandats: any[];
  allFidelite: any[];
  fetchFamilies: () => void;
}) {
  const [tab, setTab] = useState<TabId>("cavaliers");

  // ── Données calculées ──
  const fid = family.firestoreId;
  const today = new Date().toISOString().split("T")[0];

  const reservations = allReservations.filter(r => r.familyId === fid || r.sourceFamilyId === fid);
  const upcoming = reservations.filter(r => r.date >= today && r.status !== "cancelled");
  const past = reservations.filter(r => r.date < today).slice(0, 5);

  // Grouper les réservations à venir par date+activité+heure
  const groupedUpcoming: Record<string, any[]> = {};
  upcoming.forEach(r => {
    const key = `${r.date}_${r.activityTitle}_${r.startTime}`;
    if (!groupedUpcoming[key]) groupedUpcoming[key] = [];
    groupedUpcoming[key].push(r);
  });
  const groupedEntries = Object.entries(groupedUpcoming).sort(([a], [b]) => a.localeCompare(b));

  const payments = allPayments.filter(p => p.familyId === fid && p.status !== "cancelled");
  const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
  const totalFacture = payments.reduce((s, p) => s + (p.totalTTC || 0), 0);
  const totalDue = Math.max(0, totalFacture - totalPaid);

  const avoirs = allAvoirs.filter(a => a.familyId === fid);
  const famCartes = allCartes.filter(c => c.familyId === fid);
  const mandat = allMandats.find(m => m.familyId === fid && m.status === "active");
  const fidData = allFidelite.find(f => f.id === fid);

  return (
    <div className="mt-3 pt-3 border-t border-blue-500/8">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-sand rounded-xl px-3 py-2 text-center">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Facturé</div>
          <div className="font-display text-sm font-bold text-blue-800">{totalFacture.toFixed(2)}€</div>
        </div>
        <div className="bg-green-50 rounded-xl px-3 py-2 text-center">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Payé</div>
          <div className="font-display text-sm font-bold text-green-600">{totalPaid.toFixed(2)}€</div>
        </div>
        <div className={`rounded-xl px-3 py-2 text-center ${totalDue > 0 ? "bg-red-50" : "bg-green-50"}`}>
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Reste dû</div>
          <div className={`font-display text-sm font-bold ${totalDue > 0 ? "text-red-500" : "text-green-600"}`}>{totalDue.toFixed(2)}€</div>
        </div>
      </div>

      {/* ── Nav onglets ── */}
      <div className="flex gap-1 mb-3 border-b border-gray-100 pb-2 flex-wrap">
        {TABS.map(({ id, label }) => {
          const badge = id === "reservations" ? upcoming.length : id === "paiements" ? payments.length : 0;
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all flex items-center gap-1
                ${tab === id ? "bg-blue-500 text-white font-semibold" : "text-slate-600 hover:bg-sand bg-transparent"}`}>
              {label}
              {badge > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20" : "bg-gray-100"}`}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════ */}
      {/* ── Onglet Cavaliers ── */}
      {/* ════════════════════════════════ */}
      {tab === "cavaliers" && (
        <div className="flex flex-col gap-3">
          {/* Fiches sanitaires */}
          {children.some(c => c.sanitaryForm) && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Fiches sanitaires</div>
              {children.filter(c => c.sanitaryForm).map(child => (
                <div key={child.id} className="flex gap-3 flex-wrap text-xs font-body text-slate-600 mb-1 bg-sand rounded-lg px-3 py-2">
                  <span className="font-semibold text-blue-800 min-w-[60px]">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</span>
                  <span>Allergies : {child.sanitaryForm.allergies || "Aucune"}</span>
                  <span className="text-slate-400">Urgence : {child.sanitaryForm.emergencyContactName} ({child.sanitaryForm.emergencyContactPhone})</span>
                </div>
              ))}
            </div>
          )}
          {/* Cavaliers liés */}
          {(family.linkedChildren || []).length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <UserPlus size={10} /> Cavaliers liés
              </div>
              {(family.linkedChildren || []).map((lc: any) => (
                <div key={lc.childId} className="flex items-center justify-between px-3 py-2 bg-teal-50 rounded-lg border border-teal-100 mb-1">
                  <div>
                    <span className="font-body text-sm font-semibold text-teal-800">{lc.childName}</span>
                    <div className="font-body text-[10px] text-teal-600">{lc.sourceFamilyName}</div>
                  </div>
                  <button onClick={async () => {
                    if (!confirm(`Retirer ${lc.childName} ?`)) return;
                    const newLinked = (family.linkedChildren || []).filter((c: any) => c.childId !== lc.childId);
                    await updateDoc(doc(db, "families", fid), { linkedChildren: newLinked });
                    fetchFamilies();
                  }} className="text-red-400 bg-transparent border-none cursor-pointer"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* ── Onglet Réservations ── */}
      {/* ════════════════════════════════ */}
      {tab === "reservations" && (
        <div>
          {upcoming.length === 0 && past.length === 0 ? (
            <p className="font-body text-xs text-slate-400 italic">Aucune réservation.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {groupedEntries.length > 0 && (
                <>
                  <div className="font-body text-[10px] text-green-600 font-semibold mb-1 flex items-center gap-1">
                    <CalendarDays size={10} /> À venir ({groupedEntries.length} séance{groupedEntries.length > 1 ? "s" : ""})
                  </div>
                  {groupedEntries.slice(0, 10).map(([key, group]) => {
                    const r = group[0];
                    const childNames = group.map((g: any) => g.childName).join(", ");
                    return (
                      <div key={key} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-green-700 font-semibold min-w-[80px]">
                            {new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <span className="text-slate-500">{r.startTime}–{r.endTime}</span>
                          <span className="text-blue-800 font-semibold">{r.activityTitle}</span>
                          <span className="text-slate-400">({childNames})</span>
                          {group.length > 1 && <Badge color="blue">{group.length}</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {group.map((gr: any) => gr.status !== "cancelled" && (
                            <button key={gr.id} title={`Annuler ${gr.childName}`}
                              onClick={async () => {
                                if (!confirm(`Annuler ${gr.childName} le ${new Date(gr.date + "T12:00:00").toLocaleDateString("fr-FR")} ?`)) return;
                                await updateDoc(doc(db, "reservations", gr.id), { status: "cancelled", cancelledAt: new Date().toISOString() });
                                if (gr.creneauId) {
                                  const cs = await getDoc(doc(db, "creneaux", gr.creneauId));
                                  if (cs.exists()) {
                                    const enrolled = (cs.data().enrolled || []).filter((e: any) => !(e.childId === gr.childId && e.familyId === gr.familyId));
                                    await updateDoc(doc(db, "creneaux", gr.creneauId), { enrolled, enrolledCount: enrolled.length });
                                  }
                                }
                                fetchFamilies();
                              }}
                              className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5">
                              <Trash2 size={11} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {past.length > 0 && (
                <>
                  <div className="font-body text-[10px] text-slate-400 font-semibold mt-2 mb-1">Passées</div>
                  {past.map(r => (
                    <div key={r.id} className="flex items-center justify-between font-body text-xs py-1 px-3 text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="min-w-[70px]">{new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        <span>{r.activityTitle}</span>
                        <span className="text-slate-400">({r.childName})</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* ── Onglet Paiements ── */}
      {/* ════════════════════════════════ */}
      {tab === "paiements" && (
        <div>
          {payments.length === 0 ? (
            <p className="font-body text-xs text-slate-400 italic">Aucun paiement enregistré.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {payments.slice(0, 10).map(p => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-slate-500 min-w-[65px] flex-shrink-0">{d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</span>
                      <span className="text-blue-800 font-semibold truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement"}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                      <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "red"}>
                        {p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : "À régler"}
                      </Badge>
                      <button onClick={async e => {
                        e.stopPropagation();
                        const invDate = d || new Date();
                        const invoiceNumber = p.orderId || `F-${invDate.getFullYear()}${String(invDate.getMonth()+1).padStart(2,"0")}-${(p.id||"").slice(-4).toUpperCase()}`;
                        const items = (p.items||[]).map((i: any) => ({ label: i.activityTitle||"Prestation", priceHT: i.priceHT||Math.round((i.priceTTC||0)/1.055*100)/100, tva: i.tva||5.5, priceTTC: i.priceTTC||0 }));
                        const totalHT = items.reduce((s: number, i: any) => s+(i.priceHT||0), 0);
                        const res = await fetch("/api/invoice", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: family.parentName||p.familyName, items, totalHT, totalTVA: (p.totalTTC||0)-totalHT, totalTTC: p.totalTTC||0, paidAmount: p.paidAmount||p.totalTTC||0, paymentMode: modeLabels[p.paymentMode]||p.paymentMode||"", paymentDate: p.status==="paid" ? invDate.toLocaleDateString("fr-FR") : "" }) });
                        if (res.ok) { const data = await res.json(); if (data.html) openHtmlInTab(data.html); }
                      }} className="text-blue-500 bg-blue-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-blue-100 text-[10px]">📄</button>
                    </div>
                  </div>
                );
              })}
              {payments.length > 10 && <p className="font-body text-[10px] text-slate-400 text-center mt-1">+{payments.length-10} autres</p>}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* ── Onglet Divers ── */}
      {/* ════════════════════════════════ */}
      {tab === "divers" && (
        <div className="flex flex-col gap-4">
          {/* Avoirs */}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Wallet size={10} /> Avoirs & avances ({avoirs.length})
            </div>
            {avoirs.length === 0 ? (
              <p className="font-body text-xs text-slate-400 italic">Aucun avoir.</p>
            ) : avoirs.map(a => (
              <div key={a.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                <div className="flex items-center gap-2">
                  <Badge color={a.status === "actif" ? "green" : "gray"}>{a.status}</Badge>
                  <span className="text-blue-800">{a.reference}</span>
                  <span className="text-slate-400">{a.reason}</span>
                </div>
                <span className={`font-semibold ${a.remainingAmount > 0 ? "text-blue-500" : "text-slate-300"}`}>{(a.remainingAmount||0).toFixed(2)}€</span>
              </div>
            ))}
          </div>

          {/* Cartes */}
          {famCartes.length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">🎟️ Cartes de séances ({famCartes.length})</div>
              {famCartes.map(c => {
                const expired = c.dateFin && new Date(c.dateFin) < new Date();
                return (
                  <div key={c.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                    <div className="flex items-center gap-2">
                      <Badge color={c.status === "active" && !expired ? "green" : "gray"}>{c.status === "active" && !expired ? "Active" : "Expirée"}</Badge>
                      <span className="text-blue-800">{c.activityType}</span>
                    </div>
                    <span className="font-semibold text-blue-500">{c.remainingSessions||0}/{c.totalSessions||0} séances</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* SEPA */}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">🏦 Mandat SEPA</div>
            {mandat ? (
              <div className="font-body text-xs py-2 px-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <Badge color="green">Actif</Badge>
                  <span className="text-blue-800 font-semibold">{mandat.mandatId}</span>
                </div>
                <div className="text-slate-500">IBAN : {mandat.iban?.slice(0,4)}...{mandat.iban?.slice(-4)}</div>
                <div className="text-slate-500">Titulaire : {mandat.titulaire}</div>
              </div>
            ) : (
              <p className="font-body text-xs text-slate-400 italic">Aucun mandat SEPA.</p>
            )}
          </div>

          {/* Fidélité */}
          {fidData && (fidData.points || 0) > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">⭐ Fidélité</div>
              <div className="flex items-center gap-3 py-2 px-3 bg-gold-50 rounded-lg border border-gold-200">
                <span className="font-display text-xl font-bold text-gold-600">{fidData.points}</span>
                <span className="font-body text-xs text-gold-600">points ≈ {(fidData.points/100).toFixed(2)}€</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* ── Onglet Notes ── */}
      {/* ════════════════════════════════ */}
      {tab === "notes" && (
        <div>
          <textarea
            defaultValue={family.notes || ""}
            onBlur={async e => {
              if (e.target.value !== (family.notes || "")) {
                await updateDoc(doc(db, "families", fid), { notes: e.target.value, updatedAt: serverTimestamp() });
                fetchFamilies();
              }
            }}
            placeholder="Notes visibles uniquement par l'admin..."
            className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[80px] resize-y"
          />
          <p className="font-body text-[10px] text-slate-400 mt-1">Sauvegarde automatique quand vous cliquez en dehors.</p>
        </div>
      )}
    </div>
  );
}
