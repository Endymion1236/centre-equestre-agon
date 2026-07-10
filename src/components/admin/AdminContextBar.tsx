"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LayoutGrid } from "lucide-react";

type Shortcut = {
  href: string;
  label: string;
};

type Workspace = {
  label: string;
  description: string;
  sections: string[];
  shortcuts: Shortcut[];
};

const WORKSPACES: Workspace[] = [
  {
    label: "Terrain",
    description: "Planning, séances, cavalerie et pédagogie",
    sections: [
      "planning",
      "montoir",
      "cavalerie",
      "pedagogie",
      "management",
      "registre-chutes",
      "recurrences",
      "competitions",
      "organisation-concours",
      "livret-pedagogique",
    ],
    shortcuts: [
      { href: "/admin/planning", label: "Planning" },
      { href: "/admin/montoir", label: "Montoir" },
      { href: "/admin/cavalerie", label: "Cavalerie" },
      { href: "/admin/pedagogie", label: "Pédagogie" },
    ],
  },
  {
    label: "Clients & ventes",
    description: "Familles, inscriptions, commandes et règlements",
    sections: [
      "cavaliers",
      "paiements",
      "devis",
      "forfaits",
      "cartes",
      "avoirs",
      "bons-cadeaux",
      "bons-recup",
      "sepa",
      "doublons",
    ],
    shortcuts: [
      { href: "/admin/cavaliers", label: "Cavaliers" },
      { href: "/admin/paiements", label: "Paiements" },
      { href: "/admin/forfaits", label: "Forfaits" },
      { href: "/admin/avoirs", label: "Avoirs" },
      { href: "/admin/sepa", label: "SEPA" },
    ],
  },
  {
    label: "Gestion",
    description: "Comptabilité, indicateurs et suivi de la saison",
    sections: ["comptabilite", "statistiques", "reinscriptions", "satisfaction"],
    shortcuts: [
      { href: "/admin/comptabilite", label: "Comptabilité" },
      { href: "/admin/statistiques", label: "Statistiques" },
      { href: "/admin/reinscriptions", label: "Réinscriptions" },
      { href: "/admin/satisfaction", label: "Satisfaction" },
    ],
  },
  {
    label: "Communication",
    description: "Emails, WhatsApp et modèles de messages",
    sections: ["communication", "whatsapp", "email-templates", "email-reprise", "emails-log"],
    shortcuts: [
      { href: "/admin/communication", label: "Campagnes" },
      { href: "/admin/whatsapp", label: "WhatsApp" },
      { href: "/admin/email-templates", label: "Modèles" },
      { href: "/admin/emails-log", label: "Journal" },
    ],
  },
  {
    label: "Configuration",
    description: "Catalogue, contenu, documents et réglages",
    sections: ["activites", "documents", "modeles", "contenu", "galerie", "parametres", "manuel", "tests"],
    shortcuts: [
      { href: "/admin/activites", label: "Activités" },
      { href: "/admin/documents", label: "Documents" },
      { href: "/admin/galerie", label: "Galerie" },
      { href: "/admin/parametres", label: "Paramètres" },
    ],
  },
];

const PAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  montoir: "Montoir",
  cavalerie: "Cavalerie",
  pedagogie: "Suivi pédagogique",
  management: "Équipe & planning",
  "registre-chutes": "Registre des chutes",
  recurrences: "Récurrences",
  competitions: "Compétitions",
  "organisation-concours": "Organisation concours",
  "livret-pedagogique": "Livret pédagogique",
  cavaliers: "Familles & cavaliers",
  paiements: "Paiements",
  devis: "Devis",
  forfaits: "Forfaits",
  cartes: "Cartes de séances",
  avoirs: "Avoirs",
  "bons-cadeaux": "Bons cadeaux",
  "bons-recup": "Rattrapages",
  sepa: "Prélèvements SEPA",
  doublons: "Doublons",
  comptabilite: "Comptabilité",
  statistiques: "Statistiques",
  reinscriptions: "Réinscriptions",
  satisfaction: "Satisfaction",
  communication: "Campagnes",
  whatsapp: "WhatsApp",
  "email-templates": "Modèles d’email",
  "email-reprise": "Email de reprise",
  "emails-log": "Journal des emails",
  activites: "Activités",
  documents: "Documents",
  modeles: "Modèles",
  contenu: "Contenu du site",
  galerie: "Galerie photos",
  parametres: "Paramètres",
  manuel: "Manuel",
  tests: "Plan de tests",
};

function normalizePath(pathname: string) {
  return pathname.split("?")[0].replace(/\/$/, "") || "/";
}

export default function AdminContextBar() {
  const pathname = usePathname();
  const normalizedPath = normalizePath(pathname);
  const section = pathname.split("/").filter(Boolean)[1] || "dashboard";

  if (section === "dashboard") return null;

  const workspace = WORKSPACES.find((item) => item.sections.includes(section));
  if (!workspace) return null;

  const relatedShortcuts = workspace.shortcuts.filter(
    (shortcut) => normalizePath(shortcut.href) !== normalizedPath
  );

  return (
    <div className="mb-5 rounded-2xl border border-blue-100/80 bg-white/85 px-3 py-2.5 shadow-[0_5px_24px_rgba(12,26,46,0.035)] backdrop-blur-sm">
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
        <Link
          href="/admin/dashboard"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 no-underline transition-colors hover:bg-blue-100"
          aria-label="Retour au pilotage"
          title="Retour au pilotage"
        >
          <LayoutGrid size={16} />
        </Link>

        <div className="h-6 w-px flex-shrink-0 bg-gray-200" />

        <div className="flex min-w-max items-center gap-2 pr-1">
          <span className="rounded-full bg-gold-50 px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.13em] text-gold-700">
            {workspace.label}
          </span>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="font-body text-xs font-bold text-blue-900">
            {PAGE_LABELS[section] || section}
          </span>
          <span className="hidden xl:inline font-body text-xs text-gray-400">
            {workspace.description}
          </span>
        </div>

        <div className="ml-auto flex min-w-max items-center gap-1.5 pl-3">
          {relatedShortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 font-body text-[11px] font-semibold text-gray-600 no-underline transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {shortcut.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
