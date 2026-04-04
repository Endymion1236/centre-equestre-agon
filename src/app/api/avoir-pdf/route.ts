import { NextRequest, NextResponse } from "next/server";
import { getClubInfo } from "@/lib/club-info";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";

let logoBase64 = "";
try {
  const logoBuffer = readFileSync(join(process.cwd(), "public", "images", "logo-ce-agon.png"));
  logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
} catch { console.warn("Logo non trouvé"); }

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BLUE = "#1e3a5f";
const GRAY = "#6b7280";
const LIGHT = "#f9fafb";
const RED = "#dc2626";
const ORANGE_BG = "#fff7ed";
const ORANGE_BORDER = "#fdba74";

const s = StyleSheet.create({
  page:       { fontFamily: "Helvetica", fontSize: 9, padding: "32 40 60 40", color: "#1f2937", backgroundColor: "#fff" },
  header:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: RED },
  clubName:   { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 2 },
  clubSub:    { fontSize: 8, color: GRAY, marginBottom: 1.5 },
  invTitle:   { fontSize: 22, fontFamily: "Helvetica-Bold", color: RED, textAlign: "right" },
  invMeta:    { fontSize: 8, color: GRAY, textAlign: "right", marginTop: 2 },
  partyLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  partyName:  { fontSize: 10, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 2 },
  partySub:   { fontSize: 8, color: GRAY, lineHeight: 1.6 },
  // Table
  thead:      { flexDirection: "row", backgroundColor: RED, padding: "6 8", borderRadius: 3, marginBottom: 1 },
  theadTxt:   { color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  trow:       { flexDirection: "row", padding: "5 8", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trowAlt:    { flexDirection: "row", padding: "5 8", backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  cDesc:      { flex: 4 },
  cQty:       { flex: 1, textAlign: "center" },
  cPUHT:      { flex: 1.2, textAlign: "right" },
  cTVA:       { flex: 1, textAlign: "right" },
  cTTC:       { flex: 1.2, textAlign: "right" },
  cellTxt:    { fontSize: 8.5, color: "#374151" },
  cellGray:   { fontSize: 8.5, color: GRAY },
  cellBold:   { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: RED },
  // TVA recap
  tvaSection: { marginTop: 10, marginBottom: 4 },
  tvaLabel:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  tvaRow:     { flexDirection: "row", gap: 8, marginBottom: 2 },
  tvaCell:    { width: 70, fontSize: 8, color: GRAY },
  tvaCellVal: { width: 70, fontSize: 8, color: "#374151" },
  // Totaux
  totalsBox:  { alignItems: "flex-end", marginTop: 8, marginBottom: 16 },
  totalRow:   { flexDirection: "row", marginBottom: 3 },
  totLbl:     { fontSize: 8.5, color: GRAY, width: 90, textAlign: "right" },
  totVal:     { fontSize: 8.5, color: "#1f2937", width: 75, textAlign: "right" },
  totTTCLbl:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: RED, width: 90, textAlign: "right" },
  totTTCVal:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: RED, width: 75, textAlign: "right" },
  // Info box
  infoBox:    { padding: "10 12", borderRadius: 5, borderWidth: 1, marginBottom: 14, backgroundColor: ORANGE_BG, borderColor: ORANGE_BORDER },
  infoTitle:  { fontSize: 10, fontFamily: "Helvetica-Bold", color: RED, marginBottom: 3 },
  infoDetail: { fontSize: 8, color: GRAY, lineHeight: 1.6 },
  // Footer
  footer:     { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#9ca3af", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 },
  logo:       { width: 48, height: 48, objectFit: "contain" },
  mentionTVA: { fontSize: 7.5, color: GRAY, marginTop: 8, fontStyle: "italic" },
  // Watermark-like AVOIR band
  avoirBand:  { backgroundColor: "#fef2f2", padding: "6 12", borderRadius: 4, marginBottom: 16, borderWidth: 1, borderColor: "#fecaca" },
  avoirBandTxt: { fontSize: 9, fontFamily: "Helvetica-Bold", color: RED, textAlign: "center" },
});

function getTvaRecap(items: any[]) {
  const recap: Record<string, { base: number; tva: number; montant: number }> = {};
  for (const item of items) {
    const taux = item.tva ?? item.tvaTaux ?? 5.5;
    const key = `${taux}`;
    const ht = item.priceHT || 0;
    const montantTVA = ht * (taux / 100);
    if (!recap[key]) recap[key] = { base: 0, tva: taux, montant: 0 };
    recap[key].base += ht;
    recap[key].montant += montantTVA;
  }
  return Object.values(recap);
}

export async function POST(request: NextRequest) {
  try {
    const CLUB = await getClubInfo();
    const body = await request.json();
    const {
      avoirNumber, date,
      familyName, familyEmail, familyAddress,
      sourceInvoiceNumber, reason,
      items = [], totalHT = 0, totalTVA = 0, totalTTC = 0,
      type = "avoir", // "avoir" | "avance"
      expiryDate,
    } = body;

    const isTVAApplicable = totalTVA > 0;
    const tvaRecap = getTvaRecap(items);
    const typeLabel = type === "avance" ? "AVANCE" : "AVOIR";

    const doc = React.createElement(Document, { title: `${typeLabel} ${avoirNumber}`, author: CLUB.nom },
      React.createElement(Page, { size: "A4", style: s.page },

        // ── En-tête ──
        React.createElement(View, { style: s.header },
          React.createElement(View, { style: { flexDirection: "row", alignItems: "center", gap: 10 } },
            logoBase64 ? React.createElement(Image, { src: logoBase64, style: s.logo }) : null,
            React.createElement(View, {},
              React.createElement(Text, { style: s.clubName }, CLUB.nom),
              React.createElement(Text, { style: s.clubSub }, CLUB.legalName),
              React.createElement(Text, { style: s.clubSub }, CLUB.address),
              React.createElement(Text, { style: s.clubSub }, `Tél : ${CLUB.tel} · ${CLUB.email}`),
              React.createElement(Text, { style: s.clubSub }, `SIRET : ${CLUB.siret}`),
              CLUB.tvaIntra
                ? React.createElement(Text, { style: s.clubSub }, `N° TVA intracommunautaire : ${CLUB.tvaIntra}`)
                : React.createElement(Text, { style: s.clubSub }, "TVA non applicable — art. 293B CGI"),
            ),
          ),
          React.createElement(View, {},
            React.createElement(Text, { style: s.invTitle }, typeLabel),
            React.createElement(Text, { style: s.invMeta }, `N° ${avoirNumber}`),
            React.createElement(Text, { style: s.invMeta }, `Émis le : ${date}`),
            sourceInvoiceNumber
              ? React.createElement(Text, { style: s.invMeta }, `Réf. facture d'origine : ${sourceInvoiceNumber}`)
              : null,
          ),
        ),

        // ── Bandeau AVOIR ──
        React.createElement(View, { style: s.avoirBand },
          React.createElement(Text, { style: s.avoirBandTxt },
            type === "avance"
              ? `Ce document atteste d'une avance de ${totalTTC.toFixed(2)} € enregistrée au bénéfice du client.`
              : `Ce document constitue une note de crédit de ${totalTTC.toFixed(2)} € au bénéfice du client.`
          ),
        ),

        // ── Client ──
        React.createElement(View, { style: { marginBottom: 20 } },
          React.createElement(Text, { style: s.partyLabel }, "Bénéficiaire"),
          React.createElement(Text, { style: s.partyName }, familyName || ""),
          familyEmail ? React.createElement(Text, { style: s.partySub }, familyEmail) : null,
          familyAddress ? React.createElement(Text, { style: s.partySub }, familyAddress) : null,
        ),

        // ── Motif ──
        reason ? React.createElement(View, { style: { marginBottom: 16 } },
          React.createElement(Text, { style: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 } }, "Motif"),
          React.createElement(Text, { style: { fontSize: 9, color: "#374151" } }, reason),
        ) : null,

        // ── Tableau des prestations annulées / créditées ──
        items.length > 0 ? React.createElement(View, { style: s.thead },
          React.createElement(Text, { style: [s.theadTxt, s.cDesc] }, "Désignation"),
          React.createElement(Text, { style: [s.theadTxt, s.cQty] }, "Qté"),
          React.createElement(Text, { style: [s.theadTxt, s.cPUHT] }, "PU HT"),
          React.createElement(Text, { style: [s.theadTxt, s.cTVA] }, "TVA"),
          React.createElement(Text, { style: [s.theadTxt, s.cTTC] }, "Total TTC"),
        ) : null,
        ...(items).map((item: any, i: number) => {
          const taux = item.tva ?? item.tvaTaux ?? 5.5;
          return React.createElement(View, { key: String(i), style: i % 2 === 0 ? s.trow : s.trowAlt },
            React.createElement(View, { style: s.cDesc },
              React.createElement(Text, { style: s.cellTxt },
                `${item.activityTitle || item.description || "Prestation"}${item.childName ? ` — ${item.childName}` : ""}`),
            ),
            React.createElement(Text, { style: [s.cellGray, s.cQty] }, `${item.quantity || 1}`),
            React.createElement(Text, { style: [s.cellGray, s.cPUHT] }, `-${(item.priceHT || 0).toFixed(2)} €`),
            React.createElement(Text, { style: [s.cellGray, s.cTVA] }, `${taux} %`),
            React.createElement(Text, { style: [s.cellBold, s.cTTC] }, `-${(item.priceTTC || 0).toFixed(2)} €`),
          );
        }),

        // ── Récap TVA ──
        isTVAApplicable ? React.createElement(View, { style: s.tvaSection },
          React.createElement(Text, { style: s.tvaLabel }, "Détail TVA"),
          React.createElement(View, { style: s.tvaRow },
            React.createElement(Text, { style: s.tvaCell }, "Taux"),
            React.createElement(Text, { style: s.tvaCell }, "Base HT"),
            React.createElement(Text, { style: s.tvaCell }, "Montant TVA"),
          ),
          ...tvaRecap.map((t, i) =>
            React.createElement(View, { key: String(i), style: s.tvaRow },
              React.createElement(Text, { style: s.tvaCellVal }, `${t.tva} %`),
              React.createElement(Text, { style: s.tvaCellVal }, `-${t.base.toFixed(2)} €`),
              React.createElement(Text, { style: s.tvaCellVal }, `-${t.montant.toFixed(2)} €`),
            )
          ),
        ) : null,

        // ── Totaux ──
        React.createElement(View, { style: s.totalsBox },
          React.createElement(View, { style: s.totalRow },
            React.createElement(Text, { style: s.totLbl }, "Total HT"),
            React.createElement(Text, { style: s.totVal }, `-${(totalHT || 0).toFixed(2)} €`),
          ),
          React.createElement(View, { style: s.totalRow },
            React.createElement(Text, { style: s.totLbl }, `TVA${tvaRecap.length === 1 ? ` (${tvaRecap[0].tva} %)` : ""}`),
            React.createElement(Text, { style: s.totVal }, `-${(totalTVA || 0).toFixed(2)} €`),
          ),
          React.createElement(View, { style: { ...s.totalRow, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 4, marginTop: 2 } },
            React.createElement(Text, { style: s.totTTCLbl }, `${typeLabel} TTC`),
            React.createElement(Text, { style: s.totTTCVal }, `-${(totalTTC || 0).toFixed(2)} €`),
          ),
        ),

        !isTVAApplicable
          ? React.createElement(Text, { style: s.mentionTVA }, "TVA non applicable en vertu de l'article 293B du CGI.")
          : null,

        // ── Info box : validité + conditions ──
        React.createElement(View, { style: s.infoBox },
          React.createElement(Text, { style: s.infoTitle }, `${typeLabel} — Conditions`),
          React.createElement(Text, { style: s.infoDetail },
            type === "avance"
              ? `Cette avance est valable jusqu'au ${expiryDate || "—"}. Elle sera déduite de la prochaine facture.`
              : `Cet avoir est valable jusqu'au ${expiryDate || "—"}. Il sera déduit de la prochaine facture ou remboursé sur demande.`
          ),
          sourceInvoiceNumber
            ? React.createElement(Text, { style: { ...s.infoDetail, marginTop: 4 } },
                `Facture d'origine : ${sourceInvoiceNumber}`)
            : null,
        ),

        // ── Footer ──
        React.createElement(Text, { style: s.footer },
          `${CLUB.nom} · ${CLUB.legalName} · SIRET ${CLUB.siret}` +
          (CLUB.tvaIntra ? ` · TVA ${CLUB.tvaIntra}` : "") +
          ` · ${CLUB.email}` +
          (CLUB.website ? ` · ${CLUB.website}` : ""),
        ),
      )
    );

    const buffer = await renderToBuffer(doc);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="avoir-${avoirNumber}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("avoir-pdf error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
