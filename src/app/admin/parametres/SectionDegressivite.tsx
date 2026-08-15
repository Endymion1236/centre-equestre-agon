"use client";
/**
 * src/app/admin/parametres/SectionDegressivite.tsx
 *
 * Onglet « Dégressivité » : paliers multi-stages (même enfant), paliers famille
 * (forfaits annuels + stages) et prix plancher par stage. Document Firestore
 * `settings/degressivite`.
 *
 * Pourquoi séparé : ces paliers se cumulent et sortent directement en euros sur
 * les inscriptions. Le prix plancher est un GARDE-FOU : un stage de plusieurs
 * jours compte aujourd'hui comme plusieurs réservations, ce qui gonfle le rang
 * multi-stages et peut faire s'effondrer le prix. Voir lib/discounts.ts >
 * applyDiscounts pour l'application des remises.
 *
 * Composant de présentation : état et sauvegarde restent dans page.tsx — les
 * tableaux de paliers y sont modifiés en place, ils ne doivent surtout pas
 * devenir des constantes de module.
 */
import { Card } from "@/components/ui";
import { Save, Plus, Trash2, Loader2 } from "lucide-react";
import { inputCls } from "./constantes";
import type { PalierReduction } from "./types";

type Props = {
  multiStage: PalierReduction[];
  setMultiStage: React.Dispatch<React.SetStateAction<PalierReduction[]>>;
  familyDiscount: PalierReduction[];
  setFamilyDiscount: React.Dispatch<React.SetStateAction<PalierReduction[]>>;
  prixPlancherStage: number;
  setPrixPlancherStage: React.Dispatch<React.SetStateAction<number>>;
  handleSave: () => void;
  savingDegress: boolean;
};

export default function SectionDegressivite({
  multiStage, setMultiStage, familyDiscount, setFamilyDiscount,
  prixPlancherStage, setPrixPlancherStage, handleSave, savingDegress,
}: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Réductions multi-stages (même enfant)</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              S'applique <strong>uniquement aux stages</strong> : un même enfant qui s'inscrit à plusieurs stages dans la même période de vacances bénéficie d'une réduction sur les inscriptions suivantes.
            </p>
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
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Réductions famille (forfaits annuels + stages)</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              S'applique aux <strong>forfaits annuels</strong> (selon le rang du nouvel enfant inscrit dans la famille)
              et aux <strong>stages</strong> sur une même période de vacances scolaires.
            </p>
            <div className="flex flex-col gap-3">
              {familyDiscount.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="font-body text-sm text-gray-500 flex-1">{r.nth}ème enfant {r.nth === 2 ? "(2ème)" : r.nth === 3 ? "(3ème)" : `(${r.nth}ème+)`}</span>
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
              <button onClick={() => setFamilyDiscount([...familyDiscount, { nth: (familyDiscount[familyDiscount.length - 1]?.nth || 1) + 1, discount: 0 }])}
                className="flex items-center gap-1 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">
                <Plus size={14} /> Ajouter un palier
              </button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Prix plancher par stage</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Garde-fou : même si les réductions cumulées (famille + multi-stages) dépassent ce seuil,
              le prix d'un stage ne descendra jamais sous ce montant. Utile car un stage de plusieurs jours
              compte aujourd'hui comme plusieurs réservations, ce qui peut gonfler le rang multi-stages.
              <strong> Mettre 0 pour désactiver le plancher.</strong>
            </p>
            <div className="flex items-center gap-4">
              <span className="font-body text-sm text-gray-500 flex-1">Prix minimum par stage</span>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={1} value={prixPlancherStage}
                  onChange={e => setPrixPlancherStage(parseFloat(e.target.value) || 0)}
                  className={`${inputCls} w-24`} />
                <span className="font-body text-sm text-gray-400">€</span>
              </div>
            </div>
          </Card>

          <Card padding="sm" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              💡 <strong>Cumul possible :</strong> un 2ème enfant à son 3ème stage bénéficie de -{familyDiscount[0]?.discount || 0}% (famille) + -{multiStage[1]?.discount || 0}% ({multiStage[1]?.nth || 3}ème stage) = -{(familyDiscount[0]?.discount || 0) + (multiStage[1]?.discount || 0)}%.{prixPlancherStage > 0 && <> Plafond au prix plancher : <strong>{prixPlancherStage}€</strong>.</>}
            </div>
          </Card>

          <button onClick={handleSave} disabled={savingDegress} className="self-start flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
            {savingDegress ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {savingDegress ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
  );
}
