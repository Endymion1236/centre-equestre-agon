import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GALOPS_PROGRAMME, DOMAINE_LABELS } from "@/lib/galops-programme";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 🔒 Auth obligatoire
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const childId = req.nextUrl.searchParams.get("childId") || "";
  const familyId = req.nextUrl.searchParams.get("familyId") || "";
  const childName = req.nextUrl.searchParams.get("childName") || "Cavalier";

  if (!childId || !familyId) {
    return new NextResponse("Paramètres manquants", { status: 400 });
  }

  // Charger la progression depuis Firestore
  const docId = `${familyId}_${childId}`;
  const snap = await adminDb.collection("progressions").doc(docId).get();

  if (!snap.exists) {
    return new NextResponse("Aucune progression enregistrée", { status: 404 });
  }

  const data = snap.data()!;
  const acquis: Record<string, boolean> = data.acquis || {};
  const niveauEnCoursId: string = data.niveauEnCours || "";
  const niveauIdx = GALOPS_PROGRAMME.findIndex(n => n.id === niveauEnCoursId);
  const niveauEnCours = niveauIdx >= 0 ? GALOPS_PROGRAMME[niveauIdx] : null;

  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // Charger les notes péda du cavalier
  let notesHtml = "";
  try {
    const famSnap = await adminDb.collection("families").doc(familyId).get();
    if (famSnap.exists) {
      const child = ((famSnap.data() as any).children || []).find((c: any) => c.id === childId);
      const notes = child?.peda?.notes || [];
      if (notes.length > 0) {
        const notesItems = notes.slice(0, 5).map((n: any) => {
          const dateStr = new Date(n.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
          return `<div style="background:#f8f5ff;border-left:3px solid #7c3aed;padding:8px 12px;margin-bottom:6px;border-radius:0 6px 6px 0;">
            <div style="font-size:12px;color:#374151;line-height:1.5;">${n.text}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:4px;">${dateStr}${n.activity ? ` · ${n.activity}` : ""}</div>
          </div>`;
        }).join("");
        notesHtml = `
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;">💬 Commentaires du moniteur</div>
            ${notesItems}
          </div>`;
      }
    }
  } catch (e) { console.error("Notes PDF:", e); }

  const renderNiveau = (niveau: typeof GALOPS_PROGRAMME[0], isCurrent: boolean) => {
    const total = niveau.competences.length;
    const totalAcquis = niveau.competences.filter(c => acquis[c.id]).length;
    const pct = total > 0 ? Math.round((totalAcquis / total) * 100) : 0;

    const parDomaine: Record<string, typeof niveau.competences> = {};
    for (const c of niveau.competences) {
      if (!parDomaine[c.domaine]) parDomaine[c.domaine] = [];
      parDomaine[c.domaine].push(c);
    }

    const domainesHtml = Object.entries(parDomaine).map(([domaine, comps]) => {
      const items = comps.map(c => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;">
          <span style="color:${acquis[c.id] ? "#22c55e" : "#d1d5db"};font-size:16px;line-height:1.2;flex-shrink:0;">${acquis[c.id] ? "✓" : "○"}</span>
          <span style="font-size:11px;color:${acquis[c.id] ? "#166534" : "#9ca3af"};">${c.label}</span>
        </div>
      `).join("");

      const domaineLabel = (DOMAINE_LABELS as any)[domaine] ?? domaine;
      return `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #e5e7eb;">
            ${domaineLabel}
          </div>
          ${items}
        </div>
      `;
    }).join("");

    const barColor = pct === 100 ? "#22c55e" : niveau.color;

    return `
      <div style="margin-bottom:16px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <div style="width:36px;height:36px;border-radius:8px;background:${niveau.color};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;flex-shrink:0;">
            ${niveau.labelCourt}
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:#1e3a5f;">${niveau.label}</div>
            <div style="font-size:11px;color:#6b7280;">${niveau.description}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:bold;color:${barColor};">${pct}%</div>
            <div style="font-size:10px;color:#9ca3af;">${totalAcquis}/${total}</div>
          </div>
        </div>
        <div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;margin-bottom:12px;">
          <div style="height:100%;background:${barColor};border-radius:3px;width:${pct}%;"></div>
        </div>
        ${isCurrent ? domainesHtml : `<div style="color:#6b7280;font-size:11px;font-style:italic;">Niveau validé — toutes les compétences acquises ✓</div>`}
      </div>
    `;
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bilan de progression — ${childName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #1f2937; background: white; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      @page { margin: 10mm 15mm; size: A4; }
      .page { padding: 0 !important; }
    }
    @media screen {
      .page { max-width: 794px; margin: 0 auto; padding: 24px; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Barre d'impression -->
  <div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1e3a5f;padding:10px 20px;display:flex;gap:12px;z-index:100;">
    <button onclick="window.print()" style="background:white;color:#1e3a5f;border:none;padding:8px 18px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">🖨 Imprimer / PDF</button>
    <button onclick="window.close()" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.4);padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;">Fermer</button>
  </div>
  <div class="no-print" style="height:50px;"></div>

  <!-- En-tête -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #1e3a5f;">
    <div>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Centre Équestre d'Agon-Coutainville</div>
      <h1 style="font-size:22px;font-weight:800;color:#1e3a5f;margin-bottom:2px;">Bilan de progression</h1>
      <div style="font-size:17px;font-weight:600;color:#2050A0;">${childName}</div>
      ${niveauEnCours ? `<div style="margin-top:8px;display:inline-block;background:${niveauEnCours.color};color:white;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">${niveauEnCours.label}</div>` : ""}
    </div>
    <div style="text-align:right;color:#9ca3af;font-size:11px;">
      <div>Édité le ${today}</div>
      <div style="margin-top:4px;">Programme FFE officiel</div>
    </div>
  </div>

  ${!niveauEnCours ? `<p style="color:#6b7280;font-style:italic;">Aucune progression enregistrée.</p>` : `

  <!-- Niveau en cours uniquement -->
  ${renderNiveau(niveauEnCours, true)}

  `}

  <!-- Notes du moniteur -->
  ${notesHtml}

  <!-- Signature -->
  <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;">
    <div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:24px;">Validé par le moniteur</div>
      <div style="width:160px;border-top:1px solid #374151;padding-top:4px;font-size:10px;color:#9ca3af;">Signature</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:24px;">Date</div>
      <div style="width:120px;border-top:1px solid #374151;padding-top:4px;font-size:10px;color:#9ca3af;"></div>
    </div>
  </div>

</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
