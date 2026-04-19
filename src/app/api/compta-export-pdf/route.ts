import { NextRequest, NextResponse } from "next/server";
import { getClubInfo } from "@/lib/club-info";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// PDF de synthèse comptable mensuelle
// ───────────────────────────────────────────────────────────────────
// Généré par /admin/comptabilite (bouton "Export complet du mois").
// Usage principal : document imprimable à transmettre au comptable.
//
// Contenu :
//   - En-tête du centre + période
//   - KPIs : total HT, TVA, TTC, nombre de factures
//   - Récap TVA par taux (5.5%, 20%, 0%)
//   - Répartition par mode de paiement (CB, chèque, SEPA, espèces…)
//   - Top comptes (codes comptables utilisés, par montant HT)
//   - Pied de page légal
// ═══════════════════════════════════════════════════════════════════

let logoBase64 = "";
try {
  const logoBuffer = readFileSync(join(process.cwd(), "public", "images", "logo-ce-agon.png"));
  logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
} catch { console.warn("Logo non trouvé"); }

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BLUE = "#1e3a5f";
const GRAY = "#6b7280";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", color: "#1f2937", fontSize: 10 },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, paddingBottom: 14, borderBottom: "2 solid #e5e7eb" },
  headerLeft: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  logo: { width: 56, height: 56, objectFit: "contain" },
  clubName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 4 },
  clubSub: { fontSize: 8.5, color: GRAY, lineHeight: 1.5 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 4 },
  docPeriod: { fontSize: 11, color: "#1f2937", marginBottom: 2 },
  docSubtitle: { fontSize: 9, color: GRAY },
  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, paddingBottom: 4, borderBottom: "1 solid #e5e7eb" },
  // KPIs
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpi: { flex: 1, padding: "10 12", borderRadius: 5, border: "1 solid #e5e7eb", backgroundColor: "#f9fafb" },
  kpiLabel: { fontSize: 8, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BLUE },
  kpiSubtle: { fontSize: 8, color: GRAY, marginTop: 2 },
  // Tables
  table: { marginTop: 4, borderRadius: 4, overflow: "hidden", border: "1 solid #e5e7eb" },
  thead: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: "6 10" },
  theadCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  trow: { flexDirection: "row", padding: "6 10", borderTop: "0.5 solid #f0f0f0" },
  cell: { fontSize: 9, color: "#1f2937" },
  cellRight: { fontSize: 9, color: "#1f2937", textAlign: "right" },
  cellBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "right" },
  totalRow: { flexDirection: "row", padding: "8 10", borderTop: "1 solid #d1d5db", backgroundColor: "#f9fafb" },
  totalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1f2937" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "right" },
  // Footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, paddingTop: 8, borderTop: "1 solid #e5e7eb", fontSize: 7, color: "#9ca3af", textAlign: "center" },
});

