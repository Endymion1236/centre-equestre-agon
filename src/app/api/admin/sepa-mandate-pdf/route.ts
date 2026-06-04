import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { verifyAuth } from "@/lib/api-auth";
import { getClubInfo } from "@/lib/club-info";
import { SEPA_CREDITOR } from "@/lib/sepa";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Logo encodé en base64 au démarrage
let logoBase64 = "";
try {
  const logoBuffer = readFileSync(join(process.cwd(), "public", "images", "logo-ce-agon.png"));
  logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
} catch { /* logo optionnel */ }

const BLUE = "#1e3a5f";
const GRAY = "#6b7280";
const LIGHT = "#f9fafb";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, padding: "36 44 56 44", color: "#1f2937", backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  logo: { width: 42, height: 42, objectFit: "contain" },
  clubName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BLUE },
  clubSub: { fontSize: 8, color: GRAY },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "center", marginTop: 14, marginBottom: 2 },
  subtitle: { fontSize: 8.5, color: GRAY, textAlign: "center", marginBottom: 14 },
  rumBox: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4, padding: "6 10", marginBottom: 14, backgroundColor: LIGHT },
  rumLabel: { fontSize: 7.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  rumVal: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE },
  legal: { fontSize: 8.5, color: "#374151", lineHeight: 1.5, marginBottom: 14, textAlign: "justify" },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5, marginTop: 4 },
  row: { flexDirection: "row", marginBottom: 5 },
  cell: { width: "50%" },
  fLabel: { fontSize: 7.5, color: GRAY, marginBottom: 1 },
  fVal: { fontSize: 9.5, color: "#1f2937" },
  fValBold: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: BLUE },
  blank: { fontSize: 9.5, color: "#9ca3af" },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 14, marginTop: 2 },
  box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 5, padding: 10, marginBottom: 12 },
  typeRow: { flexDirection: "row", gap: 24, marginBottom: 12, marginTop: 2 },
  checkbox: { width: 9, height: 9, borderWidth: 1, borderColor: "#6b7280", marginRight: 5 },
  typeItem: { flexDirection: "row", alignItems: "center" },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  signCol: { width: "47%" },
  note: { fontSize: 7.5, color: GRAY, marginTop: 16, lineHeight: 1.4, fontStyle: "italic" },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, fontSize: 7, color: "#9ca3af", textAlign: "center", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 },
});

