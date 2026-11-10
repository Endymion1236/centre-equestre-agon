"use client";
/**
 * La CA3 déposée par le cabinet, saisie trimestre par trimestre, face au
 * calcul de l'application (lib/tva-declaree, route api/admin/tva/cabinet).
 * Le dernier calcul est enregistré avec la saisie : la veille signale un
 * écart important tant qu'il n'est pas noté comme expliqué.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { ResultatDeclarationTva } from "@/lib/declaration-tva";
import { CHAMPS_DECLARES, cleTrimestre, comparerDeclaration, lireSaisie, montantsApplication, syntheseComparaison, type MontantsTva } from "@/lib/tva-declaree";

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export default function ComparaisonCabinetTva({ moisReference, libelle, calcul, base, credit, setCredit }: {
  moisReference: string; libelle: string; calcul: ResultatDeclarationTva; base: "encaissements" | "factures";
  credit: string; setCredit: (v: string) => void;
}) {
  const id = cleTrimestre(moisReference);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [explication, setExplication] = useState("");
  const [enregistre, setEnregistre] = useState<{ cabinet: MontantsTva; ecartsImportants?: number; application?: MontantsTva } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<string | null>(null);
  const chargeId = useRef<string | null>(null);

  useEffect(() => {
    let actif = true;
    chargeId.current = null;
    setEnregistre(null); setSaisie({}); setExplication(""); setEtat(null);
    authFetch(`/api/admin/tva/cabinet?id=${id}`).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!actif) return;
      const d = data?.declaration;
      chargeId.current = id;
      if (!d) { setOuvert(false); return; }
      setEnregistre(d);
      setExplication(d.ecartExplique || "");
      setSaisie(Object.fromEntries(Object.entries(d.cabinet || {}).map(([k, v]) => [k, String(v)])));
      if (!credit && Number(d.cabinet?.creditAnterieur) > 0) setCredit(String(d.cabinet.creditAnterieur));
    }).catch(() => { chargeId.current = id; });
    return () => { actif = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const application = useMemo(() => montantsApplication(calcul), [calcul]);
  const cabinet = useMemo(() => lireSaisie(saisie), [saisie]);
  const lignes = useMemo(() => comparerDeclaration(ouvert || !enregistre ? cabinet : enregistre.cabinet, application), [ouvert, enregistre, cabinet, application]);

  const envoyer = async (montants: MontantsTva, note: string) => {
    const res = await authFetch("/api/admin/tva/cabinet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, libelle, cabinet: montants, application, base, ecartExplique: note }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `erreur ${res.status}`);
    return data;
  };

  // Le calcul de l'application a bougé depuis l'enregistrement (pièce ajoutée,
  // correction) : la photo enregistrée est remise à jour, pour la veille.
  useEffect(() => {
    if (!enregistre || chargeId.current !== id) return;
    const n = comparerDeclaration(enregistre.cabinet, application).filter((l) => l.important).length;
    const meme = JSON.stringify(enregistre.application || {}) === JSON.stringify(application);
    if (meme && n === (enregistre.ecartsImportants || 0)) return;
    envoyer(enregistre.cabinet, explication).then(() => setEnregistre({ ...enregistre, application, ecartsImportants: n })).catch(console.error);
  }, [application]); // eslint-disable-line react-hooks/exhaustive-deps

  const enregistrer = async () => {
    setEtat("Enregistrement…");
    try {
      if (Number(cabinet.creditAnterieur || 0) !== Number(String(credit).replace(",", ".") || 0)) setCredit(cabinet.creditAnterieur ? String(cabinet.creditAnterieur) : "");
      const data = await envoyer(cabinet, explication);
      setEnregistre({ cabinet, application, ecartsImportants: data.ecartsImportants });
      setOuvert(false);
      setEtat("✅ Enregistré.");
    } catch (e: any) { setEtat(`Erreur : ${e?.message || e}`); }
  };

  const imp = lignes.filter((l) => l.important).length;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="font-body text-sm font-semibold text-blue-800">Déclaration déposée par le cabinet — {libelle}</div>
        <button type="button" onClick={() => setOuvert(!ouvert)}
          className="font-body text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 cursor-pointer hover:bg-blue-50">
          {ouvert ? "Fermer" : enregistre ? "Modifier les montants" : "Saisir la déclaration du cabinet"}
        </button>
      </div>
      {!enregistre && !ouvert && (
        <p className="font-body text-xs text-slate-500 mt-1">Reportez les montants de la CA3 envoyée par la comptable : l&apos;écart avec ce calcul s&apos;affiche ligne par ligne.</p>
      )}

      {ouvert && (
        <div className="mt-2 bg-slate-50 rounded-lg p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHAMPS_DECLARES.map((c) => (
              <label key={c.cle} className="font-body text-[11px] text-slate-600">
                <span className="font-semibold text-blue-700">{c.code}</span> {c.libelle}
                <input value={saisie[c.cle] ?? ""} inputMode="decimal" placeholder="—"
                  onChange={(e) => setSaisie({ ...saisie, [c.cle]: e.target.value })}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 font-body text-sm text-right bg-white" />
              </label>
            ))}
          </div>
          <p className="font-body text-[10px] text-slate-500 mt-2">Montants entiers, comme sur la déclaration. Case vide = non renseignée (pas comparée). Le crédit reporté (22) est repris dans le calcul ci-dessus.</p>
          <button type="button" onClick={enregistrer}
            className="mt-2 font-body text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 text-white border-none cursor-pointer">Enregistrer</button>
        </div>
      )}

      {lignes.length > 0 && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full font-body text-xs min-w-[420px]">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="font-semibold py-1 w-10">Ligne</th>
                  <th className="font-semibold">Libellé</th>
                  <th className="font-semibold text-right">Cabinet</th>
                  <th className="font-semibold text-right">Application</th>
                  <th className="font-semibold text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.code} className={`border-t border-gray-100 ${l.important ? "bg-amber-50 text-amber-900 font-semibold" : "text-slate-700"}`}>
                    <td className="py-1.5 font-semibold text-blue-700">{l.code}</td>
                    <td>{l.libelle}</td>
                    <td className="text-right">{eur(l.cabinet)}</td>
                    <td className="text-right">{eur(l.application)}</td>
                    <td className="text-right">{l.ecart > 0 ? "+" : ""}{eur(l.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`font-body text-xs mt-2 ${imp ? "text-amber-800" : "text-green-700"}`}>{syntheseComparaison(lignes)}</p>
          {enregistre && imp > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={explication} onChange={(e) => setExplication(e.target.value)}
                placeholder="Écart expliqué ? (ex. factures d'août arrivées après le dépôt)"
                className="flex-1 min-w-[220px] px-2 py-1.5 rounded-lg border border-slate-200 font-body text-xs" />
              <button type="button" onClick={async () => { try { await envoyer(enregistre.cabinet, explication); setEtat(explication.trim() ? "✅ Explication notée : la veille ne le signale plus." : "✅ Enregistré."); } catch (e: any) { setEtat(`Erreur : ${e?.message || e}`); } }}
                className="font-body text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-blue-700 border border-blue-200 cursor-pointer">Noter l&apos;explication</button>
            </div>
          )}
        </>
      )}
      {etat && <p className="font-body text-[11px] text-slate-500 mt-1">{etat}</p>}
    </div>
  );
}
