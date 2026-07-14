"use client";
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Send, Megaphone, Users, RefreshCw, Check } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// /admin/offres — Offres last-minute ciblées par email
//
// Flux : choisir un créneau/semaine avec des places → le SERVEUR calcule
// les familles ciblées (âge + galop + consentement RGPD + pas déjà
// inscrites, dédoublonnées par email) → relire/cocher → rédiger l'offre
// (placeholders {parent} et {enfant}) → envoyer (mode restreint respecté).
// Les familles déjà contactées pour cette offre sont décochées par défaut.
// ═══════════════════════════════════════════════════════════════════

const MESSAGE_DEFAUT = `Bonjour {parent},

Une place vient de se libérer et nous avons pensé à {enfant} : [détail de l'offre — dates, horaire, tarif].

Les places libérées partent vite : répondez à cet email ou appelez-nous pour réserver.

À très bientôt,
Le Centre Équestre d'Agon-Coutainville`;

export default function OffresPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selected, setSelected] = useState("");
  const [cible, setCible] = useState<any>(null);
  const [loadingCible, setLoadingCible] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(MESSAGE_DEFAUT);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState("");

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const r = await authFetch("/api/admin/offres/creneaux");
      const d = await r.json();
      if (r.ok) setItems(d.items || []);
      else setErr(d.error || "Erreur");
    } catch {
      setErr("Erreur réseau");
    }
    setLoadingItems(false);
  };
  useEffect(() => {
    loadItems();
  }, []);

  const loadCible = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setLoadingCible(true);
    setCible(null);
    setResult(null);
    setErr("");
    try {
      const r = await authFetch("/api/admin/offres/cible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creneauIds: item.creneauIds }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Erreur");
      } else {
        setCible({ ...d, creneauIds: item.creneauIds });
        // Cochées par défaut, SAUF les familles déjà contactées pour cette offre.
        const init: Record<string, boolean> = {};
        (d.cibles || []).forEach((c: any) => (init[c.familyId] = !c.dejaContactee));
        setChecked(init);
        if (!subject.trim() || subject.startsWith("Place libérée")) {
          setSubject(`Place libérée — ${d.offre?.titre || ""}`.trim());
        }
      }
    } catch {
      setErr("Erreur réseau");
    }
    setLoadingCible(false);
  };

  const envoyer = async () => {
    if (!cible) return;
    const familyIds = (cible.cibles || []).filter((c: any) => checked[c.familyId]).map((c: any) => c.familyId);
    if (familyIds.length === 0 || !subject.trim() || !message.trim() || sending) return;
    if (!confirm(`Envoyer l'offre à ${familyIds.length} famille(s) ?`)) return;
    setSending(true);
    setResult(null);
    try {
      const enfantParFamille: Record<string, string> = {};
      (cible.cibles || []).forEach((c: any) => {
        if (checked[c.familyId]) enfantParFamille[c.familyId] = c.enfants?.[0]?.prenom || "";
      });
      const r = await authFetch("/api/admin/offres/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creneauIds: cible.creneauIds, familyIds, subject, message, enfantParFamille }),
      });
      const d = await r.json();
      if (!r.ok) {
        setResult({ ok: false, text: d.error || "Échec de l'envoi" });
      } else {
        const ign = (d.ignores || []).length;
        setResult({
          ok: true,
          text: `${d.envoyes} email(s) envoyé(s)${ign > 0 ? ` · ${ign} ignoré(s) (${(d.ignores || []).map((x: any) => x.raison).join(", ")})` : ""}`,
        });
        // Recharger le ciblage pour refléter le journal (déjà contactées).
        loadCible(selected);
      }
    } catch {
      setResult({ ok: false, text: "Erreur réseau" });
    }
    setSending(false);
  };

  const nbCoches = cible ? (cible.cibles || []).filter((c: any) => checked[c.familyId]).length : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone size={20} className="text-blue-600" />
        <h1 className="font-display text-xl font-bold text-blue-950">Offres last-minute</h1>
        <button onClick={loadItems} className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 font-body text-xs text-slate-600 border border-gray-200 cursor-pointer">
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>
      <p className="mb-4 font-body text-xs text-slate-500">
        Choisis un créneau à remplir : le serveur calcule les familles éligibles (âge + galop de l'activité), avec
        consentement, non inscrites, dédoublonnées par email. Les envois sont individuels et journalisés — une famille
        déjà contactée pour la même offre est décochée par défaut. Le mode email restreint s'applique.
      </p>

      {/* 1. Choix du créneau */}
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">1 · Créneau à remplir</div>
        {loadingItems ? (
          <div className="flex items-center gap-2 font-body text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Chargement…</div>
        ) : (
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              if (e.target.value) loadCible(e.target.value);
            }}
            className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 font-body text-sm"
          >
            <option value="">Choisir un créneau avec des places…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
        )}
        {err && <p className="mt-1.5 font-body text-xs font-semibold text-red-500">{err}</p>}
      </div>

      {/* 2. Cibles */}
      {loadingCible && (
        <div className="mt-3 flex items-center gap-2 font-body text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Calcul du ciblage…</div>
      )}
      {cible && (
        <>
          <div className="mt-3 rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">
                2 · Familles ciblées ({nbCoches}/{(cible.cibles || []).length} cochées)
              </div>
              <div className="inline-flex items-center gap-1 font-body text-[11px] text-slate-400">
                <Users size={12} /> {cible.offre?.placesRestantes ?? "?"} place(s) restante(s)
              </div>
            </div>
            {(cible.cibles || []).length === 0 ? (
              <p className="font-body text-xs text-slate-500">
                Aucune famille ciblable. Exclusions : {cible.exclusions?.sansConsentement ?? 0} sans consentement,{" "}
                {cible.exclusions?.nonEligibles ?? 0} enfant(s) non éligible(s) (âge/galop),{" "}
                {cible.exclusions?.dejaInscrits ?? 0} déjà inscrit(s). Active le consentement dans les fiches familles
                (onglet Divers) pour élargir.
              </p>
            ) : (
              <>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {(cible.cibles || []).map((c: any) => (
                    <label key={c.familyId} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={!!checked[c.familyId]}
                        onChange={(e) => setChecked((prev) => ({ ...prev, [c.familyId]: e.target.checked }))}
                      />
                      <span className="font-body text-xs font-semibold text-blue-950">{c.parentName}</span>
                      <span className="font-body text-[11px] text-slate-400">{c.parentEmail}</span>
                      <span className="ml-auto font-body text-[11px] text-slate-500">
                        {(c.enfants || []).map((e: any) => `${e.prenom}${e.age !== null ? ` (${e.age} ans${e.galop ? `, ${e.galop}` : ""})` : ""}`).join(" · ")}
                      </span>
                      {c.dejaContactee && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-body text-[10px] font-semibold text-amber-600">déjà contactée</span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 font-body text-[10px] text-slate-400">
                  Exclusions : {cible.exclusions?.sansConsentement ?? 0} sans consentement · {cible.exclusions?.nonEligibles ?? 0} non
                  éligible(s) · {cible.exclusions?.dejaInscrits ?? 0} déjà inscrit(s)
                </p>
              </>
            )}
          </div>

          {/* 3. Message */}
          <div className="mt-3 rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-slate-400">3 · Offre à envoyer</div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet"
              className="mb-2 w-full rounded-md border border-gray-200 px-2.5 py-2 font-body text-sm"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 font-body text-sm"
            />
            <p className="mt-1 font-body text-[10px] text-slate-400">
              {"{parent}"} et {"{enfant}"} sont remplacés par le nom du parent et le prénom de l'enfant éligible. Pense
              « rareté » (places libérées, premier arrivé) plutôt que promo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={envoyer}
                disabled={sending || nbCoches === 0 || !subject.trim() || !message.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 font-body text-xs font-bold text-white border-none cursor-pointer hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? "Envoi…" : `Envoyer à ${nbCoches} famille(s)`}
              </button>
              {result && (
                <span className={`inline-flex items-center gap-1 font-body text-xs font-semibold ${result.ok ? "text-green-600" : "text-red-500"}`}>
                  {result.ok && <Check size={12} />} {result.text}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
