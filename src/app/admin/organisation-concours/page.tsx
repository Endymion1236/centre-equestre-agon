"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trophy, Trash2, Loader2, Calendar, PencilLine, FlaskConical } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  listConcours,
  createConcours,
  deleteConcours,
  concoursVide,
} from "@/lib/concours/store";
import { SEED_FINALE_PIEUX } from "@/lib/concours/seed-finale-pieux";
import type { Concours } from "@/lib/concours/types";

const inp =
  "w-full px-3 py-2.5 rounded-lg border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";

export default function OrganisationConcoursAccueil() {
  const router = useRouter();
  const { toast } = useToast();
  const [concours, setConcours] = useState<Concours[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [titre, setTitre] = useState("");
  const [sousTitre, setSousTitre] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const charger = async () => {
    setLoading(true);
    try {
      setConcours(await listConcours());
    } catch (e) {
      console.error(e);
      toast("Impossible de charger les concours (règle Firestore manquante ?)", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    charger();
  }, []);

  const creer = async () => {
    if (!titre.trim()) {
      toast("Donne un titre au concours", "error");
      return;
    }
    setCreating(true);
    try {
      const id = await createConcours(concoursVide(titre, sousTitre, date));
      router.push(`/admin/organisation-concours/${id}`);
    } catch (e) {
      console.error(e);
      toast("Échec de la création", "error");
      setCreating(false);
    }
  };

  const chargerExemple = async () => {
    setCreating(true);
    try {
      const { id, ...data } = SEED_FINALE_PIEUX;
      const newId = await createConcours(data);
      toast("Exemple Finale Pieux créé", "success");
      router.push(`/admin/organisation-concours/${newId}`);
    } catch (e) {
      console.error(e);
      toast("Échec du chargement de l'exemple", "error");
      setCreating(false);
    }
  };

  const supprimer = async (c: Concours) => {
    if (!confirm(`Supprimer « ${c.titre} » ? Cette action est définitive.`)) return;
    try {
      await deleteConcours(c.id);
      setConcours((prev) => prev.filter((x) => x.id !== c.id));
      toast("Concours supprimé", "success");
    } catch (e) {
      console.error(e);
      toast("Échec de la suppression", "error");
    }
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-900">Organisation de concours</h1>
          <p className="font-body text-sm text-gray-500 mt-1">
            Qui fait quoi, à quelle heure. Crée un concours, place tes équipes et tes postes, le moteur
            signale les conflits en direct.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition shrink-0"
        >
          <Plus size={16} /> Nouveau concours
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-500/15 bg-white p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Titre</label>
              <input className={inp} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="PONY GAMES AGON" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sous-titre (optionnel)</label>
              <input className={inp} value={sousTitre} onChange={(e) => setSousTitre(e.target.value)} placeholder="Finale Pieux 2026" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={creer}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Créer et éditer
            </button>
            <button
              onClick={chargerExemple}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-body text-sm font-semibold hover:bg-purple-100 transition disabled:opacity-50"
            >
              <FlaskConical size={16} /> Partir de l&apos;exemple Finale Pieux
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Chargement…
        </div>
      ) : concours.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <Trophy size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="font-body text-sm text-gray-500">
            Aucun concours pour l&apos;instant. Crée le premier avec « Nouveau concours ».
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {concours.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-blue-500/12 bg-white p-4 hover:border-blue-500/30 transition"
            >
              <Trophy size={20} className="text-blue-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-gray-800 truncate">
                  {c.titre} {c.sousTitre && <span className="text-pink-600 font-semibold">· {c.sousTitre}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> {c.date}
                  </span>
                  <span>{c.passages.filter((p) => !p.evenement).length} passage(s)</span>
                  <span>{c.personnes.length} personne(s)</span>
                </div>
              </div>
              <button
                onClick={() => router.push(`/admin/organisation-concours/${c.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-body text-sm font-semibold hover:bg-blue-100 transition"
              >
                <PencilLine size={15} /> Éditer
              </button>
              <button
                onClick={() => supprimer(c)}
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                title="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
