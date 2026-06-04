"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// La gestion des moniteurs (fiches + comptes d'accès) a été intégrée dans
// Paramètres → Moniteurs. Cette page ne sert plus que de redirection pour
// les anciens favoris / liens directs.
export default function EquipeRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/parametres?section=moniteurs");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      <p className="font-body text-sm text-slate-500">
        La gestion des moniteurs a été déplacée dans Paramètres → Moniteurs. Redirection…
      </p>
    </div>
  );
}
