"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Star, Loader2, CheckCircle2 } from "lucide-react";

interface Invitation { stageLabel: string; childName: string; moniteurs: string[]; type?: "stage" | "annee" | "promenade"; saison?: number | null; repondu: boolean; }

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

const questionsFor = (kind?: string) => {
  const annee = kind === "annee";
  const prom = kind === "promenade";
  return [
    { id: "globalNote", label: prom ? "Note globale de la promenade" : annee ? "Note globale de l'année" : "Note globale du stage" },
    { id: "noteProgres", label: annee ? "Les progrès de votre enfant sur l'année" : "Les progrès de votre enfant" },
    { id: "notePoneyNiveau", label: "L'adéquation poney / niveau" },
    { id: "noteOrganisation", label: annee ? "L'organisation (accueil, planning, infos)" : "L'organisation (accueil, horaires, infos)" },
  ];
};

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
          <p className="text-slate-500 mt-2">Votre avis nous aide à progresser. À très bientôt au Centre Équestre d'Agon-Coutainville.</p>

          {/* 5 étoiles → proposer l'avis Google, comme sur l'espace cavalier */}
          {notes.globalNote === 5 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-5 text-center">
              <p className="text-sm font-semibold text-amber-800 mb-1">⭐ Vous adorez le centre équestre !</p>
              <p className="text-xs text-amber-700 mb-3">
                Partagez votre expérience sur Google pour aider d'autres familles à nous découvrir.
              </p>
              <a
                href="https://g.page/r/CfTtSmcBdnj6EBM/review"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white no-underline transition-colors"
                style={{ background: "#4285F4" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Publier sur Google
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-[#1e3a5f] text-white px-6 py-5">
          <div className="text-xs uppercase tracking-wide text-white/70">Centre Équestre d'Agon-Coutainville</div>
          <h1 className="text-lg font-bold mt-1">{inv?.type === "annee" ? "Votre avis sur l'année" : inv?.type === "promenade" ? "Votre avis sur la promenade" : "Votre avis sur le stage"}</h1>
          <p className="text-white/80 text-sm mt-1">
            {inv?.stageLabel}{inv?.childName ? ` · ${inv.childName}` : ""}
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {questionsFor(inv?.type).map(q => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">{q.label}</label>
              <StarRating value={notes[q.id] || 0} onChange={n => setNote(q.id, n)} />
            </div>
          ))}

          {(inv?.moniteurs || []).length > 0 && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-5">
              <div className="text-sm font-semibold text-slate-700">{inv?.type === "annee" ? "Vos moniteurs cette année" : "L'encadrement"}</div>
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
