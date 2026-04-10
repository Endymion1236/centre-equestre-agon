"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Plus, Trash2, Send, Check, Loader2, X, Copy, FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { Family } from "@/types";
import { authFetch } from "@/lib/auth-fetch";

interface DevisItem {
  label: string;
  description?: string;
  qty: number;
  priceTTC: number;
  tva: number;
}

interface Devis {
  id?: string;
  numero: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  items: DevisItem[];
  totalTTC: number;
  status: "draft" | "sent" | "accepted" | "refused" | "converted";
  note?: string;
  createdAt?: any;
  sentAt?: any;
  validUntil?: string;
}

const statusColors: Record<string, "gray"|"blue"|"green"|"red"|"orange"> = {
  draft: "gray", sent: "blue", accepted: "green", refused: "red", converted: "orange",
};
const statusLabels: Record<string, string> = {
  draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", refused: "Refusé", converted: "Converti",
};

const QUICK_LINES = [
  { label: "Forfait annuel 1×/semaine", priceTTC: 650, tva: 5.5 },
  { label: "Forfait annuel 2×/semaine", priceTTC: 1100, tva: 5.5 },
  { label: "Forfait annuel 3×/semaine", priceTTC: 1400, tva: 5.5 },
  { label: "Adhésion 1er enfant", priceTTC: 60, tva: 5.5 },
  { label: "Adhésion 2ème enfant", priceTTC: 40, tva: 5.5 },
  { label: "Adhésion 3ème enfant", priceTTC: 20, tva: 5.5 },
  { label: "Licence FFE -18 ans", priceTTC: 25, tva: 0 },
  { label: "Licence FFE +18 ans", priceTTC: 36, tva: 0 },
  { label: "Stage vacances semaine", priceTTC: 175, tva: 5.5 },
  { label: "Stage journée", priceTTC: 45, tva: 5.5 },
  { label: "Assurance occasionnelle 1 mois", priceTTC: 10, tva: 20 },
];

const inp = "w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

