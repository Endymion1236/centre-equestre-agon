"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { enregistrerEncaissement } from "@/lib/encaissement";
import { commandesApplicables, fichesOuChercherLaCommande, planifierApplicationAvoir, resteDu, utilisationsSansCommande, montantUtilisation } from "@/lib/avoir-application";
import { identifiantsRattaches } from "@/lib/fusion-familles";
import { echeanceAvoir } from "@/lib/planning-services";
import { Card, Badge } from "@/components/ui";
import { downloadAvoirPdf } from "@/lib/download-avoir";
import { createEncaissement } from "@/lib/compta-encaissement";
import {
  Plus, Search, Loader2, X, Save, Wallet, CreditCard, TrendingDown, TrendingUp, Check, BadgeEuro, FileDown,
} from "lucide-react";
import type { Family } from "@/types";
import { demanderNumeroAvoir } from "@/lib/numero-avoir-client";

// ─── Types ───
type AvoirType = "avoir" | "avance";
type AvoirStatus = "actif" | "utilise" | "expire" | "annule";

interface Avoir {
  id: string;
  familyId: string;
  familyName: string;
  type: AvoirType;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  reason: string;
  reference: string; // N° avoir ou référence paiement
  expiryDate: any;
  status: AvoirStatus;
  usageHistory: { date: string; amount?: number; montant?: number; invoiceRef?: string; paymentId?: string }[];
  createdAt: any;
  updatedAt: any;
}

const statusColors: Record<AvoirStatus, "green" | "blue" | "orange" | "gray" | "red"> = {
  actif: "green", utilise: "gray", expire: "orange", annule: "red",
};

