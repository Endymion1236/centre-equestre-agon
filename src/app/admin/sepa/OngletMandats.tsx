"use client";

/**
 * src/app/admin/sepa/OngletMandats.tsx
 *
 * Onglet « Mandats » : le formulaire de création d'un mandat, la liste des
 * mandats signés et le rappel des coordonnées du créancier.
 *
 * Pourquoi séparé : c'est l'écran de SAISIE des coordonnées bancaires d'une
 * famille. Il a sa propre logique de champ (auto-détection du BIC pendant la
 * frappe de l'IBAN, reprise du nom du parent comme titulaire) qui n'a rien à
 * voir avec l'échéancier ou les remises, et qui gagne à être lue seule.
 *
 * Le composant n'écrit rien lui-même : il reçoit les handlers déjà câblés par
 * la page, qui reste seule responsable du chargement et du rafraîchissement.
 *
 * Le bloc « Configuration créancier » est volontairement affiché en clair :
 * l'admin le recopie régulièrement dans les échanges avec la banque, et l'ICS
 * doit correspondre exactement à celui qui part dans le fichier XML.
 */

import { Card, Badge } from "@/components/ui";
import { SEPA_CREDITOR } from "@/lib/sepa";
import { formatIban } from "@/lib/sepa-validation";
import type { Family } from "@/types";
import { Plus, Save, Loader2, Building2, Trash2 } from "lucide-react";
import { lookupBic } from "./bic";
import type { EcheanceSepa, MandatSepa, SaisieMandat } from "./types";

interface OngletMandatsProps {
  search: string;
  filteredMandats: MandatSepa[];
  echeances: EcheanceSepa[];
  families: (Family & { firestoreId: string })[];
  showNewMandat: boolean;
  setShowNewMandat: (v: boolean) => void;
  newMandat: SaisieMandat;
  setNewMandat: (v: SaisieMandat) => void;
  saving: boolean;
  handleCreateMandat: () => void;
  handleDeleteMandat: (id: string) => void;
  ouvrirEcheancierPourMandat: (mandatDocId: string) => void;
}

export function OngletMandats({
  search, filteredMandats, echeances, families,
  showNewMandat, setShowNewMandat, newMandat, setNewMandat,
  saving, handleCreateMandat, handleDeleteMandat, ouvrirEcheancierPourMandat,
}: OngletMandatsProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="font-body text-sm text-gray-400">Mandats de prélèvement SEPA signés par les familles</div>
        <button onClick={() => setShowNewMandat(!showNewMandat)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau mandat
        </button>
      </div>

      {/* Formulaire nouveau mandat */}
      {showNewMandat && (
        <Card padding="md" className="mb-5 border-2 border-blue-500/20">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Nouveau mandat SEPA</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Famille</label>
              <select value={newMandat.familyId} onChange={e => {
                const fam = families.find(f => f.firestoreId === e.target.value);
                setNewMandat({ ...newMandat, familyId: e.target.value, titulaire: fam?.parentName || newMandat.titulaire });
              }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                <option value="">Choisir...</option>
                {families.sort((a, b) => (a.parentName || "").localeCompare(b.parentName || "")).map(f => (
                  <option key={f.firestoreId} value={f.firestoreId}>{f.parentName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Titulaire du compte</label>
              <input value={newMandat.titulaire} onChange={e => setNewMandat({ ...newMandat, titulaire: e.target.value })}
                placeholder="Nom sur le compte bancaire"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Libellé <span className="text-gray-300 font-normal">(pour distinguer 2 mandats — ex : Père, Mère)</span></label>
              <input value={newMandat.libelle} onChange={e => setNewMandat({ ...newMandat, libelle: e.target.value })}
                placeholder="Père / Mère / Compte principal…"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">IBAN</label>
              <input value={newMandat.iban} onChange={e => {
                const iban = e.target.value.replace(/\s/g, "").toUpperCase();
                const bic = lookupBic(iban);
                setNewMandat({ ...newMandat, iban, bic: bic || newMandat.bic });
              }}
                placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm font-mono" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">BIC {newMandat.bic && <span className="text-green-500">(auto-détecté)</span>}</label>
              <input value={newMandat.bic} onChange={e => setNewMandat({ ...newMandat, bic: e.target.value })}
                placeholder="AGRIFRPP866"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm font-mono" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Date de signature</label>
              <input type="date" value={newMandat.dateSignature} onChange={e => setNewMandat({ ...newMandat, dateSignature: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateMandat} disabled={saving || !newMandat.familyId || !newMandat.iban}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
            </button>
            <button onClick={() => setShowNewMandat(false)} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {/* Liste des mandats */}
      {filteredMandats.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-500">{search ? "Aucun mandat trouvé." : "Aucun mandat SEPA enregistré."}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredMandats.map(m => {
            const echCount = echeances.filter(e => e.mandatId === m.mandatId).length;
            const echPending = echeances.filter(e => e.mandatId === m.mandatId && e.status === "pending").length;
            return (
              <Card key={m.id} padding="md">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Building2 size={18} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{m.familyName}</div>
                      <div className="font-body text-xs text-gray-500 mt-0.5">
                        Titulaire : {m.titulaire}{m.libelle ? ` · ${m.libelle}` : ""} · Mandat : <span className="font-mono text-blue-500">{m.mandatId}</span>
                      </div>
                      <div className="font-body text-xs text-gray-400 mt-0.5 font-mono">
                        IBAN : {formatIban(m.iban)} · BIC : {m.bic}
                      </div>
                      <div className="font-body text-xs text-gray-400 mt-0.5">
                        Signé le {new Date(m.dateSignature).toLocaleDateString("fr-FR")}
                        {echCount > 0 && <span className="ml-2">· {echPending} échéance{echPending > 1 ? "s" : ""} en attente sur {echCount}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={m.status === "active" ? "green" : "gray"}>{m.status === "active" ? "Actif" : "Révoqué"}</Badge>
                    <button onClick={() => ouvrirEcheancierPourMandat(m.id)}
                      className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                      + Échéancier
                    </button>
                    <button onClick={() => handleDeleteMandat(m.id)}
                      className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Config créancier */}
      <Card padding="md" className="mt-6 bg-blue-50/50 border-blue-500/10">
        <h3 className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration créancier SEPA</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-body text-sm text-gray-600">
          <div><span className="text-gray-400">Créancier :</span> {SEPA_CREDITOR.name}</div>
          <div><span className="text-gray-400">ICS :</span> <span className="font-mono">{SEPA_CREDITOR.ics}</span></div>
          <div><span className="text-gray-400">IBAN :</span> <span className="font-mono">{formatIban(SEPA_CREDITOR.iban)}</span></div>
          <div><span className="text-gray-400">BIC :</span> <span className="font-mono">{SEPA_CREDITOR.bic}</span></div>
        </div>
      </Card>
    </div>
  );
}
