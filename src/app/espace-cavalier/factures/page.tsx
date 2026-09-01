"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  Gift,
  Landmark,
  Loader2,
  Receipt,
  Sparkles,
  Ticket,
  Wallet,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/lib/auth-context";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { db } from "@/lib/firebase";

interface PaymentItem {
  activityTitle: string;
  priceHT: number;
  tva: number;
  priceTTC: number;
  childName?: string;
}

interface Payment {
  id: string;
  familyId: string;
  /** Date de debut du stage — sert a annoncer la date du prelevement (J-7). */
  stageDate?: string;
  /** Empreinte de carte CAWL : presente = le solde sera preleve automatiquement. */
  cofToken?: string;
  cardOnFileToken?: string;
  familyName: string;
  items: PaymentItem[];
  totalTTC: number;
  paymentMode: string;
  paidAmount: number;
  status: string;
  date: any;
  orderId?: string;
  /** Numéro de facture officiel, attribué à l'encaissement (CGI art. 242 nonies A). */
  invoiceNumber?: string;
}

interface SessionCard {
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
  familiale?: boolean;
  history?: any[];
}

interface DevisLigne {
  label: string;
  description?: string;
  qty: number;
  priceTTC: number;
  tva: number;
  remisePct?: number;
}

interface Devis {
  id: string;
  numero: string;
  familyId: string;
  familyName: string;
  serviceFacture?: string;
  items: DevisLigne[];
  totalTTC: number;
  status: "sent" | "accepted" | "refused" | "converted";
  note?: string;
  validUntil?: string;
  createdAt?: any;
}

/** Total TTC d'une ligne de devis, remise comprise (même calcul que l'admin). */
const devisLineTTC = (ligne: DevisLigne) =>
  Math.round((ligne.qty || 1) * (ligne.priceTTC || 0) * (1 - (ligne.remisePct || 0) / 100) * 100) / 100;

/** Devis contenant un forfait annuel : accepté, il déclenche une inscription
 *  aux cours par le club (qui facture à ce moment-là) — pas une facture ici. */
const devisContientForfait = (devis: Devis) => devis.items.some((ligne) => /forfait/i.test(ligne.label));

const devisStatusLabels: Record<Devis["status"], { label: string; color: "orange" | "green" | "red" | "blue" }> = {
  sent: { label: "En attente de votre réponse", color: "orange" },
  accepted: { label: "Accepté", color: "green" },
  refused: { label: "Refusé", color: "red" },
  converted: { label: "Facturé", color: "blue" },
};

const modeLabels: Record<string, string> = {
  cb_terminal: "CB",
  cb_online: "CB en ligne",
  cheque: "Chèque",
  especes: "Espèces",
  cheque_vacances: "Chèque-Vacances",
  pass_sport: "Pass'Sport",
  ancv: "ANCV",
  virement: "Virement",
  avoir: "Avoir",
  carte: "Carte",
  prelevement_sepa: "Prélèvement SEPA",
};