export default function AvoirsPage() {
  const [tab, setTab] = useState<"actifs" | "creer" | "historique">("actifs");
    const { setAgentContext } = useAgentContext("avoirs");

  useEffect(() => {
    setAgentContext({ module_actif: "avoirs", description: "avoirs disponibles par famille" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [avoirs, setAvoirs] = useState<Avoir[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create form
  const [selFamily, setSelFamily] = useState("");
  const [avoirType, setAvoirType] = useState<AvoirType>("avoir");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expiryMonths, setExpiryMonths] = useState("saison");
  const [saving, setSaving] = useState(false);

  // Use avoir — sur UNE commande de la famille (lib/avoir-application).
  const [showUseModal, setShowUseModal] = useState(false);
  const [useAvoirId, setUseAvoirId] = useState<string | null>(null);
  const [useAmount, setUseAmount] = useState("");
  const [useCommandes, setUseCommandes] = useState<any[]>([]);
  const [useFichesCherchees, setUseFichesCherchees] = useState(0);
  const [useCommandeId, setUseCommandeId] = useState("");
  /** Rang de l'utilisation à réparer (faite sans commande), sinon null. */
  const [useReparation, setUseReparation] = useState<number | null>(null);
  const [useChargement, setUseChargement] = useState(false);

  const ouvrirUtilisation = async (a: Avoir, reparationIndex: number | null) => {
    setUseAvoirId(a.id); setUseReparation(reparationIndex); setUseCommandeId(""); setUseCommandes([]);
    setUseAmount(reparationIndex === null ? "" : montantUtilisation((a.usageHistory || [])[reparationIndex] || {}).toFixed(2));
    setShowUseModal(true);
    setUseChargement(true);
    try {
      // La famille a pu avoir plusieurs fiches (compte de connexion, fiche du
      // bureau absorbée) : la commande du stage peut vivre sur une autre que
      // celle de l'avoir. On cherche sur toutes (lib/fusion-familles).
      // Repli : toute fiche du même nom de famille (lib/avoir-application).
      const ids = fichesOuChercherLaCommande(
        a,
        families.map((f: any) => ({ id: f.firestoreId, status: f.status, mergedInto: f.mergedInto, parentName: f.parentName, lastName: f.lastName })),
        identifiantsRattaches,
      );
      const docs: any[] = [];
      for (let i = 0; i < ids.length; i += 30) {
        const snap = await getDocs(query(collection(db, "payments"), where("familyId", "in", ids.slice(i, i + 30))));
        docs.push(...snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }
      setUseFichesCherchees(ids.length);
      const commandes = commandesApplicables(docs)
        .sort((x: any, y: any) => (y.date?.seconds || 0) - (x.date?.seconds || 0));
      setUseCommandes(commandes);
      if (commandes.length === 1) {
        setUseCommandeId(commandes[0].id);
        if (reparationIndex === null) setUseAmount(Math.min(a.remainingAmount || 0, resteDu(commandes[0])).toFixed(2));
      }
    } catch (e) { console.error(e); }
    setUseChargement(false);
  };

  // Rembourser avoir
  const [showRembModal, setShowRembModal] = useState(false);
  const [rembAvoirId, setRembAvoirId] = useState<string | null>(null);
  const [rembMode, setRembMode] = useState("especes");
  const [rembRef, setRembRef] = useState("");

  const fetchData = async () => {
    try {
      const [aSnap, fSnap] = await Promise.all([
        getDocs(collection(db, "avoirs")),
        getDocs(collection(db, "families")),
      ]);
      setAvoirs(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Avoir)));
      setFamilies(fSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() } as any)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ─── Computed ───
  const activeAvoirs = useMemo(() => avoirs.filter(a => a.status === "actif"), [avoirs]);
  const usedAvoirs = useMemo(() => avoirs.filter(a => a.status === "utilise"), [avoirs]);
  const expiredAvoirs = useMemo(() => avoirs.filter(a => a.status === "expire" || a.status === "annule"), [avoirs]);

  const totalActif = activeAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalAvoirs = activeAvoirs.filter(a => a.type === "avoir").reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalAvances = activeAvoirs.filter(a => a.type === "avance").reduce((s, a) => s + (a.remainingAmount || 0), 0);

  const filtered = useMemo(() => {
    const list = tab === "actifs" ? activeAvoirs : tab === "historique" ? [...usedAvoirs, ...expiredAvoirs] : [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(a => a.familyName?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q));
  }, [tab, activeAvoirs, usedAvoirs, expiredAvoirs, search]);

  // ─── Create ───
  const createAvoir = async () => {
    if (!selFamily || !amount) return;
    setSaving(true);
    const fam = families.find(f => f.firestoreId === selFamily);
    const amt = parseFloat(amount);
    // "saison" = fin de la saison en cours, 30 juin (règle CGV stages) ; sinon
    // durée glissante en mois, pour les cas particuliers.
    const expiry = expiryMonths === "saison"
      ? echeanceAvoir()
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + parseInt(expiryMonths)); return d; })();
    // Un avoir est une facture rectificative : il prend un numéro de la
    // séquence continue (AV-YYYY-NNNN). Une avance est un acompte reçu, pas
    // une facture — sa référence reste une simple clé technique.
    let ref: string;
    try {
      ref = avoirType === "avoir"
        ? await demanderNumeroAvoir({ familyId: selFamily, motif: reason || "Avoir manuel" })
        : `AVA-${Date.now().toString(36).toUpperCase()}`;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Impossible d'attribuer un numéro d'avoir.");
      setSaving(false);
      return;
    }

    try {
      await addDoc(collection(db, "avoirs"), {
        familyId: selFamily,
        familyName: fam?.parentName || "",
        type: avoirType,
        amount: amt,
        usedAmount: 0,
        remainingAmount: amt,
        reason,
        reference: ref,
        expiryDate: Timestamp.fromDate(expiry),
        status: "actif",
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Trace dans le journal des encaissements (montant négatif)
      await createEncaissement({
        paymentId: "",
        familyId: selFamily,
        familyName: fam?.parentName || "",
        montant: -amt,
        mode: "avoir",
        modeLabel: avoirType === "avoir" ? "Avoir (création manuelle)" : "Avance (création manuelle)",
        ref: ref,
        activityTitle: reason || (avoirType === "avoir" ? "Avoir" : "Avance"),
        isAvoir: true,
        avoirRef: ref,
      });
      setSelFamily("");
      setAmount("");
      setReason("");
      setTab("actifs");
      fetchData();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la création.");
    }
    setSaving(false);
  };

  // ─── Use avoir ───
  // L'avoir se déduit d'une commande précise : écriture « avoir » au journal
  // (lib/encaissement recalcule le payé, le statut, numérote la facture si
  // elle est soldée) et trace de la commande sur l'avoir. Jusqu'au 19/10/2026
  // ce bouton ne touchait qu'à l'avoir : la facture ne bougeait pas.
  const handleUseAvoir = async () => {
    if (!useAvoirId || !useCommandeId) return;
    const avoir = avoirs.find(a => a.id === useAvoirId);
    const commande = useCommandes.find(c => c.id === useCommandeId);
    if (!avoir || !commande) return;
    const plan = planifierApplicationAvoir({
      avoir, commande, montant: parseFloat(useAmount || "0"),
      reparation: useReparation === null ? undefined : { index: useReparation },
    });
    if (!plan.ok) { alert(plan.erreur); return; }
    setSaving(true);
    try {
      // L'avoir suit la commande qu'il crédite : même fiche, même dossier.
      const suivi = commande.familyId && commande.familyId !== avoir.familyId
        ? { familyId: commande.familyId, familyName: commande.familyName || avoir.familyName }
        : {};
      await updateDoc(doc(db, "avoirs", useAvoirId), { ...plan.avoirMaj, ...suivi, updatedAt: serverTimestamp() });
      await enregistrerEncaissement(commande.id, commande, plan.montant, "avoir", avoir.reference || "", plan.libelle);
      setShowUseModal(false);
      setUseAvoirId(null); setUseAmount(""); setUseCommandeId(""); setUseReparation(null);
      fetchData();
    } catch (e) { console.error(e); alert("Erreur lors de l'application de l'avoir."); }
    setSaving(false);
  };

  // ─── Rembourser avoir ───
  const handleRemboursement = async () => {
    if (!rembAvoirId) return;
    const avoir = avoirs.find(a => a.id === rembAvoirId);
    if (!avoir) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "avoirs", rembAvoirId), {
        status: "annule",
        usedAmount: avoir.amount,
        remainingAmount: 0,
        usageHistory: [...(avoir.usageHistory || []), {
          date: new Date().toISOString(),
          amount: avoir.remainingAmount,
          invoiceRef: `REMB-${rembMode.toUpperCase()}${rembRef ? `-${rembRef}` : ""}`,
        }],
        updatedAt: serverTimestamp(),
      });
      // Trace comptable
      await addDoc(collection(db, "comptabilite"), {
        type: "remboursement_avoir",
        avoirId: rembAvoirId,
        familyId: avoir.familyId,
        familyName: avoir.familyName,
        amount: avoir.remainingAmount,
        paymentMode: rembMode,
        reference: rembRef || avoir.reference,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      // Trace dans le journal des encaissements (sortie de trésorerie)
      await createEncaissement({
        paymentId: "",
        familyId: avoir.familyId,
        familyName: avoir.familyName,
        montant: -avoir.remainingAmount,
        mode: rembMode,
        modeLabel: `Remboursement avoir (${rembMode})`,
        ref: avoir.reference,
        activityTitle: `Remboursement avoir ${avoir.reference}`,
        isAvoir: true,
        avoirRef: avoir.reference,
        isRemboursement: true,
      });
      setShowRembModal(false);
      setRembAvoirId(null);
      setRembMode("especes");
      setRembRef("");
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };


  const formatDate = (d: any): string => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };
  const daysUntilExpiry = (d: any): number => {
    if (!d) return 9999;
    const target = d.toDate ? d.toDate() : new Date(d);
    return Math.ceil((target.getTime() - Date.now()) / 86400000);
  };

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Avoirs & avances</h1>
          <p className="font-body text-xs text-gray-400">Gérer les avoirs clients et les avances versées</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Wallet size={18} className="text-blue-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-blue-500">{totalActif.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">solde total actif</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><TrendingDown size={18} className="text-orange-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-orange-500">{totalAvoirs.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">{activeAvoirs.filter(a => a.type === "avoir").length} avoir{activeAvoirs.filter(a => a.type === "avoir").length > 1 ? "s" : ""}</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><TrendingUp size={18} className="text-green-600" /></div>
          <div>
            <div className="font-body text-xl font-bold text-green-600">{totalAvances.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">{activeAvoirs.filter(a => a.type === "avance").length} avance{activeAvoirs.filter(a => a.type === "avance").length > 1 ? "s" : ""}</div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "actifs" as const, label: `Actifs (${activeAvoirs.length})` },
          { id: "creer" as const, label: "Créer un avoir / avance" },
          { id: "historique" as const, label: `Historique (${usedAvoirs.length + expiredAvoirs.length})` },
        ].map(t => (
          <button type="button" key={t.id} onClick={() => setTab(t.id)}
            className={`font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${
              tab === t.id ? "bg-blue-500 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {(tab === "actifs" || tab === "historique") && (
        <div className="relative mb-5">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input type="text" placeholder="Rechercher par famille ou référence…" value={search} onChange={e => setSearch(e.target.value)}
            className={`${inputStyle} !pl-9`} />
        </div>
      )}

      {/* ─── Actifs / Historique ─── */}
      {(tab === "actifs" || tab === "historique") && (
        <>
          {filtered.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Wallet size={28} className="text-blue-300" />
              </div>
              <p className="font-body text-sm text-gray-500">
                {tab === "actifs" ? "Aucun avoir ou avance actif." : "Aucun historique."}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(a => {
                const pctUsed = (a.amount || 0) > 0 ? Math.round(((a.usedAmount || 0) / a.amount) * 100) : 0;
                const daysLeft = daysUntilExpiry(a.expiryDate);
                const expiringSoon = daysLeft > 0 && daysLeft <= 30;
                return (
                  <Card key={a.id} padding="md">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.type === "avoir" ? "bg-orange-50" : "bg-green-50"}`}>
                        {a.type === "avoir" ? <TrendingDown size={18} className="text-orange-500" /> : <TrendingUp size={18} className="text-green-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-body text-sm font-semibold text-blue-800">{a.familyName}</span>
                          <Badge color={a.type === "avoir" ? "orange" : "green"}>{a.type === "avoir" ? "Avoir" : "Avance"}</Badge>
                          <Badge color={statusColors[a.status]}>{a.status}</Badge>
                          {expiringSoon && <Badge color="red">Expire dans {daysLeft}j</Badge>}
                        </div>
                        <div className="font-body text-xs text-gray-400 mt-0.5">
                          Réf. {a.reference} · Créé le {formatDate(a.createdAt)} · Expire le {formatDate(a.expiryDate)}
                          {a.reason && <> · {a.reason}</>}
                        </div>
                        {/* Progress bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pctUsed > 80 ? "bg-gray-300" : "bg-blue-300"}`} style={{ width: `${pctUsed}%` }} />
                          </div>
                          <span className="font-body text-xs text-gray-400">{(a.usedAmount || 0).toFixed(2)}€ / {(a.amount || 0).toFixed(2)}€ utilisé</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-body text-xl font-bold ${(a.remainingAmount || 0) > 0 ? "text-blue-500" : "text-gray-300"}`}>
                          {(a.remainingAmount || 0).toFixed(2)}€
                        </div>
                        <div className="font-body text-[10px] text-gray-400">restant</div>
                        {a.status === "actif" && (
                          <div className="flex gap-1 mt-2">
                            <button type="button" onClick={() => ouvrirUtilisation(a, null)}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                              Utiliser
                            </button>
                            <button type="button" onClick={() => { setRembAvoirId(a.id); setRembMode("especes"); setRembRef(""); setShowRembModal(true); }}
                              className="font-body text-xs text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                              Rembourser
                            </button>
                          </div>
                        )}
                        <button type="button" onClick={() => {
                          const d = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
                          const exp = a.expiryDate?.toDate ? a.expiryDate.toDate() : null;
                          downloadAvoirPdf({
                            avoirNumber: a.reference,
                            date: d.toLocaleDateString("fr-FR"),
                            familyName: a.familyName,
                            reason: a.reason || "",
                            items: [],
                            totalHT: Math.round((a.amount || 0) / 1.055 * 100) / 100,
                            totalTVA: Math.round(((a.amount || 0) - (a.amount || 0) / 1.055) * 100) / 100,
                            totalTTC: a.amount || 0,
                            type: a.type || "avoir",
                            expiryDate: exp ? exp.toLocaleDateString("fr-FR") : "—",
                          });
                        }}
                          className="font-body text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-slate-100 flex items-center gap-1 mt-1">
                          <FileDown size={12} /> PDF
                        </button>
                      </div>
                    </div>
                    {/* Usage history */}
                    {(a.usageHistory || []).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="font-body text-[10px] text-gray-400 uppercase tracking-wider mb-1">Utilisations</div>
                        {(a.usageHistory || []).map((u: any, i: number) => {
                          const sansCommande = utilisationsSansCommande(a).some(x => x.index === i);
                          return (
                            <div key={i} className="flex flex-wrap items-center justify-between gap-2 font-body text-xs text-gray-500 py-0.5">
                              <span>
                                {new Date(u.date).toLocaleDateString("fr-FR")} · {u.invoiceRef || u.paymentId || "—"}
                                {sansCommande && (
                                  <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                    Déduction non appliquée à une commande
                                    <button type="button" onClick={() => ouvrirUtilisation(a, i)}
                                      className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white border-none cursor-pointer hover:bg-amber-500">
                                      Appliquer maintenant
                                    </button>
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold">-{montantUtilisation(u).toFixed(2)}€</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Créer ─── */}
      {tab === "creer" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Créer un avoir ou une avance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>Type</label>
              <div className="flex gap-2">
                {([["avoir", "Avoir (remboursement)"], ["avance", "Avance (acompte)"]] as const).map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setAvoirType(v)}
                    className={`flex-1 py-2.5 rounded-lg font-body text-sm font-medium border cursor-pointer transition-all
                      ${avoirType === v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelStyle}>Famille *</label>
              <select className={inputStyle} value={selFamily} onChange={e => setSelFamily(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {/* Les fiches absorbées n'apparaissent pas : un avoir créé sur
                    l'ancienne fiche COSTEGROSSE ne trouvait pas la commande,
                    passée sur le compte de connexion (19/10/2026). */}
                {families
                  .filter((f: any) => f.status !== "merged")
                  .slice()
                  .sort((a: any, b: any) => String(a.parentName || "").localeCompare(String(b.parentName || ""), "fr"))
                  .map(f => <option key={f.firestoreId} value={f.firestoreId}>{f.parentName}{f.parentEmail ? ` · ${f.parentEmail}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Montant (€) *</label>
              <input type="number" step="0.01" className={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex: 57.00" />
            </div>
            <div>
              <label className={labelStyle}>Validité</label>
              <select className={inputStyle} value={expiryMonths} onChange={e => setExpiryMonths(e.target.value)}>
                <option value="saison">Fin de la saison en cours (30 juin)</option>
                <option value="3">3 mois</option>
                <option value="6">6 mois</option>
                <option value="12">12 mois</option>
                <option value="24">24 mois</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelStyle}>Motif</label>
              <input className={inputStyle} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ex: Annulation balade pour météo, Trop-perçu stage avril..." />
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button type="button" onClick={createAvoir} disabled={saving || !selFamily || !amount}
              className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600
                ${(saving || !selFamily || !amount) ? "opacity-50 cursor-not-allowed" : ""}`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Créer {avoirType === "avoir" ? "l'avoir" : "l'avance"}
            </button>
          </div>
        </Card>
      )}

      {/* ─── Modal : Utiliser un avoir ─── */}
      {showUseModal && (() => {
        const avoir = avoirs.find(a => a.id === useAvoirId);
        const commande = useCommandes.find(c => c.id === useCommandeId);
        const reparation = useReparation !== null;
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowUseModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">{reparation ? "Appliquer la déduction à une commande" : "Utiliser un avoir"}</h2>
                  <p className="font-body text-xs text-slate-500 mt-0.5">{avoir?.familyName} · {avoir?.reference}{reparation ? "" : ` · ${(avoir?.remainingAmount || 0).toFixed(2)}€ disponible`}</p>
                </div>
                <button type="button" onClick={() => setShowUseModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4">
                {reparation && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-body text-xs text-amber-900">
                    Cette déduction avait été enregistrée sur l&apos;avoir sans toucher à la commande : la facture ne la voyait pas. Choisissez la commande, elle sera créditée de ce montant et sa facture mise à jour.
                  </div>
                )}
                <div>
                  <label className={labelStyle}>Commande à créditer *</label>
                  {useChargement ? (
                    <div className="font-body text-xs text-slate-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Chargement des commandes…</div>
                  ) : useCommandes.length === 0 ? (
                    <div className="font-body text-xs text-rose-600">Aucune commande à régler trouvée ({useFichesCherchees} fiche{useFichesCherchees > 1 ? "s" : ""} au nom de {avoir?.familyName || "cette famille"} ou rattachée{useFichesCherchees > 1 ? "s" : ""} à l&apos;avoir). Si la commande existe pourtant, ouvrez Diagnostic famille pour voir sur quelle fiche elle vit.</div>
                  ) : (
                    <select className={inputStyle} value={useCommandeId} onChange={e => {
                      setUseCommandeId(e.target.value);
                      const c = useCommandes.find(x => x.id === e.target.value);
                      if (c && !reparation && avoir) setUseAmount(Math.min(avoir.remainingAmount || 0, resteDu(c)).toFixed(2));
                    }}>
                      <option value="">— Choisir —</option>
                      {useCommandes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.invoiceNumber || `PF-${String(c.orderId || c.id).slice(-6).toUpperCase()}`} · {(c.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 60) || "commande"} · reste dû {resteDu(c).toFixed(2)}€{c.familyId && c.familyId !== avoir?.familyId ? ` · fiche ${c.familyName || c.familyId}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelStyle}>Montant à déduire (€) *</label>
                  <input type="number" step="0.01" className={inputStyle} value={useAmount} disabled={reparation}
                    onChange={e => setUseAmount(e.target.value)}
                    placeholder={commande && avoir ? `Max : ${Math.min(avoir.remainingAmount || 0, resteDu(commande)).toFixed(2)}€` : ""} />
                  {commande && <div className="font-body text-[11px] text-slate-500 mt-1">Reste dû sur cette commande : {resteDu(commande).toFixed(2)}€</div>}
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                <button type="button" onClick={() => setShowUseModal(false)}
                  className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                <button type="button" onClick={handleUseAvoir} disabled={saving || !useCommandeId || !useAmount}
                  className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer
                    ${(saving || !useCommandeId || !useAmount) ? "opacity-50" : ""}`}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {reparation ? "Appliquer à la commande" : "Déduire de la commande"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ─── Modal : Rembourser un avoir ─── */}
      {showRembModal && (() => {
        const avoir = avoirs.find(a => a.id === rembAvoirId);
        if (!avoir) return null;
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowRembModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Rembourser l'avoir</h2>
                  <p className="font-body text-xs text-slate-500 mt-0.5">{avoir.familyName} · {avoir.remainingAmount.toFixed(2)}€ à rembourser</p>
                </div>
                <button type="button" onClick={() => setShowRembModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelStyle}>Mode de remboursement</label>
                  <div className="flex flex-wrap gap-2">
                    {[["especes","Espèces"],["cheque","Chèque"],["virement","Virement"],["cb","CB"]].map(([v, l]) => (
                      <button type="button" key={v} onClick={() => setRembMode(v)}
                        className={`px-3 py-1.5 rounded-lg font-body text-sm border cursor-pointer transition-all
                          ${rembMode === v ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-600 border-gray-200 hover:border-orange-300"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Référence (optionnel)</label>
                  <input className={inputStyle} value={rembRef} onChange={e => setRembRef(e.target.value)} placeholder="N° chèque, virement..." />
                </div>
                <div className="bg-orange-50 rounded-xl p-3">
                  <p className="font-body text-xs text-orange-700">L'avoir sera marqué <strong>annulé</strong> et une trace comptable sera créée.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                <button type="button" onClick={() => setShowRembModal(false)}
                  className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                <button type="button" onClick={handleRemboursement} disabled={saving}
                  className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-lg border-none cursor-pointer ${saving ? "opacity-50" : ""}`}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Rembourser {avoir.remainingAmount.toFixed(2)}€
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
