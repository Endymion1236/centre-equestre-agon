"use client";
import { authFetch } from "@/lib/auth-fetch";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { generateSepaXml, SEPA_CREDITOR } from "@/lib/sepa";
import { createEncaissement } from "@/lib/compta-encaissement";
import type { SepaTransaction, SepaRemise } from "@/lib/sepa";
import { validateIban, validateBic, formatIban } from "@/lib/sepa-validation";
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
  libelle?: string;      // Libellé pour distinguer 2 mandats (ex: "Père", "Mère")
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

// formatIban, validateIban, validateBic sont importes depuis @/lib/sepa-validation


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
  const [dateFilter, setDateFilter] = useState("");

  // Forms
  const [showNewMandat, setShowNewMandat] = useState(false);
  /** Nom de la famille quand le formulaire arrive pré-rempli depuis la Boîte email. */
  const [prefill, setPrefill] = useState("");
  const [newMandat, setNewMandat] = useState({ familyId: "", iban: "", bic: "", titulaire: "", libelle: "", dateSignature: new Date().toISOString().split("T")[0] });
  const [showNewEcheancier, setShowNewEcheancier] = useState(false);
  const [newEcheancier, setNewEcheancier] = useState({ mandatId: "", mandatId2: "", montantTotal: "", montant2: "", nbEcheances: "10", dateDebut: "", description: "" });
  const [repartir, setRepartir] = useState(false);
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

  /**
   * Brouillon venu de la Boîte email (lecture assistée d'un RIB) : le
   * formulaire s'ouvre pré-rempli, l'admin relit et valide. Le brouillon
   * transite par sessionStorage — un IBAN n'a rien à faire dans une URL — et
   * il est consommé une seule fois.
   */
  useEffect(() => {
    try {
      const brut = sessionStorage.getItem("ce_mandat_brouillon");
      if (!brut) return;
      sessionStorage.removeItem("ce_mandat_brouillon");
      const d = JSON.parse(brut);
      if (!d?.familyId) return;
      setNewMandat(m => ({
        ...m,
        familyId: d.familyId,
        iban: d.iban || "",
        bic: d.bic || "",
        titulaire: d.titulaire || d.parentName || "",
      }));
      setShowNewMandat(true);
      setPrefill(d.parentName || "");
    } catch { /* brouillon illisible : formulaire vierge, rien de bloquant */ }
  }, []);

  // ─── Créer un mandat ───
  const handleCreateMandat = async () => {
    if (!newMandat.familyId || !newMandat.iban || !newMandat.titulaire) return;

    // Validation IBAN par checksum (ISO 13616, modulo 97)
    // Empeche les saisies erronees qui causeraient un rejet bancaire plus tard.
    const cleanIban = newMandat.iban.replace(/\s/g, "").toUpperCase();
    const ibanCheck = validateIban(cleanIban);
    if (!ibanCheck.valid) {
      toast(`IBAN invalide : ${ibanCheck.error}`, "error");
      return;
    }

    setSaving(true);
    try {
      const family = families.find(f => f.firestoreId === newMandat.familyId);
      // Validation BIC : on prend le BIC fourni OU on auto-complete depuis l'IBAN
      const bicProvided = newMandat.bic?.replace(/\s/g, "").toUpperCase();
      const bicAuto = lookupBic(cleanIban);
      const bic = bicProvided || bicAuto;
      // Si on a un BIC (fourni ou auto), on le valide structurellement.
      // L'IBAN ayant deja ete valide plus haut, on connait son pays.
      if (bic) {
        const countryFromIban = cleanIban.substring(0, 2);
        const bicCheck = validateBic(bic, countryFromIban);
        if (!bicCheck.valid) {
          toast(`BIC invalide : ${bicCheck.error}`, "error");
          setSaving(false);
          return;
        }
      }
      // ── Mandat déjà actif pour cette famille ? ───────────────────────────
      // Deux mandats actifs, c'est l'ambiguïté : les échéances et
      // l'autorisation à signer doivent en désigner UN. Le cas courant est le
      // changement de RIB — l'ancien doit alors être révoqué. Le cas
      // légitime (deux comptes, père et mère) reste possible, mais choisi.
      const actifs = mandats.filter(m => m.familyId === newMandat.familyId && m.status === "active");
      let aRevoquer: MandatSepa[] = [];
      if (actifs.length > 0) {
        const memeIban = actifs.filter(m => (m.iban || "").replace(/\s/g, "").toUpperCase() === cleanIban);
        const question = memeIban.length > 0
          ? `${family?.parentName} a déjà un mandat actif sur CE MÊME compte (${memeIban[0].mandatId}).\n\nRévoquer l'ancien et n'en garder qu'un ?\n\nOK = remplacer (recommandé)\nAnnuler = garder les deux`
          : `${family?.parentName} a déjà ${actifs.length} mandat(s) actif(s) sur un AUTRE compte.\n\nS'agit-il d'un changement de banque ?\n\nOK = révoquer l'ancien et le remplacer\nAnnuler = garder les deux (ex. compte du père et compte de la mère)`;
        if (confirm(question)) aRevoquer = memeIban.length > 0 ? memeIban : actifs;
      }

      const nextMandatNum = mandats.length + 1;
      const mandatId = `CEDC${nextMandatNum}MD${Math.floor(Math.random() * 9000) + 1000}`;

      const mandatRef = await addDoc(collection(db, "mandats-sepa"), {
        familyId: newMandat.familyId,
        familyName: family?.parentName || "",
        mandatId,
        iban: cleanIban,
        bic,
        dateSignature: newMandat.dateSignature,
        titulaire: newMandat.titulaire,
        libelle: newMandat.libelle || "",
        status: "active",
        createdAt: serverTimestamp(),
      });

      // Ancien(s) mandat(s) révoqué(s) — jamais supprimés : ils restent la
      // preuve de l'autorisation passée, et les échéances déjà prélevées y
      // font référence.
      for (const anc of aRevoquer) {
        await updateDoc(doc(db, "mandats-sepa", anc.id), {
          status: "revoked",
          revokedAt: serverTimestamp(),
          revokedReason: `Remplacé par ${mandatId}`,
        });
      }
      if (aRevoquer.length > 0) {
        toast(`${aRevoquer.length} ancien(s) mandat(s) révoqué(s) — ${mandatId} est désormais le seul actif.`, "success");
      }

      // Confirmation de mandat + prenotification de l'echeancier (obligation
      // SEPA d'informer le debiteur avant tout prelevement).
      try {
        const rn = await authFetch("/api/admin/sepa/notifier-mandat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mandatDocId: mandatRef.id }),
        });
        const dn = await rn.json();
        if (dn?.sent) toast(`Mandat créé et envoyé (${dn.echeances} échéance${dn.echeances > 1 ? "s" : ""})`, "success");
        else if (dn?.blocked) toast("Mandat créé — email bloqué (mode restreint)", "warning");
        else toast("Mandat créé, mais l'email n'a pas pu être envoyé", "warning");
      } catch {
        toast("Mandat créé, mais l'email n'a pas pu être envoyé", "warning");
      }
      setShowNewMandat(false);
      setNewMandat({ familyId: "", iban: "", bic: "", titulaire: "", libelle: "", dateSignature: new Date().toISOString().split("T")[0] });
      fetchAll();
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
  };

  // ─── Générer les échéances d'un mandat (helper réutilisable) ───
  const genererEcheances = async (mandat: MandatSepa, total: number, nb: number, dateDebut: string, description: string, reference: string) => {
    const montantEcheance = Math.floor(total / nb * 100) / 100;
    const reste = Math.round((total - montantEcheance * nb) * 100) / 100;
    const startDate = new Date(dateDebut);
    for (let i = 0; i < nb; i++) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const montant = i === nb - 1 ? montantEcheance + reste : montantEcheance;
      await addDoc(collection(db, "echeances-sepa"), {
        familyId: mandat.familyId,
        familyName: mandat.familyName,
        mandatId: mandat.mandatId,
        montant: Math.round(montant * 100) / 100,
        dateEcheance: dateStr,
        reference,
        description: description || `Échéance ${i + 1}/${nb}`,
        status: "pending",
        remiseId: null,
        paymentId: null,
        createdAt: serverTimestamp(),
      });
    }
  };

  // ─── Créer un échéancier (1 mandat, ou réparti sur 2) ───
  const handleCreateEcheancier = async () => {
    const mandat = mandats.find(m => m.id === newEcheancier.mandatId);
    if (!mandat || !newEcheancier.montantTotal || !newEcheancier.dateDebut) return;
    const nb = parseInt(newEcheancier.nbEcheances);
    if (!nb || nb < 1) { toast("Nombre d'échéances invalide", "error"); return; }
    const montant1 = parseFloat(newEcheancier.montantTotal);

    if (repartir) {
      const mandat2 = mandats.find(m => m.id === newEcheancier.mandatId2);
      const montant2 = parseFloat(newEcheancier.montant2);
      if (!mandat2) { toast("Choisis le 2e mandat", "error"); return; }
      if (mandat2.id === mandat.id) { toast("Les 2 mandats doivent être différents", "error"); return; }
      if (!montant2 || montant2 <= 0) { toast("Montant du 2e mandat manquant", "error"); return; }
      setSaving(true);
      try {
        const ref = `SPLIT-${Date.now()}`;
        await genererEcheances(mandat, montant1, nb, newEcheancier.dateDebut, newEcheancier.description, ref);
        await genererEcheances(mandat2, montant2, nb, newEcheancier.dateDebut, newEcheancier.description, ref);
        toast(`Réparti : ${montant1.toFixed(2)}€ + ${montant2.toFixed(2)}€ = ${(montant1 + montant2).toFixed(2)}€`, "success");
        setShowNewEcheancier(false); setRepartir(false);
        setNewEcheancier({ mandatId: "", mandatId2: "", montantTotal: "", montant2: "", nbEcheances: "10", dateDebut: "", description: "" });
        fetchAll();
      } catch (e: any) { toast(e.message, "error"); }
      setSaving(false);
      return;
    }

    setSaving(true);
    try {
      await genererEcheances(mandat, montant1, nb, newEcheancier.dateDebut, newEcheancier.description, "");
      toast(`${nb} échéances créées pour ${mandat.familyName}`, "success");
      setShowNewEcheancier(false);
      setNewEcheancier({ mandatId: "", mandatId2: "", montantTotal: "", montant2: "", nbEcheances: "10", dateDebut: "", description: "" });
      fetchAll();
    } catch (e: any) { toast(e.message, "error"); }
    setSaving(false);
  };

  /** "2026-08-29" → "29-08-26" pour un nom de fichier lisible (jamais de "/"). */
  const nomDate = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[3]}-${m[2]}-${m[1].slice(2)}` : "sans-date";
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
      // Nom de fichier daté : « SEPA_1.xml » ne disait rien une fois dans le
      // dossier Téléchargements, et deux remises finissaient en « (1) »,
      // « (2) » — impossible de savoir laquelle porter à la banque. On retient
      // la date de PRÉLÈVEMENT (celle qui apparaîtra sur le relevé), pas la
      // date de création.
      const fileName = `SEPA_${nomDate(datePrlv)}_n${nextNum}.xml`;

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
      // Remises créées avant le nommage daté : on les redate au téléchargement
      // plutôt que de ressortir un « SEPA_3.xml » anonyme.
      a.download = remise.xmlFileName || `SEPA_${nomDate(remise.datePrelevement)}_n${remise.numero}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast(e.message, "error"); }
  };

  // ─── Marquer une remise comme déposée ───
  const markDeposited = async (remiseId: string) => {
    // Verrou : deux clics rapprochés (ou deux postes) créeraient deux
    // encaissements pour chaque échéance. On relit le statut en base — pas
    // celui de l'écran, qui peut dater — et on renonce s'il a déjà basculé.
    const remiseRef = doc(db, "remises-sepa", remiseId);
    const remiseSnap = await getDoc(remiseRef);
    if (!remiseSnap.exists()) { toast("Remise introuvable", "error"); return; }
    if ((remiseSnap.data() as any)?.status === "deposited") {
      toast("Cette remise est déjà marquée déposée", "info");
      return;
    }
    await updateDoc(remiseRef, { status: "deposited", depositedAt: serverTimestamp() });
    const remiseEcheances = echeances.filter(e => e.remiseId === remiseId);
    for (const ech of remiseEcheances) {
      await updateDoc(doc(db, "echeances-sepa", ech.id), { status: "preleve" });
    }

    // ── Créer les encaissements (1 par échéance = 1 mouvement dans le journal) ──
    const remiseDoc = remises.find(r => r.id === remiseId);
    for (const ech of remiseEcheances) {
      let linkedPaymentId = ech.paymentId || null;
      if (!linkedPaymentId && ech.orderId) {
        const payDoc = payments.find((p: any) => p.orderId === ech.orderId);
        if (payDoc) linkedPaymentId = payDoc.id;
      }
      // Ceinture et bretelles : une échéance ne peut donner qu'un encaissement.
      // `sepaEcheanceId` est la source du mouvement ; s'il en existe déjà un,
      // on passe. Protège le cas où la remise aurait été déposée en deux fois.
      const dejaEncaisse = await getDocs(query(
        collection(db, "encaissements"), where("sepaEcheanceId", "==", ech.id),
      ));
      if (!dejaEncaisse.empty) continue;

      // createEncaissement plutôt qu'un addDoc direct : le journal reste
      // horodaté et haché en chaîne, comme tout autre encaissement (NF525).
      await createEncaissement({
        paymentId: linkedPaymentId || undefined,
        familyId: ech.familyId,
        familyName: ech.familyName,
        montant: ech.montant,
        mode: "prelevement_sepa",
        modeLabel: "Prélèvement SEPA",
        ref: `Remise n°${remiseDoc?.numero || "?"} — ${ech.mandatId}`,
        activityTitle: ech.description || `Échéance SEPA ${ech.mandatId}`,
        sepaEcheanceId: ech.id,
      });
    }

    // ── Mettre à jour les paiements de référence ──
    const orderIds = [...new Set(remiseEcheances.map(e => e.orderId).filter(Boolean))];
    for (const orderId of orderIds) {
      const allForOrder = echeances.filter(e => e.orderId === orderId);
      const allPreleve = allForOrder.every(e => e.remiseId === remiseId || e.status === "preleve");
      const totalPreleve = allForOrder
        .filter(e => e.remiseId === remiseId || e.status === "preleve")
        .reduce((s, e) => s + (e.montant || 0), 0);
      try {
        const paySnap = await getDocs(query(
          collection(db, "payments"),
          where("orderId", "==", orderId),
        ));
        for (const payDoc of paySnap.docs) {
          const payData = payDoc.data();
          if (payData.status === "cancelled") continue;
          await updateDoc(doc(db, "payments", payDoc.id), allPreleve ? {
            status: "paid",
            paidAmount: Math.round(totalPreleve * 100) / 100,
            paidAt: serverTimestamp(),
            paymentMode: "prelevement_sepa",
            paymentRef: `SEPA prélevé — remise n°${remiseDoc?.numero || remiseId.slice(-6)}`,
          } : {
            status: "partial",
            paidAmount: Math.round(totalPreleve * 100) / 100,
          });
        }
      } catch (e) { console.error("Mise à jour paiement SEPA:", e); }
    }

    // Échéances manuelles sans orderId mais avec paymentId
    const directPayIds = [...new Set(
      remiseEcheances.filter(e => !e.orderId && e.paymentId).map(e => e.paymentId!)
    )];
    for (const payId of directPayIds) {
      const allForPay = echeances.filter(e => e.paymentId === payId);
      const allPreleve = allForPay.every(e => e.remiseId === remiseId || e.status === "preleve");
      const totalPreleve = allForPay
        .filter(e => e.remiseId === remiseId || e.status === "preleve")
        .reduce((s, e) => s + (e.montant || 0), 0);
      try {
        await updateDoc(doc(db, "payments", payId), allPreleve ? {
          status: "paid",
          paidAmount: Math.round(totalPreleve * 100) / 100,
          paidAt: serverTimestamp(),
          paymentMode: "prelevement_sepa",
          paymentRef: `SEPA prélevé — remise n°${remiseDoc?.numero || remiseId.slice(-6)}`,
        } : {
          status: "partial",
          paidAmount: Math.round(totalPreleve * 100) / 100,
        });
      } catch (e) { console.error("Mise à jour directe paiement SEPA:", e); }
    }

    toast("Remise marquée comme déposée — encaissements enregistrés", "success");
    fetchAll();
  };

  // ─── Supprimer un mandat ───
  const handleDeleteMandat = async (id: string) => {
    if (!confirm("Supprimer ce mandat SEPA ?")) return;
    await deleteDoc(doc(db, "mandats-sepa", id));
    toast("Mandat supprimé", "success");
    fetchAll();
  };

  /**
   * Révoque un mandat sans le supprimer.
   *
   * Le bon geste quand une famille change de banque : le mandat reste la
   * preuve de l'autorisation passée et les échéances déjà prélevées y font
   * référence — le supprimer laisserait ces écritures orphelines. Révoqué, il
   * n'est plus proposé nulle part.
   */
  const handleRevokeMandat = async (m: MandatSepa) => {
    const enAttente = echeances.filter(e => e.mandatId === m.mandatId && e.status === "pending").length;
    const avertissement = enAttente > 0
      ? `\n\n⚠️ ${enAttente} échéance(s) en attente sur ce mandat : elles ne doivent plus être prélevées avec lui. Rattachez-les au nouveau mandat ou supprimez-les.`
      : "";
    if (!confirm(`Révoquer le mandat ${m.mandatId} de ${m.familyName} ?\n\nIl restera consultable mais ne sera plus utilisé pour les prélèvements.${avertissement}`)) return;
    await updateDoc(doc(db, "mandats-sepa", m.id), { status: "revoked", revokedAt: serverTimestamp() });
    toast(`Mandat ${m.mandatId} révoqué`, "success");
    fetchAll();
  };

  // ─── Supprimer une échéance ───
  const handleDeleteEcheance = async (id: string) => {
    if (!confirm("Supprimer cette échéance ?")) return;
    await deleteDoc(doc(db, "echeances-sepa", id));
    toast("Échéance supprimée", "success");
    fetchAll();
  };

  // ─── Decaler toutes les echeances d'une serie a partir d'une nouvelle date ───
  // Cas d'usage : on inscrit en mai mais on veut que le 1er prelevement parte
  // en septembre. Au lieu de modifier 10 dates a la main, on choisit la nouvelle
  // date de la 1ere echeance, les autres suivent automatiquement (+1 mois).
  //
  // Identifie les echeances de la meme serie via orderId (et famille au cas ou).
  // Trie par numero d'echeance (echeance: 1, 2, 3, ...).
  // Pour chaque echeance i, met dateEcheance = nouvelleDateBase + i mois.
  const handleShiftSeries = async (firstEcheance: EcheanceSepa) => {
    const orderId = firstEcheance.orderId;
    if (!orderId) {
      toast("Cette échéance n'a pas d'identifiant de série (legacy)", "warning");
      return;
    }
    const nouvelleDateStr = prompt(
      `Décaler toute la série (${firstEcheance.echeancesTotal || "?"} échéances) :\n\nNouvelle date de la 1ère échéance ?\n(Format : AAAA-MM-JJ, ex : 2026-09-01)`,
      firstEcheance.dateEcheance
    );
    if (!nouvelleDateStr) return;
    // Validation format date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nouvelleDateStr)) {
      toast("Format invalide. Utilisez AAAA-MM-JJ (ex: 2026-09-01)", "error");
      return;
    }
    const baseDate = new Date(nouvelleDateStr + "T12:00:00"); // midi pour eviter timezone
    if (isNaN(baseDate.getTime())) {
      toast("Date invalide", "error");
      return;
    }
    // Recuperer toutes les echeances de cette serie (meme orderId, status pending)
    const seriesEcheances = echeances
      .filter(e => e.orderId === orderId && e.status === "pending")
      .sort((a, b) => (a.echeance || 0) - (b.echeance || 0));
    if (seriesEcheances.length === 0) {
      toast("Aucune échéance pending pour cette série", "warning");
      return;
    }
    if (!confirm(`Décaler ${seriesEcheances.length} échéance(s) à partir du ${nouvelleDateStr} ?\n\nLes échéances seront espacées de 1 mois.`)) return;
    let updated = 0;
    for (const ech of seriesEcheances) {
      const idx = (ech.echeance || 1) - 1; // 1ere echeance = index 0
      const newDate = new Date(baseDate);
      newDate.setMonth(newDate.getMonth() + idx);
      // Format YYYY-MM-DD (eviter toISOString qui peut decaler en UTC)
      const yyyy = newDate.getFullYear();
      const mm = String(newDate.getMonth() + 1).padStart(2, "0");
      const dd = String(newDate.getDate()).padStart(2, "0");
      const newDateStr = `${yyyy}-${mm}-${dd}`;
      try {
        await updateDoc(doc(db, "echeances-sepa", ech.id), { dateEcheance: newDateStr });
        updated++;
      } catch (e) {
        console.error(`Echec maj echeance ${ech.id}:`, e);
      }
    }
    toast(`✅ ${updated} échéance(s) décalée(s) à partir du ${nouvelleDateStr}`, "success");
    fetchAll();
  };

  // ─── Filtres ───
  // Familles portant PLUSIEURS mandats actifs. C'est le seul cas réellement
  // dangereux : les échéances et l'autorisation de prélèvement se calent sur
  // un mandat, et rien ne dit lequel à la lecture. Un mandat révoqué à côté
  // d'un mandat actif est normal — c'est la trace du remplacement, on ne
  // signale donc que les actifs en double.
  const famillesEnDouble = new Set(
    Object.entries(
      mandats
        .filter(m => m.status === "active")
        .reduce<Record<string, number>>((acc, m) => {
          const cle = m.familyId || m.familyName || "";
          if (cle) acc[cle] = (acc[cle] || 0) + 1;
          return acc;
        }, {})
    )
      .filter(([, n]) => n > 1)
      .map(([cle]) => cle)
  );

  const estEnDouble = (m: MandatSepa) =>
    famillesEnDouble.has(m.familyId || "") || famillesEnDouble.has(m.familyName || "");

  const filteredMandats = mandats
    .filter(m => {
      if (!search) return true;
      const q = search.toLowerCase();
      return m.familyName?.toLowerCase().includes(q) || m.titulaire?.toLowerCase().includes(q) || m.mandatId?.toLowerCase().includes(q);
    })
    // Tri alphabétique par famille : deux mandats d'une même famille se
    // retrouvent côte à côte, ce qui rend le doublon visible. À famille égale,
    // le plus récent d'abord — c'est celui sur lequel on prélève.
    .sort((a, b) => {
      const parNom = (a.familyName || "").localeCompare(b.familyName || "", "fr", { sensitivity: "base" });
      if (parNom !== 0) return parNom;
      return (b.dateSignature || "").localeCompare(a.dateSignature || "");
    });

  const nbFamillesEnDouble = famillesEnDouble.size;

  // Enfants concernés par un mandat.
  //
  // Un mandat SEPA est signé par la FAMILLE, pas par enfant : rien dans la
  // base ne relie l'un à l'autre. Le lien réel passe par les échéances, dont
  // la description porte le prénom de l'enfant inscrit
  // (« Forfait Poney 1 — Léa — 3/10 », cf. EnrollPanel).
  //
  // On ne découpe donc pas la description — un format qui changerait
  // casserait tout — on cherche l'inverse : lequel des enfants de la fiche
  // apparaît dans les échéances de ce mandat. C'est ce qui distingue deux
  // mandats de parents séparés, où chacun prélève pour ses enfants.
  const enfantsDuMandat = (m: MandatSepa) => {
    const fam = families.find(f => f.firestoreId === m.familyId);
    const enfants = (fam?.children || []).filter(c => c?.firstName);
    const textes = echeances
      .filter(e => e.mandatId === m.mandatId)
      .map(e => `${e.description || ""} ${e.reference || ""}`)
      .join(" ")
      .toLowerCase();
    if (!textes.trim()) return { preleves: [] as string[], tous: enfants.map(c => c.firstName) };
    return {
      preleves: enfants.filter(c => textes.includes(c.firstName.toLowerCase())).map(c => c.firstName),
      tous: enfants.map(c => c.firstName),
    };
  };

  const pendingEcheances = echeances
    .filter(e => e.status === "pending")
    .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance));

  const filteredEcheances = pendingEcheances.filter(e => {
    if (dateFilter && !e.dateEcheance.startsWith(dateFilter)) return false;
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
          <button type="button" key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${
              tab === t.id ? "text-white bg-blue-500" : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Search + filtre date */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une famille, un mandat..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="relative">
          <input
            type="month"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="h-full pl-3 pr-3 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none cursor-pointer text-slate-600"
            title="Filtrer par mois"
          />
        </div>
        {(search || dateFilter) && (
          <button type="button"
            onClick={() => { setSearch(""); setDateFilter(""); }}
            className="flex items-center gap-1.5 font-body text-xs text-slate-500 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl border-none cursor-pointer flex-shrink-0"
          >
            <X size={13}/> Effacer
          </button>
        )}
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <>
          {/* ═══ ONGLET MANDATS ═══ */}
          {tab === "mandats" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="font-body text-sm text-gray-400">Mandats de prélèvement SEPA signés par les familles</div>
                <button type="button" onClick={() => setShowNewMandat(!showNewMandat)}
                  className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400">
                  <Plus size={16} /> Nouveau mandat
                </button>
              </div>

              {/* Formulaire nouveau mandat */}
              {showNewMandat && (
                <Card padding="md" className="mb-5 border-2 border-blue-500/20">
                  <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Nouveau mandat SEPA</h3>
                  {prefill && (
                    <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 font-body text-xs text-emerald-800">
                      Pré-rempli depuis le RIB reçu par email{prefill ? <> — <strong>{prefill}</strong></> : null}.
                      <span className="block text-[11px] text-emerald-700 mt-0.5">
                        Relisez l&apos;IBAN et le titulaire avant de valider : le mandat sera envoyé à la famille pour signature.
                      </span>
                    </div>
                  )}
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
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Libellé <span className="text-gray-300 font-normal">(pour distinguer 2 mandats — ex : Père, Mère)</span></label>
                      <input value={newMandat.libelle} onChange={e => setNewMandat({ ...newMandat, libelle: e.target.value })}
                        placeholder="Père / Mère / Compte principal…"
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
                    <button type="button" onClick={handleCreateMandat} disabled={saving || !newMandat.familyId || !newMandat.iban}
                      className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
                    </button>
                    <button type="button" onClick={() => setShowNewMandat(false)} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
                  </div>
                </Card>
              )}

              {/* Deux mandats actifs pour une même famille : le prélèvement et
                  l'autorisation se calent sur l'un des deux sans que rien ne
                  dise lequel. À traiter avant de générer une remise. */}
              {nbFamillesEnDouble > 0 && (
                <Card padding="md" className="mb-3 border-l-4 border-l-orange-400">
                  <div className="font-body text-sm font-bold text-orange-700 mb-1">
                    {nbFamillesEnDouble === 1
                      ? "1 famille a deux mandats actifs"
                      : `${nbFamillesEnDouble} familles ont plusieurs mandats actifs`}
                  </div>
                  <div className="font-body text-xs text-gray-600 leading-relaxed">
                    La liste est triée par nom : les mandats concernés sont côte à côte, signalés
                    « Doublon ». Gardez celui qui porte le bon IBAN et <strong>révoquez l’autre</strong>
                    {" "}— la révocation le conserve comme preuve, contrairement à la suppression.
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
                    const { preleves, tous } = enfantsDuMandat(m);
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
                                Titulaire : {m.titulaire}{m.libelle ? ` · ${m.libelle}` : ""} · Mandat : <span className="font-mono text-blue-500">{m.mandatId}</span>
                              </div>
                              <div className="font-body text-xs text-gray-400 mt-0.5 font-mono">
                                IBAN : {formatIban(m.iban)} · BIC : {m.bic}
                              </div>
                              {/* Enfants : « prélève pour » quand des échéances
                                  existent, sinon les enfants de la fiche à titre
                                  indicatif — un mandat sans échéance ne prélève
                                  encore pour personne. */}
                              {preleves.length > 0 ? (
                                <div className="font-body text-xs text-blue-700 mt-0.5">
                                  Prélève pour : <strong>{preleves.join(", ")}</strong>
                                </div>
                              ) : tous.length > 0 && echCount === 0 ? (
                                <div className="font-body text-xs text-gray-400 mt-0.5">
                                  Aucune échéance · enfants de la fiche : {tous.join(", ")}
                                </div>
                              ) : null}
                              <div className="font-body text-xs text-gray-400 mt-0.5">
                                Signé le {new Date(m.dateSignature).toLocaleDateString("fr-FR")}
                                {echCount > 0 && <span className="ml-2">· {echPending} échéance{echPending > 1 ? "s" : ""} en attente sur {echCount}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {m.status === "active" && estEnDouble(m) && (
                              <Badge color="orange">Doublon</Badge>
                            )}
                            <Badge color={m.status === "active" ? "green" : "gray"}>{m.status === "active" ? "Actif" : "Révoqué"}</Badge>
                            <button type="button" onClick={() => { setShowNewEcheancier(true); setNewEcheancier({ ...newEcheancier, mandatId: m.id }); setTab("echeancier"); }}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                              + Échéancier
                            </button>
                            {m.status === "active" && (
                              <button type="button" onClick={() => handleRevokeMandat(m)}
                                title="Révoquer : le mandat n'est plus utilisé, mais reste conservé comme preuve"
                                className="font-body text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                                Révoquer
                              </button>
                            )}
                            <button type="button" onClick={() => handleDeleteMandat(m.id)}
                              title="Supprimer définitivement (préférez « Révoquer »)"
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
                  <button type="button" onClick={selectCurrentMonth}
                    className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                    <Calendar size={14} /> Sélectionner ce mois
                  </button>
                  <button type="button" onClick={() => setShowNewEcheancier(!showNewEcheancier)}
                    className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-xl border-none cursor-pointer hover:bg-blue-400">
                    <Plus size={16} /> Nouvel échéancier
                  </button>
                </div>
              </div>

              {/* Formulaire nouvel échéancier */}
              {showNewEcheancier && (
                <Card padding="md" className="mb-5 border-2 border-blue-500/20">
                  <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Créer un échéancier</h3>
                  <label className="flex items-center gap-2 mb-4 cursor-pointer font-body text-sm text-slate-700">
                    <input type="checkbox" checked={repartir} onChange={e => setRepartir(e.target.checked)} />
                    Répartir sur 2 mandats (ex. parents séparés)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Mandat SEPA</label>
                      <select value={newEcheancier.mandatId} onChange={e => setNewEcheancier({ ...newEcheancier, mandatId: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                        <option value="">Choisir...</option>
                        {mandats.filter(m => m.status === "active").map(m => (
                          <option key={m.id} value={m.id}>{m.familyName}{m.libelle ? ` — ${m.libelle}` : ` — ${m.titulaire}`} ({m.mandatId})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-400 block mb-1">{repartir ? "Montant sur mandat 1" : "Montant total TTC"}</label>
                      <input type="number" step="0.01" value={newEcheancier.montantTotal} onChange={e => setNewEcheancier({ ...newEcheancier, montantTotal: e.target.value })}
                        placeholder="ex: 700"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                    </div>
                    {repartir && (
                      <>
                        <div>
                          <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Mandat SEPA n°2</label>
                          <select value={newEcheancier.mandatId2} onChange={e => setNewEcheancier({ ...newEcheancier, mandatId2: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                            <option value="">Choisir...</option>
                            {mandats.filter(m => m.status === "active" && m.id !== newEcheancier.mandatId).map(m => (
                              <option key={m.id} value={m.id}>{m.familyName}{m.libelle ? ` — ${m.libelle}` : ` — ${m.titulaire}`} ({m.mandatId})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Montant sur mandat 2</label>
                          <input type="number" step="0.01" value={newEcheancier.montant2} onChange={e => setNewEcheancier({ ...newEcheancier, montant2: e.target.value })}
                            placeholder="ex: 300"
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                        </div>
                      </>
                    )}
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
                  {!repartir && newEcheancier.montantTotal && newEcheancier.nbEcheances && (
                    <div className="bg-sand rounded-lg px-4 py-3 mb-4 font-body text-sm text-blue-800">
                      💡 {newEcheancier.nbEcheances} × <strong>{(parseFloat(newEcheancier.montantTotal) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong> = {parseFloat(newEcheancier.montantTotal).toFixed(2)}€
                    </div>
                  )}
                  {repartir && newEcheancier.montantTotal && newEcheancier.montant2 && newEcheancier.nbEcheances && (
                    <div className="bg-sand rounded-lg px-4 py-3 mb-4 font-body text-sm text-blue-800">
                      💡 Mandat 1 : {newEcheancier.nbEcheances}× <strong>{(parseFloat(newEcheancier.montantTotal) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong> · Mandat 2 : {newEcheancier.nbEcheances}× <strong>{(parseFloat(newEcheancier.montant2) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong>
                      <div className="text-xs text-blue-600 mt-0.5">Total : {(parseFloat(newEcheancier.montantTotal) + parseFloat(newEcheancier.montant2)).toFixed(2)}€</div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCreateEcheancier} disabled={saving || !newEcheancier.mandatId || !newEcheancier.montantTotal || !newEcheancier.dateDebut || (repartir && (!newEcheancier.mandatId2 || !newEcheancier.montant2))}
                      className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Créer {newEcheancier.nbEcheances} échéances
                    </button>
                    <button type="button" onClick={() => { setShowNewEcheancier(false); setRepartir(false); }} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
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
                  <button type="button" onClick={handleCreateRemise} disabled={saving}
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
                    <button type="button" onClick={selectAll} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer text-gray-400">
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
                      <button type="button" onClick={() => toggleEcheance(ech.id)} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer">
                        {selectedEcheances.has(ech.id) ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} className="text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800 truncate">{ech.familyName}</div>
                        <div className="font-body text-[10px] text-gray-400 font-mono">{ech.mandatId}</div>
                      </div>
                      <div className="w-28">
                        <input
                          key={`ech-date-${ech.id}-${ech.dateEcheance}`}
                          type="date"
                          defaultValue={ech.dateEcheance}
                          onBlur={async (ev) => {
                            const newDate = ev.target.value;
                            if (newDate && newDate !== ech.dateEcheance) {
                              await updateDoc(doc(db, "echeances-sepa", ech.id), { dateEcheance: newDate });
                              toast("Date de prélèvement mise à jour", "success");
                              // Refresh les données
                              const snap = await getDocs(collection(db, "echeances-sepa"));
                              setEcheances(snap.docs.map(d => ({ id: d.id, ...d.data() } as EcheanceSepa)));
                            }
                          }}
                          className="font-body text-xs text-gray-600 border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-blue-400 cursor-pointer w-full"
                        />
                      </div>
                      <div className="w-24 text-right font-body text-sm font-semibold text-blue-800">{ech.montant.toFixed(2)}€</div>
                      <div className="w-36 font-body text-xs text-gray-500 truncate pl-3">{ech.description}</div>
                      {/* Bouton "Décaler la série" uniquement sur la 1ere échéance d'une série multi */}
                      {ech.echeance === 1 && (ech.echeancesTotal || 0) > 1 && (
                        <button type="button"
                          onClick={() => handleShiftSeries(ech)}
                          title={`Décaler les ${ech.echeancesTotal} échéances de cette série`}
                          className="w-8 flex justify-center text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer">
                          📅
                        </button>
                      )}
                      <button type="button" onClick={() => handleDeleteEcheance(ech.id)} className="w-10 flex justify-end text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
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
                          <button type="button" onClick={() => downloadRemise(r)}
                            className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                            <Download size={12} /> XML
                          </button>
                          {r.status === "generated" && (
                            <button type="button" onClick={() => markDeposited(r.id)}
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
