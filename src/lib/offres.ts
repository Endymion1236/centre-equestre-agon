// Clé stable d'une offre = ses créneaux triés (une semaine de stage
// donnée par ex.). Sert au journal offres_envois pour ne pas recibler
// deux fois la même famille sur la même offre.
export function offerKeyFrom(creneauIds: string[]): string {
  return [...creneauIds].sort().join("_").slice(0, 900);
}
