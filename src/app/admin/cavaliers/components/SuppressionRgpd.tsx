"use client";
/**
 * Demande RGPD de suppression de compte, depuis la fiche famille (onglet
 * Divers). Deux temps : l'aperçu (rien n'est touché) puis la suppression,
 * confirmée en recopiant l'adresse. Le serveur (api/admin/delete-family)
 * efface le compte, la fiche et les inscriptions à venir, et ANONYMISE les
 * pièces comptables, qu'on doit garder (art. L102 B du LPF, art. 17-3-b du
 * RGPD). La trace de la demande reste dans le journal d'audit.
 */
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface Rapport {
  familyName: string | null;
  counts: Record<string, number>;
  anonymises: Record<string, number>;
  creneauxCleaned: number;
  resteDu: number;
  totalDocsAffected: number;
  uid: string | null;
  errors: { step: string; error: string }[];
  message?: string;
}

const total = (r: Record<string, number>) => Object.values(r || {}).reduce((t, n) => t + n, 0);

export default function SuppressionRgpd({ email, onFait }: { email: string; onFait?: () => void }) {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState("");
  const adresse = (email || "").trim().toLowerCase();

  const appeler = async (apply: boolean) => {
    setBusy(true); setErreur("");
    try {
      const res = await authFetch(`/api/admin/delete-family?email=${encodeURIComponent(adresse)}${apply ? "&apply=true" : ""}`, { method: apply ? "POST" : "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(data.error || `Erreur ${res.status}`); return; }
      if (apply) { setFait(true); onFait?.(); }
      setRapport(data);
    } catch (e: any) { setErreur(e?.message || "Erreur réseau"); }
    finally { setBusy(false); }
  };

  if (!adresse) return null;
  return (
    <div className="px-3 py-3 bg-white rounded-lg border border-red-100">
      <div className="flex items-center gap-2 font-body text-sm font-semibold text-red-700"><ShieldAlert size={15} /> Demande RGPD : supprimer le compte</div>
      <p className="font-body text-[11px] text-slate-500 mt-1">
        Efface le compte de connexion, la fiche, les enfants, les inscriptions à venir et l&apos;historique pédagogique. Les factures, paiements et avoirs sont conservés mais rendus anonymes : la loi impose de les garder 10 ans.
      </p>
      {fait ? (
        <p className="font-body text-xs text-green-700 mt-2">✅ Compte supprimé. Répondez à la personne que sa demande a été traitée.</p>
      ) : !rapport ? (
        <button type="button" disabled={busy} onClick={() => void appeler(false)}
          className="mt-2 font-body text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 size={12} className="inline animate-spin" /> : null} Voir ce qui serait supprimé
        </button>
      ) : (
        <div className="mt-2 font-body text-xs text-slate-700 space-y-1">
          {rapport.message ? <p>{rapport.message}</p> : <>
            <p>Fiche : <b>{rapport.familyName || "—"}</b>{rapport.uid ? " · compte de connexion trouvé" : " · pas de compte de connexion"}</p>
            <p>{total(rapport.counts)} document(s) supprimé(s) · {total(rapport.anonymises)} pièce(s) comptable(s) anonymisée(s) · {rapport.creneauxCleaned} créneau(x) à venir libéré(s)</p>
            {rapport.resteDu > 0 && <p className="text-red-700 font-semibold">⚠️ Reste dû : {rapport.resteDu.toFixed(2)} €. Réglez ou annulez ces commandes avant de supprimer : après, la famille ne sera plus joignable.</p>}
            {rapport.errors.filter(e => e.step !== "firebase-auth-lookup").length > 0 && <p className="text-orange-700">Avertissements : {rapport.errors.map(e => e.step).join(", ")}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={busy}
                onClick={() => {
                  const saisie = window.prompt(`Suppression DÉFINITIVE du compte ${adresse}.\n\nRecopiez l'adresse email pour confirmer :`);
                  if (saisie === null) return;
                  if (saisie.trim().toLowerCase() !== adresse) { setErreur("L'adresse recopiée ne correspond pas : rien n'a été supprimé."); return; }
                  void appeler(true);
                }}
                className="font-body text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                {busy ? <Loader2 size={12} className="inline animate-spin" /> : null} Supprimer définitivement
              </button>
              <button type="button" disabled={busy} onClick={() => setRapport(null)}
                className="font-body text-xs text-slate-600 bg-gray-100 px-3 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
            </div>
          </>}
        </div>
      )}
      {erreur && <p className="font-body text-xs text-red-700 mt-2">{erreur}</p>}
    </div>
  );
}
