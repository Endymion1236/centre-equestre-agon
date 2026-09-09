/**
 * src/lib/lien-paiement.ts
 *
 * Envoi et ouverture d'un lien de paiement — le cœur de /api/send-payment-link
 * et de la page /payer/<jeton>.
 *
 * Le lien envoyé à la famille mène sur NOTRE site, pas directement sur la
 * page CAWL. Pourquoi : une page de paiement hébergée CAWL ne vit que
 * 2 heures et ne peut pas être rappelée. En passant par chez nous :
 *
 *   - le lien vaut 7 jours (lib/lien-paiement-regles), et se révoque pour
 *     de vrai : un lien annulé n'ouvre plus rien ;
 *   - la page CAWL est créée AU CLIC, du montant que la commande doit encore
 *     à cet instant — un lien ancien ou en double ne fait pas payer deux fois ;
 *   - deux clics sur le même lien retombent sur la même session CAWL tant
 *     qu'elle est fraîche.
 *
 * Chaque envoi laisse une trace dans `payment-links` : montant, destinataire,
 * jeton, expiration, puis la session CAWL ouverte au clic.
 */

import { randomBytes } from "crypto";
import { prestationsCourtes, lignesDetailHtml } from "@/lib/email-prestations";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe, emailSignature, emailCouleurs as COULEURS, euros, eurosTexte,
} from "@/lib/email-templates";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { generateCAWLQR, generateSEPAQR } from "@/lib/payment-qr";
import { serviceAuthHeader } from "@/lib/api-auth";
import {
  expirationLien, etatLien, montantOuvertureLien, checkoutReutilisable, type EtatLien,
} from "@/lib/lien-paiement-regles";

const POLICE_TEXTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const COLLECTION_LIENS = "payment-links";

