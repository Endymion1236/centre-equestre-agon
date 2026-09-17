"use client";

/**
 * Page publique /devis/[token] — accepter ou refuser un devis sans compte.
 *
 * Un établissement (collectivité, association, entreprise) n'a pas d'espace
 * client : la personne qui reçoit le devis sur la boîte d'un centre de
 * loisirs répond d'ici, par le lien de son email. Même mécanisme que
 * /balade/[token] et /satisfaction/[token].
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Ligne { label: string; description: string; qty: number; priceTTC: number; remisePct: number }
interface Devis {
  etat: "ouvert" | "deja_repondu" | "converti" | "expire" | "introuvable";
  numero: string; client: string; service: string;
  items: Ligne[]; totalTTC: number; note: string; validUntil: string; repondiLe: string;
}

const eur = (n: number) => `${(n || 0).toFixed(2).replace(".", ",")} €`;
const jour = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

const MESSAGES: Record<Devis["etat"], { titre: string; texte: string }> = {
  ouvert: { titre: "", texte: "" },
  deja_repondu: { titre: "Votre réponse est enregistrée", texte: "Merci. Le centre équestre en est informé et revient vers vous." },
  converti: { titre: "Ce devis a déjà été transformé en commande", texte: "Il n'y a plus rien à valider. Pour toute question, appelez le centre équestre." },
  expire: { titre: "Ce devis a expiré", texte: "Sa date de validité est dépassée. Contactez le centre équestre pour en obtenir un nouveau." },
  introuvable: { titre: "Ce lien ne correspond à aucun devis", texte: "L'adresse est incomplète ou a été modifiée. Ouvrez le lien depuis l'email reçu." },
};

export default function DevisPubliquePage() {
  const { token } = useParams<{ token: string }>();
  const [devis, setDevis] = useState<Devis | null>(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState<"accepted" | "refused" | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/devis-reponse?token=${encodeURIComponent(String(token))}`);
      const d = await r.json();
      if (!r.ok && !d?.etat) throw new Error(d?.error || `Erreur ${r.status}`);
      setDevis(d as Devis);
    } catch (e: any) {
      setErreur(e?.message || "Devis indisponible");
    }
  }, [token]);

  useEffect(() => { void charger(); }, [charger]);

  const repondre = async (reponse: "accepted" | "refused") => {
    const question = reponse === "accepted"
      ? "Confirmez-vous l'acceptation de ce devis ?"
      : "Confirmez-vous le refus de ce devis ?";
    if (!confirm(question)) return;
    setEnvoi(reponse); setErreur("");
    try {
      const r = await fetch("/api/public/devis-reponse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reponse }),
      });
      const d = await r.json();
      if (d?.etat) setDevis(d as Devis);
      else throw new Error(d?.error || "Réponse non enregistrée");
    } catch (e: any) {
      setErreur(e?.message || "Réponse non enregistrée");
    }
    setEnvoi(null);
  };

  if (erreur && !devis) {
    return <Ecran titre="Devis indisponible" texte={erreur} />;
  }
  if (!devis) {
    return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;
  }
  if (devis.etat !== "ouvert" && devis.etat === "introuvable") {
    return <Ecran titre={MESSAGES.introuvable.titre} texte={MESSAGES.introuvable.texte} />;
  }

  const ferme = devis.etat !== "ouvert";
  const m = MESSAGES[devis.etat];

  return (
    <main className="min-h-[70vh] px-4 py-10 flex justify-center">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="font-body text-xs uppercase tracking-[0.15em] text-amber-600 mb-1">Centre Équestre d&apos;Agon-Coutainville</div>
          <h1 className="font-display text-2xl font-bold text-blue-900 m-0">Devis {devis.numero}</h1>
          <p className="font-body text-sm text-slate-600 mt-1 mb-0">
            {devis.client}{devis.service ? ` · ${devis.service}` : ""}
          </p>
          {devis.validUntil && <p className="font-body text-xs text-slate-500 mt-1">Valable jusqu&apos;au {jour(devis.validUntil)}</p>}

          <table className="w-full border-collapse my-5">
            <thead>
              <tr>
                {["Prestation", "Qté", "Prix unit.", "Total"].map((t, i) => (
                  <th key={t} className={`font-body text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-gray-200 py-2 ${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devis.items.map((i, n) => (
                <tr key={n}>
                  <td className="font-body text-sm text-blue-900 border-b border-gray-100 py-2">
                    {i.label}
                    {i.description && <span className="block text-xs text-slate-500">{i.description}</span>}
                  </td>
                  <td className="font-body text-sm text-slate-600 border-b border-gray-100 py-2 text-center">{i.qty}</td>
                  <td className="font-body text-sm text-slate-600 border-b border-gray-100 py-2 text-right">
                    {eur(i.priceTTC)}{i.remisePct ? <span className="text-red-500"> (−{i.remisePct} %)</span> : null}
                  </td>
                  <td className="font-body text-sm font-semibold text-blue-900 border-b border-gray-100 py-2 text-right">
                    {eur(i.priceTTC * i.qty * (1 - (i.remisePct || 0) / 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
            <span className="font-body text-sm font-bold text-blue-900">Total TTC</span>
            <span className="font-display text-2xl font-bold text-blue-900">{eur(devis.totalTTC)}</span>
          </div>
          {devis.note && <p className="font-body text-sm text-slate-600 bg-gray-50 border border-gray-100 rounded-xl p-3 mt-4">{devis.note}</p>}

          {ferme ? (
            <div className="mt-6 rounded-xl bg-blue-50 border border-blue-100 p-4">
              <div className="font-body text-sm font-bold text-blue-900">{m.titre}</div>
              <p className="font-body text-sm text-blue-900/80 m-0 mt-1">{m.texte}</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button type="button" disabled={!!envoi} onClick={() => void repondre("accepted")}
                className="flex-1 font-body text-sm font-bold text-white bg-green-600 hover:bg-green-500 px-5 py-3 rounded-xl border-none cursor-pointer disabled:opacity-50">
                {envoi === "accepted" ? "Enregistrement…" : "✓ Accepter ce devis"}
              </button>
              <button type="button" disabled={!!envoi} onClick={() => void repondre("refused")}
                className="flex-1 font-body text-sm font-semibold text-red-600 bg-white hover:bg-red-50 px-5 py-3 rounded-xl border border-red-200 cursor-pointer disabled:opacity-50">
                {envoi === "refused" ? "Enregistrement…" : "Refuser"}
              </button>
            </div>
          )}
          {erreur && <p className="font-body text-sm text-red-600 mt-3">{erreur}</p>}
          <p className="font-body text-xs text-slate-400 mt-6">
            Une question ? Appelez le centre équestre au 02 44 84 99 96.
          </p>
        </div>
      </div>
    </main>
  );
}

function Ecran({ titre, texte }: { titre: string; texte: string }) {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-3">📄</div>
        <h1 className="font-display text-xl font-bold text-blue-800 mb-2">{titre}</h1>
        <p className="font-body text-sm text-slate-600 leading-relaxed">{texte}</p>
      </div>
    </main>
  );
}
