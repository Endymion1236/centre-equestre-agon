"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2,
  TrendingUp,
  BarChart3,
  PieChart,
  Users,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
} from "lucide-react";

// ─── Types locaux ───
interface Payment {
  id: string;
  familyName: string;
  items: { activityTitle: string; activityType?: string; priceHT: number; tva: number; priceTTC: number }[];
  totalTTC: number;
  paymentMode: string;
  date: any;
}

interface Creneau {
  id: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  enrolled: { childId: string; childName: string; horseName: string | null; presence: string }[];
  status: string;
}

interface FamilyData {
  id: string;
  parentName: string;
  children: { id: string; firstName: string; birthDate: any; galopLevel: string }[];
  createdAt: any;
}

interface Equide {
  id: string;
  name: string;
  type: string;
  status: string;
  maxReprisesPerDay: number;
  maxHeuresHebdo: number;
  birthDate: any;
}

// ─── Constantes ───
const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

const activityTypeLabels: Record<string, string> = {
  stage: "Stages", stage_journee: "Stages journée", balade: "Balades",
  cours: "Cours", competition: "Compétitions", anniversaire: "Anniversaires",
  ponyride: "Pony rides",
};

const activityTypeColors: Record<string, string> = {
  stage: "#2050A0", stage_journee: "#3068C0", balade: "#F0A010",
  cours: "#27ae60", competition: "#7c3aed", anniversaire: "#e74c3c",
  ponyride: "#e67e22",
};

// ─── Helpers ───
const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (d.seconds) return new Date(d.seconds * 1000);
  if (d.toDate) return d.toDate();
  if (d instanceof Date) return d;
  return new Date(d);
};

const creneauDuration = (c: Creneau): number => {
  const [sh, sm] = c.startTime.split(":").map(Number);
  const [eh, em] = c.endTime.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
};

const calcAge = (birthDate: any): number | null => {
  const d = toDate(birthDate);
  if (!d) return null;
  const now = new Date();
  return now.getFullYear() - d.getFullYear();
};

