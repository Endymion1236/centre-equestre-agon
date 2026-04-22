import { NextRequest, NextResponse } from "next/server";
import { getClubInfo } from "@/lib/club-info";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { readFileSync } from "fs";
import { join } from "path";

// Logo encodé en base64 au démarrage
let logoBase64 = "";
try {
  const logoBuffer = readFileSync(join(process.cwd(), "public", "images", "logo-ce-agon.png"));
  logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
} catch { console.warn("Logo non trouvé"); }
import React from "react";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BLUE = "#1e3a5f";
const GRAY = "#6b7280";
const LIGHT = "#f9fafb";
const GREEN = "#15803d";
const ORANGE = "#c2410c";

const s = StyleSheet.create({
  page:       { fontFamily: "Helvetica", fontSize: 9, padding: "32 40 60 40", color: "#1f2937", backgroundColor: "#fff" },
  // Header
  header:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: BLUE },
  clubName:   { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 2 },
  clubSub:    { fontSize: 8, color: GRAY, marginBottom: 1.5 },
  invTitle:   { fontSize: 22, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "right" },
  invMeta:    { fontSize: 8, color: GRAY, textAlign: "right", marginTop: 2 },
  // Parties
  parties:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  partyBox:   { width: "47%" },
  partyLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  partyName:  { fontSize: 10, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 2 },
  partySub:   { fontSize: 8, color: GRAY, lineHeight: 1.6 },
  // Table
  thead:      { flexDirection: "row", backgroundColor: BLUE, padding: "6 8", borderRadius: 3, marginBottom: 1 },
  theadTxt:   { color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  trow:       { flexDirection: "row", padding: "5 8", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trowAlt:    { flexDirection: "row", padding: "5 8", backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  cDesc:      { flex: 4 },
  cQty:       { flex: 1, textAlign: "center" },
  cPUHT:      { flex: 1.2, textAlign: "right" },
  cRemise:    { flex: 1, textAlign: "right" },
  cTVA:       { flex: 1, textAlign: "right" },
  cTTC:       { flex: 1.2, textAlign: "right" },
  cellTxt:    { fontSize: 8.5, color: "#374151" },
  cellSubtitle: { fontSize: 7.5, color: "#6b7280", marginTop: 2 },
  cellGray:   { fontSize: 8.5, color: GRAY },
  cellBold:   { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLUE },
  // Récap TVA
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
  totTTCLbl:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE, width: 90, textAlign: "right" },
  totTTCVal:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE, width: 75, textAlign: "right" },
  // Paiement
  payBox:     { padding: "10 12", borderRadius: 5, borderWidth: 1, marginBottom: 14 },
  payPaid:    { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  payUnpaid:  { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  payTitle:   { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  payDetail:  { fontSize: 8, color: GRAY, lineHeight: 1.6 },
  // Footer
  footer:     { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#9ca3af", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 },
  logo:       { width: 48, height: 48, objectFit: "contain" },
  // Mention TVA non applicable
  mentionTVA: { fontSize: 7.5, color: GRAY, marginTop: 8, fontStyle: "italic" },
});

// Regrouper les items par taux de TVA pour le récap
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
  // 🔒 Auth obligatoire
  const auth = await verifyAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const CLUB = await getClubInfo();
    const body = await request.json();
    const {
      invoiceNumber, date, prestationDate,
      familyName, familyEmail, familyAddress,
      items = [], totalHT = 0, totalTVA = 0, totalTTC = 0,
      paidAmount = 0, paymentMode, paymentDate,
      paymentDetails, // nouveau : [{ mode, modeLabel, montant, date }]
      remise,
    } = body;

    const isPaid = (paidAmount || 0) >= (totalTTC || 0);
    const resteDu = Math.max(0, (totalTTC || 0) - (paidAmount || 0));
    const tvaRecap = getTvaRecap(items);
    const isTVAApplicable = totalTVA > 0;

    // Construction du libellé de règlement :
    // - Si paymentDetails fourni (plusieurs encaissements) → lister chaque ligne
    // - Sinon → fallback sur paymentMode simple (compat)
    const renderPaymentDetails = () => {
      if (!Array.isArray(paymentDetails) || paymentDetails.length === 0) return null;
      return paymentDetails.map((pd: any, idx: number) =>
        React.createElement(Text, { key: idx, style: s.payDetail },
          `• ${pd.modeLabel || pd.mode || "—"} : ${Number(pd.montant || 0).toFixed(2)}€${pd.date ? ` (${pd.date})` : ""}`
        )
      );
    };

    const doc = React.createElement(Document, { title: `Facture ${invoiceNumber}`, author: CLUB.nom },
      React.createElement(Page, { size: "A4", style: s.page },

        // ── En-tête ──────────────────────────────────────────────────────
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
            React.createElement(Text, { style: s.invTitle }, "FACTURE"),
            React.createElement(Text, { style: s.invMeta }, `N° ${invoiceNumber}`),
            React.createElement(Text, { style: s.invMeta }, `Émise le : ${date}`),
            prestationDate
              ? React.createElement(Text, { style: s.invMeta }, `Prestation du : ${prestationDate}`)
              : null,
          ),
        ),

        // ── Client ───────────────────────────────────────────────────────
        React.createElement(View, { style: { marginBottom: 20 } },
          React.createElement(Text, { style: s.partyLabel }, "Facturé à"),
          React.createElement(Text, { style: s.partyName }, familyName || ""),
          familyEmail ? React.createElement(Text, { style: s.partySub }, familyEmail) : null,
          familyAddress ? React.createElement(Text, { style: s.partySub }, familyAddress) : null,
        ),

        // ── Tableau des prestations ───────────────────────────────────────
        React.createElement(View, { style: s.thead },
          React.createElement(Text, { style: [s.theadTxt, s.cDesc] }, "Désignation"),
          React.createElement(Text, { style: [s.theadTxt, s.cQty] }, "Qté"),
          React.createElement(Text, { style: [s.theadTxt, s.cPUHT] }, "PU HT"),
          React.createElement(Text, { style: [s.theadTxt, s.cRemise] }, "Remise"),
          React.createElement(Text, { style: [s.theadTxt, s.cTVA] }, "TVA"),
          React.createElement(Text, { style: [s.theadTxt, s.cTTC] }, "Total TTC"),
        ),
        ...(items).map((item: any, i: number) => {
          const taux = item.tva ?? item.tvaTaux ?? 5.5;
          const disc = item.remise || item.discount || 0;
          // Construire le sous-titre : planning du stage (si présent) sinon vide
          let subtitle = "";
          if (item.stageSchedule) {
            subtitle = item.stageSchedule;
          } else if (Array.isArray(item.stageDates) && item.stageDates.length > 0) {
            // Fallback : construire à partir des dates brutes
            const formatDate = (d: string) => {
              const dt = new Date(d);
              return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            };
            const first = item.stageDates[0];
            const last = item.stageDates[item.stageDates.length - 1];
            const dateRange = item.stageDates.length === 1
              ? formatDate(first.date)
              : `${formatDate(first.date)} → ${formatDate(last.date)}`;
            const hours = first.startTime && first.endTime ? ` · ${first.startTime}–${first.endTime}` : "";
            subtitle = `${dateRange}${hours}`;
          } else if (item.date && item.startTime) {
            // Ancien format : date + startTime à la racine de l'item
            const dt = new Date(item.date);
            const d = isNaN(dt.getTime()) ? item.date : dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
            subtitle = `${d} · ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`;
          }
          return React.createElement(View, { key: String(i), style: i % 2 === 0 ? s.trow : s.trowAlt },
            React.createElement(View, { style: s.cDesc },
              React.createElement(Text, { style: s.cellTxt },
                `${item.activityTitle || item.description || "Prestation"}${item.childName && !String(item.childName).startsWith("child_") && item.childName !== "—" ? ` — ${item.childName}` : ""}`),
              subtitle ? React.createElement(Text, { style: s.cellSubtitle }, subtitle) : null,
            ),
            React.createElement(Text, { style: [s.cellGray, s.cQty] }, `${item.quantity || 1}`),
            React.createElement(Text, { style: [s.cellGray, s.cPUHT] }, `${(item.priceHT || 0).toFixed(2)} €`),
            React.createElement(Text, { style: [s.cellGray, s.cRemise] }, disc > 0 ? `-${disc.toFixed(2)} €` : "—"),
            React.createElement(Text, { style: [s.cellGray, s.cTVA] }, `${taux} %`),
            React.createElement(Text, { style: [s.cellBold, s.cTTC] }, `${(item.priceTTC || 0).toFixed(2)} €`),
          );
        }),

        // ── Récap TVA ────────────────────────────────────────────────────
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
              React.createElement(Text, { style: s.tvaCellVal }, `${t.base.toFixed(2)} €`),
              React.createElement(Text, { style: s.tvaCellVal }, `${t.montant.toFixed(2)} €`),
            )
          ),
        ) : null,

        // ── Totaux ───────────────────────────────────────────────────────
        React.createElement(View, { style: s.totalsBox },
          remise > 0 ? React.createElement(View, { style: s.totalRow },
            React.createElement(Text, { style: s.totLbl }, "Remise"),
            React.createElement(Text, { style: s.totVal }, `-${remise.toFixed(2)} €`),
          ) : null,
          React.createElement(View, { style: s.totalRow },
            React.createElement(Text, { style: s.totLbl }, "Total HT"),
            React.createElement(Text, { style: s.totVal }, `${(totalHT || 0).toFixed(2)} €`),
          ),
          React.createElement(View, { style: s.totalRow },
            React.createElement(Text, { style: s.totLbl }, `TVA${tvaRecap.length === 1 ? ` (${tvaRecap[0].tva} %)` : ""}`),
            React.createElement(Text, { style: s.totVal }, `${(totalTVA || 0).toFixed(2)} €`),
          ),
          React.createElement(View, { style: { ...s.totalRow, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 4, marginTop: 2 } },
            React.createElement(Text, { style: s.totTTCLbl }, "Total TTC"),
            React.createElement(Text, { style: s.totTTCVal }, `${(totalTTC || 0).toFixed(2)} €`),
          ),
        ),

        // ── Non applicable TVA ───────────────────────────────────────────
        !isTVAApplicable
          ? React.createElement(Text, { style: s.mentionTVA }, "TVA non applicable en vertu de l'article 293B du CGI.")
          : null,

        // ── Statut paiement ──────────────────────────────────────────────
        React.createElement(View, { style: [s.payBox, isPaid ? s.payPaid : s.payUnpaid] },
          React.createElement(Text, { style: [s.payTitle, { color: isPaid ? GREEN : ORANGE }] },
            isPaid ? "✓ Facture réglée" : "⏳ En attente de règlement"),
          // Priorité 1 : détail ligne par ligne si fourni
          isPaid && Array.isArray(paymentDetails) && paymentDetails.length > 0
            ? [
                React.createElement(Text, { key: "title", style: s.payDetail }, "Détail des règlements :"),
                ...(renderPaymentDetails() || []),
              ]
            // Priorité 2 : libellé simple (fallback compat)
            : isPaid && paymentMode
              ? React.createElement(Text, { style: s.payDetail }, `Mode de règlement : ${paymentMode}${paymentDate ? ` · le ${paymentDate}` : ""}`)
              : null,
          !isPaid && paidAmount > 0
            ? React.createElement(Text, { style: s.payDetail }, `Acompte versé : ${paidAmount.toFixed(2)} € · Reste dû : ${resteDu.toFixed(2)} €`)
            : null,
          !isPaid && resteDu > 0 && CLUB.iban
            ? React.createElement(Text, { style: s.payDetail },
                `Règlement par virement :\nIBAN : ${CLUB.iban}\nBIC : ${CLUB.bic || ""}`)
            : null,
        ),

        // ── Pied de page ─────────────────────────────────────────────────
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
        "Content-Disposition": `attachment; filename="facture-${invoiceNumber}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("invoice-pdf error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
