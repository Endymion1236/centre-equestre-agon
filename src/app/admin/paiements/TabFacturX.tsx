"use client";
import React, { useMemo, useState } from "react";
import { updateDoc, doc, serverTimestamp, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, FileText, Check, Undo2, ExternalLink } from "lucide-react";
import { downloadFacturX, downloadFacturXPdf } from "@/lib/download-facturx";
import { useAuth } from "@/lib/auth-context";
import { DEBUT_DEPOT_FACTURX, resumerDepots, type LigneDepot } from "./facturx-depot-utils";

/**
 * Onglet « Factur-X » — la mémoire des dépôts sur la Plateforme Agréée.
 *
 * Réforme de la facturation électronique : toute facture adressée à un client
 * professionnel (asso, collectivité, entreprise) doit transiter par la
 * Plateforme Agréée du centre (Cecurity, via le cabinet comptable). Tant que
 * l'envoi n'est pas automatisé, l'admin télécharge le PDF Factur-X, le dépose
 * sur le portail, puis coche « Déposée » ici. Le badge de l'onglet compte ce
 * qui reste à faire.
 */

interface TabFacturXProps {
  loading: boolean;
  payments: any[];
  families: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
}

const LIBELLE_COMPTE: Record<string, { label: string; color: "purple" | "blue" | "orange" | "gray" }> = {
  asso: { label: "Asso", color: "purple" },
  collectivite: { label: "Collectivité", color: "blue" },
  entreprise: { label: "Entreprise", color: "orange" },
};

