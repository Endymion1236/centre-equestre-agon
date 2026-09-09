import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ouvrirLienPaiement, type MotifRefus } from "@/lib/lien-paiement";

/**
 * /payer/<jeton> — la page derrière chaque lien de paiement envoyé.
 *
 * Elle ne montre rien dans le cas normal : elle vérifie le lien, relit la
 * commande, ouvre la page de paiement CAWL du montant encore dû et y envoie
 * la famille. Elle ne s'affiche que quand il n'y a plus rien à payer — lien
 * annulé, expiré, déjà réglé — et propose alors l'espace client.
 */

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

const MESSAGES: Record<MotifRefus, { titre: string; texte: string }> = {
  introuvable: {
    titre: "Ce lien ne correspond à rien",
    texte: "L'adresse est incomplète ou a été modifiée. Ouvrez le lien depuis l'email reçu, ou réglez depuis votre espace client.",
  },
  expire: {
    titre: "Ce lien de paiement a expiré",
    texte: "Il n'est plus valable, mais votre inscription est toujours là. Vous pouvez régler depuis votre espace client, ou nous demander un nouveau lien.",
  },
  annule: {
    titre: "Ce lien de paiement a été annulé",
    texte: "Le club l'a remplacé — vous avez sans doute reçu un autre lien, ou le règlement a été réglé autrement. En cas de doute, contactez-nous ou passez par votre espace client.",
  },
  paye: {
    titre: "Ce lien a déjà été réglé",
    texte: "Merci ! Le paiement a bien été reçu, il n'y a rien de plus à faire.",
  },
  deja_regle: {
    titre: "Il n'y a plus rien à régler",
    texte: "Cette commande est déjà soldée — au comptoir, ou par un autre lien. Merci !",
  },
  erreur: {
    titre: "La page de paiement n'a pas pu s'ouvrir",
    texte: "Ce n'est pas de votre fait. Réessayez dans quelques minutes, ou réglez depuis votre espace client.",
  },
};

export default async function PayerPage({ params }: Props) {
  const { token } = await params;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "");

  const r = await ouvrirLienPaiement(token, origin);
  if (r.ok) redirect(r.url);

  const m = MESSAGES[r.motif] || MESSAGES.erreur;
  const positif = r.motif === "paye" || r.motif === "deja_regle";

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <div className="text-4xl mb-3">{positif ? "✅" : "🔗"}</div>
        <h1 className="font-display text-xl font-bold text-blue-800 mb-2">{m.titre}</h1>
        {r.familyName && <p className="font-body text-xs text-slate-400 mb-3">Famille {r.familyName}</p>}
        <p className="font-body text-sm text-slate-600 leading-relaxed">{m.texte}</p>
        {r.motif === "erreur" && r.detail && (
          <p className="font-body text-[11px] text-slate-400 mt-2">Détail : {r.detail}</p>
        )}
        {!positif && (
          <Link href="/espace-cavalier/factures"
            className="inline-block mt-6 font-body text-sm font-semibold text-white bg-blue-600 px-5 py-2.5 rounded-lg no-underline hover:bg-blue-500">
            Régler depuis mon espace client
          </Link>
        )}
        <p className="font-body text-xs text-slate-400 mt-6">Centre Équestre d&apos;Agon-Coutainville</p>
      </div>
    </main>
  );
}
