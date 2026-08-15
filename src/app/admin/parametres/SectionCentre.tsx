"use client";
/**
 * src/app/admin/parametres/SectionCentre.tsx
 *
 * Onglet « Centre » : identité, mentions légales/bancaires et seuils d'alerte
 * poneys — le contenu du document Firestore `settings/centre`.
 *
 * Pourquoi séparé : ces champs ne servent pas qu'à l'écran. La raison sociale,
 * le SIRET et l'IBAN partent tels quels sur les factures, les bons cadeaux et
 * les emails officiels ; les trois seuils poneys pilotent les alertes de charge
 * du Montoir. Les isoler évite qu'une retouche de mise en page vienne toucher
 * à ces champs-là.
 *
 * Composant de présentation : l'état, le chargement et la sauvegarde restent
 * dans page.tsx, qui les passe en props.
 */
import { Card } from "@/components/ui";
import type { CentreParams } from "./types";

type Props = {
  centreParams: CentreParams;
  setCentreParams: React.Dispatch<React.SetStateAction<CentreParams>>;
  centreSaved: boolean;
  saveCentre: () => void;
};

export default function SectionCentre({ centreParams, setCentreParams, centreSaved, saveCentre }: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏠 Identité du centre</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "nom", label: "Nom commercial" },
                { key: "legalName", label: "Raison sociale (factures)" },
                { key: "address", label: "Adresse complète" },
                { key: "tel", label: "Téléphone" },
                { key: "email", label: "Email de contact" },
                { key: "website", label: "Site web" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">{label}</label>
                  <input value={(centreParams as any)[key]}
                    onChange={e => setCentreParams(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🧾 Informations légales & bancaires</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "siret", label: "SIRET" },
                { key: "tvaIntra", label: "N° TVA intracommunautaire (si applicable)" },
                { key: "iban", label: "IBAN" },
                { key: "bic", label: "BIC" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">{label}</label>
                  <input value={(centreParams as any)[key]}
                    onChange={e => setCentreParams(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                    placeholder={key === "tvaIntra" ? "FR00 000000000 (optionnel)" : ""} />
                </div>
              ))}
            </div>
            <p className="font-body text-[10px] text-slate-400 mt-3">Ces informations apparaissent sur les factures, bons cadeaux et emails officiels.</p>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🐴 Seuils d'alerte poneys</h3>
            <p className="font-body text-xs text-slate-500 mb-3">Charge journalière au-delà de laquelle une alerte s'affiche dans le Montoir</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "seuilPoneyOrange", label: "Alerte orange (nb séances)", unit: "séances" },
                { key: "seuilPoneyRouge",  label: "Alerte rouge (nb séances)",  unit: "séances" },
                { key: "seuilPoneyHeures", label: "Maximum heures/jour",         unit: "heures" },
              ].map(({ key, label, unit }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="10" value={(centreParams as any)[key]}
                      onChange={e => setCentreParams(prev => ({ ...prev, [key]: parseInt(e.target.value) || 1 }))}
                      className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-xs text-slate-400">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <button onClick={saveCentre}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
            {centreSaved ? "✅ Sauvegardé !" : "Sauvegarder les infos du centre"}
          </button>
        </div>
  );
}