export function TabFacturX({ loading, payments, families, toast, setPayments }: TabFacturXProps) {
  const { user } = useAuth();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [voirDeposees, setVoirDeposees] = useState(false);

  const { aDeposer, deposees } = useMemo(() => resumerDepots(payments, families), [payments, families]);

  const marquer = async (ligne: LigneDepot<any, any>, deposee: boolean) => {
    const id = ligne.payment.id;
    if (!id) return;
    setEnCours(id);
    try {
      const patch = deposee
        ? { facturxDeposeLe: serverTimestamp(), facturxDeposePar: user?.email || "admin", updatedAt: serverTimestamp() }
        : { facturxDeposeLe: deleteField(), facturxDeposePar: deleteField(), updatedAt: serverTimestamp() };
      await updateDoc(doc(db, "payments", id), patch);
      setPayments(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (deposee) return { ...p, facturxDeposeLe: new Date(), facturxDeposePar: user?.email || "admin" };
        const { facturxDeposeLe: _a, facturxDeposePar: _b, ...reste } = p;
        return reste;
      }));
      toast(deposee ? `Facture ${ligne.payment.invoiceNumber} marquée déposée sur Cecurity` : `Dépôt de ${ligne.payment.invoiceNumber} annulé`, deposee ? "success" : "info");
    } catch (e) {
      console.error(e);
      toast("Impossible d'enregistrer le dépôt", "error");
    }
    setEnCours(null);
  };

  const Ligne = ({ ligne }: { ligne: LigneDepot<any, any> }) => {
    const p = ligne.payment;
    const compte = LIBELLE_COMPTE[String(ligne.family.accountType)] || { label: "Pro", color: "gray" as const };
    const soldee = p.status === "paid" || (Number(p.paidAmount) || 0) + 0.01 >= (Number(p.totalTTC) || 0);
    const enRetard = !soldee && p.dueDate && p.dueDate < new Date().toISOString().slice(0, 10);
    const occupe = enCours === p.id;
    return (
      <div className={`px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center gap-2 ${ligne.deposee ? "opacity-70" : "hover:bg-indigo-50/30"}`}>
        <span className="w-24 font-body text-xs text-slate-500">{new Date(ligne.dateEmission).toLocaleDateString("fr-FR")}</span>
        <span className="w-24 font-body text-xs font-semibold text-blue-800">{p.invoiceNumber}</span>
        <span className="flex-1 min-w-0">
          <span className="font-body text-sm font-semibold text-blue-800 truncate block">{p.familyName || ligne.family.parentName || "Client"}</span>
          <span className="font-body text-[10px] text-slate-400">
            {soldee ? "Acquittée" : p.dueDate ? `Échéance ${new Date(p.dueDate).toLocaleDateString("fr-FR")}` : "Non acquittée"}
            {enRetard ? " · en retard" : ""}
          </span>
        </span>
        <span className="w-24"><Badge color={compte.color}>{compte.label}</Badge></span>
        <span className="w-20 text-right font-body text-sm font-semibold text-blue-800">{(Number(p.totalTTC) || 0).toFixed(2)}€</span>
        <span className="w-24 flex items-center justify-center gap-1">
          <button type="button" onClick={() => downloadFacturX(p.id, p.invoiceNumber)} title="XML Factur-X (EN 16931)"
            className="font-body text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-100 leading-none">XML</button>
          <button type="button" onClick={() => downloadFacturXPdf(p.id, p.invoiceNumber)} title="PDF Factur-X hybride — c'est ce fichier qu'on dépose sur Cecurity"
            className="font-body text-[9px] font-bold text-white bg-indigo-500 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-600 leading-none">F-X</button>
        </span>
        <span className="w-36 text-right">
          {ligne.deposee ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-body text-[10px] text-green-600" title={p.facturxDeposePar ? `par ${p.facturxDeposePar}` : undefined}>
                <Check size={10} className="inline" /> déposée
              </span>
              <button type="button" disabled={occupe} onClick={() => marquer(ligne, false)} title="Annuler le marquage (dépôt non fait)"
                className="font-body text-[10px] text-slate-400 bg-gray-100 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-gray-200 disabled:opacity-50">
                {occupe ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
              </button>
            </span>
          ) : (
            <button type="button" disabled={occupe} onClick={() => marquer(ligne, true)}
              className="font-body text-[10px] font-semibold text-white bg-green-500 px-2.5 py-1.5 rounded cursor-pointer border-none hover:bg-green-600 disabled:opacity-50 inline-flex items-center gap-1">
              {occupe ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Déposée sur Cecurity
            </button>
          )}
        </span>
      </div>
    );
  };

  const Entete = () => (
    <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex items-center gap-2 font-body text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
      <span className="w-24">Émise le</span>
      <span className="w-24">N° facture</span>
      <span className="flex-1">Client</span>
      <span className="w-24">Type</span>
      <span className="w-20 text-right">TTC</span>
      <span className="w-24 text-center">Fichiers</span>
      <span className="w-36 text-right">Dépôt</span>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Card padding="sm">
          <div className={`font-body text-xl font-bold ${aDeposer.length > 0 ? "text-orange-500" : "text-green-600"}`}>{aDeposer.length}</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">À déposer sur Cecurity</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-green-600">{deposees.length}</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Déposées</div>
        </Card>
        <Card padding="sm" className="col-span-2 sm:col-span-1">
          <div className="font-body text-[11px] text-slate-600 leading-snug">
            Factures des clients <strong>pros</strong> (asso, collectivité, entreprise) émises depuis le {new Date(DEBUT_DEPOT_FACTURX).toLocaleDateString("fr-FR")}.
            Les particuliers ne passent pas par la plateforme.
          </div>
        </Card>
      </div>

      <Card padding="sm" className="mb-5 bg-indigo-50/40 border border-indigo-100">
        <div className="font-body text-xs text-slate-700 leading-relaxed">
          <strong>Marche à suivre</strong> — 1. Téléchargez le PDF <span className="font-bold text-indigo-600">F-X</span> de la facture.
          2. Déposez-le sur le portail Cecurity (ou l'adresse de collecte du cabinet).
          3. Cliquez « Déposée sur Cecurity » pour la sortir de la liste.
          <span className="text-slate-400"> L'envoi automatique remplacera ces étapes quand l'accès API sera ouvert.</span>
          <a href="https://www.cecurity.com" target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-indigo-600 no-underline hover:underline">
            Cecurity <ExternalLink size={10} />
          </a>
        </div>
      </Card>

      {aDeposer.length === 0 ? (
        <Card padding="lg" className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <FileText size={28} className="text-green-300" />
          </div>
          <p className="font-body text-sm text-slate-500">Rien à déposer : toutes les factures pros sont sur la plateforme.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden mb-5">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <Entete />
              {aDeposer.map(l => <Ligne key={l.payment.id} ligne={l} />)}
            </div>
          </div>
        </Card>
      )}

      {deposees.length > 0 && (
        <div>
          <button type="button" onClick={() => setVoirDeposees(v => !v)}
            className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-600 mb-2">
            {voirDeposees ? "▾" : "▸"} {deposees.length} facture{deposees.length > 1 ? "s" : ""} déjà déposée{deposees.length > 1 ? "s" : ""}
          </button>
          {voirDeposees && (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <Entete />
                  {deposees.map(l => <Ligne key={l.payment.id} ligne={l} />)}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
