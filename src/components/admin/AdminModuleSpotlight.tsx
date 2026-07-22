"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  Heart,
  Mail,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type SpotlightIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

type ModuleAction = {
  label: string;
  href: string;
  icon: SpotlightIcon;
};

type ModuleConfig = {
  eyebrow: string;
  title: string;
  description: string;
  gradient: string;
  icon: SpotlightIcon;
  actions: ModuleAction[];
  note: string;
};

const MODULES: Record<string, ModuleConfig> = {
  montoir: {
    eyebrow: "Terrain en direct",
    title: "La journée au montoir",
    description: "Présences, affectation des poneys et clôture des reprises réunies dans un même poste de travail.",
    gradient: "from-[#082f2a] via-[#0f5d50] to-[#17846f]",
    icon: ClipboardCheck,
    note: "Pensé pour être utilisé debout, vite, et souvent sur téléphone.",
    actions: [
      { label: "Planning", href: "/admin/planning", icon: CalendarDays },
      { label: "Cavalerie", href: "/admin/cavalerie", icon: Heart },
      { label: "Registre des chutes", href: "/admin/registre-chutes", icon: ShieldCheck },
    ],
  },
  paiements: {
    eyebrow: "Encaissement",
    title: "Encaisser sans chercher",
    description: "Famille, prestations, impayés et moyen de règlement sont regroupés dans un parcours unique et lisible.",
    gradient: "from-[#07111f] via-[#12346b] to-[#2050a0]",
    icon: CreditCard,
    note: "Les actions financières restent inchangées, seule leur lecture est simplifiée.",
    actions: [
      { label: "Avoirs", href: "/admin/avoirs", icon: FileText },
      { label: "SEPA", href: "/admin/sepa", icon: ShieldCheck },
      { label: "Factures", href: "/admin/factures", icon: Receipt },
    ],
  },
  cavaliers: {
    eyebrow: "Clients & cavaliers",
    title: "Les dossiers utiles avant les dossiers complets",
    description: "Les alertes, les profils à compléter et les informations financières remontent avant les détails secondaires.",
    gradient: "from-[#102a56] via-[#2050a0] to-[#3b72c4]",
    icon: Users,
    note: "Une vue pensée pour retrouver une famille et agir en quelques secondes.",
    actions: [
      { label: "Communication", href: "/admin/communication", icon: Mail },
      { label: "Paiements", href: "/admin/paiements", icon: CreditCard },
      { label: "Planning", href: "/admin/planning", icon: CalendarDays },
    ],
  },
  comptabilite: {
    eyebrow: "Gestion financière",
    title: "Les chiffres, sans brouillard",
    description: "Recettes, dépenses et pièces comptables restent complètes, avec une hiérarchie plus calme pour lire l’essentiel d’abord.",
    gradient: "from-[#17152f] via-[#38316b] to-[#6859a8]",
    icon: Calculator,
    note: "Les tableaux conservent toute leur précision, mais gagnent en respiration.",
    actions: [
      { label: "Paiements", href: "/admin/paiements", icon: CreditCard },
      { label: "Factures", href: "/admin/factures", icon: FileText },
      { label: "Statistiques", href: "/admin/statistiques", icon: BarChart3 },
    ],
  },
  statistiques: {
    eyebrow: "Analyse",
    title: "Lire l’activité avant de lire les tableaux",
    description: "Les indicateurs servent d’abord à comprendre ce qui bouge, puis à explorer les détails si nécessaire.",
    gradient: "from-[#24134d] via-[#54318a] to-[#8a5cc4]",
    icon: BarChart3,
    note: "Une lecture plus éditoriale, moins proche d’un export brut.",
    actions: [
      { label: "Comptabilité", href: "/admin/comptabilite", icon: Calculator },
      { label: "Paiements", href: "/admin/paiements", icon: CreditCard },
      { label: "Cavaliers", href: "/admin/cavaliers", icon: Users },
    ],
  },
  pedagogie: {
    eyebrow: "Suivi pédagogique",
    title: "Faire ressortir le prochain objectif",
    description: "Progression, observations et objectifs sont présentés comme un fil de travail plutôt qu’une accumulation de notes.",
    gradient: "from-[#3a2608] via-[#8c5b0d] to-[#d38a13]",
    icon: Sparkles,
    note: "Le suivi reste détaillé, mais la prochaine action devient plus évidente.",
    actions: [
      { label: "Cavaliers", href: "/admin/cavaliers", icon: Users },
      { label: "Statistiques", href: "/admin/statistiques", icon: BarChart3 },
      { label: "Planning", href: "/admin/planning", icon: CalendarDays },
    ],
  },
};

export default function AdminModuleSpotlight() {
  const pathname = usePathname();
  const section = pathname.split("/").filter(Boolean)[1] || "";
  const config = MODULES[section];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <section data-print-hide className={`relative mb-5 overflow-hidden rounded-[24px] bg-gradient-to-br ${config.gradient} px-5 py-5 text-white shadow-[0_20px_55px_rgba(12,26,46,0.14)] sm:px-6 sm:py-6`}>
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/[0.04]" />
      <div className="pointer-events-none absolute -bottom-20 right-20 h-40 w-40 rounded-full bg-white/[0.05] blur-xl" />

      <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner backdrop-blur-sm">
            <Icon size={23} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">{config.eyebrow}</div>
            <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white sm:text-[28px]">{config.title}</h2>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/75">{config.description}</p>
            <div className="mt-3 flex items-center gap-2 font-body text-[11px] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
              {config.note}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-[330px] lg:justify-end">
          {config.actions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Link
                key={`${section}-${action.label}`}
                href={action.href}
                className="group inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 font-body text-xs font-bold text-white no-underline backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.16]"
              >
                <ActionIcon size={14} className="text-white/75" />
                {action.label}
                <ArrowRight size={13} className="text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white/75" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
