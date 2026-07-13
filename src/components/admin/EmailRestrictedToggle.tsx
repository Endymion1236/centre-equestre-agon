"use client";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Mail, Loader2 } from "lucide-react";

/**
 * Interrupteur du mode restreint des emails, effet immédiat sans redéploiement.
 * Écrit settings/email.restricted (boolean), lu par le garde-fou côté serveur
 * (refreshEmailMode). Prend le pas sur la variable Vercel EMAIL_RESTRICTED_MODE.
 */
export default function EmailRestrictedToggle() {
  const [restricted, setRestricted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "email"))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as any) : null;
        setRestricted(typeof d?.restricted === "boolean" ? d.restricted : true);
      })
      .catch(() => setRestricted(true));
  }, []);

  const toggle = async () => {
    if (restricted === null || saving) return;
    const next = !restricted;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "email"),
        { restricted: next, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setRestricted(next);
    } catch {
      /* noop */
    }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <Mail size={17} className="text-blue-500" />
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-slate-800">Mode restreint des emails</div>
            <div className="mt-0.5 max-w-md font-body text-xs text-slate-500">
              {restricted === null
                ? "Chargement…"
                : restricted
                ? "Activé : seuls les admins, le compte test et la liste blanche reçoivent des emails. Les familles sont protégées."
                : "Désactivé : tout le monde reçoit les emails (mise en service)."}
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={restricted === null || saving}
          aria-pressed={!!restricted}
          aria-label="Basculer le mode restreint des emails"
          className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full border-none transition-colors disabled:opacity-50 ${
            restricted ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              restricted ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {saving && (
        <div className="mt-2 flex items-center gap-1.5 font-body text-[11px] text-slate-400">
          <Loader2 size={11} className="animate-spin" /> Enregistrement…
        </div>
      )}
      <p className="mt-2 font-body text-[11px] text-slate-400">
        Effet immédiat (sous ~20 s), sans redéploiement. Remplace la variable Vercel EMAIL_RESTRICTED_MODE.
      </p>
    </div>
  );
}
