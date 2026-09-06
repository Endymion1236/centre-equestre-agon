"use client";
/**
 * Pré-notification SEPA à vérifier avant envoi.
 *
 * L'email partait tout seul dès que les échéances étaient créées. Ici, on
 * montre d'abord ce qui partirait — destinataire, échéancier, mandat — et
 * l'admin confirme. Utilisé par le panneau d'inscription du planning et,
 * pour ce qui n'a pas été traité sur le moment, par l'écran Prélèvements
 * SEPA.
 */
import { useEffect, useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

export interface ApercuPrenotif {
  to: string;
  subject: string;
  familyName: string;
  prestations: string;
  mandatId: string;
  total: number;
  echeances: { date: string; dateLabel: string; montant: number }[];
  dejaEnvoyeeLe: string | null;
}

interface Props {
  paymentId: string;
  familyName?: string;
  /** Appelé après un envoi réussi (rafraîchir, fermer le bandeau). */
  onEnvoye?: () => void;
  /** « Plus tard » : le bandeau se ferme, la commande reste à vérifier dans l'écran SEPA. */
  onPlusTard?: () => void;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function BandeauPrenotificationSepa({ paymentId, familyName, onEnvoye, onPlusTard, toast }: Props) {
  const [apercu, setApercu] = useState<ApercuPrenotif | null>(null);
  const [erreur, setErreur] = useState("");
  const [etat, setEtat] = useState<"chargement" | "pret" | "envoi" | "envoye">("chargement");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await authFetch("/api/admin/sepa-prenotification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, mode: "apercu" }),
        });
        const d = await r.json().catch(() => ({} as any));
        if (annule) return;
        if (!r.ok) { setErreur(d?.error || "Aperçu indisponible"); setEtat("pret"); return; }
        if (!d?.apercu) { setErreur(d?.reason || "Rien à envoyer"); setEtat("pret"); return; }
        setApercu(d);
        setEtat("pret");
      } catch (e: any) {
        if (!annule) { setErreur(e?.message || "Aperçu indisponible"); setEtat("pret"); }
      }
    })();
    return () => { annule = true; };
  }, [paymentId]);

  const envoyer = async () => {
    if (!apercu || etat === "envoi") return;
    setEtat("envoi");
    try {
      const r = await authFetch("/api/admin/sepa-prenotification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok || !d?.sent) throw new Error(d?.error || d?.reason || "Envoi impossible");
      setEtat("envoye");
      toast(`Pré-notification SEPA envoyée à ${d.to}`, "success");
      onEnvoye?.();
    } catch (e: any) {
      setEtat("pret");
      toast(`Pré-notification non envoyée : ${e?.message || e}`, "error", 6000);
    }
  };

  return (
    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg font-body text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <Mail size={16} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            Pré-notification SEPA à vérifier{familyName ? ` — ${familyName}` : ""}
          </div>
          {etat === "chargement" && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs"><Loader2 size={12} className="animate-spin" /> Préparation de l&apos;aperçu…</div>
          )}
          {erreur && <div className="mt-1 text-xs text-red-700">{erreur}</div>}
          {apercu && (
            <div className="mt-2 text-xs">
              <div><span className="text-amber-700">Destinataire :</span> <strong>{apercu.to}</strong></div>
              {apercu.prestations && <div><span className="text-amber-700">Commande :</span> {apercu.prestations}</div>}
              <div><span className="text-amber-700">Mandat :</span> {apercu.mandatId || "—"}</div>
              <table className="mt-2 w-full max-w-xs">
                <tbody>
                  {apercu.echeances.map((e) => (
                    <tr key={e.date} className="border-t border-amber-200/70">
                      <td className="py-1 pr-3">{e.dateLabel}</td>
                      <td className="py-1 text-right font-semibold">{e.montant.toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-amber-300">
                    <td className="py-1 pr-3 font-semibold">Total · {apercu.echeances.length} prélèvement{apercu.echeances.length > 1 ? "s" : ""}</td>
                    <td className="py-1 text-right font-bold">{apercu.total.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
              {apercu.dejaEnvoyeeLe && (
                <div className="mt-1 text-amber-700">Déjà envoyée le {new Date(apercu.dejaEnvoyeeLe).toLocaleString("fr-FR")} — un nouvel envoi la renverra.</div>
              )}
              <div className="mt-1 text-amber-700">Une erreur d&apos;échéancier se corrige dans Prélèvements SEPA avant l&apos;envoi.</div>
            </div>
          )}
        </div>
      </div>
      {etat !== "envoye" && (
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={envoyer} disabled={!apercu || etat !== "pret"}
            className="inline-flex items-center gap-1 font-body text-xs font-semibold text-white bg-amber-600 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-amber-500 disabled:opacity-50">
            {etat === "envoi" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Envoyer la pré-notification
          </button>
          {onPlusTard && (
            <button type="button" onClick={onPlusTard}
              className="font-body text-xs text-amber-800 bg-transparent border-none cursor-pointer hover:underline">
              Plus tard (rappel dans Prélèvements SEPA)
            </button>
          )}
        </div>
      )}
      {etat === "envoye" && <div className="mt-2 text-xs font-semibold text-green-700">Envoyée.</div>}
    </div>
  );
}
