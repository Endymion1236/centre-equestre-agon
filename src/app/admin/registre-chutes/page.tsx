"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { AlertTriangle, Search, User, BarChart3, Download } from "lucide-react";
import { toLocalDateString } from "@/lib/date-local";

type Period = "mois" | "saison" | "tout";

const gravLabel = (g: string) => g === "grave" ? "Grave" : g === "moderee" ? "Modérée" : g === "legere" ? "Légère" : "";
const consLabel = (v: string) => v === "arret" ? "Arrête l'équitation" : v === "refuse" ? "A refusé de remonter" : v === "remonte" ? "Est remonté" : "";

export default function RegistreChutesPage() {
  const [chutes, setChutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showStats, setShowStats] = useState(true);
  const [period, setPeriod] = useState<Period>("saison");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "chutes"));
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
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

  // ── Filtre période ────────────────────────────────────────────────────────
  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "mois") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    if (period === "saison") { const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1; return `${y}-09-01`; }
    return "";
  }, [period]);

  const periodChutes = useMemo(
    () => (period === "tout" ? chutes : chutes.filter((c) => (c.date || "") >= periodStart)),
    [chutes, period, periodStart]
  );

  const gravBadge = (g: string) =>
    g === "grave" ? <Badge color="red">Grave</Badge>
    : g === "moderee" ? <Badge color="orange">Modérée</Badge>
    : g === "legere" ? <Badge color="green">Légère</Badge>
    : null;

  const consBadge = (v: string) =>
    v === "arret" ? <Badge color="red">Arrête l&apos;équitation</Badge>
    : v === "refuse" ? <Badge color="orange">A refusé de remonter</Badge>
    : v === "remonte" ? <Badge color="green">Est remonté</Badge>
    : null;

  const fmtFR = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch {
      return d;
    }
  };

  // ── Statistiques (sur la période sélectionnée) ─────────────────────────────
  const stats = useMemo(() => {
    const countBy = (getKey: (c: any) => string) => {
      const m: Record<string, number> = {};
      periodChutes.forEach((c) => { const k = (getKey(c) || "").trim(); if (k) m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const cons = { remonte: 0, refuse: 0, arret: 0, none: 0 };
    periodChutes.forEach((c) => {
      if (c.consequence === "remonte") cons.remonte++;
      else if (c.consequence === "refuse") cons.refuse++;
      else if (c.consequence === "arret") cons.arret++;
      else cons.none++;
    });
    return {
      parEnseignant: countBy((c) => c.monitor),
      parCheval: countBy((c) => c.horseDisplay || c.horseName),
      cons,
    };
  }, [periodChutes]);

  const RankedList = ({ rows, emptyLabel }: { rows: [string, number][]; emptyLabel: string }) => {
    if (rows.length === 0) return <p className="font-body text-xs text-slate-400">{emptyLabel}</p>;
    const max = rows[0][1] || 1;
    return (
      <div className="flex flex-col gap-1.5 max-h-56 overflow-auto">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-body text-xs text-slate-700 truncate flex-1" title={label}>{label}</span>
            <div className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden shrink-0">
              <div className="h-full bg-red-500" style={{ width: `${Math.round((n / max) * 100)}%` }} />
            </div>
            <span className="font-body text-xs font-bold text-blue-800 w-5 text-right shrink-0">{n}</span>
          </div>
        ))}
      </div>
    );
  };

  const norm = (s: string) => (s || "").toLowerCase();
  const filtered = periodChutes.filter((c) => {
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

  // ── Export CSV (ce qui est affiché : période + recherche) ──────────────────
  const exportCSV = () => {
    const headers = ["Date", "Cavalier", "Poney", "Enseignant", "Créneau", "Gravité", "Conséquence", "Circonstances", "Suites"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " / ")}"`;
    const lines = filtered.map((c) => [
      c.date,
      c.childName,
      c.horseDisplay || c.horseName,
      c.monitor,
      `${c.activityTitle || ""} (${c.startTime || ""}${c.endTime ? "–" + c.endTime : ""})`,
      gravLabel(c.gravite),
      consLabel(c.consequence),
      c.circonstances,
      c.suites,
    ].map(esc).join(";"));
    const csv = "\uFEFF" + [headers.map(esc).join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registre-chutes_${period}_${toLocalDateString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const periodLabel: Record<Period, string> = { mois: "ce mois", saison: "cette saison", tout: "au total" };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <AlertTriangle size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Registre des chutes</h1>
            <p className="font-body text-xs text-slate-600">Chutes signalées en séance · poney, circonstances, conséquence et suites</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full sm:w-auto">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (cavalier, poney, moniteur…)"
            className="font-body text-sm border-none outline-none flex-1 sm:w-56 bg-transparent min-w-0"
          />
        </div>
      </div>

      {/* ── Barre période + export ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 w-full sm:w-auto">
          {(["mois", "saison", "tout"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`flex-1 sm:flex-initial font-body text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer border-none ${period === p ? "bg-blue-800 text-white" : "bg-transparent text-slate-500 hover:bg-gray-50"}`}
            >
              {p === "mois" ? "Ce mois" : p === "saison" ? "Cette saison" : "Tout"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className={`flex items-center justify-center gap-1.5 font-body text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer w-full sm:w-auto ${filtered.length === 0 ? "bg-gray-50 text-slate-300 border-gray-100 cursor-not-allowed" : "bg-white text-blue-800 border-gray-200 hover:bg-blue-50"}`}
        >
          <Download size={14} /> Exporter CSV
        </button>
      </div>

      {/* ── Statistiques ──────────────────────────────────────────────────── */}
      {!loading && periodChutes.length > 0 && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowStats((s) => !s)}
            className="flex items-center gap-2 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer mb-2 p-0"
          >
            <BarChart3 size={16} /> Statistiques ({periodLabel[period]}) {showStats ? "▾" : "▸"}
          </button>
          {showStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card>
                <p className="font-body text-xs font-bold text-blue-800 mb-2">Conséquences</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-green-700">Est remonté</span>
                    <span className="font-body text-sm font-bold text-green-700">{stats.cons.remonte}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-amber-700">A refusé de remonter</span>
                    <span className="font-body text-sm font-bold text-amber-700">{stats.cons.refuse}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-red-700">Arrête l&apos;équitation</span>
                    <span className="font-body text-sm font-bold text-red-700">{stats.cons.arret}</span>
                  </div>
                  {stats.cons.none > 0 && (
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <span className="font-body text-xs text-slate-400">Non renseigné</span>
                      <span className="font-body text-sm font-bold text-slate-400">{stats.cons.none}</span>
                    </div>
                  )}
                </div>
              </Card>
              <Card>
                <p className="font-body text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5"><User size={13} /> Par enseignant</p>
                <RankedList rows={stats.parEnseignant} emptyLabel="Aucun enseignant renseigné" />
              </Card>
              <Card>
                <p className="font-body text-xs font-bold text-blue-800 mb-2">🐴 Par cheval</p>
                <RankedList rows={stats.parCheval} emptyLabel="Aucun cheval renseigné" />
              </Card>
            </div>
          )}
        </div>
      )}

      {!loading && periodChutes.length > 0 && (
        <p className="font-body text-xs text-slate-500 mb-3">
          {filtered.length} chute{filtered.length > 1 ? "s" : ""}{q.trim() ? ` sur ${periodChutes.length}` : ` (${periodLabel[period]})`}
        </p>
      )}

      {loading ? (
        <p className="font-body text-sm text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center font-body text-sm text-slate-500">
            {chutes.length === 0
              ? "Aucune chute enregistrée. Tant mieux !"
              : periodChutes.length === 0
              ? `Aucune chute ${periodLabel[period]}.`
              : "Aucun résultat pour cette recherche."}
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
                  {consBadge(c.consequence)}
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