/** Adresse publique d'un lien : c'est elle qui figure dans l'email et le QR code. */
export const urlLienPaiement = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/payer/${token}`;

export interface ParamsLienPaiement {
  paymentId: string;
  recipientEmail: string;
  /** Montant en euros. */
  amount: number;
  message?: string;
  familyId?: string;
  familyName?: string;
  /** Origine du site (https://…) : le lien envoyé pointe dessus. */
  origin: string;
  /** Qui déclenche l'envoi — journal des emails. */
  sentBy: string;
}

export type ResultatLienPaiement =
  | { ok: true; paymentUrl: string; linkId: string; expiresAt: string }
  | { ok: false; error: string; status: number };

export async function envoyerLienPaiement(p: ParamsLienPaiement): Promise<ResultatLienPaiement> {
  const { paymentId, recipientEmail, amount, message, familyId, familyName, origin, sentBy } = p;

  if (!paymentId || !recipientEmail || !amount) {
    return { ok: false, error: "Champs requis : paymentId, recipientEmail, amount", status: 400 };
  }
  if (!origin) return { ok: false, error: "Origine du site inconnue", status: 500 };

  // 1. Vérifier que le paiement existe
  const paySnap = await adminDb.collection("payments").doc(paymentId).get();
  if (!paySnap.exists) {
    return { ok: false, error: "Paiement introuvable", status: 404 };
  }
  const payData = paySnap.data()!;
  const resteDu = (payData.totalTTC || 0) - (payData.paidAmount || 0);

  if (amount > resteDu + 0.01) {
    return { ok: false, error: `Montant supérieur au reste dû (${resteDu.toFixed(2)}€)`, status: 400 };
  }

  // 2. Le lien lui-même : un jeton, une adresse chez nous. La page CAWL
  //    n'est pas créée maintenant — elle le sera au clic (ouvrirLienPaiement).
  const token = randomBytes(24).toString("hex");
  const paymentUrl = urlLienPaiement(origin, token);
  const envoyeLe = new Date();
  const expiresAt = expirationLien(envoyeLe);
  const joursValidite = Math.round((expiresAt.getTime() - envoyeLe.getTime()) / 86_400_000);

  // 3. Envoyer l'email avec le lien
  // Le panier a DÉJÀ mis le prénom dans activityTitle : le recoller donnait
  // « Stage galop de bronze — Aurèle COSTEGROSSE — Aurèle COSTEGROSSE »
  // dans le mail reçu. prestationsCourtes ne l'ajoute que s'il manque.
  const prestations = prestationsCourtes(payData.items || []);
  // Version détaillée pour le panneau : date, horaires et moniteur sous
  // chaque prestation. Le libellé seul — « Promenade débrouillés — Léa » —
  // laissait la famille sans le jour ni l'heure de ce qu'elle règle.
  const prestationsDetail = lignesDetailHtml(payData.items || []) || prestations;

  const htmlMessage = message
    ? emailParagraphe(message.replace(/\n/g, "<br/>"))
    : emailParagraphe("Bonjour,") + emailParagraphe(`Voici le lien de paiement pour régler <strong>${euros(amount)}</strong> — ${prestations}.`);

  // Générer les QR codes (CAWL pour paiement carte, SEPA pour virement bancaire).
  // On utilise le mécanisme CID (Content-ID) de Resend plutôt que des images
  // base64 inline, car Gmail bloque les <img src="data:image/..."> pour
  // raisons de sécurité. Avec CID, les images sont attachées au mail (en
  // multipart/related) et référencées via <img src="cid:xxx">. Méthode standard
  // MIME, supportée par Gmail, Outlook, iCloud, etc.
  const qrCAWL = await generateCAWLQR(paymentUrl, "email");
  const sepaLibelle = `${(payData as any).invoiceNumber || paymentId.slice(0, 8)} ${payData.familyName || ""}`.trim();
  const qrSEPA = await generateSEPAQR(amount, sepaLibelle, "email");

  // Identifiants CID simples (pas d'@, pas de paymentId trop long).
  // L'API REST Resend attend content_id en snake_case (pas contentId).
  const cidCAWL = `qr-cawl`;
  const cidSEPA = `qr-sepa`;

  // Section QR — mêmes images (référencées par cid:, pas par data:), mise
  // en page reprise du reste des emails.
  const qrSection = (qrCAWL || qrSEPA) ? emailPanneau("Ou scannez avec votre téléphone", `
      <table role="presentation" style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
        <tr>
          ${qrCAWL ? `
          <td style="text-align:center;vertical-align:top;padding:8px;">
            <img src="cid:${cidCAWL}" alt="QR Code paiement carte" style="display:block;margin:0 auto;width:140px;height:140px;border:0;" />
            <div style="margin:10px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COULEURS.encre};">Paiement carte</div>
            <div style="margin:3px 0 0;font-family:${POLICE_TEXTE};font-size:12px;color:${COULEURS.gris};">Instantané, avec l'appareil photo</div>
          </td>
          ` : ""}
          ${qrSEPA ? `
          <td style="text-align:center;vertical-align:top;padding:8px;">
            <img src="cid:${cidSEPA}" alt="QR Code virement SEPA" style="display:block;margin:0 auto;width:140px;height:140px;border:0;" />
            <div style="margin:10px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COULEURS.encre};">Virement bancaire</div>
            <div style="margin:3px 0 0;font-family:${POLICE_TEXTE};font-size:12px;color:${COULEURS.gris};">ING, Boursorama, Revolut, BNP Pro…</div>
          </td>
          ` : ""}
        </tr>
      </table>
  `) : "";

  // Habillage commun (lib/email-templates). Ce message portait sa propre
  // mise en forme — Arial, fond gris, en-tête bleu — sans rapport avec les
  // autres. Or c'est souvent le premier email qu'une famille reçoit.
  const emailHtml = emailLayout([
    emailTitre("Votre lien de paiement"),
    htmlMessage,
    emailButton(`Payer ${euros(amount)}`, paymentUrl),
    emailPanneau("Détail", [
      emailLigne("Famille", String(payData.familyName || "")),
      emailLigne("Prestations", prestationsDetail),
      emailLigne("Montant", euros(amount)),
      amount < resteDu ? emailLigne("Reste dû après ce paiement", euros(resteDu - amount)) : "",
    ].join("")),
    qrSection,
    emailParagraphe(`<span style="color:${COULEURS.discret};">Paiement sécurisé par CAWL — Crédit Agricole. Ce lien est valable ${joursValidite} jours.</span>`, 11),
    emailSignature(),
  ].join("\n"), `${euros(amount)} — ${prestations}`);

  // Envoyer via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const subject = `Lien de paiement — ${eurosTexte(amount)}`;
  const sentByUid = sentBy || "admin";
  let statutEnvoi: "sent" | "failed" = "failed";
  await refreshEmailMode();
  if (resendKey && !isRecipientAllowed(recipientEmail)) {
    // 🔒 Garde-fou phase de préparation : on ne pousse pas le lien à la famille.
    console.warn(blockedLog(recipientEmail, "payment_link"));
    await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: "Bloqué par le mode restreint (email-guard)", sentBy: sentByUid, paymentId, familyId: payData.familyId });
  } else if (resendKey) {
    try {
      // Construire la liste d'attachments avec les QR codes en CID.
      // IMPORTANT : l'API REST Resend attend content_id (snake_case), pas
      // contentId (camelCase) — c'est la convention JSON pour l'API HTTP
      // brute, alors que le SDK Node accepte les deux. On utilise fetch()
      // direct ici, donc snake_case obligatoire. Sinon Resend ne sait pas
      // qu'il faut référencer cette image via cid:xxx et la traite comme
      // une simple pièce jointe (ce que tu as constaté sur ta capture).
      const attachments: any[] = [];
      if (qrCAWL) {
        attachments.push({
          filename: "qr-paiement-carte.png",
          content: qrCAWL.base64Raw,
          content_id: cidCAWL,
          content_type: "image/png",
        });
      }
      if (qrSEPA) {
        attachments.push({
          filename: "qr-virement-sepa.png",
          content: qrSEPA.base64Raw,
          content_id: cidSEPA,
          content_type: "image/png",
        });
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "noreply@ce-agon.fr",
          to: recipientEmail,
          bcc: "ceagon50@gmail.com",
          subject,
          html: emailHtml,
          ...(attachments.length > 0 ? { attachments } : {}),
        }),
      });
      if (resendRes.ok) {
        statutEnvoi = "sent";
        await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "sent", sentBy: sentByUid, paymentId, familyId: payData.familyId });
      } else {
        const errText = await resendRes.text().catch(() => "");
        await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: sentByUid, paymentId, familyId: payData.familyId });
      }
    } catch (e: any) {
      await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: "Erreur interne", sentBy: sentByUid, paymentId, familyId: payData.familyId });
      console.error("Erreur envoi email:", e);
    }
  }

  // 4. Tracer l'envoi — jeton, expiration, pour que la page /payer retrouve
  //    le lien et que l'admin voie ce qui est encore en l'air.
  const trace = await adminDb.collection(COLLECTION_LIENS).add({
    paymentId,
    familyId: payData.familyId,
    familyName: payData.familyName,
    recipientEmail,
    amount,
    token,
    paymentUrl,
    message: message || "",
    sentAt: FieldValue.serverTimestamp(),
    sentAtIso: envoyeLe.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sentBy: sentByUid,
    emailStatus: statutEnvoi,
    status: "sent",
  });

  return { ok: true, paymentUrl, linkId: trace.id, expiresAt: expiresAt.toISOString() };
}

// ─── Ouverture d'un lien (page /payer/<jeton>) ────────────────────────────

export type MotifRefus = "introuvable" | "expire" | "annule" | "paye" | "deja_regle" | "erreur";

export type ResultatOuverture =
  | { ok: true; url: string; montant: number; familyName: string }
  | { ok: false; motif: MotifRefus; familyName?: string; montant?: number; detail?: string };

/**
 * La famille vient de cliquer : vérifie le lien, relit la commande, ouvre (ou
 * réutilise) la page de paiement CAWL et rend son adresse.
 */
export async function ouvrirLienPaiement(token: string, origin: string): Promise<ResultatOuverture> {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return { ok: false, motif: "introuvable" };

  const snap = await adminDb.collection(COLLECTION_LIENS).where("token", "==", token).limit(1).get();
  if (snap.empty) return { ok: false, motif: "introuvable" };
  const ref = snap.docs[0].ref;
  const lien = snap.docs[0].data() as any;
  const familyName = String(lien.familyName || "");

  const etat: EtatLien = etatLien({ status: lien.status, sentAt: lien.sentAtIso || null, expiresAt: lien.expiresAt || null });
  if (etat === "annule") return { ok: false, motif: "annule", familyName };
  if (etat === "paye") return { ok: false, motif: "paye", familyName };
  if (etat === "expire") return { ok: false, motif: "expire", familyName };

  const paySnap = await adminDb.collection("payments").doc(String(lien.paymentId || "")).get();
  if (!paySnap.exists) return { ok: false, motif: "introuvable" };
  const payData = paySnap.data() as any;

  const montant = montantOuvertureLien(Number(lien.amount) || 0, payData);
  if (montant <= 0) {
    // Plus rien à régler : la commande a été soldée autrement (comptoir,
    // autre lien). Le lien se ferme de lui-même.
    await ref.update({ status: "paid", paidAt: new Date().toISOString(), paidVia: "commande soldée" }).catch(() => {});
    return { ok: false, motif: "deja_regle", familyName };
  }

  // Page CAWL encore fraîche pour ce lien ? On y renvoie : même session,
  // donc un seul règlement possible même en cliquant deux fois.
  if (checkoutReutilisable(lien.checkout, montant)) {
    return { ok: true, url: String(lien.checkout.url), montant, familyName };
  }

  const authHeader = serviceAuthHeader();
  if (!authHeader) {
    console.error("ouvrirLienPaiement: CRON_SECRET absent — impossible d'ouvrir le checkout");
    return { ok: false, motif: "erreur", familyName, detail: "configuration" };
  }

  // Si ce lien correspond à l'ACOMPTE de la commande (montant ≈ acompteAmount,
  // rien encore payé), on le déclare comme acompte au checkout : CAWL
  // TOKENISE alors la carte (Card-On-File), indispensable au prélèvement
  // automatique du solde à J-7 (MIT/delayedCharge). Le montant reste `montant`.
  const acompteAttendu = typeof payData.acompteAmount === "number" ? payData.acompteAmount : 0;
  const estLienAcompte =
    acompteAttendu > 0 &&
    (payData.paidAmount || 0) < 0.01 &&
    Math.abs(montant - acompteAttendu) < 0.02 &&
    (payData.totalTTC || 0) > montant;
  const depositPercentLien = estLienAcompte
    ? Math.min(99, Math.max(1, Math.round((montant / (payData.totalTTC || montant)) * 100)))
    : 0;

  let cawlBody: any = null;
  try {
    const cawlRes = await fetch(`${origin}/api/cawl/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify({
        items: (payData.items || []).map((i: any) => ({
          name: i.activityTitle || i.description || "Prestation",
          priceTTC: 0, // on utilise totalTTC direct
        })),
        totalTTC: montant,
        ...(depositPercentLien > 0 ? { depositPercent: depositPercentLien } : {}),
        familyId: lien.familyId || payData.familyId,
        familyEmail: lien.recipientEmail || payData.familyEmail || "",
        familyName: familyName || payData.familyName,
        paymentId: paySnap.id,
      }),
    });
    cawlBody = await cawlRes.json().catch(() => ({}));
    if (!cawlRes.ok || !cawlBody?.url) {
      console.error("ouvrirLienPaiement: checkout CAWL refusé:", cawlRes.status, cawlBody);
      return { ok: false, motif: "erreur", familyName, detail: cawlBody?.error || `HTTP ${cawlRes.status}` };
    }
  } catch (e: any) {
    console.error("ouvrirLienPaiement: checkout CAWL injoignable:", e);
    return { ok: false, motif: "erreur", familyName, detail: e?.message || "réseau" };
  }

  const hostedCheckoutId = String(cawlBody.hostedCheckoutId || "");
  const quand = new Date().toISOString();
  await ref.update({
    checkout: { hostedCheckoutId, merchantRef: cawlBody.merchantRef || "", url: cawlBody.url, createdAt: quand, amount: montant },
    hostedCheckoutId,
    merchantRef: cawlBody.merchantRef || "",
    openedAt: FieldValue.arrayUnion(quand),
  }).catch((e) => console.warn("ouvrirLienPaiement: trace non mise à jour:", e));

  // La session connaît sa trace : le webhook marque le lien « réglé », et un
  // lien annulé entre-temps est reconnu (lib/cawl-inattendu).
  if (hostedCheckoutId) {
    await adminDb.collection("cawl_sessions").doc(hostedCheckoutId)
      .set({ lienId: ref.id }, { merge: true })
      .catch((e) => console.warn("ouvrirLienPaiement: lienId non posé sur cawl_sessions:", e));
  }

  return { ok: true, url: String(cawlBody.url), montant, familyName };
}