function field(label: string, value?: string) {
  return React.createElement(View, { style: s.cell },
    React.createElement(Text, { style: s.fLabel }, label),
    value
      ? React.createElement(Text, { style: s.fValBold }, value)
      : React.createElement(View, { style: s.fieldLine }),
  );
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyId } = await request.json();
    if (!familyId) return NextResponse.json({ error: "familyId requis" }, { status: 400 });

    const [club, famSnap, mandatSnap] = await Promise.all([
      getClubInfo(),
      adminDb.collection("families").doc(String(familyId)).get(),
      adminDb.collection("mandats-sepa").where("familyId", "==", String(familyId)).where("status", "==", "active").limit(1).get(),
    ]);

    const fam = famSnap.exists ? (famSnap.data() as any) : {};
    const debtorName = fam.parentName || fam.titulaire || "";
    const debtorAddress = fam.address || fam.adresse || "";
    const debtorZip = fam.zipCode || fam.cp || fam.codePostal || "";
    const debtorCity = fam.city || fam.ville || "";
    const debtorAddrFull = [debtorAddress, [debtorZip, debtorCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    const mandat = !mandatSnap.empty ? (mandatSnap.docs[0].data() as any) : null;
    const rum = mandat?.mandatId || "À compléter par le centre";

    const creditorAddress = club.address || "";

    const doc = React.createElement(Document, { title: "Mandat de prélèvement SEPA", author: club.nom },
      React.createElement(Page, { size: "A4", style: s.page },
        // En-tête club
        React.createElement(View, { style: s.header },
          logoBase64 ? React.createElement(Image, { src: logoBase64, style: s.logo }) : null,
          React.createElement(View, {},
            React.createElement(Text, { style: s.clubName }, club.nom),
            React.createElement(Text, { style: s.clubSub }, club.legalName),
          ),
        ),

        React.createElement(Text, { style: s.title }, "MANDAT DE PRÉLÈVEMENT SEPA"),
        React.createElement(Text, { style: s.subtitle }, "Paiement récurrent / ponctuel — type CORE"),

        // RUM
        React.createElement(View, { style: s.rumBox },
          React.createElement(Text, { style: s.rumLabel }, "Référence Unique de Mandat (RUM)"),
          React.createElement(Text, { style: s.rumVal }, rum),
        ),

        // Texte légal
        React.createElement(Text, { style: s.legal },
          "En signant ce formulaire de mandat, vous autorisez (A) " + club.legalName + " à envoyer des instructions à votre banque pour débiter votre compte, et (B) votre banque à débiter votre compte conformément aux instructions de " + club.legalName + ". " +
          "Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans la convention que vous avez passée avec elle. Une demande de remboursement doit être présentée dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé.",
        ),

        // Créancier (pré-rempli)
        React.createElement(Text, { style: s.sectionLabel }, "Créancier"),
        React.createElement(View, { style: s.box },
          React.createElement(View, { style: s.row },
            field("Nom du créancier", club.legalName),
            field("Identifiant Créancier SEPA (ICS)", SEPA_CREDITOR.ics),
          ),
          React.createElement(View, { style: { ...s.row, marginBottom: 0 } },
            field("Adresse", creditorAddress),
            field("", undefined),
          ),
        ),

        // Débiteur (nom/adresse pré-remplis, coordonnées bancaires à compléter)
        React.createElement(Text, { style: s.sectionLabel }, "Débiteur (titulaire du compte à débiter)"),
        React.createElement(View, { style: s.box },
          React.createElement(View, { style: s.row },
            field("Nom, prénom", debtorName),
            field("", undefined),
          ),
          React.createElement(View, { style: s.row },
            field("Adresse", debtorAddrFull),
            field("", undefined),
          ),
          React.createElement(View, { style: { ...s.row, marginBottom: 0 } },
            field("IBAN (à compléter)"),
            field("BIC (à compléter)"),
          ),
        ),

        // Type de paiement
        React.createElement(Text, { style: s.sectionLabel }, "Type de paiement"),
        React.createElement(View, { style: s.typeRow },
          React.createElement(View, { style: s.typeItem },
            React.createElement(View, { style: s.checkbox }),
            React.createElement(Text, { style: s.fVal }, "Paiement récurrent / répétitif"),
          ),
          React.createElement(View, { style: s.typeItem },
            React.createElement(View, { style: s.checkbox }),
            React.createElement(Text, { style: s.fVal }, "Paiement ponctuel"),
          ),
        ),

        // Signature
        React.createElement(View, { style: s.signRow },
          React.createElement(View, { style: s.signCol },
            React.createElement(Text, { style: s.fLabel }, "Fait à"),
            React.createElement(View, { style: s.fieldLine }),
            React.createElement(Text, { style: { ...s.fLabel, marginTop: 8 } }, "Le"),
            React.createElement(View, { style: s.fieldLine }),
          ),
          React.createElement(View, { style: s.signCol },
            React.createElement(Text, { style: s.fLabel }, "Signature du débiteur"),
            React.createElement(View, { style: { ...s.fieldLine, height: 48 } }),
          ),
        ),

        React.createElement(Text, { style: s.note },
          "Note : vos droits concernant le présent mandat sont expliqués dans un document que vous pouvez obtenir auprès de votre banque. " +
          "Veuillez compléter votre IBAN et votre BIC, dater et signer, puis retourner ce mandat au centre. Joindre un relevé d'identité bancaire (RIB).",
        ),

        React.createElement(Text, { style: s.footer },
          `${club.legalName} · SIRET ${club.siret}` + (club.tvaIntra ? ` · TVA ${club.tvaIntra}` : "") + ` · ${club.email}`,
        ),
      ),
    );

    const buffer = await renderToBuffer(doc);
    const safeName = (debtorName || "famille").replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="mandat-sepa-${safeName}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("sepa-mandate-pdf error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
