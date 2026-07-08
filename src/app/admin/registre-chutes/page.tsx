"use client";
import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { AlertTriangle, Search } from "lucide-react";

export default function RegistreChutesPage() {
  const [chutes, setChutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "chutes"));
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        // Tri par date décroissante, puis par heure de créneau décroissante.
        rows.sort((a, b) => {
          if ((a.date || "") !== (b.date || "")) return (a.date || "") < (b.date || "") ? 1 : -1;
          return (b.startTime || "").localeCompare(a.startTime || "");
        });
        setChutes(rows);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const gravBadge = (g: string) =>
    g === "grave" ? <Badge color="red">Grave</Badge>
    : g === "moderee" ? <Badge color="orange">Modérée</Badge>
    : g === "legere" ? <Badge color="green">Légère</Badge>
    : null;

  const fmtFR = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch {
      return d;
    }
  };

  const norm = (s: string) => (s || "").toLowerCase();
  const filtered = chutes.filter((c) => {
    if (!q.trim()) return true;
    const t = norm(q);
    return (
      norm(c.childName).includes(t) ||
      norm(c.horseDisplay || c.horseName).includes(t) ||
      norm(c.monitor).includes(t) ||
      norm(c.circonstances).includes(t) ||
      norm(c.activityTitle).includes(t)
    );
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <AlertTriangle size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Registre des chutes</h1>
            <p className="font-body text-xs text-slate-600">Chutes signalées en séance · poney, circonstances et suites</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (cavalier, poney, moniteur…)"
            className="font-body text-sm border-none outline-none w-56 max-w-full bg-transparent"
          />
        </div>
      </div>

      {!loading && chutes.length > 0 && (
        <p className="font-body text-xs text-slate-500 mb-3">
          {filtered.length} chute{filtered.length > 1 ? "s" : ""}{q.trim() ? ` sur ${chutes.length}` : " au total"}
        </p>
      )}

      {loading ? (
        <p className="font-body text-sm text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center font-body text-sm text-slate-500">
            {chutes.length === 0 ? "Aucune chute enregistrée. Tant mieux !" : "Aucun résultat pour cette recherche."}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-body text-sm font-bold text-blue-800">{c.childName}</span>
                  {(c.horseDisplay || c.horseName) && <Badge color="blue">🐴 {c.horseDisplay || c.horseName}</Badge>}
                  {gravBadge(c.gravite)}
                </div>
                <div className="font-body text-xs text-slate-500 mt-0.5 capitalize">
                  {fmtFR(c.date)} · {c.activityTitle} ({c.startTime}{c.endTime ? `–${c.endTime}` : ""}){c.monitor ? ` · ${c.monitor}` : ""}
                </div>
                <p className="font-body text-sm text-slate-700 mt-2 whitespace-pre-wrap">{c.circonstances}</p>
                {c.suites && (
                  <p className="font-body text-xs text-slate-500 mt-1.5">
                    <span className="font-semibold">Suites :</span> {c.suites}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
