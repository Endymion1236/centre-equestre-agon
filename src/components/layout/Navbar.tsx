"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Gift, Menu, Pencil, UserRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const primaryLinks = [
  { href: "/activites", label: "Activités" },
  { href: "/planning", label: "Planning" },
  { href: "/tarifs", label: "Tarifs" },
];

const clubLinks = [
  { href: "/equipe", label: "Équipe & poneys", description: "Les humains et la cavalerie" },
  { href: "/mini-ferme", label: "Mini-ferme", description: "Les animaux du centre" },
  { href: "/galerie", label: "Galerie", description: "La vie du club en images" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { isAdmin, signInWithGoogle, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 36);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const light = scrolled || mobileOpen;
  const linkClass = (active = false) => `relative rounded-lg px-1 py-2 font-body text-sm font-semibold no-underline transition-colors ${
    light
      ? active ? "text-blue-700" : "text-slate-600 hover:text-blue-700"
      : active ? "text-white" : "text-white/78 hover:text-white"
  }`;

  return (
    <nav className={`fixed inset-x-0 top-0 z-[200] transition-all duration-300 ${
      light
        ? "border-b border-blue-500/[0.07] bg-cream/95 py-2 shadow-[0_8px_30px_rgba(12,26,46,0.05)] backdrop-blur-xl"
        : "border-b border-white/[0.06] bg-blue-950/20 py-3 backdrop-blur-md"
    }`}>
      <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-5 px-5 sm:px-6">
        <Link href="/accueil" className="flex min-w-0 items-center gap-3 no-underline">
          <img src="/images/logo-ce-agon.png" alt="Centre Équestre d’Agon-Coutainville" className="h-11 w-11 flex-shrink-0 rounded-xl object-contain" />
          <div className="min-w-0">
            <div className={`truncate font-display text-[15px] font-bold leading-tight transition-colors ${light ? "text-blue-950" : "text-white"}`}>
              Centre Équestre
            </div>
            <div className={`truncate font-body text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${light ? "text-slate-400" : "text-white/58"}`}>
              Agon-Coutainville
            </div>
          </div>
        </Link>

        <div className="hidden items-center gap-5 lg:flex">
          {primaryLinks.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(isActive(pathname, link.href))}>
              {link.label}
              {isActive(pathname, link.href) && <span className="absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-gold-400" />}
            </Link>
          ))}

          <div className="group relative">
            <button type="button" className={`${linkClass(clubLinks.some((link) => isActive(pathname, link.href)))} flex items-center gap-1 border-none bg-transparent cursor-pointer`}>
              Le club <ChevronDown size={14} className="transition-transform group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-1/2 top-full w-[290px] -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_22px_55px_rgba(12,26,46,0.16)]">
                {clubLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="block rounded-xl px-4 py-3 no-underline transition-colors hover:bg-blue-50">
                    <div className="font-body text-sm font-bold text-blue-950">{link.label}</div>
                    <div className="mt-0.5 font-body text-xs text-slate-400">{link.description}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link href="/contact" className={linkClass(isActive(pathname, "/contact"))}>Contact</Link>

          <Link href="/offrir-un-bon" className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 font-body text-xs font-bold no-underline transition-all hover:-translate-y-0.5 ${
            light ? "border-gold-200 bg-gold-50 text-gold-700" : "border-white/15 bg-white/8 text-white"
          }`}>
            <Gift size={14} /> Offrir
          </Link>

          <Link href="/espace-cavalier/reserver" className="rounded-xl bg-gold-400 px-4 py-2.5 font-body text-sm font-bold text-blue-950 no-underline shadow-[0_8px_22px_rgba(240,160,16,0.22)] transition-all hover:-translate-y-0.5 hover:bg-gold-300">
            Réserver
          </Link>

          {isAdmin ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-gold-300/35 bg-gold-400/12 px-2.5 py-1.5">
                <Pencil size={11} className="text-gold-500" />
                <span className="font-body text-[10px] font-bold text-gold-600">Édition</span>
              </div>
              <button onClick={signOut} className="border-none bg-transparent font-body text-[10px] text-slate-400 cursor-pointer hover:text-red-500">Quitter</button>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className={`border-none bg-transparent p-1 cursor-pointer transition-colors ${light ? "text-slate-300 hover:text-slate-500" : "text-white/18 hover:text-white/45"}`} title="Connexion admin" aria-label="Connexion admin">
              <UserRound size={15} />
            </button>
          )}
        </div>

        <button type="button" className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors lg:hidden ${
          light ? "border-blue-100 bg-white text-blue-950" : "border-white/12 bg-white/8 text-white"
        }`} onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full max-h-[calc(100svh-68px)] overflow-y-auto border-t border-slate-100 bg-white px-5 pb-6 pt-4 shadow-[0_25px_55px_rgba(12,26,46,0.18)] lg:hidden">
          <div className="mx-auto max-w-xl">
            <div className="grid grid-cols-2 gap-2">
              {primaryLinks.map((link) => (
                <Link key={link.href} href={link.href} className={`rounded-xl px-4 py-3 font-body text-sm font-bold no-underline ${isActive(pathname, link.href) ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-blue-950"}`}>
                  {link.label}
                </Link>
              ))}
              <Link href="/contact" className={`rounded-xl px-4 py-3 font-body text-sm font-bold no-underline ${isActive(pathname, "/contact") ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-blue-950"}`}>Contact</Link>
            </div>

            <div className="my-5 border-t border-slate-100 pt-5">
              <div className="mb-2 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Découvrir le club</div>
              {clubLinks.map((link) => (
                <Link key={link.href} href={link.href} className="flex items-center justify-between border-b border-slate-100 py-3 font-body text-sm font-semibold text-blue-950 no-underline last:border-b-0">
                  {link.label}<span className="text-slate-300">→</span>
                </Link>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/offrir-un-bon" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-5 py-3.5 font-body text-sm font-bold text-gold-700 no-underline"><Gift size={16} /> Offrir un bon</Link>
              <Link href="/espace-cavalier/reserver" className="rounded-xl bg-blue-700 px-5 py-3.5 text-center font-body text-sm font-bold text-white no-underline shadow-lg">Réserver en ligne</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
