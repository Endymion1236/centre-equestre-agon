"use client";
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";

// ── Helpers ────────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface EnrolledChild { childId: string; childName: string; horseName?: string; presence?: string; }
interface Creneau { id: string; activityTitle: string; startTime: string; endTime: string; monitor: string; enrolled: EnrolledChild[]; }
interface Equide { id: string; nom: string; type: "cheval" | "poney" | string; ordre?: number; }

// ── Couleurs par type d'équidé ─────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = { cheval: "#2050A0", poney: "#16a34a", default: "#666" };

export default function MontiorDisplayClient() {
  const params = useSearchParams();
  const dateParam = params.get("date");

  const [dateStr, setDateStr] = useState(dateParam || toDateStr(new Date()));
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [equides, setEquides] = useState<Equide[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [cSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db, "creneaux"), where("date", "==", dateStr))),
        getDocs(collection(db, "equides")),
      ]);
      const cData = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Creneau))
        .filter(c => (c.enrolled || []).length > 0)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      setCreneaux(cData);
      setEquides(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Equide)).sort((a, b) => (a.ordre || 99) - (b.ordre || 99)));
      setLastUpdate(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Rafraîchissement auto toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Séparer chevaux et poneys
  const chevaux = equides.filter(e => e.type === "cheval");
  const poneys = equides.filter(e => e.type !== "cheval");

  // Pour un équidé donné : trouver les cavaliers assignés par créneau
  const getRiders = (equideNom: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const c of creneaux) {
      const riders = (c.enrolled || [])
        .filter(e => e.horseName === equideNom)
        .map(e => e.childName?.split(" ")[0] || e.childName || "?"); // Prénom seulement
      if (riders.length > 0) result[`${c.startTime}–${c.endTime}`] = riders;
    }
    return result;
  };

  // Créneaux horaires uniques triés
  const horaires = [...new Set(creneaux.map(c => `${c.startTime}–${c.endTime}`))].sort();

  if (loading) return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingText}>⏳ Chargement du montoir...</div>
    </div>
  );

  const renderTable = (title: string, list: Equide[], color: string) => (
    <div style={styles.tableSection}>
      {/* En-tête section */}
      <div style={{ ...styles.sectionHeader, background: color }}>
        {title}
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thName}>{title === "PONEYS" ? "Poney" : "Cheval"}</th>
            {horaires.map(h => (
              <th key={h} style={styles.thSlot}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((eq, idx) => {
            const riders = getRiders(eq.nom);
            const hasAny = Object.keys(riders).length > 0;
            return (
              <tr key={eq.id} style={{ background: idx % 2 === 0 ? "#f8faff" : "#fff" }}>
                <td style={{ ...styles.tdName, opacity: hasAny ? 1 : 0.35 }}>
                  {eq.nom}
                </td>
                {horaires.map(h => {
                  const names = riders[h] || [];
                  return (
                    <td key={h} style={styles.tdSlot}>
                      {names.length > 0 ? (
                        <div style={styles.riderCell}>
                          {names.map((n, i) => (
                            <span key={i} style={{ ...styles.riderBadge, background: color + "18", color, borderColor: color + "40" }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={styles.empty}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>🏇</div>
          <div>
            <div style={styles.headerTitle}>MONTOIR</div>
            <div style={styles.headerSub}>Centre Équestre d'Agon-Coutainville</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.dateBox}>
            {new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={styles.updateBox}>
            🔄 {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Corps : 2 colonnes */}
      {creneaux.length === 0 ? (
        <div style={styles.empty2}>
          <div style={{ fontSize: 64 }}>🌟</div>
          <div style={{ marginTop: 16, fontSize: 24, color: "#94a3b8" }}>Aucune séance planifiée pour aujourd'hui</div>
        </div>
      ) : (
        <div style={styles.body}>
          <div style={styles.col}>
            {renderTable("CHEVAUX", chevaux, "#2050A0")}
          </div>
          <div style={styles.divider} />
          <div style={styles.col}>
            {renderTable("PONEYS", poneys, "#16a34a")}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span>📅 Sélectionner une date :</span>
        <input type="date" value={dateStr} onChange={e => { setDateStr(e.target.value); setLoading(true); }}
          style={styles.dateInput} />
        <span style={{ marginLeft: 24, color: "#64748b", fontSize: 13 }}>
          Rafraîchissement automatique toutes les 30 secondes
        </span>
      </div>
    </div>
  );
}

// ── Styles inline pour garantir le rendu grand écran ──────────────────────────
const styles: Record<string, React.CSSProperties> = {
  loadingScreen: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0C1A2E" },
  loadingText: { color: "#fff", fontSize: 24, fontFamily: "sans-serif" },
  page: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f0f4ff", fontFamily: "'Segoe UI', sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px", background: "#0C1A2E", color: "#fff", flexShrink: 0 },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  logo: { fontSize: 40 },
  headerTitle: { fontSize: 28, fontWeight: 800, letterSpacing: 3, color: "#F0A010" },
  headerSub: { fontSize: 13, color: "#94a3b8", marginTop: 2 },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  dateBox: { fontSize: 18, fontWeight: 600, textTransform: "capitalize", color: "#e2e8f0" },
  updateBox: { fontSize: 12, color: "#64748b" },
  body: { display: "flex", flex: 1, padding: "20px 24px", gap: 0, overflow: "auto" },
  col: { flex: 1, minWidth: 0 },
  divider: { width: 3, background: "#cbd5e1", margin: "0 20px", borderRadius: 2, flexShrink: 0 },
  tableSection: { marginBottom: 16 },
  sectionHeader: { padding: "8px 16px", color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: 2, borderRadius: "10px 10px 0 0" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: "0 0 10px 10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  thName: { padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#475569", background: "#f1f5f9", width: "22%", borderBottom: "2px solid #e2e8f0" },
  thSlot: { padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  tdName: { padding: "9px 16px", fontSize: 16, fontWeight: 700, color: "#1e293b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  tdSlot: { padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #f1f5f9" },
  riderCell: { display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" },
  riderBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 14, fontWeight: 700, border: "1.5px solid", whiteSpace: "nowrap" },
  empty: { color: "#cbd5e1", fontSize: 18 },
  empty2: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  footer: { display: "flex", alignItems: "center", gap: 12, padding: "10px 32px", background: "#1e293b", color: "#94a3b8", fontSize: 14, flexShrink: 0 },
  dateInput: { padding: "4px 10px", borderRadius: 8, border: "1px solid #475569", background: "#334155", color: "#f1f5f9", fontSize: 14, cursor: "pointer" },
};
