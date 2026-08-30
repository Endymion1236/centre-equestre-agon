"use client";
import { useState, useEffect } from "react";
import AssistantRedaction from "@/components/admin/AssistantRedaction";
import { PUBLIC_ACTIVITIES, activitesEditables } from "@/lib/public-activities";
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

const CATEGORY_EMOJI: Record<string, string> = {
  stages: "🏕️", balades: "🌅", cours: "📅", competitions: "🏆", autres: "🎉",
};

type Tab = "activites" | "tarifs" | "infos" | "miniferme" | "actus";

export default function ContenuPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("activites");
  // Une seule fiche ouverte a la fois : 16 fiches depliees rendraient la
  // page illisible.
  const [openActivite, setOpenActivite] = useState<string | null>(null);
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
  const [actus, setActus] = useState<{ id: string; type: "event" | "news"; title: string; date: string; description: string; emoji: string; active: boolean }[]>([]);

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
            cours_annuels: d.tarifs?.cours_annuels || prev.tarifs.cours_annuels,
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
    // Actus
    getDoc(doc(db, "settings", "actus")).then(snap => {
      if (snap.exists()) {
        const d = snap.data() as any;
        if (d.items) setActus(d.items);
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "vitrine"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, "settings", "miniferme"), { ...miniferme, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, "settings", "actus"), { items: actus, updatedAt: serverTimestamp() }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast("✅ Contenu enregistré — visible sur le site dans quelques secondes", "success");
    } catch (e: any) {
      toast(e.message, "error");
    }
    setSaving(false);
  };

  // Accepte texte ET liste : « points forts » et « infos pratiques » sont
  // des listes, une ligne par element.
  const setActivite = (key: string, field: string, value: string | string[]) => {
    setData(prev => ({ ...prev, activites: { ...prev.activites, [key]: { ...(prev.activites as any)[key], [field]: value } } }));
  };

  /** Upload du visuel d'une fiche activite. */
  const uploadActiviteImage = async (key: string, file: File) => {
    setUploading(`activite-${key}`);
    try {
      const storageRef = ref(storage, `vitrine/activites/${key}_${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed", null, reject, () => resolve());
      });
      const url = await getDownloadURL(task.snapshot.ref);
      setActivite(key, "image", url);
    } catch (err) {
      console.error(err);
      toast("Erreur upload", "error");
    }
    setUploading(null);
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

  const setCoursAnnuel = (idx: number, field: string, value: string) => {
    setData(prev => {
      const cours_annuels = [...(prev.tarifs.cours_annuels || [])];
      cours_annuels[idx] = { ...cours_annuels[idx], [field]: value };
      return { ...prev, tarifs: { ...prev.tarifs, cours_annuels } };
    });
  };

  const addCoursAnnuel = () => {
    setData(prev => ({
      ...prev,
      tarifs: {
        ...prev.tarifs,
        cours_annuels: [...(prev.tarifs.cours_annuels || []), { label: "", level: "", price: "", freq: "" }],
      },
    }));
  };

  const removeCoursAnnuel = (idx: number) => {
    setData(prev => ({
      ...prev,
      tarifs: {
        ...prev.tarifs,
        cours_annuels: (prev.tarifs.cours_annuels || []).filter((_, i) => i !== idx),
      },
    }));
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
    { id: "actus", label: "Actus & événements", icon: "📣" },
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
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {saving ? "Enregistrement..." : saved ? "Enregistré !" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Tabs — flex-wrap indispensable : sans lui, le cinquième onglet
          (« Actus & événements ») débordait hors de l'écran sur mobile.
          Aucun défilement n'étant prévu ici, il était non seulement invisible
          mais inatteignable : les actualités du site paraissaient ne pas
          exister. */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(t => (
          <button type="button" key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-body text-sm font-medium border-none cursor-pointer transition-all ${tab === t.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200 hover:bg-gray-50"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Activités ── */}
      {tab === "activites" && (
        <div className="flex flex-col gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="font-body text-xs text-blue-800 m-0 leading-relaxed">
              Ces textes s’affichent sur le <strong>site public</strong>, pages Activités.
              Un champ laissé vide reprend automatiquement le texte d’origine — pour annuler
              une modification, il suffit de vider le champ.
            </p>
          </div>

          {activitesEditables().map(({ key, title: lbl, category }) => {
            const act = ((data.activites as any)[key] || {}) as any;
            const base = PUBLIC_ACTIVITIES.find(a => a.vitrineKeys[0] === key);
            const emoji = CATEGORY_EMOJI[category] || "🏇";
            const ouvert = openActivite === key;
            return (
              <Card key={key} padding="md">
                <button
                  type="button"
                  onClick={() => setOpenActivite(ouvert ? null : key)}
                  className="w-full flex items-center justify-between gap-3 bg-transparent border-none cursor-pointer p-0 text-left"
                >
                  <span className="font-body text-sm font-semibold text-blue-800">{emoji} {lbl}</span>
                  <span className="font-body text-xs text-slate-400">{ouvert ? "▲" : "▼"}</span>
                </button>

                {ouvert && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-4">
                    {/* Visuel */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <label className={label}>Visuel</label>
                      <label className="relative w-32 h-32 rounded-xl border-2 border-dashed border-blue-500/20 bg-cream hover:bg-blue-50 cursor-pointer flex flex-col items-center justify-center overflow-hidden transition-colors">
                        {uploading === `activite-${key}` ? (
                          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        ) : act.image ? (
                          <>
                            <img src={act.image} alt={act.title || lbl} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="font-body text-xs font-semibold text-white">Changer</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={24} className="text-gray-400 mb-1" />
                            <span className="font-body text-[10px] text-gray-400">Ajouter</span>
                          </>
                        )}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadActiviteImage(key, f); }} />
                      </label>
                    </div>

                    {/* Champs */}
                    <div className="flex-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          ["title", "Titre"], ["ages", "Âges"],
                          ["schedule", "Horaires"], ["price", "Tarif affiché"],
                          ["level", "Niveau"],
                        ] as const).map(([champ, lib]) => (
                          <div key={champ}>
                            <label className={label}>{lib}</label>
                            <input
                              value={act[champ] ?? ""}
                              placeholder={String((base as any)?.[champ] ?? "")}
                              onChange={e => setActivite(key, champ, e.target.value)}
                              className={inp}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="mt-3">
                        <label className={label}>Description courte</label>
                        <textarea value={act.description ?? ""} placeholder={base?.description || ""}
                          onChange={e => setActivite(key, "description", e.target.value)} rows={2} className={ta} />
                        <AssistantRedaction
                          champ="description"
                          valeur={act.description ?? base?.description ?? ""}
                          onApply={(t) => setActivite(key, "description", t)}
                          contexte={{ titre: act.title || base?.title, typeActivite: base?.category,
                            contexteLibre: [act.ages || base?.ages, act.schedule || base?.schedule].filter(Boolean).join(" · ") }}
                        />
                      </div>

                      <div className="mt-3">
                        <label className={label}>Introduction</label>
                        <textarea value={act.intro ?? ""} placeholder={base?.intro || ""}
                          onChange={e => setActivite(key, "intro", e.target.value)} rows={3} className={ta} />
                        <AssistantRedaction
                          champ="intro"
                          valeur={act.intro ?? base?.intro ?? ""}
                          onApply={(t) => setActivite(key, "intro", t)}
                          contexte={{ titre: act.title || base?.title, typeActivite: base?.category,
                            contexteLibre: [act.ages || base?.ages, act.schedule || base?.schedule].filter(Boolean).join(" · ") }}
                        />
                      </div>

                      {/* Listes : une ligne = un element */}
                      {([
                        ["features", "Points forts", "C’est ici qu’est annoncé le déroulé des 2 séquences."],
                        ["practical", "Infos pratiques", "Tenue, matériel, prérequis…"],
                      ] as const).map(([champ, lib, aide]) => (
                        <div className="mt-3" key={champ}>
                          <label className={label}>{lib} — une ligne par élément</label>
                          <textarea
                            value={Array.isArray(act[champ]) ? act[champ].join("\n") : ""}
                            placeholder={(base?.[champ] || []).join("\n")}
                            onChange={e => setActivite(key, champ, e.target.value.split("\n").map(l => l.trim()).filter(Boolean))}
                            rows={5}
                            className={ta}
                          />
                          <p className="font-body text-[10px] text-slate-400 mt-1">{aide}</p>
                          <AssistantRedaction
                            champ={champ}
                            valeur={(Array.isArray(act[champ]) ? act[champ] : (base?.[champ] || [])).join("\n")}
                            onApply={(t) => setActivite(key, champ, t.split("\n").map(l => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean))}
                            contexte={{ titre: act.title || base?.title, typeActivite: base?.category,
                              contexteLibre: [act.ages || base?.ages, act.schedule || base?.schedule].filter(Boolean).join(" · ") }}
                            placeholder={champ === "features"
                              ? "Ex : mets en avant le déroulé en 2 séquences et les petits effectifs"
                              : "Ex : rappelle la tenue obligatoire et le goûter à prévoir"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
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

          {/* Cours à l'année */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <div className="font-body text-sm font-semibold text-blue-800">📅 Tarifs cours à l'année</div>
              <button type="button" onClick={addCoursAnnuel} className="font-body text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                + Ajouter un forfait
              </button>
            </div>
            {(data.tarifs.cours_annuels || []).length === 0 ? (
              <div className="text-center py-6 font-body text-sm text-slate-400">
                Aucun forfait. Cliquez sur "Ajouter un forfait" pour commencer.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(data.tarifs.cours_annuels || []).map((c, idx) => (
                  <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 bg-sand rounded-lg items-end">
                    <div><label className={label}>Libellé</label>
                      <input value={c.label} onChange={e => setCoursAnnuel(idx, "label", e.target.value)} className={inp} placeholder="ex : 1 cours / semaine" /></div>
                    <div><label className={label}>Niveau</label>
                      <input value={c.level} onChange={e => setCoursAnnuel(idx, "level", e.target.value)} className={inp} placeholder="ex : Tous niveaux" /></div>
                    <div><label className={label}>Prix (€)</label>
                      <input type="number" value={c.price} onChange={e => setCoursAnnuel(idx, "price", e.target.value)} className={inp} /></div>
                    {/* « À partir de » : une première inscription ne paie pas
                        le même tarif qu'un renouvellement. Afficher un prix sec
                        engage sur un montant qui ne vaudra pas pour tout le
                        monde. */}
                    <div><label className={label}>Prix plancher</label>
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white cursor-pointer">
                        <input type="checkbox" checked={!!(c as any).from}
                          onChange={e => setCoursAnnuel(idx, "from", e.target.checked ? "1" : "")} />
                        <span className="font-body text-xs text-slate-600">à partir de</span>
                      </label></div>
                    <div><label className={label}>Fréquence</label>
                      <input value={c.freq} onChange={e => setCoursAnnuel(idx, "freq", e.target.value)} className={inp} placeholder="Trimestre, Année, Mois..." /></div>
                    <button type="button"
                      onClick={() => removeCoursAnnuel(idx)}
                      className="font-body text-xs font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 cursor-pointer self-end">
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
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
          <div className="font-body text-sm font-semibold text-blue-800 mb-1">ℹ️ Informations pratiques</div>
          <div className="font-body text-[11px] text-slate-400 mb-4">
            Ces informations s'affichent sur la page Contact, dans le footer et sur la carte Google Maps du site public.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { field: "adresse", label: "Adresse complète" },
              { field: "telephone", label: "Téléphone principal" },
              { field: "telephone_secondaire", label: "Téléphone secondaire (optionnel, laisser vide si non utilisé)" },
              { field: "email", label: "Email public" },
              { field: "horaires_bureau", label: "Horaires d'accueil (hors saison)" },
            ].map(({ field, label: lbl }) => (
              <div key={field} className={field === "telephone_secondaire" ? "sm:col-span-2" : ""}>
                <label className={label}>{lbl}</label>
                <input
                  value={(data.infos as any)[field] || ""}
                  onChange={e => setInfo(field, e.target.value)}
                  placeholder={field === "telephone_secondaire" ? "Ex: 06 09 02 71 59 (laisser vide si non utilisé)" : ""}
                  className={inp}
                />
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
            <button type="button" onClick={() => setMiniferme(prev => ({ ...prev, animals: [...prev.animals, { name: "", type: "", color: "", description: "", photo: "" }] }))}
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
                      <button type="button" onClick={() => {
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
                <button type="button" onClick={() => { if (confirm(`Supprimer ${animal.name || "cet animal"} ?`)) { const a = miniferme.animals.filter((_, i) => i !== idx); setMiniferme({ ...miniferme, animals: a }); } }}
                  className="text-red-300 hover:text-red-500 bg-transparent border-none cursor-pointer mt-6"><Trash2 size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Actus & événements ── */}
      {tab === "actus" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <p className="font-body text-xs text-slate-500">Gérez les actualités et événements affichés sur la page d&apos;accueil.</p>
            <button type="button" onClick={() => setActus([...actus, { id: Date.now().toString(), type: "event", title: "", date: new Date().toISOString().split("T")[0], description: "", emoji: "📅", active: true }])}
              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
              + Ajouter
            </button>
          </div>
          {actus.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="font-body text-sm text-slate-500">Aucune actualité. Cliquez sur &quot;+ Ajouter&quot; pour créer.</p>
            </Card>
          ) : actus.map((actu, idx) => (
            <Card key={actu.id} padding="md" className={!actu.active ? "opacity-50" : ""}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2">
                    <div className="w-16">
                      <label className={label}>Emoji</label>
                      <input value={actu.emoji} onChange={e => { const a = [...actus]; a[idx] = { ...a[idx], emoji: e.target.value }; setActus(a); }}
                        className={`${inp} text-center text-lg`} maxLength={4} />
                    </div>
                    <div className="w-24">
                      <label className={label}>Type</label>
                      <select value={actu.type} onChange={e => { const a = [...actus]; a[idx] = { ...a[idx], type: e.target.value as any }; setActus(a); }}
                        className={inp}>
                        <option value="event">Événement</option>
                        <option value="news">Actualité</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className={label}>Titre *</label>
                      <input value={actu.title} onChange={e => { const a = [...actus]; a[idx] = { ...a[idx], title: e.target.value }; setActus(a); }}
                        placeholder="Ex: Stage Pâques 2026, Portes ouvertes..." className={inp} />
                    </div>
                    <div className="w-36">
                      <label className={label}>Date</label>
                      <input type="date" value={actu.date} onChange={e => { const a = [...actus]; a[idx] = { ...a[idx], date: e.target.value }; setActus(a); }}
                        className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className={label}>Description</label>
                    <textarea value={actu.description} onChange={e => { const a = [...actus]; a[idx] = { ...a[idx], description: e.target.value }; setActus(a); }}
                      rows={2} placeholder="Détail de l'événement ou de l'actualité..." className={ta} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 pt-5">
                  <button type="button" onClick={() => { const a = [...actus]; a[idx] = { ...a[idx], active: !a[idx].active }; setActus(a); }}
                    className={`font-body text-[10px] px-2.5 py-1 rounded-lg border-none cursor-pointer ${actu.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {actu.active ? "Visible" : "Masqué"}
                  </button>
                  <button type="button" onClick={() => { if (confirm("Supprimer cette actu ?")) setActus(actus.filter((_, i) => i !== idx)); }}
                    className="font-body text-[10px] text-red-400 bg-red-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-red-100">
                    Supprimer
                  </button>
                </div>
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
