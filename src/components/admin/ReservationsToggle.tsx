"use client";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Lock, LockOpen, Loader2 } from "lucide-react";

/**
 * Interrupteur d'ouverture des réservations en ligne, effet immédiat sans
 * redéploiement. Écrit settings/reservations { ouvert, message }, relu à
 * chaque requête par le garde-fou serveur (lib/reservations-ouvertes.ts).
 *
 * Fermé, il bloque les inscriptions, les paiements CB, les règlements par
 * avoir et l'achat de bons cadeaux côté famille. Les admins ne sont jamais
 * bloqués, et le règlement d'un solde déjà dû reste possible.
 */
export default function ReservationsToggle() {
  const [ouvert, setOuvert] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "reservations"))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as any) : null;
        setOuvert(typeof d?.ouvert === "boolean" ? d.ouvert : true);
        setMessage(d?.message || "");
      })
      .catch(() => setOuvert(true));
  }, []);

  const enregistrer = async (champs: { ouvert?: boolean; message?: string }) => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "reservations"),
        { ...champs, updatedAt: serverTimestamp() },
        { merge: true }
      );
      if (typeof champs.ouvert === "boolean") setOuvert(champs.ouvert);
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 2000);
    } catch {
      /* noop */
    }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
            ouvert === false ? "bg-rose-50" : "bg-emerald-50"
          }`}>
            {ouvert === false
              ? <Lock size={17} className="text-rose-500" />
              : <LockOpen size={17} className="text-emerald-600" />}
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-slate-800">
              Réservations en ligne
            </div>
            <div className="mt-0.5 max-w-md font-body text-xs text-slate-500">
              {ouvert === null
                ? "Chargement…"
                : ouvert
                  ? "Ouvertes : les familles peuvent réserver et payer depuis le site."
                  : "Fermées : plus aucune réservation ni paiement côté famille. Vous continuez d'inscrire et d'encaisser normalement depuis l'admin, et un solde déjà dû reste payable."}
            </div>
          </div>
        </div>
        <button type="button"
          onClick={() => ouvert !== null && !saving && enregistrer({ ouvert: !ouvert })}
          disabled={ouvert === null || saving}
          className={`flex-shrink-0 rounded-xl px-4 py-2 font-body text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50 ${
            ouvert === false
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-rose-500 text-white hover:bg-rose-600"
          }`}
        >
          {saving
            ? <Loader2 size={14} className="animate-spin" />
            : ouvert === false ? "Ouvrir" : "Fermer"}
        </button>
      </div>

      {ouvert === false && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <label className="font-body text-xs font-semibold text-slate-600">
            Message affiché aux familles
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => enregistrer({ message })}
            rows={2}
            placeholder="Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande."
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-cream px-3 py-2 font-body text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-1 font-body text-[11px] text-slate-400">
            {enregistre ? "Enregistré." : "Enregistré automatiquement en quittant le champ."}
          </div>
        </div>
      )}
    </div>
  );
}
