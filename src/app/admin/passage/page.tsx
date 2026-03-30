"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, UserPlus, Search, Users } from "lucide-react";

interface Passage {
  id: string;
  nom: string;
  prenom: string;
  age: string;
  telephone: string;
  email: string;
  niveau: string;
  activite: string;
  prixTTC: number;
  modePaiement: string;
  ficheSanitaire: boolean;
  notes: string;
  status: string;
  createdAt: any;
}

const MODES_PAIEMENT = [
  { id: "cb_terminal", label: "💳 CB Terminal", icon: "💳" },
  { id: "especes", label: "💵 Espèces", icon: "💵" },
  { id: "cheque", label: "📝 Chèque", icon: "📝" },
  { id: "cheque_vacances", label: "🏖️ Chèques Vacances", icon: "🏖️" },
  { id: "pass_sport", label: "⚽ Pass'Sport", icon: "⚽" },
  { id: "ancv", label: "🎫 ANCV", icon: "🎫" },
];

const NIVEAUX = ["Débutant complet", "A déjà monté", "Galop 1-2", "Galop 3-4", "Galop 5+", "Cavalier confirmé"];

export default function PassagePage() {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"form" | "list">("form");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");

  // Form
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [age, setAge] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [niveau, setNiveau] = useState("Débutant complet");
  const [activite, setActivite] = useState("");
  const [prixTTC, setPrixTTC] = useState(0);
  const [modePaiement, setModePaiement] = useState("cb_terminal");
  const [ficheSanitaire, setFicheSanitaire] = useState(false);
  const [notes, setNotes] = useState("");
  const [encaisser, setEncaisser] = useState(true);

  const fetchData = async () => {
    try {
      const [passSnap, actSnap] = await Promise.all([
        getDocs(collection(db, "passages")),
        getDocs(collection(db, "activities")),
      ]);
      setPassages(passSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)) as Passage[]);
      setActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setNom(""); setPrenom(""); setAge(""); setTelephone(""); setEmail("");
    setNiveau("Débutant complet"); setActivite(""); setPrixTTC(0);
    setModePaiement("cb_terminal"); setFicheSanitaire(false); setNotes(""); setEncaisser(true);
  };

  const handleSubmit = async () => {
    if (!nom || !prenom) return;
    setSaving(true);
    try {
      const entry: any = {
        nom, prenom, age, telephone, email, niveau, activite,
        prixTTC: encaisser ? prixTTC : 0,
        modePaiement: encaisser ? modePaiement : "non_encaisse",
        ficheSanitaire, notes,
        status: encaisser ? "paid" : "pending",
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "passages"), entry);

      // Also create a payment record if encaissement
      if (encaisser && prixTTC > 0) {
        const tvaRate = 0.055;
        const ht = prixTTC / (1 + tvaRate);
        await addDoc(collection(db, "payments"), {
          familyId: "passage",
          familyName: `${prenom} ${nom} (passage)`,
          childName: prenom,
          items: [{ label: activite || "Activité cavalier de passage", priceTTC: prixTTC, priceHT: Math.round(ht * 100) / 100, tvaRate: 5.5 }],
          totalTTC: prixTTC,
          totalHT: Math.round(ht * 100) / 100,
          totalTVA: Math.round((prixTTC - ht) * 100) / 100,
          paymentMode: modePaiement,
          paymentMethod: modePaiement, // rétro-compatibilité
          status: "paid",
          source: "passage",
          createdAt: serverTimestamp(),
        });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      resetForm();
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleActivityChange = (actId: string) => {
    setActivite(actId);
    const act = activities.find(a => a.id === actId);
    if (act) setPrixTTC(act.priceTTC || act.priceHT * (1 + (act.tvaRate || 5.5) / 100) || 0);
  };

  const filtered = passages.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.nom?.toLowerCase().includes(q) || p.prenom?.toLowerCase().includes(q) || p.telephone?.includes(q);
  });

  const todayCount = passages.filter(p => {
    if (!p.createdAt?.seconds) return false;
    const d = new Date(p.createdAt.seconds * 1000);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Cavaliers de passage</h1>
          <p className="font-body text-xs text-gray-400">Inscription et facturation rapide pour les touristes et visiteurs ponctuels</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><UserPlus size={20} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{todayCount}</div><div className="font-body text-xs text-gray-400">aujourd&apos;hui</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Users size={20} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{passages.length}</div><div className="font-body text-xs text-gray-400">total passages</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center"><span className="text-lg">💰</span></div>
          <div><div className="font-body text-xl font-bold text-gold-500">{passages.filter(p => p.status === "paid").reduce((s, p) => s + (p.prixTTC || 0), 0)}€</div><div className="font-body text-xs text-gray-400">encaissé</div></div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: "form" as const, l: "Inscription rapide" }, { id: "list" as const, l: `Historique (${passages.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${tab === t.id ? "text-white bg-blue-500" : "text-gray-500 bg-white border border-gray-200"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "form" && (
        <Card padding="md">
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 font-body text-sm text-green-700 font-semibold">
              ✅ Cavalier de passage inscrit avec succès !
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {[
              { label: "Nom *", value: nom, set: setNom, ph: "Nom de famille" },
              { label: "Prénom *", value: prenom, set: setPrenom, ph: "Prénom" },
              { label: "Âge", value: age, set: setAge, ph: "Ex: 12" },
              { label: "Téléphone", value: telephone, set: setTelephone, ph: "06..." },
              { label: "Email", value: email, set: setEmail, ph: "email@example.com" },
            ].map(f => (
              <div key={f.label}>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Niveau équestre</label>
              <select value={niveau} onChange={e => setNiveau(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none">
                {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Activité</label>
            <select value={activite} onChange={e => handleActivityChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none">
              <option value="">Sélectionner une activité...</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.title} — {a.priceTTC || "?"}€</option>)}
              <option value="custom">Tarif personnalisé</option>
            </select>
          </div>

          {activite === "custom" && (
            <div className="mb-4">
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix TTC (€)</label>
              <input type="number" value={prixTTC} onChange={e => setPrixTTC(Number(e.target.value))}
                className="w-32 px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
          )}

          <div className="mb-4">
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Remarques, allergies, informations complémentaires..."
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none resize-vertical" />
          </div>

          <div className="flex flex-col gap-3 mb-5">
            <label className="flex items-center gap-2 font-body text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={ficheSanitaire} onChange={e => setFicheSanitaire(e.target.checked)} className="accent-blue-500 w-4 h-4" />
              Fiche sanitaire remplie et autorisation parentale signée (si mineur)
            </label>
            <label className="flex items-center gap-2 font-body text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={encaisser} onChange={e => setEncaisser(e.target.checked)} className="accent-blue-500 w-4 h-4" />
              Encaisser maintenant {prixTTC > 0 && `(${prixTTC}€)`}
            </label>
          </div>

          {encaisser && (
            <div className="mb-5">
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Mode de paiement</label>
              <div className="flex flex-wrap gap-2">
                {MODES_PAIEMENT.map(m => (
                  <button key={m.id} onClick={() => setModePaiement(m.id)}
                    className={`font-body text-xs font-semibold px-4 py-2 rounded-lg border-none cursor-pointer transition-colors ${modePaiement === m.id ? "text-white bg-blue-500" : "text-gray-600 bg-gray-100 hover:bg-gray-200"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!nom || !prenom || saving}
              className="font-body text-sm font-semibold text-white bg-blue-500 px-6 py-3 rounded-xl border-none cursor-pointer disabled:opacity-40 hover:bg-blue-400 transition-colors">
              {saving ? "Enregistrement..." : encaisser ? "Inscrire et facturer" : "Inscrire sans paiement"}
            </button>
            <button onClick={resetForm} className="font-body text-sm text-gray-500 bg-white px-6 py-3 rounded-xl border border-gray-200 cursor-pointer">Réinitialiser</button>
          </div>
        </Card>
      )}

      {tab === "list" && (
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input data-testid="family-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
          </div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          filtered.length === 0 ? <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucun cavalier de passage.</p></Card> :
          <Card className="overflow-hidden">
            <div className="flex px-4 py-2.5 bg-sand border-b border-blue-500/8 font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="flex-1">Cavalier</span><span className="w-24">Âge</span><span className="w-32">Niveau</span><span className="w-32">Activité</span><span className="w-20 text-right">Prix</span><span className="w-24 text-center">Statut</span>
            </div>
            {filtered.map(p => (
              <div key={p.id} className="flex items-center px-4 py-3 border-b border-blue-500/8 font-body text-sm">
                <span className="flex-1"><span className="font-semibold text-blue-800">{p.prenom} {p.nom}</span>{p.telephone && <span className="text-gray-400 text-xs ml-2">{p.telephone}</span>}</span>
                <span className="w-24 text-gray-500">{p.age || "—"}</span>
                <span className="w-32 text-gray-500 text-xs">{p.niveau}</span>
                <span className="w-32 text-gray-500 text-xs truncate">{activities.find(a => a.id === p.activite)?.title || p.activite || "—"}</span>
                <span className="w-20 text-right font-semibold text-blue-800">{p.prixTTC ? `${p.prixTTC}€` : "—"}</span>
                <span className="w-24 text-center"><Badge color={p.status === "paid" ? "green" : "orange"}>{p.status === "paid" ? "Réglé" : "À régler"}</Badge></span>
              </div>
            ))}
          </Card>}
        </div>
      )}
    </div>
  );
}
