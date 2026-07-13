import Link from "next/link";
import { SITE_CONFIG } from "@/lib/config";
import { ArrowUpRight, Facebook, Gift, MapPin, Phone } from "lucide-react";

const discoverLinks = [
  { href: "/activites", label: "Toutes les activités" },
  { href: "/planning", label: "Planning public" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/offrir-un-bon", label: "Bon cadeau" },
];

const clubLinks = [
  { href: "/installations", label: "Installations & bien-être" },
  { href: "/equipe", label: "Équipe & poneys" },
  { href: "/mini-ferme", label: "Mini-ferme" },
  { href: "/galerie", label: "Galerie" },
  { href: "/contact", label: "Contact" },
];

export function Footer() {
  const phoneHref = `tel:${SITE_CONFIG.contact.phone.replace(/\s/g, "")}`;

  return (
    <footer className="relative overflow-hidden bg-[#07111f] px-6 pb-8 pt-16 text-white">
      <div className="pointer-events-none absolute -right-48 -top-48 h-[420px] w-[420px] rounded-full border border-white/[0.04] bg-blue-500/[0.05]" />
      <div className="relative mx-auto max-w-[1180px]">
        <div className="grid gap-10 border-b border-white/[0.07] pb-12 md:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1fr]">
          <div>
            <Link href="/accueil" className="flex items-center gap-3 no-underline">
              <img src="/images/logo-ce-agon.png" alt="Centre Équestre d’Agon-Coutainville" className="h-12 w-12 rounded-xl object-contain" />
              <div>
                <div className="font-display text-lg font-bold text-white">Centre Équestre</div>
                <div className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Agon-Coutainville</div>
              </div>
            </Link>
            <p className="mt-5 max-w-sm font-body text-sm leading-relaxed text-white/46">
              Stages dès 3 ans, cours toute l&apos;année, balades sur la plage et mini-ferme pédagogique. Une histoire familiale depuis {SITE_CONFIG.since}.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <a href="https://www.facebook.com/ceagon50230" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 font-body text-xs font-bold text-white/70 no-underline transition-colors hover:border-white/20 hover:text-white">
                <Facebook size={15} /> Facebook
              </a>
              <a href="https://laserbay.net" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-2.5 font-body text-xs font-bold text-emerald-300 no-underline transition-colors hover:bg-emerald-400/10">
                LaserBay <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          <div>
            <div className="mb-4 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Découvrir</div>
            <div className="flex flex-col gap-3">
              {discoverLinks.map((link) => (
                <Link key={link.href} href={link.href} className="font-body text-sm text-white/50 no-underline transition-colors hover:text-white">{link.label}</Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Le club</div>
            <div className="flex flex-col gap-3">
              {clubLinks.map((link) => (
                <Link key={link.href} href={link.href} className="font-body text-sm text-white/50 no-underline transition-colors hover:text-white">{link.label}</Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Nous trouver</div>
            <div className="space-y-4">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SITE_CONFIG.address.street} ${SITE_CONFIG.address.zip} ${SITE_CONFIG.address.city}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 font-body text-sm leading-relaxed text-white/50 no-underline transition-colors hover:text-white">
                <MapPin size={17} className="mt-0.5 flex-shrink-0 text-gold-300" />
                <span>{SITE_CONFIG.address.street}<br />{SITE_CONFIG.address.zip} {SITE_CONFIG.address.city}</span>
              </a>
              <a href={phoneHref} className="flex items-center gap-3 font-body text-sm text-white/50 no-underline transition-colors hover:text-white">
                <Phone size={17} className="flex-shrink-0 text-gold-300" />{SITE_CONFIG.contact.phone}
              </a>
              <a href={`mailto:${SITE_CONFIG.contact.email}`} className="block break-all font-body text-sm text-white/50 no-underline transition-colors hover:text-white">{SITE_CONFIG.contact.email}</a>
            </div>
            <Link href="/espace-cavalier/reserver" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gold-400 px-4 py-3 font-body text-xs font-bold text-blue-950 no-underline transition-transform hover:-translate-y-0.5">
              <Gift size={15} /> Réserver une activité
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-body text-xs text-white/25">© {new Date().getFullYear()} {SITE_CONFIG.name}</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { label: "Mentions légales", href: "/mentions-legales" },
              { label: "CGV", href: "/cgv" },
              { label: "Confidentialité", href: "/confidentialite" },
              { label: "Espace famille", href: "/espace-cavalier" },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="font-body text-xs text-white/25 no-underline transition-colors hover:text-white/55">{link.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
