"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Card } from "@/components/ui";
import { Plus, Loader2, Heart, AlertTriangle } from "lucide-react";
import type { Equide, SoinRecord, MouvementRegistre, DocumentEquide } from "./types";

// Composants onglets
import TabFiches from "./components/TabFiches";
import TabRegistre from "./components/TabRegistre";
import TabSoins from "./components/TabSoins";
import TabDocuments from "./components/TabDocuments";
import TabCharge from "./components/TabCharge";
import TabIndispos from "./components/TabIndispos";
import TabOrdre from "./components/TabOrdre";
import MouvementModal from "./components/MouvementModal";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysUntil = (d: any) => {
  if (!d) return 9999;
  const target = d?.toDate ? d.toDate() : new Date(d);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
};

type TabId = "fiches" | "registre" | "soins" | "documents" | "charge" | "indispos" | "ordre";

export default function CavaleriePage() {
  const { setAgentContext } = useAgentContext("cavalerie");
  useEffect(() => { setAgentContext({ module_actif: "cavalerie", description: "équidés, soins, disponibilités" }); }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [equides, setEquides] = useState<Equide[]>([]);
  const [soins, setSoins] = useState<SoinRecord[]>([]);
  const [mouvements, setMouvements] = useState<MouvementRegistre[]>([]);
  const [documents, setDocuments] = useState<DocumentEquide[]>([]);
  const [indispos, setIndispos] = useState<any[]>([]);
  const [creneauxCharge, setCreneauxCharge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabId>("fiches");
  const [showEquideForm, setShowEquideForm] = useState(false);
  const [editingEquide, setEditingEquide] = useState<Equide | null>(null);
  const [showSoinForm, setShowSoinForm] = useState(false);
  const [soinDefaultEquideId, setSoinDefaultEquideId] = useState<string | undefined>();
  const [showMouvForm, setShowMouvForm] = useState(false);
  const [showIndispoForm, setShowIndispoForm] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const dow = new Date().getDay();
      const monday = new Date(); monday.setDate(monday.getDate() - ((dow + 6) % 7));
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);

      const [eSnap, sSnap, mSnap, dSnap, iSnap, cSnap] = await Promise.all([
        getDocs(collection(db, "equides")),
        getDocs(collection(db, "soins")),
        getDocs(collection(db, "mouvements_registre")),
        getDocs(collection(db, "documents_equide")),
        getDocs(collection(db, "indisponibilites")),
        getDocs(query(collection(db, "creneaux"), where("date", ">=", fmtDate(monday)), where("date", "<=", fmtDate(sunday)))),
      ]);
      setEquides(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Equide)));
      setSoins(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoinRecord)));
      setMouvements(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MouvementRegistre)));
      setDocuments(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentEquide)));
      setIndispos(iSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCreneauxCharge(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Erreur chargement cavalerie:", e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Calculs ───────────────────────────────────────────────────────────────
  const nbAlertes = useMemo(() =>
    soins.filter(s => s.prochainRdv && daysUntil(s.prochainRdv) <= 14).length
  , [soins]);

  const chargeJour = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return equides.filter(e => e.status === "actif").map(e => {
      let reprisesAujourdhui = 0;
      creneauxCharge.filter(c => c.date === today).forEach(c => {
        (c.enrolled || []).forEach((en: any) => { if (en.horseName === e.name) reprisesAujourdhui++; });
      });
      let minutesSemaine = 0;
      creneauxCharge.forEach(c => {
        if ((c.enrolled || []).some((en: any) => en.horseName === e.name) && c.startTime && c.endTime) {
          const [sh, sm] = c.startTime.split(":").map(Number);
          const [eh, em] = c.endTime.split(":").map(Number);
          minutesSemaine += (eh * 60 + em) - (sh * 60 + sm);
        }
      });
      return { equideId: e.id, name: e.name, maxReprises: e.maxReprisesPerDay, maxHeuresHebdo: e.maxHeuresHebdo, reprisesAujourdhui, heuresSemaine: Math.round(minutesSemaine / 60 * 10) / 10 };
    });
  }, [equides, creneauxCharge]);

  const nbActifs = equides.filter(e => e.status === "actif").length;
  const nbIndispo = equides.filter(e => e.status === "indisponible").length;
  const nbFormation = equides.filter(e => e.status === "en_formation").length;

  // ── Onglets ───────────────────────────────────────────────────────────────
  const TABS = [
    { id: "fiches" as TabId, label: "Fiches équidés", count: equides.length },
    { id: "registre" as TabId, label: "Registre", count: mouvements.length },
    { id: "soins" as TabId, label: "Soins & alertes", count: nbAlertes || undefined, alert: nbAlertes > 0 },
    { id: "documents" as TabId, label: "Documents", count: documents.length },
    { id: "charge" as TabId, label: "Charge de travail" },
    { id: "indispos" as TabId, label: "Indisponibilités", count: indispos.filter((i: any) => i.active).length || undefined },
    { id: "ordre" as TabId, label: "Ordre montoir TV" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500"/>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Cavalerie</h1>
        <div className="flex gap-2">
          {tab === "fiches" && (
            <button onClick={() => { setEditingEquide(null); setShowEquideForm(true); }}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
              <Plus size={16}/> Nouvel équidé
            </button>
          )}
          {tab === "soins" && (
            <button onClick={() => { setSoinDefaultEquideId(undefined); setShowSoinForm(true); }}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
              <Plus size={16}/> Enregistrer un soin
            </button>
          )}
          {tab === "registre" && (
            <button onClick={() => setShowMouvForm(true)}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
              <Plus size={16}/> Nouveau mouvement
            </button>
          )}
          {tab === "indispos" && (
            <button onClick={() => setShowIndispoForm(true)}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-red-500 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-red-600">
              <Plus size={16}/> Déclarer une indisponibilité
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Heart, label: "Actifs", value: nbActifs, color: "text-green-600 bg-green-50" },
          { icon: AlertTriangle, label: "En formation", value: nbFormation, color: "text-blue-500 bg-blue-50" },
          { icon: AlertTriangle, label: "Indisponibles", value: nbIndispo, color: "text-orange-500 bg-orange-50" },
          { icon: AlertTriangle, label: "Alertes soins", value: nbAlertes, color: nbAlertes > 0 ? "text-red-500 bg-red-50" : "text-gray-400 bg-gray-50" },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} padding="sm" className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.split(" ")[1]}`}>
              <Icon size={18} className={color.split(" ")[0]}/>
            </div>
            <div>
              <div className={`font-body text-xl font-bold ${color.split(" ")[0]}`}>{value}</div>
              <div className="font-body text-xs text-slate-500">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-body text-sm cursor-pointer transition-all ${tab === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${tab === t.id ? "bg-white/20 text-white" : t.alert ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === "fiches" && (
        <TabFiches
          equides={equides} soins={soins} documents={documents} mouvements={mouvements}
          showForm={showEquideForm} editingEquide={editingEquide}
          onCloseForm={() => { setShowEquideForm(false); setEditingEquide(null); }}
          onRefresh={fetchData}
          onOpenSoinForm={equideId => { setSoinDefaultEquideId(equideId); setShowSoinForm(true); }}
        />
      )}
      {tab === "registre" && <TabRegistre mouvements={mouvements}/>}
      {tab === "soins" && (
        <TabSoins equides={equides} soins={soins} showForm={showSoinForm}
          onCloseForm={() => setShowSoinForm(false)} onRefresh={fetchData}/>
      )}
      {tab === "documents" && <TabDocuments equides={equides} documents={documents} onRefresh={fetchData}/>}
      {tab === "charge" && <TabCharge chargeJour={chargeJour}/>}
      {tab === "indispos" && (
        <TabIndispos equides={equides} indispos={indispos} showForm={showIndispoForm}
          onCloseForm={() => setShowIndispoForm(false)} onRefresh={fetchData}/>
      )}

      {/* Modal mouvement */}
      {tab === "ordre" && <TabOrdre equides={equides} onRefresh={fetchData} />}

      {showMouvForm && (
        <MouvementModal equides={equides} onClose={() => setShowMouvForm(false)} onDone={fetchData}/>
      )}
    </div>
  );
}
