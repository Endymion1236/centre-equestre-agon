"use client";
import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, CheckCircle, Calendar, Search, X } from "lucide-react";
import { useConfirm } from "@/components/ui/Confirm";
import type { ChequeDiffere, ChequeDiffereFilter, Payment } from "./types";
import {
  calculerStatsChequesDifferes,
  dateIsoDuJour,
  filtrerChequesDifferes,
  grouperChequesEnAttenteParMois,
  libelleMoisFr,
} from "./cheques-differes-utils";

interface TabChequesDiffresProps {
  enregistrerEncaissement: (
    paymentId: string,
    paymentData: Payment,
    montant: number,
    mode: string,
    ref?: string,
    activityTitle?: string,
    customDate?: string,
  ) => Promise<unknown>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
  payments: Payment[];
}

export function TabChequesDiffres({ enregistrerEncaissement, toast, refreshAll, payments }: TabChequesDiffresProps) {
  const confirmer = useConfirm();
  const [cheques, setCheques] = useState<ChequeDiffere[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChequeDiffereFilter>("all");
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchCheques = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "cheques-differes"));
      setCheques(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChequeDiffere)));
    } catch (e) {
      console.error("[cheques-differes] fetch:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCheques();
  }, []);

  const today = dateIsoDuJour();
  const filtered = filtrerChequesDifferes(cheques, statusFilter, search, today);
  const {
    pendingCheques,
    overdueCheques,
    totalPending,
    totalOverdue,
    totalDeposited,
  } = calculerStatsChequesDifferes(cheques, today);
  const pendingByMonth = grouperChequesEnAttenteParMois(pendingCheques);

  const handleDeposit = async (chq: ChequeDiffere) => {
    if (!(await confirmer({
      titre: `Déposer en banque le chèque n°${chq.numero || "—"} — ${chq.familyName} ?`,
      details: [
        `Montant : ${chq.montant.toFixed(2)}€`,
        `Date d'encaissement : ${new Date().toLocaleDateString("fr-FR")}`,
        "Un encaissement comptable sera créé. Il est inaltérable : seule une contre-passation peut le corriger.",
      ],
      libelleConfirmer: "Déposer",
      danger: true,
    }))) return;

    setProcessing(chq.id);
    try {
      const payment = payments.find((p) => p.id === chq.paymentId);
      if (!payment) {
        toast("Commande liée introuvable", "error");
        return;
      }

      const encDate = dateIsoDuJour();
      await enregistrerEncaissement(
        chq.paymentId,
        payment,
        chq.montant,
        "cheque",
        chq.numero || "",
        (payment.items || []).map((item) => item.activityTitle).join(", "),
        encDate,
      );

      await updateDoc(doc(db, "cheques-differes", chq.id), {
        status: "deposited",
        dateEncaissementEffective: encDate,
        updatedAt: serverTimestamp(),
      });

      toast(`✅ Chèque déposé — ${chq.montant.toFixed(2)}€`, "success");
      await fetchCheques();
      await refreshAll();
    } catch (e) {
      console.error("[cheques-differes] handleDeposit:", e);
      toast("Erreur lors du dépôt", "error");
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async (chq: ChequeDiffere) => {
    if (!confirm(`Annuler le chèque n°${chq.numero || "—"} de ${chq.familyName} ?\n\nÀ utiliser si le chèque a été rendu/détruit (ex: erreur de saisie).\nCette action n'est PAS comptable (n'affecte ni CA, ni TVA).`)) return;
    setProcessing(chq.id);
    try {
      await updateDoc(doc(db, "cheques-differes", chq.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      toast("Chèque annulé", "success");
      await fetchCheques();
    } catch (e) {
      console.error("[cheques-differes] handleCancel:", e);
      toast("Erreur", "error");
    } finally {
      setProcessing(null);
    }
  };

  const filters: { id: ChequeDiffereFilter; label: string }[] = [
    { id: "all", label: "Tous" },
    { id: "pending", label: "En attente" },
    { id: "overdue", label: `En retard${overdueCheques.length ? ` (${overdueCheques.length})` : ""}` },
    { id: "deposited", label: "Déposés" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">En attente</div>
          <div className="font-body text-xl font-bold text-blue-500 mt-1">{totalPending.toFixed(2)}€</div>
          <div className="font-body text-[10px] text-slate-400">{pendingCheques.length} chèque(s)</div>
        </Card>
        <Card padding="sm" className={totalOverdue > 0 ? "border-red-200 bg-red-50/40" : ""}>
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">En retard</div>
          <div className={`font-body text-xl font-bold mt-1 ${totalOverdue > 0 ? "text-red-500" : "text-slate-400"}`}>{totalOverdue.toFixed(2)}€</div>
          <div className="font-body text-[10px] text-slate-400">{overdueCheques.length} chèque(s)</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Déposés</div>
          <div className="font-body text-xl font-bold text-green-500 mt-1">{totalDeposited.toFixed(2)}€</div>
          <div className="font-body text-[10px] text-slate-400">cumul total</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Total saisi</div>
          <div className="font-body text-xl font-bold text-slate-700 mt-1">{cheques.length}</div>
          <div className="font-body text-[10px] text-slate-400">chèques au total</div>
        </Card>
      </div>

      <Card padding="sm" className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Famille, n° chèque, banque..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1">
            {filters.map((filter) => (
              <button
                type="button"
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={`font-body text-xs px-3 py-2 rounded-lg border cursor-pointer ${statusFilter === filter.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="font-body text-sm text-slate-500">
            {search || statusFilter !== "all" ? "Aucun chèque ne correspond aux filtres." : "Aucun chèque différé enregistré."}
          </p>
        </Card>
      ) : statusFilter === "pending" || statusFilter === "all" ? (
        <div className="flex flex-col gap-4">
          {(statusFilter === "pending" ? Object.keys(pendingByMonth) : [null]).map((month) => {
            const list = month !== null
              ? filtrerChequesDifferes(pendingByMonth[month], "all", search, today)
              : filtered;
            if (list.length === 0) return null;
            const monthTotal = list.reduce((sum, cheque) => sum + (cheque.montant || 0), 0);
            return (
              <Card key={month || "all"} padding="md">
                {month && (
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-body text-sm font-semibold text-blue-800 capitalize">{libelleMoisFr(month)}</h3>
                    <span className="font-body text-sm font-bold text-blue-500">{monthTotal.toFixed(2)}€ · {list.length} chèque(s)</span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {list.map((chq) => {
                    const isOverdue = chq.status === "pending" && chq.dateEncaissementPrevue < today;
                    return (
                      <div key={chq.id} className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${isOverdue ? "border-red-200 bg-red-50/30" : chq.status === "deposited" ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white"}`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                          <div className="font-body text-xs text-slate-500 min-w-[90px]">
                            {new Date(chq.dateEncaissementPrevue + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                          <div className="font-body text-sm font-semibold text-blue-800 truncate">{chq.familyName}</div>
                          <div className="font-body text-xs text-slate-500">
                            {chq.numero && <span>n°{chq.numero}</span>}
                            {chq.banque && <span className="ml-2">· {chq.banque}</span>}
                          </div>
                          {chq.status === "deposited" && (
                            <Badge color="green">Déposé{chq.dateEncaissementEffective ? ` le ${new Date(chq.dateEncaissementEffective + "T12:00:00").toLocaleDateString("fr-FR")}` : ""}</Badge>
                          )}
                          {chq.status === "cancelled" && <Badge color="gray">Annulé</Badge>}
                          {isOverdue && <Badge color="red">En retard</Badge>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-body text-base font-bold text-blue-500">{chq.montant.toFixed(2)}€</span>
                          {chq.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDeposit(chq)}
                                disabled={processing === chq.id}
                                className="font-body text-xs font-semibold text-white bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                {processing === chq.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                Déposer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancel(chq)}
                                disabled={processing === chq.id}
                                title="Annuler ce chèque (chèque rendu/détruit)"
                                className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1.5 disabled:opacity-50"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card padding="md">
          <div className="flex flex-col gap-2">
            {filtered.map((chq) => (
              <div key={chq.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-green-200 bg-green-50/30">
                <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                  <div className="font-body text-xs text-slate-500 min-w-[90px]">
                    {chq.dateEncaissementEffective ? new Date(chq.dateEncaissementEffective + "T12:00:00").toLocaleDateString("fr-FR") : "—"}
                  </div>
                  <div className="font-body text-sm font-semibold text-blue-800 truncate">{chq.familyName}</div>
                  <div className="font-body text-xs text-slate-500">
                    {chq.numero && <span>n°{chq.numero}</span>}
                    {chq.banque && <span className="ml-2">· {chq.banque}</span>}
                  </div>
                  <Badge color="green">Déposé</Badge>
                </div>
                <span className="font-body text-base font-bold text-green-600">{chq.montant.toFixed(2)}€</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
