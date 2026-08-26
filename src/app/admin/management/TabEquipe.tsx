"use client";
import { useState } from "react";
import { updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Pencil, Trash2, Check, X, ExternalLink, RefreshCw, BookUser, FolderLock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { TYPES_CONTRAT, type Salarie, type TypeContrat } from "./types";
import DocsSalarie from "./DocsSalarie";
import Link from "next/link";

interface Props { salaries: Salarie[]; onRefresh: () => void; }

const COULEURS = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151","#065f46","#92400e"];

export default function TabEquipe({ salaries, onRefresh }: Props) {
  const { toast } = useToast();
  // Documents personnels + dossier interne : réservés à l'admin. La page
  // Équipe est ouverte aux moniteurs, mais ces boutons ne doivent même pas
  // leur apparaître (les rules Firestore les bloquent de toute façon).
  const { isAdmin } = useAuth();
  const [editId, setEditId] = useState<string | null>(null);
  const [couleur, setCouleur] = useState(COULEURS[0]);
  // Fiche registre en cours d'édition (registre unique du personnel)
  const [regId, setRegId] = useState<string | null>(null);
  const [reg, setReg] = useState({ prenom: "", nomFamille: "", dateEntree: "", dateSortie: "", typeContrat: "" as TypeContrat | "", emploi: "", heures: "" });
  const [regSaving, setRegSaving] = useState(false);
  // Coffre à documents (fiches de paie, attestations…) ouvert pour ce salarié
  const [docsId, setDocsId] = useState<string | null>(null);

  const startEdit = (s: Salarie) => { setEditId(s.id); setCouleur(s.couleur); setRegId(null); setDocsId(null); };
  const cancel = () => { setEditId(null); };

  const startRegistre = (s: Salarie) => {
    setEditId(null);
    setDocsId(null);
    setRegId(s.id);
    setReg({
      prenom: s.prenom || "", nomFamille: s.nomFamille || "",
      dateEntree: s.dateEntree || "", dateSortie: s.dateSortie || "",
      typeContrat: s.typeContrat || "", emploi: s.emploi || "",
      heures: s.heuresContratSemaine != null ? String(s.heuresContratSemaine) : "",
    });
  };

  const saveRegistre = async (id: string) => {
    if (regSaving) return;
    setRegSaving(true);
    try {
      await updateDoc(doc(db, "salaries-management", id), {
        prenom: reg.prenom.trim(), nomFamille: reg.nomFamille.trim(),
        dateEntree: reg.dateEntree, dateSortie: reg.dateSortie,
        typeContrat: reg.typeContrat || null, emploi: reg.emploi.trim(),
        ...(reg.heures.trim() !== "" && Number.isFinite(parseFloat(reg.heures.replace(",", ".")))
          ? { heuresContratSemaine: parseFloat(reg.heures.replace(",", ".")) } : {}),
        updatedAt: serverTimestamp(),
      });
      toast("Fiche registre enregistrée", "success");
      setRegId(null);
      onRefresh();
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    } finally {
      setRegSaving(false);
    }
  };

  // Réembauche d'un saisonnier : le registre exige une ligne PAR embauche —
  // on n'écrase jamais les anciennes dates. La période terminée est archivée
  // dans periodesPrecedentes, puis les dates repartent vierges pour la
  // nouvelle saison (contrat et emploi sont gardés, c'est souvent les mêmes).
  const nouvellePeriode = async (s: Salarie) => {
    if (!s.dateEntree || !s.dateSortie) return;
    if (!confirm(`${s.nom} revient ? La période ${new Date(s.dateEntree + "T12:00:00").toLocaleDateString("fr-FR")} → ${new Date(s.dateSortie + "T12:00:00").toLocaleDateString("fr-FR")} sera archivée au registre, et tu saisiras les dates de la nouvelle.`)) return;
    if (regSaving) return;
    setRegSaving(true);
    try {
      await updateDoc(doc(db, "salaries-management", s.id), {
        periodesPrecedentes: [
          ...(s.periodesPrecedentes || []),
          { dateEntree: s.dateEntree, dateSortie: s.dateSortie, typeContrat: s.typeContrat || null, emploi: s.emploi || "" },
        ],
        dateEntree: "", dateSortie: "",
        updatedAt: serverTimestamp(),
      });
      toast("Période archivée — saisis les dates de la nouvelle", "success");
      setReg(r => ({ ...r, dateEntree: "", dateSortie: "" }));
      onRefresh();
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    } finally {
      setRegSaving(false);
    }
  };

  const saveCouleur = async (id: string) => {
    await updateDoc(doc(db, "salaries-management", id), { couleur, updatedAt: serverTimestamp() });
    toast("Couleur modifiée", "success");
    setEditId(null);
    onRefresh();
  };

  const toggleActif = async (s: Salarie) => {
    await updateDoc(doc(db, "salaries-management", s.id), { actif: !s.actif, updatedAt: serverTimestamp() });
    onRefresh();
  };

  const del = async (s: Salarie) => {
    if (!confirm(`Supprimer ${s.nom} du planning management ?\n\nCela ne supprime pas le moniteur dans les paramètres.`)) return;
    await deleteDoc(doc(db, "salaries-management", s.id));
    onRefresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-body text-sm text-slate-500">{salaries.filter(s => s.actif).length} salarié(s) actif(s)</p>
          <p className="font-body text-[10px] text-slate-400">
            Synchronisés depuis Paramètres → Moniteurs. Ajoutez vos moniteurs dans les paramètres.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
            <RefreshCw size={13} /> Synchroniser
          </button>
          <Link href="/admin/management/registre-personnel"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg no-underline hover:bg-purple-100">
            <BookUser size={13} /> Registre du personnel
          </Link>
          <Link href="/admin/parametres"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg no-underline hover:bg-blue-400">
            <ExternalLink size={13} /> Gérer les moniteurs
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {salaries.map(s => (
          <div key={s.id}>
            {editId === s.id ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-body text-sm font-semibold text-blue-800">{s.nom} — changer la couleur</div>
                <div className="flex flex-wrap gap-2">
                  {COULEURS.map(c => (
                    <button key={c} onClick={() => setCouleur(c)}
                      className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${couleur === c ? "border-blue-500 scale-125" : "border-white"}`}
                      style={{ background: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveCouleur(s.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
                    <Check size={14} /> Valider
                  </button>
                  <button onClick={cancel}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">
                    <X size={14} /> Annuler
                  </button>
                </div>
              </div>
            ) : docsId === s.id && isAdmin ? (
              <DocsSalarie salarie={s} onClose={() => setDocsId(null)} />
            ) : regId === s.id ? (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-body text-sm font-semibold text-purple-900 flex items-center gap-2">
                  <BookUser size={15} /> {s.nom} — fiche du registre du personnel
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-body text-xs">
                  <label className="flex flex-col gap-1 text-slate-600">Prénom
                    <input value={reg.prenom} onChange={e => setReg({ ...reg, prenom: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Nom
                    <input value={reg.nomFamille} onChange={e => setReg({ ...reg, nomFamille: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Emploi
                    <input value={reg.emploi} onChange={e => setReg({ ...reg, emploi: e.target.value })}
                      placeholder="monitrice, palefrenier…" className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Date d&apos;entrée
                    <input type="date" value={reg.dateEntree} onChange={e => setReg({ ...reg, dateEntree: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Date de sortie
                    <input type="date" value={reg.dateSortie} onChange={e => setReg({ ...reg, dateSortie: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Type de contrat
                    <select value={reg.typeContrat} onChange={e => setReg({ ...reg, typeContrat: e.target.value as TypeContrat })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                      <option value="">—</option>
                      {TYPES_CONTRAT.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Heures / semaine
                    <input value={reg.heures} inputMode="decimal" onChange={e => setReg({ ...reg, heures: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white w-24" />
                  </label>
                </div>
                {(s.periodesPrecedentes || []).length > 0 && (
                  <div className="font-body text-[11px] text-slate-500 bg-white/70 border border-purple-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-purple-800">Périodes précédentes (au registre) : </span>
                    {(s.periodesPrecedentes || []).map((p, i) => (
                      <span key={i}>
                        {i > 0 ? " · " : ""}
                        {new Date(p.dateEntree + "T12:00:00").toLocaleDateString("fr-FR")} → {new Date(p.dateSortie + "T12:00:00").toLocaleDateString("fr-FR")}
                        {p.typeContrat ? ` (${p.typeContrat})` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {s.dateEntree && s.dateSortie && (
                    <button onClick={() => nouvellePeriode(s)} disabled={regSaving}
                      title="Saisonnier qui revient : archive la période terminée au registre et rouvre les dates"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-purple-700 bg-white border border-purple-300 cursor-pointer hover:bg-purple-100 disabled:opacity-50">
                      ↻ Nouvelle période (réembauche)
                    </button>
                  )}
                  <button onClick={() => saveRegistre(s.id)} disabled={regSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-purple-600 border-none cursor-pointer hover:bg-purple-700 disabled:opacity-50">
                    <Check size={14} /> {regSaving ? "…" : "Enregistrer"}
                  </button>
                  <button onClick={() => setRegId(null)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-white border border-gray-200 cursor-pointer">
                    <X size={14} /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${s.actif ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-body text-sm font-bold flex-shrink-0" style={{ background: s.couleur }}>
                  {s.nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-body text-sm font-semibold text-blue-800">{s.nom}</span>
                  {(s as any).role && <span className="font-body text-xs text-slate-400 ml-2">{(s as any).role}</span>}
                  <div className="font-body text-[11px] text-slate-400">
                    {s.typeContrat ? `${s.typeContrat} · ` : ""}
                    {s.heuresContratSemaine != null ? `${s.heuresContratSemaine} h/sem · ` : ""}
                    {s.dateEntree ? `entré(e) le ${new Date(s.dateEntree + "T12:00:00").toLocaleDateString("fr-FR")}` : "fiche registre à compléter"}
                    {s.dateSortie ? ` · sorti(e) le ${new Date(s.dateSortie + "T12:00:00").toLocaleDateString("fr-FR")}` : ""}
                    {(s.periodesPrecedentes || []).length > 0 ? ` · ${(s.periodesPrecedentes || []).length} période(s) précédente(s)` : ""}
                  </div>
                </div>
                {!s.actif && <span className="font-body text-xs text-slate-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactif</span>}
                <div className="flex gap-1">
                  <button onClick={() => toggleActif(s)}
                    className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${s.actif ? "bg-green-50 text-green-600 hover:bg-orange-50 hover:text-orange-600" : "bg-orange-50 text-orange-600 hover:bg-green-50 hover:text-green-600"}`}>
                    {s.actif ? "Actif" : "Inactif"}
                  </button>
                  <button onClick={() => startRegistre(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-purple-50 hover:text-purple-600" title="Fiche registre (contrat, dates, heures)">
                    <BookUser size={13} />
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setEditId(null); setRegId(null); setDocsId(s.id); }} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-sky-50 hover:text-sky-600" title="Documents personnels (fiches de paie, attestations…)">
                      <FolderLock size={13} />
                    </button>
                  )}
                  <button onClick={() => startEdit(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500" title="Changer la couleur">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => del(s)} className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Retirer du planning">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {salaries.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-body text-sm text-slate-500 mb-2">Aucun salarié dans le planning.</p>
          <p className="font-body text-xs text-slate-400 mb-4">
            Ajoutez des moniteurs dans Paramètres → Moniteurs, ils apparaîtront automatiquement ici.
          </p>
          <Link href="/admin/parametres"
            className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-5 py-2.5 rounded-xl no-underline hover:bg-blue-100">
            Aller dans les paramètres →
          </Link>
        </div>
      )}
    </div>
  );
}
