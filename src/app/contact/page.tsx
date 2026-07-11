import type { Metadata } from "next";
import { ContactPageContent } from "./content";

export const metadata: Metadata = {
  title: "Contact et itinéraire",
  description: "Contactez le Centre Équestre d’Agon-Coutainville : adresse, téléphone, horaires, itinéraire et formulaire de renseignement.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactPageContent />;
}
