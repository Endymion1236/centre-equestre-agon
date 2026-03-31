"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { generateSepaXml, SEPA_CREDITOR } from "@/lib/sepa";
import type { SepaTransaction, SepaRemise } from "@/lib/sepa";
import type { Family } from "@/types";
import {
  Search, Plus, X, Save, Loader2, Download, Check, ChevronDown, ChevronUp,
  Building2, Users, Calendar, CreditCard, FileText, Trash2, CheckSquare, Square,
  AlertTriangle,
} from "lucide-react";

// ═══ Types ═══
interface MandatSepa {
  id: string;
  familyId: string;
  familyName: string;
  mandatId: string;      // ex: CEDC2190MD1
  iban: string;
  bic: string;
  dateSignature: string; // YYYY-MM-DD
  titulaire: string;     // Nom sur le compte bancaire
  status: "active" | "revoked";
  createdAt: any;
}

interface EcheanceSepa {
  id: string;
  familyId: string;
  familyName: string;
  mandatId: string;
  montant: number;
  dateEcheance: string; // YYYY-MM-DD
  reference: string;    // ex: "Facture N 9712"
  description: string;  // ex: "Forfait annuel 3/10"
  status: "pending" | "remis" | "preleve" | "rejete";
  remiseId: string | null;
  paymentId: string | null; // Lien vers le paiement correspondant
  orderId?: string | null;  // Lien vers le paiement de référence
  echeance?: number;
  echeancesTotal?: number;
  createdAt: any;
}

interface RemiseSepa {
  id: string;
  numero: number;
  dateRemise: string;
  datePrelevement: string;
  nbTransactions: number;
  montantTotal: number;
  status: "draft" | "generated" | "deposited";
  xmlFileName: string | null;
  createdAt: any;
}

// ═══ BIC lookup simplifié (premiers 5 chiffres IBAN FR → BIC) ═══
const BIC_LOOKUP: Record<string, string> = {
  "10007": "BDFEFRPP",    // Banque de France
  "10096": "CMCIFRPP",    // CIC
  "10278": "CMCIFRPP",    // CIC
  "12506": "AGRIFRPP",    // Crédit Agricole
  "13106": "AGRIFRPP",    // Crédit Agricole
  "13807": "CCBPFRPP",    // Banque Populaire
  "14445": "CEPAFRPP",    // Caisse d'Épargne
  "14518": "CEPAFRPP",    // Caisse d'Épargne
  "15489": "CMCIFR2A",    // Crédit Mutuel
  "16606": "AGRIFRPP866", // Crédit Agricole Normandie
  "16607": "AGRIFRPP866", // Crédit Agricole Normandie
  "17515": "CEPAFRPP",    // Caisse d'Épargne
  "20041": "PSSTFRPP",    // La Banque Postale
  "30002": "BNPAFRPP",    // BNP
  "30003": "SOGEFRPP",    // Société Générale
  "30004": "BNPAFRPPXXX", // BNP Paribas
  "30006": "AGRIFRPP",    // Crédit Agricole (autre)
  "30027": "CMCIFRPP",    // CIC
  "30056": "HSBNFRPP",    // HSBC
  "30076": "NORDFRPP",    // Banque de Savoie
  "11425": "CEPAFRPP142", // Caisse d'Épargne Normandie
};

function lookupBic(iban: string): string {
  if (!iban || iban.length < 9) return "";
  const code = iban.substring(4, 9);
  return BIC_LOOKUP[code] || "";
}

function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

