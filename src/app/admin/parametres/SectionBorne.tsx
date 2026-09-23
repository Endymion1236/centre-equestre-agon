"use client";

/**
 * src/app/admin/parametres/SectionBorne.tsx
 *
 * Le compte de la tablette d'accueil.
 *
 * Sans ce réglage, la borne exige seulement « un compte connecté » : la
 * tablette du hall doit alors porter le compte d'administration du club,
 * c'est-à-dire une session admin posée sur un écran public. Déclarer ici un
 * compte ordinaire, créé exprès pour la tablette, permet de l'y connecter
 * sans lui donner le moindre droit d'administration.
 *
 * Déclarer un compte referme aussi les routes de la borne : elles
 * n'acceptent plus que le personnel et les comptes listés ici.
 */

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { nettoyerComptes, normaliserCompte, DOC_REGLAGE_BORNE } from "@/lib/borne-acces";

export default function SectionBorne() {
  const [comptes, setComptes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    getDoc(doc(db, "settings", DOC_REGLAGE_BORNE))
      .then((snap) => { if (snap.exists()) setComptes(nettoyerComptes((snap.data() as any)?.comptes)); })
      .catch((e) => setErreur(e?.message || "Lecture impossible"))
      .finally(() => setChargement(false));
  }, []);

  const enregistrer = async (liste: string[]) => {
    setEnregistrement(true); setErreur("");
    try {
      await setDoc(doc(db, "settings", DOC_REGLAGE_BORNE), { comptes: liste, updatedAt: serverTimestamp() }, { merge: true });
      setComptes(liste);
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 2500);
    } catch (e: any) {
      setErreur(e?.message || "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  const ajouter = async () => {
    const valeur = normaliserCompte(saisie);
    if (!valeur) return;
    setSaisie("");
    await enregistrer(nettoyerComptes([...comptes, valeur]));
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <h2 className="font-display text-lg font-bold text-blue-800 mb-1">Borne d&apos;accueil — compte de la tablette</h2>
      <p className="font-body text-sm text-slate-600 mb-4">
        La tablette du hall doit être connectée pour que Câlin et le tableau du jour fonctionnent. Déclarez ici le compte créé
        pour elle : elle n&apos;a alors besoin d&apos;aucun droit d&apos;administration, et l&apos;administration lui reste fermée.
      </p>

      <ol className="font-body text-sm text-slate-600 bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-5 pl-8 flex flex-col gap-1">
        <li>Créez un compte ordinaire pour la tablette, depuis l&apos;espace cavalier (par exemple <em>borne@…</em>).</li>
        <li>Saisissez son adresse ci-dessous.</li>
        <li>Connectez la tablette avec ce compte, puis ouvrez la borne.</li>
      </ol>

      {chargement ? (
        <div className="flex items-center gap-2 font-body text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Chargement…</div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 list-none p-0 m-0 mb-4">
            {comptes.length === 0 && (
              <li className="font-body text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Aucun compte déclaré : la borne accepte aujourd&apos;hui n&apos;importe quel compte connecté, et le tableau du jour
                n&apos;est ouvert qu&apos;au personnel.
              </li>
            )}
            {comptes.map((c) => (
              <li key={c} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-body text-sm text-blue-900 truncate">{c}</span>
                <button type="button" onClick={() => void enregistrer(comptes.filter((x) => x !== c))} disabled={enregistrement}
                  className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer disabled:opacity-50" title="Retirer ce compte">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 flex-wrap">
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="borne@centreequestreagon.fr"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ajouter(); } }}
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-blue-500/10 font-body text-sm bg-white" />
            <button type="button" onClick={() => void ajouter()} disabled={enregistrement || !saisie.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
              {enregistrement ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Ajouter
            </button>
            {enregistre && <span className="flex items-center gap-1 font-body text-sm text-green-700"><Check size={15} /> Enregistré</span>}
          </div>
          {erreur && <p className="font-body text-sm text-red-600 mt-2">{erreur}</p>}

          <p className="font-body text-xs text-slate-500 mt-4">
            Le personnel du club (administrateurs et moniteurs) garde toujours l&apos;accès. Dès qu&apos;un compte est déclaré,
            les autres comptes n&apos;ont plus accès ni à Câlin, ni au tableau du jour. Le changement est pris en compte en une minute.
          </p>
        </>
      )}
    </div>
  );
}
