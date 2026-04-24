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

  // Charger la note péda "featured" (épinglée pour le bilan) du cavalier
  let featuredNoteText = "";
  let featuredNoteDate = "";
  let featuredNoteActivity = "";
  try {
    const famSnap = await adminDb.collection("families").doc(familyId).get();
    if (famSnap.exists) {
      const famData = famSnap.data() as any;
      const child = (famData.children || []).find((c: any) => c.id === childId);
      const notes = child?.peda?.notes || [];
      console.log(`[PDF] familyId=${familyId}, childId=${childId}, nbNotes=${notes.length}, featured=${notes.filter((n: any) => n.featured).length}`);
      const featured = notes.find((n: any) => n.featured);
      if (featured) {
        featuredNoteText = featured.text || "";
        featuredNoteDate = new Date(featured.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        featuredNoteActivity = featured.activity || "";
      }
    }
  } catch (e) { console.error("Notes PDF:", e); }
  if (!featuredNoteText) console.log(`[PDF] Pas de note featured pour familyId=${familyId} childId=${childId}`);

  // ── Densité adaptative selon le nombre de compétences du niveau ────────────
  // Les petits niveaux (Poney Bronze/Argent/Or, Galop Bronze/Argent/Or, ≤24 items)
  // tiennent largement sur 1 page A4 en typographie confortable, tout inclus.
  // Les gros niveaux (G3+, 27-36 items) basculent en mode recto-verso :
  //   - recto = en-tête + barre de progression + compétences par domaine (2 colonnes)
  //   - verso = commentaire moniteur + signature
  const total = niveauEnCours?.competences.length ?? 0;
  const isBigLevel = total >= 26;

  const renderNiveau = (niveau: typeof GALOPS_PROGRAMME[0], isCurrent: boolean) => {
    const nbTotal = niveau.competences.length;
    const nbAcquis = niveau.competences.filter(c => acquis[c.id]).length;
    const pct = nbTotal > 0 ? Math.round((nbAcquis / nbTotal) * 100) : 0;

    // Densité : gros niveaux un peu plus compacts, petits niveaux aérés
    const fsComp   = isBigLevel ? "10.5px" : "11.5px";
    const fsDom    = isBigLevel ? "10.5px" : "11px";
    const padItem  = isBigLevel ? "2.5px 0" : "3.5px 0";
    const iconSize = isBigLevel ? "14px" : "15px";
    const marginDomaine = isBigLevel ? "11px" : "13px";

    const parDomaine: Record<string, typeof niveau.competences> = {};
    for (const c of niveau.competences) {
      if (!parDomaine[c.domaine]) parDomaine[c.domaine] = [];
      parDomaine[c.domaine].push(c);
    }

    const domainesHtml = Object.entries(parDomaine).map(([domaine, comps]) => {
      const items = comps.map(c => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:${padItem};">
          <span style="color:${acquis[c.id] ? "#22c55e" : "#d1d5db"};font-size:${iconSize};line-height:1.2;flex-shrink:0;">${acquis[c.id] ? "✓" : "○"}</span>
          <span style="font-size:${fsComp};line-height:1.3;color:${acquis[c.id] ? "#166534" : "#9ca3af"};">${c.label}</span>
        </div>
      `).join("");

      const domaineLabel = (DOMAINE_LABELS as any)[domaine] ?? domaine;
      return `
        <div style="margin-bottom:${marginDomaine};page-break-inside:avoid;break-inside:avoid;">
          <div style="font-size:${fsDom};font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;padding-bottom:3px;border-bottom:2px solid #e5e7eb;">
            ${domaineLabel}
          </div>
          ${items}
        </div>
      `;
    }).join("");

    const barColor = pct === 100 ? "#22c55e" : niveau.color;

    return `
      <div style="page-break-inside:avoid;">
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
            <div style="font-size:10px;color:#9ca3af;">${nbAcquis}/${nbTotal}</div>
          </div>
        </div>
        <div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;margin-bottom:14px;">
          <div style="height:100%;background:${barColor};border-radius:3px;width:${pct}%;"></div>
        </div>
        ${isCurrent
          ? `<div style="column-count:2;column-gap:20px;">${domainesHtml}</div>`
          : `<div style="color:#6b7280;font-size:11px;font-style:italic;">Niveau validé — toutes les compétences acquises ✓</div>`}
      </div>
    `;
  };

  // ── Bloc commentaire moniteur ───────────────────────────────────────────────
  const renderCommentaireCompact = () => {
    if (!featuredNoteText) return "";
    return `
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;page-break-inside:avoid;">
        <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;">💬 Commentaire du moniteur</div>
        <div style="background:#f8f5ff;border-left:3px solid #7c3aed;padding:10px 14px;border-radius:0 6px 6px 0;">
          <div style="font-size:12px;color:#374151;line-height:1.6;">${featuredNoteText}</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:6px;">${featuredNoteDate}${featuredNoteActivity ? ` · ${featuredNoteActivity}` : ""}</div>
        </div>
      </div>`;
  };

  const renderCommentaireLarge = () => `
    <div style="margin-bottom:22px;">
      <div style="font-size:14px;font-weight:700;color:#7c3aed;margin-bottom:10px;">💬 Commentaire du moniteur</div>
      <div style="background:#f8f5ff;border-left:4px solid #7c3aed;padding:14px 18px;border-radius:0 8px 8px 0;min-height:120px;">
        ${featuredNoteText
          ? `<div style="font-size:12.5px;color:#374151;line-height:1.65;">${featuredNoteText}</div>
             <div style="font-size:10px;color:#9ca3af;margin-top:10px;">${featuredNoteDate}${featuredNoteActivity ? ` · ${featuredNoteActivity}` : ""}</div>`
          : `<div style="font-size:11px;color:#9ca3af;font-style:italic;">Zone libre — à compléter après le bilan.</div>`
        }
      </div>
    </div>
  `;

  const renderSignatureCompact = () => `
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;page-break-inside:avoid;">
      <div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:24px;">Validé par le moniteur</div>
        <div style="width:160px;border-top:1px solid #374151;padding-top:4px;font-size:10px;color:#9ca3af;">Signature</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:24px;">Date</div>
        <div style="width:120px;border-top:1px solid #374151;padding-top:4px;font-size:10px;color:#9ca3af;"></div>
      </div>
    </div>
  `;

  const renderSignatureLarge = () => `
    <div style="margin-top:30px;padding-top:20px;border-top:1.5px solid #1e3a5f;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:40px;">
        <div style="flex:1;">
          <div style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:40px;">Validé par le moniteur</div>
          <div style="border-top:1px solid #374151;padding-top:6px;">
            <div style="font-size:10px;color:#9ca3af;">Signature</div>
          </div>
        </div>
        <div style="flex:1;">
          <div style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:40px;">Date</div>
          <div style="border-top:1px solid #374151;padding-top:6px;">
            <div style="font-size:10px;color:#9ca3af;">JJ/MM/AAAA</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── En-têtes ────────────────────────────────────────────────────────────────
  const enTetePrincipal = `
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
  `;

  const enTeteVerso = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid #e5e7eb;">
      <div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;">Bilan de progression — suite</div>
        <div style="font-size:16px;font-weight:700;color:#1e3a5f;margin-top:2px;">${childName}</div>
      </div>
      <div style="text-align:right;">
        ${niveauEnCours ? `<div style="display:inline-block;background:${niveauEnCours.color};color:white;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;">${niveauEnCours.label}</div>` : ""}
        <div style="font-size:10px;color:#9ca3af;margin-top:4px;">Édité le ${today}</div>
      </div>
    </div>
  `;

  // ── Construction du contenu selon la taille du niveau ──────────────────────
  // Petits niveaux : 1 seule page (recto) avec en-tête + progression + commentaire + signature
  const smallLevelContent = `
    ${enTetePrincipal}
    ${!niveauEnCours
      ? `<p style="color:#6b7280;font-style:italic;">Aucune progression enregistrée.</p>`
      : renderNiveau(niveauEnCours, true)
    }
    ${renderCommentaireCompact()}
    ${renderSignatureCompact()}
  `;

  // Gros niveaux : 2 pages (recto progression, verso commentaire + signature)
  const bigLevelContent = `
    <!-- RECTO -->
    ${enTetePrincipal}
    ${!niveauEnCours
      ? `<p style="color:#6b7280;font-style:italic;">Aucune progression enregistrée.</p>`
      : renderNiveau(niveauEnCours, true)
    }
    <div style="margin-top:20px;padding-top:8px;border-top:1px dashed #e5e7eb;text-align:center;font-size:10px;color:#9ca3af;font-style:italic;">
      → Voir au dos le commentaire du moniteur et la signature
    </div>

    <!-- Saut de page forcé pour le verso -->
    <div style="page-break-before:always;break-before:page;"></div>

    <!-- VERSO -->
    ${enTeteVerso}
    ${renderCommentaireLarge()}

    <!-- Encarts Points forts / Axes de progrès — à compléter au stylo -->
    <div style="margin-bottom:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px;page-break-inside:avoid;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;min-height:110px;">
        <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;">🌟 Points forts</div>
        <div style="font-size:11px;color:#bbf7d0;line-height:1.8;">___________________________<br>___________________________<br>___________________________<br>___________________________</div>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;min-height:110px;">
        <div style="font-size:12px;font-weight:700;color:#c2410c;margin-bottom:8px;">🎯 Axes de progrès</div>
        <div style="font-size:11px;color:#fed7aa;line-height:1.8;">___________________________<br>___________________________<br>___________________________<br>___________________________</div>
      </div>
    </div>

    ${renderSignatureLarge()}

    <!-- Footer verso -->
    <div style="margin-top:30px;padding-top:8px;border-top:1px solid #f3f4f6;text-align:center;font-size:9px;color:#9ca3af;">
      Centre Équestre d'Agon-Coutainville · Programme FFE officiel · centreequestreagon.com
    </div>
  `;

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
      @page { margin: 10mm 12mm; size: A4; }
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
  <div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1e3a5f;padding:10px 20px;display:flex;gap:12px;align-items:center;z-index:100;">
    <button onclick="window.print()" style="background:white;color:#1e3a5f;border:none;padding:8px 18px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">🖨 Imprimer / PDF</button>
    <button onclick="window.close()" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.4);padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;">Fermer</button>
    ${isBigLevel
      ? `<div style="color:#fde68a;font-size:12px;margin-left:auto;font-style:italic;">💡 Niveau ${niveauEnCours?.label || ""} — pensez à cocher <b>Recto-verso</b> dans les options d'impression</div>`
      : ""}
  </div>
  <div class="no-print" style="height:50px;"></div>

  ${isBigLevel ? bigLevelContent : smallLevelContent}

</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
