"use client";
/**
 * Cavalerie → « Travail des poneys » : dicter le travail fait (jour, poney,
 * ce qui a été fait), vérifier, enregistrer ; grille de la semaine et feuille
 * imprimable. Règles : lib/travail-equides.ts ; route api/admin/travail-equides.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Printer, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { extensionAudio } from "@/lib/transcription-params";
import { CLUB_DEFAUTS } from "@/lib/club-info-defauts";
import {
  TYPES_TRAVAIL, grilleSemaine, htmlFeuilleTravail, isoJour, joursSemaine, lundiDe, seanceValide, typeTravail,
  type SeanceProposee, type SeanceTravail,
} from "@/lib/travail-equides";
import type { Equide } from "../types";
import { useAuth } from "@/lib/auth-context";

const champ = "w-full px-2 py-1.5 rounded-lg border border-gray-200 font-body text-sm bg-white";
const aujourdhui = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
const decaler = (iso: string, jours: number) => isoJour(new Date(new Date(`${iso}T12:00:00Z`).getTime() + jours * 86_400_000));
const jourCourt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

export default function TabTravail({ equides }: { equides: Equide[] }) {
  const actifs = equides.filter((e) => e.status !== "sorti" && e.status !== "deces");
  // La personne connectée : « j'ai longé Caramel » = elle (prénom du compte).
  const { user } = useAuth() as any;
  const moi = String(user?.displayName || "").trim().split(/\s+/)[0] || String(user?.email || "").split("@")[0].split(/[._-]/)[0].replace(/^./, (c: string) => c.toUpperCase());
  const [lundi, setLundi] = useState(lundiDe(aujourdhui()));
  const [seances, setSeances] = useState<SeanceTravail[]>([]);
  const [chargement, setChargement] = useState(true);
  const [propositions, setPropositions] = useState<SeanceProposee[] | null>(null);
  const [remarques, setRemarques] = useState<string[]>([]);
  const [texte, setTexte] = useState("");
  const [etat, setEtat] = useState<"" | "ecoute" | "transcription" | "analyse" | "enregistrement">("");
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await (await authFetch(`/api/admin/travail-equides?du=${lundi}&au=${decaler(lundi, 6)}`)).json();
      setSeances(r.seances || []);
    } catch { setMessage("Lecture impossible."); }
    setChargement(false);
  }, [lundi]);
  useEffect(() => { void charger(); }, [charger]);

  const analyser = async (dictee: string) => {
    setEtat("analyse"); setMessage("");
    try {
      const res = await authFetch("/api/admin/travail-equides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dicter", texte: dictee, moi }) });
      const r = await res.json();
      if (!res.ok) setMessage(`❌ ${r.error || "Analyse impossible"}`);
      else { setPropositions(r.seances || []); setRemarques(r.remarques || []); }
    } catch (e: any) { setMessage(`❌ ${e?.message || "Erreur"}`); }
    setEtat("");
  };

  const demarrer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const morceaux: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(morceaux, { type });
        if (blob.size < 1000) { setEtat(""); setMessage("Enregistrement vide : vérifiez l'autorisation du micro."); return; }
        setEtat("transcription");
        try {
          const fd = new FormData(); fd.append("audio", new File([blob], `travail.${extensionAudio(type)}`, { type }));
          const r = await (await authFetch("/api/whisper", { method: "POST", body: fd })).json();
          if (!r.success) { setEtat(""); setMessage(`❌ ${r.error || "Transcription impossible"}`); return; }
          const t = [texte, r.text || ""].filter(Boolean).join(" ");
          setTexte(t);
          await analyser(t);
        } catch (e: any) { setEtat(""); setMessage(`❌ ${e?.message || "Erreur"}`); }
      };
      recorderRef.current = rec; rec.start(); setEtat("ecoute"); setMessage("");
    } catch (e: any) { setMessage(`Micro indisponible : ${e?.message || ""}`); }
  };
  const arreter = () => { if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop(); };

  const majProposition = (k: number, patch: Partial<SeanceProposee>) =>
    setPropositions((p) => (p || []).map((s, i) => (i === k ? { ...s, ...patch } : s)));
  const ajouterLigne = () => setPropositions((p) => [...(p || []), { date: aujourdhui(), equideId: "", equideNom: "", type: "monte", duree: null, qui: moi, notes: "", alertes: [] }]);

  const enregistrer = async () => {
    const ok = (propositions || []).filter(seanceValide);
    if (!ok.length) { setMessage("Indiquez au moins un poney et qui l'a travaillé."); return; }
    setEtat("enregistrement");
    try {
      const res = await authFetch("/api/admin/travail-equides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enregistrer", seances: ok, texte }) });
      const r = await res.json();
      if (!res.ok) setMessage(`❌ ${r.error}`);
      else {
        const ignorees = (propositions || []).length - ok.length;
        setMessage(`✅ ${ok.length} séance(s) enregistrée(s)${ignorees ? ` · ${ignorees} sans poney, non enregistrée(s)` : ""}.`);
        setPropositions(null); setTexte(""); setRemarques([]);
        if (!joursSemaine(lundi).includes(ok[0].date)) setLundi(lundiDe(ok[0].date)); else void charger();
      }
    } catch (e: any) { setMessage(`❌ ${e?.message || "Erreur"}`); }
    setEtat("");
  };

  const supprimer = async (s: SeanceTravail) => {
    if (!s.id || !confirm(`Supprimer la séance de ${s.equideNom} du ${jourCourt(s.date)} ?`)) return;
    await authFetch("/api/admin/travail-equides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "supprimer", id: s.id }) });
    void charger();
  };

  const grille = grilleSemaine(seances, actifs, lundi);
  const imprimer = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(htmlFeuilleTravail(grille, lundi, CLUB_DEFAUTS.nom));
    w.document.close();
  };
  const occupe = !!etat && etat !== "ecoute";

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
        <div className="font-body text-sm font-semibold text-blue-800">Dicter le travail fait</div>
        <p className="font-body text-xs text-slate-500">Exemple : « Aujourd'hui j'ai longé Caramel vingt minutes, et Léa a monté Pistache en obstacle, il était un peu chaud. » Dites le jour, le poney, qui l'a travaillé et ce qui a été fait ; « j'ai… » = vous{moi ? ` (${moi})` : ""}.</p>
        <div className="flex flex-wrap items-center gap-2">
          {etat === "ecoute" ? (
            <button type="button" onClick={arreter} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500 text-white font-body text-sm font-semibold border-none cursor-pointer animate-pulse">
              <Square size={16} /> Arrêter
            </button>
          ) : (
            <button type="button" onClick={() => void demarrer()} disabled={occupe} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-50">
              {occupe ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
              {etat === "transcription" ? "Transcription…" : etat === "analyse" ? "Lecture de la dictée…" : etat === "enregistrement" ? "Enregistrement…" : "🎤 Dicter"}
            </button>
          )}
          <button type="button" onClick={ajouterLigne} disabled={occupe} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-blue-700 border border-blue-200 font-body text-sm cursor-pointer">
            <Plus size={14} /> Saisir à la main
          </button>
        </div>
        <div className="flex gap-2">
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} placeholder="…ou tapez ici ce que vous auriez dit"
            className={`${champ} flex-1`} />
          <button type="button" onClick={() => void analyser(texte)} disabled={!texte.trim() || occupe}
            className="px-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-body text-xs font-semibold cursor-pointer disabled:opacity-40">Lire</button>
        </div>
        {message && <p className="font-body text-sm">{message}</p>}

        {propositions && (
          <div className="flex flex-col gap-2">
            <div className="font-body text-xs font-semibold text-slate-600">À vérifier avant d&apos;enregistrer</div>
            {remarques.length > 0 && <p className="font-body text-xs text-amber-800">⚠️ {remarques.join(" · ")}</p>}
            {propositions.map((s, k) => (
              <div key={k} className={`grid grid-cols-2 sm:grid-cols-6 gap-2 items-end rounded-lg p-2 ${seanceValide(s) ? "bg-sand" : "bg-amber-50 border border-amber-200"}`}>
                <label className="font-body text-[11px] text-slate-500">Jour
                  <input type="date" value={s.date} onChange={(e) => majProposition(k, { date: e.target.value })} className={champ} />
                </label>
                <label className="font-body text-[11px] text-slate-500">Poney{s.nomEntendu ? ` (entendu : « ${s.nomEntendu} »)` : ""}
                  <select value={s.equideId} onChange={(e) => majProposition(k, { equideId: e.target.value, equideNom: actifs.find((x) => x.id === e.target.value)?.name || "" })} className={champ}>
                    <option value="">— choisir —</option>
                    {[...actifs].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <label className="font-body text-[11px] text-slate-500">Travail
                  <select value={s.type} onChange={(e) => majProposition(k, { type: e.target.value as any })} className={champ}>
                    {TYPES_TRAVAIL.map((t) => <option key={t.id} value={t.id}>{t.icone} {t.label}</option>)}
                  </select>
                </label>
                <label className="font-body text-[11px] text-slate-500">Durée (min)
                  <input type="number" inputMode="numeric" min={0} value={s.duree ?? ""} onChange={(e) => majProposition(k, { duree: e.target.value ? Number(e.target.value) : null })} className={champ} />
                </label>
                <label className="font-body text-[11px] text-slate-500">Travaillé par *
                  <input value={s.qui} onChange={(e) => majProposition(k, { qui: e.target.value })} placeholder="obligatoire" className={`${champ} ${s.qui.trim() ? "" : "border-amber-400"}`} />
                </label>
                <button type="button" onClick={() => setPropositions((p) => (p || []).filter((_, i) => i !== k))} className="flex items-center justify-center gap-1 py-1.5 text-red-500 bg-transparent border-none cursor-pointer font-body text-xs">
                  <Trash2 size={14} /> Retirer
                </button>
                <label className="col-span-2 sm:col-span-6 font-body text-[11px] text-slate-500">Ce qui a été fait / observé
                  <input value={s.notes} onChange={(e) => majProposition(k, { notes: e.target.value })} className={champ} />
                </label>
                {s.alertes.length > 0 && <p className="col-span-2 sm:col-span-6 font-body text-[11px] text-amber-800">⚠️ {s.alertes.join(" ")}</p>}
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={() => void enregistrer()} disabled={occupe || !propositions.some(seanceValide)}
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-body text-sm font-semibold border-none cursor-pointer disabled:opacity-40">
                Enregistrer {propositions.filter(seanceValide).length} séance(s)
              </button>
              <button type="button" onClick={() => { setPropositions(null); setRemarques([]); }} className="px-3 py-2 rounded-lg bg-gray-100 text-slate-600 font-body text-sm border-none cursor-pointer">Annuler</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLundi(decaler(lundi, -7))} className="w-8 h-8 rounded-lg bg-gray-100 border-none cursor-pointer flex items-center justify-center"><ChevronLeft size={16} /></button>
            <div className="font-body text-sm font-semibold text-blue-800">Semaine du {jourCourt(lundi)} au {jourCourt(decaler(lundi, 6))}</div>
            <button type="button" onClick={() => setLundi(decaler(lundi, 7))} className="w-8 h-8 rounded-lg bg-gray-100 border-none cursor-pointer flex items-center justify-center"><ChevronRight size={16} /></button>
          </div>
          <button type="button" onClick={imprimer} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-800 text-white font-body text-sm border-none cursor-pointer">
            <Printer size={14} /> Imprimer la feuille
          </button>
        </div>
        {chargement ? <p className="font-body text-sm text-slate-500">Chargement…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full font-body text-xs min-w-[760px] border-collapse">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1.5 pr-2">Équidé</th>
                  {joursSemaine(lundi).map((j) => <th key={j} className="px-1">{jourCourt(j)}</th>)}
                  <th className="px-1 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {grille.map((l) => (
                  <tr key={l.equideId} className="border-t border-gray-100 align-top">
                    <td className={`py-1.5 pr-2 font-semibold ${l.nb ? "text-blue-800" : "text-slate-400"}`}>{l.nom}</td>
                    {l.jours.map((ss, k) => (
                      <td key={k} className="px-1 py-1">
                        {ss.map((s) => (
                          <div key={s.id} className="group bg-blue-50 rounded px-1.5 py-0.5 mb-0.5" title={[s.qui && `Par ${s.qui}`, s.notes].filter(Boolean).join(" — ")}>
                            {typeTravail(s.type).icone} {typeTravail(s.type).label}{s.duree ? ` ${s.duree}′` : ""}{s.qui ? <span className="text-slate-500"> · {s.qui}</span> : null}
                            <button type="button" onClick={() => void supprimer(s)} className="ml-1 text-red-400 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100" title="Supprimer">✕</button>
                            {s.notes && <div className="text-[10px] text-slate-500 truncate">{s.notes}</div>}
                          </div>
                        ))}
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center text-slate-600">{l.nb ? `${l.nb}${l.minutes ? ` · ${Math.floor(l.minutes / 60)}h${String(l.minutes % 60).padStart(2, "0")}` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
