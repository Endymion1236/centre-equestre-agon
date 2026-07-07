import { adminDb } from "@/lib/firebase-admin";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import { Resend } from "resend";

const genCode = () => "BON-" + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();

function emailHtml(code: string, montant: number, beneficiaire: string, message: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#1e3a5f;border-radius:16px;overflow:hidden;color:#fff">
    <div style="padding:28px 24px;text-align:center">
      <div style="font-size:12px;letter-spacing:2px;opacity:.7;text-transform:uppercase">Centre Équestre d'Agon-Coutainville</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">🎁 Votre bon cadeau</div>
      ${beneficiaire ? `<div style="margin-top:12px;opacity:.85">Pour : <strong>${beneficiaire}</strong></div>` : ""}
      <div style="font-size:44px;font-weight:700;color:#F0A010;margin:18px 0">${montant.toFixed(2)}€</div>
      <div style="display:inline-block;background:rgba(255,255,255,.12);padding:10px 22px;border-radius:8px;letter-spacing:2px;font-weight:700;font-size:16px">${code}</div>
      ${message ? `<div style="margin-top:14px;font-style:italic;opacity:.75">« ${message} »</div>` : ""}
    </div>
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:#555;font-size:13px;text-align:center">
    Merci pour votre achat ! Présentez ce code au centre, ou utilisez-le lors d'un paiement.
    Conservez cet email — il fait office de bon cadeau.
  </p></body></html>`;
}

/**
 * Traite un achat de bon cadeau CONFIRMÉ (paiement réussi).
 * Génère le bon, enregistre la vente en recette, envoie le code par email.
 * Idempotent : verrou anti-doublon + flag `bonTraite` sur la session.
 * Appelé aussi bien par le retour navigateur (/api/bon-cadeau/status) que par
 * le webhook CAWL, afin qu'un bon ne soit jamais oublié ni créé deux fois.
 * Retourne le code du bon (nouveau ou déjà existant), ou null si non applicable.
 */
export async function traiterBonCadeauSession(
  hostedCheckoutId: string,
  source: "status" | "webhook",
): Promise<string | null> {
  if (!hostedCheckoutId) return null;
  const sessRef = adminDb.collection("cawl_sessions").doc(hostedCheckoutId);
  const sessSnap = await sessRef.get();
  if (!sessSnap.exists) return null;
  const sess = sessSnap.data() as any;
  if (!sess.bonCadeau) return null;            // pas un achat de bon cadeau
  if (sess.bonTraite) return sess.code || null; // déjà traité

  // Verrou anti-doublon partagé (retour + webhook).
  const lock = await acquireCawlConfirmationLock({
    hostedCheckoutId, stage: "full", source, amountCents: sess.totalCents || 0,
  });
  if (!lock) return sess.code || null;

  const montant = Number(sess.montant) || (sess.totalCents || 0) / 100;
  const code = genCode();

  // 1) Créer le bon (utilisable via le code).
  await adminDb.collection("bons-cadeaux").add({
    code, montant, solde: montant, statut: "actif",
    recipientName: sess.beneficiaire || "",
    message: sess.message || "",
    fromName: sess.acheteurNom || "",
    acheteurEmail: sess.acheteurEmail || "",
    source: "vente-en-ligne",
    merchantRef: sess.merchantRef || "",
    createdAt: new Date(),
  });

  // 2) Enregistrer la vente en recette (encaissement immuable), sans famille.
  await createEncaissementServer({
    familyId: "",
    familyName: `Bon cadeau en ligne — ${sess.acheteurNom || "acheteur"}`,
    montant,
    mode: "cb",
    modeLabel: "CB en ligne (bon cadeau)",
    ref: sess.merchantRef || "",
    activityTitle: "Bon cadeau",
    raison: `Vente bon cadeau ${code}`,
  });

  // 3) Envoyer le code par email à l'acheteur.
  try {
    const apiKey = process.env.RESEND_API_KEY || "";
    const resend = apiKey ? new Resend(apiKey) : null;
    const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "onboarding@resend.dev";
    const BCC = process.env.RESEND_BCC_EMAIL || process.env.RESEND_BCC || "";
    if (resend && sess.acheteurEmail) {
      await resend.emails.send({
        from: FROM, to: sess.acheteurEmail, ...(BCC ? { bcc: BCC } : {}),
        subject: "🎁 Votre bon cadeau — Centre Équestre d'Agon-Coutainville",
        html: emailHtml(code, montant, sess.beneficiaire || "", sess.message || ""),
      });
    }
  } catch (e) { console.error("bon-cadeau email:", e); }

  await sessRef.set({ bonTraite: true, code }, { merge: true });
  return code;
}