// ─── Administration ──────────────────────────────────────────────────────

/** Un lien vu depuis l'administration. */
export interface LienEnvoye {
  id: string;
  paymentId: string;
  recipientEmail: string;
  amount: number;
  sentAt: string;
  expiresAt: string;
  status: string;
  hostedCheckoutId?: string;
  sentBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  paidAt?: string;
  /** Nombre d'ouvertures par la famille. */
  ouvertures?: number;
}

const isoDepuis = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return "";
};

/** Liens envoyés pour une commande, le plus récent d'abord. */
export async function listerLiensCommande(paymentId: string): Promise<LienEnvoye[]> {
  const snap = await adminDb.collection(COLLECTION_LIENS).where("paymentId", "==", paymentId).get();
  return snap.docs
    .map((d) => {
      const x = d.data() as any;
      const sentAt = x.sentAtIso || isoDepuis(x.sentAt);
      return {
        id: d.id,
        paymentId: x.paymentId || "",
        recipientEmail: x.recipientEmail || "",
        amount: Number(x.amount) || 0,
        sentAt,
        // Les traces antérieures à ce module n'ont pas d'expiration : on la
        // déduit de l'envoi.
        expiresAt: x.expiresAt || (sentAt ? expirationLien(new Date(sentAt)).toISOString() : ""),
        status: x.status || "sent",
        hostedCheckoutId: x.hostedCheckoutId || "",
        sentBy: x.sentBy || "",
        cancelledAt: x.cancelledAt || "",
        cancelledBy: x.cancelledBy || "",
        paidAt: x.paidAt || "",
        ouvertures: Array.isArray(x.openedAt) ? x.openedAt.length : 0,
      };
    })
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""));
}

