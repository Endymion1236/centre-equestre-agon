// ═══ Icônes métier — Centre Équestre Agon ═══
// Remplace tous les emojis par des icônes Lucide cohérentes et élégantes.
// Usage : <EquiIcon name="horse" size={20} className="text-blue-500" />

import {
  // Animaux & cavalerie
  Heart,
  Footprints,
  // Activités
  Trophy,
  Flag,
  Compass,
  Sunrise,
  Star,
  PartyPopper,
  Bike,
  // Planning & reprises
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  Clock,
  Timer,
  // Cavaliers & familles
  Users,
  UserPlus,
  UserCheck,
  GraduationCap,
  Baby,
  // Facturation & paiements
  CreditCard,
  Receipt,
  Wallet,
  BadgeEuro,
  Banknote,
  FileText,
  // Comptabilité
  BookOpen,
  Calculator,
  TrendingUp,
  BarChart3,
  PieChart,
  // Communication
  Mail,
  Send,
  MessageSquare,
  Bell,
  // Soins & santé
  Stethoscope,
  Syringe,
  Pill,
  Scissors,
  HandMetal,
  Bone,
  ShieldCheck,
  // Documents
  FileCheck,
  FilePlus,
  FolderOpen,
  Upload,
  Download,
  Printer,
  // Gestion
  Settings,
  Wrench,
  ClipboardList,
  ClipboardCheck,
  LayoutTemplate,
  // Navigation & UI
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Info,
  HelpCircle,
  ExternalLink,
  // Lieux
  MapPin,
  Phone,
  Globe,
  Home,
  Building2,
  Fence,
  // Autre
  Camera,
  Image,
  Gift,
  Ticket,
  Tag,
  Sparkles,
  Zap,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";

// ─── Mapping des concepts métier vers des icônes Lucide ───
const iconMap: Record<string, LucideIcon> = {
  // Animaux
  horse: Heart, // Cœur = passion du cheval
  poney: Heart,
  shetland: Heart,
  cavalerie: Heart,

  // Activités
  stage: Star,
  balade: Compass,
  cours: GraduationCap,
  competition: Trophy,
  ponygames: Flag,
  anniversaire: PartyPopper,
  ponyride: Footprints,
  "coucher-soleil": Sunrise,

  // Planning
  planning: CalendarDays,
  reprise: CalendarCheck,
  montoir: ClipboardCheck,
  "modele-reprise": LayoutTemplate,
  horaires: Clock,

  // Cavaliers
  cavaliers: Users,
  famille: Users,
  "cavalier-passage": UserPlus,
  enfant: Baby,
  pedagogie: GraduationCap,
  galop: TrendingUp,

  // Facturation
  paiement: CreditCard,
  facture: Receipt,
  carte: Wallet,
  forfait: CalendarClock,
  "bon-cadeau": Gift,
  "bon-recup": Ticket,
  devis: FileText,
  avoir: BadgeEuro,

  // Comptabilité
  comptabilite: BookOpen,
  statistiques: BarChart3,
  ca: TrendingUp,
  tva: Calculator,

  // Communication
  email: Mail,
  sms: MessageSquare,
  "email-reprise": Send,
  notification: Bell,
  communication: Mail,

  // Soins
  vermifuge: Pill,
  vaccin: Syringe,
  marechal: Wrench,
  dentiste: Bone,
  osteopathe: HandMetal,
  veterinaire: Stethoscope,
  tonte: Scissors,
  soin: Stethoscope,
  alerte: AlertTriangle,

  // Documents
  document: FileText,
  radio: FileCheck,
  ordonnance: FilePlus,
  "carnet-sante": ShieldCheck,
  certificat: FileCheck,
  assurance: ShieldCheck,

  // Gestion
  dashboard: BarChart3,
  parametres: Settings,
  activites: ClipboardList,
  galerie: Camera,
  impression: Printer,

  // Lieux
  adresse: MapPin,
  telephone: Phone,
  site: Globe,
  centre: Home,
  ecurie: Building2,
  carriere: Fence,

  // UI
  ajouter: Plus,
  rechercher: Search,
  filtrer: Filter,
  modifier: Edit3,
  supprimer: Trash2,
  fermer: X,
  valider: Check,
  telecharger: Download,
  uploader: Upload,
  info: Info,
  aide: HelpCircle,
  lien: ExternalLink,
  tag: Tag,
  sparkle: Sparkles,
  eclair: Zap,
};

// ─── Composant principal ───
interface EquiIconProps {
  name: keyof typeof iconMap | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function EquiIcon({ name, size = 20, className = "", strokeWidth = 1.75 }: EquiIconProps) {
  const IconComponent = iconMap[name];
  if (!IconComponent) {
    // Fallback : essayer de trouver une icône approchante
    console.warn(`EquiIcon: icône "${name}" non trouvée`);
    return <Sparkles size={size} className={className} strokeWidth={strokeWidth} />;
  }
  return <IconComponent size={size} className={className} strokeWidth={strokeWidth} />;
}

// ─── Composant IconBox : icône dans un conteneur coloré ───
// Remplace les patterns emoji dans un carré coloré
type IconBoxColor = "blue" | "green" | "red" | "orange" | "purple" | "gray" | "gold";

const boxColors: Record<IconBoxColor, { bg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-500" },
  green: { bg: "bg-green-50", icon: "text-green-600" },
  red: { bg: "bg-red-50", icon: "text-red-500" },
  orange: { bg: "bg-orange-50", icon: "text-orange-500" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600" },
  gray: { bg: "bg-gray-100", icon: "text-gray-500" },
  gold: { bg: "bg-amber-50", icon: "text-amber-500" },
};

interface IconBoxProps {
  name: keyof typeof iconMap | string;
  color?: IconBoxColor;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const boxSizes = {
  sm: { box: "w-8 h-8 rounded-lg", icon: 14 },
  md: { box: "w-10 h-10 rounded-xl", icon: 18 },
  lg: { box: "w-12 h-12 rounded-xl", icon: 22 },
};

export function IconBox({ name, color = "blue", size = "md", className = "" }: IconBoxProps) {
  const { bg, icon } = boxColors[color];
  const { box, icon: iconSize } = boxSizes[size];
  return (
    <div className={`${box} ${bg} flex items-center justify-center flex-shrink-0 ${className}`}>
      <EquiIcon name={name} size={iconSize} className={icon} />
    </div>
  );
}

// ─── Ré-export des icônes Lucide les plus utilisées ───
// Pour les pages qui ont besoin d'icônes Lucide directement
export {
  Heart, Trophy, Flag, Compass, Sunrise, Star, PartyPopper,
  CalendarDays, CalendarCheck, Clock, Timer,
  Users, UserPlus, UserCheck, GraduationCap, Baby,
  CreditCard, Receipt, Wallet, BadgeEuro, Banknote, FileText,
  BookOpen, Calculator, TrendingUp, BarChart3, PieChart,
  Mail, Send, MessageSquare, Bell,
  Stethoscope, Syringe, Pill, Scissors, Wrench, Bone, ShieldCheck,
  FileCheck, FilePlus, FolderOpen, Upload, Download, Printer,
  Settings, ClipboardList, ClipboardCheck, LayoutTemplate,
  Plus, Search, Filter, Edit3, Trash2, X, Check, AlertTriangle, Info,
  MapPin, Phone, Globe, Home, Building2,
  Camera, Image, Gift, Ticket, Tag, Sparkles, Zap, Sun,
  type LucideIcon,
};
