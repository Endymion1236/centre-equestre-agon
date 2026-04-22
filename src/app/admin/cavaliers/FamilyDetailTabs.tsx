"use client";
import { useState } from "react";
import ProgressionEditor from "@/components/ProgressionEditor";
import PedaSuiviCard from "@/components/PedaSuiviCard";
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui";
import { Wallet, UserPlus, X, Trash2, CalendarDays, Plus, Save, Loader2 } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";

const modeLabels: Record<string, string> = {
  cb_terminal: "CB", cb_online: "CB en ligne", cheque: "Chèque",
  especes: "Espèces", cheque_vacances: "Chq. Vac.", pass_sport: "Pass'Sport",
  ancv: "ANCV", virement: "Virement", avoir: "Avoir", prelevement_sepa: "SEPA",
};

export default function FamilyDetailTabs({ family, children, allReservations, allPayments, allAvoirs, allCartes, allMandats, allFidelite, fetchFamilies, onEditChild, onDeleteChild, onEditSanitary, onEditGalop, onInscribe, onBilanPdf }: {
  family: any; children: any[]; allReservations: any[]; allPayments: any[];
  allAvoirs: any[]; allCartes: any[]; allMandats: any[]; allFidelite: any[];
  fetchFamilies: () => void;
  onEditChild?: (child: any) => void;
  onDeleteChild?: (childId: string, childName: string) => void;
  onEditSanitary?: (child: any) => void;
  onEditGalop?: (childId: string) => void;
  onInscribe?: (childId: string, childName: string) => void;
  onBilanPdf?: (child: any) => void;
}) {
  const childTabs = children.map((c: any) => ({ id: `child_${c.id}`, label: `🧒 ${c.firstName || "?"}`, childId: c.id }));
  const familyTabs = [
    { id: "paiements", label: "💳 Paiements" },
    { id: "divers", label: "🗂 Divers" },
    { id: "notes", label: "📝 Notes" },
  ];
  const allTabs = [...childTabs, ...familyTabs];
  const [tab, setTab] = useState(childTabs[0]?.id || "paiements");
  const [editingMandat, setEditingMandat] = useState(false);
  const [mandatForm, setMandatForm] = useState({ iban: "", bic: "", titulaire: family.parentName || "", dateSignature: new Date().toISOString().split("T")[0] });
  const [mandatSaving, setMandatSaving] = useState(false);

  const handleSaveMandat = async () => {
    if (!mandatForm.iban || !mandatForm.titulaire) return;
    setMandatSaving(true);
    try {
      const cleanIban = mandatForm.iban.replace(/\s/g, "").toUpperCase();
      if (mandat) {
        await updateDoc(doc(db, "mandats-sepa", mandat.id), { iban: cleanIban, bic: mandatForm.bic, titulaire: mandatForm.titulaire, dateSignature: mandatForm.dateSignature, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "mandats-sepa"), { familyId: fid, familyName: family.parentName, iban: cleanIban, bic: mandatForm.bic, titulaire: mandatForm.titulaire, mandatId: `SEPA-${Date.now().toString(36).toUpperCase()}`, dateSignature: mandatForm.dateSignature, status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      setEditingMandat(false); fetchFamilies();
    } catch (e) { console.error(e); }
    setMandatSaving(false);
  };

  const fid = family.firestoreId;
  const today = new Date().toISOString().split("T")[0];
  const reservations = allReservations.filter((r: any) => r.familyId === fid || r.sourceFamilyId === fid);
  const payments = allPayments.filter((p: any) => p.familyId === fid && p.status !== "cancelled");
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.paidAmount || p.totalTTC || 0), 0);
  const totalFacture = payments.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0);
  const totalDue = Math.max(0, totalFacture - totalPaid);
  const avoirs = allAvoirs.filter((a: any) => a.familyId === fid);
  const famCartes = allCartes.filter((c: any) => c.familyId === fid);
  const mandat = allMandats.find((m: any) => m.familyId === fid && m.status === "active");
  const fidData = allFidelite.find((f: any) => f.id === fid);
  const currentChildId = tab.startsWith("child_") ? tab.replace("child_", "") : null;
  const currentChild = currentChildId ? children.find((c: any) => c.id === currentChildId) : null;

  return (
    <div className="mt-3 pt-3 border-t border-blue-500/8">
      {/* Nav onglets — enfants */}
      <div className="mb-1">
        <div className="font-body text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Cavaliers</div>
        <div className="flex gap-1.5 flex-wrap">
          {childTabs.map(({ id, label }) => {
            const cid = id.replace("child_", "");
            const childBadge = reservations.filter((r: any) => r.childId === cid && r.date >= today && r.status !== "cancelled").length;
            return (
              <button key={id} onClick={() => setTab(id)}
                className={`font-body text-xs px-4 py-2 rounded-xl border-none cursor-pointer transition-all flex items-center gap-1.5 ${tab === id ? "bg-blue-500 text-white font-semibold shadow-sm" : "text-blue-800 bg-blue-50 hover:bg-blue-100"}`}>
                {label}
                {childBadge > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20" : "bg-blue-200/60 text-blue-600"}`}>{childBadge}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {/* Nav onglets — famille */}
      <div className="mb-3 pb-2 border-b border-gray-100">
        <div className="font-body text-[9px] text-slate-400 uppercase tracking-widest mb-1.5 mt-2">Famille</div>
        <div className="flex gap-1.5 flex-wrap">
          {familyTabs.map(({ id, label }) => {
            const badge = id === "paiements" ? payments.length : 0;
            return (
              <button key={id} onClick={() => setTab(id)}
                className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all flex items-center gap-1 ${tab === id ? "bg-slate-700 text-white font-semibold" : "text-slate-500 bg-sand hover:bg-gray-200"}`}>
                {label}
                {badge > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20" : "bg-gray-200"}`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Onglet enfant ── */}
      {currentChild && (() => {
        const child = currentChild;
        const childRes = reservations.filter((r: any) => r.childId === child.id);
        const upcoming = childRes.filter((r: any) => r.date >= today && r.status !== "cancelled").sort((a: any, b: any) => a.date.localeCompare(b.date));
        const past = childRes.filter((r: any) => r.date < today).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5);
        const bd = child.birthDate?.toDate ? child.birthDate.toDate() : child.birthDate ? new Date(child.birthDate) : null;
        const age = bd && !isNaN(bd.getTime()) ? Math.floor((Date.now() - bd.getTime()) / 31557600000) : null;

        return (
          <div className="flex flex-col gap-5">
            {/* En-tête */}
            <div className="flex items-center gap-3 pb-3 border-b border-blue-500/8">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-xl">🧒</div>
              <div className="flex-1">
                <div className="font-body text-base font-semibold text-blue-800">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</div>
                <div className="font-body text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  {bd && !isNaN(bd.getTime()) && <span>Né(e) le {bd.toLocaleDateString("fr-FR")}</span>}
                  {age !== null && age >= 0 && <span className="text-blue-500 font-semibold">{age} ans</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>{child.galopLevel && child.galopLevel !== "—" ? child.galopLevel : "Débutant"}</Badge>
                {child.sanitaryForm ? <Badge color="green">Fiche OK</Badge> : <Badge color="red">Fiche manquante</Badge>}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-wrap -mt-2 pb-3 border-b border-blue-500/8">
              {onInscribe && <button onClick={() => onInscribe(child.id, child.firstName)} className="font-body text-[11px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1"><CalendarDays size={11}/> Inscrire</button>}
              {onEditSanitary && <button onClick={() => onEditSanitary(child)} className="font-body text-[11px] text-green-600 bg-green-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-green-100">Fiche sanitaire</button>}
              {onEditGalop && <button onClick={() => onEditGalop(child.id)} className="font-body text-[11px] text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-purple-100">Changer niveau</button>}
              {onBilanPdf && <button onClick={() => onBilanPdf(child)} className="font-body text-[11px] text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-indigo-100">🖨 Bilan PDF</button>}
              {onEditChild && <button onClick={() => onEditChild(child)} className="font-body text-[11px] text-slate-600 bg-gray-100 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-gray-200">✏️ Modifier</button>}
              {onDeleteChild && <button onClick={() => onDeleteChild(child.id, child.firstName)} className="font-body text-[11px] text-red-400 bg-red-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100">🗑 Suppr.</button>}
            </div>

            {/* Fiche sanitaire */}
            {child.sanitaryForm && (
              <div className="bg-green-50 rounded-xl px-4 py-3">
                <div className="font-body text-[10px] text-green-600 uppercase tracking-wider font-semibold mb-1">Fiche sanitaire</div>
                <div className="font-body text-xs text-slate-600 flex flex-wrap gap-3">
                  <span>Allergies : {child.sanitaryForm.allergies || "Aucune"}</span>
                  <span className="text-slate-400">Urgence : {child.sanitaryForm.emergencyContactName} ({child.sanitaryForm.emergencyContactPhone})</span>
                </div>
              </div>
            )}

            {/* Prochaines séances */}
            <div>
              <div className="font-body text-[10px] text-green-600 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1"><CalendarDays size={12} /> Prochaines séances ({upcoming.length})</div>
              {upcoming.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucune séance à venir.</p> : (
                <div className="flex flex-col gap-1">
                  {upcoming.slice(0, 8).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-green-700 font-semibold min-w-[80px]">{new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
                        <span className="text-slate-500">{r.startTime}–{r.endTime}</span>
                        <span className="text-blue-800 font-semibold">{r.activityTitle}</span>
                      </div>
                      <button title="Annuler" onClick={async () => {
                        if (!confirm(`Annuler ${child.firstName} le ${new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR")} ?`)) return;
                        await updateDoc(doc(db, "reservations", r.id), { status: "cancelled", cancelledAt: new Date().toISOString() });
                        if (r.creneauId) { const cs = await getDoc(doc(db, "creneaux", r.creneauId)); if (cs.exists()) { const enrolled = (cs.data().enrolled || []).filter((e: any) => !(e.childId === r.childId && e.familyId === r.familyId)); await updateDoc(doc(db, "creneaux", r.creneauId), { enrolled, enrolledCount: enrolled.length }); } }
                        fetchFamilies();
                      }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><Trash2 size={11} /></button>
                    </div>
                  ))}
                  {upcoming.length > 8 && <p className="font-body text-[10px] text-slate-400 text-center">+{upcoming.length - 8} autres</p>}
                </div>
              )}
              {past.length > 0 && (
                <div className="mt-2">
                  <div className="font-body text-[10px] text-slate-400 font-semibold mb-1">Passées</div>
                  {past.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-2 font-body text-xs py-1 px-3 text-slate-500">
                      <span className="min-w-[70px]">{new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                      <span>{r.activityTitle}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progression FFE */}
            <div>
              <div className="font-body text-[10px] text-purple-600 font-semibold uppercase tracking-wider mb-2">📈 Progression FFE</div>
              <ProgressionEditor childId={child.id} familyId={fid} childName={child.firstName} galopLevel={child.galopLevel} />
            </div>

            {/* Suivi pédagogique */}
            <PedaSuiviCard child={child} familyId={fid} onRefresh={fetchFamilies} />
          </div>
        );
      })()}

      {/* ── Paiements ── */}
      {tab === "paiements" && (
        <div>
          {payments.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucun paiement enregistré.</p> : (
            <div className="flex flex-col gap-1">
              {payments.slice(0, 10).map((p: any) => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-slate-500 min-w-[65px] flex-shrink-0">{d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</span>
                      <span className="text-blue-800 font-semibold truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement"}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                      <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "red"}>{p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : "À régler"}</Badge>
                      <button onClick={async e => {
                        e.stopPropagation();
                        const invDate = d || new Date();
                        const civilite = family?.civilite ? `${family.civilite} ` : "";
                        const adresseLines = [family?.address, [family?.zipCode, family?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                        const invoiceNumber = p.orderId || `F-${invDate.getFullYear()}${String(invDate.getMonth()+1).padStart(2,"0")}-${(p.id||"").slice(-4).toUpperCase()}`;
                        const items = (p.items||[]).map((i: any) => ({ label: i.activityTitle||"Prestation", priceHT: i.priceHT||Math.round((i.priceTTC||0)/1.055*100)/100, tva: i.tva||5.5, priceTTC: i.priceTTC||0 }));
                        const totalHT = items.reduce((s: number, i: any) => s+(i.priceHT||0), 0);

                        // Charger le détail des encaissements pour cette commande,
                        // afin d'afficher chaque ligne sur la facture au lieu de "mixte"
                        let paymentDetails: any[] = [];
                        try {
                          const encSnap = await getDocs(query(
                            collection(db, "encaissements"),
                            where("paymentId", "==", p.id)
                          ));
                          paymentDetails = encSnap.docs
                            .map(d => d.data() as any)
                            .filter(e => (e.montant || 0) > 0)
                            .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
                            .map(e => ({
                              mode: e.mode,
                              modeLabel: modeLabels[e.mode] || e.modeLabel || e.mode,
                              montant: Number(e.montant || 0),
                              date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : undefined,
                              ref: e.ref,
                            }));
                        } catch { /* silencieux : fallback sur paymentMode */ }

                        await downloadInvoicePdf({
                          invoiceNumber, date: invDate.toLocaleDateString("fr-FR"),
                          familyName: `${civilite}${family.parentName||p.familyName}`,
                          familyEmail: family.parentEmail||"", familyAddress: adresseLines,
                          items, totalHT, totalTVA: (p.totalTTC||0)-totalHT, totalTTC: p.totalTTC||0,
                          paidAmount: p.paidAmount||p.totalTTC||0,
                          paymentMode: modeLabels[p.paymentMode]||p.paymentMode||"",
                          paymentDate: p.status==="paid" ? invDate.toLocaleDateString("fr-FR") : "",
                          paymentDetails: paymentDetails.length > 0 ? paymentDetails : undefined,
                        });
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

      {/* ── Divers ── */}
      {tab === "divers" && (
        <div className="flex flex-col gap-4">
          {(family.linkedChildren || []).length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><UserPlus size={10} /> Cavaliers liés</div>
              {(family.linkedChildren || []).map((lc: any) => (
                <div key={lc.childId} className="flex items-center justify-between px-3 py-2 bg-teal-50 rounded-lg border border-teal-100 mb-1">
                  <div><span className="font-body text-sm font-semibold text-teal-800">{lc.childName}</span><div className="font-body text-[10px] text-teal-600">{lc.sourceFamilyName}</div></div>
                  <button onClick={async () => { if (!confirm(`Retirer ${lc.childName} ?`)) return; const newLinked = (family.linkedChildren || []).filter((c: any) => c.childId !== lc.childId); await updateDoc(doc(db, "families", fid), { linkedChildren: newLinked }); fetchFamilies(); }} className="text-red-400 bg-transparent border-none cursor-pointer"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Wallet size={10} /> Avoirs & avances ({avoirs.length})</div>
            {avoirs.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucun avoir.</p> : avoirs.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                <div className="flex items-center gap-2"><Badge color={a.status === "actif" ? "green" : "gray"}>{a.status}</Badge><span className="text-blue-800">{a.reference}</span><span className="text-slate-400">{a.reason}</span></div>
                <span className={`font-semibold ${a.remainingAmount > 0 ? "text-blue-500" : "text-slate-300"}`}>{(a.remainingAmount||0).toFixed(2)}€</span>
              </div>
            ))}
          </div>
          {famCartes.length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">🎟️ Cartes ({famCartes.length})</div>
              {famCartes.map((c: any) => { const expired = c.dateFin && new Date(c.dateFin) < new Date(); return (
                <div key={c.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                  <div className="flex items-center gap-2"><Badge color={c.status === "active" && !expired ? "green" : "gray"}>{c.status === "active" && !expired ? "Active" : "Expirée"}</Badge><span className="text-blue-800">{c.activityType}</span></div>
                  <span className="font-semibold text-blue-500">{c.remainingSessions||0}/{c.totalSessions||0}</span>
                </div>
              ); })}
            </div>
          )}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>🏦 Mandat SEPA</span>
              {!editingMandat && <button onClick={() => { setMandatForm({ iban: mandat?.iban || "", bic: mandat?.bic || "", titulaire: mandat?.titulaire || family.parentName || "", dateSignature: mandat?.dateSignature || new Date().toISOString().split("T")[0] }); setEditingMandat(true); }} className="font-body text-[10px] text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1"><Plus size={10} /> {mandat ? "Modifier" : "Ajouter"}</button>}
            </div>
            {editingMandat ? (
              <div className="bg-blue-50 rounded-lg p-3 flex flex-col gap-2">
                <input placeholder="IBAN *" value={mandatForm.iban} onChange={e => setMandatForm({ ...mandatForm, iban: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs font-mono focus:outline-none focus:border-blue-500 bg-white" />
                <div className="flex gap-2">
                  <input placeholder="BIC" value={mandatForm.bic} onChange={e => setMandatForm({ ...mandatForm, bic: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                  <input placeholder="Titulaire *" value={mandatForm.titulaire} onChange={e => setMandatForm({ ...mandatForm, titulaire: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                </div>
                <input type="date" value={mandatForm.dateSignature} onChange={e => setMandatForm({ ...mandatForm, dateSignature: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                <div className="flex gap-2">
                  <button onClick={handleSaveMandat} disabled={mandatSaving || !mandatForm.iban || !mandatForm.titulaire} className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">{mandatSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer</button>
                  <button onClick={() => setEditingMandat(false)} className="font-body text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                </div>
              </div>
            ) : mandat ? (
              <div className="font-body text-xs py-2 px-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-1"><Badge color="green">Actif</Badge><span className="text-blue-800 font-semibold">{mandat.mandatId}</span></div>
                <div className="text-slate-500">IBAN : {mandat.iban?.slice(0,4)}...{mandat.iban?.slice(-4)}</div>
                <div className="text-slate-500">Titulaire : {mandat.titulaire}</div>
              </div>
            ) : <p className="font-body text-xs text-slate-400 italic">Aucun mandat SEPA.</p>}
          </div>
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

      {/* ── Notes ── */}
      {tab === "notes" && (
        <div>
          <textarea defaultValue={family.notes || ""} onBlur={async e => { if (e.target.value !== (family.notes || "")) { await updateDoc(doc(db, "families", fid), { notes: e.target.value, updatedAt: serverTimestamp() }); fetchFamilies(); } }}
            placeholder="Notes visibles uniquement par l'admin..."
            className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[80px] resize-y" />
          <p className="font-body text-[10px] text-slate-400 mt-1">Sauvegarde automatique quand vous cliquez en dehors.</p>
        </div>
      )}
    </div>
  );
}
