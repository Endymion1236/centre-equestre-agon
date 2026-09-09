"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

/**
 * Liens de paiement déjà envoyés pour une commande, avec leur état, et de
 * quoi annuler ceux qui sont encore valables.
 *
 * Un lien CAWL vit 2 heures et ne peut pas être rappelé côté banque : ce que
 * l'annulation fait, c'est le marquer chez nous — s'il est réglé malgré tout,
 * l'encaissement est signalé sur la commande (« à vérifier ») au lieu de
 * passer inaperçu. Et surtout, la liste montre ce qui est encore en l'air
 * avant d'envoyer un nouveau lien : c'est là que le double envoi se voit.
 */

export interface LienAffiche {
  id: string;
  recipientEmail: string;
  amount: number;
  sentAt: string;
  expiresAt: string;
  status: string;
  etat: "valide" | "expire" | "annule" | "paye";
  sentBy?: string;
  cancelledAt?: string;
}

const heure = (iso: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const PILLS: Record<LienAffiche["etat"], { label: string; cls: string }> = {
  valide: { label: "Encore valable", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  expire: { label: "Expiré", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  annule: { label: "Annulé", cls: "bg-red-50 text-red-600 border-red-200" },
  paye: { label: "Réglé", cls: "bg-green-50 text-green-700 border-green-200" },
};

export function useLiensCommande(paymentId: string | null) {
  const [liens, setLiens] = useState<LienAffiche[]>([]);
  const [chargement, setChargement] = useState(false);
  const recharger = useCallback(async () => {
    if (!paymentId) { setLiens([]); return; }
    setChargement(true);
    try {
      const r = await authFetch(`/api/admin/payment-links?paymentId=${encodeURIComponent(paymentId)}`);
      const d = await r.json().catch(() => ({}));
      setLiens(Array.isArray(d.liens) ? d.liens : []);
    } catch (e) {
      console.warn("Liens envoyés :", e);
      setLiens([]);
    }
    setChargement(false);
  }, [paymentId]);
  useEffect(() => { recharger(); }, [recharger]);
  return { liens, chargement, recharger, setLiens };
}

export function LiensEnvoyes({
  liens, chargement, onRecharger, onAnnule, toast,
}: {
  liens: LienAffiche[];
  chargement: boolean;
  onRecharger: () => void;
  onAnnule: (lien: LienAffiche) => void;
  toast: (message: string, type?: "success" | "error" | "warning" | "info", duration?: number) => void;
}) {
  const [annulation, setAnnulation] = useState<string>("");
  const [confirmer, setConfirmer] = useState<string>("");

  const valides = liens.filter((l) => l.etat === "valide");

  const annuler = async (lien: LienAffiche) => {
    setAnnulation(lien.id);
    try {
      const r = await authFetch("/api/admin/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "annuler", linkId: lien.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
      onAnnule(d.lien || { ...lien, etat: "annule", status: "cancelled" });
      toast(`Lien de ${lien.amount.toFixed(2)}€ annulé. Prévenez la famille de ne pas l'utiliser : s'il est réglé quand même, la commande passera « à vérifier ».`, "success", 7000);
    } catch (e: any) {
      toast(e?.message || "Annulation impossible", "error");
    }
    setAnnulation("");
    setConfirmer("");
  };

  if (!chargement && liens.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-body text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Liens déjà envoyés pour cette commande
        </div>
        <button type="button" onClick={onRecharger} disabled={chargement}
          className="font-body text-[10px] text-slate-400 bg-transparent border-none cursor-pointer hover:text-slate-600 flex items-center gap-1 disabled:opacity-50">
          {chargement ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Actualiser
        </button>
      </div>
      {valides.length > 0 && (
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 font-body text-[11px] text-amber-900">
          ⚠️ {valides.length === 1 ? "Un lien est encore valable" : `${valides.length} liens sont encore valables`}. Si vous en envoyez un autre,
          la famille peut régler les deux. Annulez d&apos;abord celui qui est en trop.
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {liens.map((l) => {
          const pill = PILLS[l.etat] || PILLS.expire;
          return (
            <li key={l.id} className="flex items-center gap-2 rounded-md bg-white border border-gray-100 px-2.5 py-1.5">
              <span className="font-body text-sm font-semibold text-slate-700 w-20 shrink-0">{l.amount.toFixed(2)} €</span>
              <span className="font-body text-[11px] text-slate-500 truncate flex-1" title={l.recipientEmail}>
                {l.recipientEmail} · envoyé le {heure(l.sentAt)}
                {l.etat === "valide" && l.expiresAt ? ` · expire à ${new Date(l.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
              <span className={`font-body text-[10px] font-semibold px-2 py-0.5 rounded-full border ${pill.cls}`}>{pill.label}</span>
              {l.etat === "valide" && (
                confirmer === l.id ? (
                  <span className="flex items-center gap-1">
                    <button type="button" disabled={annulation === l.id} onClick={() => annuler(l)}
                      className="font-body text-[10px] font-semibold text-white bg-red-500 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-400 disabled:opacity-50 flex items-center gap-1">
                      {annulation === l.id ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />} Confirmer
                    </button>
                    <button type="button" onClick={() => setConfirmer("")}
                      className="font-body text-[10px] text-slate-500 bg-transparent border-none cursor-pointer hover:underline">Non</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmer(l.id)}
                    className="font-body text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                    <Ban size={10} /> Annuler ce lien
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <p className="font-body text-[10px] text-slate-400 mt-2">
        Un lien reste utilisable 2 heures après l&apos;envoi, même annulé ici : CAWL ne sait pas le rappeler.
        L&apos;annulation sert à ne pas l&apos;oublier — un règlement reçu sur un lien annulé ou en trop est signalé sur la commande.
      </p>
    </div>
  );
}