// ═══ Composant principal ═══
export default function SepaPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"mandats" | "echeancier" | "remises">("mandats");
  const [loading, setLoading] = useState(true);

  // Data
  const [mandats, setMandats] = useState<MandatSepa[]>([]);
  const [echeances, setEcheances] = useState<EcheanceSepa[]>([]);
  const [remises, setRemises] = useState<RemiseSepa[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Search
  const [search, setSearch] = useState("");

  // Forms
  const [showNewMandat, setShowNewMandat] = useState(false);
  const [newMandat, setNewMandat] = useState({ familyId: "", iban: "", bic: "", titulaire: "", dateSignature: new Date().toISOString().split("T")[0] });
  const [showNewEcheancier, setShowNewEcheancier] = useState(false);
  const [newEcheancier, setNewEcheancier] = useState({ mandatId: "", montantTotal: "", nbEcheances: "10", dateDebut: "", description: "" });
  const [saving, setSaving] = useState(false);

  // Remise creation
  const [selectedEcheances, setSelectedEcheances] = useState<Set<string>>(new Set());

  // ─── Chargement ───
  const fetchAll = async () => {
    try {
      const [mandatsSnap, echSnap, remSnap, famSnap, paySnap] = await Promise.all([
        getDocs(collection(db, "mandats-sepa")),
        getDocs(collection(db, "echeances-sepa")),
        getDocs(collection(db, "remises-sepa")),
        getDocs(collection(db, "families")),
        getDocs(collection(db, "payments")),
      ]);
      setMandats(mandatsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as MandatSepa[]);
      setEcheances(echSnap.docs.map(d => ({ id: d.id, ...d.data() })) as EcheanceSepa[]);
      setRemises(remSnap.docs.map(d => ({ id: d.id, ...d.data() })) as RemiseSepa[]);
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as (Family & { firestoreId: string })[]);
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── Créer un mandat ───
  const handleCreateMandat = async () => {
    if (!newMandat.familyId || !newMandat.iban || !newMandat.titulaire) return;
    setSaving(true);
    try {
      const family = families.find(f => f.firestoreId === newMandat.familyId);
      const cleanIban = newMandat.iban.replace(/\s/g, "").toUpperCase();
      const bic = newMandat.bic || lookupBic(cleanIban);
      const nextMandatNum = mandats.length + 1;
      const mandatId = `CEDC${nextMandatNum}MD${Math.floor(Math.random() * 9000) + 1000}`;

      await addDoc(collection(db, "mandats-sepa"), {
        familyId: newMandat.familyId,
        familyName: family?.parentName || "",
        mandatId,
        iban: cleanIban,
        bic,
        dateSignature: newMandat.dateSignature,
        titulaire: newMandat.titulaire,
        status: "active",
        createdAt: serverTimestamp(),
      });
      toast("Mandat SEPA créé", "success");
      setShowNewMandat(false);
      setNewMandat({ familyId: "", iban: "", bic: "", titulaire: "", dateSignature: new Date().toISOString().split("T")[0] });
      fetchAll();
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
  };

  // ─── Créer un échéancier ───
  const handleCreateEcheancier = async () => {
    const mandat = mandats.find(m => m.id === newEcheancier.mandatId);
    if (!mandat || !newEcheancier.montantTotal || !newEcheancier.dateDebut) return;
    setSaving(true);
    try {
      const total = parseFloat(newEcheancier.montantTotal);
      const nb = parseInt(newEcheancier.nbEcheances);
      const montantEcheance = Math.floor(total / nb * 100) / 100;
      const reste = Math.round((total - montantEcheance * nb) * 100) / 100;

      const startDate = new Date(newEcheancier.dateDebut);

      for (let i = 0; i < nb; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        // Dernière échéance absorbe le reste
        const montant = i === nb - 1 ? montantEcheance + reste : montantEcheance;

        await addDoc(collection(db, "echeances-sepa"), {
          familyId: mandat.familyId,
          familyName: mandat.familyName,
          mandatId: mandat.mandatId,
          montant: Math.round(montant * 100) / 100,
          dateEcheance: dateStr,
          reference: "",
          description: newEcheancier.description || `Échéance ${i + 1}/${nb}`,
          status: "pending",
          remiseId: null,
          paymentId: null,
          createdAt: serverTimestamp(),
        });
      }

      toast(`${nb} échéances créées pour ${mandat.familyName}`, "success");
      setShowNewEcheancier(false);
      setNewEcheancier({ mandatId: "", montantTotal: "", nbEcheances: "10", dateDebut: "", description: "" });
      fetchAll();
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
  };

  // ─── Créer une remise SEPA ───
  const handleCreateRemise = async () => {
    if (selectedEcheances.size === 0) return;
    setSaving(true);
    try {
      const selected = echeances.filter(e => selectedEcheances.has(e.id) && e.status === "pending");
      if (selected.length === 0) { toast("Aucune échéance sélectionnée", "error"); setSaving(false); return; }

      const nextNum = remises.length + 1;
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const msgId = `CEDC${nextNum}PRLV`;
      const total = selected.reduce((s, e) => s + e.montant, 0);

      // Trouver la date de prélèvement (= date la plus proche parmi les échéances)
      const datePrlv = selected.map(e => e.dateEcheance).sort()[0];

      // Construire les transactions XML
      const transactions: SepaTransaction[] = selected.map((ech, i) => {
        const mandat = mandats.find(m => m.mandatId === ech.mandatId);
        return {
          instrId: `${msgId}M${i + 1}P${ech.id.slice(-5)}`,
          endToEndId: `M${i + 1}P${ech.id.slice(-5)}`,
          amount: ech.montant,
          mandatId: ech.mandatId,
          mandatDate: mandat?.dateSignature || todayStr,
          debtorName: mandat?.titulaire || ech.familyName,
          debtorIban: mandat?.iban || "",
          debtorBic: mandat?.bic || "",
          remittanceInfo: ech.reference || ech.description,
        };
      });

      const remiseData: SepaRemise = {
        msgId,
        creationDate: today.toISOString().split(".")[0],
        requestedDate: datePrlv,
        sequenceType: "RCUR",
        transactions,
      };

      // Générer le XML
      const xml = generateSepaXml(remiseData);
      const fileName = `SEPA_${nextNum}.xml`;

      // Sauvegarder la remise
      const remiseRef = await addDoc(collection(db, "remises-sepa"), {
        numero: nextNum,
        dateRemise: todayStr,
        datePrelevement: datePrlv,
        nbTransactions: selected.length,
        montantTotal: Math.round(total * 100) / 100,
        status: "generated",
        xmlFileName: fileName,
        xmlContent: xml,
        echeanceIds: selected.map(e => e.id),
        createdAt: serverTimestamp(),
      });

      // Mettre à jour les échéances
      for (const ech of selected) {
        await updateDoc(doc(db, "echeances-sepa", ech.id), {
          status: "remis",
          remiseId: remiseRef.id,
        });
      }

      // Télécharger le fichier XML
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      toast(`Remise ${fileName} créée — ${selected.length} prélèvements · ${total.toFixed(2)}€`, "success");
      setSelectedEcheances(new Set());
      fetchAll();
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
  };

  // ─── Re-télécharger un XML de remise ───
  const downloadRemise = async (remise: RemiseSepa) => {
    try {
      const snap = await getDocs(collection(db, "remises-sepa"));
      const r = snap.docs.find(d => d.id === remise.id);
      const xml = r?.data()?.xmlContent;
      if (!xml) { toast("XML non trouvé", "error"); return; }
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = remise.xmlFileName || `SEPA_${remise.numero}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast(e.message, "error"); }
  };

  // ─── Marquer une remise comme déposée ───
  const markDeposited = async (remiseId: string) => {
    await updateDoc(doc(db, "remises-sepa", remiseId), { status: "deposited" });
    // Marquer les échéances comme prélevées
    const remiseEcheances = echeances.filter(e => e.remiseId === remiseId);
    for (const ech of remiseEcheances) {
      await updateDoc(doc(db, "echeances-sepa", ech.id), { status: "preleve" });
    }

    // ── Mettre à jour les paiements de référence (sepa_scheduled → paid si tout est prélevé) ──
    const orderIds = [...new Set(remiseEcheances.map(e => e.orderId).filter(Boolean))];
    for (const orderId of orderIds) {
      const allForOrder = echeances.filter(e => e.orderId === orderId);
      const allPreleve = allForOrder.every(e => e.remiseId === remiseId || e.status === "preleve");
      if (allPreleve) {
        // Chercher le paiement de référence
        try {
          const paySnap = await getDocs(query(
            collection(db, "payments"),
            where("orderId", "==", orderId),
            where("status", "==", "sepa_scheduled")
          ));
          const totalPreleve = allForOrder.reduce((s, e) => s + (e.montant || 0), 0);
          for (const payDoc of paySnap.docs) {
            await updateDoc(doc(db, "payments", payDoc.id), {
              status: "paid",
              paidAmount: Math.round(totalPreleve * 100) / 100,
              paidAt: serverTimestamp(),
              paymentRef: `SEPA prélevé — remise ${remiseId.slice(-6)}`,
            });
          }
        } catch (e) { console.error("Mise à jour paiement SEPA:", e); }
      } else {
        // Mise à jour partielle : calculer le montant prélevé
        try {
          const paySnap = await getDocs(query(
            collection(db, "payments"),
            where("orderId", "==", orderId),
            where("status", "==", "sepa_scheduled")
          ));
          const totalPreleve = allForOrder
            .filter(e => e.remiseId === remiseId || e.status === "preleve")
            .reduce((s, e) => s + (e.montant || 0), 0);
          for (const payDoc of paySnap.docs) {
            await updateDoc(doc(db, "payments", payDoc.id), {
              paidAmount: Math.round(totalPreleve * 100) / 100,
            });
          }
        } catch (e) { console.error("Mise à jour partielle paiement SEPA:", e); }
      }
    }

    toast("Remise marquée comme déposée", "success");
    fetchAll();
  };

  // ─── Supprimer un mandat ───
  const handleDeleteMandat = async (id: string) => {
    if (!confirm("Supprimer ce mandat SEPA ?")) return;
    await deleteDoc(doc(db, "mandats-sepa", id));
    toast("Mandat supprimé", "success");
    fetchAll();
  };

  // ─── Supprimer une échéance ───
  const handleDeleteEcheance = async (id: string) => {
    if (!confirm("Supprimer cette échéance ?")) return;
    await deleteDoc(doc(db, "echeances-sepa", id));
    toast("Échéance supprimée", "success");
    fetchAll();
  };

  // ─── Filtres ───
  const filteredMandats = mandats.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.familyName?.toLowerCase().includes(q) || m.titulaire?.toLowerCase().includes(q) || m.mandatId?.toLowerCase().includes(q);
  });

  const pendingEcheances = echeances
    .filter(e => e.status === "pending")
    .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance));

  const filteredEcheances = pendingEcheances.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.familyName?.toLowerCase().includes(q) || e.mandatId?.toLowerCase().includes(q);
  });

  // Sélection auto des échéances du mois en cours
  const selectCurrentMonth = () => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ids = pendingEcheances.filter(e => e.dateEcheance.startsWith(monthStr)).map(e => e.id);
    setSelectedEcheances(new Set(ids));
  };

  const toggleEcheance = (id: string) => {
    const s = new Set(selectedEcheances);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedEcheances(s);
  };

  const selectAll = () => {
    if (selectedEcheances.size === filteredEcheances.length) {
      setSelectedEcheances(new Set());
    } else {
      setSelectedEcheances(new Set(filteredEcheances.map(e => e.id)));
    }
  };

  const selectedTotal = echeances
    .filter(e => selectedEcheances.has(e.id))
    .reduce((s, e) => s + e.montant, 0);

  // ─── Stats ───
  const totalMandatsActifs = mandats.filter(m => m.status === "active").length;
  const totalEcheancesPending = pendingEcheances.length;
  const totalMontantPending = pendingEcheances.reduce((s, e) => s + e.montant, 0);
  const totalRemises = remises.length;

  // ─── Auto-fill famille ───
  const selectedFamily = families.find(f => f.firestoreId === newMandat.familyId);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Prélèvements SEPA</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Building2 size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{totalMandatsActifs}</div><div className="font-body text-xs text-gray-400">mandats actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Calendar size={20} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{totalEcheancesPending}</div><div className="font-body text-xs text-gray-400">échéances à venir</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CreditCard size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalMontantPending.toFixed(0)}€</div><div className="font-body text-xs text-gray-400">à prélever</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><FileText size={20} className="text-purple-500" /></div>
          <div><div className="font-body text-xl font-bold text-purple-500">{totalRemises}</div><div className="font-body text-xs text-gray-400">remises générées</div></div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { id: "mandats" as const, label: `Mandats (${mandats.length})`, icon: Building2 },
          { id: "echeancier" as const, label: `Échéancier (${totalEcheancesPending})`, icon: Calendar },
          { id: "remises" as const, label: `Remises (${remises.length})`, icon: Download },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${
              tab === t.id ? "text-white bg-blue-500" : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une famille, un mandat..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <>
          {/* ═══ ONGLET MANDATS ═══ */}
          {tab === "mandats" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="font-body text-sm text-gray-400">Mandats de prélèvement SEPA signés par les familles</div>
                <button onClick={() => setShowNewMandat(!showNewMandat)}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400">
                  <Plus size={16} /> Nouveau mandat
                </button>
              </div>

              {/* Formulaire nouveau mandat */}
              {showNewMandat && (
                <Card padding="md" className="mb-5 border-2 border-blue-500/20">
                  <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Nouveau mandat SEPA</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Famille</label>
                      <select value={newMandat.familyId} onChange={e => {
                        const fam = families.find(f => f.firestoreId === e.target.value);
                        setNewMandat({ ...newMandat, familyId: e.target.value, titulaire: fam?.parentName || newMandat.titulaire });
                      }}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                        <option value="">Choisir...</option>
                        {families.sort((a, b) => (a.parentName || "").localeCompare(b.parentName || "")).map(f => (
                          <option key={f.firestoreId} value={f.firestoreId}>{f.parentName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Titulaire du compte</label>
                      <input value={newMandat.titulaire} onChange={e => setNewMandat({ ...newMandat, titulaire: e.target.value })}
                        placeholder="Nom sur le compte bancaire"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">IBAN</label>
                      <input value={newMandat.iban} onChange={e => {
                        const iban = e.target.value.replace(/\s/g, "").toUpperCase();
                        const bic = lookupBic(iban);
                        setNewMandat({ ...newMandat, iban, bic: bic || newMandat.bic });
                      }}
                        placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm font-mono" />
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">BIC {newMandat.bic && <span className="text-green-500">(auto-détecté)</span>}</label>
                      <input value={newMandat.bic} onChange={e => setNewMandat({ ...newMandat, bic: e.target.value })}
                        placeholder="AGRIFRPP866"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm font-mono" />
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Date de signature</label>
                      <input type="date" value={newMandat.dateSignature} onChange={e => setNewMandat({ ...newMandat, dateSignature: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateMandat} disabled={saving || !newMandat.familyId || !newMandat.iban}
                      className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
                    </button>
                    <button onClick={() => setShowNewMandat(false)} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
                  </div>
                </Card>
              )}

              {/* Liste des mandats */}
              {filteredMandats.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="font-body text-sm text-gray-500">{search ? "Aucun mandat trouvé." : "Aucun mandat SEPA enregistré."}</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredMandats.map(m => {
                    const echCount = echeances.filter(e => e.mandatId === m.mandatId).length;
                    const echPending = echeances.filter(e => e.mandatId === m.mandatId && e.status === "pending").length;
                    return (
                      <Card key={m.id} padding="md">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Building2 size={18} className="text-blue-500" />
                            </div>
                            <div>
                              <div className="font-body text-sm font-semibold text-blue-800">{m.familyName}</div>
                              <div className="font-body text-xs text-gray-500 mt-0.5">
                                Titulaire : {m.titulaire} · Mandat : <span className="font-mono text-blue-500">{m.mandatId}</span>
                              </div>
                              <div className="font-body text-xs text-gray-400 mt-0.5 font-mono">
                                IBAN : {formatIban(m.iban)} · BIC : {m.bic}
                              </div>
                              <div className="font-body text-xs text-gray-400 mt-0.5">
                                Signé le {new Date(m.dateSignature).toLocaleDateString("fr-FR")}
                                {echCount > 0 && <span className="ml-2">· {echPending} échéance{echPending > 1 ? "s" : ""} en attente sur {echCount}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge color={m.status === "active" ? "green" : "gray"}>{m.status === "active" ? "Actif" : "Révoqué"}</Badge>
                            <button onClick={() => { setShowNewEcheancier(true); setNewEcheancier({ ...newEcheancier, mandatId: m.id }); setTab("echeancier"); }}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                              + Échéancier
                            </button>
                            <button onClick={() => handleDeleteMandat(m.id)}
                              className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Config créancier */}
              <Card padding="md" className="mt-6 bg-blue-50/50 border-blue-500/10">
                <h3 className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration créancier SEPA</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-body text-sm text-gray-600">
                  <div><span className="text-gray-400">Créancier :</span> {SEPA_CREDITOR.name}</div>
                  <div><span className="text-gray-400">ICS :</span> <span className="font-mono">{SEPA_CREDITOR.ics}</span></div>
                  <div><span className="text-gray-400">IBAN :</span> <span className="font-mono">{formatIban(SEPA_CREDITOR.iban)}</span></div>
                  <div><span className="text-gray-400">BIC :</span> <span className="font-mono">{SEPA_CREDITOR.bic}</span></div>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ ONGLET ÉCHÉANCIER ═══ */}
          {tab === "echeancier" && (
            <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="font-body text-sm text-gray-400">Échéances en attente de prélèvement</div>
                <div className="flex gap-2">
                  <button onClick={selectCurrentMonth}
                    className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                    <Calendar size={14} /> Sélectionner ce mois
                  </button>
                  <button onClick={() => setShowNewEcheancier(!showNewEcheancier)}
                    className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-xl border-none cursor-pointer hover:bg-blue-400">
                    <Plus size={16} /> Nouvel échéancier
                  </button>
                </div>
              </div>

              {/* Formulaire nouvel échéancier */}
              {showNewEcheancier && (
                <Card padding="md" className="mb-5 border-2 border-blue-500/20">
                  <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Créer un échéancier</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Mandat SEPA</label>
                      <select value={newEcheancier.mandatId} onChange={e => setNewEcheancier({ ...newEcheancier, mandatId: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                        <option value="">Choisir...</option>
                        {mandats.filter(m => m.status === "active").map(m => (
                          <option key={m.id} value={m.id}>{m.familyName} — {m.mandatId}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Montant total TTC</label>
                      <input type="number" step="0.01" value={newEcheancier.montantTotal} onChange={e => setNewEcheancier({ ...newEcheancier, montantTotal: e.target.value })}
                        placeholder="ex: 700"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Nombre d&apos;échéances</label>
                      <select value={newEcheancier.nbEcheances} onChange={e => setNewEcheancier({ ...newEcheancier, nbEcheances: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                          <option key={n} value={n}>{n}×</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Date de la 1ère échéance</label>
                      <input type="date" value={newEcheancier.dateDebut} onChange={e => setNewEcheancier({ ...newEcheancier, dateDebut: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Description</label>
                      <input value={newEcheancier.description} onChange={e => setNewEcheancier({ ...newEcheancier, description: e.target.value })}
                        placeholder="ex: Forfait annuel 2025-2026"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                  </div>
                  {/* Preview */}
                  {newEcheancier.montantTotal && newEcheancier.nbEcheances && (
                    <div className="bg-sand rounded-lg px-4 py-3 mb-4 font-body text-sm text-blue-800">
                      💡 {newEcheancier.nbEcheances} × <strong>{(parseFloat(newEcheancier.montantTotal) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong> = {parseFloat(newEcheancier.montantTotal).toFixed(2)}€
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleCreateEcheancier} disabled={saving || !newEcheancier.mandatId || !newEcheancier.montantTotal || !newEcheancier.dateDebut}
                      className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Créer {newEcheancier.nbEcheances} échéances
                    </button>
                    <button onClick={() => setShowNewEcheancier(false)} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
                  </div>
                </Card>
              )}

              {/* Barre d'action remise */}
              {selectedEcheances.size > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600" />
                    <div>
                      <div className="font-body text-sm font-semibold text-green-800">
                        {selectedEcheances.size} échéance{selectedEcheances.size > 1 ? "s" : ""} sélectionnée{selectedEcheances.size > 1 ? "s" : ""} · {selectedTotal.toFixed(2)}€
                      </div>
                      <div className="font-body text-xs text-green-600">Prêt à créer une remise bancaire</div>
                    </div>
                  </div>
                  <button onClick={handleCreateRemise} disabled={saving}
                    className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-5 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Créer la remise XML
                  </button>
                </div>
              )}

              {/* Liste des échéances */}
              {filteredEcheances.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="font-body text-sm text-gray-500">Aucune échéance en attente.</p>
                </Card>
              ) : (
                <Card className="!p-0 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 bg-sand border-b border-blue-500/8 flex items-center font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <button onClick={selectAll} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer text-gray-400">
                      {selectedEcheances.size === filteredEcheances.length ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} />}
                    </button>
                    <span className="flex-1">Famille</span>
                    <span className="w-28">Date</span>
                    <span className="w-24 text-right">Montant</span>
                    <span className="w-36">Description</span>
                    <span className="w-10" />
                  </div>
                  {filteredEcheances.map(ech => (
                    <div key={ech.id} className={`px-4 py-3 border-b border-gray-100 flex items-center hover:bg-blue-50/30 ${selectedEcheances.has(ech.id) ? "bg-green-50/50" : ""}`}>
                      <button onClick={() => toggleEcheance(ech.id)} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer">
                        {selectedEcheances.has(ech.id) ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} className="text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800 truncate">{ech.familyName}</div>
                        <div className="font-body text-[10px] text-gray-400 font-mono">{ech.mandatId}</div>
                      </div>
                      <div className="w-28 font-body text-sm text-gray-600">
                        {new Date(ech.dateEcheance).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      <div className="w-24 text-right font-body text-sm font-semibold text-blue-800">{ech.montant.toFixed(2)}€</div>
                      <div className="w-36 font-body text-xs text-gray-500 truncate pl-3">{ech.description}</div>
                      <button onClick={() => handleDeleteEcheance(ech.id)} className="w-10 flex justify-end text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </Card>
              )}

              {/* Échéances traitées */}
              {echeances.filter(e => e.status !== "pending").length > 0 && (
                <div className="mt-6">
                  <h3 className="font-body text-sm font-semibold text-gray-400 mb-3">Échéances traitées ({echeances.filter(e => e.status !== "pending").length})</h3>
                  <div className="flex flex-col gap-1">
                    {echeances.filter(e => e.status !== "pending").sort((a, b) => b.dateEcheance.localeCompare(a.dateEcheance)).slice(0, 20).map(ech => (
                      <div key={ech.id} className="flex items-center gap-3 font-body text-xs text-gray-400 py-1.5 px-3 bg-gray-50 rounded-lg">
                        <Badge color={ech.status === "preleve" ? "green" : ech.status === "remis" ? "blue" : "red"}>
                          {ech.status === "preleve" ? "Prélevé" : ech.status === "remis" ? "En remise" : "Rejeté"}
                        </Badge>
                        <span className="font-semibold text-gray-600">{ech.familyName}</span>
                        <span>{new Date(ech.dateEcheance).toLocaleDateString("fr-FR")}</span>
                        <span className="font-semibold">{ech.montant.toFixed(2)}€</span>
                        <span className="text-gray-400">{ech.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ ONGLET REMISES ═══ */}
          {tab === "remises" && (
            <div>
              <div className="font-body text-sm text-gray-400 mb-4">Historique des fichiers XML générés pour le Crédit Agricole</div>

              {remises.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <Download size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="font-body text-sm text-gray-500">Aucune remise générée.</p>
                  <p className="font-body text-xs text-gray-400 mt-2">Sélectionnez des échéances dans l&apos;onglet Échéancier pour créer votre première remise.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {remises.sort((a, b) => b.numero - a.numero).map(r => (
                    <Card key={r.id} padding="md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                            <FileText size={22} className="text-purple-500" />
                          </div>
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">
                              Remise n°{r.numero} — {r.xmlFileName}
                            </div>
                            <div className="font-body text-xs text-gray-500 mt-0.5">
                              {r.nbTransactions} prélèvement{r.nbTransactions > 1 ? "s" : ""} · <strong>{r.montantTotal.toFixed(2)}€</strong> · Prélèvement le {new Date(r.datePrelevement).toLocaleDateString("fr-FR")}
                            </div>
                            <div className="font-body text-[10px] text-gray-400 mt-0.5">
                              Créée le {r.dateRemise ? new Date(r.dateRemise).toLocaleDateString("fr-FR") : "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={r.status === "deposited" ? "green" : r.status === "generated" ? "blue" : "gray"}>
                            {r.status === "deposited" ? "Déposée" : r.status === "generated" ? "Générée" : "Brouillon"}
                          </Badge>
                          <button onClick={() => downloadRemise(r)}
                            className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                            <Download size={12} /> XML
                          </button>
                          {r.status === "generated" && (
                            <button onClick={() => markDeposited(r.id)}
                              className="flex items-center gap-1 font-body text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                              <Check size={12} /> Déposée
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
