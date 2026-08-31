/**
 * Page affichée quand un lien de paiement ne peut pas aboutir.
 *
 * Un lien mort qui renvoie une erreur technique, ou pire une page blanche,
 * laisse la famille penser qu'elle a mal fait — et le club ne l'apprend que
 * si elle appelle. Chaque motif dit donc ce qui s'est passé et ce qu'il y a à
 * faire, avec le numéro du club sous les yeux.
 */

import Link from "next/link";
import { SITE_CONFIG } from "@/lib/config";

const MESSAGES: Record<string, { titre: string; texte: string; agir: boolean }> = {
  expire: {
    titre: "Ce lien de paiement a expiré",
    texte: "Les liens de paiement ont une durée de validité limitée. Celui-ci est arrivé à son terme — "
      + "rien n'est perdu, votre inscription est toujours enregistrée. Demandez-nous un nouveau lien, "
      + "ou réglez depuis votre espace famille.",
    agir: true,
  },
  "deja-regle": {
    titre: "C'est déjà réglé",
    texte: "Ce paiement a déjà été reçu — en ligne, au centre équestre, ou par un autre moyen. "
      + "Vous n'avez rien à faire, et surtout rien à payer une seconde fois.",
    agir: false,
  },
  introuvable: {
    titre: "Ce lien ne correspond à aucun paiement",
    texte: "Il a peut-être été tronqué en passant d'une messagerie à l'autre. "
      + "Vérifiez que vous avez copié l'adresse complète, ou appelez-nous.",
    agir: true,
  },
  invalide: {
    titre: "Ce lien n'est pas valide",
    texte: "Il a probablement été abîmé en chemin — certaines messageries coupent les adresses longues. "
      + "Essayez depuis le message d'origine, ou appelez-nous.",
    agir: true,
  },
  montant: {
    titre: "Le montant demandé ne correspond pas",
    texte: "Par précaution, le paiement n'a pas été lancé. Ce n'est pas de votre fait : "
      + "appelez-nous, nous régularisons en deux minutes.",
    agir: true,
  },
  indisponible: {
    titre: "Le paiement en ligne est momentanément indisponible",
    texte: "Ce n'est pas votre lien qui est en cause. Réessayez dans un moment, "
      + "ou réglez directement au centre équestre.",
    agir: true,
  },
};

export default async function PaiementImpossible({
  searchParams,
}: { searchParams: Promise<{ motif?: string }> }) {
  const { motif } = await searchParams;
  const m = MESSAGES[motif || ""] || MESSAGES.invalide;

  return (
    <main className="min-h-svh bg-cream flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-[24px] border border-blue-500/[0.08] bg-white p-8 shadow-[0_15px_45px_rgba(12,26,46,0.05)] sm:p-10">
        <div className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600">
          Paiement en ligne
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-blue-950 sm:text-3xl">
          {m.titre}
        </h1>
        <p className="mt-4 font-body text-sm leading-relaxed text-slate-600">{m.texte}</p>

        {m.agir && (
          <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <div className="font-body text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700">
              Nous joindre
            </div>
            <a href={`tel:${SITE_CONFIG.contact.phone.replace(/\s/g, "")}`}
               className="mt-2 block font-display text-xl font-bold text-blue-950 no-underline">
              {SITE_CONFIG.contact.phone}
            </a>
            <a href={`mailto:${SITE_CONFIG.contact.email}`}
               className="mt-1 block font-body text-sm text-blue-700 no-underline">
              {SITE_CONFIG.contact.email}
            </a>
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/espace-cavalier/factures"
                className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 font-body text-xs font-bold text-white no-underline">
            Mon espace famille
          </Link>
          <Link href="/"
                className="inline-flex min-h-11 items-center rounded-xl border border-blue-100 bg-white px-5 font-body text-xs font-bold text-blue-700 no-underline">
            Retour au site
          </Link>
        </div>
      </div>
    </main>
  );
}
