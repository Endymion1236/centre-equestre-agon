"use client";
/**
 * src/app/admin/parametres/SectionsSimples.tsx
 *
 * Les trois onglets les plus courts de la page : Annulation, Plan comptable et
 * Horaires. Regroupés dans un seul fichier justement parce qu'ils tiennent en
 * quelques lignes chacun — un fichier par section n'apporterait rien ici.
 *
 * À savoir sur ces trois écrans :
 *  - Annulation : les deux champs sont bien enregistrés (objet `cancellation`
 *    du document `settings/degressivite`), mais le « Mode de remboursement »
 *    est une liste déroulante d'affichage, sans état ni sauvegarde.
 *  - Plan comptable : lecture seule, alimenté par la liste importée de Celeris.
 *  - Horaires : champs en `defaultValue`, non reliés à un état — le bouton
 *    Enregistrer sauvegarde la dégressivité, pas les horaires.
 * Comportement d'origine conservé tel quel.
 */
import { Card, Badge } from "@/components/ui";
import { Save, Plus } from "lucide-react";
import { defaultAccounts, inputCls } from "./constantes";
import type { Cancellation } from "./types";

export function SectionAnnulation({ cancellation, setCancellation, handleSave }: {
  cancellation: Cancellation;
  setCancellation: React.Dispatch<React.SetStateAction<Cancellation>>;
  handleSave: () => void;
}) {
  return (
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
  );
}

export function SectionPlanComptable() {
  return (
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
  );
}

export function SectionHoraires({ handleSave }: { handleSave: () => void }) {
  return (
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
  );
}