function paymentDate(payment: Payment) {
  const raw = payment.date;
  const date = raw?.seconds ? new Date(raw.seconds * 1000) : raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function paymentTitle(payment: Payment) {
  return (payment.items || []).map((item) => item.activityTitle).filter(Boolean).join(", ") || "Prestation équestre";
}

function remainingAmount(payment: Payment) {
  return Math.max(0, Math.round(((payment.totalTTC || 0) - (payment.paidAmount || 0)) * 100) / 100);
}

export default function FacturesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [devisList, setDevisList] = useState<Devis[]>([]);
  const [openDevisId, setOpenDevisId] = useState<string | null>(null);
  const [answeringDevis, setAnsweringDevis] = useState<string | null>(null);
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [fidelity, setFidelity] = useState<any>(null);
  const [fidelitySettings, setFidelitySettings] = useState<{ taux: number; minPoints: number; enabled: boolean } | null>(null);
  const [familyData, setFamilyData] = useState<any>(null);
  const [sepaMandates, setSepaMandates] = useState<any[]>([]);
  const [sepaSchedules, setSepaSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [payingOnline, setPayingOnline] = useState<string | null>(null);
  const [applyingGift, setApplyingGift] = useState<string | null>(null);
  const [convertingPoints, setConvertingPoints] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showCards, setShowCards] = useState(false);
  const [showFidelity, setShowFidelity] = useState(false);
  const [showSepa, setShowSepa] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [declaringPayment, setDeclaringPayment] = useState<Payment | null>(null);
  const [declareMode, setDeclareMode] = useState<"cheque" | "especes">("cheque");
  const [declareAmount, setDeclareAmount] = useState("");
  const [declareNote, setDeclareNote] = useState("");
  const [declareChequeRef, setDeclareChequeRef] = useState("");
  const [declareCashDate, setDeclareCashDate] = useState("");
  const [declareSending, setDeclareSending] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [declareSuccess, setDeclareSuccess] = useState(false);
  // Vrai quand la lecture des paiements a échoué : mieux vaut dire qu'on ne
  // sait pas que laisser croire à une ardoise vide.
  const [erreurChargement, setErreurChargement] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, "payments"), where("familyId", "==", user.uid)));
        setPayments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Payment[]);
      } catch (e) {
        // Le repli lisait TOUTE la collection `payments` puis filtrait dans le
        // navigateur. Il ne se déclenche que si la requête filtrée échoue —
        // c'est-à-dire au moment le plus délicat : des règles fraîchement
        // publiées qui refusent, ou un index absent. Ce jour-là, chaque
        // famille connectée aurait téléchargé l'intégralité des paiements du
        // club. Le coût se multiplie par le nombre d'inscrits, et contourner
        // un refus de règle n'est de toute façon pas le rôle d'un repli.
        //
        // Un échec doit se voir. La page affiche donc une erreur explicite.
        console.error("[factures] lecture des paiements refusée :", e);
        setPayments([]);
        setErreurChargement(true);
      }

      try {
        // Les brouillons restent invisibles : les rules exigent que la query
        // exclue "draft", d'où le filtre status in [...] en plus de familyId.
        const snapshot = await getDocs(query(
          collection(db, "devis"),
          where("familyId", "==", user.uid),
          where("status", "in", ["sent", "accepted", "refused", "converted"]),
        ));
        const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Devis[];
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDevisList(docs);
      } catch {
        setDevisList([]);
      }

      try {
        const snapshot = await getDocs(query(collection(db, "cartes"), where("familyId", "==", user.uid)));
        setCards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as SessionCard[]);
      } catch {
        setCards([]);
      }

      try {
        const snapshot = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
        setCredits(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch {
        setCredits([]);
      }

      try {
        const settingsSnapshot = await getDoc(doc(db, "settings", "fidelite"));
        if (settingsSnapshot.exists()) setFidelitySettings(settingsSnapshot.data() as any);

        let fidelitySnapshot = await getDoc(doc(db, "fidelite", user.uid));
        if (!fidelitySnapshot.exists()) {
          const fallback = await getDocs(query(collection(db, "fidelite"), where("familyId", "==", user.uid)));
          if (!fallback.empty) fidelitySnapshot = fallback.docs[0] as any;
        }
        if (fidelitySnapshot.exists()) setFidelity({ id: fidelitySnapshot.id, ...fidelitySnapshot.data() });
      } catch {
        // Le programme de fidélité est facultatif.
      }

      try {
        const direct = await getDoc(doc(db, "families", user.uid));
        if (direct.exists()) setFamilyData({ id: direct.id, ...direct.data() });
      } catch {
        // L'adresse n'est utile que pour le PDF.
      }

      try {
        const snapshot = await getDocs(query(collection(db, "mandats-sepa"), where("familyId", "==", user.uid)));
        setSepaMandates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch {
        setSepaMandates([]);
      }

      try {
        const snapshot = await getDocs(query(collection(db, "echeances-sepa"), where("familyId", "==", user.uid)));
        setSepaSchedules(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch {
        setSepaSchedules([]);
      }

      setLoading(false);
    };

    load();
  }, [user]);

  const activePayments = useMemo(
    () => payments.filter((payment) => payment.status !== "cancelled"),
    [payments],
  );

  const duePayments = useMemo(
    () => activePayments
      .filter((payment) => remainingAmount(payment) > 0.009)
      .sort((a, b) => paymentDate(b).getTime() - paymentDate(a).getTime()),
    [activePayments],
  );

  const settledPayments = useMemo(
    () => payments
      .filter((payment) => payment.status === "cancelled" || remainingAmount(payment) <= 0.009)
      .sort((a, b) => paymentDate(b).getTime() - paymentDate(a).getTime()),
    [payments],
  );

  const totalDue = duePayments.reduce((sum, payment) => sum + remainingAmount(payment), 0);
  const totalCredit = credits
    .filter((credit: any) => credit.status === "actif")
    .reduce((sum: number, credit: any) => sum + (credit.remainingAmount || 0), 0);

  const activeCards = cards.filter((card) => {
    const expired = card.dateFin && new Date(card.dateFin) < new Date();
    return card.status !== "used" && !expired && (card.remainingSessions || 0) > 0;
  });

  const activeMandate = sepaMandates.find((mandate: any) => mandate.status === "active");
  const upcomingSepa = sepaSchedules
    .filter((schedule: any) => schedule.status === "pending")
    .sort((a: any, b: any) => (a.dateEcheance || "").localeCompare(b.dateEcheance || ""));
  const pastSepa = sepaSchedules
    .filter((schedule: any) => schedule.status !== "pending")
    .sort((a: any, b: any) => (b.dateEcheance || "").localeCompare(a.dateEcheance || ""));

  const answerDevis = async (devis: Devis, accepted: boolean) => {
    if (!user) return;
    const question = accepted
      ? `Accepter le devis ${devis.numero} (${(devis.totalTTC || 0).toFixed(2)}€) ?`
      : `Refuser le devis ${devis.numero} ?`;
    if (!confirm(question)) return;

    setAnsweringDevis(devis.id);
    try {
      await updateDoc(doc(db, "devis", devis.id), {
        status: accepted ? "accepted" : "refused",
        decidedAt: serverTimestamp(),
        decidedBy: "famille",
      });
      setDevisList((current) => current.map((item) => (item.id === devis.id ? { ...item, status: accepted ? "accepted" : "refused" } : item)));
      toast(accepted ? "Devis accepté. Le club vous recontacte pour la suite." : "Votre refus a bien été transmis.", "success");

      // Prévenir le club — best effort, la réponse est déjà enregistrée.
      authFetch("/api/notify-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "devis_reponse",
          titre: `Devis ${devis.numero} ${accepted ? "accepté" : "refusé"} — ${devis.familyName}`,
          lignes: [
            `${devis.familyName} a ${accepted ? "accepté" : "refusé"} le devis ${devis.numero} depuis son espace famille.`,
            `Montant : ${(devis.totalTTC || 0).toFixed(2)}€ TTC.`,
            ...(accepted
              ? [devisContientForfait(devis)
                  ? "Contient un forfait annuel : à inscrire via Planning → mode annuel (pas de conversion en commande)."
                  : "À convertir en commande depuis Admin → Devis."]
              : []),
          ],
          familyId: devis.familyId,
        }),
      }).catch(() => {});
    } catch (error) {
      console.error(error);
      toast("Impossible d'enregistrer votre réponse. Réessayez ou contactez le club.", "error");
    }
    setAnsweringDevis(null);
  };

  /**
   * Renoncer à une réservation non réglée.
   *
   * Le parcours crée l'inscription, la réservation et le paiement AVANT
   * d'envoyer vers la banque. Sans ce bouton, une famille qui changeait
   * d'avis gardait indéfiniment un « reste à régler » dans son espace, et le
   * club une facture fantôme dans ses impayés — la seule issue était
   * d'appeler le centre.
   *
   * Le serveur refuse dès qu'un centime a été encaissé.
   */
  const cancelReservation = async (payment: Payment) => {
    const lignes = (payment.items || []).map((i: any) => i.activityTitle).filter(Boolean).join(", ");
    if (!confirm(
      `Annuler cette réservation ?\n\n${lignes}\n\nLa place sera immédiatement remise à la vente. ` +
      `Rien n'a été encaissé, tu n'as donc rien à payer.`
    )) return;
    setCancelling(payment.id!);
    try {
      const res = await authFetch("/api/annuler-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || "Annulation impossible.");
      setPayments((current) => current.map((item) =>
        item.id === payment.id ? ({ ...item, status: "cancelled" } as Payment) : item
      ));
    } catch (e: any) {
      alert(e?.message || "Annulation impossible pour le moment. Contacte le club.");
    }
    setCancelling(null);
  };

  const startOnlinePayment = async (payment: Payment) => {
    if (!user) return;
    setPayingOnline(payment.id);
    try {
      const remaining = remainingAmount(payment);
      const response = await authFetch("/api/cawl/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: user.uid,
          familyEmail: user.email,
          familyName: payment.familyName,
          paymentId: payment.id,
          items: [{ name: paymentTitle(payment), priceInCents: Math.round(remaining * 100), quantity: 1 }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Paiement indisponible");
      if (data.url) window.location.href = data.url;
      else toast("Le lien de paiement n'a pas pu être créé.", "error");
    } catch (error) {
      console.error(error);
      toast("Impossible d'ouvrir le paiement en ligne.", "error");
    }
    setPayingOnline(null);
  };

  const applyGiftCode = async (payment: Payment) => {
    const code = (prompt("Entrez le code de votre bon cadeau (ex. BON-XXXX) :") || "").trim().toUpperCase();
    if (!code) return;
    setApplyingGift(payment.id);
    try {
      const response = await authFetch("/api/bon-cadeau/appliquer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, paymentId: payment.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bon non appliqué");
      toast(
        data.facturePayee
          ? `Bon appliqué : ${data.applique.toFixed(2)}€. Facture réglée.`
          : `Bon appliqué : ${data.applique.toFixed(2)}€. Reste ${data.resteAPayer.toFixed(2)}€ à régler.`,
        "success",
      );
      window.location.reload();
    } catch (error: any) {
      toast(error?.message || "Impossible d'appliquer ce bon.", "error");
    }
    setApplyingGift(null);
  };

  const openDeclaration = (payment: Payment) => {
    setDeclaringPayment(payment);
    setDeclareAmount(remainingAmount(payment).toFixed(2));
    setDeclareMode("cheque");
    setDeclareNote("");
    setDeclareChequeRef("");
    setDeclareCashDate("");
    setDeclareSuccess(false);
  };

  const downloadReceipt = async (payment: Payment) => {
    const date = paymentDate(payment);
    const items = payment.items || [];
    const totalHT = items.reduce((sum, item) => sum + (item.priceHT || 0), 0);
    const totalTTC = payment.totalTTC || 0;
    const civilite = familyData?.civilite ? `${familyData.civilite} ` : "";
    const address = [
      familyData?.address,
      [familyData?.zipCode, familyData?.city].filter(Boolean).join(" "),
    ].filter(Boolean).join("\n");

    await downloadInvoicePdf({
      // Le numéro de facture officiel — celui de la séquence continue, attribué
      // à l'encaissement — d'abord. La famille recevait sinon un numéro
      // fabriqué à la volée (« F-202608-FXY1 ») pendant que l'administration
      // en affichait un autre (« F-2026-0200 ») pour la MÊME vente : deux
      // pièces différentes pour une seule facture.
      invoiceNumber: (payment as any).invoiceNumber || payment.orderId
        || `F-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${payment.id.slice(-4).toUpperCase()}`,
      date: date.toLocaleDateString("fr-FR"),
      familyName: `${civilite}${payment.familyName || familyData?.parentName || ""}`,
      familyEmail: user?.email || "",
      familyAddress: address,
      serviceFacture: (payment as any).serviceFacture || undefined,
      items: items.map((item) => ({ ...item, childName: item.childName || "" })),
      totalHT,
      totalTVA: totalTTC - totalHT,
      totalTTC,
      paidAmount: payment.paidAmount || 0,
      paymentMode: modeLabels[payment.paymentMode] || payment.paymentMode || "",
      paymentDate: payment.paidAmount > 0 ? date.toLocaleDateString("fr-FR") : "",
      paymentId: payment.id,
    });
  };

  const convertPoints = async () => {
    if (!user || !fidelity || !fidelitySettings) return;
    const amount = Math.floor((fidelity.points || 0) / fidelitySettings.taux * 100) / 100;
    const usedPoints = Math.floor(amount * fidelitySettings.taux);
    if (amount <= 0) return;
    if (!confirm(`Convertir ${usedPoints} points en ${amount.toFixed(2)}€ d'avoir ?`)) return;

    setConvertingPoints(true);
    try {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      await addDoc(collection(db, "avoirs"), {
        familyId: user.uid,
        familyName: fidelity.familyName || familyData?.parentName || "",
        type: "avoir",
        amount,
        usedAmount: 0,
        remainingAmount: amount,
        reason: `Conversion fidélité (${usedPoints} pts)`,
        reference: `FID-${Date.now().toString(36).toUpperCase()}`,
        sourceType: "fidelite",
        status: "actif",
        expiryDate: expiry,
        usageHistory: [],
        createdAt: serverTimestamp(),
      });

      const newPoints = (fidelity.points || 0) - usedPoints;
      await updateDoc(doc(db, "fidelite", fidelity.id || user.uid), {
        points: newPoints,
        history: [
          ...(fidelity.history || []),
          { date: new Date().toISOString(), points: -usedPoints, type: "conversion", label: `Avoir ${amount.toFixed(2)}€` },
        ],
        updatedAt: serverTimestamp(),
      });
      setFidelity({ ...fidelity, points: newPoints });
      setCredits((current) => [...current, { id: `local-${Date.now()}`, status: "actif", remainingAmount: amount }]);
      toast(`${amount.toFixed(2)}€ d'avoir créé.`, "success");
    } catch (error) {
      console.error(error);
      toast("Erreur lors de la conversion.", "error");
    }
    setConvertingPoints(false);
  };

  const sendDeclaration = async () => {
    if (!declaringPayment || !user) return;
    const amount = parseFloat(declareAmount);
    if (!amount || amount <= 0) return;

    setDeclareSending(true);
    try {
      await addDoc(collection(db, "payment_declarations"), {
        paymentId: declaringPayment.id,
        familyId: user.uid,
        familyName: declaringPayment.familyName,
        familyEmail: user.email || "",
        montant: amount,
        mode: declareMode,
        note: declareNote,
        chequeRef: declareChequeRef,
        dateEncaissement: declareCashDate,
        activityTitle: paymentTitle(declaringPayment),
        status: "pending_confirmation",
        createdAt: serverTimestamp(),
      });

      // /api/send-email est adminOnly : cet appel repartait en 403 et la
      // notification n'arrivait jamais. Route dediee aux familles, avec
      // destinataire impose cote serveur.
      authFetch("/api/notify-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "declaration_paiement",
          titre: `Déclaration de paiement — ${declaringPayment.familyName}`,
          lignes: [
            `${declaringPayment.familyName} déclare un paiement de ${amount.toFixed(2)}€ en ${declareMode === "cheque" ? "chèque" : "espèces"}.`,
            paymentTitle(declaringPayment),
          ],
          familyId: declaringPayment.familyId,
          paymentId: declaringPayment.id,
        }),
      }).catch(() => {});

      setDeclareSuccess(true);
    } catch (error) {
      console.error(error);
      toast("Impossible d'envoyer la déclaration.", "error");
    }
    setDeclareSending(false);
  };

  const renderPayment = (payment: Payment, due = false) => {
    const date = paymentDate(payment);
    const remaining = remainingAmount(payment);
    const isSepa = payment.paymentMode === "prelevement_sepa";

    return (
      <Card key={payment.id} padding="md" className={due ? "!border-orange-200" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-body text-sm font-bold text-blue-800">{paymentTitle(payment)}</div>
            <div className="font-body text-xs text-gray-500 mt-1">
              {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              {payment.paymentMode && ` · ${modeLabels[payment.paymentMode] || payment.paymentMode}`}
            </div>
            {due && (payment.paidAmount || 0) > 0 && (
              <div className="font-body text-xs text-gray-600 mt-2">
                Déjà réglé : <span className="font-semibold text-green-600">{(payment.paidAmount || 0).toFixed(2)}€</span>
                {/* La facture n'est numérotée qu'au règlement complet. Sans
                    cette phrase, une famille ayant versé un acompte cherche
                    une facture qui n'existe pas encore. */}
                <span className="block text-gray-400 mt-0.5">
                  La facture sera émise une fois le solde réglé.
                </span>
              </div>
            )}
          </div>

          <div className="text-right flex-shrink-0">
            <div className={`font-display text-xl font-bold ${due ? "text-orange-600" : payment.status === "cancelled" ? "text-gray-400" : "text-green-600"}`}>
              {due ? `${remaining.toFixed(2)}€` : `${(payment.totalTTC || 0).toFixed(2)}€`}
            </div>
            <div className="font-body text-xs text-gray-500">{due ? "reste à régler" : payment.status === "cancelled" ? "annulé" : "réglé"}</div>
          </div>
        </div>

        {/* Solde de stage : annoncer ce qui VA se passer. Sans cette ligne,
            la famille voit « reste à régler » sans savoir si un prélèvement
            viendra (carte enregistrée) ou si elle devra agir (pas de carte).
            L'email de confirmation le disait — mais qui relit l'email trois
            semaines après ? */}
        {due && payment.stageDate && (() => {
          const d = new Date(`${payment.stageDate}T12:00:00`);
          if (isNaN(d.getTime())) return null;
          d.setDate(d.getDate() - 7);
          const datePrelev = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
          const carteOk = Boolean(payment.cofToken || payment.cardOnFileToken);
          return (
            <div className={`mt-3 rounded-lg px-3 py-2 font-body text-xs leading-snug ${carteOk ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
              {carteOk
                ? <>💳 Le solde sera <strong>prélevé automatiquement</strong> sur votre carte enregistrée vers le <strong>{datePrelev}</strong>. Aucune action n'est requise — vous pouvez aussi régler dès maintenant.</>
                : <>⚠️ Votre carte n'est pas enregistrée : le solde ne sera <strong>pas prélevé automatiquement</strong>. Un lien de paiement vous sera envoyé vers le <strong>{datePrelev}</strong> — ou réglez dès maintenant ci-dessous.</>}
            </div>
          );
        })()}

        {due && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
            {isSepa ? (
              <button type="button" onClick={() => setShowSepa(true)} className="flex-1 min-w-[150px] py-2.5 rounded-xl font-body text-sm font-bold text-blue-700 bg-blue-50 border-none cursor-pointer">
                Voir l'échéancier SEPA
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={payingOnline === payment.id}
                  onClick={() => startOnlinePayment(payment)}
                  className="flex-1 min-w-[110px] flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50"
                >
                  {payingOnline === payment.id ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  Payer par CB
                </button>
                <button
                  type="button"
                  disabled={applyingGift === payment.id}
                  onClick={() => applyGiftCode(payment)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-emerald-700 bg-emerald-50 border-none cursor-pointer disabled:opacity-50"
                >
                  {applyingGift === payment.id ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                  Bon cadeau
                </button>
                <button type="button" onClick={() => openDeclaration(payment)} className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-gray-600 bg-gray-100 border-none cursor-pointer">
                  Déclarer un règlement
                </button>
                {/* Renoncer. Visible uniquement tant que RIEN n'a été encaissé :
                    dès le premier centime, l'annulation relève des conditions
                    d'annulation et passe par le club. */}
                {(payment.paidAmount || 0) === 0 && !(payment as any).invoiceNumber && (
                  <button
                    type="button"
                    disabled={cancelling === payment.id}
                    onClick={() => cancelReservation(payment)}
                    className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-red-600 bg-red-50 border-none cursor-pointer disabled:opacity-50"
                  >
                    {cancelling === payment.id ? <Loader2 size={14} className="animate-spin" /> : "Annuler"}
                  </button>
                )}
              </>
            )}
            {/* Tant qu'il reste un solde, le numéro de facture n'est pas
                attribué (il l'est au règlement complet) : le document produit
                est un justificatif, pas une facture. Le bouton disait
                « facture » — la famille cliquait, recevait autre chose, et
                signalait une facture manquante. */}
            <button type="button" onClick={() => downloadReceipt(payment)} className="w-10 h-10 rounded-xl bg-gray-50 text-gray-600 border-none cursor-pointer flex items-center justify-center"
              title={payment.paidAmount > 0 ? "Télécharger le justificatif d'acompte — la facture sera émise au règlement du solde" : "Télécharger le récapitulatif de commande"}>
              <Download size={16} />
            </button>
          </div>
        )}

        {!due && (
          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={() => downloadReceipt(payment)} className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer">
              <Download size={13} /> Télécharger la facture
            </button>
          </div>
        )}
      </Card>
    );
  };

  if (loading) {
    return <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>;
  }

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Mes paiements</h1>
        <p className="font-body text-sm text-gray-600">Ce qu'il reste à régler, vos avoirs et vos factures.</p>
      </div>

      {/* Un écran vide se lit « vous ne devez rien ». Quand la lecture a
          échoué, il faut le dire : sans cela, une famille repart persuadée
          d'être à jour. */}
      {erreurChargement && (
        <Card padding="md" className="mb-5 !bg-red-50 !border-red-200">
          <div className="font-body text-sm font-bold text-red-800 mb-1">Vos paiements n&apos;ont pas pu être chargés</div>
          <div className="font-body text-xs text-red-700 leading-relaxed">
            Cette page ne montre donc pas votre situation réelle. Réessayez dans quelques minutes ;
            si le problème persiste, contactez le centre — nous vérifierons de notre côté.
          </div>
        </Card>
      )}

      {totalDue > 0 ? (
        <Card padding="md" className="mb-5 !bg-gradient-to-br !from-orange-50 !to-amber-50 !border-orange-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-body text-xs uppercase tracking-wider font-bold text-orange-600">Reste à régler</div>
              <div className="font-display text-3xl font-bold text-orange-700 mt-1">{totalDue.toFixed(2)}€</div>
              <div className="font-body text-xs text-orange-700 mt-1">
                {duePayments.length} paiement{duePayments.length > 1 ? "s" : ""} concerné{duePayments.length > 1 ? "s" : ""}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center"><CreditCard size={23} className="text-orange-600" /></div>
          </div>
        </Card>
      ) : (
        <Card padding="sm" className="mb-5 !bg-green-50 !border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><CheckCircle2 size={20} className="text-green-600" /></div>
            <div>
              <div className="font-body text-sm font-bold text-green-800">Tout est à jour</div>
              <div className="font-body text-xs text-green-700">Aucun règlement n'est attendu pour le moment.</div>
            </div>
          </div>
        </Card>
      )}

      {totalCredit > 0 && (
        <Card padding="sm" className="mb-6 !bg-gold-50 !border-gold-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center"><Wallet size={19} className="text-gold-600" /></div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Avoir disponible</div>
                <div className="font-body text-xs text-gray-600">Utilisable sur une prochaine réservation</div>
              </div>
            </div>
            <div className="font-display text-xl font-bold text-gold-600">{totalCredit.toFixed(2)}€</div>
          </div>
        </Card>
      )}

      {duePayments.length > 0 && (
        <section className="mb-7">
          <h2 className="font-display text-lg font-bold text-blue-800 mb-3">À régler</h2>
          <div className="flex flex-col gap-3">{duePayments.map((payment) => renderPayment(payment, true))}</div>
        </section>
      )}

      {devisList.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-lg font-bold text-blue-800">Mes devis</h2>
            {devisList.some((item) => item.status === "sent") && (
              <span className="font-body text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                {devisList.filter((item) => item.status === "sent").length} à valider
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {[...devisList]
              .sort((a, b) => (a.status === "sent" ? -1 : 0) - (b.status === "sent" ? -1 : 0))
              .map((devis) => {
                const meta = devisStatusLabels[devis.status] || devisStatusLabels.sent;
                const open = openDevisId === devis.id;
                const expired = Boolean(devis.validUntil && new Date(devis.validUntil) < new Date() && devis.status === "sent");
                const created = devis.createdAt?.seconds ? new Date(devis.createdAt.seconds * 1000) : null;
                return (
                  <Card key={devis.id} padding="md" className={devis.status === "sent" ? "!border-orange-200" : ""}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileText size={15} className="text-blue-500 flex-shrink-0" />
                          <span className="font-body text-xs text-gray-400">{devis.numero}</span>
                          <Badge color={meta.color}>{meta.label}</Badge>
                        </div>
                        {devis.serviceFacture && (
                          <div className="font-body text-xs text-gray-600 mt-1">Service : {devis.serviceFacture}</div>
                        )}
                        <div className="font-body text-xs text-gray-500 mt-1">
                          {created && `Reçu le ${created.toLocaleDateString("fr-FR")} · `}
                          {devis.items.length} ligne{devis.items.length > 1 ? "s" : ""}
                          {devis.validUntil && ` · valable jusqu'au ${new Date(devis.validUntil).toLocaleDateString("fr-FR")}`}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-display text-xl font-bold text-blue-800">{(devis.totalTTC || 0).toFixed(2)}€</div>
                        <div className="font-body text-xs text-gray-500">TTC</div>
                      </div>
                    </div>

                    <button type="button" onClick={() => setOpenDevisId(open ? null : devis.id)} className="flex items-center gap-1 font-body text-xs text-gray-400 mt-2 bg-transparent border-none cursor-pointer hover:text-blue-500 px-0">
                      <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                      {open ? "Masquer le détail" : "Voir le détail"}
                    </button>

                    {open && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {devis.items.map((ligne, index) => (
                          <div key={index} className="flex justify-between gap-3 font-body text-xs py-1.5 border-b border-gray-50 last:border-0">
                            <span className="text-gray-600">
                              {ligne.qty > 1 ? `${ligne.qty}× ` : ""}{ligne.label}
                              {ligne.remisePct ? <span className="text-rose-600"> (remise -{ligne.remisePct}%)</span> : null}
                            </span>
                            <span className="font-semibold text-blue-800 flex-shrink-0">{devisLineTTC(ligne).toFixed(2)}€</span>
                          </div>
                        ))}
                        {devis.note && <div className="mt-2 font-body text-xs text-gray-500 italic">📝 {devis.note}</div>}
                      </div>
                    )}

                    {devis.status === "sent" && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        {expired && (
                          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 font-body text-xs text-amber-800">
                            ⚠️ La date de validité de ce devis est dépassée. Vous pouvez encore répondre : le club confirmera si le tarif est maintenu.
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={answeringDevis === devis.id}
                            onClick={() => answerDevis(devis, true)}
                            className="flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-green-600 border-none cursor-pointer disabled:opacity-50"
                          >
                            {answeringDevis === devis.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Accepter le devis
                          </button>
                          <button
                            type="button"
                            disabled={answeringDevis === devis.id}
                            onClick={() => answerDevis(devis, false)}
                            className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-red-500 bg-red-50 border-none cursor-pointer disabled:opacity-50"
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    )}

                    {devis.status === "accepted" && (
                      <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 font-body text-xs text-green-800">
                        {devisContientForfait(devis)
                          ? "✅ Devis accepté — le club finalise l'inscription aux cours et vous recontacte. La facturation se fera à l'inscription."
                          : "✅ Devis accepté — le club prépare la facturation. Elle apparaîtra ici, dans « À régler »."}
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        </section>
      )}

      {(activeCards.length > 0 || fidelitySettings?.enabled) && (
        <section className="mb-7">
          <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Mes avantages</h2>
          <Card padding="sm">
            {activeCards.length > 0 && (
              <>
                <button type="button" onClick={() => setShowCards((value) => !value)} className="w-full flex items-center justify-between gap-3 bg-transparent border-none p-2 cursor-pointer text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center"><Ticket size={19} className="text-gold-600" /></div>
                    <div>
                      <div className="font-body text-sm font-bold text-blue-800">Cartes de séances</div>
                      <div className="font-body text-xs text-gray-600">{activeCards.reduce((sum, card) => sum + (card.remainingSessions || 0), 0)} séance(s) restante(s)</div>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform ${showCards ? "rotate-180" : ""}`} />
                </button>

                {showCards && (
                  <div className="mt-2 pt-3 border-t border-gray-100 flex flex-col gap-3">
                    {activeCards.map((card) => {
                      const open = openCardId === card.id;
                      const percentage = card.totalSessions > 0 ? (card.remainingSessions / card.totalSessions) * 100 : 0;
                      return (
                        <div key={card.id} className="rounded-xl bg-gold-50/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-body text-sm font-bold text-blue-800">Carte {card.totalSessions} séances · {card.activityType === "balade" ? "Balades" : "Cours"}</div>
                              <div className="font-body text-xs text-gray-600 mt-0.5">{card.familiale ? "Carte familiale" : card.childName}</div>
                            </div>
                            <Badge color={card.remainingSessions > 2 ? "green" : "orange"}>{card.remainingSessions}/{card.totalSessions}</Badge>
                          </div>
                          <div className="h-2 rounded-full bg-white overflow-hidden mt-3"><div className="h-full rounded-full bg-gold-400" style={{ width: `${percentage}%` }} /></div>
                          {(card.history || []).length > 0 && (
                            <>
                              <button type="button" onClick={() => setOpenCardId(open ? null : card.id)} className="font-body text-xs font-semibold text-blue-500 bg-transparent border-none cursor-pointer mt-2 px-0">
                                {open ? "Masquer l'historique" : "Voir l'historique"}
                              </button>
                              {open && (
                                <div className="flex flex-col gap-1 mt-2">
                                  {[...(card.history || [])].reverse().slice(0, 10).map((entry: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5">
                                      <div className="font-body text-xs text-gray-700">{entry.activityTitle || "Séance"} · {entry.date ? new Date(entry.date).toLocaleDateString("fr-FR") : ""}</div>
                                      <div className={`font-body text-xs font-bold ${entry.credit ? "text-green-600" : "text-gold-600"}`}>{entry.credit ? "+1" : "✓"}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {fidelitySettings?.enabled && (
              <div className={activeCards.length > 0 ? "mt-2 pt-2 border-t border-gray-100" : ""}>
                <button type="button" onClick={() => setShowFidelity((value) => !value)} className="w-full flex items-center justify-between gap-3 bg-transparent border-none p-2 cursor-pointer text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center"><Sparkles size={19} className="text-yellow-600" /></div>
                    <div>
                      <div className="font-body text-sm font-bold text-blue-800">Fidélité</div>
                      <div className="font-body text-xs text-gray-600">{fidelity?.points || 0} points · {(((fidelity?.points || 0) / (fidelitySettings.taux || 50))).toFixed(2)}€</div>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform ${showFidelity ? "rotate-180" : ""}`} />
                </button>

                {showFidelity && (
                  <div className="mt-2 pt-3 border-t border-gray-100">
                    {(fidelity?.points || 0) >= (fidelitySettings.minPoints || 500) ? (
                      <button type="button" disabled={convertingPoints} onClick={convertPoints} className="w-full py-2.5 rounded-xl font-body text-sm font-bold text-white bg-yellow-500 border-none cursor-pointer disabled:opacity-50">
                        {convertingPoints ? "Conversion en cours..." : "Convertir mes points en avoir"}
                      </button>
                    ) : (
                      <>
                        <div className="flex justify-between font-body text-xs text-gray-600 mb-2">
                          <span>Encore {(fidelitySettings.minPoints || 500) - (fidelity?.points || 0)} points avant conversion</span>
                          <span>{Math.round(((fidelity?.points || 0) / (fidelitySettings.minPoints || 500)) * 100)}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-yellow-400" style={{ width: `${Math.min(100, ((fidelity?.points || 0) / (fidelitySettings.minPoints || 500)) * 100)}%` }} /></div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </section>
      )}

      {(activeMandate || sepaSchedules.length > 0) && (
        <section className="mb-7">
          <button type="button" onClick={() => setShowSepa((value) => !value)} className="w-full flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Landmark size={19} className="text-blue-600" /></div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Prélèvements SEPA</div>
                <div className="font-body text-xs text-gray-600">{upcomingSepa.length > 0 ? `${upcomingSepa.length} échéance(s) à venir` : "Mandat et historique"}</div>
              </div>
            </div>
            <ChevronDown size={18} className={`text-gray-400 transition-transform ${showSepa ? "rotate-180" : ""}`} />
          </button>

          {showSepa && (
            <div className="flex flex-col gap-3 mt-3">
              {activeMandate && (() => {
                const iban = (activeMandate.iban || "").replace(/\s/g, "");
                const masked = iban.length > 8 ? `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}` : iban;
                return (
                  <Card padding="md">
                    <div className="font-body text-sm font-bold text-blue-800">Mandat actif</div>
                    <div className="font-body text-xs text-gray-600 mt-2">Titulaire : {activeMandate.titulaire}</div>
                    <div className="font-body text-xs text-gray-600">IBAN : <span className="font-mono">{masked}</span></div>
                  </Card>
                );
              })()}

              {upcomingSepa.length > 0 && (
                <Card padding="md">
                  <div className="font-body text-sm font-bold text-blue-800 mb-3">Échéances à venir</div>
                  <div className="flex flex-col gap-2">
                    {upcomingSepa.map((schedule: any) => (
                      <div key={schedule.id} className="flex items-center justify-between gap-3 bg-blue-50 rounded-xl px-3 py-2.5">
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{schedule.description || "Échéance"}</div>
                          <div className="font-body text-xs text-gray-600">Le {schedule.dateEcheance ? new Date(schedule.dateEcheance).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}</div>
                        </div>
                        <div className="font-body text-base font-bold text-blue-800">{(schedule.montant || 0).toFixed(2)}€</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {pastSepa.length > 0 && (
                <Card padding="md">
                  <div className="font-body text-sm font-bold text-blue-800 mb-3">Historique SEPA</div>
                  <div className="flex flex-col gap-2">
                    {pastSepa.slice(0, 12).map((schedule: any) => (
                      <div key={schedule.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <div className="font-body text-xs font-semibold text-gray-700">{schedule.description || "Échéance"}</div>
                          <div className="font-body text-xs text-gray-500">{schedule.dateEcheance ? new Date(schedule.dateEcheance).toLocaleDateString("fr-FR") : "—"} · {schedule.status}</div>
                        </div>
                        <div className="font-body text-sm font-semibold text-gray-700">{(schedule.montant || 0).toFixed(2)}€</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </section>
      )}

      <section>
        <button type="button" onClick={() => setShowHistory((value) => !value)} className="w-full flex items-center justify-between gap-3 bg-transparent border-none py-2 cursor-pointer text-left">
          <div className="flex items-center gap-2">
            <Receipt size={17} className="text-gray-400" />
            <span className="font-body text-sm font-bold text-gray-700">Historique des factures</span>
            <span className="font-body text-xs text-gray-400">{settledPayments.length}</span>
          </div>
          <ChevronDown size={18} className={`text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>

        {showHistory && (
          <div className="flex flex-col gap-3 mt-3">
            {settledPayments.length === 0 ? (
              <Card padding="md"><div className="font-body text-sm text-gray-500 text-center">Aucune facture archivée.</div></Card>
            ) : settledPayments.map((payment) => renderPayment(payment))}
          </div>
        )}
      </section>

      {declaringPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => !declareSending && setDeclaringPayment(null)}>
          <div className="bg-white rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Déclarer un règlement</h2>
              <p className="font-body text-xs text-gray-500 mt-1">{paymentTitle(declaringPayment)}</p>
            </div>

            <div className="p-5">
              {declareSuccess ? (
                <div className="text-center py-5">
                  <div className="text-4xl mb-3">✅</div>
                  <div className="font-body text-base font-bold text-green-700">Déclaration envoyée</div>
                  <p className="font-body text-xs text-gray-500 mt-1">Le centre confirmera la réception du règlement.</p>
                  <button type="button" onClick={() => setDeclaringPayment(null)} className="mt-4 font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer">Fermer</button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-2">Mode de paiement</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([["cheque", "📝 Chèque"], ["especes", "💵 Espèces"]] as const).map(([mode, label]) => (
                        <button key={mode} type="button" onClick={() => setDeclareMode(mode)} className={`py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer ${declareMode === mode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600"}`}>{label}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-2">Montant (€)</label>
                    <input type="number" min="0" step="0.01" value={declareAmount} onChange={(event) => setDeclareAmount(event.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-base font-bold text-blue-800 focus:outline-none focus:border-blue-500" />
                  </div>

                  {declareMode === "cheque" && (
                    <div>
                      <label className="font-body text-xs font-semibold text-gray-600 block mb-2">N° de chèque <span className="font-normal text-gray-400">(facultatif)</span></label>
                      <input value={declareChequeRef} onChange={(event) => setDeclareChequeRef(event.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                  )}

                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-2">Date d'encaissement prévue <span className="font-normal text-gray-400">(facultatif)</span></label>
                    <input type="date" value={declareCashDate} onChange={(event) => setDeclareCashDate(event.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                  </div>

                  <div>
                    <label className="font-body text-xs font-semibold text-gray-600 block mb-2">Note <span className="font-normal text-gray-400">(facultatif)</span></label>
                    <input value={declareNote} onChange={(event) => setDeclareNote(event.target.value)} placeholder="Ex. remis au secrétariat" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setDeclaringPayment(null)} className="px-5 py-2.5 rounded-xl font-body text-sm text-gray-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
                    <button type="button" disabled={declareSending || !declareAmount || parseFloat(declareAmount) <= 0} onClick={sendDeclaration} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
                      {declareSending ? <Loader2 size={15} className="animate-spin" /> : "Envoyer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
