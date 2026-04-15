"use client";
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Card } from "@/components/ui";
import { Loader2, Save, RefreshCw, ExternalLink, CheckCircle2, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { vitrineDefaults } from "@/lib/vitrine-defaults";

const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";
const ta = `${inp} resize-none`;
const label = "font-body text-xs font-semibold text-slate-600 block mb-1";

type Tab = "activites" | "tarifs" | "infos" | "miniferme";

export default function ContenuPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("activites");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [data, setData] = useState(vitrineDefaults);
  const [miniferme, setMiniferme] = useState<{ animals: { name: string; type: string; color: string; description: string; photo: string }[] }>({
    animals: [
      { name: "Pépita", type: "Cochon Kune Kune", color: "Roux", description: "", photo: "" },
      { name: "Ronron", type: "Cochon Kune Kune", color: "Blanc", description: "", photo: "" },
      { name: "Les chèvres", type: "Chèvres naines", color: "", description: "", photo: "" },
      { name: "Les poules", type: "Poules pondeuses", color: "", description: "", photo: "" },
    ],
  });
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    getDoc(doc(db, "settings", "vitrine")).then(snap => {
      if (snap.exists()) {
        // Merge profond avec les defaults
        const d = snap.data() as any;
        setData(prev => ({
          ...prev,
          activites: { ...prev.activites, ...(d.activites || {}) },
          tarifs: {
            ...prev.tarifs,
            ...(d.tarifs || {}),
            balades: d.tarifs?.balades || prev.tarifs.balades,
            competitions: d.tarifs?.competitions || prev.tarifs.competitions,
          },
          infos: { ...prev.infos, ...(d.infos || {}) },
        }));
      }
    }).finally(() => setLoading(false));
    // Mini-ferme
    getDoc(doc(db, "settings", "miniferme")).then(snap => {
      if (snap.exists()) {
        const d = snap.data() as any;
        if (d.animals) setMiniferme({ animals: d.animals });
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "vitrine"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, "settings", "miniferme"), { ...miniferme, updatedAt: serverTimestamp() }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast("✅ Contenu enregistré — visible sur le site dans quelques secondes", "success");
    } catch (e: any) {
      toast(e.message, "error");
    }
    setSaving(false);
  };

  const setActivite = (key: string, field: string, value: string) => {
    setData(prev => ({ ...prev, activites: { ...prev.activites, [key]: { ...(prev.activites as any)[key], [field]: value } } }));
  };

  const setTarif = (field: string, value: string) => {
    setData(prev => ({ ...prev, tarifs: { ...prev.tarifs, stages: { ...prev.tarifs.stages, [field]: value } } }));
  };

  const setBalade = (idx: number, field: string, value: string) => {
    setData(prev => {
      const balades = [...prev.tarifs.balades];
      balades[idx] = { ...balades[idx], [field]: value };
      return { ...prev, tarifs: { ...prev.tarifs, balades } };
    });
  };

  const setCompet = (idx: number, field: string, value: string) => {
    setData(prev => {
      const competitions = [...prev.tarifs.competitions];
      competitions[idx] = { ...competitions[idx], [field]: value };
      return { ...prev, tarifs: { ...prev.tarifs, competitions } };
    });
  };

  const setInfo = (field: string, value: string) => {
    setData(prev => ({ ...prev, infos: { ...prev.infos, [field]: value } }));
  };

  if (loading) return <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "activites", label: "Activités", icon: "🏇" },
    { id: "tarifs", label: "Tarifs", icon: "💶" },
    { id: "infos", label: "Infos pratiques", icon: "ℹ️" },
    { id: "miniferme", label: "Mini-ferme", icon: "🐷" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Contenu du site</h1>
          <p className="font-body text-xs text-slate-500 mt-1">Modifiez les textes, tarifs et horaires affichés sur le site public</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://www.centreequestreagon.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            <ExternalLink size={13} /> Voir le site
          </a>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {saving ? "Enregistrement..." : saved ? "Enregistré !" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-body text-sm font-medium border-none cursor-pointer transition-all ${tab === t.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200 hover:bg-gray-50"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Activités ── */}
      {tab === "activites" && (
        <div className="flex flex-col gap-4">
          {[
            { key: "baby_poney", emoji: "🦄", label: "Baby Poney" },
            { key: "galop_bronze", emoji: "🥉", label: "Galop de Bronze" },
            { key: "galop_argent", emoji: "🥈", label: "Galop d'Argent" },
            { key: "galop_or", emoji: "🥇", label: "Galop d'Or" },
            { key: "balade", emoji: "🌅", label: "Balades à la plage" },
            { key: "cours", emoji: "📅", label: "Cours réguliers" },
          ].map(({ key, emoji, label: lbl }) => {
            const act = (data.activites as any)[key];
            return (
              <Card key={key} padding="md">
                <div className="font-body text-sm font-semibold text-blue-800 mb-4">{emoji} {lbl}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {act.title !== undefined && (
                    <div><label className={label}>Titre</label>
                      <input value={act.title} onChange={e => setActivite(key, "title", e.target.value)} className={inp} /></div>
                  )}
                  {act.ages !== undefined && (
                    <div><label className={label}>Âges</label>
                      <input value={act.ages} onChange={e => setActivite(key, "ages", e.target.value)} className={inp} /></div>
                  )}
                  {act.schedule !== undefined && (
                    <div><label className={label}>Horaires</label>
                      <input value={act.schedule} onChange={e => setActivite(key, "schedule", e.target.value)} className={inp} /></div>
                  )}
                  {act.price !== undefined && (
                    <div><label className={label}>Tarif affiché</label>
                      <input value={act.price} onChange={e => setActivite(key, "price", e.target.value)} className={inp} /></div>
                  )}
                </div>
                {act.description !== undefined && (
                  <div className="mt-3"><label className={label}>Description</label>
                    <textarea value={act.description} onChange={e => setActivite(key, "description", e.target.value)} rows={3} className={ta} /></div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Tarifs ── */}
      {tab === "tarifs" && (
        <div className="flex flex-col gap-4">
          {/* Stages */}
          <Card padding="md">
            <div className="font-body text-sm font-semibold text-blue-800 mb-4">🏕️ Tarifs des stages (€ / semaine)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { field: "baby_poney", label: "Baby Poney" },
                { field: "galop_bronze_argent", label: "Galop Bronze / Argent" },
                { field: "galop_or", label: "Galop d'Or" },
              ].map(({ field, label: lbl }) => (
                <div key={field}>
                  <label className={label}>{lbl}</label>
                  <div className="relative">
                    <input type="number" value={(data.tarifs.stages as any)[field]} onChange={e => setTarif(field, e.target.value)} className={`${inp} pr-8`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-slate-400">€</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className={label}>Note paiement</label>
              <input value={data.tarifs.paiement_note} onChange={e => setData(prev => ({ ...prev, tarifs: { ...prev.tarifs, paiement_note: e.target.value } }))} className={inp} />
            </div>
          </Card>

          {/* Balades */}
          <Card padding="md">
            <div className="font-body text-sm font-semibold text-blue-800 mb-4">🌅 Tarifs des balades</div>
            <div className="flex flex-col gap-3">
              {data.tarifs.balades.map((b, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-sand rounded-lg">
                  <div><label className={label}>Libellé</label>
                    <input value={b.label} onChange={e => setBalade(idx, "label", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Niveau</label>
                    <input value={b.level} onChange={e => setBalade(idx, "level", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Prix (€)</label>
                    <input type="number" value={b.price} onChange={e => setBalade(idx, "price", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Note</label>
                    <input value={b.note} onChange={e => setBalade(idx, "note", e.target.value)} className={inp} /></div>
                </div>
              ))}
            </div>
          </Card>

          {/* Compétitions */}
          <Card padding="md">
            <div className="font-body text-sm font-semibold text-blue-800 mb-4">🏆 Tarifs compétitions internes</div>
            <div className="flex flex-col gap-3">
              {data.tarifs.competitions.map((c, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-sand rounded-lg">
                  <div><label className={label}>Libellé</label>
                    <input value={c.label} onChange={e => setCompet(idx, "label", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Niveau</label>
                    <input value={c.level} onChange={e => setCompet(idx, "level", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Prix (€)</label>
                    <input type="number" value={c.price} onChange={e => setCompet(idx, "price", e.target.value)} className={inp} /></div>
                  <div><label className={label}>Fréquence</label>
                    <input value={c.freq} onChange={e => setCompet(idx, "freq", e.target.value)} className={inp} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className={label}>Note forfaits</label>
              <input value={data.tarifs.forfaits_note} onChange={e => setData(prev => ({ ...prev, tarifs: { ...prev.tarifs, forfaits_note: e.target.value } }))} className={inp} />
            </div>
          </Card>
        </div>
      )}

      {/* ── Infos pratiques ── */}
      {tab === "infos" && (
        <Card padding="md">
          <div className="font-body text-sm font-semibold text-blue-800 mb-4">ℹ️ Informations pratiques</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { field: "adresse", label: "Adresse" },
              { field: "telephone", label: "Téléphone" },
              { field: "email", label: "Email public" },
              { field: "horaires_bureau", label: "Horaires d'accueil" },
            ].map(({ field, label: lbl }) => (
              <div key={field}>
                <label className={label}>{lbl}</label>
                <input value={(data.infos as any)[field]} onChange={e => setInfo(field, e.target.value)} className={inp} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className={label}>Présentation courte (homepage)</label>
              <textarea value={data.infos.presentation} onChange={e => setInfo("presentation", e.target.value)} rows={3} className={ta} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Mini-ferme ── */}
      {tab === "miniferme" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <p className="font-body text-xs text-slate-500">Gérez les animaux et leurs photos. Ajoutez ou supprimez des animaux.</p>
            <button onClick={() => setMiniferme(prev => ({ ...prev, animals: [...prev.animals, { name: "", type: "", color: "", description: "", photo: "" }] }))}
              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
              + Ajouter un animal
            </button>
          </div>
          {miniferme.animals.map((animal, idx) => (
            <Card key={idx} padding="md">
              <div className="flex items-start gap-4">
                {/* Photo */}
                <div className="flex-shrink-0">
                  {animal.photo ? (
                    <div className="relative group">
                      <img src={animal.photo} alt={animal.name} className="w-32 h-32 rounded-xl object-cover" />
                      <button onClick={() => {
                        const updated = [...miniferme.animals];
                        updated[idx] = { ...updated[idx], photo: "" };
                        setMiniferme({ ...miniferme, animals: updated });
                      }}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-32 h-32 rounded-xl bg-sand border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                      {uploading === `animal-${idx}` ? (
                        <Loader2 size={20} className="animate-spin text-blue-400" />
                      ) : (
                        <>
                          <Upload size={20} className="text-gray-400 mb-1" />
                          <span className="font-body text-[10px] text-gray-400">Photo</span>
                        </>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(`animal-${idx}`);
                        try {
                          const storageRef = ref(storage, `miniferme/${Date.now()}_${file.name}`);
                          const task = uploadBytesResumable(storageRef, file);
                          await new Promise<void>((resolve, reject) => {
                            task.on("state_changed", null, reject, () => resolve());
                          });
                          const url = await getDownloadURL(task.snapshot.ref);
                          const updated = [...miniferme.animals];
                          updated[idx] = { ...updated[idx], photo: url };
                          setMiniferme({ ...miniferme, animals: updated });
                        } catch (err) { console.error(err); toast("Erreur upload", "error"); }
                        setUploading(null);
                      }} />
                    </label>
                  )}
                </div>
                {/* Champs */}
                <div className="flex-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                    <div><label className={label}>Nom</label>
                      <input value={animal.name} onChange={e => { const a = [...miniferme.animals]; a[idx] = { ...a[idx], name: e.target.value }; setMiniferme({ ...miniferme, animals: a }); }} className={inp} /></div>
                    <div><label className={label}>Type</label>
                      <input value={animal.type} onChange={e => { const a = [...miniferme.animals]; a[idx] = { ...a[idx], type: e.target.value }; setMiniferme({ ...miniferme, animals: a }); }} placeholder="Ex: Cochon Kune Kune" className={inp} /></div>
                    <div><label className={label}>Couleur</label>
                      <input value={animal.color} onChange={e => { const a = [...miniferme.animals]; a[idx] = { ...a[idx], color: e.target.value }; setMiniferme({ ...miniferme, animals: a }); }} className={inp} /></div>
                  </div>
                  <div><label className={label}>Description</label>
                    <textarea value={animal.description} onChange={e => { const a = [...miniferme.animals]; a[idx] = { ...a[idx], description: e.target.value }; setMiniferme({ ...miniferme, animals: a }); }} rows={2} className={ta} /></div>
                </div>
                {/* Supprimer */}
                <button onClick={() => { if (confirm(`Supprimer ${animal.name || "cet animal"} ?`)) { const a = miniferme.animals.filter((_, i) => i !== idx); setMiniferme({ ...miniferme, animals: a }); } }}
                  className="text-red-300 hover:text-red-500 bg-transparent border-none cursor-pointer mt-6"><Trash2 size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-100">
        <p className="font-body text-xs text-amber-700">
          💡 Les modifications sont appliquées immédiatement sur le site après enregistrement. Le cache se rafraîchit automatiquement dans les 5 minutes.
        </p>
      </div>
    </div>
  );
}
