"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where, serverTimestamp, limit } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Star, Send, CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

const ASPECTS = [
  { id: "moniteur", label: "Moniteur / encadrement" },
  { id: "poneys", label: "Poneys & chevaux" },
  { id: "infrastructures", label: "Infrastructures" },
  { id: "ambiance", label: "Ambiance générale" },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="bg-transparent border-none cursor-pointer p-0.5 transition-transform hover:scale-110">
          <Star
            size={28}
            className={`transition-colors ${(hover || value) >= star ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function SatisfactionPage() {
  const { user, family } = useAuth();
  const [pastReservations, setPastReservations] = useState<any[]>([]);
  const [myAvis, setMyAvis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Formulaire
  const [selectedActivity, setSelectedActivity] = useState("");
  const [globalNote, setGlobalNote] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [commentaire, setCommentaire] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      // Réservations passées (30 derniers jours)
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - 30);
      const dateLimitStr = dateLimit.toISOString().split("T")[0];

      const [resSnap, avisSnap] = await Promise.all([
        getDocs(query(
          collection(db, "reservations"),
          where("familyId", "==", user.uid),
          limit(50)
        )),
        getDocs(query(
          collection(db, "avis-satisfaction"),
          where("familyId", "==", user.uid),
          limit(20)
        )),
      ]);

      // Filtrer les 30 derniers jours + dédupliquer par activité (côté client)
      const res = resSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const filtered = res
        .filter((r: any) => r.date >= dateLimitStr && r.date < today)
        .sort((a: any, b: any) => b.date.localeCompare(a.date));
      const unique = Array.from(new Map(filtered.map((r: any) => [r.activityTitle, r])).values());
      setPastReservations(unique);
      setMyAvis(avisSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 10));
      setLoading(false);
    })();
  }, [user]);

  const handleSubmit = async () => {
    if (!user || !family || globalNote === 0) return;
    setSending(true);
    try {
      await addDoc(collection(db, "avis-satisfaction"), {
        familyId: user.uid,
        familyName: family.parentName || "",
        activityTitle: selectedActivity || "Général",
        globalNote,
        aspects,
        commentaire: commentaire.trim(),
        createdAt: serverTimestamp(),
      });

      // Notifier l'admin par email (fire-and-forget)
      const stars = "⭐".repeat(globalNote);
      authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: process.env.NEXT_PUBLIC_OWNER_EMAIL || "ceagon50@gmail.com",
          subject: `${stars} Avis satisfaction — ${family.parentName}`,
          html: `<div style="font-family:sans-serif;max-width:520px;padding:24px;">
            <p><strong>${family.parentName}</strong> a laissé un avis :</p>
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;font-size:18px;">${stars} <strong>${globalNote}/5</strong></p>
              ${selectedActivity ? `<p style="margin:8px 0 0;color:#555;font-size:13px;">Activité : ${selectedActivity}</p>` : ""}
              ${commentaire ? `<p style="margin:8px 0 0;color:#333;font-size:14px;">"${commentaire}"</p>` : ""}
            </div>
          </div>`,
        }),
      }).catch(() => {});

      setSent(true);
      setMyAvis(prev => [{ activityTitle: selectedActivity || "Général", globalNote, commentaire, createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const GOOGLE_REVIEW_URL = "https://g.page/r/CfTtSmcBdnj6EBM/review";

  const resetForm = () => {
    setSent(false);
    setSelectedActivity("");
    setGlobalNote(0);
    setAspects({});
    setCommentaire("");
  };

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-400"/></div>
  );

  return (
    <div className="pb-8">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Satisfaction</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Votre avis nous aide à améliorer nos activités.</p>

      {/* ── Formulaire ─────────────────────────────────────────────────────── */}
      {sent ? (
        <Card padding="lg" className="text-center mb-6">
          <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3"/>
          <h2 className="font-display text-lg font-bold text-green-700 mb-1">Merci pour votre avis !</h2>
          <p className="font-body text-sm text-gray-500 mb-4">Votre retour nous est précieux.</p>

          {globalNote === 5 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="font-body text-sm font-semibold text-amber-800 mb-1">⭐ Vous adorez le centre équestre !</p>
              <p className="font-body text-xs text-amber-700 mb-3">
                Partagez votre expérience sur Google pour aider d'autres familles à nous découvrir.
              </p>
              <a
                href="https://g.page/r/CfTtSmcBdnj6EBM/review"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white no-underline transition-colors"
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

          <button onClick={resetForm}
            className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
            Donner un autre avis
          </button>
        </Card>
      ) : (
        <Card padding="md" className="mb-6">
          <h2 className="font-display text-base font-bold text-blue-800 mb-4">Laisser un avis</h2>

          {/* Activité */}
          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-2">
              Activité concernée <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <div className="relative">
              <select value={selectedActivity} onChange={e => setSelectedActivity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 appearance-none cursor-pointer">
                <option value="">Général — Centre équestre</option>
                {pastReservations.map((r: any) => (
                  <option key={r.id} value={r.activityTitle}>{r.activityTitle}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
            </div>
          </div>

          {/* Note globale */}
          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Note globale *</label>
            <StarRating value={globalNote} onChange={setGlobalNote}/>
            {globalNote > 0 && (
              <p className="font-body text-xs text-slate-500 mt-1">
                {["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"][globalNote]}
              </p>
            )}
          </div>

          {/* Aspects */}
          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-2">
              Détail <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <div className="flex flex-col gap-2">
              {ASPECTS.map(a => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className="font-body text-sm text-slate-700">{a.label}</span>
                  <StarRating value={aspects[a.id] || 0} onChange={v => setAspects(p => ({ ...p, [a.id]: v }))}/>
                </div>
              ))}
            </div>
          </div>

          {/* Commentaire */}
          <div className="mb-5">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-2">
              Commentaire <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
              rows={3} placeholder="Partagez votre expérience..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 resize-none"/>
          </div>

          <button onClick={handleSubmit} disabled={globalNote === 0 || sending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
            Envoyer mon avis
          </button>
          {globalNote === 0 && (
            <p className="font-body text-[11px] text-slate-400 text-center mt-2">Sélectionnez une note pour continuer</p>
          )}
        </Card>
      )}

      {/* ── Historique des avis ─────────────────────────────────────────────── */}
      {myAvis.length > 0 && (
        <div>
          <h2 className="font-display text-base font-bold text-blue-800 mb-3">Mes avis précédents</h2>
          <div className="flex flex-col gap-3">
            {myAvis.map((a: any, i) => (
              <Card key={i} padding="sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-body text-sm font-semibold text-blue-800">{a.activityTitle || "Général"}</div>
                    {a.commentaire && (
                      <p className="font-body text-sm text-slate-600 mt-1">"{a.commentaire}"</p>
                    )}
                    {a.createdAt?.seconds && (
                      <p className="font-body text-[11px] text-slate-400 mt-1">
                        {new Date(a.createdAt.seconds * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={14} className={s <= a.globalNote ? "text-amber-400 fill-amber-400" : "text-gray-200"}/>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
