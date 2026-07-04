"use client";

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// Page admin : renseigne l'email (parentEmail) des fiches "forfait annuel"
// qui n'en ont pas, à partir d'un export Celeris (CSV).
// Aperçu (dry-run) systématique avant toute écriture ; en prod, mot-clé requis.

// ── Parser CSV minimal (guillemets, virgules internes, \r\n) ──
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        /* ignoré */
      } else {
        field += ch;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Filter = "all" | "ok" | "ambigu" | "non_trouve";

export default function BackfillEmailsAnnuelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const [result, setResult] = useState<any>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [saison, setSaison] = useState(2025); // 2025 = saison 2025-2026 (fin juin 2026)

  async function buildRows() {
    if (!file) throw new Error("Sélectionne d'abord le fichier CSV Celeris.");
    const text = await file.text();
    const grid = parseCSV(text);
    if (!grid.length) throw new Error("CSV vide ou illisible.");
    const header = grid[0].map((h) => h.trim());
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const iNom = idx("Nom");
    const iPre = idx("Prénom");
    const iCav = idx("E-mail");
    const iTut = idx("E-mail tuteur");
    if (iNom < 0 || iPre < 0) {
      throw new Error("Colonnes 'Nom' / 'Prénom' introuvables dans le CSV.");
    }
    const rows: { nom: string; prenom: string; emailCav: string; emailTut: string }[] = [];
    for (let r = 1; r < grid.length; r++) {
      const line = grid[r];
      const nom = (line[iNom] || "").trim();
      const prenom = (line[iPre] || "").trim();
      const emailCav = iCav >= 0 ? (line[iCav] || "").trim() : "";
      const emailTut = iTut >= 0 ? (line[iTut] || "").trim() : "";
      if (!nom || !prenom) continue;
      if (!emailCav && !emailTut) continue;
      rows.push({ nom, prenom, emailCav, emailTut });
    }
    return rows;
  }

  async function run(dryRun: boolean) {
    setLoading(true);
    setErreur("");
    if (dryRun) setResult(null);
    try {
      const rows = await buildRows();

      let confirmProd = "";
      if (!dryRun && result?.summary?.isProd) {
        const mot = window.prompt(
          "⚠️ Écriture en PRODUCTION.\nPour mettre à jour réellement les emails, tapez : MAJ-EMAILS-PROD",
        );
        if (mot !== "MAJ-EMAILS-PROD") {
          setErreur("Mot-clé incorrect — mise à jour annulée.");
          setLoading(false);
          return;
        }
        confirmProd = "MAJ-EMAILS-PROD";
      }

      const res = await authFetch("/api/admin/backfill-emails-annuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun, confirmProd, saison }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur serveur");
      setResult(data);
    } catch (e: any) {
      setErreur(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const s = result?.summary;
  const proposals: any[] = result?.proposals || [];
  const shown = proposals.filter((p) => (filter === "all" ? true : p.status === filter));

  const badge = (st: string) =>
    st === "ok"
      ? { txt: "OK", cls: "bg-green-100 text-green-700" }
      : st === "ambigu"
      ? { txt: "Ambigu", cls: "bg-amber-100 text-amber-700" }
      : { txt: "Non trouvé", cls: "bg-rose-100 text-rose-700" };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        📧 Renseigner les emails — fiches « forfait annuel »
      </h1>
      <p style={{ color: "#475569", fontSize: 14, marginBottom: 20 }}>
        Remplit le champ email des familles ayant un <strong>forfait annuel actif</strong> et
        <strong> sans email</strong>, à partir de l'export Celeris. Email <strong>tuteur</strong>{" "}
        prioritaire, sinon email cavalier. Aucune fiche déjà renseignée n'est modifiée.
      </p>

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          background: "#f8fafc",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#334155", marginRight: 8 }}>Saison ciblée :</label>
          <select
            value={saison}
            onChange={(e) => setSaison(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          >
            <option value={2025}>2025-2026 (actifs jusqu'à fin juin 2026)</option>
            <option value={2026}>2026-2027</option>
            <option value={2024}>2024-2025</option>
          </select>
          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>
            = cavaliers inscrits dans un cours daté du 1/9 au 30/6 de la saison
          </span>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: "block", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => run(true)}
            disabled={loading || !file}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              cursor: loading || !file ? "not-allowed" : "pointer",
              background: loading || !file ? "#cbd5e1" : "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {loading ? "…" : "Aperçu (dry-run)"}
          </button>
          <button
            onClick={() => run(false)}
            disabled={loading || !result || (s?.ok ?? 0) === 0}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              cursor: loading || !result || (s?.ok ?? 0) === 0 ? "not-allowed" : "pointer",
              background:
                loading || !result || (s?.ok ?? 0) === 0 ? "#cbd5e1" : "#16a34a",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Appliquer ({s?.ok ?? 0} fiches)
          </button>
        </div>
      </div>

      {erreur && (
        <div
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {erreur}
        </div>
      )}

      {s && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {[
              { l: "Familles annuel", v: s.annualFamilies, c: "#0f172a" },
              { l: "Déjà un email", v: s.alreadyHaveEmail, c: "#64748b" },
              { l: "Sans email", v: s.withoutEmail, c: "#0f172a" },
              { l: "À remplir (OK)", v: s.ok, c: "#16a34a" },
              { l: "Ambigus", v: s.ambigu, c: "#d97706" },
              { l: "Non trouvés", v: s.nonTrouve, c: "#e11d48" },
            ].map((k) => (
              <div
                key={k.l}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, color: "#64748b" }}>{k.l}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 13,
              color: s.isProd ? "#b45309" : "#0369a1",
              marginBottom: 12,
            }}
          >
            Base : <strong>{s.projectId}</strong> {s.isProd ? "(PRODUCTION)" : "(test)"} · Saison{" "}
            <strong>{s.saison}</strong> ({s.periode}) —{" "}
            {s.dryRun ? "aperçu (aucune écriture)" : `✅ ${s.appliedCount} fiche(s) mise(s) à jour`}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {(["all", "ok", "ambigu", "non_trouve"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  cursor: "pointer",
                  background: filter === f ? "#0f172a" : "#fff",
                  color: filter === f ? "#fff" : "#334155",
                  fontSize: 13,
                }}
              >
                {f === "all" ? "Tous" : f === "non_trouve" ? "Non trouvés" : f === "ok" ? "OK" : "Ambigus"}
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>Famille</th>
                  <th style={{ padding: "8px 10px" }}>Enfants</th>
                  <th style={{ padding: "8px 10px" }}>Email proposé</th>
                  <th style={{ padding: "8px 10px" }}>Source</th>
                  <th style={{ padding: "8px 10px" }}>Trouvé via</th>
                  <th style={{ padding: "8px 10px" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const b = badge(p.status);
                  return (
                    <tr key={p.familyId} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{p.parentName || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#475569" }}>
                        {(p.children || []).join(", ") || "—"}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {p.proposedEmail || "—"}
                        {p.status === "ambigu" && p.allEmails?.length > 1 && (
                          <div style={{ fontSize: 11, color: "#b45309" }}>
                            candidats : {p.allEmails.join(" / ")}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#475569" }}>{p.source || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#475569" }}>{p.via || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span
                          className={b.cls}
                          style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}
                        >
                          {b.txt}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#94a3b8" }}>
                      Aucune ligne pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
