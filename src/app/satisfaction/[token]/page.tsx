"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Star, Loader2, CheckCircle2 } from "lucide-react";

interface Invitation { stageLabel: string; childName: string; moniteurs: string[]; repondu: boolean; }

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button"
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)} className="p-0.5" aria-label={`${i} étoile${i > 1 ? "s" : ""}`}>
          <Star size={30} className={i <= (hover || value) ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300"} />
        </button>
      ))}
    </div>
  );
}

const QUESTIONS = [
  { id: "globalNote", label: "Note globale du stage" },
  { id: "noteProgres", label: "Les progrès de votre enfant" },
  { id: "notePoneyNiveau", label: "L'adéquation poney / niveau" },
  { id: "noteOrganisation", label: "L'organisation (accueil, horaires, infos)" },
] as const;

export default function SatisfactionPage() {
  const params = useParams();
  const token = String((params as any)?.token || "");

  const [inv, setInv] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const [notes, setNotes] = useState<Record<string, number>>({});
  const [encadrement, setEncadrement] = useState<Record<string, number>>({});
  const [recommande, setRecommande] = useState<boolean | null>(null);
  const [commentaire, setCommentaire] = useState("");

  useEffect(() => {
    if (!token) { setError("Lien invalide."); setLoading(false); return; }
    fetch(`/api/satisfaction?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 404) throw new Error("Ce questionnaire est introuvable ou a expiré.");
        if (!r.ok) throw new Error("Une erreur est survenue.");
        return r.json();
      })
      .then((d: Invitation) => { setInv(d); if (d.repondu) setSent(true); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setNote = (id: string, n: number) => setNotes(p => ({ ...p, [id]: n }));
  const setEnc = (nom: string, n: number) => setEncadrement(p => ({ ...p, [nom]: n }));

  const submit = async () => {
    if (!notes.globalNote) { setError("Merci de donner au moins une note globale."); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/satisfaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          globalNote: notes.globalNote,
          noteProgres: notes.noteProgres,
          notePoneyNiveau: notes.notePoneyNiveau,
          noteOrganisation: notes.noteOrganisation,
          recommande,
          commentaire,
          notesEncadrement: (inv?.moniteurs || []).map(nom => ({ nom, note: encadrement[nom] || 0 })),
        }),
      });
      if (res.status === 409) { setSent(true); return; }
      if (!res.ok) throw new Error("Échec de l'envoi. Merci de réessayer.");
      setSent(true);
    } catch (e: any) { setError(e.message); } finally { setSending(false); }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
  }

  if (error && !inv) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center text-slate-600">{error}</div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48} />
          <h1 className="text-xl font-bold text-slate-800">Merci pour votre retour !</h1>
          <p className="text-slate-500 mt-2">Votre avis nous aide à améliorer nos stages. À très bientôt au Centre Équestre d'Agon-Coutainville.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-[#1e3a5f] text-white px-6 py-5">
          <div className="text-xs uppercase tracking-wide text-white/70">Centre Équestre d'Agon-Coutainville</div>
          <h1 className="text-lg font-bold mt-1">Votre avis sur le stage</h1>
          <p className="text-white/80 text-sm mt-1">
            {inv?.stageLabel}{inv?.childName ? ` · ${inv.childName}` : ""}
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {QUESTIONS.map(q => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">{q.label}</label>
              <StarRating value={notes[q.id] || 0} onChange={n => setNote(q.id, n)} />
            </div>
          ))}

          {(inv?.moniteurs || []).length > 0 && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-5">
              <div className="text-sm font-semibold text-slate-700">L'encadrement</div>
              {(inv?.moniteurs || []).map(nom => (
                <div key={nom} className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">{nom}</span>
                  <StarRating value={encadrement[nom] || 0} onChange={n => setEnc(nom, n)} />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-5">
            <span className="text-sm font-semibold text-slate-700">Recommanderiez-vous le club ?</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRecommande(true)}
                className={`px-4 py-2 rounded-lg font-semibold border ${recommande === true ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200"}`}>Oui</button>
              <button type="button" onClick={() => setRecommande(false)}
                className={`px-4 py-2 rounded-lg font-semibold border ${recommande === false ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-600 border-slate-200"}`}>Non</button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-5">
            <label className="text-sm font-semibold text-slate-700">Un commentaire ? (facultatif)</label>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={4}
              className="rounded-lg border border-slate-200 p-3 text-slate-700 focus:border-[#1e3a5f] focus:outline-none resize-none"
              placeholder="Ce qui vous a plu, ce qu'on pourrait améliorer…" />
          </div>

          {error && <div className="text-rose-600 text-sm">{error}</div>}

          <button type="button" onClick={submit} disabled={sending}
            className="bg-[#1e3a5f] text-white font-semibold rounded-lg py-3 hover:bg-[#15293f] disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {sending && <Loader2 className="animate-spin" size={18} />} Envoyer mon avis
          </button>
        </div>
      </div>
    </div>
  );
}