// ═══════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════
export default function StatistiquesPage() {
  const [tab, setTab] = useState<"ca" | "remplissage" | "moniteurs" | "cavaliers">("ca");
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  // Data
  const [payments, setPayments] = useState<Payment[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [families, setFamilies] = useState<FamilyData[]>([]);
  const [equides, setEquides] = useState<Equide[]>([]);

  // ─── Fetch ───
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [pSnap, cSnap, fSnap, eSnap] = await Promise.all([
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "creneaux")),
          getDocs(collection(db, "families")),
          getDocs(collection(db, "equides")),
        ]);
        setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
        setCreneaux(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Creneau)));
        setFamilies(fSnap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyData)));
        setEquides(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Equide)));
      } catch (e) {
        console.error("Erreur chargement stats:", e);
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  // ─── Filtrage par année ───
  const yearPayments = useMemo(() => {
    return payments.filter(p => {
      if ((p as any).status === "cancelled") return false;
      const d = toDate(p.date);
      return d && d.getFullYear() === year;
    });
  }, [payments, year]);

  const yearCreneaux = useMemo(() => {
    return creneaux.filter(c => {
      if (!c.date) return false;
      return new Date(c.date).getFullYear() === year;
    });
  }, [creneaux, year]);

  // ═══ CALCULS CA ═══
  const caParMois = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    yearPayments.forEach(p => {
      const d = toDate(p.date);
      if (d) months[d.getMonth()] += p.totalTTC || 0;
    });
    return months;
  }, [yearPayments]);

  const caParActivite = useMemo(() => {
    const map: Record<string, number> = {};
    yearPayments.forEach(p => {
      (p.items || []).forEach(item => {
        const type = item.activityType || "autre";
        map[type] = (map[type] || 0) + (item.priceTTC || 0);
      });
    });
    // Si pas de activityType dans items, grouper par activityTitle
    if (Object.keys(map).length <= 1) {
      const map2: Record<string, number> = {};
      yearPayments.forEach(p => {
        (p.items || []).forEach(item => {
          const key = item.activityTitle || "Autre";
          map2[key] = (map2[key] || 0) + (item.priceTTC || 0);
        });
      });
      return Object.entries(map2).sort(([, a], [, b]) => b - a);
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [yearPayments]);

  const caTotal = caParMois.reduce((s, v) => s + v, 0);
  const caMoisActuel = caParMois[new Date().getMonth()] || 0;
  const caMoisPrecedent = caParMois[Math.max(0, new Date().getMonth() - 1)] || 0;

  // ═══ CALCULS REMPLISSAGE & HEURES ═══
  const tauxRemplissage = useMemo(() => {
    const closed = yearCreneaux.filter(c => c.status === "closed" || (c.enrolled && c.enrolled.length > 0));
    if (closed.length === 0) return 0;
    const totalPlaces = closed.reduce((s, c) => s + (c.maxPlaces || 0), 0);
    const totalInscrits = closed.reduce((s, c) => s + (c.enrolled?.length || c.enrolledCount || 0), 0);
    return totalPlaces > 0 ? Math.round((totalInscrits / totalPlaces) * 100) : 0;
  }, [yearCreneaux]);

  const remplissageParType = useMemo(() => {
    const map: Record<string, { inscrits: number; places: number; count: number }> = {};
    yearCreneaux.forEach(c => {
      const type = c.activityType || "autre";
      if (!map[type]) map[type] = { inscrits: 0, places: 0, count: 0 };
      map[type].inscrits += c.enrolled?.length || c.enrolledCount || 0;
      map[type].places += c.maxPlaces || 0;
      map[type].count += 1;
    });
    return Object.entries(map)
      .map(([type, data]) => ({
        type,
        label: activityTypeLabels[type] || type,
        taux: data.places > 0 ? Math.round((data.inscrits / data.places) * 100) : 0,
        inscrits: data.inscrits,
        places: data.places,
        reprises: data.count,
      }))
      .sort((a, b) => b.taux - a.taux);
  }, [yearCreneaux]);

  const heuresParCheval = useMemo(() => {
    const map: Record<string, { name: string; heures: number; reprises: number }> = {};
    yearCreneaux.forEach(c => {
      const duration = creneauDuration(c);
      (c.enrolled || []).forEach(e => {
        if (e.horseName) {
          if (!map[e.horseName]) map[e.horseName] = { name: e.horseName, heures: 0, reprises: 0 };
          map[e.horseName].heures += duration;
          map[e.horseName].reprises += 1;
        }
      });
    });
    // Ajouter les équidés qui n'ont pas encore travaillé
    equides.filter(e => e.status === "actif").forEach(e => {
      if (!map[e.name]) map[e.name] = { name: e.name, heures: 0, reprises: 0 };
    });
    return Object.values(map).sort((a, b) => b.heures - a.heures);
  }, [yearCreneaux, equides]);

  const totalHeuresDispensees = yearCreneaux.reduce((s, c) => {
    return s + creneauDuration(c) * (c.enrolled?.length || c.enrolledCount || 0);
  }, 0);

  const heuresParMois = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    yearCreneaux.forEach(c => {
      const d = new Date(c.date);
      months[d.getMonth()] += creneauDuration(c);
    });
    return months;
  }, [yearCreneaux]);

  // ═══ CALCULS MONITEURS ═══
  const statsMoniteurs = useMemo(() => {
    const map: Record<string, { heures: number; reprises: number; cavaliers: number; types: Record<string, number> }> = {};
    yearCreneaux.forEach(c => {
      const mon = c.monitor || "Non assigné";
      if (!map[mon]) map[mon] = { heures: 0, reprises: 0, cavaliers: 0, types: {} };
      map[mon].heures += creneauDuration(c);
      map[mon].reprises += 1;
      map[mon].cavaliers += c.enrolled?.length || c.enrolledCount || 0;
      const type = c.activityType || "autre";
      map[mon].types[type] = (map[mon].types[type] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        heures: Math.round(data.heures * 10) / 10,
        reprises: data.reprises,
        cavaliers: data.cavaliers,
        moyenneCavaliers: data.reprises > 0 ? Math.round((data.cavaliers / data.reprises) * 10) / 10 : 0,
        types: Object.entries(data.types)
          .sort(([, a], [, b]) => b - a)
          .map(([type, count]) => ({ type, label: activityTypeLabels[type] || type, count })),
      }))
      .sort((a, b) => b.heures - a.heures);
  }, [yearCreneaux]);

  // ═══ CALCULS CAVALIERS ═══
  const cavalierParMois = useMemo(() => {
    const months = Array.from({ length: 12 }, () => new Set<string>());
    yearCreneaux.forEach(c => {
      const d = new Date(c.date);
      (c.enrolled || []).forEach(e => {
        months[d.getMonth()].add(e.childId || e.childName);
      });
    });
    return months.map(s => s.size);
  }, [yearCreneaux]);

  const totalCavaliersUniques = useMemo(() => {
    const set = new Set<string>();
    yearCreneaux.forEach(c => {
      (c.enrolled || []).forEach(e => set.add(e.childId || e.childName));
    });
    return set.size;
  }, [yearCreneaux]);

  const totalFamilles = families.length;
  const totalEnfants = families.reduce((s, f) => s + (f.children?.length || 0), 0);

  const ageMoyen = useMemo(() => {
    const ages: number[] = [];
    families.forEach(f => {
      (f.children || []).forEach(c => {
        const age = calcAge(c.birthDate);
        if (age !== null && age > 0 && age < 80) ages.push(age);
      });
    });
    return ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0;
  }, [families]);

  const ageMoyenCavalerie = useMemo(() => {
    const ages: number[] = [];
    equides.forEach(e => {
      const age = calcAge(e.birthDate);
      if (age !== null && age > 0 && age < 50) ages.push(age);
    });
    return ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0;
  }, [equides]);

  const inscriptionsParMois = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    families.forEach(f => {
      const d = toDate(f.createdAt);
      if (d && d.getFullYear() === year) months[d.getMonth()] += 1;
    });
    return months;
  }, [families, year]);

  // ─── Styles ───
  const tabs = [
    { id: "ca" as const, label: "Chiffre d'affaires", icon: TrendingUp },
    { id: "remplissage" as const, label: "Remplissage & heures", icon: BarChart3 },
    { id: "moniteurs" as const, label: "Moniteurs", icon: Clock },
    { id: "cavaliers" as const, label: "Cavaliers", icon: Users },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Statistiques</h1>
          <p className="font-body text-xs text-gray-400">
            Analyse de l&apos;activité du centre — {yearCreneaux.length} reprises · {yearPayments.length} paiements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)}
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-50">
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="font-body text-sm font-semibold text-blue-800 min-w-[50px] text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()}
            className={`w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer
              ${year >= new Date().getFullYear() ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-50"}`}>
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all whitespace-nowrap
                ${tab === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ ONGLET CA ═══ */}
      {tab === "ca" && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-blue-500">{Math.round(caTotal).toLocaleString("fr-FR")}€</div>
              <div className="font-body text-xs text-gray-400">CA total {year} (TTC)</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-green-600">{Math.round(caMoisActuel).toLocaleString("fr-FR")}€</div>
              <div className="font-body text-xs text-gray-400">Ce mois</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-orange-500">
                {caTotal > 0 ? Math.round(caTotal / 12).toLocaleString("fr-FR") : 0}€
              </div>
              <div className="font-body text-xs text-gray-400">Moyenne mensuelle</div>
            </Card>
            <Card padding="sm">
              <div className={`font-body text-2xl font-bold ${caMoisActuel >= caMoisPrecedent ? "text-green-600" : "text-red-500"}`}>
                {caMoisPrecedent > 0 ? `${caMoisActuel >= caMoisPrecedent ? "+" : ""}${Math.round(((caMoisActuel - caMoisPrecedent) / caMoisPrecedent) * 100)}%` : "—"}
              </div>
              <div className="font-body text-xs text-gray-400">vs mois précédent</div>
            </Card>
          </div>

          {/* Graphique CA mensuel — barres CSS */}
          <Card padding="md" className="mb-6">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Évolution du CA mensuel — {year}</h3>
            <div className="flex items-end gap-2 h-48">
              {caParMois.map((val, i) => {
                const maxVal = Math.max(...caParMois, 1);
                const pct = (val / maxVal) * 100;
                const isCurrent = i === new Date().getMonth() && year === new Date().getFullYear();
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-body text-[10px] text-gray-400 font-medium">
                      {val > 0 ? `${Math.round(val / 1000)}k` : ""}
                    </span>
                    <div className="w-full flex items-end" style={{ height: "140px" }}>
                      <div
                        className={`w-full rounded-t-md transition-all ${isCurrent ? "bg-blue-500" : val > 0 ? "bg-blue-200" : "bg-gray-100"}`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                        title={`${MONTHS_FR[i]} : ${Math.round(val).toLocaleString("fr-FR")}€`}
                      />
                    </div>
                    <span className={`font-body text-[10px] ${isCurrent ? "font-semibold text-blue-500" : "text-gray-400"}`}>
                      {MONTHS_SHORT[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* CA par activité */}
          <Card padding="md">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">CA par catégorie d&apos;activité</h3>
            {caParActivite.length === 0 ? (
              <p className="font-body text-sm text-gray-400 text-center py-6">Aucune donnée de paiement pour {year}.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {caParActivite.map(([type, amount]) => {
                  const pct = caTotal > 0 ? Math.round((amount / caTotal) * 100) : 0;
                  const color = activityTypeColors[type] || "#888";
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="font-body text-sm text-gray-600 min-w-[140px]">{activityTypeLabels[type] || type}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="font-body text-sm font-semibold text-blue-800 min-w-[80px] text-right">
                        {Math.round(amount).toLocaleString("fr-FR")}€
                      </span>
                      <span className="font-body text-xs text-gray-400 min-w-[40px] text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ═══ ONGLET REMPLISSAGE & HEURES ═══ */}
      {tab === "remplissage" && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card padding="sm">
              <div className={`font-body text-2xl font-bold ${tauxRemplissage > 70 ? "text-green-600" : tauxRemplissage > 40 ? "text-orange-500" : "text-red-500"}`}>
                {tauxRemplissage}%
              </div>
              <div className="font-body text-xs text-gray-400">Taux de remplissage moyen</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-blue-500">{yearCreneaux.length}</div>
              <div className="font-body text-xs text-gray-400">Reprises planifiées</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-green-600">{Math.round(totalHeuresDispensees)}</div>
              <div className="font-body text-xs text-gray-400">Heures-cavalier dispensées</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-orange-500">
                {yearCreneaux.length > 0 ? Math.round(heuresParMois.reduce((s, v) => s + v, 0)).toLocaleString("fr-FR") : 0}
              </div>
              <div className="font-body text-xs text-gray-400">Heures de travail total</div>
            </Card>
          </div>

          {/* Taux de remplissage par type */}
          <Card padding="md" className="mb-6">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Taux de remplissage par catégorie</h3>
            {remplissageParType.length === 0 ? (
              <p className="font-body text-sm text-gray-400 text-center py-6">Aucune reprise pour {year}.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {remplissageParType.map(r => {
                  const color = r.taux > 70 ? "#27ae60" : r.taux > 40 ? "#F0A010" : "#e74c3c";
                  return (
                    <div key={r.type} className="flex items-center gap-3">
                      <span className="font-body text-sm text-gray-600 min-w-[120px]">{r.label}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.taux}%`, backgroundColor: color }} />
                      </div>
                      <span className="font-body text-sm font-semibold min-w-[40px] text-right" style={{ color }}>{r.taux}%</span>
                      <span className="font-body text-xs text-gray-400 min-w-[100px] text-right">
                        {r.inscrits}/{r.places} places · {r.reprises} reprises
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Heures dispensées par mois */}
          <Card padding="md" className="mb-6">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Heures dispensées par mois</h3>
            <div className="flex items-end gap-2 h-40">
              {heuresParMois.map((val, i) => {
                const maxVal = Math.max(...heuresParMois, 1);
                const pct = (val / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-body text-[10px] text-gray-400 font-medium">{val > 0 ? Math.round(val) : ""}</span>
                    <div className="w-full flex items-end" style={{ height: "110px" }}>
                      <div className={`w-full rounded-t-md transition-all ${val > 0 ? "bg-green-300" : "bg-gray-100"}`}
                        style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="font-body text-[10px] text-gray-400">{MONTHS_SHORT[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Heures par cheval */}
          <Card padding="md">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">
              Heures par cheval ({heuresParCheval.length} équidés)
            </h3>
            {heuresParCheval.length === 0 ? (
              <p className="font-body text-sm text-gray-400 text-center py-6">Aucune donnée.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {heuresParCheval.map(h => {
                  const equide = equides.find(e => e.name === h.name);
                  const maxHebdo = equide?.maxHeuresHebdo || 15;
                  // Estimation semaine courante (simplifié)
                  const maxTotal = maxHebdo * 52;
                  const pct = maxTotal > 0 ? Math.min(Math.round((h.heures / maxTotal) * 100), 100) : 0;
                  return (
                    <div key={h.name} className="flex items-center gap-3">
                      <span className="font-body text-sm font-medium text-blue-800 min-w-[100px]">{h.name}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct > 80 ? "bg-red-400" : pct > 50 ? "bg-orange-300" : "bg-blue-300"}`}
                          style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                      <span className="font-body text-xs font-medium text-gray-500 min-w-[90px] text-right">
                        {Math.round(h.heures)}h · {h.reprises} reprises
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ═══ ONGLET MONITEURS ═══ */}
      {tab === "moniteurs" && (
        <>
          {statsMoniteurs.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Users size={28} className="text-blue-300" /></div>
              <p className="font-body text-sm text-gray-500">Aucune reprise enregistrée pour {year}.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              {statsMoniteurs.map(m => (
                <Card key={m.name} padding="md">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center font-display text-lg font-bold text-blue-500">
                      {m.name[0]}
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-base font-bold text-blue-800">{m.name}</div>
                      <div className="font-body text-xs text-gray-400">{m.reprises} reprises · {m.heures}h enseignées</div>
                    </div>
                  </div>

                  {/* Stats grille */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <div className="font-body text-lg font-bold text-blue-500">{m.heures}h</div>
                      <div className="font-body text-[10px] text-gray-400">Heures</div>
                    </div>
                    <div className="bg-green-50 rounded-lg px-3 py-2">
                      <div className="font-body text-lg font-bold text-green-600">{m.reprises}</div>
                      <div className="font-body text-[10px] text-gray-400">Reprises</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg px-3 py-2">
                      <div className="font-body text-lg font-bold text-orange-500">{m.cavaliers}</div>
                      <div className="font-body text-[10px] text-gray-400">Cavaliers encadrés</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg px-3 py-2">
                      <div className="font-body text-lg font-bold text-purple-600">{m.moyenneCavaliers}</div>
                      <div className="font-body text-[10px] text-gray-400">Moy. cavaliers/reprise</div>
                    </div>
                  </div>

                  {/* Répartition par discipline */}
                  <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Répartition par discipline</div>
                  <div className="flex flex-wrap gap-2">
                    {m.types.map(t => (
                      <span key={t.type} className="font-body text-xs px-3 py-1 rounded-full"
                        style={{ backgroundColor: (activityTypeColors[t.type] || "#888") + "18", color: activityTypeColors[t.type] || "#888" }}>
                        {t.label} ({t.count})
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ ONGLET CAVALIERS ═══ */}
      {tab === "cavaliers" && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-blue-500">{totalFamilles}</div>
              <div className="font-body text-xs text-gray-400">Familles inscrites</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-green-600">{totalEnfants}</div>
              <div className="font-body text-xs text-gray-400">Cavaliers enregistrés</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-orange-500">{totalCavaliersUniques}</div>
              <div className="font-body text-xs text-gray-400">Cavaliers actifs {year}</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-2xl font-bold text-purple-600">{ageMoyen > 0 ? `${ageMoyen} ans` : "—"}</div>
              <div className="font-body text-xs text-gray-400">Âge moyen cavaliers</div>
            </Card>
          </div>

          {/* Cavaliers actifs par mois */}
          <Card padding="md" className="mb-6">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Cavaliers actifs par mois — {year}</h3>
            <div className="flex items-end gap-2 h-40">
              {cavalierParMois.map((val, i) => {
                const maxVal = Math.max(...cavalierParMois, 1);
                const pct = (val / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-body text-[10px] text-gray-400 font-medium">{val > 0 ? val : ""}</span>
                    <div className="w-full flex items-end" style={{ height: "110px" }}>
                      <div className={`w-full rounded-t-md transition-all ${val > 0 ? "bg-purple-300" : "bg-gray-100"}`}
                        style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="font-body text-[10px] text-gray-400">{MONTHS_SHORT[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Nouvelles inscriptions */}
          <Card padding="md" className="mb-6">
            <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Nouvelles inscriptions familles — {year}</h3>
            <div className="flex items-end gap-2 h-32">
              {inscriptionsParMois.map((val, i) => {
                const maxVal = Math.max(...inscriptionsParMois, 1);
                const pct = (val / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-body text-[10px] text-gray-400 font-medium">{val > 0 ? val : ""}</span>
                    <div className="w-full flex items-end" style={{ height: "90px" }}>
                      <div className={`w-full rounded-t-md transition-all ${val > 0 ? "bg-blue-300" : "bg-gray-100"}`}
                        style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="font-body text-[10px] text-gray-400">{MONTHS_SHORT[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Âges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="md">
              <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">Âge moyen des cavaliers</h3>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center">
                  <span className="font-body text-xl font-bold text-purple-600">{ageMoyen > 0 ? ageMoyen : "—"}</span>
                </div>
                <div className="font-body text-sm text-gray-500">
                  {totalEnfants} cavaliers enregistrés
                  {ageMoyen > 0 && <div className="text-xs text-gray-400 mt-0.5">Âge moyen : {ageMoyen} ans</div>}
                </div>
              </div>
            </Card>
            <Card padding="md">
              <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">Âge moyen de la cavalerie</h3>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                  <span className="font-body text-xl font-bold text-blue-500">{ageMoyenCavalerie > 0 ? ageMoyenCavalerie : "—"}</span>
                </div>
                <div className="font-body text-sm text-gray-500">
                  {equides.filter(e => e.status === "actif").length} équidés actifs
                  {ageMoyenCavalerie > 0 && <div className="text-xs text-gray-400 mt-0.5">Âge moyen : {ageMoyenCavalerie} ans</div>}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