export default function DevisPage() {
  const [devisList, setDevisList] = useState<Devis[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [selFamily, setSelFamily] = useState("");
  const [familySearch, setFamilySearch] = useState("");
  const [items, setItems] = useState<DevisItem[]>([{ label: "", qty: 1, priceTTC: 0, tva: 5.5 }]);
  const [note, setNote] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [showQuick, setShowQuick] = useState(false);

  const { setAgentContext } = useAgentContext("devis");

  const fetchData = async () => {
    const [devSnap, famSnap] = await Promise.all([
      getDocs(query(collection(db, "devis"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "families")),
    ]);
    const devData = devSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Devis[];
    setDevisList(devData);
    setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    setLoading(false);

    // Contexte agent
    setAgentContext({
      devis_en_cours: devData.filter(d => d.status === "draft" || d.status === "sent").map(d => ({
        numero: d.numero,
        famille: d.familyName,
        total: `${d.totalTTC.toFixed(2)}€`,
        statut: d.status,
        valide_jusqu: d.validUntil,
      })),
      devis_count: devData.length,
      devis_draft: devData.filter(d => d.status === "draft").length,
      devis_envoyes: devData.filter(d => d.status === "sent").length,
    });
  };
  useEffect(() => { fetchData(); }, []);

  const totalTTC = items.reduce((s, i) => s + (i.qty || 1) * (i.priceTTC || 0), 0);
  const fam = families.find(f => f.firestoreId === selFamily);
  const filteredFams = familySearch
    ? families.filter(f => f.parentName?.toLowerCase().includes(familySearch.toLowerCase()))
    : families;

  const genNumero = () => {
    const d = new Date();
    return `DEV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}-${String(devisList.length + 1).padStart(3,"0")}`;
  };

  const handleSave = async () => {
    if (!selFamily || !fam || items.every(i => !i.label)) return;
    setSaving(true);
    try {
      const payload: Omit<Devis, "id"> = {
        numero: genNumero(),
        familyId: selFamily,
        familyName: fam.parentName || "",
        familyEmail: (fam as any).parentEmail || "",
        items: items.filter(i => i.label),
        totalTTC: Math.round(totalTTC * 100) / 100,
        status: "draft",
        note,
        validUntil,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "devis"), payload);
      await fetchData();
      setShowForm(false);
      setItems([{ label: "", qty: 1, priceTTC: 0, tva: 5.5 }]);
      setSelFamily(""); setNote(""); setFamilySearch("");
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSend = async (d: Devis) => {
    if (!d.familyEmail) { alert("Pas d'email pour cette famille."); return; }
    setSendingId(d.id!);
    try {
      // Générer le HTML du devis
      const lignesHtml = d.items.map(i => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e3a5f;">${i.label}${i.description ? `<br><span style="font-size:11px;color:#94a3b8;">${i.description}</span>` : ""}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569;">${i.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;">${i.priceTTC.toFixed(2)}€</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;color:#1e3a5f;">${((i.qty || 1) * i.priceTTC).toFixed(2)}€</td>
        </tr>`).join("");

      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0C1A2E;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:#F0A010;margin:0;font-size:22px;">🐴 Centre Équestre d'Agon-Coutainville</h1>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Devis ${d.numero}</p>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#1e3a5f;">Bonjour <strong>${d.familyName}</strong>,</p>
          <p style="color:#555;">Voici votre devis pour la saison équestre :</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Prestation</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;">Qté</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Prix unit.</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Total</th>
              </tr>
            </thead>
            <tbody>${lignesHtml}</tbody>
            <tfoot>
              <tr style="background:#f0fdf4;">
                <td colspan="3" style="padding:12px;font-weight:bold;color:#1e3a5f;">Total TTC</td>
                <td style="padding:12px;text-align:right;font-size:20px;font-weight:bold;color:#1e3a5f;">${d.totalTTC.toFixed(2)}€</td>
              </tr>
            </tfoot>
          </table>
          ${d.note ? `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;"><p style="margin:0;color:#854d0e;font-size:13px;">📝 ${d.note}</p></div>` : ""}
          <p style="color:#555;font-size:13px;">Ce devis est valable jusqu'au <strong>${d.validUntil ? new Date(d.validUntil).toLocaleDateString("fr-FR") : "30 jours"}</strong>.</p>
          <p style="color:#555;font-size:13px;">Pour accepter ce devis ou pour toute question, contactez-nous au centre équestre.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville — Agon-Coutainville, Normandie</p>
        </div>
      </div>`;

      await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: d.familyEmail,
          subject: `Devis ${d.numero} — Centre Équestre d'Agon-Coutainville`,
          html,
        }),
      });

      await updateDoc(doc(db, "devis", d.id!), { status: "sent", sentAt: serverTimestamp() });
      await fetchData();
    } catch (e) { console.error(e); alert("Erreur envoi email"); }
    setSendingId(null);
  };

  const handleConvert = async (d: Devis) => {
    if (!confirm(`Convertir le devis ${d.numero} en commande pending pour ${d.familyName} ?`)) return;
    try {
      await addDoc(collection(db, "payments"), {
        familyId: d.familyId,
        familyName: d.familyName,
        items: d.items.map(i => ({
          activityTitle: i.label,
          childName: "",
          priceHT: Math.round(i.priceTTC / (1 + i.tva / 100) * 100) / 100,
          tva: i.tva,
          priceTTC: Math.round((i.qty || 1) * i.priceTTC * 100) / 100,
        })),
        totalTTC: d.totalTTC,
        paidAmount: 0,
        status: "pending",
        paymentMode: "",
        source: "devis",
        devisId: d.id,
        devisNumero: d.numero,
        date: serverTimestamp(),
      });
      await updateDoc(doc(db, "devis", d.id!), { status: "converted", convertedAt: serverTimestamp() });
      await fetchData();
      alert(`✅ Commande créée ! Visible dans Paiements → Impayés.`);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (d: Devis) => {
    if (!confirm(`Supprimer le devis ${d.numero} ?`)) return;
    await deleteDoc(doc(db, "devis", d.id!));
    await fetchData();
  };

  const filtered = filterStatus === "all" ? devisList : devisList.filter(d => d.status === filterStatus);

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Devis</h1>
          <p className="font-body text-sm text-slate-500 mt-1">Créez et envoyez des devis aux familles</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau devis
        </button>
      </div>

      {/* Formulaire nouveau devis */}
      {showForm && (
        <Card padding="md" className="mb-6 border-blue-500/20">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouveau devis</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
          <div className="flex flex-col gap-4">
            {/* Famille */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Famille *</label>
              <input value={familySearch} onChange={e => { setFamilySearch(e.target.value); setSelFamily(""); }}
                placeholder="Rechercher une famille..." className={inp} />
              {familySearch && !selFamily && (
                <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  {filteredFams.slice(0, 6).map(f => (
                    <button key={f.firestoreId} onClick={() => { setSelFamily(f.firestoreId); setFamilySearch(f.parentName || ""); }}
                      className="w-full text-left px-3 py-2 font-body text-sm hover:bg-blue-50 bg-white border-none cursor-pointer border-b border-gray-100 last:border-0">
                      <div className="font-semibold text-blue-800">{f.parentName}</div>
                      <div className="text-xs text-slate-400">{(f as any).parentEmail}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Validité */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Valable jusqu'au</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inp} />
              </div>
            </div>

            {/* Lignes rapides */}
            <div>
              <button onClick={() => setShowQuick(!showQuick)}
                className="flex items-center gap-2 font-body text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100 mb-2">
                ⚡ Lignes rapides {showQuick ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
              </button>
              {showQuick && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {QUICK_LINES.map(q => (
                    <button key={q.label} onClick={() => setItems(prev => [...prev.filter(i => i.label), { label: q.label, qty: 1, priceTTC: q.priceTTC, tva: q.tva }])}
                      className="px-3 py-1.5 rounded-lg border border-blue-200 bg-white font-body text-xs text-blue-700 cursor-pointer hover:bg-blue-50">
                      {q.label} — {q.priceTTC}€
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Lignes du devis</label>
              <div className="flex flex-col gap-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.label} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                      placeholder="Prestation..." className={`col-span-5 ${inp}`} />
                    <input type="number" min="1" value={item.qty} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: parseInt(e.target.value) || 1 } : it))}
                      className={`col-span-1 ${inp} text-center`} />
                    <input type="number" step="0.01" value={item.priceTTC} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, priceTTC: parseFloat(e.target.value) || 0 } : it))}
                      placeholder="Prix €" className={`col-span-3 ${inp} text-right`} />
                    <select value={item.tva} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, tva: parseFloat(e.target.value) } : it))}
                      className={`col-span-2 ${inp}`}>
                      <option value={0}>0%</option>
                      <option value={5.5}>5,5%</option>
                      <option value={10}>10%</option>
                      <option value={20}>20%</option>
                    </select>
                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer flex justify-center">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
                <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-400 px-1">
                  <span className="col-span-5">Libellé</span><span className="col-span-1 text-center">Qté</span>
                  <span className="col-span-3 text-right">Prix TTC</span><span className="col-span-2">TVA</span>
                </div>
              </div>
              <button onClick={() => setItems(prev => [...prev, { label: "", qty: 1, priceTTC: 0, tva: 5.5 }])}
                className="mt-2 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline">
                + Ajouter une ligne
              </button>
            </div>

            {/* Note */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Note (optionnel)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="Conditions particulières, message personnalisé..." className={`${inp} resize-none`} />
            </div>

            {/* Total + bouton */}
            <div className="flex items-center justify-between pt-2 border-t border-blue-500/8">
              <div>
                <div className="font-body text-xs text-slate-500">Total TTC</div>
                <div className="font-body text-2xl font-bold text-blue-500">{totalTTC.toFixed(2)}€</div>
              </div>
              <button onClick={handleSave} disabled={!selFamily || saving || items.every(i => !i.label)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${(!selFamily || saving || items.every(i => !i.label)) ? "bg-gray-200 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>}
                Créer le devis
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["all", "Tous"], ["draft", "Brouillons"], ["sent", "Envoyés"], ["accepted", "Acceptés"], ["converted", "Convertis"], ["refused", "Refusés"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilterStatus(id)}
            className={`px-4 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${filterStatus === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            {label} {id === "all" ? `(${devisList.length})` : `(${devisList.filter(d => d.status === id).length})`}
          </button>
        ))}
      </div>

      {/* Liste des devis */}
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
      : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FileText size={32} className="text-slate-300 mx-auto mb-2"/>
          <p className="font-body text-sm text-slate-500">Aucun devis pour l'instant.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(d => (
            <Card key={d.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-body text-xs text-slate-400">{d.numero}</span>
                    <Badge color={statusColors[d.status]}>{statusLabels[d.status]}</Badge>
                    {d.validUntil && new Date(d.validUntil) < new Date() && d.status !== "converted" && (
                      <span className="font-body text-[10px] text-red-500 bg-red-50 px-2 py-0.5 rounded">Expiré</span>
                    )}
                  </div>
                  <div className="font-body text-base font-semibold text-blue-800 mt-1">{d.familyName}</div>
                  <div className="font-body text-xs text-slate-500">
                    {d.items.length} ligne{d.items.length > 1 ? "s" : ""} · valable jusqu'au {d.validUntil ? new Date(d.validUntil).toLocaleDateString("fr-FR") : "—"}
                    {d.createdAt?.seconds && ` · Créé le ${new Date(d.createdAt.seconds * 1000).toLocaleDateString("fr-FR")}`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-body text-xl font-bold text-blue-500">{d.totalTTC.toFixed(2)}€</div>
                </div>
              </div>

              {/* Items dépliables */}
              <button onClick={() => setExpandedId(expandedId === d.id ? null : d.id!)}
                className="flex items-center gap-1 font-body text-xs text-slate-400 mt-2 bg-transparent border-none cursor-pointer hover:text-blue-500">
                {expandedId === d.id ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                {expandedId === d.id ? "Masquer" : "Voir le détail"}
              </button>

              {expandedId === d.id && (
                <div className="mt-3 pt-3 border-t border-blue-500/8">
                  {d.items.map((item, i) => (
                    <div key={i} className="flex justify-between font-body text-xs py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-slate-600">{item.qty > 1 ? `${item.qty}× ` : ""}{item.label}</span>
                      <span className="font-semibold text-blue-800">{((item.qty || 1) * item.priceTTC).toFixed(2)}€</span>
                    </div>
                  ))}
                  {d.note && <div className="mt-2 font-body text-xs text-slate-400 italic">📝 {d.note}</div>}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {(d.status === "draft" || d.status === "sent") && (
                  <button onClick={() => handleSend(d)} disabled={sendingId === d.id}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {sendingId === d.id ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>}
                    {d.status === "sent" ? "Renvoyer" : "Envoyer"}
                  </button>
                )}
                {(d.status === "sent" || d.status === "accepted") && (
                  <button onClick={() => handleConvert(d)}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-lg border-none cursor-pointer">
                    <Check size={12}/> Convertir en commande
                  </button>
                )}
                {d.status === "sent" && (
                  <>
                    <button onClick={async () => { await updateDoc(doc(db, "devis", d.id!), { status: "accepted" }); await fetchData(); }}
                      className="font-body text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-green-100">
                      ✓ Marquer accepté
                    </button>
                    <button onClick={async () => { await updateDoc(doc(db, "devis", d.id!), { status: "refused" }); await fetchData(); }}
                      className="font-body text-xs text-red-400 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
                      ✕ Refusé
                    </button>
                  </>
                )}
                {d.status === "draft" && (
                  <button onClick={() => handleDelete(d)}
                    className="font-body text-xs text-slate-400 bg-gray-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-100 hover:text-red-400">
                    <Trash2 size={12} className="inline mr-1"/>Supprimer
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