// ─── Libellés des modes de paiement ─────────────────────────────────
const MODE_LABELS: Record<string, string> = {
  cb_terminal: "CB (terminal)",
  cb_online: "CB en ligne",
  cb: "CB",
  cheque: "Chèque",
  especes: "Espèces",
  virement: "Virement",
  prelevement_sepa: "Prélèvement SEPA",
  sepa: "Prélèvement SEPA",
  cheque_vacances: "Chèques vacances",
  pass_sport: "Pass'Sport",
  ancv: "ANCV",
  avoir: "Avoir",
  offert: "Offert",
};

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { period, payments = [], encaissements = [] } = body as {
      period: string; // "2026-04"
      payments: any[];
      encaissements: any[];
    };

    // ─── Calculs globaux ───
    const totalHT = payments.reduce((sum, p) =>
      sum + (p.items || []).reduce((ss: number, i: any) => ss + (i.priceHT || 0), 0), 0);
    const totalTTC = payments.reduce((sum, p) => sum + (p.totalTTC || 0), 0);
    const totalTVA = totalTTC - totalHT;
    const totalEncaisse = encaissements.reduce((sum, e) => sum + (e.montant || 0), 0);
    const nbFactures = payments.length;

    // ─── Récap TVA par taux ───
    const tvaByRate: Record<string, { ht: number; tva: number; ttc: number }> = {};
    payments.forEach((p) => {
      (p.items || []).forEach((item: any) => {
        const rate = String(item.tva ?? item.tvaTaux ?? 5.5);
        if (!tvaByRate[rate]) tvaByRate[rate] = { ht: 0, tva: 0, ttc: 0 };
        const ht = item.priceHT || 0;
        const ttc = item.priceTTC || 0;
        tvaByRate[rate].ht += ht;
        tvaByRate[rate].ttc += ttc;
        tvaByRate[rate].tva += (ttc - ht);
      });
    });

    // ─── Répartition par mode de paiement ───
    const byMode: Record<string, { count: number; total: number }> = {};
    encaissements.forEach((e) => {
      const mode = e.mode || "inconnu";
      if (!byMode[mode]) byMode[mode] = { count: 0, total: 0 };
      byMode[mode].count++;
      byMode[mode].total += e.montant || 0;
    });

    // ─── Top comptes (codes comptables) ───
    const byAccount: Record<string, { label: string; ht: number; count: number }> = {};
    payments.forEach((p) => {
      (p.items || []).forEach((item: any) => {
        const type = item.activityType || "autre";
        // Map activityType → code comptable (simplifié)
        const code = type === "stage" || type === "stage_journee" ? "70611400" :
                     type === "cours" ? "70611000" :
                     type === "balade" || type === "ponyride" ? "70611500" :
                     type === "competition" ? "70641000" :
                     "70605000";
        const label = type === "stage" || type === "stage_journee" ? "Stages équitation" :
                      type === "cours" ? "Enseignement / Forfaits" :
                      type === "balade" || type === "ponyride" ? "Randonnées / Promenades" :
                      type === "competition" ? "Animations collectivité" :
                      "Divers";
        if (!byAccount[code]) byAccount[code] = { label, ht: 0, count: 0 };
        byAccount[code].ht += item.priceHT || 0;
        byAccount[code].count++;
      });
    });

    const accountsSorted = Object.entries(byAccount)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.ht - a.ht);

    const club = await getClubInfo();
    const periodLabel = (() => {
      const [y, m] = period.split("-");
      const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
      return `${months[parseInt(m) - 1]} ${y}`;
    })();
    const generatedAt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    // ─── Rendu PDF ───
    const doc = React.createElement(Document, {},
      React.createElement(Page, { size: "A4", style: s.page },

        // ─── Header ───
        React.createElement(View, { style: s.header },
          React.createElement(View, { style: s.headerLeft },
            logoBase64 ? React.createElement(Image, { src: logoBase64, style: s.logo }) : null,
            React.createElement(View, null,
              React.createElement(Text, { style: s.clubName }, club.nom),
              React.createElement(Text, { style: s.clubSub }, club.legalName),
              React.createElement(Text, { style: s.clubSub }, club.address),
              React.createElement(Text, { style: s.clubSub }, `SIRET : ${club.siret}`),
              club.tvaIntra
                ? React.createElement(Text, { style: s.clubSub }, `TVA intra. : ${club.tvaIntra}`)
                : null,
            ),
          ),
          React.createElement(View, { style: s.headerRight },
            React.createElement(Text, { style: s.docTitle }, "Synthèse comptable"),
            React.createElement(Text, { style: s.docPeriod }, periodLabel),
            React.createElement(Text, { style: s.docSubtitle }, `Généré le ${generatedAt}`),
          ),
        ),

        // ─── KPIs ───
        React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Indicateurs clés"),
          React.createElement(View, { style: s.kpiRow },
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "Total HT"),
              React.createElement(Text, { style: s.kpiValue }, `${totalHT.toFixed(2)} €`),
            ),
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "TVA collectée"),
              React.createElement(Text, { style: s.kpiValue }, `${totalTVA.toFixed(2)} €`),
            ),
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "Total TTC"),
              React.createElement(Text, { style: s.kpiValue }, `${totalTTC.toFixed(2)} €`),
            ),
          ),
          React.createElement(View, { style: s.kpiRow },
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "Factures émises"),
              React.createElement(Text, { style: s.kpiValue }, `${nbFactures}`),
            ),
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "Encaissé"),
              React.createElement(Text, { style: s.kpiValue }, `${totalEncaisse.toFixed(2)} €`),
              React.createElement(Text, { style: s.kpiSubtle }, `${encaissements.length} mouvement${encaissements.length > 1 ? "s" : ""}`),
            ),
            React.createElement(View, { style: s.kpi },
              React.createElement(Text, { style: s.kpiLabel }, "Reste à encaisser"),
              React.createElement(Text, { style: s.kpiValue }, `${(totalTTC - totalEncaisse).toFixed(2)} €`),
            ),
          ),
        ),

        // ─── Récap TVA ───
        React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Récapitulatif TVA"),
          React.createElement(View, { style: s.table },
            React.createElement(View, { style: s.thead },
              React.createElement(Text, { style: [s.theadCell, { flex: 1 }] as any }, "Taux"),
              React.createElement(Text, { style: [s.theadCell, { flex: 2, textAlign: "right" }] as any }, "Base HT"),
              React.createElement(Text, { style: [s.theadCell, { flex: 2, textAlign: "right" }] as any }, "TVA"),
              React.createElement(Text, { style: [s.theadCell, { flex: 2, textAlign: "right" }] as any }, "TTC"),
            ),
            ...Object.entries(tvaByRate).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([rate, v]) =>
              React.createElement(View, { style: s.trow, key: rate },
                React.createElement(Text, { style: [s.cell, { flex: 1 }] as any }, `${rate} %`),
                React.createElement(Text, { style: [s.cellRight, { flex: 2 }] as any }, `${v.ht.toFixed(2)} €`),
                React.createElement(Text, { style: [s.cellRight, { flex: 2 }] as any }, `${v.tva.toFixed(2)} €`),
                React.createElement(Text, { style: [s.cellBold, { flex: 2 }] as any }, `${v.ttc.toFixed(2)} €`),
              )
            ),
            React.createElement(View, { style: s.totalRow },
              React.createElement(Text, { style: [s.totalLabel, { flex: 1 }] as any }, "TOTAL"),
              React.createElement(Text, { style: [s.totalValue, { flex: 2 }] as any }, `${totalHT.toFixed(2)} €`),
              React.createElement(Text, { style: [s.totalValue, { flex: 2 }] as any }, `${totalTVA.toFixed(2)} €`),
              React.createElement(Text, { style: [s.totalValue, { flex: 2 }] as any }, `${totalTTC.toFixed(2)} €`),
            ),
          ),
        ),

        // ─── Modes de paiement ───
        Object.keys(byMode).length > 0 ? React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Répartition par mode de paiement"),
          React.createElement(View, { style: s.table },
            React.createElement(View, { style: s.thead },
              React.createElement(Text, { style: [s.theadCell, { flex: 3 }] as any }, "Mode"),
              React.createElement(Text, { style: [s.theadCell, { flex: 1, textAlign: "right" }] as any }, "Nb"),
              React.createElement(Text, { style: [s.theadCell, { flex: 2, textAlign: "right" }] as any }, "Montant"),
            ),
            ...Object.entries(byMode).sort((a, b) => b[1].total - a[1].total).map(([mode, v]) =>
              React.createElement(View, { style: s.trow, key: mode },
                React.createElement(Text, { style: [s.cell, { flex: 3 }] as any }, MODE_LABELS[mode] || mode),
                React.createElement(Text, { style: [s.cellRight, { flex: 1 }] as any }, `${v.count}`),
                React.createElement(Text, { style: [s.cellBold, { flex: 2 }] as any }, `${v.total.toFixed(2)} €`),
              )
            ),
            React.createElement(View, { style: s.totalRow },
              React.createElement(Text, { style: [s.totalLabel, { flex: 3 }] as any }, "TOTAL"),
              React.createElement(Text, { style: [s.totalValue, { flex: 1 }] as any }, `${encaissements.length}`),
              React.createElement(Text, { style: [s.totalValue, { flex: 2 }] as any }, `${totalEncaisse.toFixed(2)} €`),
            ),
          ),
        ) : null,

        // ─── Top comptes ───
        accountsSorted.length > 0 ? React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Répartition par compte comptable"),
          React.createElement(View, { style: s.table },
            React.createElement(View, { style: s.thead },
              React.createElement(Text, { style: [s.theadCell, { flex: 1 }] as any }, "Code"),
              React.createElement(Text, { style: [s.theadCell, { flex: 3 }] as any }, "Libellé"),
              React.createElement(Text, { style: [s.theadCell, { flex: 1, textAlign: "right" }] as any }, "Nb"),
              React.createElement(Text, { style: [s.theadCell, { flex: 2, textAlign: "right" }] as any }, "Montant HT"),
            ),
            ...accountsSorted.map((a) =>
              React.createElement(View, { style: s.trow, key: a.code },
                React.createElement(Text, { style: [s.cell, { flex: 1, fontFamily: "Courier" }] as any }, a.code),
                React.createElement(Text, { style: [s.cell, { flex: 3 }] as any }, a.label),
                React.createElement(Text, { style: [s.cellRight, { flex: 1 }] as any }, `${a.count}`),
                React.createElement(Text, { style: [s.cellBold, { flex: 2 }] as any }, `${a.ht.toFixed(2)} €`),
              )
            ),
          ),
        ) : null,

        // ─── Footer ───
        React.createElement(View, { style: s.footer },
          React.createElement(Text, null,
            `${club.nom} — ${club.legalName} — SIRET ${club.siret}${club.tvaIntra ? ` — TVA ${club.tvaIntra}` : ""}`
          ),
          React.createElement(Text, { style: { marginTop: 2 } },
            "Document généré automatiquement par la plateforme — vérification comptable recommandée"
          ),
        ),
      )
    );

    const buffer = await renderToBuffer(doc as any);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="synthese-compta-${period}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error("Erreur génération PDF compta:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
