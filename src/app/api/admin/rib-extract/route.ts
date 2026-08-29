import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { adminDb } from "@/lib/firebase-admin";
import { gmailGetAttachment, driveGetFile } from "@/lib/gmail";
import { validateIban, validateBic } from "@/lib/sepa-validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/rib-extract — lecture assistée d'un RIB.
 *
 * Une famille renvoie son RIB en pièce jointe : cette route le lit (PDF ou
 * photo) et en extrait titulaire / IBAN / BIC, puis propose la fiche famille
 * correspondante. Elle N'ÉCRIT RIEN : le mandat reste créé à la main dans
 * Paiements → SEPA, après relecture par l'admin.
 *
 * Trois garde-fous, parce qu'un chiffre faux = prélèvement rejeté et frais :
 *  1. l'IBAN est vérifié par sa CLÉ DE CONTRÔLE (ISO 13616, modulo 97) — une
 *     erreur de lecture d'un chiffre est rejetée ici, pas à la banque ;
 *  2. le BIC est validé structurellement et confronté au pays de l'IBAN ;
 *  3. rien n'est enregistré sans l'admin.
 *
 * Données bancaires : l'IBAN n'est jamais écrit dans les logs.
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEME = `Tu lis un document bancaire français (RIB / relevé d'identité bancaire), fourni en image ou en PDF.

Réponds UNIQUEMENT en JSON, sans texte autour :
{"estRib":true|false,"titulaire":string|null,"iban":string|null,"bic":string|null,"banque":string|null,"remarque":string|null}

Règles :
- "iban" : en MAJUSCULES, sans espaces (ex. FR7630004000031234567890143).
- "bic" : le code BIC/SWIFT s'il figure sur le document, sinon null.
- "titulaire" : le nom du titulaire du compte tel qu'écrit.
- "banque" : nom de l'établissement.
- "estRib" : false si le document n'est pas un RIB (facture, certificat médical, photo sans rapport).
- Ne devine JAMAIS un caractère illisible : mets null et explique dans "remarque".
- "remarque" : courte, en français, uniquement si quelque chose mérite l'attention (document flou, deux comptes présents, titulaire différent du nom attendu).`;

