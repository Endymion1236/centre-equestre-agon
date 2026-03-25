"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Save, Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";

const defaultAccounts = [
  { code: "70641000", label: "Animations collectivité", tva: "5.50%", affectation: "Animations CE, collectivités" },
  { code: "70611110", label: "Cotisations / Adhésions", tva: "5.50%", affectation: "Adhésions annuelles" },
  { code: "70611600", label: "Découverte / Familiarisation", tva: "5.50%", affectation: "Séances découverte, baby poney" },
  { code: "70605000", label: "Divers", tva: "20%", affectation: "Produits divers" },
  { code: "70619900", label: "Droits d'accès installations", tva: "5.50%", affectation: "Accès carrière, manège" },
  { code: "70611300", label: "Enseignement / Cartes", tva: "5.50%", affectation: "Cartes d'heures" },
  { code: "70611700", label: "Enseignement / Coaching", tva: "5.50%", affectation: "Cours particuliers, coaching" },
  { code: "70611000", label: "Enseignement / Forfaits", tva: "5.50%", affectation: "Forfaits annuels, trimestriels" },
  { code: "4386", label: "Formation professionnelle", tva: "0%", affectation: "BPJEPS, formations" },
  { code: "70613110", label: "Location poneys", tva: "20%", affectation: "Location poneys extérieurs" },
  { code: "70630110", label: "Pensions équidé", tva: "5.50%", affectation: "Pensions box, paddock" },
  { code: "70611500", label: "Randonnées / Promenades", tva: "5.50%", affectation: "Balades plage, randonnées" },
  { code: "70100000", label: "Refacturation FFE", tva: "0%", affectation: "Licences FFE refacturées" },
  { code: "70880000", label: "Refacturation soin", tva: "20%", affectation: "Soins vétérinaires refacturés" },
  { code: "70611400", label: "Stages équitation", tva: "5.50%", affectation: "Stages vacances" },
  { code: "70622011", label: "Transport", tva: "20%", affectation: "Transport chevaux/cavaliers" },
  { code: "70410000", label: "Ventes équidés", tva: "20%", affectation: "Vente de chevaux/poneys" },
];