/**
 * Annule un lien envoyé : il n'ouvre plus rien. Si une page CAWL avait déjà
 * été ouverte au clic (2 h de vie), un règlement qui y aboutirait quand même
 * est signalé au club (lib/cawl-inattendu).
 */
export async function annulerLienPaiement(
  linkId: string,
  par: string,
): Promise<{ ok: true; lien: LienEnvoye } | { ok: false; error: string; status: number }> {
  const ref = adminDb.collection(COLLECTION_LIENS).doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Lien introuvable", status: 404 };
  const x = snap.data() as any;
  if (x.status === "paid") return { ok: false, error: "Ce lien a déjà été réglé : il ne peut plus être annulé", status: 409 };
  if (x.status === "cancelled") {
    const [lien] = (await listerLiensCommande(x.paymentId)).filter((l) => l.id === linkId);
    return { ok: true, lien };
  }
  const quand = new Date().toISOString();
  await ref.update({ status: "cancelled", cancelledAt: quand, cancelledBy: par });
  const hostedCheckoutId = x.checkout?.hostedCheckoutId || x.hostedCheckoutId || "";
  if (hostedCheckoutId) {
    await adminDb.collection("cawl_sessions").doc(hostedCheckoutId)
      .set({ annule: true, annuleA: quand, annulePar: par, lienId: linkId }, { merge: true })
      .catch((e) => console.warn("lien-paiement: annulation non posée sur cawl_sessions:", e));
  }
  const [lien] = (await listerLiensCommande(x.paymentId)).filter((l) => l.id === linkId);
  return { ok: true, lien };
}
