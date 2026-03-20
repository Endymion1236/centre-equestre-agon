"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Plus,
  Search,
  Loader2,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Calendar,
  FileText,
  Heart,
  Activity,
  Trash2,
  Edit3,
  Upload,
  Clock,
  Filter,
  Download,
  GraduationCap,
  Check,
  BookOpen,
  Stethoscope,
  ClipboardList,
  Syringe,
  Wrench,
  Bone,
  Scissors,
  Pill,
  Timer,
} from "lucide-react";

// Icône tab helper
const tabIconMap: Record<string, any> = {};
function TabIcon({ name }: { name: string }) {
  const map: Record<string, any> = {
    heart: Heart, book: BookOpen, stethoscope: Stethoscope,
    file: FileText, timer: Timer, alert: AlertTriangle,
  };
  const Icon = map[name];
  return Icon ? <Icon size={16} /> : null;
}

// ─── Types locaux (à migrer dans src/types/index.ts) ───
type EquideType = "poney" | "shetland" | "cheval" | "ane";
type EquideSex = "male" | "femelle" | "hongre";
type EquideStatus = "actif" | "retraite" | "sorti" | "en_formation" | "indisponible";
type SoinType = "vermifuge" | "vaccin" | "marechal" | "dentiste" | "osteopathe" | "veterinaire" | "tonte" | "autre";
type DocumentEquideType = "radio" | "ordonnance" | "carnet_sante" | "certificat" | "assurance" | "livret" | "facture_veto" | "autre";

interface Equide {
  id: string;
  name: string;
  sire: string;
  puce: string;
  type: EquideType;
  sex: EquideSex;
  robe: string;
  race: string;
  birthDate: any;
  toise: number | null;
  photo: string | null;
  provenance: string;
  proprietaire: string;
  dateArrivee: any;
  dateSortie: any;
  motifSortie: string | null;
  status: EquideStatus;
  available: boolean;
  niveauCavalier: string;
  disciplines: string[];
  temperament: string;
  cavaliersFavoris: string[];
  maxReprisesPerDay: number;
  maxHeuresHebdo: number;
  notes: string;
  createdAt: any;
  updatedAt: any;
}

interface SoinRecord {
  id: string;
  equideId: string;
  equideName: string;
  type: SoinType;
  label: string;
  date: any;
  prochainRdv: any;
  praticien: string;
  cout: number | null;
  observations: string;
  createdAt: any;
}

interface MouvementRegistre {
  id: string;
  equideId: string;
  equideName: string;
  type: "entree" | "sortie";
  date: any;
  motif: string;
  provenance: string | null;
  destination: string | null;
  prixAchat: number | null;
  prixVente: number | null;
  observations: string;
  createdAt: any;
}

interface DocumentEquide {
  id: string;
  equideId: string;
  equideName: string;
  type: DocumentEquideType;
  label: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: any;
  notes: string;
}

// ─── Constantes ───
const typeOptions: { value: EquideType; label: string }[] = [
  { value: "poney", label: "Poney" },
  { value: "shetland", label: "Shetland" },
  { value: "cheval", label: "Cheval" },
  { value: "ane", label: "Âne" },
];

const sexOptions: { value: EquideSex; label: string }[] = [
  { value: "hongre", label: "Hongre" },
  { value: "male", label: "Entier" },
  { value: "femelle", label: "Jument" },
];

const statusOptions: { value: EquideStatus; label: string; color: "green" | "blue" | "orange" | "gray" | "red" }[] = [
  { value: "actif", label: "Actif", color: "green" },
  { value: "en_formation", label: "En formation", color: "blue" },
  { value: "indisponible", label: "Indisponible", color: "orange" },
  { value: "retraite", label: "Retraite", color: "gray" },
  { value: "sorti", label: "Sorti", color: "red" },
];

const niveauOptions = ["Débutant", "Intermédiaire", "Confirmé", "Tous niveaux"];
const disciplinesList = ["Baby Poney", "Pony Games", "CSO", "Dressage", "Balade", "Cross", "Voltige", "Attelage", "Randonnée", "Compétition"];
const robesList = ["Bai", "Alezan", "Gris", "Noir", "Pie", "Isabelle", "Palomino", "Crème", "Rouan", "Appaloosa", "Autre"];

const soinTypeOptions: { value: SoinType; label: string; icon: typeof Heart; recurrence: number }[] = [
  { value: "vermifuge", label: "Vermifuge", icon: Pill, recurrence: 90 },
  { value: "vaccin", label: "Vaccin", icon: Syringe, recurrence: 365 },
  { value: "marechal", label: "Maréchal-ferrant", icon: Wrench, recurrence: 42 },
  { value: "dentiste", label: "Dentiste", icon: Bone, recurrence: 365 },
  { value: "osteopathe", label: "Ostéopathe", icon: Heart, recurrence: 180 },
  { value: "veterinaire", label: "Vétérinaire", icon: Stethoscope, recurrence: 0 },
  { value: "tonte", label: "Tonte", icon: Scissors, recurrence: 0 },
  { value: "autre", label: "Autre", icon: ClipboardList, recurrence: 0 },
];

const docTypeOptions: { value: DocumentEquideType; label: string }[] = [
  { value: "radio", label: "Radio" },
  { value: "ordonnance", label: "Ordonnance" },
  { value: "carnet_sante", label: "Carnet de santé" },
  { value: "certificat", label: "Certificat" },
  { value: "assurance", label: "Assurance" },
  { value: "livret", label: "Livret" },
  { value: "facture_veto", label: "Facture véto" },
  { value: "autre", label: "Autre" },
];

