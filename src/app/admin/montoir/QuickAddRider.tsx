"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { enrollChildInCreneau, createReservation } from "@/lib/planning-services";
import { generateOrderId } from "@/lib/utils";
import { X, Search, Loader2 } from "lucide-react";

const OFFERT_REASONS = [
  { value: "Rattrapage", label: "Rattrapage (météo, absence moniteur...)" },
  { value: "Essai", label: "Séance d'essai" },
  { value: "Monte poney", label: "Monte d'un jeune poney" },
  { value: "Geste commercial", label: "Geste commercial" },
  { value: "Bénévole", label: "Contrepartie bénévolat" },
  { value: "Autre", label: "Autre" },
];

type Child = { childId: string; childName: string; familyId: string; familyName: string };

interface Props {
  creneau: any;
  families: any[];
  cartes: any[];
  forfaits: any[];
  onClose: () => void;
  onDone: (msg: string) => void;
}

export default function QuickAddRider({ creneau, families, cartes, forfaits, onClose, onDone }: Props) {
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Child | null>(null);
  const [rattrapages, setRattrapages] = useState<any[]>([]);
  const [loadingR, setLoadingR] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [offertMode, setOffertMode] = useState(false);
  const [offertReason, setOffertReason] = useState("Rattrapage");

  const isCours = ["cours", "cours_collectif", "cours_particulier"].includes(creneau.activityType);
  const isBalade = ["balade", "promenade", "ponyride"].includes(creneau.activityType);
  const enrolled = creneau.enrolled || [];
  const placesLeft = (creneau.maxPlaces || 0) - enrolled.length;

  // Liste de cavaliers correspondant à la recherche (parmi les familles)
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Child[] = [];
    for (const f of families) {
      const fid = f.id || f.firestoreId;
      for (const ch of (f.children || [])) {
        if (ch.status === "sorti" || ch.status === "deces") continue;
        const name = `${ch.firstName || ""} ${ch.lastName || ""}`.trim() || ch.name || "—";
        if (name.toLowerCase().includes(q) || (f.parentName || "").toLowerCase().includes(q)) {
          out.push({ childId: ch.id, childName: name, familyId: fid, familyName: f.parentName || "—" });
        }
      }
    }
    return out.slice(0, 12);
  }, [search, families]);

  // Quand un cavalier est choisi → charger ses rattrapages en attente
  useEffect(() => {
    if (!sel) { setRattrapages([]); return; }
    setLoadingR(true);
    getDocs(query(collection(db, "rattrapages"), where("childId", "==", sel.childId), where("status", "==", "pending")))
      .then(snap => setRattrapages(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setRattrapages([]))
      .finally(() => setLoadingR(false));
  }, [sel]);

  // Détection carte active compatible
  const carteActive = useMemo(() => {
    if (!sel) return null;
    return cartes.find((c: any) => {
      if (c.status !== "active" || (c.remainingSessions || 0) <= 0) return false;
      if (c.dateFin && new Date(c.dateFin) < new Date()) return false;
      if (c.familiale) { if (c.familyId !== sel.familyId) return false; }
      else { if (c.childId !== sel.childId) return false; }
      const ct = c.activityType || "cours";
      return (ct === "cours" && isCours) || (ct === "balade" && isBalade);
    }) || null;
  }, [sel, cartes, isCours, isBalade]);

  // Détection forfait actif compatible (même logique que le planning, slotKey inclus)
  const forfaitActif = useMemo(() => {
    if (!sel) return null;
    const currentSlotKey = `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
    return forfaits.find((f: any) => {
      if (f.childId !== sel.childId || f.status !== "actif") return false;
      const ft = f.activityType || "cours";
      const typeMatch = ft === "all" || (ft === "cours" && isCours) || (ft === "balade" && isBalade);
      if (!typeMatch) return false;
      // Si le forfait est rattaché à un créneau précis, il doit correspondre exactement
      if (f.slotKey && f.slotKey !== currentSlotKey) return false;
      return true;
    }) || null;
  }, [sel, forfaits, isCours, isBalade, creneau]);

  const rattrapage = rattrapages[0] || null;

  const dejaInscrit = sel ? enrolled.some((e: any) => e.childId === sel.childId) : false;

  // Inscription avec la source choisie
  const enroll = async (source: "forfait" | "carte" | "rattrapage" | "regler" | "offert" | "etablissement") => {
    if (!sel) return;
    if (dejaInscrit) { setError("Ce cavalier est déjà inscrit sur ce créneau."); return; }
    if (placesLeft <= 0) { setError("Plus de place disponible sur ce créneau."); return; }
    setSaving(true); setError("");
    try {
      const base: any = {
        childId: sel.childId, childName: sel.childName,
        familyId: sel.familyId, familyName: sel.familyName,
        enrolledAt: new Date().toISOString(),
      };
      if (source === "forfait") base.paymentSource = "forfait";
      if (source === "carte" && carteActive) { base.paymentSource = "card"; base.cardId = carteActive.id; }
      if (source === "rattrapage") base.paymentSource = "rattrapage";
      if (source === "offert") base.paymentSource = "offert";
      if (source === "etablissement") { base.paymentSource = "institutionnel"; base.institutional = true; }

      const ok = await enrollChildInCreneau(creneau.id, base);
      if (!ok) { setError("Inscription impossible (déjà inscrit ou créneau introuvable)."); setSaving(false); return; }

      if (source === "rattrapage" && rattrapage) {
        await updateDoc(doc(db, "rattrapages", rattrapage.id), {
          status: "used", usedOnCreneauId: creneau.id, usedOnDate: creneau.date,
        });
      }

      // Inscription offerte → paiement à 0€ avec motif (traçabilité, pas de facturation)
      if (source === "offert") {
        const priceTTC = creneau.priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
        await addDoc(collection(db, "payments"), {
          orderId: generateOrderId(),
          familyId: sel.familyId, familyName: sel.familyName,
          items: [{
            activityTitle: creneau.activityTitle, childId: sel.childId, childName: sel.childName,
            creneauId: creneau.id, activityType: creneau.activityType, date: creneau.date,
            startTime: creneau.startTime, endTime: creneau.endTime,
            priceHT: 0, tva: creneau.tvaTaux || 5.5, priceTTC: 0,
            originalPriceTTC: Math.round(priceTTC * 100) / 100,
          }],
          totalTTC: 0, paidAmount: 0,
          paymentMode: "offert", paymentRef: "", status: "paid",
          isFree: true, freeReason: offertReason,
          note: `🎁 Offert — ${offertReason} (valeur : ${priceTTC.toFixed(2)}€)`,
          date: serverTimestamp(),
        });
      }

      // Inscription établissement → trace institutionnelle (pas isFree, exclue
      // des séances offertes). L'établissement est facturé à part au forfait.
      if (source === "etablissement") {
        const priceTTC = creneau.priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
        await addDoc(collection(db, "payments"), {
          orderId: generateOrderId(),
          familyId: sel.familyId, familyName: sel.familyName,
          items: [{
            activityTitle: creneau.activityTitle, childId: sel.childId, childName: sel.childName,
            creneauId: creneau.id, activityType: creneau.activityType, date: creneau.date,
            startTime: creneau.startTime, endTime: creneau.endTime,
            priceHT: 0, tva: creneau.tvaTaux || 5.5, priceTTC: 0,
            originalPriceTTC: Math.round(priceTTC * 100) / 100,
          }],
          totalTTC: 0, paidAmount: 0,
          paymentMode: "institutionnel", paymentRef: "", status: "paid",
          isInstitutional: true, freeReason: "Établissement",
          note: `🏫 Établissement — facturé séparément (valeur indicative : ${priceTTC.toFixed(2)}€)`,
          date: serverTimestamp(),
        });
      }

      try { await createReservation(base, creneau); } catch { /* non bloquant */ }

      const label = source === "forfait" ? "forfait" : source === "carte" ? "carte de séances" : source === "rattrapage" ? "rattrapage" : source === "offert" ? `offert (${offertReason})` : source === "etablissement" ? "établissement" : "à régler";
      onDone(`${sel.childName} ajouté(e) — ${label}`);
    } catch (e) {
      console.error("Ajout cavalier montoir:", e);
      setError("Erreur lors de l'inscription.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Ajouter un cavalier</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{creneau.activityTitle} · {creneau.startTime} · {placesLeft} place{placesLeft > 1 ? "s" : ""} restante{placesLeft > 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {!sel ? (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Nom du cavalier ou de la famille…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
              </div>
              {search.trim().length < 2 ? (
                <p className="font-body text-xs text-slate-400">Tape au moins 2 lettres pour rechercher.</p>
              ) : results.length === 0 ? (
                <p className="font-body text-sm text-slate-500 italic">Aucun cavalier trouvé.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map(r => (
                    <button key={r.childId} onClick={() => { setSel(r); setError(""); }}
                      className="text-left px-3 py-2.5 rounded-lg border border-gray-100 bg-sand hover:bg-blue-50 cursor-pointer">
                      <span className="font-body text-sm font-semibold text-blue-800">{r.childName}</span>
                      <span className="font-body text-xs text-slate-500 ml-2">{r.familyName}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between bg-sand rounded-lg px-3 py-2">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{sel.childName}</div>
                  <div className="font-body text-xs text-slate-500">{sel.familyName}</div>
                </div>
                <button onClick={() => { setSel(null); setError(""); }} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">Changer</button>
              </div>

              {dejaInscrit && <p className="font-body text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2">⚠️ Déjà inscrit sur ce créneau.</p>}
              {error && <p className="font-body text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Comment c'est couvert ?</div>
              {loadingR ? (
                <div className="flex items-center gap-2 text-slate-400 font-body text-sm"><Loader2 size={16} className="animate-spin" /> Vérification…</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {rattrapage && (
                    <button disabled={saving || dejaInscrit} onClick={() => enroll("rattrapage")}
                      className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 cursor-pointer disabled:opacity-50">
                      <span className="text-xl">🔄</span>
                      <div><div className="font-body text-sm font-bold text-purple-700">Rattrapage</div><div className="font-body text-xs text-purple-600">Consomme un rattrapage en attente</div></div>
                    </button>
                  )}
                  {carteActive && (
                    <button disabled={saving || dejaInscrit} onClick={() => enroll("carte")}
                      className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-gold-300 bg-gold-50 hover:bg-gold-100 cursor-pointer disabled:opacity-50">
                      <span className="text-xl">🎟️</span>
                      <div><div className="font-body text-sm font-bold text-gold-700">Carte de séances</div><div className="font-body text-xs text-gold-600">{carteActive.remainingSessions} séance{carteActive.remainingSessions > 1 ? "s" : ""} restante{carteActive.remainingSessions > 1 ? "s" : ""} · débitée à la clôture</div></div>
                    </button>
                  )}
                  {forfaitActif && (
                    <button disabled={saving || dejaInscrit} onClick={() => enroll("forfait")}
                      className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 cursor-pointer disabled:opacity-50">
                      <span className="text-xl">🎫</span>
                      <div><div className="font-body text-sm font-bold text-green-700">Forfait</div><div className="font-body text-xs text-green-600">Cours couvert par le forfait annuel</div></div>
                    </button>
                  )}
                  <button disabled={saving || dejaInscrit} onClick={() => enroll("regler")}
                    className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                    <span className="text-xl">💶</span>
                    <div><div className="font-body text-sm font-bold text-slate-700">À régler</div><div className="font-body text-xs text-slate-500">À encaisser ensuite dans Paiements</div></div>
                  </button>

                  {/* Établissement : facturé à l'établissement, pas aux parents,
                      et ne compte pas comme séance offerte */}
                  <button disabled={saving || dejaInscrit} onClick={() => enroll("etablissement")}
                    className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 cursor-pointer disabled:opacity-50">
                    <span className="text-xl">🏫</span>
                    <div><div className="font-body text-sm font-bold text-purple-700">Établissement</div><div className="font-body text-xs text-purple-600">Facturé à l'établissement, sans facture aux parents</div></div>
                  </button>

                  {!offertMode ? (
                    <button disabled={saving || dejaInscrit} onClick={() => setOffertMode(true)}
                      className="flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 cursor-pointer disabled:opacity-50">
                      <span className="text-xl">🎁</span>
                      <div><div className="font-body text-sm font-bold text-emerald-700">Offert</div><div className="font-body text-xs text-emerald-600">Gratuit, avec motif (pas de facturation)</div></div>
                    </button>
                  ) : (
                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3">
                      <div className="font-body text-sm font-bold text-emerald-700 mb-1">🎁 Inscription offerte</div>
                      <div className="font-body text-[11px] text-emerald-600 mb-2">Un paiement à 0€ sera créé avec le motif (traçabilité).</div>
                      <select value={offertReason} onChange={e => setOffertReason(e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-emerald-200 font-body text-sm bg-white focus:border-emerald-500 focus:outline-none cursor-pointer mb-2">
                        {OFFERT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button disabled={saving} onClick={() => enroll("offert")}
                          className="flex-1 font-body text-sm font-semibold text-white bg-emerald-600 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-emerald-500 disabled:opacity-50">
                          Confirmer l'inscription offerte
                        </button>
                        <button disabled={saving} onClick={() => setOffertMode(false)}
                          className="font-body text-sm text-slate-500 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer">Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {saving && <div className="flex items-center gap-2 text-blue-500 font-body text-sm"><Loader2 size={16} className="animate-spin" /> Inscription…</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
