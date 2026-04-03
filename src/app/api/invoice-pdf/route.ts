import { NextRequest, NextResponse } from "next/server";
import { getClubInfo } from "@/lib/club-info";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Styles PDF
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 40, color: "#1f2937", backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: "#1e3a5f" },
  clubName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 2 },
  clubDetail: { fontSize: 8, color: "#6b7280", marginBottom: 1 },
  invoiceTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1e3a5f", textAlign: "right" },
  invoiceNum: { fontSize: 10, color: "#6b7280", textAlign: "right", marginBottom: 2 },
  invoiceDate: { fontSize: 9, color: "#6b7280", textAlign: "right" },
  partiesRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, marginTop: 8 },
  partyBox: { width: "45%" },
  partyLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  partyName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 2 },
  partyDetail: { fontSize: 8, color: "#6b7280", lineHeight: 1.5 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1e3a5f", padding: 8, borderRadius: 4, marginBottom: 2 },
  tableHeaderText: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tableRow: { flexDirection: "row", padding: "6 8", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  tableRowAlt: { flexDirection: "row", padding: "6 8", backgroundColor: "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: "center" },
  col3: { flex: 1, textAlign: "right" },
  col4: { flex: 1, textAlign: "right" },
  totalsBox: { alignItems: "flex-end", marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginBottom: 3 },
  totalsLabel: { fontSize: 8, color: "#6b7280", width: 80, textAlign: "right" },
  totalsValue: { fontSize: 8, color: "#1f2937", width: 70, textAlign: "right" },
  totalsTTCLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e3a5f", width: 80, textAlign: "right" },
  totalsTTCValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e3a5f", width: 70, textAlign: "right" },
  paymentBox: { marginTop: 20, padding: 12, borderRadius: 6, borderWidth: 1 },
  paymentPaid: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  paymentUnpaid: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  paymentLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  paymentLabelPaid: { color: "#15803d" },
  paymentLabelUnpaid: { color: "#c2410c" },
  paymentDetail: { fontSize: 8, color: "#6b7280", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#9ca3af", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
});

export async function POST(request: NextRequest) {
  try {
    const CLUB = await getClubInfo();
    const body = await request.json();
    const { invoiceNumber, date, familyName, familyEmail, items = [], totalHT = 0, totalTVA = 0, totalTTC = 0, paidAmount = 0, paymentMode, paymentDate } = body;

    const isPaid = (paidAmount || 0) >= (totalTTC || 0);
    const resteDu = Math.max(0, (totalTTC || 0) - (paidAmount || 0));

    const pdfDoc = React.createElement(Document, {},
      React.createElement(Page, { size: "A4", style: styles.page },
        // Header
        React.createElement(View, { style: styles.header },
          React.createElement(View, {},
            React.createElement(Text, { style: styles.clubName }, CLUB.nom || "Centre Équestre"),
            React.createElement(Text, { style: styles.clubDetail }, CLUB.address || ""),
            React.createElement(Text, { style: styles.clubDetail }, `${CLUB.tel || ""} · ${CLUB.email || ""}`),
            React.createElement(Text, { style: styles.clubDetail }, `SIRET : ${CLUB.siret || ""}`),
          ),
          React.createElement(View, {},
            React.createElement(Text, { style: styles.invoiceTitle }, "FACTURE"),
            React.createElement(Text, { style: styles.invoiceNum }, `N° ${invoiceNumber}`),
            React.createElement(Text, { style: styles.invoiceDate }, `Date : ${date}`),
          ),
        ),

        // Parties
        React.createElement(View, { style: styles.partiesRow },
          React.createElement(View, { style: styles.partyBox },
            React.createElement(Text, { style: styles.partyLabel }, "Émetteur"),
            React.createElement(Text, { style: styles.partyName }, CLUB.nom || ""),
            React.createElement(Text, { style: styles.partyDetail }, `${CLUB.legalName || ""}\n${CLUB.address || ""}\n${CLUB.tel || ""}\n${CLUB.email || ""}`),
          ),
          React.createElement(View, { style: styles.partyBox },
            React.createElement(Text, { style: styles.partyLabel }, "Client"),
            React.createElement(Text, { style: styles.partyName }, familyName || ""),
            familyEmail ? React.createElement(Text, { style: styles.partyDetail }, familyEmail) : null,
          ),
        ),

        // Table
        React.createElement(View, { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.tableHeaderText, styles.col1] }, "Prestation"),
          React.createElement(Text, { style: [styles.tableHeaderText, styles.col2] }, "Qté"),
          React.createElement(Text, { style: [styles.tableHeaderText, styles.col3] }, "PU HT"),
          React.createElement(Text, { style: [styles.tableHeaderText, styles.col4] }, "Total TTC"),
        ),
        ...(items || []).map((item: any, i: number) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
            React.createElement(Text, { style: [{ fontSize: 9, color: "#1f2937" }, styles.col1] },
              `${item.activityTitle || item.description || ""}${item.childName ? ` — ${item.childName}` : ""}`
            ),
            React.createElement(Text, { style: [{ fontSize: 9, color: "#6b7280" }, styles.col2] }, "1"),
            React.createElement(Text, { style: [{ fontSize: 9, color: "#6b7280" }, styles.col3] }, `${(item.priceHT || 0).toFixed(2)}€`),
            React.createElement(Text, { style: [{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e3a5f" }, styles.col4] }, `${(item.priceTTC || 0).toFixed(2)}€`),
          )
        ),

        // Totaux
        React.createElement(View, { style: styles.totalsBox },
          React.createElement(View, { style: styles.totalsRow },
            React.createElement(Text, { style: styles.totalsLabel }, "Total HT"),
            React.createElement(Text, { style: styles.totalsValue }, `${(totalHT || 0).toFixed(2)}€`),
          ),
          React.createElement(View, { style: styles.totalsRow },
            React.createElement(Text, { style: styles.totalsLabel }, "TVA"),
            React.createElement(Text, { style: styles.totalsValue }, `${(totalTVA || 0).toFixed(2)}€`),
          ),
          React.createElement(View, { style: { ...styles.totalsRow, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#e5e7eb" } },
            React.createElement(Text, { style: styles.totalsTTCLabel }, "Total TTC"),
            React.createElement(Text, { style: styles.totalsTTCValue }, `${(totalTTC || 0).toFixed(2)}€`),
          ),
        ),

        // Statut paiement
        React.createElement(View, { style: [styles.paymentBox, isPaid ? styles.paymentPaid : styles.paymentUnpaid] },
          React.createElement(Text, { style: [styles.paymentLabel, isPaid ? styles.paymentLabelPaid : styles.paymentLabelUnpaid] },
            isPaid ? "✓ Réglé" : "En attente de règlement"
          ),
          isPaid && paymentMode
            ? React.createElement(Text, { style: styles.paymentDetail }, `Mode : ${paymentMode}${paymentDate ? ` · le ${paymentDate}` : ""}`)
            : null,
          !isPaid && resteDu > 0
            ? React.createElement(Text, { style: [styles.paymentDetail, { color: "#c2410c" }] }, `Reste dû : ${resteDu.toFixed(2)}€`)
            : null,
          !isPaid && CLUB.iban
            ? React.createElement(Text, { style: styles.paymentDetail }, `Virement : IBAN ${CLUB.iban} · BIC ${CLUB.bic || ""}`)
            : null,
        ),

        // Footer
        React.createElement(Text, { style: styles.footer },
          `${CLUB.nom || ""} · ${CLUB.legalName || ""} · SIRET ${CLUB.siret || ""} · ${CLUB.email || ""}`
        ),
      )
    );

    const buffer = await renderToBuffer(pdfDoc);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="facture-${invoiceNumber}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("invoice-pdf error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
