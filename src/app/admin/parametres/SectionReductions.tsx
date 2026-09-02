"use client";

/**
 * src/app/admin/parametres/SectionReductions.tsx
 *
 * L'onglet Réductions & promos : les codes promotionnels et les réductions
 * automatiques (première année, anniversaire, parrainage).
 *
 * Il porte lui-même ses promos, leur chargement et leur enregistrement :
 * l'écran des paramètres n'a plus à les transporter.
 */

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

/** Classe commune des champs de saisie de cet écran. */
const inputCls = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-center";

export default function SectionReductions() {
  const [saved, setSaved] = useState(false);
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

  return (
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
                          <button type="button" onClick={() => {
                            const up = [...promos]; up[i] = { ...p, active: !p.active }; setPromos(up);
                          }} className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer ${p.active ? "bg-orange-50 text-orange-500 hover:bg-orange-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                            {p.active ? "Désactiver" : "Activer"}
                          </button>
                          <button type="button" onClick={() => setPromos(promos.filter((_, j) => j !== i))}
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
              <div className="grid grid-cols-1 gap-3 mb-4">
                {/* Code promo */}
                <button type="button" onClick={() => setPromos([...promos, {
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

              <button type="button" onClick={savePromos} className="mt-2 self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
                <Save size={16} /> Enregistrer les réductions
              </button>
            </>
          )}
        </Card>
      </div>
  );
}
