"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, Ticket, CheckCircle, Clock, XCircle, Printer } from "lucide-react";

interface BonRecup {
  id: string;
  childName: string;
  familyName: string;
  familyId: string;
  originalDate: string;
  originalActivity: string;
  originalCreneauId: string;
  reason: string;
  status: "active" | "used" | "expired";
  usedDate?: string;
  usedActivity?: string;
  expiresAt: string;
  createdAt: any;
}

export default function BonsRecupPage() {
  const [bons, setBons] = useState<BonRecup[]>([]);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "generate" | "history">("active");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Generate form
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedCreneau, setSelectedCreneau] = useState<any>(null);

  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);
  const dateStr = currentDay.toISOString().split("T")[0];

  const fetchData = async () => {
    try {
      const [bonSnap, crSnap] = await Promise.all([
        getDocs(collection(db, "bonsRecup")),
        getDocs(query(collection(db, "creneaux"), where("date", "==", dateStr))),
      ]);
      setBons(bonSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)) as BonRecup[]);
      setCreneaux(crSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.startTime?.localeCompare(b.startTime)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dayOffset]);

  const activeBons = bons.filter(b => b.status === "active");
  const usedBons = bons.filter(b => b.status === "used");
  const expiredBons = bons.filter(b => b.status === "expired" || (b.status === "active" && b.expiresAt < new Date().toISOString().split("T")[0]));

  const generateBonsForCreneau = async (creneau: any) => {
    if (!creneau?.enrolled) return;
    const absents = creneau.enrolled.filter((e: any) => e.presence === "absent");
    if (absents.length === 0) { alert("Aucun absent dans cette reprise."); return; }

    setSaving(true);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3); // Expire dans 3 mois
    let created = 0;

    for (const absent of absents) {
      // Check if bon already exists for this creneau + child
      const existing = bons.find(b => b.originalCreneauId === creneau.id && b.childName === absent.childName);
      if (existing) continue;

      await addDoc(collection(db, "bonsRecup"), {
        childName: absent.childName,
        familyName: absent.familyName || "",
        familyId: absent.familyId || "",
        originalDate: creneau.date,
        originalActivity: creneau.activityTitle,
        originalCreneauId: creneau.id,
        reason: "Absence",
        status: "active",
        expiresAt: expiresAt.toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      });
      created++;
    }

    alert(`✅ ${created} bon(s) de récupération créé(s) pour ${absents.length} absent(s).`);
    setSaving(false);
    setSelectedCreneau(null);
    fetchData();
  };

  const markUsed = async (bonId: string) => {
    const usedActivity = ""; // TODO: remplacer par input inline
    if (!usedActivity) { alert("Veuillez indiquer l'activité."); return; }
    await updateDoc(doc(db, "bonsRecup", bonId), {
      status: "used",
      usedDate: new Date().toISOString().split("T")[0],
      usedActivity,
    });
    fetchData();
  };

  const markExpired = async (bonId: string) => {
    await updateDoc(doc(db, "bonsRecup", bonId), { status: "expired" });
    fetchData();
  };

  const filtered = (tab === "active" ? activeBons : tab === "history" ? [...usedBons, ...expiredBons] : []).filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.childName?.toLowerCase().includes(q) || b.familyName?.toLowerCase().includes(q);
  });

  const typeColors: Record<string, string> = { stage: "#27ae60", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed" };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Bons de récupération</h1>
          <p className="font-body text-xs text-gray-400">Gérer les bons de rattrapage pour les cavaliers absents</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
          <Printer size={16} /> Imprimer
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Ticket size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{activeBons.length}</div><div className="font-body text-xs text-gray-400">bons actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{usedBons.length}</div><div className="font-body text-xs text-gray-400">utilisés</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Clock size={20} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{expiredBons.length}</div><div className="font-body text-xs text-gray-400">expirés</div></div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { id: "active" as const, l: `Bons actifs (${activeBons.length})` },
          { id: "generate" as const, l: "Générer depuis le montoir" },
          { id: "history" as const, l: `Historique (${usedBons.length + expiredBons.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${tab === t.id ? "text-white bg-blue-500" : "text-gray-500 bg-white border border-gray-200"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Active / History tabs */}
      {(tab === "active" || tab === "history") && (
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un cavalier..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
          </div>

          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          filtered.length === 0 ? (
            <Card padding="lg" className="text-center">
              <span className="text-4xl block mb-3">🎫</span>
              <p className="font-body text-sm text-gray-500">{tab === "active" ? "Aucun bon actif." : "Aucun historique."}</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(b => (
                <Card key={b.id} padding="sm" className={b.status === "expired" ? "opacity-50" : ""}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-lg">🎫</div>
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{b.childName} <span className="font-normal text-gray-400">({b.familyName})</span></div>
                        <div className="font-body text-xs text-gray-400">
                          Absent le {b.originalDate} — {b.originalActivity}
                          {b.status === "active" && ` · Expire le ${b.expiresAt}`}
                          {b.status === "used" && ` · Utilisé le ${b.usedDate} → ${b.usedActivity}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={b.status === "active" ? "blue" : b.status === "used" ? "green" : "gray"}>
                        {b.status === "active" ? "Actif" : b.status === "used" ? "Utilisé" : "Expiré"}
                      </Badge>
                      {b.status === "active" && (
                        <>
                          <button onClick={() => markUsed(b.id)} className="font-body text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                            ✓ Marquer utilisé
                          </button>
                          <button onClick={() => markExpired(b.id)} className="font-body text-xs text-gray-400 bg-transparent border-none cursor-pointer hover:text-red-500">
                            <XCircle size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate tab */}
      {tab === "generate" && (
        <div>
          <Card padding="md" className="mb-4 !bg-blue-50/50">
            <p className="font-body text-sm text-blue-800">
              💡 Sélectionnez une reprise clôturée avec des absents. Le système créera automatiquement un bon de récupération par absent, valable 3 mois.
            </p>
          </Card>

          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setDayOffset(d => d - 1)} className="font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">← Veille</button>
            <div className="font-display text-base font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div className="flex gap-2">
              <button onClick={() => setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button>
              <button onClick={() => setDayOffset(d => d + 1)} className="font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain →</button>
            </div>
          </div>

          {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div> :
          creneaux.length === 0 ? <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucune reprise ce jour.</p></Card> :
          <div className="flex flex-col gap-2">
            {creneaux.map(c => {
              const absents = (c.enrolled || []).filter((e: any) => e.presence === "absent");
              const alreadyGenerated = bons.filter(b => b.originalCreneauId === c.id).length;
              return (
                <Card key={c.id} padding="sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-10 rounded-full" style={{ background: typeColors[c.activityType] || "#666" }} />
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                        <div className="font-body text-xs text-gray-400">
                          {c.startTime}–{c.endTime} · {c.monitor} · {(c.enrolled || []).length} inscrits · <span className={absents.length > 0 ? "text-red-500 font-semibold" : ""}>{absents.length} absent(s)</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alreadyGenerated > 0 && <Badge color="green">{alreadyGenerated} bon(s) déjà créé(s)</Badge>}
                      {absents.length > 0 ? (
                        <button onClick={() => generateBonsForCreneau(c)} disabled={saving}
                          className="font-body text-xs font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40">
                          {saving ? "..." : `Générer ${absents.length} bon(s)`}
                        </button>
                      ) : (
                        <span className="font-body text-xs text-gray-400">Pas d&apos;absent</span>
                      )}
                    </div>
                  </div>
                  {/* List absents */}
                  {absents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
                      {absents.map((a: any, i: number) => (
                        <span key={i} className="font-body text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                          ✗ {a.childName}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>}
        </div>
      )}
    </div>
  );
}
