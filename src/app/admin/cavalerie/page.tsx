"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Card } from "@/components/ui";
import { Plus, Loader2, Heart, AlertTriangle } from "lucide-react";
import type { Equide, SoinRecord, MouvementRegistre, DocumentEquide } from "./types";

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
  useEffect(() => {
    setAgentContext({ module_actif: "cavalerie", description: "équidés, soins, disponibilités" });
  }, []);

  const [equides, setEquides] = useState<Equide[]>([]);
  const [soins, setSoins] = useState<SoinRecord[]>([]);
  const [mouvements, setMouvements] = useState<MouvementRegistre[]>([]);
  const [documents, setDocuments] = useState<DocumentEquide[]>([]);
  const [indispos, setIndispos] = useState<any[]>([]);
  const [creneauxCharge, setCreneauxCharge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<TabId>("fiches");
  const [showEquideForm, setShowEquideForm] = useState(false);
  const [editingEquide, setEditingEquide] = useState<Equide | null>(null);
  const [showSoinForm, setShowSoinForm] = useState(false);
  const [soinDefaultEquideId, setSoinDefaultEquideId] = useState<string | undefined>();
  const [showMouvForm, setShowMouvForm] = useState(false);
  const [showIndispoForm, setShowIndispoForm] = useState(false);

  const fetchData = async () => {
    try {
      const dow = new Date().getDay();
      const monday = new Date();
      monday.setDate(monday.getDate() - ((dow + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

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
    } catch (e) {
      console.error("Erreur chargement cavalerie:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const nbAlertes = useMemo(
    () => soins.filter(s => s.prochainRdv && daysUntil(s.prochainRdv) <= 14).length,
    [soins]
  );

  const chargeJour = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return equides.filter(e => e.status === "actif").map(e => {
      let reprisesAujourdhui = 0;
      creneauxCharge.filter(c => c.date === today).forEach(c => {
        (c.enrolled || []).forEach((en: any) => {
          if (en.horseName === e.name) reprisesAujourdhui++;
        });
      });
      let minutesSemaine = 0;
      creneauxCharge.forEach(c => {
        if ((c.enrolled || []).some((en: any) => en.horseName === e.name) && c.startTime && c.endTime) {
          const [sh, sm] = c.startTime.split(":").map(Number);
          const [eh, em] = c.endTime.split(":").map(Number);
          minutesSemaine += (eh * 60 + em) - (sh * 60 + sm);
        }
      });
      return {
        equideId: e.id,
        name: e.name,
        maxReprises: e.maxReprisesPerDay,
        maxHeuresHebdo: e.maxHeuresHebdo,
        reprisesAujourdhui,
        heuresSemaine: Math.round(minutesSemaine / 60 * 10) / 10,
      };
    });
  }, [equides, creneauxCharge]);

  const nbActifs = equides.filter(e => e.status === "actif").length;
  const nbIndispo = equides.filter(e => e.status === "indisponible").length;
  const nbFormation = equides.filter(e => e.status === "en_formation").length;

  const TABS = [
    { id: "fiches" as TabId, label: "Fiches équidés", count: equides.length },
    { id: "registre" as TabId, label: "Registre", count: mouvements.length },
    { id: "soins" as TabId, label: "Soins & alertes", count: nbAlertes || undefined, alert: nbAlertes > 0 },
    { id: "documents" as TabId, label: "Documents", count: documents.length },
    { id: "charge" as TabId, label: "Charge de travail" },
    { id: "indispos" as TabId, label: "Indisponibilités", count: indispos.filter((i: any) => i.active).length || undefined },
    { id: "ordre" as TabId, label: "Ordre montoir TV" },
  ];

  const primaryAction = () => {
    if (tab === "fiches") {
      return (
        <button
          onClick={() => { setEditingEquide(null); setShowEquideForm(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-none bg-blue-600 px-5 py-3 font-body text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={17} /> Nouvel équidé
        </button>
      );
    }
    if (tab === "soins") {
      return (
        <button
          onClick={() => { setSoinDefaultEquideId(undefined); setShowSoinForm(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-none bg-blue-600 px-5 py-3 font-body text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={17} /> Enregistrer un soin
        </button>
      );
    }
    if (tab === "registre") {
      return (
        <button
          onClick={() => setShowMouvForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-none bg-blue-600 px-5 py-3 font-body text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={17} /> Nouveau mouvement
        </button>
      );
    }
    if (tab === "indispos") {
      return (
        <button
          onClick={() => setShowIndispoForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-none bg-red-600 px-5 py-3 font-body text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
        >
          <Plus size={17} /> Déclarer une indisponibilité
        </button>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 font-body text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Terrain</div>
          <h1 className="font-display text-2xl font-bold text-blue-800 md:text-3xl">Cavalerie</h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-gray-500">
            Fiches, santé, charge de travail et disponibilités des chevaux et poneys.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row">{primaryAction()}</div>
      </div>

      {nbAlertes > 0 && (
        <button
          type="button"
          onClick={() => setTab("soins")}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5 text-left transition-colors hover:bg-red-100"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-red-500 shadow-sm">
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-body text-sm font-bold text-red-700">
              {nbAlertes} soin{nbAlertes > 1 ? "s" : ""} à anticiper
            </div>
            <div className="font-body text-xs text-red-600/75">Échéance dans les quatorze prochains jours.</div>
          </div>
          <span className="hidden font-body text-xs font-bold text-red-700 sm:inline">Voir les alertes →</span>
        </button>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { icon: Heart, label: "Équidés actifs", value: nbActifs, color: "text-green-600 bg-green-50", detail: "disponibles au travail" },
          { icon: AlertTriangle, label: "En formation", value: nbFormation, color: "text-blue-600 bg-blue-50", detail: "en progression" },
          { icon: AlertTriangle, label: "Indisponibles", value: nbIndispo, color: "text-orange-600 bg-orange-50", detail: "à ne pas affecter" },
          { icon: AlertTriangle, label: "Alertes soins", value: nbAlertes, color: nbAlertes > 0 ? "text-red-600 bg-red-50" : "text-gray-500 bg-gray-50", detail: "dans les 14 jours" },
        ].map(({ icon: Icon, label, value, color, detail }) => {
          const [textColor, backgroundColor] = color.split(" ");
          return (
            <Card key={label} padding="sm" className="!rounded-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`font-display text-2xl font-bold ${textColor}`}>{value}</div>
                  <div className="mt-0.5 font-body text-xs font-bold text-blue-900">{label}</div>
                  <div className="mt-1 hidden font-body text-[11px] text-gray-400 sm:block">{detail}</div>
                </div>
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${backgroundColor}`}>
                  <Icon size={18} className={textColor} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_5px_24px_rgba(12,26,46,0.035)]">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 font-body text-xs font-semibold transition-all sm:text-sm ${
                tab === t.id
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-transparent bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                  tab === t.id
                    ? "bg-white/20 text-white"
                    : t.alert
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-500"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "fiches" && (
        <TabFiches
          equides={equides}
          soins={soins}
          documents={documents}
          mouvements={mouvements}
          showForm={showEquideForm}
          editingEquide={editingEquide}
          onCloseForm={() => { setShowEquideForm(false); setEditingEquide(null); }}
          onRefresh={fetchData}
          onOpenSoinForm={equideId => { setSoinDefaultEquideId(equideId); setShowSoinForm(true); setTab("soins"); }}
          onEdit={equide => { setEditingEquide(equide); setShowEquideForm(true); }}
        />
      )}
      {tab === "registre" && <TabRegistre mouvements={mouvements} />}
      {tab === "soins" && (
        <TabSoins
          equides={equides}
          soins={soins}
          showForm={showSoinForm}
          onCloseForm={() => setShowSoinForm(false)}
          onRefresh={fetchData}
        />
      )}
      {tab === "documents" && <TabDocuments equides={equides} documents={documents} onRefresh={fetchData} />}
      {tab === "charge" && <TabCharge chargeJour={chargeJour} />}
      {tab === "indispos" && (
        <TabIndispos
          equides={equides}
          indispos={indispos}
          showForm={showIndispoForm}
          onCloseForm={() => setShowIndispoForm(false)}
          onRefresh={fetchData}
        />
      )}
      {tab === "ordre" && <TabOrdre equides={equides} onRefresh={fetchData} />}

      {showMouvForm && (
        <MouvementModal equides={equides} onClose={() => setShowMouvForm(false)} onDone={fetchData} />
      )}
    </div>
  );
}
