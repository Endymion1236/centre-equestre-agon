"use client";
import { Card, Badge } from "@/components/ui";
import { BookOpen, ChevronRight, ChevronLeft } from "lucide-react";
import type { MouvementRegistre } from "../types";

const formatDate = (d: any) => {
  if (!d) return "—";
  const dt = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

export default function TabRegistre({ mouvements }: { mouvements: MouvementRegistre[] }) {
  if (mouvements.length === 0) return (
    <Card padding="lg" className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
        <BookOpen size={28} className="text-blue-300"/>
      </div>
      <p className="font-body text-sm text-gray-500">Aucun mouvement enregistré. Le registre d&apos;élevage trace toutes les entrées et sorties d&apos;équidés.</p>
    </Card>
  );

  const sorted = [...mouvements].sort((a, b) => {
    const da = (a as any).date?.toDate ? (a as any).date.toDate() : new Date((a as any).date);
    const db = (b as any).date?.toDate ? (b as any).date.toDate() : new Date((b as any).date);
    return db.getTime() - da.getTime();
  });

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(m => (
        <Card key={m.id} padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.type === "entree" ? "bg-green-50" : m.temporaire ? "bg-orange-50" : "bg-red-50"}`}>
            {m.type === "entree"
              ? <ChevronRight size={20} className="text-green-500"/>
              : <ChevronLeft size={20} className={m.temporaire ? "text-orange-500" : "text-red-500"}/>}
          </div>
          <div className="flex-1">
            <div className="font-body text-sm font-semibold text-blue-800 flex items-center gap-2">
              {(m as any).equideName} — <span className={m.type === "entree" ? "text-green-600" : m.temporaire ? "text-orange-500" : "text-red-500"}>
                {m.type === "entree" ? "Entrée" : m.temporaire ? "Sortie temporaire" : "Sortie définitive"}
              </span>
              {m.temporaire && <Badge color="orange">Temporaire</Badge>}
              {!m.temporaire && m.type === "sortie" && m.motif === "Décès" && <Badge color="red">Décès</Badge>}
            </div>
            <div className="font-body text-xs text-gray-400">
              {formatDate((m as any).date)} · {m.motif}
              {m.provenance && <> · de {m.provenance}</>}
              {m.destination && <> · vers {m.destination}</>}
              {m.prixAchat && <> · Achat : {m.prixAchat}€</>}
              {m.prixVente && <> · Vente : {m.prixVente}€</>}
              {m.temporaire && m.dateRetour && <> · Retour prévu : {formatDate(m.dateRetour)}</>}
            </div>
            {m.observations && <div className="font-body text-xs text-gray-400 mt-0.5">{m.observations}</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
