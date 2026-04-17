"use client";
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";
import { compareCreneaux } from "@/lib/creneau-sort";

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtSlot = (s: string) => s.replace("–", "\n");

interface EnrolledChild { childId: string; childName: string; horseName?: string; presence?: string; }
interface Creneau { id: string; activityTitle: string; startTime: string; endTime: string; enrolled: EnrolledChild[]; }
interface Equide { id: string; name: string; type: string; ordre?: number; status?: string; }

export default function MontiorDisplayClient() {
  const params = useSearchParams();
  const dateParam = params.get("date");

  const [dateStr, setDateStr] = useState(dateParam || toDateStr(new Date()));
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [equides, setEquides] = useState<Equide[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Horloge en temps réel
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [cSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db, "creneaux"), where("date", "==", dateStr))),
        getDocs(collection(db, "equides")),
      ]);
      const cData = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Creneau))
        .filter(c => (c.enrolled || []).length > 0)
        .sort(compareCreneaux);
      setCreneaux(cData);
      setEquides(
        eSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Equide))
          .filter(e => e.status !== "sorti" && e.status !== "deces" && e.status !== "retraite")
          .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
      );
      setLastUpdate(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const chevaux = equides.filter(e => e.type === "cheval");
  const poneys  = equides.filter(e => e.type !== "cheval");

  // Horaires propres à une liste d'équidés
  const getHoraires = (list: Equide[]) => {
    const names = new Set(list.map(e => e.name));
    const slots = new Set<string>();
    for (const c of creneaux) {
      const hasRider = (c.enrolled || []).some(e => e.horseName && names.has(e.horseName));
      if (hasRider) slots.add(`${c.startTime}–${c.endTime}`);
    }
    if (slots.size === 0) creneaux.forEach(c => slots.add(`${c.startTime}–${c.endTime}`));
    return [...slots].sort();
  };

  // Cavaliers par équidé et créneau (prénom seulement, tronqué à 8 chars)
  const getRiders = (equideName: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const c of creneaux) {
      const riders = (c.enrolled || [])
        .filter(e => e.horseName === equideName)
        .map(e => {
          const prenom = e.childName?.split(" ")[0] || e.childName || "?";
          return prenom.length > 9 ? prenom.slice(0, 8) + "." : prenom;
        });
      if (riders.length > 0) result[`${c.startTime}–${c.endTime}`] = riders;
    }
    return result;
  };

  // Déterminer si un équidé a AU MOINS un cavalier aujourd'hui
  const hasRiders = (name: string) => Object.keys(getRiders(name)).length > 0;

  // Créneau actif en ce moment
  const isActive = (slot: string) => {
    const [start, end] = slot.split("–");
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const h = now.getHours(), m = now.getMinutes();
    const cur = h * 60 + m;
    return cur >= sh * 60 + sm && cur < eh * 60 + em;
  };

  if (loading) return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingSpinner} />
      <div style={styles.loadingText}>Chargement du montoir...</div>
    </div>
  );

  const renderTable = (title: string, list: Equide[], color: string) => {
    const slots = getHoraires(list);
    // Séparer les équidés avec cavaliers (en haut, bien visibles) et sans (en bas, grisés)
    const withRiders = list.filter(e => hasRiders(e.name));
    const withoutRiders = list.filter(e => !hasRiders(e.name));
    const ordered = [...withRiders, ...withoutRiders];

    return (
      <div style={styles.tableSection}>
        {/* En-tête */}
        <div style={{ ...styles.sectionHeader, background: color }}>
          <span>{title}</span>
          <span style={styles.sectionCount}>
            {withRiders.length}/{list.length} montés
          </span>
        </div>
        <div style={styles.tableWrapper}>
          {/* Header colonnes */}
          <div style={styles.headerRow}>
            <div style={styles.cellName}>{title === "PONEYS" ? "Poney" : "Cheval"}</div>
            {slots.map(h => (
              <div key={h} style={{
                ...styles.cellSlot,
                background: isActive(h) ? color + "22" : "#f1f5f9",
                borderBottom: isActive(h) ? `3px solid ${color}` : "2px solid #e2e8f0",
                color: isActive(h) ? color : "#475569",
              }}>
                <span style={styles.slotTime}>{h.replace("–", "\n")}</span>
                {isActive(h) && <span style={{ fontSize: 9, fontWeight: 800, color, marginTop: 2 }}>▶ EN COURS</span>}
              </div>
            ))}
          </div>

          {/* Lignes équidés */}
          {ordered.length === 0 ? (
            <div style={styles.emptySection}>Aucun équidé</div>
          ) : ordered.map((eq, idx) => {
            const riders = getRiders(eq.name);
            const active = hasRiders(eq.name);
            const isLast = idx === ordered.length - 1;
            const isSeparator = !active && withRiders.length > 0 && idx === withRiders.length;

            return (
              <div key={eq.id}>
                {/* Séparateur entre montés et non montés */}
                {isSeparator && (
                  <div style={styles.separator}>
                    <div style={styles.separatorLine} />
                    <span style={styles.separatorLabel}>Non montés aujourd'hui</span>
                    <div style={styles.separatorLine} />
                  </div>
                )}
                <div style={{
                  ...styles.row,
                  background: active
                    ? (idx % 2 === 0 ? "#f8faff" : "#fff")
                    : "#fafafa",
                  borderBottom: isLast ? "none" : "1px solid #eef2f7",
                  opacity: active ? 1 : 0.45,
                }}>
                  <div style={{ ...styles.cellName, ...styles.equideName, color: active ? "#1e293b" : "#94a3b8" }}>
                    {eq.name}
                  </div>
                  {slots.map(h => {
                    const names = riders[h] || [];
                    const slotActive = isActive(h);
                    return (
                      <div key={h} style={{
                        ...styles.cellSlot,
                        background: slotActive && names.length > 0 ? color + "10" : "transparent",
                        borderLeft: "1px solid #eef2f7",
                      }}>
                        {names.length > 0 ? (
                          <div style={styles.riderCell}>
                            {names.map((n, i) => (
                              <span key={i} style={{
                                ...styles.riderBadge,
                                background: slotActive ? color : color + "18",
                                color: slotActive ? "#fff" : color,
                                borderColor: color + "40",
                                fontWeight: slotActive ? 800 : 700,
                              }}>
                                {n}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={styles.dash}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
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
            {new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            })}
          </div>
          <div style={styles.clockRow}>
            <span style={styles.clock}>
              {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={styles.updateBox}>🔄 {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </div>

      {/* ── Corps ── */}
      {creneaux.length === 0 ? (
        <div style={styles.empty2}>
          <div style={{ fontSize: 72 }}>🌟</div>
          <div style={{ marginTop: 20, fontSize: 26, color: "#94a3b8", fontWeight: 600 }}>
            Aucune séance planifiée pour aujourd'hui
          </div>
        </div>
      ) : (
        <div style={styles.body}>
          <div style={styles.col}>{renderTable("CHEVAUX", chevaux, "#2050A0")}</div>
          <div style={styles.divider} />
          <div style={styles.col}>{renderTable("PONEYS", poneys, "#16a34a")}</div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={styles.footer}>
        <span style={{ color: "#64748b" }}>📅</span>
        <input type="date" value={dateStr}
          onChange={e => { setDateStr(e.target.value); setLoading(true); }}
          style={styles.dateInput} />
        <span style={{ color: "#475569", fontSize: 12 }}>
          Rafraîchissement automatique · 30s
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const COL_NAME_W = "20%";
const COL_SLOT_W = "auto"; // flex equal

const styles: Record<string, React.CSSProperties> = {
  // Loading
  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0C1A2E", gap: 16 },
  loadingSpinner: { width: 40, height: 40, border: "4px solid #334155", borderTop: "4px solid #F0A010", borderRadius: "50%", animation: "spin 1s linear infinite" },
  loadingText: { color: "#94a3b8", fontSize: 18, fontFamily: "sans-serif" },

  // Page
  page: { display: "flex", flexDirection: "column", height: "100vh", background: "#eef2f7", fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: "hidden" },

  // Header
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 28px", background: "#0C1A2E", color: "#fff", flexShrink: 0, minHeight: 64 },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontSize: 36 },
  headerTitle: { fontSize: 26, fontWeight: 900, letterSpacing: 4, color: "#F0A010", lineHeight: 1 },
  headerSub: { fontSize: 12, color: "#64748b", marginTop: 3, letterSpacing: 0.5 },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 },
  dateBox: { fontSize: 17, fontWeight: 700, textTransform: "capitalize", color: "#e2e8f0" },
  clockRow: { display: "flex", alignItems: "center", gap: 12 },
  clock: { fontSize: 22, fontWeight: 800, color: "#F0A010", fontVariantNumeric: "tabular-nums" },
  updateBox: { fontSize: 11, color: "#475569" },

  // Body
  body: { display: "flex", flex: 1, padding: "12px 16px 0", gap: 0, overflow: "hidden", minHeight: 0 },
  col: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
  divider: { width: 2, background: "#cbd5e1", margin: "0 14px", flexShrink: 0 },

  // Table section
  tableSection: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: 3, borderRadius: "10px 10px 0 0", flexShrink: 0 },
  sectionCount: { fontSize: 12, fontWeight: 600, opacity: 0.8, letterSpacing: 0 },
  tableWrapper: { flex: 1, overflowY: "auto", background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" },

  // Header row
  headerRow: { display: "flex", position: "sticky", top: 0, zIndex: 10, background: "#f1f5f9" },

  // Cellules
  cellName: { width: COL_NAME_W, flexShrink: 0, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" },
  cellSlot: { flex: 1, padding: "6px 4px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 },
  slotTime: { fontSize: 11, fontWeight: 700, whiteSpace: "pre-line", textAlign: "center", lineHeight: 1.3 },

  // Lignes
  row: { display: "flex", alignItems: "center", minHeight: 44, transition: "background 0.2s" },
  equideName: { fontSize: 14, fontWeight: 800, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  // Badges cavaliers
  riderCell: { display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", padding: "2px 2px" },
  riderBadge: { padding: "3px 8px", borderRadius: 20, fontSize: 13, border: "1.5px solid", whiteSpace: "nowrap", lineHeight: 1.4, transition: "all 0.2s" },
  dash: { color: "#dde3ee", fontSize: 16, lineHeight: 1 },

  // Séparateur montés / non montés
  separator: { display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", background: "#f8fafc" },
  separatorLine: { flex: 1, height: 1, background: "#e2e8f0" },
  separatorLabel: { fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap" },

  // Vide
  emptySection: { padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 },
  empty2: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },

  // Footer
  footer: { display: "flex", alignItems: "center", gap: 10, padding: "8px 28px", background: "#1e293b", color: "#94a3b8", fontSize: 13, flexShrink: 0 },
  dateInput: { padding: "3px 8px", borderRadius: 7, border: "1px solid #475569", background: "#334155", color: "#f1f5f9", fontSize: 13, cursor: "pointer" },
};
