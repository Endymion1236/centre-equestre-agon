import Link from "next/link";
import { SITE_CONFIG } from "@/lib/config";

export function Footer() {
  return (
    <footer className="bg-blue-800 pt-14 pb-8 px-6">
      <div className="max-w-[1180px] mx-auto flex flex-wrap gap-12">
        {/* Brand */}
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-3 mb-2">
            <img src="/images/logo-ce-agon.png" alt="Logo CE Agon" className="w-10 h-10 rounded-lg object-contain" />
            <div className="font-display text-lg font-bold text-white">
              Centre Equestre
            </div>
          </div>
          <p className="font-body text-sm text-white/40 leading-relaxed mb-5">
            Poney Club d&apos;Agon-Coutainville
            <br />
            Depuis {SITE_CONFIG.since} — à {SITE_CONFIG.distanceToBeach} de la mer
          </p>
          <div className="flex gap-3">
            {["Facebook", "Instagram"].map((social) => (
              <a
                key={social}
                href="#"
                className="font-body text-xs font-medium text-white/40 px-4 py-1.5 rounded-lg border border-white/8 hover:border-white/25 hover:text-white/80 transition-all no-underline"
              >
                {social}
              </a>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="flex-1 min-w-[180px]">
          <div className="font-body text-[11px] font-bold text-white/30 uppercase tracking-wider mb-4">
            Contact
          </div>
          <div className="font-body text-sm text-white/45 leading-loose">
            <p>{SITE_CONFIG.address.street}</p>
            <p>
              {SITE_CONFIG.address.zip} {SITE_CONFIG.address.city}
            </p>
            <p className="mt-2">{SITE_CONFIG.contact.phone}</p>
            <p>{SITE_CONFIG.contact.email}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 min-w-[160px]">
          <div className="font-body text-[11px] font-bold text-white/30 uppercase tracking-wider mb-4">
            Navigation
          </div>
          <div className="flex flex-col gap-2.5">
            {[
              { href: "/activites", label: "Activités" },
              { href: "/mini-ferme", label: "Mini-ferme" },
              { href: "/galerie", label: "Galerie" },
              { href: "/tarifs", label: "Tarifs" },
              { href: "/contact", label: "Contact" },
              { href: "/espace-cavalier", label: "Espace cavalier" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-body text-sm text-white/40 hover:text-white/85 no-underline transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="max-w-[1180px] mx-auto mt-10 pt-5 border-t border-white/5 flex justify-between flex-wrap gap-3">
        <span className="font-body text-xs text-white/25">
          © {new Date().getFullYear()} {SITE_CONFIG.name}
        </span>
        <div className="flex gap-4">
          {["Mentions légales", "CGV", "Confidentialité"].map((link) => (
            <a
              key={link}
              href="#"
              className="font-body text-xs text-white/25 no-underline"
            >
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
