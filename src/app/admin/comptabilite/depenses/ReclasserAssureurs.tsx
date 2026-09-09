"use client";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

type Bilan = { reclassees: number; promues: number; dejaOk: number; ignorees: number };

/**
 * Les prélèvements d'assureurs (Allianz, Groupama, Helmet…) passent d'un coup
 * en catégorie « Assurances », sans TVA : une assurance est exonérée et n'a
 * pas de facture mensuelle, le relevé en tient lieu. Les mouvements encore
 * « à classer » deviennent des dépenses, comme si la catégorie avait été
 * choisie à la main sur chaque ligne.
 */
export default function ReclasserAssureurs({ termine, verrouiller }: { termine: () => Promise<void>; verrouiller: (v: boolean) => void }) {
  const [apercu, setApercu] = useState<Bilan | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const url = "/api/admin/depenses/tableau";

  async function appeler(confirme: boolean): Promise<Bilan> {
    const r = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reclasser-assureurs", confirme }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Erreur");
    return d as Bilan;
  }
  async function preparer() {
    setBusy(true); verrouiller(true); setMessage(""); setApercu(null);
    try { setApercu(await appeler(false)); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); verrouiller(false); }
  }
  async function appliquer() {
    if (!apercu || !window.confirm(`Passer ${apercu.reclassees + apercu.promues} ligne(s) d'assureurs en « Assurances », TVA « sans TVA », tous mois confondus ?`)) return;
    setBusy(true); verrouiller(true);
    try {
      const b = await appeler(true);
      setMessage(`${b.reclassees + b.promues} ligne(s) passée(s) en Assurances sans TVA (${b.promues} devenue(s) dépense(s)). Sur chacune, « Utiliser le relevé comme justificatif » ferme le point.`);
    } catch (e) { setMessage(`Arrêt : ${e instanceof Error ? e.message : "Erreur"}. Relancez l’aperçu pour reprendre.`); }
    finally { setApercu(null); try { await termine(); } catch { setMessage(m => m + " Actualisez le tableau."); } setBusy(false); verrouiller(false); }
  }
  return <details className="border rounded p-3"><summary>Assureurs (Allianz, Groupama, Helmet…) → Assurances, sans TVA</summary>
    <p>Reconnaît les prélèvements d’assureurs sur tous les mois, les range en « Assurances » et pose « Sans TVA ». Une assurance est exonérée de TVA et n’émet pas de facture mensuelle : le relevé en tient lieu, rien à réclamer.</p>
    <button disabled={busy} className="underline" onClick={() => void preparer()}>Prévisualiser</button>
    {apercu && <><p>{apercu.reclassees} dépense(s) à reclasser, {apercu.promues} mouvement(s) « à classer » à passer en dépense, {apercu.dejaOk} déjà en ordre{apercu.ignorees ? `, ${apercu.ignorees} ignorée(s) (personnelles ou archivées)` : ""}.</p>
      <button disabled={busy || apercu.reclassees + apercu.promues === 0} className="border rounded p-2" onClick={() => void appliquer()}>Appliquer</button></>}
    <p role="status">{message}</p></details>;
}