/** Normalisation pour rapprocher un nom de titulaire d'un nom de fiche. */
const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // Chaque lecture est un appel modèle facturé : on borne l'usage.
  const rl = await checkRateLimit({
    uid: (auth as any).uid,
    routeKey: "rib-extract",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Assistant non configuré (clé API absente)." }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const { messageId, attachmentId, mimeType, base64, from, driveFileId } = body || {};

    // Source : pièce jointe Gmail, ou fichier envoyé directement (photo prise
    // au club). Dans les deux cas on travaille sur des octets, jamais une URL.
    let data: string;
    let type: string = String(mimeType || "").toLowerCase();
    if (messageId && attachmentId) {
      const buf = await gmailGetAttachment(String(messageId), String(attachmentId));
      if (buf.length > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "Pièce jointe trop lourde (max 10 Mo)." }, { status: 400 });
      }
      data = buf.toString("base64");
    } else if (driveFileId) {
      // RIB « inséré avec Drive » : pas de pièce jointe, juste un lien.
      try {
        const f = await driveGetFile(String(driveFileId));
        data = f.buffer.toString("base64");
        type = f.mimeType.toLowerCase();
      } catch (e: any) {
        if (e?.message === "DRIVE_SCOPE_MANQUANT") {
          return NextResponse.json({
            error: "Google Drive n'est pas encore autorisé. Reconnectez le compte Google depuis la Boîte email (bouton Reconnecter), puis réessayez.",
          }, { status: 200 });
        }
        return NextResponse.json({
          error: "Fichier Drive illisible — il n'est peut-être pas partagé avec le compte du club. Ouvrez le lien, téléchargez le fichier et déposez-le ici.",
        }, { status: 200 });
      }
    } else if (base64) {
      data = String(base64).replace(/^data:[^;]+;base64,/, "");
      if (Buffer.byteLength(data, "base64") > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "Fichier trop lourd (max 10 Mo)." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Aucun document fourni (pièce jointe, fichier Drive ou fichier déposé)." }, { status: 400 });
    }

    const estPdf = type === "application/pdf";
    if (!estPdf && !type.startsWith("image/")) {
      return NextResponse.json({ error: "Format non lu : fournissez un PDF ou une photo." }, { status: 400 });
    }

    const piece: any = estPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: type, data } };

    const msg = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEME,
      messages: [{ role: "user", content: [piece, { type: "text", text: "Extrais les coordonnées bancaires de ce document." }] }],
    });

    const brut = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
    let lu: any;
    try {
      lu = JSON.parse(brut.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    } catch {
      return NextResponse.json({ error: "Document illisible — réessayez avec une photo plus nette." }, { status: 200 });
    }

    if (!lu?.estRib) {
      return NextResponse.json({
        estRib: false,
        remarque: lu?.remarque || "Ce document ne ressemble pas à un RIB.",
      });
    }

    // ── Vérifications : la clé de contrôle rattrape une lecture erronée ──
    const iban = String(lu.iban || "").replace(/\s/g, "").toUpperCase();
    const ibanCheck = iban ? validateIban(iban) : { valid: false, error: "IBAN non lu sur le document" };
    const bic = String(lu.bic || "").replace(/\s/g, "").toUpperCase();
    const bicCheck = bic && ibanCheck.valid ? validateBic(bic, iban.substring(0, 2)) : { valid: !bic, error: null as string | null };

    // ── Rapprochement avec une fiche famille ──
    // L'expéditeur du mail d'abord (le plus fiable), le nom du titulaire
    // ensuite. On PROPOSE : c'est l'admin qui tranche.
    const emailExp = String(from || "").toLowerCase().trim();
    const titulaireNorm = norm(String(lu.titulaire || ""));
    const famSnap = await adminDb.collection("families").get();
    const candidats: { familyId: string; parentName: string; parentEmail: string; motif: string }[] = [];
    famSnap.docs.forEach(d => {
      const f = d.data() as any;
      if (f.status === "merged") return;
      const mail = String(f.parentEmail || "").toLowerCase().trim();
      const nom = norm(f.parentName || "");
      if (emailExp && mail && mail === emailExp) {
        candidats.push({ familyId: d.id, parentName: f.parentName || "", parentEmail: f.parentEmail || "", motif: "email de l'expéditeur" });
      } else if (titulaireNorm && nom && (nom.includes(titulaireNorm) || titulaireNorm.includes(nom))) {
        candidats.push({ familyId: d.id, parentName: f.parentName || "", parentEmail: f.parentEmail || "", motif: "nom du titulaire" });
      }
    });
    // L'email prime sur le nom, et on ne noie pas l'admin sous les homonymes.
    candidats.sort((a, b) => (a.motif === "email de l'expéditeur" ? -1 : 0) - (b.motif === "email de l'expéditeur" ? -1 : 0));

    return NextResponse.json({
      estRib: true,
      titulaire: lu.titulaire || null,
      iban: ibanCheck.valid ? iban : null,
      ibanBrut: iban || null,
      ibanValide: ibanCheck.valid,
      ibanErreur: ibanCheck.valid ? null : ibanCheck.error,
      bic: bicCheck.valid ? bic : null,
      bicErreur: bicCheck.valid ? null : bicCheck.error,
      banque: lu.banque || null,
      remarque: lu.remarque || null,
      candidats: candidats.slice(0, 5),
    });
  } catch (e: any) {
    // Message d'erreur seul : jamais le contenu du document.
    console.error("[rib-extract]", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible. Réessayez ou saisissez le RIB à la main." }, { status: 500 });
  }
}
