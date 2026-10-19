/**
 * Normalisation des numéros de téléphone + rapprochement famille.
 *
 * Les `parentPhone` sont saisis librement par les familles : "06 35 25 44 29",
 * "+33635254429", "06.35.25.44.29", "0033 6 35 25 44 29"… Toute comparaison
 * directe est vouée à l'échec. On réduit donc chaque numéro à une CLÉ : les
 * 9 derniers chiffres (= le numéro national sans le 0 ni l'indicatif pays).
 *
 * Même logique que `phoneKey` dans /api/admin/doublons — factorisée ici pour
 * éviter deux implémentations qui divergent.
 */

/** 9 derniers chiffres, ou "" si le numéro est inexploitable. */
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

/**
 * Un numéro joignable : 10 chiffres commençant par 0 (France), ou un numéro
 * international (+ / 00, 9 à 15 chiffres). Octobre 2026 : des familles
 * créaient leur compte et réservaient sans téléphone — impossible de les
 * prévenir d'une annulation de dernière minute.
 */
export function telephoneValide(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  const digits = t.replace(/\D/g, "");
  if (/^(\+|00)/.test(t)) return digits.replace(/^00/, "").length >= 9 && digits.length <= 15;
  return /^0[1-9]\d{8}$/.test(digits);
}

/** Affichage lisible : "0635254429" → "06 35 25 44 29". */
export function phoneDisplay(raw: string | null | undefined): string {
  const key = phoneKey(raw);
  if (!key) return (raw || "").trim();
  const national = "0" + key; // 10 chiffres
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export interface PhoneFamilyMatch {
  familyId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  children: { firstName: string; lastName: string; galopLevel: string | null }[];
}

/**
 * Cherche une famille par numéro de téléphone.
 *
 * Firestore ne sait pas requêter sur une valeur normalisée qui n'est pas
 * stockée. On lit donc la collection et on filtre en mémoire. Acceptable ici :
 * ~100 familles, et l'appel n'a lieu qu'au clic sur un message vocal.
 * Si la base grossit beaucoup, la parade sera d'écrire un champ
 * `parentPhoneKey` à chaque écriture de famille et de requêter dessus.
 *
 * Les champs `parentPhone2`, `phone` et `tel` sont aussi testés : selon
 * l'ancienneté de la fiche, le numéro peut se trouver dans l'un ou l'autre.
 */
export async function findFamilyByPhone(
  adminDb: FirebaseFirestore.Firestore,
  rawPhone: string
): Promise<PhoneFamilyMatch | null> {
  const target = phoneKey(rawPhone);
  if (!target) return null;

  const snap = await adminDb.collection("families").get();

  for (const doc of snap.docs) {
    const f = doc.data() as any;
    if (f.status === "merged") continue; // fiche fusionnée → on ignore

    const candidates = [f.parentPhone, f.parentPhone2, f.phone, f.tel];
    const hit = candidates.some((c) => phoneKey(c) === target);
    if (!hit) continue;

    return {
      familyId: doc.id,
      parentName: f.parentName || "",
      parentEmail: f.parentEmail || f.email || "",
      parentPhone: f.parentPhone || f.phone || f.tel || "",
      children: (f.children || []).map((c: any) => ({
        firstName: c?.firstName || "",
        lastName: c?.lastName || "",
        galopLevel: c?.galopLevel && c.galopLevel !== "—" ? c.galopLevel : null,
      })),
    };
  }

  return null;
}
