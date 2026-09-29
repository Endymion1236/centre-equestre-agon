/**
 * src/lib/veille-club-serveur.ts — lecture des données de la veille (Admin SDK).
 *
 * Partagé par le cron du matin (/api/cron/veille-club) et l'écran
 * /admin/veille : les deux montrent exactement la même liste.
 */
import { adminDb } from "@/lib/firebase-admin";
import { analyserVeille, decalerJours, type PointVeille } from "@/lib/veille-club";

export function aujourdhuiParis(maintenant = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
}

export async function calculerVeille(maintenant = new Date()): Promise<{ aujourdhui: string; points: PointVeille[] }> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const lire = (snap: FirebaseFirestore.QuerySnapshot | null) => (snap ? snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : []);
  // Une collection illisible (absente, index manquant) ne doit pas priver
  // Nicolas des autres points : elle compte pour vide.
  const sur = (p: Promise<FirebaseFirestore.QuerySnapshot>) => p.catch((e) => { console.warn("[veille]", e?.message || e); return null; });
  const [pay, sepa, enc, cr, resa, cartes, forfaits, fam, chq, wait, msg, avis, clot] = await Promise.all([
    sur(adminDb.collection("payments").get()),
    sur(adminDb.collection("echeances-sepa").get()),
    sur(adminDb.collection("encaissements").get()),
    // Deux mois de chaque côté : assez pour reconnaître un cours récurrent.
    sur(adminDb.collection("creneaux").where("date", ">=", decalerJours(aujourdhui, -60)).where("date", "<=", decalerJours(aujourdhui, 60)).get()),
    sur(adminDb.collection("reservations").get()),
    sur(adminDb.collection("cartes").get()),
    sur(adminDb.collection("forfaits").get()),
    sur(adminDb.collection("families").select("parentName", "parentEmail", "status", "mergedInto").get()),
    sur(adminDb.collection("cheques-differes").get()),
    sur(adminDb.collection("waitlist").get()),
    sur(adminDb.collection("messages-contact").orderBy("createdAt", "desc").limit(200).get()),
    sur(adminDb.collection("avis-satisfaction").get()),
    sur(adminDb.collection("cloturesJournalieres").get()),
  ]);
  const points = analyserVeille({
    aujourdhui, maintenant,
    paiements: lire(pay), echeancesSepa: lire(sepa), encaissements: lire(enc), creneaux: lire(cr),
    reservations: lire(resa), cartes: lire(cartes), forfaits: lire(forfaits), familles: lire(fam),
    chequesDifferes: lire(chq), listeAttente: lire(wait), messagesContact: lire(msg), avis: lire(avis),
    cloturesJournalieres: lire(clot),
  });
  return { aujourdhui, points };
}
