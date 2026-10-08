"use client";

/**
 * Rattacher à une carte des séances déjà prises (carte vendue après coup) :
 * la règle est dans lib/carte-rattachement, testée. Ici on lit les commandes
 * et les créneaux de la famille, on montre ce que la carte peut reprendre, et
 * on écrit : débit de la carte (en transaction), séance retirée de sa
 * commande (commande annulée si elle est vide), inscrit marqué « carte » sur
 * le créneau pour que le montoir ne la décompte pas une seconde fois.
 */

import { useState } from "react";
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ligneHistoriqueRattachement, planRattachement, seancesCandidates, type InfoCreneau, type SeanceCandidate } from "@/lib/carte-rattachement";

async function lireCandidates(carte: any): Promise<{ commandes: any[]; candidates: SeanceCandidate[] }> {
  const snap = await getDocs(query(collection(db, "payments"), where("familyId", "==", carte.familyId)));
  const commandes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ids = [...new Set(commandes.flatMap((p: any) => (p.items || []).map((i: any) => i.creneauId).filter(Boolean)))].slice(0, 200) as string[];
  const creneaux: Record<string, InfoCreneau> = {};
  await Promise.all(ids.map(async id => {
    try { const c = await getDoc(doc(db, "creneaux", id)); if (c.exists()) creneaux[id] = c.data() as InfoCreneau; } catch { /* créneau supprimé : on garde la ligne */ }
  }));
  return { commandes, candidates: seancesCandidates(carte, commandes, creneaux) };
}

export function RattacherSeances({ carte, onFait }: { carte: any; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [donnees, setDonnees] = useState<{ commandes: any[]; candidates: SeanceCandidate[] } | null>(null);
  const [choix, setChoix] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const ouvrir = async () => {
    setOuvert(true); setChargement(true); setMessage(""); setChoix([]);
    try { setDonnees(await lireCandidates(carte)); }
    catch (e: any) { setMessage(`Lecture impossible : ${e?.message || e}`); }
    setChargement(false);
  };

  const rattacher = async () => {
    if (!donnees) return;
    const plan = planRattachement(carte, donnees.commandes, donnees.candidates, choix);
    if (plan.erreur) { setMessage(plan.erreur); return; }
    if (!plan.seances.length) return;
    if (!confirm(`Passer ${plan.seances.length} séance${plan.seances.length > 1 ? "s" : ""} sur la carte ?\n\n${plan.seances.map(s => `• ${s.date} ${s.startTime} — ${s.titre} (${s.prixTTC.toFixed(2)} €)`).join("\n")}\n\nLa carte est débitée d'autant ; chaque séance quitte sa commande (annulée si elle ne contenait que cette séance).`)) return;
    setChargement(true); setMessage("");
    try {
      const maintenant = new Date().toISOString();
      await runTransaction(db, async tx => {
        const ref = doc(db, "cartes", carte.id);
        const frais = await tx.get(ref);
        if (!frais.exists()) throw new Error("carte introuvable");
        const d: any = frais.data();
        const restantes = (d.remainingSessions || 0) - plan.seances.length;
        if (restantes < 0) throw new Error("la carte n'a plus assez de séances");
        const deja = (d.history || []).some((h: any) => plan.seances.some(s => h?.creneauId === s.creneauId && !h.credit && !h.annule && h.childName === s.childName));
        if (deja) throw new Error("une de ces séances est déjà sur la carte (rechargez la page)");
        tx.update(ref, {
          remainingSessions: restantes,
          usedSessions: (d.usedSessions || 0) + plan.seances.length,
          history: [...(d.history || []), ...plan.seances.map(s => ligneHistoriqueRattachement(s, maintenant))],
          status: restantes <= 0 ? "used" : "active",
          updatedAt: serverTimestamp(),
        });
      });
      for (const aj of plan.ajustements) {
        await updateDoc(doc(db, "payments", aj.paymentId), aj.annuler
          ? { status: "cancelled", cancelledAt: serverTimestamp(), cancelReason: "Séance(s) réglée(s) par la carte de séances", updatedAt: serverTimestamp() }
          : { items: aj.items, totalTTC: aj.totalTTC, updatedAt: serverTimestamp() });
      }
      // L'inscrit est marqué « carte » : le planning le montre réglé, et le
      // montoir ne cherche pas à décompter la séance une seconde fois.
      for (const s of plan.seances) {
        try {
          const ref = doc(db, "creneaux", s.creneauId);
          const c = await getDoc(ref);
          if (!c.exists()) continue;
          const enrolled = ((c.data() as any).enrolled || []).map((e: any) =>
            e?.childId === s.childId ? { ...e, cardId: carte.id, paymentSource: "card", cardDeducted: true } : e);
          await updateDoc(ref, { enrolled });
        } catch (e) { console.warn("[carte] inscrit non marqué :", e); }
      }
      setMessage(`✅ ${plan.seances.length} séance${plan.seances.length > 1 ? "s" : ""} passée${plan.seances.length > 1 ? "s" : ""} sur la carte.`);
      setDonnees(await lireCandidates({ ...carte, remainingSessions: (carte.remainingSessions || 0) - plan.seances.length }));
      setChoix([]);
      onFait();
    } catch (e: any) { setMessage(`Rattachement impossible : ${e?.message || e}`); }
    setChargement(false);
  };

  if (!ouvert) {
    return (
      <button type="button" onClick={() => void ouvrir()}
        className="w-full mt-2 py-2 rounded-lg font-body text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 cursor-pointer hover:bg-blue-100">
        📎 Rattacher des séances déjà prises
      </button>
    );
  }
  const rattachables = donnees?.candidates.filter(c => c.rattachable) || [];
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs font-semibold text-blue-800">Séances que cette carte peut reprendre</span>
        <button type="button" onClick={() => setOuvert(false)} className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer">Fermer</button>
      </div>
      {chargement && <p className="font-body text-xs text-slate-500">Lecture…</p>}
      {donnees && !chargement && donnees.candidates.length === 0 && (
        <p className="font-body text-xs text-slate-500">Aucune séance couverte par cette carte n'est en commande pour ce cavalier.</p>
      )}
      {donnees && donnees.candidates.map(c => (
        <label key={c.cle} className={`flex items-center gap-2 font-body text-xs ${c.rattachable ? "text-slate-700 cursor-pointer" : "text-slate-400"}`}>
          <input type="checkbox" disabled={!c.rattachable || chargement} checked={choix.includes(c.cle)}
            onChange={e => setChoix(prev => e.target.checked ? [...prev, c.cle] : prev.filter(x => x !== c.cle))} />
          <span>{c.date ? new Date(c.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "—"} {c.startTime} · {c.titre}{c.childName ? ` — ${c.childName}` : ""} · {c.prixTTC.toFixed(2)} €</span>
          {c.motif && <span className="text-amber-700">({c.motif})</span>}
        </label>
      ))}
      {rattachables.length > 0 && (
        <button type="button" disabled={!choix.length || chargement} onClick={() => void rattacher()}
          className="w-full py-2 rounded-lg font-body text-xs font-semibold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-40">
          Passer {choix.length || ""} séance{choix.length > 1 ? "s" : ""} sur la carte ({carte.remainingSessions} restante{carte.remainingSessions > 1 ? "s" : ""})
        </button>
      )}
      {message && <p className="font-body text-xs text-blue-800">{message}</p>}
    </div>
  );
}
