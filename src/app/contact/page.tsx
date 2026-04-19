import { Metadata } from "next";
import { ContactPageContent } from "./content";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contactez le Centre Équestre d'Agon-Coutainville. Adresse, téléphone, horaires d'ouverture et formulaire de contact.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
