"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Plus, Trash2, Send, Check, Loader2, X, Copy, FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { Family } from "@/types";
import { authFetch } from "@/lib/auth-fetch";
import { calculerForfaitAnnuel, type ForfaitTarifs, type FamilyDiscountRule } from "@/lib/forfait-pricing";

interface DevisItem {
  label: string;
  description?: string;
  qty: number;
  priceTTC: number;       // prix unitaire TTC (plein)
  tva: number;
  remisePct?: number;     // remise en % appliquée à la ligne
}

/** Total TTC d'une ligne, remise comprise. */
const lineTTC = (i: { qty?: number; priceTTC?: number; remisePct?: number }) =>
  Math.round((i.qty || 1) * (i.priceTTC || 0) * (1 - (i.remisePct || 0) / 100) * 100) / 100;

// Tarifs par défaut (fallback si settings absent). Source réelle : Firestore
// settings/inscription + settings/degressivite (mêmes valeurs que l'inscription).
const TARIFS_DEFAUT: ForfaitTarifs = {
  forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
  adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
  licenceMoins18: 25, licencePlus18: 36,
};

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

  // Tarifs + règles de dégressivité (mêmes valeurs que l'inscription annuelle)
  const [tarifs, setTarifs] = useState<ForfaitTarifs>(TARIFS_DEFAUT);
  const [familyRules, setFamilyRules] = useState<FamilyDiscountRule[]>([]);

  // Panneau "Inscription annuelle" (génère des lignes avec dégressivité)
  const [showInscr, setShowInscr] = useState(false);
  const [pFreq, setPFreq] = useState<1 | 2 | 3>(1);
  const [pRang, setPRang] = useState(1);
  const [pDeja, setPDeja] = useState(0);          // fréquence déjà inscrite (différentiel cours)
  const [pAdhesion, setPAdhesion] = useState(true);
  const [pLicence, setPLicence] = useState(true);
  const [pMoins18, setPMoins18] = useState(true);
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

  // Charge tarifs (settings/inscription) + dégressivité famille (settings/degressivite)
  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, "settings", "inscription"));
        if (s.exists()) {
          const d = s.data() as any;
          setTarifs({
            forfait1x: d.forfait1x ?? TARIFS_DEFAUT.forfait1x,
            forfait2x: d.forfait2x ?? TARIFS_DEFAUT.forfait2x,
            forfait3x: d.forfait3x ?? TARIFS_DEFAUT.forfait3x,
            adhesion1: d.adhesion1 ?? TARIFS_DEFAUT.adhesion1,
            adhesion2: d.adhesion2 ?? TARIFS_DEFAUT.adhesion2,
            adhesion3: d.adhesion3 ?? TARIFS_DEFAUT.adhesion3,
            adhesion4plus: d.adhesion4plus ?? TARIFS_DEFAUT.adhesion4plus,
            licenceMoins18: d.licenceMoins18 ?? TARIFS_DEFAUT.licenceMoins18,
            licencePlus18: d.licencePlus18 ?? TARIFS_DEFAUT.licencePlus18,
          });
        }
      } catch (e) { console.warn("settings/inscription:", e); }
      try {
        const g = await getDoc(doc(db, "settings", "degressivite"));
        if (g.exists()) {
          const rules = (g.data() as any).familyDiscountRules;
          if (Array.isArray(rules)) setFamilyRules(rules);
        }
      } catch (e) { console.warn("settings/degressivite:", e); }
    })();
  }, []);

  const totalTTC = items.reduce((s, i) => s + lineTTC(i), 0);
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

  /** Génère les lignes d'une inscription annuelle avec TOUTE la dégressivité
   *  (cours via le différentiel, famille via le rang + réduction), identique
   *  au calcul de l'inscription en ligne. */
  const ajouterInscription = () => {
    const res = calculerForfaitAnnuel({
      frequence: pFreq,
      sessionsRestantes: 1, sessionsTotalSaison: 1, // devis = saison pleine (prorata 100%)
      rangEnfant: pRang,
      avecAdhesion: pAdhesion,
      avecLicence: pLicence,
      licenceMoins18: pMoins18,
      tarifs,
      familyDiscountRules: familyRules,
      frequenceDejaInscrite: pDeja,
    });
    const nouvelles: DevisItem[] = res.detailLignes
      .filter(l => Math.round(l.montantTTC * 100) !== 0)
      .map(l => ({ label: l.label, qty: 1, priceTTC: Math.round(l.montantTTC * 100) / 100, tva: /licence/i.test(l.label) ? 0 : 5.5 }));
    setItems(prev => [...prev.filter(i => i.label), ...nouvelles]);
    setShowInscr(false);
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
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;">${i.priceTTC.toFixed(2)}€${i.remisePct ? ` <span style="color:#dc2626;">(-${i.remisePct}%)</span>` : ""}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;color:#1e3a5f;">${lineTTC(i).toFixed(2)}€</td>
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
          context: "admin_devis",
          template: "devis",
          familyId: d.familyId,
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
        items: d.items.map(i => {
          const unitNet = (i.priceTTC || 0) * (1 - (i.remisePct || 0) / 100);
          return {
            activityTitle: i.label,
            childName: "",
            priceHT: Math.round(unitNet / (1 + i.tva / 100) * 100) / 100,
            tva: i.tva,
            priceTTC: lineTTC(i),
          };
        }),
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

            {/* Inscription annuelle (dégressivité câblée) */}
            <div>
              <button onClick={() => setShowInscr(!showInscr)}
                className="flex items-center gap-2 font-body text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-emerald-100 mb-2">
                🎓 Inscription annuelle (dégressivité) {showInscr ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
              </button>
              {showInscr && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 mb-3 flex flex-col gap-3">
                  <p className="font-body text-[11px] text-emerald-800/80">
                    Génère les lignes avec toute la dégressivité (différentiel cours + rang famille + adhésion/licence), calculées comme l'inscription en ligne. Tarifs lus depuis les Paramètres.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="font-body text-xs text-slate-600">Cours/semaine ajoutés
                      <select value={pFreq} onChange={e => setPFreq(Number(e.target.value) as 1 | 2 | 3)} className={inp}>
                        <option value={1}>1×/semaine</option><option value={2}>2×/semaine</option><option value={3}>3×/semaine</option>
                      </select>
                    </label>
                    <label className="font-body text-xs text-slate-600">Déjà inscrit (×/sem)
                      <select value={pDeja} onChange={e => setPDeja(Number(e.target.value))} className={inp}>
                        <option value={0}>0 (1ère inscr.)</option><option value={1}>1×</option><option value={2}>2×</option>
                      </select>
                    </label>
                    <label className="font-body text-xs text-slate-600">Rang de l'enfant
                      <select value={pRang} onChange={e => setPRang(Number(e.target.value))} className={inp}>
                        <option value={1}>1er enfant</option><option value={2}>2e enfant</option><option value={3}>3e enfant</option><option value={4}>4e+ enfant</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="font-body text-xs text-slate-700 flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={pAdhesion} onChange={e => setPAdhesion(e.target.checked)} /> Adhésion
                    </label>
                    <label className="font-body text-xs text-slate-700 flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={pLicence} onChange={e => setPLicence(e.target.checked)} /> Licence FFE
                    </label>
                    {pLicence && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setPMoins18(true)} className={`px-2 py-1 rounded text-xs font-semibold border ${pMoins18 ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200"}`}>-18 ans</button>
                        <button type="button" onClick={() => setPMoins18(false)} className={`px-2 py-1 rounded text-xs font-semibold border ${!pMoins18 ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200"}`}>+18 ans</button>
                      </div>
                    )}
                  </div>
                  <button onClick={ajouterInscription}
                    className="self-start px-3 py-2 rounded-lg bg-emerald-600 text-white font-body text-xs font-semibold border-none cursor-pointer hover:bg-emerald-500">
                    + Ajouter ces lignes au devis
                  </button>
                </div>
              )}
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
                      placeholder="Prestation..." className={`col-span-4 ${inp}`} />
                    <input type="number" min="1" value={item.qty} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: parseInt(e.target.value) || 1 } : it))}
                      className={`col-span-1 ${inp} text-center`} />
                    <input type="number" step="0.01" value={item.priceTTC} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, priceTTC: parseFloat(e.target.value) || 0 } : it))}
                      placeholder="Prix €" className={`col-span-2 ${inp} text-right`} />
                    <input type="number" step="1" min="0" max="100" value={item.remisePct ?? ""} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, remisePct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) } : it))}
                      placeholder="0" className={`col-span-2 ${inp} text-center ${item.remisePct ? "border-rose-400 text-rose-600 font-semibold" : ""}`} />
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
                  <span className="col-span-4">Libellé</span><span className="col-span-1 text-center">Qté</span>
                  <span className="col-span-2 text-right">Prix TTC</span><span className="col-span-2 text-center">Remise %</span><span className="col-span-2">TVA</span>
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
