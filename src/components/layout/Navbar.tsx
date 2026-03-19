"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui";
import { SITE_CONFIG } from "@/lib/config";

const navLinks = [
  { href: "/activites", label: "Activités" },
  { href: "/mini-ferme", label: "Mini-ferme" },
  { href: "/galerie", label: "Galerie" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`
        fixed top-0 left-0 right-0 z-50 transition-all duration-400
        ${scrolled
          ? "bg-cream/95 backdrop-blur-xl border-b border-blue-500/8 py-2"
          : "bg-blue-800/30 backdrop-blur-md border-b border-white/6 py-3"
        }
      `}
    >
      <div className="max-w-[1180px] mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div
            className={`
              w-11 h-11 rounded-xl flex items-center justify-center
              font-display text-sm font-bold text-white transition-all duration-400
              ${scrolled
                ? "bg-gradient-to-br from-blue-500 to-blue-600"
                : "bg-white/10 border border-white/12"
              }
            `}
          >
            CE
          </div>
          <div>
            <div
              className={`font-display font-bold text-[15px] leading-tight transition-colors duration-400 ${
                scrolled ? "text-blue-800" : "text-white"
              }`}
            >
              Centre Equestre
            </div>
            <div
              className={`font-body text-[11px] uppercase tracking-widest font-medium transition-colors duration-400 ${
                scrolled ? "text-gray-400" : "text-white/70"
              }`}
            >
              Agon-Coutainville
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`
                font-body text-sm font-medium no-underline transition-colors duration-300
                ${scrolled ? "text-gray-500 hover:text-blue-500" : "text-white/80 hover:text-white"}
              `}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/espace-cavalier">
            <Button variant="primary" size="sm">
              Réserver
            </Button>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className={`md:hidden p-2 transition-colors ${
            scrolled ? "text-blue-800" : "text-white"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white shadow-2xl p-6 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-body text-base font-medium text-blue-800 no-underline py-3 border-b border-gray-100"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/espace-cavalier" onClick={() => setMobileOpen(false)}>
            <Button variant="primary" full className="mt-4">
              Réserver en ligne
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
