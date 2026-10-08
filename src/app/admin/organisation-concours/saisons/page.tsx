"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderOpen, Loader2, Plus, Trash2, Users, Trophy } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { listSaisons, createSaison, deleteSaison } from "@/lib/concours/saisons-store";
import { messageErreurSaison, normaliserNomSaison, saisonAProposer, type SaisonPonyGames } from "@/lib/concours/saisons";
import { toParisDateString } from "@/lib/date-local";

const inp =
  "w-full px-3 py-2.5 rounded-lg border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";

export default function SaisonsPonyGames() {
  const router = useRouter();
  const { toast } = useToast();
  const [saisons, setSaisons] = useState<SaisonPonyGames[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const liste = await listSaisons();
        setSaisons(liste);
        setNom(saisonAProposer(liste.map((s) => s.nom), toParisDateString(new Date())));
      } catch (e) {
        console.error(e);
        toast(messageErreurSaison(e, "Impossible de charger les saisons"), "error", 10000);
      }
      setLoading(false);
    })();
  }, []);

  const creer = async () => {
    const canonique = normaliserNomSaison(nom);
    if (!canonique) {
      toast("Écris la saison sous la forme 2026/2027", "error");
      return;
    }
    if (saisons.some((s) => s.nom === canonique)) {
      toast(`La saison ${canonique} existe déjà`, "error");
      return;
    }
    setCreating(true);
    try {
      const id = await createSaison(canonique);
      router.push(`/admin/organisation-concours/saisons/${id}`);
    } catch (e) {
      console.error(e);
      toast(messageErreurSaison(e, "Échec de la création"), "error", 10000);
      setCreating(false);
    }
  };

  const supprimer = async (s: SaisonPonyGames) => {
    if (!confirm(`Supprimer la saison ${s.nom}, avec ses ${s.equipes.length} équipe(s) et tous ses résultats ? Cette action est définitive.`)) return;
    try {
      await deleteSaison(s.id);
      setSaisons((prev) => prev.filter((x) => x.id !== s.id));
      toast("Saison supprimée", "success");
    } catch (e) {
      console.error(e);
      toast(messageErreurSaison(e, "Échec de la suppression"), "error", 10000);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6">
      <Link href="/admin/organisation-concours" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-3">
        <ArrowLeft size={15} /> Organisation de concours
      </Link>
      <h1 className="font-display text-2xl font-bold text-blue-900">Saisons de Pony Games</h1>
      <p className="font-body text-sm text-gray-500 mt-1 mb-6">
        Un dossier par saison : les équipes avec leur catégorie et leur indice, leurs cavaliers,
        puis le classement et les points après chaque concours.
      </p>

      <div className="mb-6 rounded-xl border border-blue-500/15 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nouvelle saison</label>
          <input className={inp} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="2026/2027"
            onKeyDown={(e) => e.key === "Enter" && creer()} />
        </div>
        <button type="button" onClick={creer} disabled={creating || loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Créer la saison
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Chargement…
        </div>
      ) : saisons.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <FolderOpen size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="font-body text-sm text-gray-500">Aucune saison pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {saisons.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-blue-500/12 bg-white p-4 hover:border-blue-500/30 transition">
              <FolderOpen size={20} className="text-blue-600 shrink-0" />
              <button type="button" onClick={() => router.push(`/admin/organisation-concours/saisons/${s.id}`)} className="min-w-0 flex-1 text-left">
                <div className="font-display font-bold text-gray-800">Saison {s.nom}</div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {s.equipes.length} équipe(s) · {s.cavaliers.length} cavalier(s)</span>
                  <span className="inline-flex items-center gap-1"><Trophy size={12} /> {s.resultats.length} concours</span>
                </div>
              </button>
              <button type="button" onClick={() => router.push(`/admin/organisation-concours/saisons/${s.id}`)}
                className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-body text-sm font-semibold hover:bg-blue-100 transition">
                Ouvrir
              </button>
              <button type="button" onClick={() => supprimer(s)} title="Supprimer"
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
