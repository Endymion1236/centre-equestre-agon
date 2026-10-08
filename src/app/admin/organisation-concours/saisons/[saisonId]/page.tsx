"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { getSaison, saveSaison } from "@/lib/concours/saisons-store";
import { messageErreurSaison, type SaisonPonyGames } from "@/lib/concours/saisons";
import { OngletEquipes, OngletCavaliers, OngletResultats, OngletClassement, type Maj } from "./onglets";

type Onglet = "equipes" | "cavaliers" | "resultats" | "classement";
const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: "equipes", libelle: "Équipes" },
  { id: "cavaliers", libelle: "Cavaliers" },
  { id: "resultats", libelle: "Résultats des concours" },
  { id: "classement", libelle: "Classement de la saison" },
];

export default function EditeurSaison() {
  const id = String(useParams().saisonId);
  const { toast } = useToast();
  const [saison, setSaison] = useState<SaisonPonyGames | null>(null);
  const [loading, setLoading] = useState(true);
  const [onglet, setOnglet] = useState<Onglet>("equipes");
  const [etat, setEtat] = useState<"ok" | "attente" | "erreur">("ok");
  // Chaque modification incrémente la version ; l'enregistrement part 0,8 s après la dernière.
  const version = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setSaison(await getSaison(id));
      } catch (e) {
        console.error(e);
        toast(messageErreurSaison(e, "Impossible de charger la saison"), "error", 10000);
      }
      setLoading(false);
    })();
  }, [id]);

  const maj: Maj = (f) => {
    version.current++;
    setEtat("attente");
    setSaison((prev) => (prev ? f(prev) : prev));
  };

  useEffect(() => {
    if (!saison || version.current === 0) return;
    const v = version.current;
    const t = setTimeout(async () => {
      try {
        await saveSaison(saison);
        if (version.current === v) setEtat("ok");
      } catch (e) {
        console.error(e);
        setEtat("erreur");
        toast(messageErreurSaison(e, "Échec de l'enregistrement"), "error", 10000);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [saison]);

  useEffect(() => {
    if (etat === "ok") return;
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [etat]);

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-400 py-16 justify-center"><Loader2 size={18} className="animate-spin" /> Chargement…</div>;
  }
  if (!saison) {
    return <div className="max-w-[900px] mx-auto px-4 py-10 text-gray-500">Saison introuvable.</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6">
      <Link href="/admin/organisation-concours/saisons" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-3">
        <ArrowLeft size={15} /> Toutes les saisons
      </Link>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display text-2xl font-bold text-blue-900">Pony Games · saison {saison.nom}</h1>
        <span className="text-xs font-body inline-flex items-center gap-1.5">
          {etat === "ok" && <><CheckCircle2 size={14} className="text-green-600" /> <span className="text-gray-500">Enregistré</span></>}
          {etat === "attente" && <><Loader2 size={14} className="animate-spin text-blue-600" /> <span className="text-gray-500">Enregistrement…</span></>}
          {etat === "erreur" && <><AlertTriangle size={14} className="text-red-600" /> <span className="text-red-600">Non enregistré</span></>}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b border-blue-500/10">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" onClick={() => setOnglet(o.id)}
            className={`px-4 py-2 font-body text-sm font-semibold rounded-t-lg transition ${
              onglet === o.id ? "bg-blue-600 text-white" : "text-blue-800 hover:bg-blue-50"
            }`}>
            {o.libelle}
          </button>
        ))}
      </div>

      {onglet === "equipes" && <OngletEquipes saison={saison} maj={maj} />}
      {onglet === "cavaliers" && <OngletCavaliers saison={saison} maj={maj} />}
      {onglet === "resultats" && <OngletResultats saison={saison} maj={maj} />}
      {onglet === "classement" && <OngletClassement saison={saison} />}
    </div>
  );
}
