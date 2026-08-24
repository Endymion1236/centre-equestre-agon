"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { ClipboardCheck, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Boucler le mois — la checklist qui réunit les rituels de fin de mois.
 *
 * Les données vivent sur quatre écrans (trésorerie, masse salariale, dépenses,
 * résultat) ; ici on répond à UNE question : « ce mois est-il bouclé ? ».
 * Chaque point vérifie que la donnée est là, et le rapprochement banque ↔
 * caisse compare les encaissements clients lus sur le relevé au CA de la
 * caisse — le contrôle qu'un comptable ferait, automatisé.
 *
 * Cas assumé : les mois SANS encaissement en caisse (avant la bascule depuis
 * Céleris) affichent « rapprochement sans objet », pas un faux écart.
 */

interface Releve { id: string; mois: string; compte: string; montant: number; creditsClients?: number | null; }
interface LigneMS { type: "salaire" | "charge"; mois: string; }
interface MoisResultat { mois: string; ca: number; masse: number; depenses: number; }

const NOMS_MOIS: Record<string, string> = {
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
};
const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/** Mois précédent d'un "AAAA-MM" — celui qu'on boucle par défaut. */
function moisDecale(mois: string, delta: number): string {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Etat = "ok" | "manque" | "info" | "neutre";
interface Point { etat: Etat; titre: string; detail: string; href: string; lien: string; }

export default function ClotureMoisPage() {
  const { isAdmin, user } = useAuth();
  const [releves, setReleves] = useState<Releve[]>([]);
  const [comptes, setComptes] = useState<string[]>([]);
  const [horsTotal, setHorsTotal] = useState<string[]>([]);
  const [lignesMS, setLignesMS] = useState<LigneMS[]>([]);
  const [resultat, setResultat] = useState<MoisResultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mois, setMois] = useState(moisDecale(moisCourant(), -1));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const h = { Authorization: `Bearer ${token}` };
      const [tre, ms, res] = await Promise.all([
        fetch("/api/admin/tresorerie", { headers: h }).then(r => r.json()),
        fetch("/api/admin/masse-salariale", { headers: h }).then(r => r.json()),
        fetch("/api/admin/resultat", { headers: h }).then(r => r.json()),
      ]);
      setReleves(tre.releves || []); setComptes(tre.comptes || []); setHorsTotal(tre.horsTotal || []);
      setLignesMS(ms.lignes || []);
      setResultat(res.mois || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const points = useMemo<Point[]>(() => {
    const r = resultat.find(x => x.mois === mois);
    const comptesComptes = comptes.filter(c => !horsTotal.includes(c));
    const relevesMois = releves.filter(x => x.mois === mois);
    const manquants = comptesComptes.filter(c => !relevesMois.some(x => x.compte === c));
    const fiches = lignesMS.filter(l => l.mois === mois && l.type !== "charge").length;
    const charges = lignesMS.filter(l => l.mois === mois && l.type === "charge").length;
    const ca = r?.ca || 0;
    const depenses = r?.depenses || 0;
    // Rapprochement : les encaissements clients lus sur les relevés du mois
    // (tous comptes comptés) face au CA encaissé de la caisse.
    const creditsLus = relevesMois.filter(x => !horsTotal.includes(x.compte) && x.creditsClients != null);
    const credits = creditsLus.reduce((s, x) => s + (x.creditsClients || 0), 0);

    const pts: Point[] = [
      {
        etat: manquants.length === 0 && comptesComptes.length > 0 ? "ok" : "manque",
        titre: "Soldes bancaires saisis",
        detail: manquants.length === 0
          ? `${comptesComptes.length}/${comptesComptes.length} comptes — ${comptesComptes.map(c => { const x = relevesMois.find(y => y.compte === c); return `${c} : ${x ? eur(x.montant) : "?"}`; }).join(" · ")}`
          : `Il manque : ${manquants.join(", ")} — dépose le(s) relevé(s) PDF.`,
        href: "/admin/comptabilite/tresorerie", lien: "Trésorerie",
      },
      {
        etat: fiches > 0 ? "ok" : "manque",
        titre: "Fiches de paie",
        detail: fiches > 0 ? `${fiches} salaire(s) enregistré(s).` : "Aucune fiche de paie déposée pour ce mois.",
        href: "/admin/comptabilite/masse-salariale", lien: "Masse salariale",
      },
      {
        etat: charges > 0 ? "ok" : "info",
        titre: "Charges sociales versées à part (MSA/TESA)",
        detail: charges > 0 ? `${charges} charge(s) enregistrée(s).` : "Aucune — normal s'il n'y a pas de saisonniers ce mois-ci, sinon dépose le récapitulatif.",
        href: "/admin/comptabilite/masse-salariale", lien: "Masse salariale",
      },
      {
        etat: depenses > 0 ? "ok" : "manque",
        titre: "Dépenses du mois",
        detail: depenses > 0 ? `${eur(depenses)} saisis sur les postes.` : "Aucune dépense saisie — le relevé déposé les propose tout seul.",
        href: "/admin/comptabilite/depenses", lien: "Dépenses",
      },
    ];

    if (ca === 0) {
      pts.push({
        etat: "neutre",
        titre: "Rapprochement banque ↔ caisse",
        detail: "Sans objet : aucun encaissement en caisse ce mois-ci (période Céleris, ou mois sans activité).",
        href: "/admin/comptabilite?tab=rapprochement", lien: "Pointage bancaire",
      });
    } else if (creditsLus.length === 0) {
      pts.push({
        etat: "info",
        titre: "Rapprochement banque ↔ caisse",
        detail: `La caisse dit ${eur(ca)} encaissés, mais aucun relevé du mois ne porte les encaissements clients — redépose le relevé PDF (le champ est lu automatiquement).`,
        href: "/admin/comptabilite/tresorerie", lien: "Trésorerie",
      });
    } else {
      const ecart = credits - ca;
      const pct = ca > 0 ? Math.abs(ecart) / ca : 0;
      pts.push({
        etat: pct <= 0.05 ? "ok" : "info",
        titre: "Rapprochement banque ↔ caisse",
        detail: `Banque : ${eur(credits)} d'encaissements clients · Caisse : ${eur(ca)} — écart ${ecart >= 0 ? "+" : "−"}${eur(Math.abs(ecart))} (${(pct * 100).toFixed(1)} %).`
          + (pct > 0.05 ? " À creuser : remises CB à cheval sur deux mois, chèques non déposés, impayé… ou relevé partiel." : " Cohérent."),
        href: "/admin/comptabilite?tab=rapprochement", lien: "Pointage bancaire",
      });
    }
    return pts;
  }, [mois, resultat, comptes, horsTotal, releves, lignesMS]);

  const bloquants = points.filter(p => p.etat === "manque").length;
  const boucle = bloquants === 0;

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  const PASTILLES: Record<Etat, { s: string; cls: string }> = {
    ok: { s: "✓", cls: "bg-green-100 text-green-700 border-green-200" },
    manque: { s: "✗", cls: "bg-red-100 text-red-600 border-red-200" },
    info: { s: "!", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    neutre: { s: "—", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} className="text-teal-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Boucler le mois</h1>
            <p className="font-body text-sm text-slate-500">
              Le rituel de fin de mois en une page — tout vert = mois bouclé.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-center gap-3 mb-4">
        <button onClick={() => setMois(m => moisDecale(m, -1))}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-50">
          <ChevronLeft size={15} className="text-slate-500" />
        </button>
        <div className="font-display text-lg font-bold text-blue-800 w-52 text-center">
          {NOMS_MOIS[mois.slice(5)]} {mois.slice(0, 4)}
        </div>
        <button onClick={() => setMois(m => moisDecale(m, 1))} disabled={mois >= moisCourant()}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-50 disabled:opacity-40">
          <ChevronRight size={15} className="text-slate-500" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto" /></div>
      ) : (
        <>
          <div className={`mb-4 rounded-xl px-4 py-3 font-body text-sm font-semibold ${boucle ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
            {boucle ? "✅ Mois bouclé — tout est en place." : `${bloquants} point(s) à régler pour boucler ${NOMS_MOIS[mois.slice(5)].toLowerCase()}.`}
          </div>

          <div className="flex flex-col gap-2">
            {points.map((p, i) => (
              <Card key={i} padding="sm" className="!py-3">
                <div className="flex items-start gap-3">
                  <span className={`w-7 h-7 rounded-full border flex items-center justify-center font-body text-sm font-bold flex-shrink-0 ${PASTILLES[p.etat].cls}`}>
                    {PASTILLES[p.etat].s}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-slate-800">{p.titre}</div>
                    <div className="font-body text-xs text-slate-500 mt-0.5">{p.detail}</div>
                  </div>
                  <Link href={p.href}
                    className="font-body text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1.5 rounded-lg no-underline hover:bg-teal-100 whitespace-nowrap">
                    {p.lien} →
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          <p className="font-body text-[11px] text-slate-400 mt-4">
            Le rapprochement compare les <strong>encaissements clients lus sur le relevé</strong> (remises CB,
            chèques, Stripe — hors virements internes et remboursements) au <strong>CA encaissé de la caisse</strong>.
            Un écart de quelques pourcents est normal (remises CB à cheval sur deux mois) ; un gros écart mérite
            un regard. Un email de rappel part automatiquement le 2 de chaque mois avec l&apos;état de cette liste.
          </p>
        </>
      )}
    </div>
  );
}
