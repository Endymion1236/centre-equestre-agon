// ═══ Types Firestore — Centre Équestre Agon ═══

// ─── Utilisateurs & Familles ───
export interface Family {
  id: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  authProvider: "google" | "facebook";
  authUid: string;
  children: Child[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Child {
  id: string;
  firstName: string;
  birthDate: Date;
  galopLevel: string; // "—", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4"
  sanitaryForm: SanitaryForm | null;
}

export interface SanitaryForm {
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  parentalAuthorization: boolean;
  updatedAt: Date;
}

// ─── Activités ───
export type ActivityType = "stage" | "stage_journee" | "balade" | "cours" | "competition" | "anniversaire" | "ponyride";

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  ageMin: number;
  ageMax: number | null;
  galopRequired: string | null;
  priceHT: number;
  priceTTC: number; // Prix annoncé au client (TTC)
  tvaTaux: number; // 5.5 pour 5.5%
  maxPlaces: number;
  schedule: string; // ex: "Lun-Ven · 10h-12h"
  seasonPeriod: string; // ex: "Toutes vacances", "Avr-Oct"
  active: boolean;
  articles: Article[]; // Multi-articles pour facturation fine
  createdAt: Date;
}

export interface Article {
  id: string;
  label: string; // ex: "Enseignement", "Accès installations", "Licence FFE"
  accountCode: string; // ex: "706100"
  amountHT: number;
  tvaTaux: number;
}

// ─── Reprises / Planning ───
export interface Reprise {
  id: string;
  activityId: string;
  date: Date;
  startTime: string; // "10:00"
  endTime: string; // "12:00"
  monitor: string;
  maxPlaces: number;
  enrolledCavaliers: EnrolledCavalier[];
  status: "planned" | "in_progress" | "closed";
  templateId: string | null; // Lien vers le modèle de reprise
}

export interface EnrolledCavalier {
  childId: string;
  familyId: string;
  childName: string;
  horseName: string | null;
  presence: "present" | "absent" | "unknown";
  cardDeducted: boolean; // Heure déduite de la carte
}

export interface RepriseTemplate {
  id: string;
  name: string; // ex: "Semaine type — Vacances"
  reprises: TemplateReprise[];
  active: boolean;
}

export interface TemplateReprise {
  dayOfWeek: number; // 0=Lun, 1=Mar, etc.
  startTime: string;
  endTime: string;
  activityId: string;
  monitor: string;
  maxPlaces: number;
}

// ─── Réservations ───
export type ReservationStatus = "confirmed" | "waitlist" | "cancelled" | "past";

export interface Reservation {
  id: string;
  familyId: string;
  childId: string;
  childName: string;
  activityId: string;
  activityTitle: string;
  repriseId: string | null;
  date: string; // "14 – 18 Avril 2026"
  time: string; // "10h – 12h"
  priceTTC: number;
  discountPercent: number; // Dégressivité appliquée
  discountReason: string | null; // "2ème stage", "famille"
  status: ReservationStatus;
  stripePaymentId: string | null;
  createdAt: Date;
}

// ─── Paiements & Facturation ───
export type PaymentMethod = "cb" | "sepa" | "cheque" | "especes" | "avoir";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded" | "partial";

export interface Invoice {
  id: string; // ex: "F2026-042"
  familyId: string;
  clientName: string;
  items: InvoiceItem[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  status: PaymentStatus;
  dueDate: Date;
  paidDate: Date | null;
  paymentMethod: PaymentMethod | null;
  stripePaymentId: string | null;
  createdAt: Date;
}

export interface InvoiceItem {
  label: string;
  accountCode: string;
  quantity: number;
  unitPriceHT: number;
  tvaTaux: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
}

export interface PaymentPlan {
  id: string;
  familyId: string;
  invoiceId: string;
  totalAmount: number;
  installments: number; // 3 ou 10
  paidInstallments: number;
  nextDueDate: Date;
  nextAmount: number;
  stripeSubscriptionId: string | null;
  status: "active" | "completed" | "failed";
}

export interface DeferredCheque {
  id: string;
  familyId: string;
  clientName: string;
  amount: number;
  chequeNumber: string;
  depositDate: Date; // Date d'encaissement prévue
  status: "pending" | "deposited" | "rejected";
  remiseId: string | null; // Lien vers le bordereau
}

export interface BankRemise {
  id: string;
  date: Date;
  items: RemiseItem[];
  totalAmount: number;
  status: "draft" | "deposited";
}

export interface RemiseItem {
  type: "cheque" | "especes";
  clientName: string;
  reference: string;
  amount: number;
  date: Date;
}

export interface Devis {
  id: string;
  familyId: string;
  clientName: string;
  items: InvoiceItem[];
  totalTTC: number;
  validUntil: Date;
  status: "draft" | "sent" | "accepted" | "expired";
  convertedToInvoiceId: string | null;
  createdAt: Date;
}

// ─── Dégressivité ───
export interface DiscountConfig {
  multiStage: { nthStage: number; discountPercent: number }[];
  family: { nthChild: number; discountPercent: number }[];
  cumulative: boolean; // Les deux se cumulent
}

// ─── Comptabilité ───
export interface AccountEntry {
  id: string;
  journalCode: string; // "VE" (ventes), "BQ" (banque), "RG" (règlements)
  entryDate: Date;
  accountCode: string;
  accountLabel: string;
  auxiliaryCode: string | null; // Code client
  auxiliaryLabel: string | null;
  pieceRef: string; // N° facture
  pieceDate: Date;
  label: string;
  debit: number;
  credit: number;
}

export interface AccountPlan {
  code: string;
  label: string;
  affectation: string;
  active: boolean;
}

// ─── Communication ───
export type EmailType = "transactional" | "newsletter" | "campaign" | "satisfaction";

export interface EmailRecord {
  id: string;
  type: EmailType;
  subject: string;
  recipientEmail: string;
  recipientName: string;
  familyId: string | null;
  sentAt: Date;
  opened: boolean;
  openedAt: Date | null;
}

export interface Campaign {
  id: string;
  name: string;
  triggerDescription: string;
  audienceId: string;
  emailSubject: string;
  emailBody: string;
  active: boolean;
  sentCount: number;
  openRate: number;
  lastRunAt: Date | null;
}

export interface Audience {
  id: string;
  name: string;
  criteria: string;
  autoGenerated: boolean;
  familyCount: number;
}

export interface SatisfactionReview {
  id: string;
  familyId: string;
  parentName: string;
  childName: string;
  activityTitle: string;
  rating: number; // 1-5
  comment: string;
  googleReviewLeft: boolean;
  flagged: boolean; // Note < 3
  treatedAt: Date | null;
  createdAt: Date;
}

// ─── Cavalerie ───
export interface Horse {
  id: string;
  name: string;
  type: "poney" | "shetland" | "cheval";
  available: boolean;
  maxReprisesPerDay: number;
  notes: string;
}

// ─── Suivi pédagogique ───
export interface PedagogyRecord {
  id: string;
  childId: string;
  childName: string;
  galopLevel: string;
  objectives: string[];
  notes: string;
  lastSessionDate: Date;
  updatedBy: string; // "Emmeline", "Nicolas"
}

// ─── Cartes / Tickets ───
export interface Card10 {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  activityType: string; // "cours", "balade", etc.
  totalSessions: number; // 5, 10, 20
  usedSessions: number;
  remainingSessions: number;
  priceHT: number;
  tvaTaux: number;
  priceTTC: number;
  purchaseDate: Date;
  expiryDate: Date | null;
  status: "active" | "expired" | "used";
  history: CardUsage[];
}

export interface CardUsage {
  date: string;
  creneauId: string;
  activityTitle: string;
  deductedAt: string;
}
