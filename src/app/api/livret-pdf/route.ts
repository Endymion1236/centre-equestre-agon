import { NextRequest, NextResponse } from "next/server";
import { getClubInfo } from "@/lib/club-info";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

const el = React.createElement;

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#1e293b", fontFamily: "Helvetica" },
  coverTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 6 },
  coverSub: { fontSize: 12, color: "#475569", marginBottom: 2 },
  coverClub: { fontSize: 10, color: "#64748b", marginTop: 18 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 24 },
  statBox: { flex: 1, border: "1pt solid #dbeafe", borderRadius: 6, padding: 10, backgroundColor: "#f8fafc" },
  statNum: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1e40af" },
  statLabel: { fontSize: 8, color: "#64748b", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1e40af", marginTop: 18, marginBottom: 8, borderBottom: "1pt solid #dbeafe", paddingBottom: 3 },
  seance: { border: "1pt solid #e2e8f0", borderRadius: 6, padding: 9, marginBottom: 8 },
  seanceHead: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1e293b" },
  seanceMeta: { fontSize: 8, color: "#64748b", marginBottom: 4 },
  label: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#f59e0b", textTransform: "uppercase", marginTop: 5 },
  labelBlue: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#2563eb", textTransform: "uppercase", marginTop: 5 },
  body: { fontSize: 9, color: "#334155", marginTop: 1 },
  cavalier: { fontSize: 8.5, color: "#334155" },
  bilanChild: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1e293b", marginTop: 8, marginBottom: 2 },
  bilanNote: { fontSize: 8.5, color: "#334155", marginBottom: 3, paddingLeft: 6 },
  bilanMeta: { fontSize: 7, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#94a3b8", textAlign: "center", borderTop: "1pt solid #e2e8f0", paddingTop: 4 },
  empty: { fontSize: 9, color: "#94a3b8", fontStyle: "italic" },
});

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
const fmtDate = (d: string) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "";
  const [y, m, j] = d.split("-");
  return `${j}/${m}/${y}`;
};

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const CLUB = await getClubInfo();
    const { monitor, startDate, endDate } = await request.json();
    if (!monitor || !startDate || !endDate) {
      return NextResponse.json({ error: "Paramètres manquants (monitor, startDate, endDate)" }, { status: 400 });
    }

    const norm = (x: string) => (x || "").trim().toLowerCase();
    const target = norm(monitor);

    // 1) Créneaux du moniteur sur la période
    const cSnap = await adminDb.collection("creneaux").where("date", ">=", startDate).where("date", "<=", endDate).get();
    const creneaux = cSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter((c: any) => (c.monitor || "").split(",").map(norm).includes(target))
      .sort((a: any, b: any) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")));

    const creneauIds = creneaux.map((c: any) => c.id);
    const creneauIdSet = new Set(creneauIds);

    // 2) Notes de fin de séance pour ces créneaux
    const notesByCreneau: Record<string, any[]> = {};
    for (const grp of chunk(creneauIds, 30)) {
      if (!grp.length) continue;
      const nSnap = await adminDb.collection("notes-seance").where("creneauId", "in", grp).get();
      nSnap.docs.forEach(d => {
        const n = d.data() as any;
        (notesByCreneau[n.creneauId] = notesByCreneau[n.creneauId] || []).push(n);
      });
    }

    // 3) Bilans individuels : notes pédagogiques rattachées aux créneaux du moniteur
    const fSnap = await adminDb.collection("families").get();
    const bilansByChild: Record<string, { childName: string; notes: any[] }> = {};
    fSnap.docs.forEach(d => {
      const fam = d.data() as any;
      (fam.children || []).forEach((ch: any) => {
        const notes = (ch.peda?.notes || []).filter((n: any) => n.creneauId && creneauIdSet.has(n.creneauId));
        if (notes.length) {
          const name = `${ch.firstName || ""} ${ch.lastName || ""}`.trim() || "—";
          bilansByChild[ch.id] = bilansByChild[ch.id] || { childName: name, notes: [] };
          bilansByChild[ch.id].notes.push(...notes);
        }
      });
    });
    Object.values(bilansByChild).forEach(b => b.notes.sort((a: any, z: any) => (a.date || "").localeCompare(z.date || "")));

    // Stats
    const cavaliersSet = new Set<string>();
    const chevauxSet = new Set<string>();
    creneaux.forEach((c: any) => (c.enrolled || []).forEach((e: any) => {
      if (e.childId) cavaliersSet.add(e.childId);
      const h = e.horseName || e.equideName;
      if (h) chevauxSet.add(String(h));
    }));

    const periodeLabel = `${fmtDate(startDate)} → ${fmtDate(endDate)}`;

    // ── Construction du PDF ──────────────────────────────────────────────
    const seanceBlocks = creneaux.map((c: any, i: number) => {
      const cavaliers = (c.enrolled || []).map((e: any) => {
        const h = e.horseName || e.equideName;
        return `${e.childName || "—"}${h ? ` — ${h}` : ""}`;
      });
      const notes = notesByCreneau[c.id] || [];
      return el(View, { key: c.id, style: s.seance, wrap: false },
        el(Text, { style: s.seanceHead }, `${fmtDate(c.date)} · ${c.activityTitle || ""}`),
        el(Text, { style: s.seanceMeta }, `${c.startTime || ""}${c.endTime ? `–${c.endTime}` : ""} · ${cavaliers.length} cavalier${cavaliers.length > 1 ? "s" : ""}`),
        cavaliers.length
          ? el(View, {},
              el(Text, { style: s.labelBlue }, "Cavaliers & chevaux"),
              ...cavaliers.map((t: string, k: number) => el(Text, { key: k, style: s.cavalier }, `• ${t}`)))
          : el(Text, { style: s.empty }, "Aucun cavalier"),
        c.notePreparation
          ? el(View, {},
              el(Text, { style: s.label }, "Préparation de séance"),
              el(Text, { style: s.body }, c.notePreparation))
          : null,
        notes.length
          ? el(View, {},
              el(Text, { style: s.labelBlue }, "Notes de fin de séance"),
              ...notes.map((n: any, k: number) => el(Text, { key: k, style: s.body }, `• ${n.texte || ""}`)))
          : null,
      );
    });

    const bilanBlocks = Object.values(bilansByChild)
      .sort((a, b) => a.childName.localeCompare(b.childName))
      .map((b, i) =>
        el(View, { key: i, wrap: false },
          el(Text, { style: s.bilanChild }, b.childName),
          ...b.notes.map((n: any, k: number) =>
            el(View, { key: k },
              el(Text, { style: s.bilanNote }, `• ${n.text || ""}`),
              el(Text, { style: s.bilanMeta }, `${n.date ? new Date(n.date).toLocaleDateString("fr-FR") : ""}${n.author ? ` · ${n.author}` : ""}${n.activityTitle ? ` · ${n.activityTitle}` : ""}`),
            )),
        ));

    const footer = el(Text, { style: s.footer, fixed: true },
      `${CLUB.nom} · Livret pédagogique — ${monitor} · ${periodeLabel}`);

    const doc = el(Document, { title: `Livret pédagogique — ${monitor}`, author: CLUB.nom },
      // Page de garde + stats
      el(Page, { size: "A4", style: s.page },
        el(Text, { style: s.coverTitle }, "Livret pédagogique"),
        el(Text, { style: s.coverSub }, `Moniteur / enseignant : ${monitor}`),
        el(Text, { style: s.coverSub }, `Période : ${periodeLabel}`),
        el(Text, { style: s.coverClub }, CLUB.nom),
        el(View, { style: s.statsRow },
          el(View, { style: s.statBox }, el(Text, { style: s.statNum }, String(creneaux.length)), el(Text, { style: s.statLabel }, "Séances encadrées")),
          el(View, { style: s.statBox }, el(Text, { style: s.statNum }, String(cavaliersSet.size)), el(Text, { style: s.statLabel }, "Cavaliers différents")),
          el(View, { style: s.statBox }, el(Text, { style: s.statNum }, String(chevauxSet.size)), el(Text, { style: s.statLabel }, "Chevaux/poneys utilisés")),
        ),
        el(Text, { style: s.sectionTitle }, "Détail des séances"),
        creneaux.length ? el(View, {}, ...seanceBlocks) : el(Text, { style: s.empty }, "Aucune séance sur la période pour ce moniteur."),
        footer,
      ),
      // Bilans individuels
      el(Page, { size: "A4", style: s.page },
        el(Text, { style: s.sectionTitle }, "Bilans individuels des cavaliers"),
        bilanBlocks.length ? el(View, {}, ...bilanBlocks) : el(Text, { style: s.empty }, "Aucun bilan individuel rattaché aux séances de la période."),
        footer,
      ),
    );

    const buffer = await renderToBuffer(doc as any);
    const safeName = monitor.replace(/[^a-zA-Z0-9]+/g, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="livret-pedagogique-${safeName}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("livret-pdf:", error);
    return NextResponse.json({ error: error.message || "Erreur génération livret" }, { status: 500 });
  }
}
