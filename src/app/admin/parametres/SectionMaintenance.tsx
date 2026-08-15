"use client";
/**
 * src/app/admin/parametres/SectionMaintenance.tsx
 *
 * Onglet « Maintenance » : ouverture des réservations en ligne, thème
 * saisonnier du site vitrine, et les outils de purge de la base.
 *
 * Pourquoi séparé : c'est la partie la plus dangereuse de l'écran. Toutes les
 * suppressions sont IRRÉVERSIBLES et écrites en dur ici — la liste des
 * collections vidées, les doubles confirmations, et surtout la règle qui fait
 * la valeur de cet écran : créneaux, familles, cavaliers, cavalerie, activités
 * et paramètres sont TOUJOURS conservés. Vider un créneau signifie vider son
 * tableau `enrolled`, jamais supprimer le créneau.
 *
 * Le suivi pédagogique n'est effacé que si la case dédiée est cochée.
 *
 * Seul l'onglet actif est piloté depuis page.tsx, pour qu'il reste sélectionné
 * quand on quitte la section et qu'on y revient.
 */
import { Card } from "@/components/ui";
import { Trash2, AlertTriangle, Users } from "lucide-react";
import { doc, collection, getDocs, deleteDoc, updateDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ReservationsToggle from "@/components/admin/ReservationsToggle";
import ThemeSaisonnierToggle from "@/components/admin/ThemeSaisonnierToggle";
import type { MaintenanceTab } from "./types";

type Props = {
  maintenanceTab: MaintenanceTab;
  setMaintenanceTab: React.Dispatch<React.SetStateAction<MaintenanceTab>>;
};

export default function SectionMaintenance({ maintenanceTab, setMaintenanceTab }: Props) {
  return (
        <div className="flex flex-col gap-5">

          {/* Ouverture des réservations en ligne */}
          <ReservationsToggle />

          {/* Thème saisonnier du site vitrine */}
          <ThemeSaisonnierToggle />

          {/* Avertissement */}
          <Card padding="md" className="bg-orange-50 border-orange-200">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={20} className="text-orange-500" />
              <div className="font-body text-sm font-semibold text-orange-700">Zone de maintenance</div>
            </div>
            <p className="font-body text-xs text-orange-600">
              Actions irréversibles. Créneaux et familles conservés (structure). Suivi péda effacé si demandé.
            </p>
          </Card>

          {/* Sous-onglets */}
          <div className="flex gap-1 bg-sand rounded-xl p-1">
            {([
              ["nettoyage", "🧹 Nettoyage complet"],
              ["test",      "🧪 Données test"],
              ["historique","📋 Historique cavaliers"],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMaintenanceTab(id)}
                className={`flex-1 font-body text-xs font-semibold px-3 py-2 rounded-lg border-none cursor-pointer transition-all ${
                  maintenanceTab === id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700 bg-transparent"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* ══ ONGLET NETTOYAGE ══ */}
          {maintenanceTab === "nettoyage" && (
            <Card padding="md">
              <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Nettoyer tout sauf créneaux & familles</h3>
              <p className="font-body text-xs text-slate-500 mb-4">
                Supprime toutes les données transactionnelles. Les créneaux restent intacts (structure + planning), les familles et cavaliers aussi.
                Le suivi pédagogique sera effacé si vous cochez l'option en bas.
              </p>

              {/* Grille des collections */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                {[
                  { col: "payments",             label: "Paiements & factures",       icon: "💶", danger: true },
                  { col: "reservations",          label: "Réservations",               icon: "📅", danger: true },
                  { col: "forfaits",              label: "Forfaits annuels",            icon: "📋", danger: true },
                  { col: "avoirs",                label: "Avoirs",                     icon: "🎫", danger: true },
                  { col: "echeances-sepa",        label: "Échéances SEPA",             icon: "🏦", danger: true },
                  { col: "mandats-sepa",          label: "Mandats SEPA",               icon: "📄", danger: true },
                  { col: "remises-sepa",          label: "Remises SEPA",               icon: "📤", danger: true },
                  { col: "encaissements",         label: "Journal encaissements",       icon: "📒", danger: true },
                  { col: "cartes",                label: "Cartes & tickets",            icon: "🎟️", danger: true },
                  { col: "passages",              label: "Passages / présences",       icon: "✅", danger: false },
                  { col: "bonsRecup",             label: "Bons récupération",          icon: "🔄", danger: false },
                  { col: "waitlist",              label: "Liste d'attente",            icon: "⏳", danger: false },
                  { col: "payment_declarations",  label: "Déclarations de paiement",   icon: "📝", danger: false },
                  { col: "remises",               label: "Remises bancaires",          icon: "🏦", danger: false },
                  { col: "rdv_pro",               label: "RDV professionnels",         icon: "📆", danger: false },
                  { col: "emailsReprise",         label: "Emails reprise",             icon: "📧", danger: false },
                ].map(item => (
                  <div key={item.col} className={`flex items-center justify-between px-3 py-2 rounded-lg ${item.danger ? "bg-red-50" : "bg-sand"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <span className="font-body text-sm text-blue-800">{item.label}</span>
                    </div>
                    <button onClick={async () => {
                      if (!confirm(`Supprimer TOUS les documents de "${item.label}" ?\n\nAction irréversible.`)) return;
                      try {
                        const snap = await getDocs(collection(db, item.col));
                        let count = 0;
                        for (const d of snap.docs) { await deleteDoc(doc(db, item.col, d.id)); count++; }
                        alert(`✅ ${count} document(s) supprimé(s) dans "${item.label}".`);
                      } catch (e) { console.error(e); alert("Erreur."); }
                    }} className="font-body text-[10px] text-red-500 bg-white border border-red-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-red-100 border-solid">
                      Vider
                    </button>
                  </div>
                ))}
              </div>

              {/* Vider les inscrits des créneaux */}
              <div className="border-t border-gray-100 pt-4 mb-4 flex flex-col gap-2">
                <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Créneaux — retirer les inscrits</div>
                <button onClick={async () => {
                  if (!confirm("Retirer TOUS les cavaliers inscrits des créneaux ?\n\nLes créneaux restent intacts, seul le tableau 'enrolled' est vidé.\n\nAction irréversible.")) return;
                  try {
                    const snap = await getDocs(collection(db, "creneaux"));
                    let count = 0;
                    for (const d of snap.docs) {
                      const data = d.data();
                      if ((data.enrolled || []).length > 0) {
                        await updateDoc(doc(db, "creneaux", d.id), { enrolled: [], enrolledCount: 0 });
                        count++;
                      }
                    }
                    alert(`✅ Inscriptions vidées sur ${count} créneaux. Les créneaux sont conservés.`);
                  } catch (e) { console.error(e); alert("Erreur."); }
                }} className="flex items-center gap-2 font-body text-sm font-semibold text-orange-700 bg-orange-50 px-4 py-2.5 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100 border-solid">
                  <Users size={15}/> Vider tous les inscrits des créneaux (créneaux conservés)
                </button>
              </div>

              {/* Nettoyage tout en un */}
              <div className="border-t border-gray-100 pt-4">
                <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Tout nettoyer en une fois</div>
                <div className="bg-red-50 rounded-xl p-4 mb-3">
                  <p className="font-body text-xs text-red-700 mb-3">
                    Supprime les 16 collections ci-dessus + vide les inscrits des créneaux.<br/>
                    <strong>Créneaux, familles, cavaliers, cavalerie, activités, paramètres : conservés.</strong>
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input type="checkbox" id="effacerPedaCheck" className="accent-red-500 w-4 h-4"/>
                    <span className="font-body text-sm text-red-700 font-semibold">Effacer aussi le suivi pédagogique des cavaliers</span>
                  </label>
                </div>
                <button onClick={async () => {
                  const effacerPeda = (document.getElementById("effacerPedaCheck") as HTMLInputElement)?.checked;
                  const msg = `⚠️ NETTOYAGE COMPLET\n\nCeci va supprimer :\n- Paiements, réservations, forfaits, avoirs\n- SEPA (mandats, échéances, remises)\n- Encaissements, cartes, passages\n- Bons récup, waitlist, déclarations, RDV pro\n- Inscrits des créneaux (créneaux conservés)${effacerPeda ? "\n- Suivi pédagogique des cavaliers" : ""}\n\nCONSERVÉ : familles, cavaliers, créneaux, cavalerie, activités, paramètres\n\nContinuer ?`;
                  if (!confirm(msg)) return;
                  if (!confirm("DERNIÈRE CONFIRMATION — action irréversible.\n\nConfirmer le nettoyage ?")) return;

                  let total = 0;
                  const cols = ["payments","reservations","forfaits","avoirs","echeances-sepa","mandats-sepa","remises-sepa","encaissements","cartes","passages","bonsRecup","waitlist","payment_declarations","remises","rdv_pro","emailsReprise"];
                  for (const colName of cols) {
                    try {
                      const snap = await getDocs(collection(db, colName));
                      for (const d of snap.docs) { await deleteDoc(doc(db, colName, d.id)); total++; }
                    } catch (e) { console.error(`Erreur sur ${colName}:`, e); }
                  }

                  // Vider les inscrits
                  try {
                    const snap = await getDocs(collection(db, "creneaux"));
                    for (const d of snap.docs) {
                      const data = d.data();
                      if ((data.enrolled || []).length > 0) {
                        await updateDoc(doc(db, "creneaux", d.id), { enrolled: [], enrolledCount: 0 });
                      }
                    }
                  } catch (e) { console.error("Erreur enrolled:", e); }

                  // Effacer le suivi péda si coché
                  if (effacerPeda) {
                    try {
                      const famSnap = await getDocs(collection(db, "families"));
                      for (const fam of famSnap.docs) {
                        const data = fam.data() as any;
                        const children = (data.children || []).map((ch: any) => ({
                          ...ch,
                          peda: { notes: [], lastNote: null },
                        }));
                        await updateDoc(doc(db, "families", fam.id), { children });
                      }
                    } catch (e) { console.error("Erreur péda:", e); }
                  }

                  alert(`✅ Nettoyage terminé : ${total} documents supprimés.\n\nCréneaux, familles et cavalerie intacts.${effacerPeda ? "\nSuivi pédagogique effacé." : ""}`);
                }} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-red-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-red-600">
                  <Trash2 size={16}/> Tout nettoyer (2 confirmations requises)
                </button>
              </div>
            </Card>
          )}

          {/* ══ ONGLET TEST ══ */}
          {maintenanceTab === "test" && (
            <Card padding="md">
              <h3 className="font-body text-base font-semibold text-blue-800 mb-2">🧪 Supprimer les données de test</h3>
              <p className="font-body text-xs text-slate-500 mb-4">
                Supprime uniquement les documents marqués <code className="bg-gray-100 px-1 rounded">_seed: "SEED_2026"</code>.
                Les vraies données ne sont pas affectées.
              </p>
              <button onClick={async () => {
                if (!confirm("Supprimer toutes les données de test (SEED_2026) ?\n\nLes vraies données restent intactes.")) return;
                const cols = ["families","creneaux","payments","encaissements","forfaits","avoirs","cartes","reservations","equides","passages","fidelite","bonsRecup","payment_declarations","waitlist","activities"];
                let total = 0;
                for (const colName of cols) {
                  try {
                    const snap = await getDocs(query(collection(db, colName), where("_seed","==","SEED_2026")));
                    for (const docSnap of snap.docs) { await deleteDoc(docSnap.ref); total++; }
                  } catch(e) { console.error(colName, e); }
                }
                alert(`✅ ${total} documents de test supprimés.`);
              }} className="flex items-center gap-2 font-body text-sm font-semibold text-blue-700 bg-blue-50 px-5 py-2.5 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 border-solid">
                🗑️ Nettoyer les données SEED_2026
              </button>
            </Card>
          )}

          {/* ══ ONGLET HISTORIQUE ══ */}
          {maintenanceTab === "historique" && (
            <Card padding="md">
              <h3 className="font-body text-base font-semibold text-blue-800 mb-2">📋 Historique cavaliers</h3>
              <p className="font-body text-xs text-slate-500 mb-4">
                Efface les notes pédagogiques et/ou l'historique des poneys montés. Les familles et cavaliers restent intacts.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={async () => {
                  if (!confirm("Effacer les notes pédagogiques de TOUS les cavaliers ?\n\nAction irréversible.")) return;
                  const snap = await getDocs(collection(db, "families"));
                  let total = 0;
                  for (const fam of snap.docs) {
                    const data = fam.data() as any;
                    const children = (data.children || []).map((ch: any) => ({
                      ...ch, peda: { ...((ch.peda || {})), notes: [], lastNote: null },
                    }));
                    await updateDoc(doc(db, "families", fam.id), { children });
                    total += (data.children || []).length;
                  }
                  alert(`✅ Notes pédagogiques effacées pour ${total} cavaliers.`);
                }} className="flex items-center gap-2 font-body text-sm font-semibold text-orange-700 bg-orange-50 px-4 py-2.5 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100 border-solid">
                  <Trash2 size={14}/> Effacer les notes pédagogiques
                </button>
                <button onClick={async () => {
                  if (!confirm("Effacer l'historique des poneys montés de TOUS les cavaliers ?\n\nAction irréversible.")) return;
                  const snap = await getDocs(collection(db, "families"));
                  let total = 0;
                  for (const fam of snap.docs) {
                    const data = fam.data() as any;
                    const children = (data.children || []).map((ch: any) => ({
                      ...ch,
                      peda: { ...((ch.peda || {})), notes: ((ch.peda?.notes || []) as any[]).map((n: any) => ({ ...n, horseName: null })) },
                    }));
                    await updateDoc(doc(db, "families", fam.id), { children });
                    total += (data.children || []).length;
                  }
                  alert(`✅ Historique poneys réinitialisé pour ${total} cavaliers.`);
                }} className="flex items-center gap-2 font-body text-sm font-semibold text-orange-700 bg-orange-50 px-4 py-2.5 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100 border-solid">
                  <Trash2 size={14}/> Effacer l'historique des poneys
                </button>
                <button onClick={async () => {
                  if (!confirm("⚠️ Effacer TOUTES les notes péda ET l'historique poneys ?\n\nAction irréversible.")) return;
                  if (!confirm("DERNIÈRE CONFIRMATION — effacer tout l'historique cavaliers ?")) return;
                  const snap = await getDocs(collection(db, "families"));
                  let total = 0;
                  for (const fam of snap.docs) {
                    const data = fam.data() as any;
                    const children = (data.children || []).map((ch: any) => ({ ...ch, peda: { notes: [], lastNote: null } }));
                    await updateDoc(doc(db, "families", fam.id), { children });
                    total += (data.children || []).length;
                  }
                  alert(`✅ Historique complet effacé pour ${total} cavaliers.`);
                }} className="flex items-center gap-2 font-body text-sm font-semibold text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-200 cursor-pointer hover:bg-red-100 border-solid">
                  <Trash2 size={14}/> Tout effacer (notes + poneys)
                </button>
              </div>
            </Card>
          )}

          {/* Données préservées */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">🟢 Toujours préservé</h3>
            <div className="flex flex-wrap gap-2">
              {["Créneaux planning","Familles & cavaliers","Cavalerie (équidés)","Soins vétérinaires","Registre d'élevage","Activités","Paramètres & tarifs"].map(item => (
                <div key={item} className="font-body text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">{item}</div>
              ))}
            </div>
          </Card>
        </div>
  );
}
