/**
 * src/app/espace-cavalier/reserver/types.ts
 *
 * Formes de données manipulées par l'écran de réservation des familles.
 *
 * Ces deux types étaient déclarés en tête de `page.tsx`. Ils en sont sortis
 * parce que le panier et les créneaux circulent maintenant entre l'orchestrateur
 * (page.tsx), les cartes d'affichage et les modules de paiement : une seule
 * définition partagée évite qu'un `any` s'installe à la frontière entre deux
 * fichiers, là où se jouent le prix payé et l'identité du cavalier inscrit.
 *
 * `CartItem` porte volontairement le prix DÉJÀ calculé (prixBase, remiseEuros,
 * rang, prixFinal) : le tarif est figé au moment de l'ajout au panier, il n'est
 * jamais recalculé à l'affichage ni au paiement.
 */

export interface Creneau { id: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; enrolledCount: number; priceHT: number; priceTTC?: number; tvaTaux: number; }

export interface CartItem { creneauIds: string[]; activityTitle: string; dates: string; childId: string; childName: string; prixBase: number; remiseEuros: number; rang: number; prixFinal: number; isStage: boolean; }