// ─── Helpers ───
const toDateStr = (d: any): string => {
  if (!d) return "";
  if (d.toDate) return d.toDate().toISOString().split("T")[0];
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
};

const formatDate = (d: any): string => {
  if (!d) return "—";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

const calcAge = (birthDate: any): string => {
  if (!birthDate) return "—";
  const birth = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  return `${years} ans`;
};

const daysUntil = (d: any): number => {
  if (!d) return 9999;
  const target = d.toDate ? d.toDate() : new Date(d);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

// ═══════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════
export default function CavaleriePage() {
  // ─── State ───
  const [tab, setTab] = useState<"fiches" | "registre" | "soins" | "documents" | "charge" | "indispos">("fiches");
  const [equides, setEquides] = useState<Equide[]>([]);
  const [soins, setSoins] = useState<SoinRecord[]>([]);
  const [mouvements, setMouvements] = useState<MouvementRegistre[]>([]);
  const [documents, setDocuments] = useState<DocumentEquide[]>([]);
  const [indispos, setIndispos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<EquideStatus | "all">("all");
  const [filterType, setFilterType] = useState<EquideType | "all">("all");

  // Forms
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSoinForm, setShowSoinForm] = useState(false);
  const [showMouvForm, setShowMouvForm] = useState(false);
  const [showIndispoForm, setShowIndispoForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Form State : Equidé ───
  const emptyEquide = {
    name: "", sire: "", puce: "", type: "poney" as EquideType, sex: "hongre" as EquideSex,
    robe: "Bai", race: "", birthDate: "", toise: "", photo: null as string | null,
    provenance: "Achat", proprietaire: "Centre", dateArrivee: new Date().toISOString().split("T")[0],
    dateSortie: "", motifSortie: "",
    status: "actif" as EquideStatus, available: true, niveauCavalier: "Débutant",
    disciplines: [] as string[], temperament: "", cavaliersFavoris: [] as string[],
    maxReprisesPerDay: 3, maxHeuresHebdo: 15, notes: "",
  };
  const [form, setForm] = useState(emptyEquide);

  // ─── Form State : Soin ───
  const emptySoin = {
    equideId: "", type: "vermifuge" as SoinType, label: "", date: new Date().toISOString().split("T")[0],
    prochainRdv: "", praticien: "", cout: "", observations: "",
  };
  const [soinForm, setSoinForm] = useState(emptySoin);

  // ─── Form State : Mouvement ───
  const emptyMouv = {
    equideId: "", type: "entree" as "entree" | "sortie", date: new Date().toISOString().split("T")[0],
    motif: "Achat", provenance: "", destination: "", prixAchat: "", prixVente: "", observations: "",
  };
  const [mouvForm, setMouvForm] = useState(emptyMouv);

  // ─── Fetch Data ───
  const fetchData = async () => {
    try {
      const [eSnap, sSnap, mSnap, dSnap, iSnap] = await Promise.all([
        getDocs(collection(db, "equides")),
        getDocs(collection(db, "soins")),
        getDocs(collection(db, "mouvements_registre")),
        getDocs(collection(db, "documents_equide")),
        getDocs(collection(db, "indisponibilites")),
      ]);
      setEquides(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Equide)));
      setSoins(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoinRecord)));
      setMouvements(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MouvementRegistre)));
      setDocuments(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentEquide)));
      setIndispos(iSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Erreur chargement cavalerie:", e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ─── Filtered & computed ───
  const filteredEquides = useMemo(() => {
    return equides.filter(e => {
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      if (filterType !== "all" && e.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.name.toLowerCase().includes(q) || e.sire?.toLowerCase().includes(q) || e.race?.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [equides, filterStatus, filterType, search]);

  // Alertes soins
  const alertes = useMemo(() => {
    return soins
      .filter(s => s.prochainRdv)
      .map(s => {
        const days = daysUntil(s.prochainRdv);
        const status = days < 0 ? "en_retard" : days <= 14 ? "a_venir" : "ok";
        return { ...s, daysUntil: days, alertStatus: status };
      })
      .filter(s => s.alertStatus !== "ok")
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [soins]);

  // Charge de travail (simulée — en vrai, calculée depuis les créneaux du jour)
  const chargeJour = useMemo(() => {
    // TODO: remplacer par un vrai calcul depuis la collection "creneaux"
    return equides.filter(e => e.status === "actif").map(e => ({
      equideId: e.id,
      name: e.name,
      maxReprises: e.maxReprisesPerDay,
      maxHeuresHebdo: e.maxHeuresHebdo,
      reprisesAujourdhui: 0, // À calculer
      heuresSemaine: 0, // À calculer
    }));
  }, [equides]);

  // ─── KPIs ───
  const nbActifs = equides.filter(e => e.status === "actif").length;
  const nbFormation = equides.filter(e => e.status === "en_formation").length;
  const nbIndispo = equides.filter(e => e.status === "indisponible").length;
  const nbAlertes = alertes.length;

  // ═══════════════════════════════════════════
  // SAVE / DELETE
  // ═══════════════════════════════════════════
  const saveEquide = async () => {
    setSaving(true);
    try {
      const data: any = {
        ...form,
        toise: form.toise ? Number(form.toise) : null,
        birthDate: form.birthDate ? Timestamp.fromDate(new Date(form.birthDate)) : null,
        dateArrivee: form.dateArrivee ? Timestamp.fromDate(new Date(form.dateArrivee)) : Timestamp.now(),
        dateSortie: form.dateSortie ? Timestamp.fromDate(new Date(form.dateSortie)) : null,
        motifSortie: form.motifSortie || null,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "equides", editingId), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "equides"), data);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyEquide);
      fetchData();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      alert("Erreur lors de la sauvegarde.");
    }
    setSaving(false);
  };

  const deleteEquide = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
    try {
      await deleteDoc(doc(db, "equides", id));
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const editEquide = (e: Equide) => {
    setForm({
      name: e.name, sire: e.sire || "", puce: e.puce || "", type: e.type, sex: e.sex,
      robe: e.robe || "Bai", race: e.race || "", birthDate: toDateStr(e.birthDate),
      toise: e.toise ? String(e.toise) : "", photo: e.photo,
      provenance: e.provenance || "", proprietaire: e.proprietaire || "Centre",
      dateArrivee: toDateStr(e.dateArrivee), dateSortie: toDateStr(e.dateSortie),
      motifSortie: e.motifSortie || "",
      status: e.status, available: e.available, niveauCavalier: e.niveauCavalier || "Débutant",
      disciplines: e.disciplines || [], temperament: e.temperament || "",
      cavaliersFavoris: e.cavaliersFavoris || [],
      maxReprisesPerDay: e.maxReprisesPerDay || 3, maxHeuresHebdo: e.maxHeuresHebdo || 15,
      notes: e.notes || "",
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  const saveSoin = async () => {
    setSaving(true);
    try {
      const eq = equides.find(e => e.id === soinForm.equideId);
      await addDoc(collection(db, "soins"), {
        ...soinForm,
        equideName: eq?.name || "",
        date: Timestamp.fromDate(new Date(soinForm.date)),
        prochainRdv: soinForm.prochainRdv ? Timestamp.fromDate(new Date(soinForm.prochainRdv)) : null,
        cout: soinForm.cout ? Number(soinForm.cout) : null,
        createdAt: serverTimestamp(),
      });
      setShowSoinForm(false);
      setSoinForm(emptySoin);
      fetchData();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'enregistrement du soin.");
    }
    setSaving(false);
  };

  const saveMouvement = async () => {
    setSaving(true);
    try {
      const eq = equides.find(e => e.id === mouvForm.equideId);
      await addDoc(collection(db, "mouvements_registre"), {
        ...mouvForm,
        equideName: eq?.name || mouvForm.equideId,
        date: Timestamp.fromDate(new Date(mouvForm.date)),
        provenance: mouvForm.provenance || null,
        destination: mouvForm.destination || null,
        prixAchat: mouvForm.prixAchat ? Number(mouvForm.prixAchat) : null,
        prixVente: mouvForm.prixVente ? Number(mouvForm.prixVente) : null,
        createdAt: serverTimestamp(),
      });
      setShowMouvForm(false);
      setMouvForm(emptyMouv);
      fetchData();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  const tabs = [
    { id: "fiches" as const, label: "Fiches équidés", icon: "heart", count: equides.length },
    { id: "registre" as const, label: "Registre", icon: "book", count: mouvements.length },
    { id: "soins" as const, label: "Soins & alertes", icon: "stethoscope", count: nbAlertes > 0 ? nbAlertes : undefined, alert: nbAlertes > 0 },
    { id: "documents" as const, label: "Documents", icon: "file", count: documents.length },
    { id: "charge" as const, label: "Charge de travail", icon: "timer" },
    { id: "indispos" as const, label: "Indisponibilités", icon: "alert", count: indispos.filter((i: any) => i.active).length || undefined },
  ];

  // ─── Styles communs ───
  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";
  const btnPrimary = "flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 transition-colors";
  const btnSecondary = "flex items-center gap-2 font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Cavalerie</h1>
          <p className="font-body text-xs text-gray-400">
            {equides.length} équidés · {nbActifs} actifs · {nbFormation} en formation
          </p>
        </div>
        {tab === "fiches" && (
          <button onClick={() => { setForm(emptyEquide); setEditingId(null); setShowForm(true); }} className={btnPrimary}>
            <Plus size={16} /> Ajouter un équidé
          </button>
        )}
        {tab === "soins" && (
          <button onClick={() => { setSoinForm({ ...emptySoin, equideId: equides[0]?.id || "" }); setShowSoinForm(true); }} className={btnPrimary}>
            <Plus size={16} /> Enregistrer un soin
          </button>
        )}
        {tab === "registre" && (
          <button onClick={() => { setMouvForm({ ...emptyMouv, equideId: equides[0]?.id || "" }); setShowMouvForm(true); }} className={btnPrimary}>
            <Plus size={16} /> Nouveau mouvement
          </button>
        )}
        {tab === "indispos" && (
          <button onClick={() => setShowIndispoForm(true)} className={btnPrimary}>
            <Plus size={16} /> Déclarer une indisponibilité
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Heart size={18} className="text-green-600" /></div>
          <div>
            <div className="font-body text-xl font-bold text-green-600">{nbActifs}</div>
            <div className="font-body text-xs text-gray-400">actifs</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><GraduationCap size={18} className="text-blue-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-blue-500">{nbFormation}</div>
            <div className="font-body text-xs text-gray-400">en formation</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={18} className="text-orange-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-orange-500">{nbIndispo}</div>
            <div className="font-body text-xs text-gray-400">indisponibles</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${nbAlertes > 0 ? "bg-red-50" : "bg-gray-50"} flex items-center justify-center`}>
            {nbAlertes > 0 ? <AlertTriangle size={18} className="text-red-500" /> : <Check size={18} className="text-gray-400" />}
          </div>
          <div>
            <div className={`font-body text-xl font-bold ${nbAlertes > 0 ? "text-red-500" : "text-gray-400"}`}>{nbAlertes}</div>
            <div className="font-body text-xs text-gray-400">alertes soins</div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all whitespace-nowrap
              ${tab === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
            <TabIcon name={t.icon} />
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${tab === t.id ? "bg-white/20 text-white" : t.alert ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ ONGLET 1 : FICHES ÉQUIDÉS ═══ */}
      {tab === "fiches" && (
        <>
          {/* Filtres */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input type="text" placeholder="Rechercher par nom, SIRE, race…" value={search} onChange={e => setSearch(e.target.value)}
                className={`${inputStyle} !pl-9`} />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className={inputStyle + " !w-auto"}>
              <option value="all">Tous statuts</option>
              {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className={inputStyle + " !w-auto"}>
              <option value="all">Tous types</option>
              {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Liste */}
          {filteredEquides.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Heart size={28} className="text-blue-300" /></div>
              <p className="font-body text-sm text-gray-500">
                {equides.length === 0
                  ? "Aucun équidé enregistré. Commencez par ajouter votre premier cheval ou poney !"
                  : "Aucun résultat pour ces filtres."}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredEquides.map(e => {
                const equideSoins = soins.filter(s => s.equideId === e.id);
                const equideDocs = documents.filter(d => d.equideId === e.id);
                const expanded = expandedId === e.id;
                const statusOpt = statusOptions.find(s => s.value === e.status);
                const TypeIcon = Heart;
                const prochainSoin = equideSoins
                  .filter(s => s.prochainRdv)
                  .sort((a, b) => daysUntil(a.prochainRdv) - daysUntil(b.prochainRdv))[0];
                const prochainDays = prochainSoin ? daysUntil(prochainSoin.prochainRdv) : null;

                return (
                  <Card key={e.id} padding="md" className={`transition-all ${expanded ? "ring-2 ring-blue-200" : ""}`}>
                    {/* Ligne résumé */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : e.id)}>
                      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <TypeIcon size={22} className="text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-base font-bold text-blue-800">{e.name}</span>
                          <Badge color={statusOpt?.color || "gray"}>{statusOpt?.label || e.status}</Badge>
                          {e.niveauCavalier && <Badge color="blue">{e.niveauCavalier}</Badge>}
                          {prochainDays !== null && prochainDays <= 14 && (
                            <Badge color={prochainDays < 0 ? "red" : "orange"}>
                              {prochainDays < 0 ? `Soin en retard (${Math.abs(prochainDays)}j)` : `Soin dans ${prochainDays}j`}
                            </Badge>
                          )}
                        </div>
                        <div className="font-body text-xs text-gray-400 mt-0.5">
                          {e.race || e.type} · {e.robe} · {e.sex === "hongre" ? "Hongre" : e.sex === "femelle" ? "Jument" : "Entier"} · {calcAge(e.birthDate)}
                          {e.sire && <> · SIRE {e.sire}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={(ev) => { ev.stopPropagation(); editEquide(e); }}
                          className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none transition-colors">
                          <Edit3 size={14} />
                        </button>
                        {expanded ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}
                      </div>
                    </div>

                    {/* Détails dépliés */}
                    {expanded && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Col 1 : Identité */}
                          <div>
                            <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Identité</div>
                            <div className="space-y-1.5 text-xs font-body text-gray-600">
                              <div><span className="text-gray-400">SIRE :</span> {e.sire || "—"}</div>
                              <div><span className="text-gray-400">Puce :</span> {e.puce || "—"}</div>
                              <div><span className="text-gray-400">Race :</span> {e.race || "—"}</div>
                              <div><span className="text-gray-400">Toise :</span> {e.toise ? `${e.toise} cm` : "—"}</div>
                              <div><span className="text-gray-400">Propriétaire :</span> {e.proprietaire}</div>
                              <div><span className="text-gray-400">Provenance :</span> {e.provenance}</div>
                              <div><span className="text-gray-400">Arrivée :</span> {formatDate(e.dateArrivee)}</div>
                              {e.dateSortie && <div><span className="text-gray-400">Sortie :</span> {formatDate(e.dateSortie)} ({e.motifSortie})</div>}
                            </div>
                          </div>
                          {/* Col 2 : Travail */}
                          <div>
                            <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Travail & disciplines</div>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {(e.disciplines || []).map(d => (
                                <span key={d} className="font-body text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{d}</span>
                              ))}
                              {(!e.disciplines || e.disciplines.length === 0) && <span className="text-xs text-gray-300">Aucune discipline</span>}
                            </div>
                            <div className="space-y-1.5 text-xs font-body text-gray-600">
                              <div><span className="text-gray-400">Max reprises/jour :</span> <strong>{e.maxReprisesPerDay}</strong></div>
                              <div><span className="text-gray-400">Max heures/semaine :</span> <strong>{e.maxHeuresHebdo}h</strong></div>
                              <div><span className="text-gray-400">Tempérament :</span> {e.temperament || "—"}</div>
                            </div>
                          </div>
                          {/* Col 3 : Soins récents */}
                          <div>
                            <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                              Derniers soins ({equideSoins.length})
                            </div>
                            {equideSoins.length === 0 ? (
                              <p className="text-xs text-gray-300">Aucun soin enregistré</p>
                            ) : (
                              <div className="space-y-2">
                                {equideSoins.slice(0, 4).map(s => {
                                  const stOpt = soinTypeOptions.find(o => o.value === s.type);
                                  return (
                                    <div key={s.id} className="flex items-center gap-2 text-xs font-body">
                                      {(() => { const SI = stOpt?.icon || ClipboardList; return <SI size={16} className="text-blue-400" />; })()}
                                      <span className="text-gray-600">{s.label || stOpt?.label}</span>
                                      <span className="text-gray-300 ml-auto">{formatDate(s.date)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {equideDocs.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-gray-100">
                                <div className="text-xs text-gray-400">{equideDocs.length} document{equideDocs.length > 1 ? "s" : ""} rattaché{equideDocs.length > 1 ? "s" : ""}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        {e.notes && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="font-body text-xs text-gray-400">Notes : <span className="text-gray-600">{e.notes}</span></div>
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                          <button onClick={() => { setSoinForm({ ...emptySoin, equideId: e.id }); setShowSoinForm(true); }}
                            className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 transition-colors">
                            💊 Ajouter un soin
                          </button>
                          <button onClick={() => deleteEquide(e.id, e.name)}
                            className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100 transition-colors ml-auto">
                            <Trash2 size={12} className="inline mr-1" /> Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ ONGLET 2 : REGISTRE D'ÉLEVAGE ═══ */}
      {tab === "registre" && (
        <>
          {mouvements.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><BookOpen size={28} className="text-blue-300" /></div>
              <p className="font-body text-sm text-gray-500">Aucun mouvement enregistré. Le registre d&apos;élevage trace toutes les entrées et sorties d&apos;équidés.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {[...mouvements].sort((a, b) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return db2.getTime() - da.getTime();
              }).map(m => (
                <Card key={m.id} padding="sm" className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${m.type === "entree" ? "bg-green-50" : "bg-red-50"}`}>
                    {m.type === "entree" ? "➡️" : "⬅️"}
                  </div>
                  <div className="flex-1">
                    <div className="font-body text-sm font-semibold text-blue-800">
                      {m.equideName} — <span className={m.type === "entree" ? "text-green-600" : "text-red-500"}>{m.type === "entree" ? "Entrée" : "Sortie"}</span>
                    </div>
                    <div className="font-body text-xs text-gray-400">
                      {formatDate(m.date)} · {m.motif}
                      {m.provenance && <> · de {m.provenance}</>}
                      {m.destination && <> · vers {m.destination}</>}
                      {m.prixAchat && <> · Achat : {m.prixAchat}€</>}
                      {m.prixVente && <> · Vente : {m.prixVente}€</>}
                    </div>
                    {m.observations && <div className="font-body text-xs text-gray-400 mt-0.5">{m.observations}</div>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ ONGLET 3 : SOINS & ALERTES ═══ */}
      {tab === "soins" && (
        <>
          {/* Alertes en haut */}
          {alertes.length > 0 && (
            <div className="mb-6">
              <div className="font-body text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <AlertTriangle size={14} /> Alertes à traiter ({alertes.length})
              </div>
              <div className="flex flex-col gap-2">
                {alertes.map(a => {
                  const stOpt = soinTypeOptions.find(o => o.value === a.type);
                  return (
                    <Card key={a.id} padding="sm" className={`flex items-center gap-3 ${a.alertStatus === "en_retard" ? "!border-red-200 !bg-red-50/30" : "!border-orange-200 !bg-orange-50/30"}`}>
                      {(() => { const SI = stOpt?.icon || ClipboardList; return <SI size={18} className="text-blue-400" />; })()}
                      <div className="flex-1">
                        <div className="font-body text-sm font-semibold text-blue-800">{a.equideName} — {a.label || stOpt?.label}</div>
                        <div className="font-body text-xs text-gray-400">
                          Prévu : {formatDate(a.prochainRdv)} · Praticien : {a.praticien || "—"}
                        </div>
                      </div>
                      <Badge color={a.alertStatus === "en_retard" ? "red" : "orange"}>
                        {a.daysUntil < 0 ? `${Math.abs(a.daysUntil)}j de retard` : `Dans ${a.daysUntil}j`}
                      </Badge>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historique complet */}
          <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Historique des soins ({soins.length})
          </div>
          {soins.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><Stethoscope size={28} className="text-green-400" /></div>
              <p className="font-body text-sm text-gray-500">Aucun soin enregistré.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {[...soins].sort((a, b) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return db2.getTime() - da.getTime();
              }).map(s => {
                const stOpt = soinTypeOptions.find(o => o.value === s.type);
                return (
                  <Card key={s.id} padding="sm" className="flex items-center gap-3">
                    {(() => { const SI = stOpt?.icon || ClipboardList; return <SI size={18} className="text-blue-400" />; })()}
                    <div className="flex-1">
                      <div className="font-body text-sm font-semibold text-blue-800">{s.equideName} — {s.label || stOpt?.label}</div>
                      <div className="font-body text-xs text-gray-400">
                        {formatDate(s.date)} · {s.praticien || "—"}
                        {s.cout && <> · {s.cout}€</>}
                        {s.prochainRdv && <> · Prochain : {formatDate(s.prochainRdv)}</>}
                      </div>
                      {s.observations && <div className="font-body text-xs text-gray-300 mt-0.5">{s.observations}</div>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ ONGLET 4 : DOCUMENTS ═══ */}
      {tab === "documents" && (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><FileText size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500 mb-2">
            L&apos;upload de documents nécessite Firebase Storage. Cette fonctionnalité sera activée une fois Storage configuré.
          </p>
          <p className="font-body text-xs text-gray-400">
            Types supportés : radios, ordonnances, carnet de santé, certificats, assurance, livret, factures véto.
          </p>
        </Card>
      )}

      {/* ═══ ONGLET 5 : CHARGE DE TRAVAIL ═══ */}
      {tab === "charge" && (
        <>
          <p className="font-body text-xs text-gray-400 mb-4">
            Suivi de la charge de travail quotidienne et hebdomadaire de chaque équidé. Les données se rempliront automatiquement à partir des reprises planifiées.
          </p>
          <div className="flex flex-col gap-2">
            {chargeJour.map(c => {
              const pctJour = c.maxReprises > 0 ? Math.round((c.reprisesAujourdhui / c.maxReprises) * 100) : 0;
              const pctSemaine = c.maxHeuresHebdo > 0 ? Math.round((c.heuresSemaine / c.maxHeuresHebdo) * 100) : 0;
              return (
                <Card key={c.equideId} padding="sm" className="flex items-center gap-4">
                  <div className="font-body text-sm font-semibold text-blue-800 min-w-[100px]">{c.name}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-body text-xs text-gray-400 min-w-[80px]">Aujourd&apos;hui</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pctJour > 80 ? "bg-red-400" : pctJour > 50 ? "bg-orange-400" : "bg-green-400"}`}
                          style={{ width: `${pctJour}%` }} />
                      </div>
                      <span className="font-body text-xs font-medium text-gray-500 min-w-[60px] text-right">
                        {c.reprisesAujourdhui}/{c.maxReprises} reprises
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-body text-xs text-gray-400 min-w-[80px]">Semaine</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pctSemaine > 80 ? "bg-red-400" : pctSemaine > 50 ? "bg-orange-400" : "bg-green-400"}`}
                          style={{ width: `${pctSemaine}%` }} />
                      </div>
                      <span className="font-body text-xs font-medium text-gray-500 min-w-[60px] text-right">
                        {c.heuresSemaine}/{c.maxHeuresHebdo}h
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ ONGLET 6 : INDISPONIBILITÉS ═══ */}
      {tab === "indispos" && (
        <>
          {(() => {
            const activeIndispos = indispos.filter((i: any) => i.active);
            const pastIndispos = indispos.filter((i: any) => !i.active);
            const motifLabels: Record<string, string> = {
              blessure: "Blessure", maladie: "Maladie", repos: "Repos", marechal: "Maréchal",
              veterinaire: "Vétérinaire", formation: "Formation", competition_ext: "Compétition ext.", autre: "Autre",
            };
            const motifColors: Record<string, string> = {
              blessure: "red", maladie: "red", repos: "blue", marechal: "orange",
              veterinaire: "orange", formation: "blue", competition_ext: "purple", autre: "gray",
            };
            return (
              <>
                {activeIndispos.length > 0 && (
                  <div className="mb-6">
                    <div className="font-body text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} /> Indisponibilités en cours ({activeIndispos.length})
                    </div>
                    <div className="flex flex-col gap-2">
                      {activeIndispos.map((ind: any) => (
                        <Card key={ind.id} padding="sm" className="flex items-center gap-3 !border-red-200 !bg-red-50/30">
                          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <AlertTriangle size={18} className="text-red-500" />
                          </div>
                          <div className="flex-1">
                            <div className="font-body text-sm font-semibold text-blue-800">{ind.equideName}</div>
                            <div className="font-body text-xs text-gray-400">
                              Depuis {formatDate(ind.dateDebut)}
                              {ind.dateFin ? ` — jusqu'au ${formatDate(ind.dateFin)}` : " — durée indéterminée"}
                            </div>
                            {ind.details && <div className="font-body text-xs text-gray-400 mt-0.5">{ind.details}</div>}
                          </div>
                          <Badge color={motifColors[ind.motif] as any || "gray"}>{motifLabels[ind.motif] || ind.motif}</Badge>
                          <button onClick={async () => {
                            if (!confirm("Terminer cette indisponibilité ?")) return;
                            await updateDoc(doc(db, "indisponibilites", ind.id), { active: false, dateFin: Timestamp.now() });
                            fetchData();
                          }} className="font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                            Terminer
                          </button>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {activeIndispos.length === 0 && pastIndispos.length === 0 && (
                  <Card padding="lg" className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                      <Check size={28} className="text-green-400" />
                    </div>
                    <p className="font-body text-sm text-gray-500">Aucune indisponibilité. Tous les équidés sont disponibles.</p>
                  </Card>
                )}

                {pastIndispos.length > 0 && (
                  <div>
                    <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Historique ({pastIndispos.length})
                    </div>
                    <div className="flex flex-col gap-2">
                      {pastIndispos.sort((a: any, b: any) => {
                        const da = a.dateDebut?.toDate ? a.dateDebut.toDate() : new Date(a.dateDebut);
                        const db2 = b.dateDebut?.toDate ? b.dateDebut.toDate() : new Date(b.dateDebut);
                        return db2.getTime() - da.getTime();
                      }).slice(0, 20).map((ind: any) => (
                        <Card key={ind.id} padding="sm" className="flex items-center gap-3 opacity-60">
                          <div className="flex-1">
                            <div className="font-body text-sm font-semibold text-blue-800">{ind.equideName}</div>
                            <div className="font-body text-xs text-gray-400">
                              {formatDate(ind.dateDebut)} → {formatDate(ind.dateFin)}
                            </div>
                          </div>
                          <Badge color="gray">{motifLabels[ind.motif] || ind.motif}</Badge>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* ═══ MODAL : INDISPONIBILITÉ ═══ */}
      {showIndispoForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16" onClick={() => setShowIndispoForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Déclarer une indisponibilité</h2>
              <button onClick={() => setShowIndispoForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const equideId = fd.get("equideId") as string;
              const eq = equides.find(eq => eq.id === equideId);
              setSaving(true);
              try {
                await addDoc(collection(db, "indisponibilites"), {
                  equideId,
                  equideName: eq?.name || "",
                  dateDebut: Timestamp.fromDate(new Date(fd.get("dateDebut") as string)),
                  dateFin: fd.get("dateFin") ? Timestamp.fromDate(new Date(fd.get("dateFin") as string)) : null,
                  motif: fd.get("motif") as string,
                  details: fd.get("details") as string || "",
                  active: true,
                  createdAt: serverTimestamp(),
                });
                setShowIndispoForm(false);
                fetchData();
              } catch (err) { console.error(err); alert("Erreur"); }
              setSaving(false);
            }}>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelStyle}>Équidé *</label>
                  <select name="equideId" required className={inputStyle}>
                    {equides.filter(e => e.status !== "sorti").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Date de début *</label>
                    <input type="date" name="dateDebut" required defaultValue={new Date().toISOString().split("T")[0]} className={inputStyle} />
                  </div>
                  <div>
                    <label className={labelStyle}>Date de fin</label>
                    <input type="date" name="dateFin" className={inputStyle} />
                    <p className="font-body text-xs text-gray-300 mt-1">Laisser vide si indéterminé</p>
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Motif *</label>
                  <select name="motif" required className={inputStyle}>
                    <option value="blessure">Blessure</option>
                    <option value="maladie">Maladie</option>
                    <option value="repos">Repos</option>
                    <option value="marechal">Maréchal-ferrant</option>
                    <option value="veterinaire">Vétérinaire</option>
                    <option value="formation">Formation</option>
                    <option value="competition_ext">Compétition extérieure</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Détails</label>
                  <textarea name="details" className={inputStyle + " !h-16 resize-none"} placeholder="Précisions..." />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                <button type="button" onClick={() => setShowIndispoForm(false)} className={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving} className={`${btnPrimary} ${saving ? "opacity-50" : ""}`}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* MODAL : FORMULAIRE ÉQUIDÉ                  */}
      {/* ═══════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">
                {editingId ? `Modifier ${form.name}` : "Nouvel équidé"}
              </h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
              {/* Identité */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Identité</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelStyle}>Nom *</label>
                    <input className={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sircee" />
                  </div>
                  <div>
                    <label className={labelStyle}>Type</label>
                    <select className={inputStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EquideType })}>
                      {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Sexe</label>
                    <select className={inputStyle} value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value as EquideSex })}>
                      {sexOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Robe</label>
                    <select className={inputStyle} value={form.robe} onChange={e => setForm({ ...form, robe: e.target.value })}>
                      {robesList.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Race</label>
                    <input className={inputStyle} value={form.race} onChange={e => setForm({ ...form, race: e.target.value })} placeholder="Ex: Connemara" />
                  </div>
                  <div>
                    <label className={labelStyle}>Date de naissance</label>
                    <input type="date" className={inputStyle} value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelStyle}>Toise (cm)</label>
                    <input type="number" className={inputStyle} value={form.toise} onChange={e => setForm({ ...form, toise: e.target.value })} placeholder="Ex: 148" />
                  </div>
                  <div>
                    <label className={labelStyle}>N° SIRE</label>
                    <input className={inputStyle} value={form.sire} onChange={e => setForm({ ...form, sire: e.target.value })} placeholder="Ex: 12345678A" />
                  </div>
                  <div>
                    <label className={labelStyle}>N° Puce</label>
                    <input className={inputStyle} value={form.puce} onChange={e => setForm({ ...form, puce: e.target.value })} placeholder="N° transpondeur" />
                  </div>
                </div>
              </div>

              {/* Provenance */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Provenance & propriété</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Provenance</label>
                    <select className={inputStyle} value={form.provenance} onChange={e => setForm({ ...form, provenance: e.target.value })}>
                      {["Achat", "Naissance", "Prêt", "Don", "Demi-pension", "Autre"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Propriétaire</label>
                    <input className={inputStyle} value={form.proprietaire} onChange={e => setForm({ ...form, proprietaire: e.target.value })} placeholder="Centre ou nom" />
                  </div>
                  <div>
                    <label className={labelStyle}>Date d&apos;arrivée</label>
                    <input type="date" className={inputStyle} value={form.dateArrivee} onChange={e => setForm({ ...form, dateArrivee: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelStyle}>Statut</label>
                    <select className={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as EquideStatus })}>
                      {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Travail */}
              <div>
                <div className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Travail & aptitudes</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Niveau cavalier</label>
                    <select className={inputStyle} value={form.niveauCavalier} onChange={e => setForm({ ...form, niveauCavalier: e.target.value })}>
                      {niveauOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Max reprises / jour</label>
                    <input type="number" min={1} max={6} className={inputStyle} value={form.maxReprisesPerDay}
                      onChange={e => setForm({ ...form, maxReprisesPerDay: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelStyle}>Max heures / semaine</label>
                    <input type="number" min={1} max={40} className={inputStyle} value={form.maxHeuresHebdo}
                      onChange={e => setForm({ ...form, maxHeuresHebdo: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelStyle}>Disciplines</label>
                  <div className="flex flex-wrap gap-2">
                    {disciplinesList.map(d => (
                      <button key={d}
                        className={`font-body text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
                          form.disciplines.includes(d)
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                        }`}
                        onClick={() => setForm({
                          ...form,
                          disciplines: form.disciplines.includes(d)
                            ? form.disciplines.filter(x => x !== d)
                            : [...form.disciplines, d]
                        })}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelStyle}>Tempérament / Notes</label>
                  <textarea className={inputStyle + " !h-20 resize-none"} value={form.temperament}
                    onChange={e => setForm({ ...form, temperament: e.target.value })}
                    placeholder="Ex: Calme, patient avec les débutants. Peut être vif au galop." />
                </div>
                <div className="mt-3">
                  <label className={labelStyle}>Notes libres</label>
                  <textarea className={inputStyle + " !h-16 resize-none"} value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Informations complémentaires…" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className={btnSecondary}>Annuler</button>
              <button onClick={saveEquide} disabled={saving || !form.name.trim()} className={`${btnPrimary} ${(saving || !form.name.trim()) ? "opacity-50 cursor-not-allowed" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingId ? "Enregistrer" : "Créer l'équidé"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* MODAL : FORMULAIRE SOIN                    */}
      {/* ═══════════════════════════════════════════ */}
      {showSoinForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16" onClick={() => setShowSoinForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Enregistrer un soin</h2>
              <button onClick={() => setShowSoinForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelStyle}>Équidé *</label>
                <select className={inputStyle} value={soinForm.equideId} onChange={e => setSoinForm({ ...soinForm, equideId: e.target.value })}>
                  {equides.filter(e => e.status !== "sorti").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Type de soin</label>
                  <select className={inputStyle} value={soinForm.type} onChange={e => {
                    const t = e.target.value as SoinType;
                    const opt = soinTypeOptions.find(o => o.value === t);
                    const nextDate = opt && opt.recurrence > 0
                      ? new Date(Date.now() + opt.recurrence * 86400000).toISOString().split("T")[0]
                      : "";
                    setSoinForm({ ...soinForm, type: t, label: opt?.label || "", prochainRdv: nextDate });
                  }}>
                    {soinTypeOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Date du soin</label>
                  <input type="date" className={inputStyle} value={soinForm.date} onChange={e => setSoinForm({ ...soinForm, date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelStyle}>Détail</label>
                <input className={inputStyle} value={soinForm.label} onChange={e => setSoinForm({ ...soinForm, label: e.target.value })} placeholder="Ex: Equest Pramox, Vaccin grippe…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Prochain RDV</label>
                  <input type="date" className={inputStyle} value={soinForm.prochainRdv} onChange={e => setSoinForm({ ...soinForm, prochainRdv: e.target.value })} />
                  <p className="font-body text-xs text-gray-300 mt-1">Pré-rempli selon le type de soin</p>
                </div>
                <div>
                  <label className={labelStyle}>Praticien</label>
                  <input className={inputStyle} value={soinForm.praticien} onChange={e => setSoinForm({ ...soinForm, praticien: e.target.value })} placeholder="Nom du véto, maréchal…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Coût (€)</label>
                  <input type="number" className={inputStyle} value={soinForm.cout} onChange={e => setSoinForm({ ...soinForm, cout: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={labelStyle}>Observations</label>
                <textarea className={inputStyle + " !h-16 resize-none"} value={soinForm.observations}
                  onChange={e => setSoinForm({ ...soinForm, observations: e.target.value })} placeholder="Remarques éventuelles…" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowSoinForm(false)} className={btnSecondary}>Annuler</button>
              <button onClick={saveSoin} disabled={saving || !soinForm.equideId} className={`${btnPrimary} ${saving ? "opacity-50" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* MODAL : MOUVEMENT REGISTRE                 */}
      {/* ═══════════════════════════════════════════ */}
      {showMouvForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16" onClick={() => setShowMouvForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Nouveau mouvement</h2>
              <button onClick={() => setShowMouvForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Équidé</label>
                  <select className={inputStyle} value={mouvForm.equideId} onChange={e => setMouvForm({ ...mouvForm, equideId: e.target.value })}>
                    <option value="">— Nouveau —</option>
                    {equides.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Type</label>
                  <select className={inputStyle} value={mouvForm.type} onChange={e => setMouvForm({ ...mouvForm, type: e.target.value as any })}>
                    <option value="entree">Entrée</option>
                    <option value="sortie">Sortie</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Date</label>
                  <input type="date" className={inputStyle} value={mouvForm.date} onChange={e => setMouvForm({ ...mouvForm, date: e.target.value })} />
                </div>
                <div>
                  <label className={labelStyle}>Motif</label>
                  <select className={inputStyle} value={mouvForm.motif} onChange={e => setMouvForm({ ...mouvForm, motif: e.target.value })}>
                    {mouvForm.type === "entree"
                      ? ["Achat", "Naissance", "Prêt", "Demi-pension", "Don", "Retour"].map(m => <option key={m} value={m}>{m}</option>)
                      : ["Vente", "Retraite", "Décès", "Prêt extérieur", "Fin demi-pension", "Autre"].map(m => <option key={m} value={m}>{m}</option>)
                    }
                  </select>
                </div>
              </div>
              {mouvForm.type === "entree" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Provenance</label>
                    <input className={inputStyle} value={mouvForm.provenance} onChange={e => setMouvForm({ ...mouvForm, provenance: e.target.value })} placeholder="D'où vient-il ?" />
                  </div>
                  <div>
                    <label className={labelStyle}>Prix d&apos;achat (€)</label>
                    <input type="number" className={inputStyle} value={mouvForm.prixAchat} onChange={e => setMouvForm({ ...mouvForm, prixAchat: e.target.value })} />
                  </div>
                </div>
              )}
              {mouvForm.type === "sortie" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Destination</label>
                    <input className={inputStyle} value={mouvForm.destination} onChange={e => setMouvForm({ ...mouvForm, destination: e.target.value })} placeholder="Où va-t-il ?" />
                  </div>
                  <div>
                    <label className={labelStyle}>Prix de vente (€)</label>
                    <input type="number" className={inputStyle} value={mouvForm.prixVente} onChange={e => setMouvForm({ ...mouvForm, prixVente: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <label className={labelStyle}>Observations</label>
                <textarea className={inputStyle + " !h-16 resize-none"} value={mouvForm.observations}
                  onChange={e => setMouvForm({ ...mouvForm, observations: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowMouvForm(false)} className={btnSecondary}>Annuler</button>
              <button onClick={saveMouvement} disabled={saving} className={`${btnPrimary} ${saving ? "opacity-50" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
