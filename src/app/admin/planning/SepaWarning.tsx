"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Composant warning mandat SEPA ─────────────────────────────────────────────
export function SepaWarning({ familyId, onStatus }: { familyId: string; onStatus?: (s: "loading" | "ok" | "missing") => void }) {
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  useEffect(() => {
    const maj = (v: "loading" | "ok" | "missing") => { setStatus(v); onStatus?.(v); };
    if (!familyId) { maj("missing"); return; }
    getDocs(query(collection(db, "mandats-sepa"),
      where("familyId", "==", familyId),
      where("status", "==", "active")
    )).then(snap => maj(snap.empty ? "missing" : "ok"))
      .catch(() => maj("missing"));
  }, [familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return (
    <div className="mt-1.5 font-body text-[10px] text-slate-400 bg-slate-50 rounded-lg px-2 py-1 flex items-center gap-1">
      ⏳ Vérification du mandat SEPA...
    </div>
  );
  if (status === "missing") return (
    <div className="mt-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
      <p className="font-body text-[11px] font-semibold text-red-600">⚠️ Aucun mandat SEPA actif pour cette famille</p>
      <p className="font-body text-[10px] text-red-400 mt-0.5">Créez un mandat dans <strong>Prélèvements SEPA</strong> avant de valider.</p>
    </div>
  );
  return (
    <div className="mt-1.5 font-body text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1">
      ✅ Mandat SEPA actif — les échéances seront créées dans Prélèvements SEPA.
    </div>
  );
}
