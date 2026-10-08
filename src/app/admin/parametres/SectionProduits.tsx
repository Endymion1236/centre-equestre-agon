"use client";

/**
 * src/app/admin/parametres/SectionProduits.tsx
 *
 * Les produits qui ne sont pas des activités (tapis, licence découverte,
 * assurance…), créés par le club. Chacun a son prix, sa TVA et son compte,
 * choisi dans le plan comptable du cabinet : il apparaît ensuite en bouton
 * dans Encaisser et dans la modification d'une commande. Licence FFE et
 * adhésion y sont déjà, au prix de l'onglet Inscription.
 *
 * Retirer un produit ne touche pas aux factures déjà émises : leurs lignes
 * gardent leur compte.
 */

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PLAN_COMPTABLE } from "@/lib/ventilation-comptable";
import { erreurProduit, nettoyerCatalogue, TAUX_TVA_PRODUIT, type ProduitCatalogue } from "@/lib/produits-annexes";

const VIDE = { label: "", priceTTC: "", tva: "", compteComptable: "" };
const champ = "w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white";
const tvaFr = (t: number) => `${String(t).replace(".", ",")} %`;

export default function SectionProduits() {
  const [produits, setProduits] = useState<ProduitCatalogue[] | null>(null);
  const [saisie, setSaisie] = useState<typeof VIDE>(VIDE);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "produits"))
      .then(s => setProduits(nettoyerCatalogue(s.exists() ? (s.data() as any).produits : [])))
      .catch(() => setProduits([]));
  }, []);

  const enregistrer = async (liste: ProduitCatalogue[], texte: string) => {
    setBusy(true); setMessage("");
    try {
      await setDoc(doc(db, "settings", "produits"), { produits: liste, updatedAt: serverTimestamp() });
      setProduits(liste); setMessage(texte);
    } catch (e: any) { setMessage(`Enregistrement impossible : ${e?.message || e}`); }
    setBusy(false);
  };

  const valider = async () => {
    if (!produits) return;
    const p: ProduitCatalogue = {
      id: enEdition || `p${Date.now().toString(36)}`,
      label: saisie.label.trim(),
      priceTTC: Math.round((Number(saisie.priceTTC.replace(",", ".")) || 0) * 100) / 100,
      tva: Number(saisie.tva),
      compteComptable: saisie.compteComptable,
      actif: enEdition ? (produits.find(x => x.id === enEdition)?.actif ?? true) : true,
    };
    const erreur = saisie.tva === "" ? "Choisissez un taux de TVA." : erreurProduit(p);
    if (erreur) { setMessage(erreur); return; }
    const liste = enEdition ? produits.map(x => x.id === enEdition ? p : x) : [...produits, p];
    await enregistrer(liste, enEdition ? `« ${p.label} » modifié.` : `« ${p.label} » ajouté : il apparaît dans Encaisser et dans la modification des commandes.`);
    setSaisie(VIDE); setEnEdition(null);
  };

  const choisirCompte = (code: string) => {
    const c = PLAN_COMPTABLE.find(x => x.code === code);
    // La TVA habituelle du compte est proposée ; elle reste modifiable.
    setSaisie(s => ({ ...s, compteComptable: code, tva: s.tva === "" && c ? String(c.tva) : s.tva }));
  };

  if (!produits) return <div className="font-body text-sm text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <h2 className="font-display text-lg text-blue-800">Produits hors activités</h2>
        <p className="font-body text-sm text-slate-600">
          Créez ici ce que vous vendez en dehors des activités (matériel, assurance, frais de dossier…). Chaque produit apparaît
          en bouton dans <b>Encaisser</b> et dans la <b>modification d'une commande</b>, avec son prix, sa TVA et son compte.
          Licence FFE et adhésion y sont déjà, au prix de l'onglet Inscription.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="font-body text-xs text-slate-500">Nom du produit
            <input className={champ} value={saisie.label} maxLength={80} onChange={e => setSaisie(s => ({ ...s, label: e.target.value }))} placeholder="Ex. Tapis de selle club" />
          </label>
          <label className="font-body text-xs text-slate-500">Prix TTC (€)
            <input className={champ} inputMode="decimal" value={saisie.priceTTC} onChange={e => setSaisie(s => ({ ...s, priceTTC: e.target.value }))} placeholder="35,00" />
          </label>
          <label className="font-body text-xs text-slate-500">Compte comptable (plan du cabinet)
            <select className={champ} value={saisie.compteComptable} onChange={e => choisirCompte(e.target.value)}>
              <option value="">Choisir le compte</option>
              {PLAN_COMPTABLE.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label} (TVA habituelle {tvaFr(c.tva)})</option>)}
            </select>
          </label>
          <label className="font-body text-xs text-slate-500">TVA
            <select className={champ} value={saisie.tva} onChange={e => setSaisie(s => ({ ...s, tva: e.target.value }))}>
              <option value="">Choisir le taux</option>
              {TAUX_TVA_PRODUIT.map(t => <option key={t} value={String(t)}>{tvaFr(t)}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void valider()}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
            {enEdition ? "Enregistrer la modification" : "+ Ajouter le produit"}
          </button>
          {enEdition && <button type="button" onClick={() => { setEnEdition(null); setSaisie(VIDE); setMessage(""); }}
            className="px-4 py-2 rounded-lg bg-gray-100 text-slate-600 font-body text-sm border-none cursor-pointer">Annuler</button>}
        </div>
        {message && <p className="font-body text-sm text-blue-800">{message}</p>}
        <p className="font-body text-[11px] text-slate-400">Un doute sur le compte ou la TVA ? Demandez à votre cabinet avant de vendre le produit : le compte part tel quel dans le FEC.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Vos produits ({produits.length})</div>
        {produits.length === 0 && <p className="font-body text-sm text-slate-400">Aucun produit pour l'instant.</p>}
        <div className="flex flex-col gap-2">
          {produits.map(p => (
            <div key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${p.actif ? "bg-gray-50" : "bg-gray-50 opacity-50"}`}>
              <div className="font-body text-sm min-w-0">
                <b className="text-blue-800">{p.label}</b> · {p.priceTTC.toFixed(2).replace(".", ",")} € · TVA {tvaFr(p.tva)}
                <div className="text-[11px] text-slate-500">Compte {p.compteComptable} — {PLAN_COMPTABLE.find(c => c.code === p.compteComptable)?.label}{p.actif ? "" : " · masqué"}</div>
              </div>
              <div className="flex gap-2 font-body text-xs">
                <button type="button" disabled={busy} className="underline bg-transparent border-none cursor-pointer text-blue-600"
                  onClick={() => { setEnEdition(p.id); setSaisie({ label: p.label, priceTTC: String(p.priceTTC).replace(".", ","), tva: String(p.tva), compteComptable: p.compteComptable }); setMessage(""); }}>Modifier</button>
                <button type="button" disabled={busy} className="underline bg-transparent border-none cursor-pointer text-slate-600"
                  onClick={() => void enregistrer(produits.map(x => x.id === p.id ? { ...x, actif: !x.actif } : x), p.actif ? `« ${p.label} » masqué des boutons.` : `« ${p.label} » de nouveau proposé.`)}>{p.actif ? "Masquer" : "Réafficher"}</button>
                <button type="button" disabled={busy} className="underline bg-transparent border-none cursor-pointer text-red-500"
                  onClick={() => { if (confirm(`Retirer « ${p.label} » du catalogue ?\n\nLes factures déjà émises gardent leurs lignes et leur compte.`)) void enregistrer(produits.filter(x => x.id !== p.id), `« ${p.label} » retiré.`); }}>Retirer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
