"use client";
/**
 * src/app/admin/parametres/SectionFidelite.tsx
 *
 * Onglet « Fidélité » : activation du programme, taux de conversion
 * (points → euros) et seuil minimum d'utilisation. Document `settings/fidelite`.
 *
 * Pourquoi séparé : les points sont attribués automatiquement à chaque
 * encaissement et convertis en réduction dans l'espace cavalier. Le taux et le
 * seuil affichés dans les exemples de l'écran sont calculés en direct pour que
 * la personne qui règle voie tout de suite ce que ça donne côté famille.
 *
 * Composant de présentation : état et sauvegarde restent dans page.tsx.
 */
import { Card } from "@/components/ui";

type Props = {
  fideliteEnabled: boolean;
  setFideliteEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  fideliteTaux: number;
  setFideliteTaux: React.Dispatch<React.SetStateAction<number>>;
  fideliteMinPoints: number;
  setFideliteMinPoints: React.Dispatch<React.SetStateAction<number>>;
  fideliteSaved: boolean;
  saveFidelite: () => void;
};

export default function SectionFidelite({
  fideliteEnabled, setFideliteEnabled, fideliteTaux, setFideliteTaux,
  fideliteMinPoints, setFideliteMinPoints, fideliteSaved, saveFidelite,
}: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏆 Programme de fidélité</h3>
            <div className="flex flex-col gap-5">

              {/* Activer/désactiver */}
              <div className="flex items-center justify-between p-4 bg-sand rounded-xl">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">Activer le programme fidélité</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Les points sont attribués automatiquement à chaque encaissement</div>
                </div>
                <button onClick={() => setFideliteEnabled(!fideliteEnabled)}
                  className={`w-12 h-6 rounded-full transition-all border-none cursor-pointer ${fideliteEnabled ? "bg-blue-500" : "bg-gray-200"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-all mx-0.5 ${fideliteEnabled ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>

              {fideliteEnabled && (
                <>
                  {/* Taux de conversion */}
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Taux de conversion</label>
                    <div className="flex items-center gap-3 bg-sand rounded-xl p-4">
                      <input type="number" min="1" value={fideliteTaux}
                        onChange={e => setFideliteTaux(Number(e.target.value))}
                        className="w-24 text-center border border-gray-200 rounded-lg px-3 py-2 font-body text-sm bg-white focus:outline-none focus:border-blue-500" />
                      <span className="font-body text-sm text-gray-500">points = <strong className="text-blue-800">1€</strong> de réduction</span>
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-1.5">
                      Exemple : avec {fideliteTaux} points/€ → 100€ dépensés = {Math.floor(100 * 1 / fideliteTaux * 100) / 100}€ de réduction possible
                    </div>
                  </div>

                  {/* Seuil minimum */}
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Seuil minimum pour utiliser les points</label>
                    <div className="flex items-center gap-3 bg-sand rounded-xl p-4">
                      <input type="number" min="1" value={fideliteMinPoints}
                        onChange={e => setFideliteMinPoints(Number(e.target.value))}
                        className="w-24 text-center border border-gray-200 rounded-lg px-3 py-2 font-body text-sm bg-white focus:outline-none focus:border-blue-500" />
                      <span className="font-body text-sm text-gray-500">points minimum requis</span>
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-1.5">
                      Soit {(fideliteMinPoints / fideliteTaux).toFixed(2)}€ de réduction minimum
                    </div>
                  </div>

                  {/* Résumé */}
                  <div className="bg-blue-50 rounded-xl p-4 font-body text-xs text-blue-700 space-y-1">
                    <div>✅ <strong>1€ encaissé</strong> = <strong>1 point</strong></div>
                    <div>✅ <strong>{fideliteTaux} points</strong> = <strong>1€</strong> de réduction</div>
                    <div>✅ Minimum <strong>{fideliteMinPoints} points</strong> pour utiliser</div>
                    <div>✅ Points valables <strong>1 an</strong> après acquisition</div>
                    <div>✅ La famille gère depuis son espace cavalier</div>
                  </div>
                </>
              )}

              <button onClick={saveFidelite}
                className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
                {fideliteSaved ? "✅ Sauvegardé !" : "Sauvegarder"}
              </button>
            </div>
          </Card>
        </div>
  );
}
