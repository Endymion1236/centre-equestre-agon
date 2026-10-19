"use client";
/**
 * Onglet « Mouvements » de la cavalerie : le registre d'élevage, c'est-à-dire
 * toutes les entrées et sorties des équidés (achat, vente, prêt, concours,
 * pension, retraite, décès…), et où chacun en est aujourd'hui.
 *
 * Les règles (situation d'un équidé, retours attendus) sont dans
 * lib/cavalerie-mouvements, testées seules. Ici : l'affichage, les filtres,
 * et le raccourci « enregistrer le retour » d'une sortie temporaire.
 */
import { useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { BookOpen, ChevronRight, ChevronLeft, Printer, Undo2 } from "lucide-react";
import type { Equide, MouvementRegistre } from "../types";
import { dateISO, htmlRegistre, motifRetour, situationEquides, trierMouvements } from "@/lib/cavalerie-mouvements";
import { fusionnerClubInfo } from "@/lib/club-info-defauts";
import type { MouvementParDefaut } from "./MouvementModal";

const formatDate = (d: any) => {
  const iso = dateISO(d);
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

const inputStyle = "px-3 py-2 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";

interface Props {
  mouvements: MouvementRegistre[];
  equides: Equide[];
  /** Ouvre le formulaire pré-rempli pour le retour d'une sortie temporaire. */
  onRetour: (parDefaut: MouvementParDefaut) => void;
}

export default function TabRegistre({ mouvements, equides, onRetour }: Props) {
  const [filtreEquide, setFiltreEquide] = useState("all");
  const [filtreType, setFiltreType] = useState<"all" | "entree" | "sortie">("all");

  const aujourdhui = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const situation = useMemo(() => situationEquides(equides, mouvements, aujourdhui), [equides, mouvements, aujourdhui]);
  const nomDe = (id: string) => equides.find(e => e.id === id)?.name || mouvements.find(m => m.equideId === id)?.equideName || "?";

  const presents = [...situation.values()].filter(s => s.etat === "present").length;
  const dehors = [...situation.values()].filter(s => s.etat === "sorti_temporaire");
  const sortis = [...situation.values()].filter(s => s.etat === "sorti").length;
  // Un retour est dû pour chaque sortie temporaire sans entrée depuis.
  const retoursAttendus = new Set(dehors.map(s => s.dernier?.id).filter(Boolean));

  // Le registre à présenter lors d'un contrôle : page A4 dans un nouvel
  // onglet, impression lancée à l'ouverture. L'identité du club vient des
  // réglages (settings/centre), sinon des défauts.
  const imprimer = async () => {
    const w = window.open("", "_blank");
    if (!w) return;
    let reglages: Record<string, unknown> | null = null;
    try {
      const snap = await getDoc(doc(db, "settings", "centre"));
      reglages = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    } catch (e) { console.warn("[registre] réglages du club illisibles :", e); }
    w.document.write(htmlRegistre({ club: fusionnerClubInfo(reglages), equides: equides as any, mouvements, aujourdhui }));
    w.document.close();
  };

  const liste = trierMouvements(mouvements).reverse()
    .filter(m => filtreEquide === "all" || m.equideId === filtreEquide)
    .filter(m => filtreType === "all" || m.type === filtreType);

  if (mouvements.length === 0) return (
    <Card padding="lg" className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
        <BookOpen size={28} className="text-blue-300"/>
      </div>
      <p className="font-body text-sm text-gray-500">Aucun mouvement enregistré. Cet onglet garde la trace de toutes les entrées et sorties des équidés (achat, vente, prêt, concours, pension, retraite, décès) : c&apos;est le registre d&apos;élevage.</p>
      <button type="button" onClick={imprimer}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 font-body text-xs font-semibold text-blue-700 cursor-pointer hover:bg-blue-50">
        <Printer size={14}/> Imprimer le registre
      </button>
    </Card>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Où en est la cavalerie aujourd'hui */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-xs text-gray-600">
          <span><strong className="text-green-600">{presents}</strong> présent{presents > 1 ? "s" : ""}</span>
          <span><strong className="text-orange-500">{dehors.length}</strong> sorti{dehors.length > 1 ? "s" : ""} temporairement</span>
          <span><strong className="text-red-500">{sortis}</strong> sorti{sortis > 1 ? "s" : ""} définitivement</span>
          <button type="button" onClick={imprimer} title="Registre d'élevage complet, à présenter lors d'un contrôle"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 font-body text-[11px] font-semibold text-blue-700 cursor-pointer hover:bg-blue-50">
            <Printer size={13}/> Imprimer le registre
          </button>
        </div>
        {dehors.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {dehors.map(s => (
              <div key={s.equideId} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 font-body text-xs ${s.enRetard ? "bg-red-50" : "bg-orange-50"}`}>
                <strong className="text-blue-800">{nomDe(s.equideId)}</strong>
                <span className="text-gray-500">{s.dernier?.motif}{s.dernier?.destination ? ` · ${s.dernier.destination}` : ""} depuis le {formatDate(s.dernier?.date)}</span>
                {s.retourPrevu && (
                  <span className={s.enRetard ? "text-red-600 font-semibold" : "text-orange-600"}>
                    · retour prévu le {formatDate(s.retourPrevu)}{s.enRetard ? " — en retard" : ""}
                  </span>
                )}
                <button type="button"
                  onClick={() => onRetour({ equideId: s.equideId, type: "entree", motif: motifRetour(s.dernier?.motif), provenance: s.dernier?.destination || "" })}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 font-body text-[11px] font-semibold text-blue-700 cursor-pointer hover:bg-blue-50">
                  <Undo2 size={12}/> Enregistrer le retour
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <select className={inputStyle} value={filtreEquide} onChange={e => setFiltreEquide(e.target.value)}>
          <option value="all">Tous les équidés</option>
          {[...equides].sort((a, b) => a.name.localeCompare(b.name)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className={inputStyle} value={filtreType} onChange={e => setFiltreType(e.target.value as any)}>
          <option value="all">Entrées et sorties</option>
          <option value="entree">Entrées seulement</option>
          <option value="sortie">Sorties seulement</option>
        </select>
        <span className="self-center font-body text-xs text-gray-400">{liste.length} mouvement{liste.length > 1 ? "s" : ""}</span>
      </div>

      {liste.length === 0 && (
        <p className="font-body text-sm text-gray-500 italic py-4 text-center">Aucun mouvement pour ce filtre.</p>
      )}
      {liste.map(m => (
        <Card key={m.id} padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.type === "entree" ? "bg-green-50" : m.temporaire ? "bg-orange-50" : "bg-red-50"}`}>
            {m.type === "entree"
              ? <ChevronRight size={20} className="text-green-500"/>
              : <ChevronLeft size={20} className={m.temporaire ? "text-orange-500" : "text-red-500"}/>}
          </div>
          <div className="flex-1">
            <div className="font-body text-sm font-semibold text-blue-800 flex flex-wrap items-center gap-2">
              {(m as any).equideName || nomDe(m.equideId)} — <span className={m.type === "entree" ? "text-green-600" : m.temporaire ? "text-orange-500" : "text-red-500"}>
                {m.type === "entree" ? "Entrée" : m.temporaire ? "Sortie temporaire" : "Sortie définitive"}
              </span>
              {m.temporaire && retoursAttendus.has(m.id) && <Badge color="orange">Retour attendu</Badge>}
              {m.temporaire && !retoursAttendus.has(m.id) && <Badge color="gray">Rentré</Badge>}
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