export default function ParametresPage() {
  const [section, setSection] = useState<"tarifs" | "reductions" | "degressivite" | "annulation" | "comptable" | "horaires" | "moniteurs" | "maintenance">("tarifs");

  const [multiStage, setMultiStage] = useState([
    { nth: 2, discount: 10 },
    { nth: 3, discount: 15 },
    { nth: 4, discount: 20 },
  ]);
  const [familyDiscount, setFamilyDiscount] = useState([
    { nth: 2, discount: 5 },
    { nth: 3, discount: 10 },
  ]);
  const [cancellation, setCancellation] = useState({ hours: 72, retention: 50 });
  const [saved, setSaved] = useState(false);
  const [loadingTarifs, setLoadingTarifs] = useState(true);

  // ─── Réductions & codes promo ───
  type PromoType = "code" | "premiere_annee" | "anniversaire" | "parrainage";
  type DiscountMode = "percent" | "fixed";
  interface Promo {
    id: string;
    type: PromoType;
    code: string;
    label: string;
    discountMode: DiscountMode;
    discountValue: number;
    appliesTo: "forfait" | "paiement" | "tout";
    active: boolean;
    maxUses: number;
    usedCount: number;
    validFrom: string;
    validUntil: string;
  }
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);

  // Charger les promos depuis Firestore
  useEffect(() => {
    const loadPromos = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "promos"));
        if (snap.exists() && snap.data().items) {
          setPromos(snap.data().items);
        }
      } catch (e) { console.error(e); }
      setLoadingPromos(false);
    };
    loadPromos();
  }, []);

  const savePromos = async () => {
    try {
      await setDoc(doc(db, "settings", "promos"), { items: promos, updatedAt: new Date() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert("Erreur sauvegarde"); }
  };

  // ─── Tarifs annuels (sauvegardés dans Firestore settings/tarifs) ───
  const [tarifs, setTarifs] = useState<{ id: string; label: string; priceTTC: number; tvaRate: number; accountCode: string; obligatoire: boolean; category: "licence" | "adhesion" | "forfait" | "option" }[]>([
    { id: "licence_ffe", label: "Licence FFE", priceTTC: 25, tvaRate: 0, accountCode: "70100000", obligatoire: true, category: "licence" },
    { id: "adhesion_club", label: "Adhésion club", priceTTC: 80, tvaRate: 5.5, accountCode: "70611110", obligatoire: true, category: "adhesion" },
    { id: "forfait_1cours", label: "Forfait 1 cours/semaine", priceTTC: 700, tvaRate: 5.5, accountCode: "70611000", obligatoire: false, category: "forfait" },
    { id: "forfait_2cours", label: "Forfait 2 cours/semaine", priceTTC: 1050, tvaRate: 5.5, accountCode: "70611000", obligatoire: false, category: "forfait" },
    { id: "forfait_competition", label: "Forfait compétition", priceTTC: 1200, tvaRate: 5.5, accountCode: "70611000", obligatoire: false, category: "forfait" },
  ]);

  // Charger les tarifs depuis Firestore
  useEffect(() => {
    const loadTarifs = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "tarifs"));
        if (snap.exists() && snap.data().items) {
          setTarifs(snap.data().items);
        }
      } catch (e) { console.error("Erreur chargement tarifs:", e); }
      setLoadingTarifs(false);
    };
    loadTarifs();
  }, []);

  // Sauvegarder les tarifs
  const saveTarifs = async () => {
    try {
      await setDoc(doc(db, "settings", "tarifs"), { items: tarifs, updatedAt: new Date() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert("Erreur sauvegarde"); }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputCls = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-center";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Paramètres</h1>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {([
          ["tarifs", "Tarifs annuels"],
          ["reductions", "Réductions & promos"],
          ["degressivite", "Dégressivité"],
          ["annulation", "Annulation"],
          ["comptable", "Plan comptable"],
          ["horaires", "Horaires"],
          ["moniteurs", "Moniteurs"],
          ["maintenance", "Maintenance"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${section === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Success message */}
      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700 flex items-center gap-2">
          <Save size={16} /> Modifications enregistrées !
        </div>
      )}

      {/* ─── Tarifs annuels ─── */}
      {section === "tarifs" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">Tarifs des inscriptions annuelles</h3>
            <p className="font-body text-xs text-gray-400 mb-4">
              Ces tarifs sont utilisés automatiquement dans le formulaire des forfaits annuels.
              Les lignes marquées &quot;obligatoire&quot; sont ajoutées automatiquement à chaque inscription.
            </p>

            {loadingTarifs ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
            ) : (
              <>
                {/* Obligatoires */}
                <div className="font-body text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Lignes obligatoires (ajoutées automatiquement)</div>
                <div className="flex flex-col gap-2 mb-5">
                  {tarifs.filter(t => t.obligatoire).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 bg-red-50/30 border border-red-100 rounded-lg px-4 py-3">
                      <Badge color="red">Obligatoire</Badge>
                      <input value={t.label} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, label: e.target.value }; setTarifs(up); }}
                        className={`${inputCls} flex-1 !text-left`} />
                      <div className="flex items-center gap-1">
                        <input type="number" value={t.priceTTC} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, priceTTC: parseFloat(e.target.value) || 0 }; setTarifs(up); }}
                          className={`${inputCls} w-20`} />
                        <span className="font-body text-xs text-gray-400">€ TTC</span>
                      </div>
                      <select value={t.tvaRate} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, tvaRate: parseFloat(e.target.value) }; setTarifs(up); }}
                        className={`${inputCls} w-24`}>
                        <option value={0}>0% TVA</option>
                        <option value={5.5}>5.50%</option>
                        <option value={20}>20%</option>
                      </select>
                      <input value={t.accountCode} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, accountCode: e.target.value }; setTarifs(up); }}
                        className={`${inputCls} w-28`} placeholder="Compte" />
                    </div>
                  ))}
                </div>

                {/* Forfaits */}
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2">Forfaits cours (le client en choisit un)</div>
                <div className="flex flex-col gap-2 mb-5">
                  {tarifs.filter(t => t.category === "forfait").map((t) => (
                    <div key={t.id} className="flex items-center gap-3 bg-blue-50/30 border border-blue-100 rounded-lg px-4 py-3">
                      <Badge color="blue">Forfait</Badge>
                      <input value={t.label} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, label: e.target.value }; setTarifs(up); }}
                        className={`${inputCls} flex-1 !text-left`} />
                      <div className="flex items-center gap-1">
                        <input type="number" value={t.priceTTC} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, priceTTC: parseFloat(e.target.value) || 0 }; setTarifs(up); }}
                          className={`${inputCls} w-20`} />
                        <span className="font-body text-xs text-gray-400">€ TTC</span>
                      </div>
                      <select value={t.tvaRate} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, tvaRate: parseFloat(e.target.value) }; setTarifs(up); }}
                        className={`${inputCls} w-24`}>
                        <option value={5.5}>5.50%</option>
                        <option value={20}>20%</option>
                      </select>
                      <button onClick={() => setTarifs(tarifs.filter(x => x.id !== t.id))}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center border-none cursor-pointer hover:bg-red-100">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setTarifs([...tarifs, {
                    id: `forfait_${Date.now()}`, label: "Nouveau forfait", priceTTC: 0, tvaRate: 5.5, accountCode: "70611000", obligatoire: false, category: "forfait",
                  }])} className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-1">
                    <Plus size={14} /> Ajouter un forfait
                  </button>
                </div>

                {/* Options */}
                <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Options (facultatives)</div>
                <div className="flex flex-col gap-2 mb-5">
                  {tarifs.filter(t => t.category === "option").map((t) => (
                    <div key={t.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      <Badge color="gray">Option</Badge>
                      <input value={t.label} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, label: e.target.value }; setTarifs(up); }}
                        className={`${inputCls} flex-1 !text-left`} />
                      <div className="flex items-center gap-1">
                        <input type="number" value={t.priceTTC} onChange={e => { const up = [...tarifs]; const idx = tarifs.findIndex(x => x.id === t.id); up[idx] = { ...t, priceTTC: parseFloat(e.target.value) || 0 }; setTarifs(up); }}
                          className={`${inputCls} w-20`} />
                        <span className="font-body text-xs text-gray-400">€ TTC</span>
                      </div>
                      <button onClick={() => setTarifs(tarifs.filter(x => x.id !== t.id))}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center border-none cursor-pointer hover:bg-red-100">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setTarifs([...tarifs, {
                    id: `option_${Date.now()}`, label: "Nouvelle option", priceTTC: 0, tvaRate: 5.5, accountCode: "70605000", obligatoire: false, category: "option",
                  }])} className="font-body text-xs text-gray-500 bg-transparent border-none cursor-pointer flex items-center gap-1 mt-1">
                    <Plus size={14} /> Ajouter une option
                  </button>
                </div>

                {/* Aperçu total */}
                <Card padding="sm" className="bg-blue-50 border-blue-500/8">
                  <div className="font-body text-xs text-blue-800">
                    <strong>Exemple de total inscription annuelle :</strong><br />
                    {tarifs.filter(t => t.obligatoire).map(t => `${t.label} : ${t.priceTTC}€`).join(" + ")}
                    {" + "}
                    {tarifs.filter(t => t.category === "forfait").length > 0
                      ? `[${tarifs.filter(t => t.category === "forfait").map(t => `${t.label} ${t.priceTTC}€`).join(" ou ")}]`
                      : "Forfait cours"}
                    {" = "}
                    <strong>
                      {tarifs.filter(t => t.obligatoire).reduce((s, t) => s + t.priceTTC, 0) + (tarifs.find(t => t.category === "forfait")?.priceTTC || 0)}€
                      {" à "}
                      {tarifs.filter(t => t.obligatoire).reduce((s, t) => s + t.priceTTC, 0) + (tarifs.filter(t => t.category === "forfait").sort((a, b) => b.priceTTC - a.priceTTC)[0]?.priceTTC || 0)}€
                    </strong>
                  </div>
                </Card>

                <button onClick={saveTarifs} className="mt-4 self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
                  <Save size={16} /> Enregistrer les tarifs
                </button>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ─── Réductions & promos ─── */}
      {section === "reductions" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">Codes promo & réductions</h3>
            <p className="font-body text-xs text-gray-400 mb-4">
              Créez des codes promo, des réductions automatiques (1ère année, anniversaire) ou manuelles.
              Ces réductions sont utilisables dans les forfaits annuels et les paiements.
            </p>

            {loadingPromos ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
            ) : (
              <>
                {/* Liste des promos existantes */}
                {promos.length > 0 && (
                  <div className="flex flex-col gap-2 mb-5">
                    {promos.map((p, i) => {
                      const typeLabels: Record<string, { label: string; color: "blue" | "green" | "orange" | "purple" }> = {
                        code: { label: "Code promo", color: "blue" },
                        premiere_annee: { label: "1ère année", color: "green" },
                        anniversaire: { label: "Anniversaire", color: "orange" },
                        parrainage: { label: "Parrainage", color: "purple" },
                      };
                      const t = typeLabels[p.type] || { label: p.type, color: "gray" as const };
                      return (
                        <div key={p.id} className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${p.active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge color={t.color}>{t.label}</Badge>
                              {p.code && <span className="font-body text-sm font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded font-mono">{p.code}</span>}
                              <span className="font-body text-sm text-gray-600">{p.label}</span>
                              {!p.active && <Badge color="gray">Désactivé</Badge>}
                            </div>
                            <div className="font-body text-xs text-gray-400 mt-1">
                              {p.discountMode === "percent" ? `-${p.discountValue}%` : `-${p.discountValue}€`}
                              {" · "}{p.appliesTo === "tout" ? "Forfaits + paiements" : p.appliesTo === "forfait" ? "Forfaits uniquement" : "Paiements uniquement"}
                              {p.maxUses > 0 && <> · {p.usedCount}/{p.maxUses} utilisations</>}
                              {p.validUntil && <> · Expire le {new Date(p.validUntil).toLocaleDateString("fr-FR")}</>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => {
                              const up = [...promos]; up[i] = { ...p, active: !p.active }; setPromos(up);
                            }} className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer ${p.active ? "bg-orange-50 text-orange-500 hover:bg-orange-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                              {p.active ? "Désactiver" : "Activer"}
                            </button>
                            <button onClick={() => setPromos(promos.filter((_, j) => j !== i))}
                              className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center border-none cursor-pointer hover:bg-red-100">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Boutons ajout rapide */}
                <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ajouter une réduction</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {/* Code promo */}
                  <button onClick={() => setPromos([...promos, {
                    id: `promo_${Date.now()}`, type: "code", code: "", label: "Nouveau code promo",
                    discountMode: "percent", discountValue: 10, appliesTo: "tout", active: true,
                    maxUses: 0, usedCount: 0, validFrom: "", validUntil: "",
                  }])} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/30 text-left cursor-pointer hover:bg-blue-50 transition-all">
                    <Plus size={18} className="text-blue-500" />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">Code promo</div>
                      <div className="font-body text-xs text-gray-400">Ex: BIENVENUE10, ETE2026, NOEL...</div>
                    </div>
                  </button>

                  {/* 1ère année */}
                  <button onClick={() => setPromos([...promos, {
                    id: `promo_${Date.now()}`, type: "premiere_annee", code: "", label: "Tarif spécial 1ère année",
                    discountMode: "percent", discountValue: 10, appliesTo: "forfait", active: true,
                    maxUses: 0, usedCount: 0, validFrom: "", validUntil: "",
                  }])} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-green-300 bg-green-50/30 text-left cursor-pointer hover:bg-green-50 transition-all">
                    <Plus size={18} className="text-green-600" />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">1ère année</div>
                      <div className="font-body text-xs text-gray-400">Réduction auto pour les nouveaux inscrits</div>
                    </div>
                  </button>

                  {/* Anniversaire */}
                  <button onClick={() => setPromos([...promos, {
                    id: `promo_${Date.now()}`, type: "anniversaire", code: "", label: "Réduction anniversaire",
                    discountMode: "percent", discountValue: 15, appliesTo: "tout", active: true,
                    maxUses: 0, usedCount: 0, validFrom: "", validUntil: "",
                  }])} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-orange-300 bg-orange-50/30 text-left cursor-pointer hover:bg-orange-50 transition-all">
                    <Plus size={18} className="text-orange-500" />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">Anniversaire</div>
                      <div className="font-body text-xs text-gray-400">Réduction le mois d&apos;anniversaire du cavalier</div>
                    </div>
                  </button>

                  {/* Parrainage */}
                  <button onClick={() => setPromos([...promos, {
                    id: `promo_${Date.now()}`, type: "parrainage", code: "", label: "Parrainage",
                    discountMode: "fixed", discountValue: 30, appliesTo: "forfait", active: true,
                    maxUses: 0, usedCount: 0, validFrom: "", validUntil: "",
                  }])} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-purple-300 bg-purple-50/30 text-left cursor-pointer hover:bg-purple-50 transition-all">
                    <Plus size={18} className="text-purple-600" />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">Parrainage</div>
                      <div className="font-body text-xs text-gray-400">Réduction quand un client amène un nouveau</div>
                    </div>
                  </button>
                </div>

                {/* Édition détaillée des promos */}
                {promos.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Détail des réductions</div>
                    {promos.map((p, i) => (
                      <div key={p.id} className="bg-gray-50 rounded-lg p-4 mb-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {p.type === "code" && (
                            <div>
                              <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Code</label>
                              <input value={p.code} onChange={e => { const up = [...promos]; up[i] = { ...p, code: e.target.value.toUpperCase() }; setPromos(up); }}
                                className={`${inputCls} !text-left font-mono !uppercase`} placeholder="BIENVENUE10" />
                            </div>
                          )}
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Description</label>
                            <input value={p.label} onChange={e => { const up = [...promos]; up[i] = { ...p, label: e.target.value }; setPromos(up); }}
                              className={`${inputCls} !text-left`} />
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Réduction</label>
                            <div className="flex gap-1">
                              <input type="number" value={p.discountValue} onChange={e => { const up = [...promos]; up[i] = { ...p, discountValue: parseFloat(e.target.value) || 0 }; setPromos(up); }}
                                className={`${inputCls} w-16`} />
                              <select value={p.discountMode} onChange={e => { const up = [...promos]; up[i] = { ...p, discountMode: e.target.value as "percent" | "fixed" }; setPromos(up); }}
                                className={`${inputCls} w-16`}>
                                <option value="percent">%</option>
                                <option value="fixed">€</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">S&apos;applique à</label>
                            <select value={p.appliesTo} onChange={e => { const up = [...promos]; up[i] = { ...p, appliesTo: e.target.value as any }; setPromos(up); }}
                              className={`${inputCls} !text-left`}>
                              <option value="tout">Forfaits + paiements</option>
                              <option value="forfait">Forfaits uniquement</option>
                              <option value="paiement">Paiements uniquement</option>
                            </select>
                          </div>
                          {p.type === "code" && (
                            <>
                              <div>
                                <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Max utilisations</label>
                                <input type="number" value={p.maxUses} onChange={e => { const up = [...promos]; up[i] = { ...p, maxUses: parseInt(e.target.value) || 0 }; setPromos(up); }}
                                  className={inputCls} placeholder="0 = illimité" />
                              </div>
                              <div>
                                <label className="font-body text-[10px] font-semibold text-gray-400 uppercase block mb-1">Expire le</label>
                                <input type="date" value={p.validUntil} onChange={e => { const up = [...promos]; up[i] = { ...p, validUntil: e.target.value }; setPromos(up); }}
                                  className={inputCls} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={savePromos} className="mt-2 self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
                  <Save size={16} /> Enregistrer les réductions
                </button>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ─── Dégressivité ─── */}
      {section === "degressivite" && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Réductions multi-stages (même enfant)</h3>
            <div className="flex flex-col gap-3">
              {multiStage.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="font-body text-sm text-gray-500 flex-1">{r.nth}ème stage consécutif</span>
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-gray-400">-</span>
                    <input type="number" value={r.discount} onChange={(e) => {
                      const updated = [...multiStage];
                      updated[i].discount = parseInt(e.target.value) || 0;
                      setMultiStage(updated);
                    }} className={`${inputCls} w-16`} />
                    <span className="font-body text-sm text-gray-400">%</span>
                  </div>
                  <button onClick={() => setMultiStage(multiStage.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => setMultiStage([...multiStage, { nth: multiStage.length + 2, discount: 0 }])}
                className="flex items-center gap-1 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">
                <Plus size={14} /> Ajouter un palier
              </button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Réductions famille (enfants supplémentaires)</h3>
            <div className="flex flex-col gap-3">
              {familyDiscount.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="font-body text-sm text-gray-500 flex-1">{r.nth}ème enfant inscrit (même semaine)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-gray-400">-</span>
                    <input type="number" value={r.discount} onChange={(e) => {
                      const updated = [...familyDiscount];
                      updated[i].discount = parseInt(e.target.value) || 0;
                      setFamilyDiscount(updated);
                    }} className={`${inputCls} w-16`} />
                    <span className="font-body text-sm text-gray-400">%</span>
                  </div>
                  <button onClick={() => setFamilyDiscount(familyDiscount.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="sm" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              💡 <strong>Cumul possible :</strong> un 2ème enfant à son 3ème stage bénéficie de -{familyDiscount[0]?.discount || 0}% (famille) + -{multiStage[1]?.discount || 0}% ({multiStage[1]?.nth || 3}ème stage) = -{(familyDiscount[0]?.discount || 0) + (multiStage[1]?.discount || 0)}%.
            </div>
          </Card>

          <button onClick={handleSave} className="self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
            <Save size={16} /> Enregistrer
          </button>
        </div>
      )}

      {/* ─── Annulation ─── */}
      {section === "annulation" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Politique d&apos;annulation</h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="font-body text-sm text-gray-500 flex-1">Délai d&apos;annulation gratuite</span>
              <input type="number" value={cancellation.hours} onChange={(e) => setCancellation({ ...cancellation, hours: parseInt(e.target.value) || 0 })} className={`${inputCls} w-20`} />
              <span className="font-body text-sm text-gray-400">heures avant</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-body text-sm text-gray-500 flex-1">Retenue après délai</span>
              <input type="number" value={cancellation.retention} onChange={(e) => setCancellation({ ...cancellation, retention: parseInt(e.target.value) || 0 })} className={`${inputCls} w-20`} />
              <span className="font-body text-sm text-gray-400">%</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-body text-sm text-gray-500 flex-1">Mode de remboursement</span>
              <select className="px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none">
                <option>Au choix du client (CB ou avoir)</option>
                <option>Remboursement CB uniquement</option>
                <option>Avoir uniquement</option>
              </select>
            </div>
            <button onClick={handleSave} className="self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 mt-2">
              <Save size={16} /> Enregistrer
            </button>
          </div>
        </Card>
      )}

      {/* ─── Plan comptable ─── */}
      {section === "comptable" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="font-body text-sm text-gray-500">Plan comptable importé de Celeris — {defaultAccounts.length} comptes</p>
            <button className="flex items-center gap-2 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">
              <Plus size={14} /> Ajouter un compte
            </button>
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="w-24">Compte</span>
              <span className="flex-1">Intitulé</span>
              <span className="w-20 text-center">TVA</span>
              <span className="flex-1">Affectation</span>
              <span className="w-12"></span>
            </div>
            {defaultAccounts.map((a, i) => (
              <div key={i} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors">
                <span className="w-24 font-body text-sm font-bold text-blue-500">{a.code}</span>
                <span className="flex-1 font-body text-sm font-medium text-blue-800">{a.label}</span>
                <span className="w-20 text-center">
                  <Badge color={a.tva === "0%" ? "gray" : a.tva === "5.50%" ? "green" : "orange"}>{a.tva}</Badge>
                </span>
                <span className="flex-1 font-body text-xs text-gray-400">{a.affectation}</span>
                <span className="w-12 text-right">
                  <button className="text-gray-300 hover:text-blue-500 bg-transparent border-none cursor-pointer">✏️</button>
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ─── Horaires ─── */}
      {section === "horaires" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Horaires d&apos;ouverture</h3>
          <div className="flex flex-col gap-3">
            {[
              { period: "Pleine saison (Juil–Août)", days: "Lun – Sam", hours: "9h – 19h" },
              { period: "Vacances scolaires", days: "Lun – Ven", hours: "9h – 18h" },
              { period: "Période scolaire", days: "Mer, Sam", hours: "9h – 18h" },
              { period: "Hiver (Déc–Fév)", days: "Fermé", hours: "—" },
            ].map((h, i) => (
              <div key={i} className="flex items-center gap-4 pb-3 border-b border-blue-500/8 last:border-b-0">
                <span className="font-body text-sm font-medium text-blue-800 flex-1">{h.period}</span>
                <input defaultValue={h.days} className={`${inputCls} w-28`} />
                <input defaultValue={h.hours} className={`${inputCls} w-24`} />
              </div>
            ))}
          </div>
          <button onClick={handleSave} className="mt-4 flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
            <Save size={16} /> Enregistrer
          </button>
        </Card>
      )}

      {/* ─── Moniteurs ─── */}
      {section === "moniteurs" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Moniteurs & instructeurs</h3>
          <div className="flex flex-col gap-3">
            {[
              { name: "Emmeline", role: "Instructrice BPJEPS", email: "", status: "active" },
              { name: "Nicolas", role: "Gérant / Accompagnateur", email: "ceagon@orange.fr", status: "active" },
            ].map((m, i) => (
              <div key={i} className="flex items-center justify-between bg-sand rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center font-body text-sm font-bold text-blue-500">
                    {m.name[0]}
                  </div>
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{m.name}</div>
                    <div className="font-body text-xs text-gray-400">{m.role}</div>
                  </div>
                </div>
                <Badge color="green">Actif</Badge>
              </div>
            ))}
          </div>
          <button className="mt-4 flex items-center gap-2 font-body text-xs font-semibold text-blue-500 bg-transparent border-none cursor-pointer">
            <Plus size={14} /> Ajouter un moniteur
          </button>
        </Card>
      )}

      {/* ─── Maintenance ─── */}
      {section === "maintenance" && (
        <div className="flex flex-col gap-5">
          <Card padding="md" className="bg-orange-50 border-orange-200">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={20} className="text-orange-500" />
              <div className="font-body text-sm font-semibold text-orange-700">Zone de maintenance</div>
            </div>
            <p className="font-body text-xs text-orange-600">
              Ces actions suppriment des données de façon irréversible. Utilisez-les uniquement pour nettoyer les données de test.
              Les familles, cavaliers et la cavalerie ne sont PAS affectés.
            </p>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Nettoyer les données de test</h3>
            <p className="font-body text-xs text-gray-400 mb-4">
              Supprime toutes les données transactionnelles (paiements, réservations, forfaits, avoirs, créneaux, etc.)
              tout en conservant les familles/cavaliers et la cavalerie intactes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {[
                { col: "payments", label: "Paiements & factures", color: "text-red-500" },
                { col: "reservations", label: "Réservations", color: "text-red-500" },
                { col: "forfaits", label: "Forfaits annuels", color: "text-red-500" },
                { col: "avoirs", label: "Avoirs & avances", color: "text-red-500" },
                { col: "creneaux", label: "Créneaux planning", color: "text-red-500" },
                { col: "emailsReprise", label: "Emails envoyés", color: "text-orange-500" },
                { col: "rdv_pro", label: "RDV professionnels", color: "text-orange-500" },
                { col: "cartes", label: "Cartes & tickets", color: "text-red-500" },
                { col: "encaissements", label: "Encaissements (journal)", color: "text-red-500" },
              ].map(item => (
                <div key={item.col} className="flex items-center justify-between px-3 py-2 bg-sand rounded-lg">
                  <div className="flex items-center gap-2">
                    <Trash2 size={12} className={item.color} />
                    <span className="font-body text-sm text-blue-800">{item.label}</span>
                  </div>
                  <button onClick={async () => {
                    if (!confirm(`Supprimer TOUS les ${item.label.toLowerCase()} ?\n\nCette action est irréversible.`)) return;
                    try {
                      const snap = await getDocs(collection(db, item.col));
                      let count = 0;
                      for (const d of snap.docs) {
                        await deleteDoc(doc(db, item.col, d.id));
                        count++;
                      }
                      alert(`${count} ${item.label.toLowerCase()} supprimé(s).`);
                    } catch (e) { console.error(e); alert("Erreur."); }
                  }} className="font-body text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100">
                    Vider
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <button onClick={async () => {
                if (!confirm("⚠️ NETTOYAGE COMPLET\n\nCeci va supprimer :\n- Paiements, encaissements, réservations\n- Forfaits, avoirs, créneaux, cartes\n- Emails, RDV pro\n\nCONSERVÉ : familles, cavaliers, cavalerie, soins, activités.\n\nContinuer ?")) return;
                if (!confirm("DERNIÈRE CONFIRMATION\n\nAction IRRÉVERSIBLE.\nConfirmer le nettoyage complet ?")) return;

                const collections = ["payments", "reservations", "forfaits", "avoirs", "creneaux", "emailsReprise", "rdv_pro", "cartes", "encaissements", "remises"];
                let total = 0;
                for (const col of collections) {
                  try {
                    const snap = await getDocs(collection(db, col));
                    for (const d of snap.docs) {
                      await deleteDoc(doc(db, col, d.id));
                      total++;
                    }
                  } catch (e) { console.error(`Erreur sur ${col}:`, e); }
                }
                alert(`Nettoyage terminé : ${total} documents supprimés.\n\nLes familles et la cavalerie sont intactes.`);
              }} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-red-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-red-600">
                <Trash2 size={16} /> Tout nettoyer (confirmation requise)
              </button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">Données préservées</h3>
            <p className="font-body text-xs text-gray-400 mb-3">Ces collections ne sont jamais supprimées par le nettoyage :</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Familles & cavaliers", "Équidés (cavalerie)", "Soins vétérinaires",
                "Registre d'élevage", "Indisponibilités", "Documents équidés",
                "Activités", "Paramètres & tarifs",
              ].map(item => (
                <div key={item} className="font-body text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">{item}</div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
